import type { CalloutKind, Dir } from "../spec/schema.js";

/** A step on the theme's primitive spacing scale, smallest → largest. */
export type SpaceStep = "xs" | "sm" | "md" | "lg" | "xl";

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
  /** Default header logo (path), used when a header block omits its own. */
  logo?: string;
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
  /** Line weights and corner radius for rules, tables, and callout boxes. */
  stroke: {
    /** Hairline weight for rules and table grid (Typst length). */
    hairline: string;
    /** Accent border weight, e.g. a callout's left edge (Typst length). */
    accent: string;
    /** Corner radius for boxed elements like callouts (Typst length). */
    radius: string;
  };
  /**
   * Spacing as a two-tier scale (after the design-token model): a small set of
   * primitive steps, and semantic roles that each name one step. Every gap and
   * padding in the document resolves to a step, so spacing is harmonious by
   * construction and no value is an ad-hoc one-off.
   */
  space: {
    /** Primitive steps (Typst lengths), smallest → largest. */
    scale: Record<SpaceStep, string>;
    /** Gap between stacked blocks. */
    block: SpaceStep;
    /** Gap between columns and between a rail and the main column. */
    gutter: SpaceStep;
    /** Padding inside callouts and table cells. */
    inset: SpaceStep;
    /** Safe-area padding between content and a colored edge (page/rail fill). */
    edge: SpaceStep;
    /** Paragraph leading (line spacing); em-relative, off the grid. Defaults to `0.7em`. */
    line?: string;
  };
  /**
   * Heading styling. Optional: when omitted, headings use `color.text` and have
   * no rules — the pre-v0.3 behaviour, so existing themes render identically.
   */
  heading?: {
    /** Heading color (hex). Defaults to `color.text`. */
    color?: string;
    /** Letter-spacing added between heading characters (Typst length, e.g. `0.2em`). */
    tracking?: string;
    /**
     * Underline rule beneath headings. `levels` chooses which (1–4); the rest
     * are styling tokens with sensible defaults, so the look is theme-tunable
     * rather than hardcoded in the engine.
     */
    rule?: {
      levels: number[];
      /** Rule stroke weight (Typst length). Defaults to `0.6pt`. */
      weight?: string;
      /** Gap between heading text and the rule (Typst length). Defaults to `0.15em`. */
      gap?: string;
      /** Rule color (hex). Defaults to `color.border`. */
      color?: string;
    };
  };
  /**
   * Side-rail styling, used by the `sidebar` block. Optional: a theme without it
   * falls back to a neutral light rail.
   */
  sidebar?: {
    /** Rail fill (hex). */
    fill: string;
    /** Text color inside the rail (hex). */
    text: string;
    /** Default rail width (Typst length, e.g. `6.5cm`). */
    width: string;
  };
  dir: Dir;
  lang: string;
}
