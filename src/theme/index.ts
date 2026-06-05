import type { ThemeTokens } from "./types.js";
import { defaultTheme } from "./default.js";
import { studyTheme } from "./study.js";

export type { ThemeTokens, CalloutColor } from "./types.js";
export { themePreamble } from "./preamble.js";

const THEMES: Record<string, ThemeTokens> = {
  default: defaultTheme,
  study: studyTheme,
};

export function getTheme(name = "default"): ThemeTokens {
  const theme = THEMES[name];
  if (!theme) {
    throw new Error(
      `Unknown theme "${name}". Available: ${Object.keys(THEMES).join(", ")}.`,
    );
  }
  return theme;
}

export function listThemes(): { name: string; description: string }[] {
  return Object.entries(THEMES).map(([name, t]) => ({ name, description: t.description }));
}

/**
 * Adapter seam (stub): derive a ThemeTokens from the flat brand shape produced
 * by external brand extractors, e.g.
 *   { colors: { primary, surface, text, muted }, fonts: { body, display }, logo }
 * Kept here so client-branded PDFs can plug in without touching the engine.
 * The input is a plain object the caller passes — never imported from elsewhere,
 * preserving this package's self-contained, open-source-safe boundary.
 */
export interface BrandInput {
  colors?: { primary?: string; surface?: string; text?: string; muted?: string };
  fonts?: { body?: string; display?: string };
}

export function themeFromBrand(brand: BrandInput, base: ThemeTokens = defaultTheme): ThemeTokens {
  return {
    ...base,
    description: "Brand-derived theme.",
    fonts: {
      ...base.fonts,
      heading: brand.fonts?.display ?? base.fonts.heading,
      body: brand.fonts?.body ?? base.fonts.body,
    },
    color: {
      ...base.color,
      text: brand.colors?.text ?? base.color.text,
      muted: brand.colors?.muted ?? base.color.muted,
      surface: brand.colors?.surface ?? base.color.surface,
      primary: brand.colors?.primary ?? base.color.primary,
    },
  };
}
