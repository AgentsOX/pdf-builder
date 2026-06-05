/**
 * Text escaping for Typst markup. Plain prose is escaped so it renders
 * literally; inline math spans (`$...$`) are routed to the math engine:
 *   - "typst" mode: passed through as native Typst math `$...$`
 *   - "latex" mode: rendered via mitex as `#mi(...)` so authors write LaTeX
 * Lives in its own file so both the compiler and the theme preamble can use it
 * without a circular import.
 */

import type { MathSyntax } from "../spec/schema.js";

// Characters with markup meaning in Typst content mode.
const SPECIAL = /[\\#$*_`<>@~\[\]]/g;

/** Escape a plain (non-math) text segment for Typst content. */
export function escapeText(s: string): string {
  return s.replace(SPECIAL, (c) => "\\" + c);
}

/** A Typst string literal (escaping backslash and quote). */
export function strLit(s: string): string {
  return '"' + s.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
}

/**
 * Wrap a LaTeX/Typst-math source string as a Typst argument. Prefer a raw
 * (backtick) literal so LaTeX backslashes need no escaping; fall back to a
 * quoted string (escaping `\` and `"`) if the source itself contains a backtick.
 */
export function rawArg(s: string): string {
  if (!s.includes("`")) return "`" + s + "`";
  return '"' + s.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
}

/** Render an inline math source in the given syntax. */
export function inlineMath(src: string, syntax: MathSyntax): string {
  return syntax === "latex" ? `#mi(${rawArg(src)})` : `$${src}$`;
}

/** Render a display (block) math source in the given syntax. */
export function displayMath(src: string, syntax: MathSyntax): string {
  return syntax === "latex" ? `#mitex(${rawArg(src)})` : `$ ${src} $`;
}

/**
 * Emit inline content: split on `$...$` math spans, escape the prose, and route
 * each math span through the active syntax. So "rate is $\\Delta$ today" keeps
 * the equation (as LaTeX or Typst) but escapes the surrounding words.
 */
export function emitInline(text: string, mathSyntax: MathSyntax = "typst"): string {
  const parts = text.split(/(\$[^$]*\$)/g);
  return parts
    .map((p) =>
      p.length >= 2 && p.startsWith("$") && p.endsWith("$")
        ? inlineMath(p.slice(1, -1), mathSyntax)
        : escapeText(p),
    )
    .join("");
}

/** True if a text fragment contains an inline math span. */
export function hasInlineMath(text: string): boolean {
  return /\$[^$]*\$/.test(text);
}
