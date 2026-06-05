import { z } from "zod";

/**
 * The block vocabulary — the closed set of "things a page can hold".
 * Every document, whether authored as a template or as raw blocks, compiles
 * to a tree of these. Keep it small enough to fit in an agent's context.
 */

export type CalloutKind = "definition" | "theorem" | "tip" | "note";
export type Align = "left" | "center" | "right";
export type Dir = "ltr" | "rtl";

export type Block =
  | { type: "heading"; level?: number; text: string }
  | { type: "text"; text: string; dir?: Dir }
  | { type: "list"; ordered?: boolean; items: string[] }
  | { type: "table"; header?: string[]; rows: string[][]; align?: Align[] }
  | { type: "kv"; rows: { label: string; value: string; emphasis?: boolean }[] }
  | { type: "math"; tex: string }
  | { type: "chart"; kind: "bar" | "line" | "pie"; title?: string; data: { label: string; value: number }[] }
  | { type: "image"; src: string; width?: string; alt?: string }
  | { type: "columns"; ratios?: number[]; children: Block[][] }
  | { type: "callout"; kind: CalloutKind; title?: string; body: Block[] }
  | { type: "spacer"; size?: string }
  | { type: "pagebreak" }
  | { type: "header"; text?: string; logo?: string }
  | { type: "footer"; text?: string; pageNumbers?: boolean };

const HeadingBlock = z.object({
  type: z.literal("heading"),
  level: z.number().int().min(1).max(4).optional(),
  text: z.string(),
});

const TextBlock = z.object({
  type: z.literal("text"),
  text: z.string(),
  dir: z.enum(["ltr", "rtl"]).optional(),
});

const ListBlock = z.object({
  type: z.literal("list"),
  ordered: z.boolean().optional(),
  items: z.array(z.string()).min(1),
});

const TableBlock = z.object({
  type: z.literal("table"),
  header: z.array(z.string()).optional(),
  rows: z.array(z.array(z.string())).min(1),
  align: z.array(z.enum(["left", "center", "right"])).optional(),
});

const KvBlock = z.object({
  type: z.literal("kv"),
  rows: z
    .array(
      z.object({
        label: z.string(),
        value: z.string(),
        emphasis: z.boolean().optional(),
      }),
    )
    .min(1),
});

const MathBlock = z.object({
  type: z.literal("math"),
  tex: z.string(),
});

const ChartBlock = z.object({
  type: z.literal("chart"),
  kind: z.enum(["bar", "line", "pie"]),
  title: z.string().optional(),
  data: z.array(z.object({ label: z.string(), value: z.number() })).min(1),
});

const ImageBlock = z.object({
  type: z.literal("image"),
  src: z.string(),
  width: z.string().optional(),
  alt: z.string().optional(),
});

const ColumnsBlock = z.object({
  type: z.literal("columns"),
  ratios: z.array(z.number()).optional(),
  children: z.array(z.array(z.lazy(() => BlockSchema))),
});

const CalloutBlock = z.object({
  type: z.literal("callout"),
  kind: z.enum(["definition", "theorem", "tip", "note"]),
  title: z.string().optional(),
  body: z.array(z.lazy(() => BlockSchema)),
});

const SpacerBlock = z.object({
  type: z.literal("spacer"),
  size: z.string().optional(),
});

const PageBreakBlock = z.object({ type: z.literal("pagebreak") });

const HeaderBlock = z.object({
  type: z.literal("header"),
  text: z.string().optional(),
  logo: z.string().optional(),
});

const FooterBlock = z.object({
  type: z.literal("footer"),
  text: z.string().optional(),
  pageNumbers: z.boolean().optional(),
});

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
export const SpecSchema = z
  .object({
    template: z.string().optional(),
    data: z.unknown().optional(),
    theme: z.string().optional(),
    dir: z.enum(["ltr", "rtl"]).optional(),
    lang: z.string().optional(),
    blocks: z.array(BlockSchema).optional(),
  })
  .refine((s) => (s.template ? s.data !== undefined : Array.isArray(s.blocks)), {
    message: "Provide either { template, data } or { blocks }.",
  });

export type Spec = z.infer<typeof SpecSchema>;
