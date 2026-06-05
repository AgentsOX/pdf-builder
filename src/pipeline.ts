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
  TypstMissingError,
  TypstCompileError,
} from "./typst.js";

export interface BuildOptions {
  /** Theme name; overrides the spec's `theme`. */
  theme?: string;
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
  /** Font directory; default the bundled fonts/. */
  fontPath?: string;
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
    const matches = buf.match(/\/Type\s*\/Page(?![s])/g);
    return matches ? matches.length : 1;
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
  const theme = getTheme(themeName);

  const compiled = compileDocument(blocks, theme, {
    dir: validated.dir,
    lang: validated.lang,
    math: validated.math,
  });
  warnings.push(...compiled.warnings);

  // Engine.
  const typst = resolveTypst();
  if (!typst) throw new TypstMissingError();
  warnings.push(...versionWarnings(typst));

  const outDir = resolve(opts.out ?? "out");
  mkdirSync(outDir, { recursive: true });
  const base = opts.basename ?? "document";
  const typPath = join(outDir, `${base}.typ`);
  const pdfPath = join(outDir, `${base}.pdf`);
  writeFileSync(typPath, compiled.typst, "utf8");

  const fontPath = opts.fontPath ?? join(packageRoot, "fonts");
  const packagePath = join(packageRoot, "vendor", "typst-packages");

  try {
    const { stderr } = compileToPdf({ bin: typst.bin, input: typPath, output: pdfPath, root: outDir, fontPath, packagePath });
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
    compileToPng({ bin: typst.bin, input: typPath, output: pattern, root: outDir, fontPath, packagePath, ppi: opts.pngPpi });
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
