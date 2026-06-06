import type { ThemeTokens } from "./types.js";

/**
 * Neutral light rail, used by the default theme and as the fallback when a theme
 * defines no `sidebar` of its own. Single-sourced here so the compiler never
 * hardcodes its own copy.
 */
export const DEFAULT_SIDEBAR: NonNullable<ThemeTokens["sidebar"]> = {
  fill: "#f1f5f9",
  text: "#1a1a1f",
  width: "6cm",
};

/**
 * Neutral, professional default. Uses Typst's embedded Libertinus Serif so it
 * renders with zero external font files; add fonts under fonts/ to override.
 */
export const defaultTheme: ThemeTokens = {
  description: "Neutral professional document (serif, blue accent).",
  page: { paper: "a4", margin: "2.2cm" },
  fonts: {
    heading: "Libertinus Serif",
    body: "Libertinus Serif",
    mono: "DejaVu Sans Mono",
  },
  size: { base: "11pt", h1: "22pt", h2: "16pt", h3: "13pt", h4: "11pt", small: "9pt" },
  color: {
    text: "#1a1a1f",
    muted: "#6b7280",
    surface: "#ffffff",
    primary: "#2563eb",
    border: "#d8dce4",
    callout: {
      definition: { bg: "#eef2ff", border: "#6366f1" },
      theorem: { bg: "#ecfdf5", border: "#10b981" },
      tip: { bg: "#fffbeb", border: "#f59e0b" },
      note: { bg: "#f1f5f9", border: "#64748b" },
    },
  },
  stroke: { hairline: "0.5pt", accent: "3pt", radius: "4pt" },
  space: {
    scale: { xs: "4pt", sm: "8pt", md: "12pt", lg: "16pt", xl: "24pt" },
    block: "sm",
    gutter: "lg",
    inset: "sm",
    edge: "xl",
  },
  // Neutral light rail, so the `sidebar` block works on the plain theme too.
  // (Heading color/rules are intentionally unset here: default headings keep
  // using `color.text` with no rule, unchanged from before.)
  sidebar: DEFAULT_SIDEBAR,
  dir: "ltr",
  lang: "en",
};
