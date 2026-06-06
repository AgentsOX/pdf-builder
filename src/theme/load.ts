import { z } from "zod";
import { dirname, resolve, isAbsolute } from "node:path";
import { InputError } from "../diagnostics.js";
import { deepMerge } from "../util/merge.js";
import { findConfigFile, loadConfigFile } from "../util/config-file.js";
import type { ThemeTokens } from "./types.js";
import { defaultTheme } from "./default.js";
import { studyTheme } from "./study.js";
import { cvTheme } from "./cv.js";

export const BUILTIN_THEMES: Record<string, ThemeTokens> = {
  default: defaultTheme,
  study: studyTheme,
  cv: cvTheme,
};

const CalloutColorPatch = z.object({ bg: z.string(), border: z.string() }).partial().strict();
const SpaceStepSchema = z.enum(["xs", "sm", "md", "lg", "xl"]);

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
    stroke: z.object({ hairline: z.string(), accent: z.string(), radius: z.string() }).partial().strict(),
    space: z
      .object({
        scale: z.object({ xs: z.string(), sm: z.string(), md: z.string(), lg: z.string(), xl: z.string() }).partial().strict(),
        block: SpaceStepSchema,
        gutter: SpaceStepSchema,
        inset: SpaceStepSchema,
        edge: SpaceStepSchema,
        line: z.string(),
      })
      .partial()
      .strict(),
    heading: z
      .object({
        color: z.string(),
        tracking: z.string(),
        rule: z
          .object({
            levels: z.array(z.number().int().min(1).max(4)),
            weight: z.string().optional(),
            gap: z.string().optional(),
            color: z.string().optional(),
          })
          .strict(),
      })
      .partial()
      .strict(),
    sidebar: z.object({ fill: z.string(), text: z.string(), width: z.string() }).partial().strict(),
    dir: z.enum(["ltr", "rtl"]),
    lang: z.string(),
  })
  .partial()
  .strict();

export type ThemePatch = z.infer<typeof ThemePatchSchema>;

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
  const file = findConfigFile(name, dirs);
  if (!file) {
    throw new InputError(
      `Unknown theme "${name}". Built-ins: ${Object.keys(BUILTIN_THEMES).join(", ")}. ` +
        `Or provide a theme file (searched: ${dirs.join(", ")}).`,
    );
  }
  if (seen.includes(file)) throw new Error(`Theme "extends" cycle: ${[...seen, file].join(" → ")}`);

  const patch = loadConfigFile(file, ThemePatchSchema, "theme file");
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
