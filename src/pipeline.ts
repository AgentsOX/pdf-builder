import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import type { Block } from "./spec/schema.js";
import { parseSpec, parseData, type Issue } from "./spec/validate.js";
import { getTemplate } from "./templates/index.js";
import { getTheme } from "./theme/index.js";
import { compileDocument } from "./compiler/index.js";
import {
  resolveTypst,
  versionWarnings,
  compileToPdf,
  compileToPng,
  filterTypstStderr,
  listFontFamilies,
  TypstMissingError,
  TypstCompileError,
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
}

export interface Manifest {
  pages: number;
  blocks: number;
  theme: string;
  template: string | null;
  typstVersion: string;
}

export interface BuildResult {
  pdf_path: string;
  page_images: string[];
  manifest: Manifest;
  warnings: Issue[];
}

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function parseTypstStderr(stderr: string): Issue[] {
  return filterTypstStderr(stderr)
    .split("\n")
    .filter((l) => /warning:/i.test(l))
    .map((l) => ({
      path: "(typst)",
      expected: "clean compile",
      got: l.trim(),
      fix: "Review the Typst warning above.",
    }));
}

function countPdfPages(pdfPath: string): number {
  try {
    const buf = readFileSync(pdfPath, "latin1");
    const count = buf.match(/\/Type\s*\/Pages\b[^>]*?\/Count\s+(\d+)/) ?? buf.match(/\/Count\s+(\d+)\b[^>]*?\/Type\s*\/Pages/);
    if (count) return Number(count[1]);
    const pages = buf.match(/\/Type\s*\/Page(?![s])/g);
    return pages ? pages.length : 1;
  } catch {
    return 1;
  }
}

/**
 * The one function the CLI, library, and (future) MCP tool all call.
 * spec → validated → blocks → Typst → PDF (+ PNGs) + manifest + warnings.
 */
export function build(spec: unknown, opts: BuildOptions = {}): BuildResult {
  const validated = parseSpec(spec);
  const warnings: Issue[] = [];

  // Resolve the block tree (template path or freeform path).
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

  const themeName = opts.theme ?? validated.theme ?? "default";
  const theme = getTheme(themeName, { themesDir: opts.themesDir });

  // Root for image/logo paths: the working dir, so `src: assets/logo.png`
  // resolves relative to where the user runs the command.
  const root = resolve(opts.root ?? process.cwd());

  const compiled = compileDocument(blocks, theme, {
    dir: validated.dir,
    lang: validated.lang,
    math: validated.math,
    assetBase: root,
  });
  warnings.push(...compiled.warnings);

  // Engine.
  const typst = resolveTypst();
  if (!typst) throw new TypstMissingError();
  warnings.push(...versionWarnings(typst));

  const fontPaths = [join(packageRoot, "fonts"), ...(opts.fontPaths ?? []).map((p) => resolve(p))];
  const packagePath = join(packageRoot, "vendor", "typst-packages");

  // Font-availability check (matches the render's --ignore-system-fonts behavior).
  const families = new Set(listFontFamilies(typst.bin, fontPaths).map((f) => f.toLowerCase()));
  if (families.size) {
    for (const fam of new Set([theme.fonts.heading, theme.fonts.body, theme.fonts.mono])) {
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

  const outDir = resolve(opts.out ?? "out");
  mkdirSync(outDir, { recursive: true });
  const base = opts.basename ?? "document";
  const typPath = join(outDir, `${base}.typ`);
  const pdfPath = join(outDir, `${base}.pdf`);
  writeFileSync(typPath, compiled.typst, "utf8");

  try {
    const { stderr } = compileToPdf({ bin: typst.bin, input: typPath, output: pdfPath, root, fontPaths, packagePath });
    warnings.push(...parseTypstStderr(stderr));
  } catch (e) {
    if (e instanceof TypstCompileError) {
      // Loud, agent-fixable — never a silent blank PDF.
      throw new TypstCompileError(e.stderr);
    }
    throw e;
  }

  // Per-page PNGs for the visual feedback loop.
  let pageImages: string[] = [];
  if (opts.png) {
    const pattern = join(outDir, `${base}-page-{0p}.png`);
    compileToPng({ bin: typst.bin, input: typPath, output: pattern, root, fontPaths, packagePath, ppi: opts.pngPpi });
    pageImages = readdirSync(outDir)
      .filter((f) => f.startsWith(`${base}-page-`) && f.endsWith(".png"))
      .sort()
      .map((f) => join(outDir, f));
  }

  const pages = pageImages.length || countPdfPages(pdfPath);

  const manifest: Manifest = {
    pages,
    blocks: compiled.blockCount,
    theme: themeName,
    template: templateName,
    typstVersion: typst.version,
  };

  if (opts.strict && warnings.length) {
    const detail = warnings.map((w) => `  - [${w.path}] ${w.got}`).join("\n");
    throw new Error(`Strict mode: ${warnings.length} warning(s):\n${detail}`);
  }

  return { pdf_path: pdfPath, page_images: pageImages, manifest, warnings };
}
