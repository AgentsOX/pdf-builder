import { mkdirSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import { fontCacheDir } from "./profile/paths.js";

const CTAN_NCM = "https://mirrors.ctan.org/fonts/newcomputermodern/otf";

/**
 * Curated font packs for `pdf fonts add <pack>`. Each is a list of direct
 * .ttf/.otf URLs. Keep packs to sources that serve individual font files
 * (no archives — there's no unzip step). Users can also pass a direct URL.
 */
export const FONT_PACKS: Record<string, string[]> = {
  // New Computer Modern — the `study` theme's family. Typst embeds it already;
  // add it only for full offline independence from the Typst binary.
  cm: [
    `${CTAN_NCM}/NewCM10-Regular.otf`,
    `${CTAN_NCM}/NewCM10-Bold.otf`,
    `${CTAN_NCM}/NewCM10-Italic.otf`,
    `${CTAN_NCM}/NewCMMath-Regular.otf`,
  ],
};

const isUrl = (s: string) => /^https?:\/\//i.test(s);

/** Detect a real font by magic bytes, so a 404 HTML page can't be saved as one. */
export function looksLikeFont(buf: Buffer): boolean {
  if (buf.length < 4) return false;
  const tag = buf.subarray(0, 4).toString("latin1");
  if (["OTTO", "true", "ttcf", "wOFF", "wOF2"].includes(tag)) return true;
  const b = buf;
  return b[0] === 0x00 && b[1] === 0x01 && b[2] === 0x00 && b[3] === 0x00; // TrueType
}

/** Expand args (pack names and/or direct URLs) into the list of URLs to fetch. */
export function resolveFontArgs(args: string[]): string[] {
  return args.flatMap((a) => {
    if (isUrl(a)) return [a];
    const pack = FONT_PACKS[a];
    if (!pack) {
      throw new Error(
        `Unknown font pack "${a}". Known packs: ${Object.keys(FONT_PACKS).join(", ")}. Or pass a direct .ttf/.otf URL.`,
      );
    }
    return pack;
  });
}

/**
 * Download fonts (pack names or direct URLs) into the font cache, which is on
 * the build font-path. Validates each download is actually a font.
 */
export async function addFonts(args: string[], opts: { global?: boolean } = {}): Promise<string[]> {
  const urls = resolveFontArgs(args);
  const dir = fontCacheDir(opts.global ?? true);
  mkdirSync(dir, { recursive: true });

  const written: string[] = [];
  for (const url of urls) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Download failed (HTTP ${res.status}): ${url}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (!looksLikeFont(buf)) throw new Error(`Not a font file (got ${buf.length} bytes that aren't a font): ${url}`);
    const file = join(dir, basename(new URL(url).pathname));
    writeFileSync(file, buf);
    written.push(file);
  }
  return written;
}
