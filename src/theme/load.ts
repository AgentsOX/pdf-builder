import { z } from "zod";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve, isAbsolute, join } from "node:path";
import { parse as parseYaml } from "yaml";
import { formatZodError, SpecError } from "../spec/validate.js";
import { InputError } from "../diagnostics.js";
import { deepMerge } from "../util/merge.js";
import type { ThemeTokens } from "./types.js";
import { defaultTheme } from "./default.js";
import { studyTheme } from "./study.js";

export const BUILTIN_THEMES: Record<string, ThemeTokens> = {
  default: defaultTheme,
  study: studyTheme,
};

const CalloutColorPatch = z.object({ bg: z.string(), border: z.string() }).partial().strict();

/**
 * A theme FILE: any subset of ThemeTokens (deep-partial), plus `extends` to
 * inherit from a built-in or another file. Strict, so typos are caught.
 */
const ThemePatchSchema = z
  .object({
    extends: z.string(),
    description: z.string(),
    logo: z.string(),
    page: z.object({ paper: z.string(), margin: z.string() }).partial().strict(),
    fonts: z.object({ heading: z.string(), body: z.string(), mono: z.string() }).partial().strict(),
    size: z
      .object({ base: z.string(), h1: z.string(), h2: z.string(), h3: z.string(), h4: z.string(), small: z.string() })
      .partial()
      .strict(),
    color: z
      .object({
        text: z.string(),
        muted: z.string(),
        surface: z.string(),
        primary: z.string(),
        border: z.string(),
        callout: z
          .object({
            definition: CalloutColorPatch,
            theorem: CalloutColorPatch,
            tip: CalloutColorPatch,
            note: CalloutColorPatch,
          })
          .partial()
          .strict(),
      })
      .partial()
      .strict(),
    space: z.object({ block: z.string(), gutter: z.string(), inset: z.string() }).partial().strict(),
    dir: z.enum(["ltr", "rtl"]),
    lang: z.string(),
  })
  .partial()
  .strict();

export type ThemePatch = z.infer<typeof ThemePatchSchema>;

function findThemeFile(name: string, dirs: string[]): string | null {
  // Explicit path (has separator or extension).
  if (name.includes("/") || /\.(ya?ml|json)$/i.test(name)) {
    const p = isAbsolute(name) ? name : resolve(name);
    return existsSync(p) ? p : null;
  }
  for (const dir of dirs) {
    for (const ext of [".yaml", ".yml", ".json"]) {
      const p = join(dir, name + ext);
      if (existsSync(p)) return p;
    }
  }
  return null;
}

function readThemePatch(file: string): ThemePatch {
  const raw = readFileSync(file, "utf8");
  const data = /\.json$/i.test(file) ? JSON.parse(raw) : parseYaml(raw);
  const result = ThemePatchSchema.safeParse(data);
  if (!result.success) {
    const issues = formatZodError(result.error, data).map((i) => ({ ...i, fix: `${i.fix} (theme file ${file})` }));
    throw new SpecError(issues);
  }
  return result.data;
}

export interface ThemeLoadOptions {
  /** Directories to search for `--theme <name>`. Default ["./themes"]. */
  themesDir?: string[];
}

/**
 * Resolve a theme by built-in name, file name (searched in themesDir), or path.
 * `extends` chains are followed and deep-merged; logo paths are resolved
 * relative to the file that declared them.
 */
export function loadTheme(name: string, opts: ThemeLoadOptions = {}, seen: string[] = []): ThemeTokens {
  if (BUILTIN_THEMES[name]) return BUILTIN_THEMES[name];

  const dirs = opts.themesDir ?? [resolve("themes")];
  const file = findThemeFile(name, dirs);
  if (!file) {
    throw new InputError(
      `Unknown theme "${name}". Built-ins: ${Object.keys(BUILTIN_THEMES).join(", ")}. ` +
        `Or provide a theme file (searched: ${dirs.join(", ")}).`,
    );
  }
  if (seen.includes(file)) throw new Error(`Theme "extends" cycle: ${[...seen, file].join(" → ")}`);

  const patch = readThemePatch(file);
  const parent = patch.extends
    ? loadTheme(patch.extends, { themesDir: [dirname(file), ...dirs] }, [...seen, file])
    : defaultTheme;

  const { extends: _ignore, ...rest } = patch;
  const merged = deepMerge(parent, rest as Record<string, unknown>);

  // Resolve a relative logo against the theme file's directory.
  if (rest.logo && !isAbsolute(rest.logo as string) && !/^https?:/.test(rest.logo as string)) {
    merged.logo = resolve(dirname(file), rest.logo as string);
  }
  return merged;
}
