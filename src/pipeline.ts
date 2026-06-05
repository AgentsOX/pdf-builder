import { resolve, join } from "node:path";
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { bundledFontsDir, vendorPackagesDir } from "./paths.js";
import { fontCacheDirs } from "./profile/paths.js";
import type { Block, Spec } from "./spec/schema.js";
import { SCHEMA_VERSION } from "./spec/schema.js";
import { parseSpec, parseData, SpecError, type Issue } from "./spec/validate.js";
import { getTemplate } from "./templates/index.js";
import { getTheme, type ThemeTokens } from "./theme/index.js";
import { compileDocument } from "./compiler/index.js";
import { loadProfile, profileNameOf } from "./profile/load.js";
import { applyProfile } from "./profile/apply.js";
import {
  resolveTypst,
  assertTypstVersion,
  compileToPdf,
  compileToPng,
  filterTypstStderr,
  listFontFamilies,
  ALLOWED_PDF_STANDARDS,
  TypstMissingError,
} from "./typst.js";

export interface BuildOptions {
  /** Theme name; overrides the spec's `theme`. */
  theme?: string;
  /** Extra directories to search for `--theme <name>`. Default ["./themes"]. */
  themesDir?: string[];
  /** Output directory (created if missing). Default "out". */
  out?: string;
  /** Base file name (no extension). Default "document". */
  basename?: string;
  /** Also rasterize per-page PNGs for the visual feedback loop. */
  png?: boolean;
  /** PNG resolution. Default 144. */
  pngPpi?: number;
  /** Treat any warning as fatal. */
  strict?: boolean;
  /** Extra font directories (added to the bundled fonts/). */
  fontPaths?: string[];
  /** Root for resolving image/logo paths. Default the current directory. */
  root?: string;
  /** PDF standard(s) to enforce, comma-separated (e.g. "a-2b", "ua-1"). */
  pdfStandard?: string;
  /** Profile name/path to apply (theme + defaults + template identity). */
  profile?: string;
}

export interface Manifest {
  schemaVersion: number;
  profile: string | null;
  pages: number;
  blocks: number;
  theme: string;
  template: string | null;
  assets: string[];
  typstVersion: string;
  pdfStandard?: string;
  /** sha256 of the canonical spec, the generated Typst source, and the PDF. */
  hashes: { spec: string; typst: string; output: string };
}

export interface BuildResult {
  pdf_path: string;
  page_images: string[];
  manifest: Manifest;
  warnings: Issue[];
}

const sha256 = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");

/** Deterministic JSON: object keys sorted recursively, so the hash is stable. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const body = Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(",");
  return `{${body}}`;
}

/** Apply schema migrations; reject specs from a newer, unknown contract version. */
function migrate(validated: Spec): Spec {
  const v = validated.schemaVersion ?? SCHEMA_VERSION;
  if (v > SCHEMA_VERSION) {
    throw new SpecError([
      {
        path: "schemaVersion",
        expected: `<= ${SCHEMA_VERSION}`,
        got: v,
        fix: `This spec targets a newer schema (v${v}). Upgrade @agentsox/pdf-builder.`,
      },
    ]);
  }
  // Only v1 exists today; future versions add explicit up-migrations here.
  return { ...validated, schemaVersion: v };
}

export interface ExpandResult {
  validated: Spec;
  blocks: Block[];
  theme: ThemeTokens;
  themeName: string;
  templateName: string | null;
  /** Applied profile name, or null. */
  profileName: string | null;
  /** Options after profile merge (themesDir/fontPaths/out/pdfStandard/root). */
  eff: BuildOptions;
}

/** Apply a profile (if any) under the spec, returning the merged spec + options. */
function resolveProfile(spec: unknown, opts: BuildOptions): { spec: unknown; eff: BuildOptions; profileName: string | null } {
  if (!opts.profile) return { spec, eff: opts, profileName: null };
  const loaded = loadProfile(opts.profile);
  const app = applyProfile(spec, loaded);
  return {
    spec: app.spec,
    eff: {
      ...opts,
      themesDir: [...(opts.themesDir ?? []), ...app.themesDir],
      fontPaths: [...(opts.fontPaths ?? []), ...app.fontPaths],
      out: opts.out ?? app.out,
      pdfStandard: opts.pdfStandard ?? app.pdfStandard,
    },
    profileName: loaded.profile.name ?? profileNameOf(opts.profile),
  };
}

/** Validate + migrate a spec and resolve it to a block tree and theme (no engine). */
export function expandSpec(spec: unknown, opts: BuildOptions = {}): ExpandResult {
  const { spec: workingSpec, eff, profileName } = resolveProfile(spec, opts);
  const validated = migrate(parseSpec(workingSpec));

  let blocks: Block[];
  let templateName: string | null = null;
  if (validated.template) {
    const template = getTemplate(validated.template);
    const data = parseData(template.schema, validated.data, template.name);
    blocks = template.expand(data);
    templateName = template.name;
  } else {
    blocks = validated.blocks ?? [];
  }

  const themeName = eff.theme ?? validated.theme ?? "default";
  const theme = getTheme(themeName, { themesDir: eff.themesDir });
  return { validated, blocks, theme, themeName, templateName, profileName, eff };
}

export interface RenderResult extends ExpandResult {
  typst: string;
  warnings: Issue[];
  blockCount: number;
  assets: string[];
}

/** Expand a spec and compile it to a Typst source string (no binary needed). */
export function renderTypst(spec: unknown, opts: BuildOptions = {}): RenderResult {
  const expanded = expandSpec(spec, opts);
  const root = resolve(expanded.eff.root ?? process.cwd());
  const compiled = compileDocument(expanded.blocks, expanded.theme, {
    dir: expanded.validated.dir,
    lang: expanded.validated.lang,
    math: expanded.validated.math,
    assetBase: root,
  });
  return {
    ...expanded,
    typst: compiled.typst,
    warnings: compiled.warnings,
    blockCount: compiled.blockCount,
    assets: compiled.assets,
  };
}

function parseTypstStderr(stderr: string): Issue[] {
  return filterTypstStderr(stderr)
    .split("\n")
    .filter((l) => /warning:/i.test(l))
    .map((l) => ({ path: "(typst)", expected: "clean compile", got: l.trim(), fix: "Review the Typst warning above." }));
}

/** Best-effort page count from already-read PDF bytes (PNGs are authoritative). */
function countPdfPages(pdf: Buffer): number {
  const buf = pdf.toString("latin1");
  const count =
    buf.match(/\/Type\s*\/Pages\b[^>]*?\/Count\s+(\d+)/) ?? buf.match(/\/Count\s+(\d+)\b[^>]*?\/Type\s*\/Pages/);
  if (count) return Number(count[1]);
  const pages = buf.match(/\/Type\s*\/Page(?![s])/g);
  return pages ? pages.length : 1;
}

function validatePdfStandard(std: string): void {
  const bad = std.split(",").map((s) => s.trim()).filter((s) => !(ALLOWED_PDF_STANDARDS as readonly string[]).includes(s));
  if (bad.length) {
    throw new SpecError([
      {
        path: "pdfStandard",
        expected: `one of: ${ALLOWED_PDF_STANDARDS.join(", ")}`,
        got: bad.join(", "),
        fix: "Use a supported PDF standard, e.g. a-2b (PDF/A-2b) or ua-1 (PDF/UA-1).",
      },
    ]);
  }
}

/**
 * The one function the CLI, library, and (future) MCP tool all call.
 * spec → validated → blocks → Typst source → PDF (+ PNGs) + manifest + warnings.
 */
export function build(spec: unknown, opts: BuildOptions = {}): BuildResult {
  const rendered = renderTypst(spec, opts);
  const eff = rendered.eff; // options after profile merge
  const profileName = rendered.profileName;
  const warnings: Issue[] = [...rendered.warnings];

  if (eff.pdfStandard) validatePdfStandard(eff.pdfStandard);

  // Engine.
  const typst = resolveTypst();
  if (!typst) throw new TypstMissingError();
  assertTypstVersion(typst);

  const root = resolve(eff.root ?? process.cwd());
  const fontPaths = [bundledFontsDir, ...fontCacheDirs(), ...(eff.fontPaths ?? []).map((p) => resolve(p))];
  const packagePath = vendorPackagesDir;

  // Font-availability check (matches the render's --ignore-system-fonts behavior).
  const families = new Set(listFontFamilies(typst.bin, fontPaths).map((f) => f.toLowerCase()));
  if (families.size) {
    for (const fam of new Set([rendered.theme.fonts.heading, rendered.theme.fonts.body, rendered.theme.fonts.mono])) {
      if (fam && !families.has(fam.toLowerCase())) {
        warnings.push({
          path: "theme.fonts",
          expected: `font "${fam}" available`,
          got: "not found",
          fix: `Font "${fam}" isn't on any font path. Add it with --font-path, or change the theme.`,
        });
      }
    }
  }

  const outDir = resolve(eff.out ?? "out");
  mkdirSync(outDir, { recursive: true });
  const base = eff.basename ?? "document";
  const typPath = join(outDir, `${base}.typ`);
  const pdfPath = join(outDir, `${base}.pdf`);
  writeFileSync(typPath, rendered.typst, "utf8");

  // compileToPdf throws TypstCompileError on failure (e.g. PDF/A conformance) —
  // propagated to the caller. Never a silent blank PDF.
  const { stderr } = compileToPdf({
    bin: typst.bin,
    input: typPath,
    output: pdfPath,
    root,
    fontPaths,
    packagePath,
    pdfStandard: eff.pdfStandard,
  });
  warnings.push(...parseTypstStderr(stderr));

  // Per-page PNGs for the visual feedback loop.
  let pageImages: string[] = [];
  if (eff.png) {
    const pattern = join(outDir, `${base}-page-{0p}.png`);
    compileToPng({ bin: typst.bin, input: typPath, output: pattern, root, fontPaths, packagePath, ppi: eff.pngPpi });
    pageImages = readdirSync(outDir)
      .filter((f) => f.startsWith(`${base}-page-`) && f.endsWith(".png"))
      .sort()
      .map((f) => join(outDir, f));
  }

  // Read the rendered PDF once; derive both page count and output hash from it.
  const pdfBytes = readFileSync(pdfPath);

  const manifest: Manifest = {
    schemaVersion: rendered.validated.schemaVersion ?? SCHEMA_VERSION,
    profile: profileName,
    pages: pageImages.length || countPdfPages(pdfBytes),
    blocks: rendered.blockCount,
    theme: rendered.themeName,
    template: rendered.templateName,
    assets: rendered.assets,
    typstVersion: typst.version,
    ...(eff.pdfStandard ? { pdfStandard: eff.pdfStandard } : {}),
    hashes: {
      spec: sha256(stableStringify(rendered.validated)),
      typst: sha256(rendered.typst),
      output: sha256(pdfBytes),
    },
  };

  if (eff.strict && warnings.length) {
    const detail = warnings.map((w) => `  - [${w.path}] ${w.got}`).join("\n");
    throw new Error(`Strict mode: ${warnings.length} warning(s):\n${detail}`);
  }

  return { pdf_path: pdfPath, page_images: pageImages, manifest, warnings };
}
