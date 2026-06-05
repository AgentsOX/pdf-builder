import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

/**
 * Pinned Typst major.minor. Output bytes/layout can change between minor
 * versions, so determinism requires this match. Patch releases are allowed.
 */
export const PINNED_TYPST = { major: 0, minor: 14 };
/** The exact version this release is tested against. */
export const TESTED_TYPST = "0.14.2";

export class TypstMissingError extends Error {
  constructor() {
    super(
      [
        "Typst is required but was not found.",
        "Install it, then re-run:",
        "  macOS:    brew install typst",
        "  any/Rust: cargo install typst-cli",
        "  Windows:  winget install Typst.Typst",
        "Or set PDF_BUILDER_TYPST to the binary path.",
      ].join("\n"),
    );
    this.name = "TypstMissingError";
  }
}

export interface TypstInfo {
  bin: string;
  version: string;
}

function probe(bin: string): string | null {
  try {
    const r = spawnSync(bin, ["--version"], { encoding: "utf8" });
    if (r.status === 0 && r.stdout) return r.stdout.trim();
  } catch {
    /* not runnable */
  }
  return null;
}

let resolvedTypst: TypstInfo | null | undefined;

/** Resolve the Typst binary: env override first, then PATH. Memoized per process. */
export function resolveTypst(): TypstInfo | null {
  if (resolvedTypst !== undefined) return resolvedTypst;
  const candidates = process.env.PDF_BUILDER_TYPST ? [process.env.PDF_BUILDER_TYPST] : ["typst"];
  resolvedTypst = null;
  for (const bin of candidates) {
    const out = probe(bin);
    if (out) {
      resolvedTypst = { bin, version: out };
      break;
    }
  }
  return resolvedTypst;
}

export function hasTypst(): boolean {
  return resolveTypst() !== null;
}

/** Parse "typst 0.13.1 (hash)" → {major, minor}; null if unparseable. */
export function parseVersion(s: string): { major: number; minor: number } | null {
  const m = s.match(/(\d+)\.(\d+)\.\d+/);
  return m ? { major: Number(m[1]), minor: Number(m[2]) } : null;
}

export class TypstVersionError extends Error {
  constructor(public found: string) {
    super(
      `Typst ${PINNED_TYPST.major}.${PINNED_TYPST.minor}.x is required for deterministic output, ` +
        `but found "${found}". Install ${TESTED_TYPST}, or set PDF_BUILDER_ALLOW_TYPST_MISMATCH=1 ` +
        `to override (output may differ).`,
    );
    this.name = "TypstVersionError";
  }
}

/**
 * Enforce the pinned major.minor. Throws unless the version matches or the
 * override env var is set. Unparseable versions are allowed (best-effort).
 */
export function assertTypstVersion(info: TypstInfo): void {
  if (process.env.PDF_BUILDER_ALLOW_TYPST_MISMATCH) return;
  const v = parseVersion(info.version);
  if (!v) return;
  if (v.major !== PINNED_TYPST.major || v.minor !== PINNED_TYPST.minor) {
    throw new TypstVersionError(info.version);
  }
}

/** PDF standards Typst 0.14 can enforce (`--pdf-standard`). */
export const ALLOWED_PDF_STANDARDS = [
  "1.4", "1.5", "1.6", "1.7", "2.0",
  "a-1b", "a-1a", "a-2b", "a-2u", "a-2a", "a-3b", "a-3u", "a-3a", "a-4", "a-4f", "a-4e",
  "ua-1",
] as const;

interface RunOpts {
  bin: string;
  input: string; // absolute path to the .typ file
  output: string; // absolute path (or {p}-pattern for png)
  root: string; // sandbox root for image() includes
  fontPaths?: string[]; // bundled + user font dirs
  packagePath?: string; // vendored Typst package cache (for offline mitex/cetz)
  pdfStandard?: string; // comma-separated PDF standards (pdf only)
  ppi?: number; // png only
}

function run({ bin, input, output, root, fontPaths, packagePath, pdfStandard, ppi }: RunOpts): { stderr: string } {
  const args = [
    "compile",
    input,
    output,
    "--root",
    root,
    "--creation-timestamp",
    "0", // pin the PDF date → deterministic output
    "--ignore-system-fonts", // resolve fonts only from bundle/embedded → reproducible
  ];
  for (const fp of fontPaths ?? []) if (existsSync(fp)) args.push("--font-path", fp);
  if (packagePath && existsSync(packagePath)) args.push("--package-cache-path", packagePath);
  if (pdfStandard) args.push("--pdf-standard", pdfStandard);
  if (ppi) args.push("--ppi", String(ppi));

  const r = spawnSync(bin, args, { encoding: "utf8" });
  if (r.status !== 0) {
    throw new TypstCompileError(r.stderr || r.stdout || `typst exited with code ${r.status}`);
  }
  return { stderr: r.stderr ?? "" };
}

export class TypstCompileError extends Error {
  constructor(public stderr: string) {
    super("Typst failed to compile the document.");
    this.name = "TypstCompileError";
  }
}

/** Default PNG resolution for the visual-feedback rasterization. */
export const DEFAULT_PNG_PPI = 144;

export function compileToPdf(opts: Omit<RunOpts, "ppi">): { stderr: string } {
  return run(opts);
}

export function compileToPng(opts: RunOpts): { stderr: string } {
  return run({ ...opts, ppi: opts.ppi ?? DEFAULT_PNG_PPI });
}

/** List font families Typst can see (bundled + given dirs). For `pdf fonts`. */
export function listFontFamilies(bin: string, fontPaths: string[]): string[] {
  const args = ["fonts", "--ignore-system-fonts"];
  for (const fp of fontPaths) if (existsSync(fp)) args.push("--font-path", fp);
  const r = spawnSync(bin, args, { encoding: "utf8" });
  if (r.status !== 0) return [];
  return Array.from(new Set((r.stdout ?? "").split("\n").map((s) => s.trim()).filter(Boolean))).sort();
}

/**
 * Drop warnings that aren't actionable through the spec model: those from
 * vendored packages, and Typst API deprecations (the math engine emits symbols
 * the author never wrote). User-facing warnings (e.g. real content issues) pass
 * through. Skips each warning's indented source/continuation lines too.
 */
export function filterTypstStderr(stderr: string): string {
  const lines = (stderr ?? "").split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const drop = /@preview\//.test(l) || /warning:.*is deprecated/.test(l);
    if (drop) {
      while (i + 1 < lines.length && /^\s*(│|┌|└|=|\d+\s*│|\^|·|note:)/.test(lines[i + 1])) i++;
      continue;
    }
    out.push(l);
  }
  return out.join("\n");
}
