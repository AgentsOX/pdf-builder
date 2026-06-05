import type { ThemeTokens } from "./types.js";

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
  space: { block: "0.8em", gutter: "16pt", inset: "8pt" },
  dir: "ltr",
  lang: "en",
};
