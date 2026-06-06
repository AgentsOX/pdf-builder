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

/** A Typst rgb() color from a hex string. */
export function rgb(hex: string): string {
  return `rgb(${strLit(hex)})`;
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

/** Markdown-style inline link: `[label](url)`. */
const LINK = /\[([^\]]+)\]\(([^)]+)\)/g;
/** Only these URL schemes become clickable links; anything else stays literal. */
const SAFE_URL = /^(https?:|mailto:)/i;

/**
 * Escape prose and route `$...$` math spans through the active syntax. So
 * "rate is $\\Delta$ today" keeps the equation but escapes the surrounding words.
 */
function emitMathAware(text: string, mathSyntax: MathSyntax): string {
  const parts = text.split(/(\$[^$]*\$)/g);
  return parts
    .map((p) =>
      p.length >= 2 && p.startsWith("$") && p.endsWith("$")
        ? inlineMath(p.slice(1, -1), mathSyntax)
        : escapeText(p),
    )
    .join("");
}

/**
 * Markdown emphasis: `**bold**` and `_italic_`. These are *semantic* (strong /
 * emphasized) — the theme still owns how bold/italic actually look. The italic
 * underscores must sit on word boundaries (`(?<!\w)…(?!\w)`) so `snake_case` and
 * `file_name` are left alone; bold uses the unambiguous double-star.
 */
const EMPHASIS = /\*\*([^*]+)\*\*|(?<!\w)_([^_]+)_(?!\w)/g;

/**
 * Split `text` on `regex`, render each match through `match` and the prose
 * between matches through `gap`, then join. The shared skeleton for every inline
 * layer (links, emphasis): each layer differs only in its regex and the two
 * callbacks, and chains to the next by what it passes as `gap`.
 */
function rewriteSpans(
  text: string,
  regex: RegExp,
  gap: (s: string) => string,
  match: (m: RegExpMatchArray) => string,
): string {
  const out: string[] = [];
  let last = 0;
  for (const m of text.matchAll(regex)) {
    const start = m.index ?? 0;
    if (start > last) out.push(gap(text.slice(last, start)));
    out.push(match(m));
    last = start + m[0].length;
  }
  if (last < text.length) out.push(gap(text.slice(last)));
  return out.join("");
}

/**
 * Render emphasis spans, with their inner text still escaped + math-aware, then
 * wrap each in Typst strong (`*…*`) or emph (`_…_`).
 */
function emitEmphasis(text: string, mathSyntax: MathSyntax): string {
  return rewriteSpans(
    text,
    EMPHASIS,
    (s) => emitMathAware(s, mathSyntax),
    (m) => (m[1] !== undefined ? `*${emitMathAware(m[1], mathSyntax)}*` : `_${emitMathAware(m[2], mathSyntax)}_`),
  );
}

/**
 * Emit inline content. First peels off markdown links `[label](url)` — safe
 * (http/https/mailto) URLs become Typst `#link`s, anything else is left literal
 * — then applies emphasis (`**bold**` / `_italic_`), escapes prose, and renders
 * inline math in what remains. The layers nest, so `[**bold**](url)` and
 * `**$E=mc^2$**` both work.
 */
export function emitInline(text: string, mathSyntax: MathSyntax = "typst"): string {
  return rewriteSpans(
    text,
    LINK,
    (s) => emitEmphasis(s, mathSyntax),
    (m) => {
      const [full, label, url] = m;
      return SAFE_URL.test(url.trim())
        ? `#link(${strLit(url.trim())})[${emitEmphasis(label, mathSyntax)}]`
        : emitEmphasis(full, mathSyntax);
    },
  );
}

/** True if a text fragment contains an inline math span. */
export function hasInlineMath(text: string): boolean {
  return /\$[^$]*\$/.test(text);
}
