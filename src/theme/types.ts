import type { CalloutKind, Dir } from "../spec/schema.js";

/** A callout box's two colors (fill + accent border). */
export interface CalloutColor {
  bg: string;
  border: string;
}

/**
 * A theme is the ONLY place aesthetics live. Agent-authored blocks carry
 * semantics (a heading, a definition callout) — never colors, fonts, or sizes.
 * All values are plain (copied, never imported from the parent workspace) so
 * this package stays self-contained for open-source release.
 */
export interface ThemeTokens {
  /** Human description, shown by `pdf themes`. */
  description: string;
  page: {
    /** Typst paper name, e.g. "a4" | "us-letter". */
    paper: string;
    /** Typst length, e.g. "2.2cm". */
    margin: string;
  };
  /** Font family names. v1 defaults reference Typst's embedded fonts. */
  fonts: {
    heading: string;
    body: string;
    mono: string;
  };
  /** Typst lengths per role. */
  size: {
    base: string;
    h1: string;
    h2: string;
    h3: string;
    h4: string;
    small: string;
  };
  /** Hex colors (#rrggbb). */
  color: {
    text: string;
    muted: string;
    surface: string;
    primary: string;
    border: string;
    callout: Record<CalloutKind, CalloutColor>;
  };
  /** Typst lengths. */
  space: {
    block: string;
    gutter: string;
    inset: string;
  };
  dir: Dir;
  lang: string;
}
