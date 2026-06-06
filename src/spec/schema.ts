import { z } from "zod";

/**
 * The block vocabulary — the closed set of "things a page can hold".
 * Every document, whether authored as a template or as raw blocks, compiles
 * to a tree of these. Keep it small enough to fit in an agent's context.
 *
 * All object schemas are `.strict()`: an unknown/typo'd key is a loud, fixable
 * error rather than a silently-dropped field. Every field carries a `.describe()`
 * so `pdf schema` (and editor autocomplete) explain the spec, not just its types.
 */

export type CalloutKind = "definition" | "theorem" | "tip" | "note";
export type Align = "left" | "center" | "right";
export type Dir = "ltr" | "rtl";
export type MathSyntax = "latex" | "typst";

export type Block =
  | { type: "heading"; level?: number; text: string; dir?: Dir; align?: Align }
  | { type: "text"; text: string; dir?: Dir; align?: Align }
  | { type: "list"; ordered?: boolean; items: string[]; dir?: Dir; align?: Align }
  | { type: "table"; header?: string[]; rows: string[][]; align?: Align[] }
  | { type: "kv"; rows: { label: string; value: string; emphasis?: boolean }[] }
  | { type: "math"; tex: string; syntax?: MathSyntax }
  | { type: "chart"; kind: "bar" | "line" | "pie"; title?: string; data: { label: string; value: number }[] }
  | { type: "image"; src: string; width?: string; alt?: string }
  | { type: "columns"; ratios?: number[]; children: Block[][] }
  | { type: "sidebar"; side?: "left" | "right"; width?: string; children: Block[] }
  | { type: "callout"; kind: CalloutKind; title?: string; body: Block[] }
  | { type: "spacer"; size?: string; flex?: boolean }
  | { type: "pagebreak" }
  | { type: "header"; text?: string; logo?: string }
  | { type: "footer"; text?: string; pageNumbers?: boolean };

const dirField = z.enum(["ltr", "rtl"]).describe("Text direction; overrides the document default for this block.").optional();
const alignField = z.enum(["left", "center", "right"]).describe("Horizontal alignment of this block; defaults to left.").optional();

const HeadingBlock = z
  .object({
    type: z.literal("heading"),
    level: z.number().int().min(1).max(4).describe("Heading level 1–4 (1 = largest / document title).").optional(),
    text: z.string().describe("Heading text."),
    dir: dirField,
    align: alignField,
  })
  .strict()
  .describe("A section title.");

const TextBlock = z
  .object({
    type: z.literal("text"),
    text: z.string().describe("Paragraph text. Inline math goes inside `$…$` (LaTeX by default)."),
    dir: dirField,
    align: alignField,
  })
  .strict()
  .describe("A paragraph of body text.");

const ListBlock = z
  .object({
    type: z.literal("list"),
    ordered: z.boolean().describe("Numbered list when true; bulleted when omitted.").optional(),
    items: z.array(z.string()).min(1).describe("List items; each may contain inline `$…$` math."),
    dir: dirField,
    align: alignField,
  })
  .strict()
  .describe("A bulleted or numbered list.");

const TableBlock = z
  .object({
    type: z.literal("table"),
    header: z.array(z.string()).describe("Optional header row (column titles).").optional(),
    rows: z.array(z.array(z.string())).min(1).describe("Rows of string cells; all rows should have the same length as the header."),
    align: z.array(z.enum(["left", "center", "right"])).describe("Per-column alignment, left to right.").optional(),
  })
  .strict()
  .describe("A data table.");

const KvBlock = z
  .object({
    type: z.literal("kv"),
    rows: z
      .array(
        z
          .object({
            label: z.string().describe("Row label (left column)."),
            value: z.string().describe("Row value (right column)."),
            emphasis: z.boolean().describe("Bold the row, e.g. for a total.").optional(),
          })
          .strict(),
      )
      .min(1)
      .describe("Label→value rows, e.g. invoice totals."),
  })
  .strict()
  .describe("Aligned label/value rows.");

const MathBlock = z
  .object({
    type: z.literal("math"),
    tex: z.string().describe("The equation source (LaTeX by default; e.g. `\\frac{a}{b}`)."),
    syntax: z.enum(["latex", "typst"]).describe("Math language for `tex`. Defaults to the document's `math` setting.").optional(),
  })
  .strict()
  .describe("A centered display equation.");

const ChartBlock = z
  .object({
    type: z.literal("chart"),
    kind: z.enum(["bar", "line", "pie"]).describe("Chart type."),
    title: z.string().describe("Optional chart title.").optional(),
    data: z
      .array(
        z
          .object({
            label: z.string().describe("Category label for this data point."),
            value: z.number().describe("Numeric value for this data point."),
          })
          .strict(),
      )
      .min(1)
      .describe("Data points; drawn in the theme's brand color."),
  })
  .strict()
  .describe("A bar, line, or pie chart.");

const ImageBlock = z
  .object({
    type: z.literal("image"),
    src: z.string().describe("Path to the image, relative to the spec file."),
    width: z.string().describe("Display width, e.g. `60%` or `8cm`.").optional(),
    alt: z.string().describe("Alternative text.").optional(),
  })
  .strict()
  .describe("An embedded image.");

const ColumnsBlock = z
  .object({
    type: z.literal("columns"),
    ratios: z.array(z.number()).describe("Relative column widths; defaults to equal columns.").optional(),
    children: z.array(z.array(z.lazy(() => BlockSchema))).describe("One array of blocks per column, left to right."),
  })
  .strict()
  .describe("Side-by-side columns, each holding its own blocks.");

const SidebarBlock = z
  .object({
    type: z.literal("sidebar"),
    side: z.enum(["left", "right"]).describe("Which edge the rail sits on; defaults to left.").optional(),
    width: z.string().describe("Rail width, e.g. `6.5cm` or `30%`. Defaults to the theme's sidebar width.").optional(),
    children: z.array(z.lazy(() => BlockSchema)).min(1).describe("Blocks rendered inside the sidebar rail."),
  })
  .strict()
  .describe("A full-height side rail (e.g. a CV contact column). The theme owns its fill and text color; one per document, placed among the top-level blocks.");

const CalloutBlock = z
  .object({
    type: z.literal("callout"),
    kind: z.enum(["definition", "theorem", "tip", "note"]).describe("Callout style/label."),
    title: z.string().describe("Optional heading shown in the callout.").optional(),
    body: z.array(z.lazy(() => BlockSchema)).describe("Blocks rendered inside the callout box."),
  })
  .strict()
  .describe("A boxed aside (definition / theorem / tip / note).");

const SpacerBlock = z
  .object({
    type: z.literal("spacer"),
    size: z.string().describe("Fixed vertical gap, e.g. `1cm` or `2em`.").optional(),
    flex: z
      .boolean()
      .describe("Expand to fill the leftover vertical space (like flex-grow). Several flex spacers split it equally — use to push content apart or balance a short page. Ignores `size`.")
      .optional(),
  })
  .strict()
  .describe("Vertical whitespace: a fixed gap, or `flex: true` to fill remaining page height.");

const PageBreakBlock = z.object({ type: z.literal("pagebreak") }).strict().describe("Force a new page.");

const HeaderBlock = z
  .object({
    type: z.literal("header"),
    text: z.string().describe("Header text shown at the top of every page.").optional(),
    logo: z.string().describe("Path to a logo image, relative to the spec file.").optional(),
  })
  .strict()
  .describe("Page header (repeats on every page).");

const FooterBlock = z
  .object({
    type: z.literal("footer"),
    text: z.string().describe("Footer text shown at the bottom of every page.").optional(),
    pageNumbers: z.boolean().describe("Show page numbers when true.").optional(),
  })
  .strict()
  .describe("Page footer (repeats on every page).");

export const BlockSchema: z.ZodType<Block> = z.lazy(() =>
  z.discriminatedUnion("type", [
    HeadingBlock,
    TextBlock,
    ListBlock,
    TableBlock,
    KvBlock,
    MathBlock,
    ChartBlock,
    ImageBlock,
    ColumnsBlock,
    SidebarBlock,
    CalloutBlock,
    SpacerBlock,
    PageBreakBlock,
    HeaderBlock,
    FooterBlock,
  ]),
);

/**
 * A document spec. Two front doors, one block tree:
 *  - template path: { template, data } — a template expands data into blocks
 *  - freeform path: { blocks } — blocks authored directly
 */
/** Current spec contract version. Bump on breaking spec changes; add a migration. */
export const SCHEMA_VERSION = 1;

export const SpecSchema = z
  .object({
    schemaVersion: z.number().int().positive().describe("Spec contract version. Defaults to the current version when omitted.").optional(),
    template: z.string().describe("Template name (e.g. `invoice`). Pair with `data`. Omit for the freeform `blocks` path.").optional(),
    data: z.unknown().describe("Template input, validated against the chosen template's own schema.").optional(),
    theme: z.string().describe("Theme name or path. Owns all aesthetics; defaults to `default`.").optional(),
    dir: z.enum(["ltr", "rtl"]).describe("Default text direction for the document.").optional(),
    lang: z.string().describe("BCP-47 language tag, e.g. `en` or `he`.").optional(),
    math: z.enum(["latex", "typst"]).describe("Default math syntax for `$…$` and math blocks. Defaults to `latex`.").optional(),
    blocks: z.array(BlockSchema).describe("The document body, for the freeform path.").optional(),
  })
  .strict()
  .describe("A document spec: provide either { template, data } or { blocks }.")
  .refine((s) => (s.template ? s.data !== undefined : Array.isArray(s.blocks)), {
    message: "Provide either { template, data } or { blocks }.",
  });

export type Spec = z.infer<typeof SpecSchema>;
