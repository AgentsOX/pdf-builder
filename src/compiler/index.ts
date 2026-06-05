import type { Block, MathSyntax } from "../spec/schema.js";
import type { ThemeTokens } from "../theme/types.js";
import { themePreamble, MITEX_IMPORT } from "../theme/preamble.js";
import type { Issue } from "../spec/validate.js";
import { emitInline, displayMath, hasInlineMath } from "./escape.js";

type HeaderBlock = Extract<Block, { type: "header" }>;
type FooterBlock = Extract<Block, { type: "footer" }>;

const MAX_DEPTH = 8;

interface Ctx {
  theme: ThemeTokens;
  warnings: Issue[];
  /** Document-default math syntax. */
  math: MathSyntax;
}

/** Wrap emitted content as a Typst content block `[ ... ]`. */
const content = (s: string) => `[${s}]`;

/** Wrap inline content in a direction override when the block sets one. */
function withDir(s: string, dir?: "ltr" | "rtl"): string {
  return dir ? `#text(dir: ${dir})[${s}]` : s;
}

function emitBlocks(blocks: Block[], ctx: Ctx, path: string, depth: number): string {
  return blocks.map((b, i) => emitBlock(b, ctx, `${path}[${i}]`, depth)).join("\n\n");
}

function emitBlock(block: Block, ctx: Ctx, path: string, depth: number): string {
  const { theme, math } = ctx;
  if (depth > MAX_DEPTH) {
    ctx.warnings.push({
      path,
      expected: `nesting depth <= ${MAX_DEPTH}`,
      got: depth,
      fix: "Flatten deeply nested columns/callouts.",
    });
    return "";
  }

  switch (block.type) {
    case "heading": {
      const level = block.level ?? 1;
      return `${"=".repeat(level)} ${withDir(emitInline(block.text, math), block.dir)}`;
    }

    case "text":
      return withDir(emitInline(block.text, math), block.dir);

    case "list": {
      const marker = block.ordered ? "+" : "-";
      const body = block.items.map((it) => `${marker} ${emitInline(it, math)}`).join("\n");
      return withDir(body, block.dir);
    }

    case "table": {
      const ncols = block.header?.length ?? block.rows[0]?.length ?? 1;
      const lines: string[] = [`#table(`, `  columns: ${ncols},`];
      if (block.align) lines.push(`  align: (${block.align.join(", ")}),`);
      if (block.header) {
        lines.push(`  table.header(${block.header.map((h) => content(emitInline(h, math))).join(", ")}),`);
      }
      for (const row of block.rows) {
        lines.push(`  ${row.map((c) => content(emitInline(c, math))).join(", ")},`);
      }
      lines.push(`)`);
      return lines.join("\n");
    }

    case "kv": {
      const cell = (text: string, bold?: boolean) =>
        bold ? `[#text(weight: "bold")[${text}]]` : `[${text}]`;
      const lines: string[] = [`#table(`, `  columns: (1fr, auto),`, `  stroke: none,`, `  align: (left, right),`];
      for (const r of block.rows) {
        lines.push(`  ${cell(emitInline(r.label, math), r.emphasis)}, ${cell(emitInline(r.value, math), r.emphasis)},`);
      }
      lines.push(`)`);
      return lines.join("\n");
    }

    case "math":
      return displayMath(block.tex, block.syntax ?? math);

    case "chart": {
      // v1: render charts as a labelled table and warn — never fail silently.
      ctx.warnings.push({
        path,
        expected: "rendered chart",
        got: `chart kind "${block.kind}"`,
        fix: "Charts render as a table in v1; cetz charts are planned.",
      });
      const rows = block.data.map((d) => `  [${emitInline(d.label, math)}], [${d.value}],`).join("\n");
      const title = block.title ? `${"=".repeat(3)} ${emitInline(block.title, math)}\n` : "";
      return `${title}#table(\n  columns: (1fr, auto),\n  align: (left, right),\n  table.header[Label][Value],\n${rows}\n)`;
    }

    case "image": {
      const w = block.width ? `, width: ${block.width}` : "";
      return `#figure(image("${block.src}"${w}))`;
    }

    case "columns": {
      const n = block.children.length;
      const cols = block.ratios?.length
        ? block.ratios.map((r) => `${r}fr`).join(", ")
        : Array(n).fill("1fr").join(", ");
      const cells = block.children
        .map((col, i) => content(emitBlocks(col, ctx, `${path}.children[${i}]`, depth + 1)))
        .join(",\n  ");
      return `#grid(\n  columns: (${cols}),\n  gutter: ${theme.space.gutter},\n  ${cells},\n)`;
    }

    case "callout": {
      const title = block.title ? `"${block.title.replace(/"/g, '\\"')}"` : "none";
      const body = emitBlocks(block.body, ctx, `${path}.body`, depth + 1);
      return `#callout("${block.kind}", ${title}, [${body}])`;
    }

    case "spacer":
      return `#v(${block.size ?? theme.space.block})`;

    case "pagebreak":
      return `#pagebreak()`;

    case "header":
    case "footer":
      // Page-level; handled in compileDocument, not in the flow.
      return "";
  }
}

/** Recursively decide whether the document needs the mitex (LaTeX) plugin. */
function needsMitex(blocks: Block[], docMath: MathSyntax): boolean {
  for (const b of blocks) {
    switch (b.type) {
      case "math":
        if ((b.syntax ?? docMath) === "latex") return true;
        break;
      case "heading":
      case "text":
        if (docMath === "latex" && hasInlineMath(b.text)) return true;
        break;
      case "list":
        if (docMath === "latex" && b.items.some(hasInlineMath)) return true;
        break;
      case "table":
        if (docMath === "latex" && (b.header ?? []).concat(b.rows.flat()).some(hasInlineMath)) return true;
        break;
      case "kv":
        if (docMath === "latex" && b.rows.some((r) => hasInlineMath(r.label) || hasInlineMath(r.value))) return true;
        break;
      case "chart":
        if (docMath === "latex" && b.data.some((d) => hasInlineMath(d.label))) return true;
        break;
      case "columns":
        if (b.children.some((col) => needsMitex(col, docMath))) return true;
        break;
      case "callout":
        if (needsMitex(b.body, docMath)) return true;
        break;
    }
  }
  return false;
}

export interface CompileOptions {
  dir?: string;
  lang?: string;
  /** Document-default math syntax. Defaults to "latex". */
  math?: MathSyntax;
}

export interface CompileResult {
  typst: string;
  warnings: Issue[];
  blockCount: number;
}

/**
 * Compile a block tree + theme into a complete Typst document string.
 * Header/footer blocks are pulled out of the flow into the page setup; the mitex
 * import is added only when LaTeX math is actually used.
 */
export function compileDocument(blocks: Block[], theme: ThemeTokens, opts: CompileOptions = {}): CompileResult {
  const math: MathSyntax = opts.math ?? "latex";
  const ctx: Ctx = { theme, warnings: [], math };

  const header = blocks.find((b): b is HeaderBlock => b.type === "header");
  const footer = blocks.find((b): b is FooterBlock => b.type === "footer");
  const flow = blocks.filter((b) => b.type !== "header" && b.type !== "footer");

  const importLine = needsMitex(blocks, math) ? MITEX_IMPORT + "\n" : "";
  const preamble = themePreamble(theme, { header, footer, dir: opts.dir, lang: opts.lang, math });
  const body = flow.map((b, i) => emitBlock(b, ctx, `blocks[${i}]`, 0)).join("\n\n");

  return {
    typst: `${importLine}${preamble}\n${body}\n`,
    warnings: ctx.warnings,
    blockCount: blocks.length,
  };
}
