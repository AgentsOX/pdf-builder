import { isAbsolute, resolve } from "node:path";
import { deepMerge, isPlainObject } from "../util/merge.js";
import { themeSearchDirs } from "./paths.js";
import type { LoadedProfile } from "./load.js";

export interface ProfileApplication {
  /** The spec with profile defaults/identity merged in (spec values win). */
  spec: unknown;
  themesDir: string[];
  fontPaths: string[];
  out?: string;
  pdfStandard?: string;
}

/**
 * Merge a profile under a spec. Document-level defaults (lang/dir/math/theme)
 * and per-template identity (e.g. invoice seller) come from the profile only
 * where the spec hasn't set them — the spec always wins.
 */
export function applyProfile(spec: unknown, loaded: LoadedProfile): ProfileApplication {
  const { profile, dir } = loaded;
  const themesDir = [...new Set([resolve(dir, "..", "themes"), ...themeSearchDirs(), resolve("themes")])];
  const fontPaths = (profile.fontPaths ?? []).map((p) => (isAbsolute(p) ? p : resolve(dir, p)));
  const out = profile.out ? (isAbsolute(profile.out) ? profile.out : resolve(dir, profile.out)) : undefined;

  // If the spec isn't an object, leave it for validation to reject.
  if (!isPlainObject(spec)) {
    return { spec, themesDir, fontPaths, out, pdfStandard: profile.pdfStandard };
  }

  const merged: Record<string, unknown> = { ...spec };
  const d = profile.defaults ?? {};
  for (const k of ["lang", "dir", "math"] as const) {
    if (merged[k] === undefined && d[k] !== undefined) merged[k] = d[k];
  }
  if (merged.theme === undefined && profile.theme !== undefined) merged.theme = profile.theme;

  // Template identity: deep-merge profile data UNDER the spec's data.
  if (typeof merged.template === "string" && profile.template && isPlainObject(profile.template[merged.template])) {
    const profData = profile.template[merged.template] as Record<string, unknown>;
    const specData = isPlainObject(merged.data) ? merged.data : {};
    merged.data = deepMerge(profData, specData);
  }

  return { spec: merged, themesDir, fontPaths, out, pdfStandard: profile.pdfStandard };
}
