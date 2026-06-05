import type { Block } from "../spec/schema.js";
import type { ThemeTokens } from "../theme/types.js";
import { themePreamble } from "../theme/preamble.js";
import type { Issue } from "../spec/validate.js";
import { emitInline } from "./escape.js";

type HeaderBlock = Extract<Block, { type: "header" }>;
type FooterBlock = Extract<Block, { type: "footer" }>;

const MAX_DEPTH = 8;

interface Ctx {
  theme: ThemeTokens;
  warnings: Issue[];
}

/** Wrap emitted content as a Typst content block `[ ... ]`. */
const content = (s: string) => `[${s}]`;

function emitBlocks(blocks: Block[], ctx: Ctx, path: string, depth: number): string {
  return blocks.map((b, i) => emitBlock(b, ctx, `${path}[${i}]`, depth)).join("\n\n");
}

function emitBlock(block: Block, ctx: Ctx, path: string, depth: number): string {
  const { theme } = ctx;
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
      return `${"=".repeat(level)} ${emitInline(block.text)}`;
    }

    case "text":
      return emitInline(block.text);

    case "list": {
      const marker = block.ordered ? "+" : "-";
      return block.items.map((it) => `${marker} ${emitInline(it)}`).join("\n");
    }

    case "table": {
      const ncols = block.header?.length ?? block.rows[0]?.length ?? 1;
      const lines: string[] = [`#table(`, `  columns: ${ncols},`];
      if (block.align) lines.push(`  align: (${block.align.join(", ")}),`);
      if (block.header) {
        lines.push(`  table.header(${block.header.map((h) => content(emitInline(h))).join(", ")}),`);
      }
      for (const row of block.rows) {
        lines.push(`  ${row.map((c) => content(emitInline(c))).join(", ")},`);
      }
      lines.push(`)`);
      return lines.join("\n");
    }

    case "kv": {
      const cell = (text: string, bold?: boolean) =>
        bold ? `[#text(weight: "bold")[${text}]]` : `[${text}]`;
      const lines: string[] = [`#table(`, `  columns: (1fr, auto),`, `  stroke: none,`, `  align: (left, right),`];
      for (const r of block.rows) {
        lines.push(`  ${cell(emitInline(r.label), r.emphasis)}, ${cell(emitInline(r.value), r.emphasis)},`);
      }
      lines.push(`)`);
      return lines.join("\n");
    }

    case "math":
      // Spaces around the delimiters make it a display (block) equation.
      return `$ ${block.tex} $`;

    case "chart": {
      // v1: render charts as a labelled table and warn. Real chart rendering
      // (cetz) is a later milestone — but never fail silently.
      ctx.warnings.push({
        path,
        expected: "rendered chart",
        got: `chart kind "${block.kind}"`,
        fix: "Charts render as a table in v1; cetz charts are planned.",
      });
      const rows = block.data.map((d) => `  [${emitInline(d.label)}], [${d.value}],`).join("\n");
      const title = block.title ? `${"=".repeat(3)} ${emitInline(block.title)}\n` : "";
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

export interface CompileResult {
  typst: string;
  warnings: Issue[];
  blockCount: number;
}

/**
 * Compile a block tree + theme into a complete Typst document string.
 * Header/footer blocks are pulled out of the flow and injected into the page
 * setup (they are page furniture, not flow content).
 */
export function compileDocument(
  blocks: Block[],
  theme: ThemeTokens,
  opts: { dir?: string; lang?: string } = {},
): CompileResult {
  const ctx: Ctx = { theme, warnings: [] };

  const header = blocks.find((b): b is HeaderBlock => b.type === "header");
  const footer = blocks.find((b): b is FooterBlock => b.type === "footer");
  const flow = blocks.filter((b) => b.type !== "header" && b.type !== "footer");

  const preamble = themePreamble(theme, { header, footer, dir: opts.dir, lang: opts.lang });
  const body = flow.map((b, i) => emitBlock(b, ctx, `blocks[${i}]`, 0)).join("\n\n");

  return {
    typst: `${preamble}\n${body}\n`,
    warnings: ctx.warnings,
    blockCount: blocks.length,
  };
}
