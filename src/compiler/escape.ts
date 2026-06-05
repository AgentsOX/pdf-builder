/**
 * Text escaping for Typst markup. Plain text is escaped so it renders
 * literally, EXCEPT inline math spans (`$...$`) which pass through to Typst's
 * math engine verbatim. Lives in its own file so both the compiler and the
 * theme preamble can use it without a circular import.
 */

// Characters with markup meaning in Typst content mode.
const SPECIAL = /[\\#$*_`<>@~\[\]]/g;

/** Escape a plain (non-math) text segment for Typst content. */
export function escapeText(s: string): string {
  return s.replace(SPECIAL, (c) => "\\" + c);
}

/**
 * Emit inline content: split on `$...$` math spans, escape the prose, pass the
 * math through untouched. So "rate is $\\Delta = 5\\%$ today" keeps the equation
 * but escapes the surrounding words.
 */
export function emitInline(text: string): string {
  const parts = text.split(/(\$[^$]*\$)/g);
  return parts
    .map((p) => (p.length >= 2 && p.startsWith("$") && p.endsWith("$") ? p : escapeText(p)))
    .join("");
}
