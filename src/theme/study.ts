import type { ThemeTokens } from "./types.js";

/**
 * Academic study-summary theme. Uses Typst's embedded New Computer Modern (the
 * classic LaTeX look) so equations and prose share one typeface — ideal for
 * math-heavy notes with definition/theorem callouts.
 */
export const studyTheme: ThemeTokens = {
  description: "Academic study summary (New Computer Modern, theorem/definition boxes).",
  page: { paper: "a4", margin: "2.5cm" },
  fonts: {
    heading: "New Computer Modern",
    body: "New Computer Modern",
    mono: "DejaVu Sans Mono",
  },
  size: { base: "11pt", h1: "20pt", h2: "15pt", h3: "12pt", h4: "11pt", small: "9pt" },
  color: {
    text: "#15151a",
    muted: "#5b6270",
    surface: "#ffffff",
    primary: "#1d4ed8",
    border: "#cdd2dc",
    callout: {
      definition: { bg: "#eef2ff", border: "#4f46e5" },
      theorem: { bg: "#f0fdf4", border: "#059669" },
      tip: { bg: "#fefce8", border: "#ca8a04" },
      note: { bg: "#f1f5f9", border: "#475569" },
    },
  },
  stroke: { hairline: "0.5pt", accent: "3pt", radius: "4pt" },
  space: {
    scale: { xs: "4pt", sm: "8pt", md: "12pt", lg: "16pt", xl: "24pt" },
    block: "sm",
    gutter: "lg",
    inset: "md",
    edge: "xl",
  },
  dir: "ltr",
  lang: "en",
};
