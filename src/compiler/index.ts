import type { Block, MathSyntax } from "../spec/schema.js";
import type { ThemeTokens } from "../theme/types.js";
import { themePreamble } from "../theme/preamble.js";
import type { SidebarSetup } from "../theme/preamble.js";
import { resolveSpace } from "../theme/space.js";
import { DEFAULT_SIDEBAR } from "../theme/default.js";
import { MITEX_IMPORT, CETZ_IMPORT } from "../packages.js";
import type { Issue } from "../spec/validate.js";
import { emitInline, displayMath, hasInlineMath, strLit, rgb } from "./escape.js";
import { resolveAsset } from "./assets.js";

type HeaderBlock = Extract<Block, { type: "header" }>;
type FooterBlock = Extract<Block, { type: "footer" }>;
type SidebarBlock = Extract<Block, { type: "sidebar" }>;

const MAX_DEPTH = 8;
/**
 * Sentinel emitted by the sidebar's compile-time overflow assert. The rail is
 * `place`d (single page), so if its content is taller than the page it would
 * clip silently — instead we fail the compile with this marker, which the
 * pipeline turns into a clean, actionable issue. Keep in sync with pipeline.ts.
 */
export const SIDEBAR_OVERFLOW_SENTINEL = "PDFBUILDER_SIDEBAR_OVERFLOW";
/** cetz plot canvas size (width, height) in cetz units — shared by line and bar charts. */
const CHART_SIZE = "(12, 6)";

interface Ctx {
  theme: ThemeTokens;
  /** Theme spacing roles resolved to lengths. */
  space: ReturnType<typeof resolveSpace>;
  warnings: Issue[];
  /** Document-default math syntax. */
  math: MathSyntax;
  /** Base dir for resolving/checking image & logo paths (the Typst root). */
  assetBase?: string;
  /** Declared asset paths (image/logo srcs), for the manifest. */
  assets: string[];
}

/** Wrap emitted content as a Typst content block `[ ... ]`. */
const content = (s: string) => `[${s}]`;

/** Wrap inline content in a direction override when the block sets one. */
function withDir(s: string, dir?: "ltr" | "rtl"): string {
  return dir ? `#text(dir: ${dir})[${s}]` : s;
}

/** Wrap a block in a horizontal alignment when it sets one (left is the default). */
function withAlign(s: string, align?: "left" | "center" | "right"): string {
  return align ? `#align(${align})[${s}]` : s;
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
      return withAlign(`${"=".repeat(level)} ${withDir(emitInline(block.text, math), block.dir)}`, block.align);
    }

    case "text":
      return withAlign(withDir(emitInline(block.text, math), block.dir), block.align);

    case "list": {
      const marker = block.ordered ? "+" : "-";
      const body = block.items.map((it) => `${marker} ${emitInline(it, math)}`).join("\n");
      return withAlign(withDir(body, block.dir), block.align);
    }

    case "table": {
      const ncols = block.header?.length ?? block.rows[0]?.length ?? 1;
      const ragged = block.rows.findIndex((r) => r.length !== ncols);
      if (ragged !== -1) {
        ctx.warnings.push({
          path: `${path}.rows[${ragged}]`,
          expected: `${ncols} cells (to match ${block.header ? "header" : "row 0"})`,
          got: `${block.rows[ragged].length} cells`,
          fix: "Give every table row the same number of cells.",
        });
      }
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
      const title = block.title ? `${"=".repeat(3)} ${emitInline(block.title, math)}\n` : "";
      const accent = rgb(theme.color.primary);
      const pairs = block.data.map((d) => `(${strLit(d.label)}, ${d.value})`).join(", ");
      let canvas: string;
      if (block.kind === "pie") {
        // Put the value into each label so meaning isn't carried by color alone
        // and exact numbers are extractable (accessibility).
        const labeled = block.data.map((d) => `(${strLit(`${d.label} (${d.value})`)}, ${d.value})`).join(", ");
        canvas = `cetz.canvas({ chart.piechart((${labeled},), value-key: 1, label-key: 0, radius: 3) })`;
      } else if (block.kind === "line") {
        const ticks = block.data.map((d, i) => `(${i}, [${emitInline(d.label, math)}])`).join(", ");
        const pts = block.data.map((d, i) => `(${i}, ${d.value})`).join(", ");
        canvas = `cetz.canvas({ plot.plot(size: ${CHART_SIZE}, x-ticks: (${ticks},), y-min: 0, { plot.add((${pts},), mark: "o", style: (stroke: ${accent})) }) })`;
      } else {
        canvas = `cetz.canvas({ chart.columnchart((${pairs},), size: ${CHART_SIZE}, bar-style: (fill: ${accent}, stroke: 0.5pt)) })`;
      }
      return `${title}#align(center)[#${canvas}]`;
    }

    case "image": {
      let src = block.src;
      ctx.assets.push(block.src);
      if (ctx.assetBase) {
        const a = resolveAsset(src, ctx.assetBase);
        if (a.outsideRoot) {
          ctx.warnings.push({
            path: `${path}.src`,
            expected: `a path under the root (${ctx.assetBase})`,
            got: block.src,
            fix: "Move the image under the working directory, or run from a directory that contains it.",
          });
        } else if (!a.exists) {
          ctx.warnings.push({
            path: `${path}.src`,
            expected: "an existing image file",
            got: block.src,
            fix: `Image not found relative to ${ctx.assetBase}. Check the path.`,
          });
        }
        src = a.typstPath;
      }
      const w = block.width ? `, width: ${block.width}` : "";
      const cap = block.alt ? `, caption: [${emitInline(block.alt, math)}]` : "";
      return `#figure(image("${src}"${w})${cap})`;
    }

    case "columns": {
      const n = block.children.length;
      const cols = block.ratios?.length
        ? block.ratios.map((r) => `${r}fr`).join(", ")
        : Array(n).fill("1fr").join(", ");
      const cells = block.children
        .map((col, i) => content(emitBlocks(col, ctx, `${path}.children[${i}]`, depth + 1)))
        .join(",\n  ");
      return `#grid(\n  columns: (${cols}),\n  gutter: ${ctx.space.gutter},\n  ${cells},\n)`;
    }

    case "sidebar": {
      // A sidebar is page-level; compileDocument lifts the first top-level one
      // into the page layout. Reaching here means it was nested — warn and fall
      // back to rendering its children inline so nothing is silently dropped.
      ctx.warnings.push({
        path,
        expected: "a top-level sidebar block",
        got: "a nested sidebar",
        fix: "Move the sidebar to the document's top-level blocks (one per document).",
      });
      return emitBlocks(block.children, ctx, `${path}.children`, depth + 1);
    }

    case "callout": {
      // Title goes through emitInline (escaped + math-aware) as content, like
      // every other user-text field — never raw into a string literal.
      const title = block.title ? `[${emitInline(block.title, math)}]` : "none";
      const body = emitBlocks(block.body, ctx, `${path}.body`, depth + 1);
      return `#callout(${strLit(block.kind)}, ${title}, [${body}])`;
    }

    case "spacer":
      return `#v(${block.size ?? ctx.space.block})`;

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
      case "sidebar":
        if (needsMitex(b.children, docMath)) return true;
        break;
      case "callout":
        if (needsMitex(b.body, docMath)) return true;
        break;
    }
  }
  return false;
}

/** Recursively decide whether the document uses any chart (needs cetz). */
function needsCetz(blocks: Block[]): boolean {
  return blocks.some((b) =>
    b.type === "chart"
      ? true
      : b.type === "columns"
        ? b.children.some(needsCetz)
        : b.type === "sidebar"
          ? needsCetz(b.children)
          : b.type === "callout"
            ? needsCetz(b.body)
            : false,
  );
}

export interface CompileOptions {
  dir?: string;
  lang?: string;
  /** Document-default math syntax. Defaults to "latex". */
  math?: MathSyntax;
  /** Base dir for resolving/checking image & logo paths (the Typst root). */
  assetBase?: string;
}

export interface CompileResult {
  typst: string;
  warnings: Issue[];
  blockCount: number;
  /** Declared image/logo asset paths (deduped), for the manifest. */
  assets: string[];
}

/**
 * Compile a block tree + theme into a complete Typst document string.
 * Header/footer blocks are pulled out of the flow into the page setup; the mitex
 * import is added only when LaTeX math is actually used.
 */
export function compileDocument(blocks: Block[], theme: ThemeTokens, opts: CompileOptions = {}): CompileResult {
  const math: MathSyntax = opts.math ?? "latex";
  const ctx: Ctx = { theme, space: resolveSpace(theme), warnings: [], math, assetBase: opts.assetBase, assets: [] };

  let header = blocks.find((b): b is HeaderBlock => b.type === "header");
  const footer = blocks.find((b): b is FooterBlock => b.type === "footer");
  // The first top-level sidebar becomes a page-level rail; any extra is ignored
  // with a warning (a document has one rail).
  const sidebars = blocks.filter((b): b is SidebarBlock => b.type === "sidebar");
  const sidebar = sidebars[0];
  if (sidebars.length > 1) {
    ctx.warnings.push({
      path: "blocks",
      expected: "one sidebar block",
      got: `${sidebars.length} sidebars`,
      fix: "Keep a single sidebar; merge the rest of its content into the main flow.",
    });
  }
  const flow = blocks.filter((b) => b.type !== "header" && b.type !== "footer" && b.type !== "sidebar");

  // Resolve + existence-check the header logo (block logo, else theme logo).
  if (header && opts.assetBase) {
    const rawLogo = header.logo ?? theme.logo;
    if (rawLogo) {
      ctx.assets.push(rawLogo);
      const a = resolveAsset(rawLogo, opts.assetBase);
      if (a.outsideRoot) {
        ctx.warnings.push({
          path: "header.logo",
          expected: `a path under the root (${opts.assetBase})`,
          got: rawLogo,
          fix: "Move the logo under the working directory, or run from a directory that contains it.",
        });
      } else if (!a.exists) {
        ctx.warnings.push({
          path: "header.logo",
          expected: "an existing logo file",
          got: rawLogo,
          fix: `Logo not found relative to ${opts.assetBase}. Check the path.`,
        });
      }
      header = { ...header, logo: a.typstPath };
    }
  }

  const imports = [needsMitex(blocks, math) ? MITEX_IMPORT : null, needsCetz(blocks) ? CETZ_IMPORT : null]
    .filter(Boolean)
    .join("\n");
  const importLine = imports ? imports + "\n" : "";
  // Resolve sidebar geometry/colors: the block carries only side/width (layout),
  // the theme owns the colors. Fall back to neutral values if a theme predates
  // sidebar support, so the block still works on any theme.
  const sidebarTheme = theme.sidebar ?? DEFAULT_SIDEBAR;
  // The rail's safe-area padding and its gap to the main column are spacing
  // roles, not bespoke sidebar values — so they stay on the theme's scale.
  const edge = ctx.space.edge;
  const gap = ctx.space.gutter;
  const side: "left" | "right" = sidebar?.side ?? "left";
  const width = sidebar?.width ?? sidebarTheme.width;
  const sidebarSetup: SidebarSetup | undefined = sidebar ? { side, width, fill: sidebarTheme.fill } : undefined;

  const preamble = themePreamble(theme, { header, footer, dir: opts.dir, lang: opts.lang, math, sidebar: sidebarSetup, space: ctx.space });

  const mainBody = flow.map((b, i) => emitBlock(b, ctx, `blocks[${i}]`, 0)).join("\n\n");
  let body: string;
  if (sidebar) {
    const railInner = emitBlocks(sidebar.children, ctx, "sidebar.children", 1);
    // The main flow lives in the (margin-inset) body; the rail content is placed
    // into the band beside it, in the theme's sidebar text color (headings too)
    // so it reads on the fill. `place` keeps it off the main flow, so the main
    // content paginates normally across pages while the band repeats.
    //
    // The rail content box is the `edge` safe-area padding from the band's edges
    // on every side, so headings, rules, and bullets all share one left edge and
    // nothing bleeds to the page edge. The main column sits at margin
    // `width + gap`; we shift the box back from there to land its near edge at
    // `edge`. dx(left) = edge - width - gap;  dx(right) = width + gap - edge.
    const dx = side === "right" ? `(${width} + ${gap} - ${edge})` : `(${edge} - ${width} - ${gap})`;
    const railFill = rgb(sidebarTheme.text);
    const railBox = `box(width: ${width} - 2 * ${edge})[\n#set text(fill: ${railFill})\n#show heading: set text(fill: ${railFill})\n${railInner}\n]`;
    // The rail is placed on the first page only; guard against silently clipping
    // content taller than the page (top/bottom margins are the `edge` padding).
    const overflowGuard = `#context {
  let _railHeight = measure(${railBox}).height
  assert(_railHeight <= page.height - ${edge} - ${edge}, message: "${SIDEBAR_OVERFLOW_SENTINEL}")
}`;
    body = `${overflowGuard}\n#place(top + ${side}, dx: ${dx}, dy: 0pt, ${railBox})\n${mainBody}`;
  } else {
    body = mainBody;
  }

  return {
    typst: `${importLine}${preamble}\n${body}\n`,
    warnings: ctx.warnings,
    blockCount: blocks.length,
    assets: Array.from(new Set(ctx.assets)),
  };
}
