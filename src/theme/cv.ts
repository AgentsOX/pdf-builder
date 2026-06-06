import type { ThemeTokens } from "./types.js";
import { defaultTheme } from "./default.js";

/**
 * Résumé / CV theme: a full-height navy side rail (Contact, Skills, …), accent
 * section headings with underline rules, and tight one-page spacing. Uses the
 * embedded serif so it renders with zero external fonts; pass `--font-path` with
 * a sans family (e.g. Inter) for the geometric look of a modern CV.
 */
export const cvTheme: ThemeTokens = {
  ...defaultTheme,
  description: "Résumé / CV with a colored side rail and ruled section headings.",
  page: { paper: "a4", margin: "1.6cm" },
  size: { base: "9pt", h1: "25pt", h2: "12.5pt", h3: "10.5pt", h4: "9.5pt", small: "8pt" },
  space: {
    scale: { xs: "3pt", sm: "5pt", md: "8pt", lg: "12pt", xl: "24pt" },
    block: "sm",
    gutter: "lg",
    inset: "md",
    edge: "xl",
    line: "0.6em",
  },
  color: {
    ...defaultTheme.color,
    text: "#1f2a3a",
    muted: "#6b7280",
    primary: "#2b3a4f",
    border: "#c9d2dd",
  },
  heading: { color: "#2b3a4f", rule: { levels: [2] } },
  sidebar: { fill: "#2b3a4f", text: "#eef2f6", width: "5.6cm" },
};
