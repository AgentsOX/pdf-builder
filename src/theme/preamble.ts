import type { Block, MathSyntax } from "../spec/schema.js";
import { emitInline, rgb, strLit } from "../compiler/escape.js";
import type { ThemeTokens } from "./types.js";
import { resolveSpace, type ResolvedSpace } from "./space.js";

type HeaderBlock = Extract<Block, { type: "header" }>;
type FooterBlock = Extract<Block, { type: "footer" }>;

/** Bundled Hebrew fallback face, appended to every font list for RTL coverage. */
const HEBREW_FALLBACK = "David Libre";

/** Heading-rule styling defaults, used when a theme's `heading.rule` omits them. */
const DEFAULT_RULE_WEIGHT = "0.6pt";
const DEFAULT_RULE_GAP = "0.15em";

/** A Typst font tuple with the Hebrew fallback appended. */
const fontList = (primary: string) => `(${strLit(primary)}, ${strLit(HEBREW_FALLBACK)})`;

function headerContent(t: ThemeTokens, h: HeaderBlock, math: MathSyntax): string {
  const bits: string[] = [];
  const logo = h.logo ?? t.logo;
  if (logo) bits.push(`image(${strLit(logo)}, height: 1.2em)`);
  if (h.text) bits.push(`text(weight: "bold")[${emitInline(h.text, math)}]`);
  const inner = bits.length === 2 ? `#${bits[0]} #h(1fr) #${bits[1]}` : bits.length ? `#${bits[0]}` : "";
  return `[#set text(size: ${t.size.small}, fill: ${rgb(t.color.muted)})\n${inner}\n#v(0.2em)\n#line(length: 100%, stroke: ${t.stroke.hairline} + ${rgb(t.color.border)})]`;
}

function footerContent(t: ThemeTokens, f: FooterBlock, math: MathSyntax): string {
  const left = f.text ? emitInline(f.text, math) : "";
  const right = f.pageNumbers ? `#context counter(page).display()` : "";
  const grid = `#grid(columns: (1fr, auto), [${left}], [${right}])`;
  return `[#set text(size: ${t.size.small}, fill: ${rgb(t.color.muted)})\n${grid}]`;
}

/**
 * Build the Typst preamble for a theme: page geometry, text defaults, heading
 * show-rules, table styling, and the `#callout` helper the compiler calls.
 * Page-level header/footer blocks (collected by the compiler) are injected here.
 */
/** A full-height colored rail, drawn as a page background so it repeats per page. */
export interface SidebarSetup {
  side: "left" | "right";
  width: string;
  fill: string;
}

export function themePreamble(
  t: ThemeTokens,
  page: {
    header?: HeaderBlock;
    footer?: FooterBlock;
    dir?: string;
    lang?: string;
    math?: MathSyntax;
    sidebar?: SidebarSetup;
    /** Resolved spacing; the compiler passes its own so it isn't resolved twice. */
    space?: ResolvedSpace;
  },
): string {
  const dir = page.dir ?? t.dir;
  const lang = page.lang ?? t.lang;
  const math = page.math ?? "latex";
  const sp = page.space ?? resolveSpace(t);

  const callouts = (Object.keys(t.color.callout) as (keyof typeof t.color.callout)[])
    .map((k) => `  ${k}: (bg: ${rgb(t.color.callout[k].bg)}, border: ${rgb(t.color.callout[k].border)}),`)
    .join("\n");

  // A sidebar takes over page geometry: the rail is a full-bleed background band
  // (so it repeats on every page) and the main flow gets a wide margin on the
  // rail's side, keeping it clear of the band. The rail content is `place`d into
  // the band by the compiler. Works on either edge.
  const sidebar = page.sidebar;
  const sideKey = sidebar?.side === "right" ? "right" : "left";
  const otherKey = sideKey === "left" ? "right" : "left";
  // The main column clears the band by `width` and is separated from it by the
  // `gutter`; the other three sides use the `edge` safe-area padding so the frame
  // is even and nothing sits against a fill.
  const sidebarMargin = sidebar
    ? `(${sideKey}: ${sidebar.width} + ${sp.gutter}, ${otherKey}: ${sp.edge}, top: ${sp.edge}, bottom: ${sp.edge})`
    : t.page.margin;
  const pageArgs = [
    `paper: "${t.page.paper}"`,
    `margin: ${sidebarMargin}`,
    // Wrap the band in a full-page box so its `height: 100%` resolves on every
    // page (a bare `place`d partial-width rect collapses past page 1).
    sidebar ? `background: box(width: 100%, height: 100%, place(${sideKey} + top, rect(width: ${sidebar.width}, height: 100%, fill: ${rgb(sidebar.fill)})))` : null,
    page.header ? `header: ${headerContent(t, page.header, math)}` : null,
    page.footer ? `footer: ${footerContent(t, page.footer, math)}` : null,
  ]
    .filter(Boolean)
    .join(",\n  ");

  // Headings: optional accent color (defaults to body text) and optional
  // underline rules on chosen levels. Both default off, so plain themes are
  // byte-identical to before.
  const headingColor = t.heading?.color ?? t.color.text;
  const headingTracking = t.heading?.tracking ? `, tracking: ${t.heading.tracking}` : "";
  const ruleCfg = t.heading?.rule;
  const ruleLevels = ruleCfg?.levels ?? [];
  const ruleWeight = ruleCfg?.weight ?? DEFAULT_RULE_WEIGHT;
  const ruleGap = ruleCfg?.gap ?? DEFAULT_RULE_GAP;
  const ruleColor = ruleCfg?.color ?? t.color.border;
  const headingRules = ([1, 2, 3, 4] as const)
    .map((lvl) => {
      const size = `#show heading.where(level: ${lvl}): set text(size: ${t.size[`h${lvl}` as "h1" | "h2" | "h3" | "h4"]})`;
      if (!ruleLevels.includes(lvl)) return size;
      const rule = `#show heading.where(level: ${lvl}): it => block(width: 100%, below: ${sp.block})[#it #v(${ruleGap}) #line(length: 100%, stroke: ${ruleWeight} + ${rgb(ruleColor)})]`;
      return `${size}\n${rule}`;
    })
    .join("\n");

  return `// Generated by @agentsox/pdf-builder — do not edit by hand.
#set page(
  ${pageArgs}
)
#set text(
  font: ${fontList(t.fonts.body)},
  size: ${t.size.base},
  fill: ${rgb(t.color.text)},
  lang: "${lang}",
  dir: ${dir},
)
#set par(justify: true, leading: ${sp.line})
#set heading(numbering: none)
#show heading: set text(font: ${fontList(t.fonts.heading)}, fill: ${rgb(headingColor)}${headingTracking})
${headingRules}
#show raw: set text(font: ${fontList(t.fonts.mono)})
#set table(stroke: ${t.stroke.hairline} + ${rgb(t.color.border)}, inset: ${sp.inset}, align: left + horizon)
#show table.cell.where(y: 0): set text(weight: "bold")

#let _callout_colors = (
${callouts}
)
#let callout(kind, title, body) = block(
  fill: _callout_colors.at(kind).bg,
  stroke: (left: ${t.stroke.accent} + _callout_colors.at(kind).border),
  inset: ${sp.inset},
  radius: ${t.stroke.radius},
  width: 100%,
)[
  #if title != none [#text(weight: "bold", fill: _callout_colors.at(kind).border)[#title]\\ ]
  #body
]
`;
}
