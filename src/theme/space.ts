import type { ThemeTokens } from "./types.js";

/** Spacing roles resolved from the theme's scale into concrete Typst lengths. */
export interface ResolvedSpace {
  /** Gap between stacked blocks. */
  block: string;
  /** Gap between columns / rail ↔ main. */
  gutter: string;
  /** Padding inside callouts and table cells. */
  inset: string;
  /** Safe-area padding between content and a colored edge. */
  edge: string;
  /** Paragraph leading. */
  line: string;
}

/**
 * Resolve the theme's semantic spacing roles (block/gutter/inset/edge) to the
 * lengths their scale steps point at. Every consumer reads spacing through this,
 * so a one-off length can't sneak into layout — the bug class behind a rail that
 * bled to the page edge.
 */
export function resolveSpace(t: ThemeTokens): ResolvedSpace {
  const s = t.space.scale;
  return {
    block: s[t.space.block],
    gutter: s[t.space.gutter],
    inset: s[t.space.inset],
    edge: s[t.space.edge],
    line: t.space.line ?? "0.7em",
  };
}
