import { existsSync } from "node:fs";
import { isAbsolute, resolve, relative, sep } from "node:path";

export interface ResolvedAsset {
  /** Path to emit into the Typst document (root-relative when under the root). */
  typstPath: string;
  exists: boolean;
  outsideRoot: boolean;
}

/**
 * Resolve an image/logo `src` against a base dir (the Typst --root, i.e. the
 * working directory). Relative paths become root-relative ("/path") so Typst
 * resolves them regardless of where the generated .typ lives. Reports existence
 * so the caller can warn instead of producing a silent broken image.
 */
export function resolveAsset(src: string, baseDir: string): ResolvedAsset {
  const abs = isAbsolute(src) ? src : resolve(baseDir, src);
  const rel = relative(baseDir, abs);
  const outsideRoot = rel.startsWith("..");
  const typstPath = outsideRoot ? abs : "/" + rel.split(sep).join("/");
  return { typstPath, exists: existsSync(abs), outsideRoot };
}
