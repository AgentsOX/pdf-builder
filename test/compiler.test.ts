import { describe, it, expect } from "vitest";
import { compileDocument } from "../src/compiler/index.js";
import { escapeText, emitInline } from "../src/compiler/escape.js";
import { getTheme } from "../src/theme/index.js";
import { resolveSpace } from "../src/theme/space.js";
import type { Block } from "../src/spec/schema.js";

const theme = getTheme("default");
const compile = (blocks: Block[]) => compileDocument(blocks, theme);

describe("escaping", () => {
  it("escapes Typst special characters", () => {
    expect(escapeText("a # b * c")).toBe("a \\# b \\* c");
  });

  it("passes inline math through (typst mode) but escapes prose", () => {
    const out = emitInline("rate # is $x^2$ today", "typst");
    expect(out).toContain("$x^2$");
    expect(out).toContain("\\#");
  });

  it("renders inline LaTeX via mitex in latex mode", () => {
    const out = emitInline("a $\\frac{1}{2}$ b", "latex");
    expect(out).toContain("#mi(");
    expect(out).toContain("\\frac{1}{2}");
  });
});

describe("compileDocument", () => {
  it("emits headings by level", () => {
    const { typst } = compile([
      { type: "heading", level: 1, text: "Title" },
      { type: "heading", level: 3, text: "Sub" },
    ]);
    expect(typst).toContain("= Title");
    expect(typst).toContain("=== Sub");
  });

  it("emits tables with a column count", () => {
    const { typst } = compile([{ type: "table", header: ["A", "B"], rows: [["1", "2"]] }]);
    expect(typst).toContain("#table(");
    expect(typst).toContain("columns: 2");
    expect(typst).toContain("table.header(");
  });

  it("bolds emphasized kv rows", () => {
    const { typst } = compile([
      { type: "kv", rows: [{ label: "Total", value: "$10", emphasis: true }] },
    ]);
    expect(typst).toContain('text(weight: "bold")');
  });

  it("emits LaTeX display math via mitex by default", () => {
    const { typst } = compile([{ type: "math", tex: "a^2 + b^2 = c^2" }]);
    expect(typst).toContain("#mitex(");
    expect(typst).toContain("a^2 + b^2 = c^2");
  });

  it("emits native Typst display math when math: typst", () => {
    const { typst } = compileDocument([{ type: "math", tex: "a^2" }], theme, { math: "typst" });
    expect(typst).toContain("$ a^2 $");
  });

  it("imports mitex only when LaTeX math is used", () => {
    expect(compile([{ type: "math", tex: "x" }]).typst).toContain("mitex");
    expect(compile([{ type: "text", text: "plain prose, no math" }]).typst).not.toContain("import");
  });

  it("wraps a block in a direction override (RTL)", () => {
    const { typst } = compile([{ type: "text", text: "שלום", dir: "rtl" }]);
    expect(typst).toContain("#text(dir: rtl)");
  });

  it("calls the callout helper", () => {
    const { typst } = compile([
      { type: "callout", kind: "definition", title: "Term", body: [{ type: "text", text: "x" }] },
    ]);
    expect(typst).toContain('#callout("definition"');
  });

  it("escapes special characters in a callout title (no raw string literal)", () => {
    const { typst } = compile([
      { type: "callout", kind: "note", title: 'A # "B"', body: [{ type: "text", text: "x" }] },
    ]);
    expect(typst).toContain("\\#"); // hash escaped as content, not raw
    expect(typst).not.toContain('"A # "B""'); // not splatted into a string literal
  });

  it("emits a real cetz chart and imports cetz", () => {
    const { typst } = compile([{ type: "chart", kind: "bar", data: [{ label: "Jan", value: 1 }] }]);
    expect(typst).toContain("cetz.canvas");
    expect(typst).toContain("columnchart");
    expect(typst).toContain('@preview/cetz');
  });

  it("flags a ragged table (row/column mismatch)", () => {
    const { warnings } = compile([
      { type: "table", header: ["A", "B"], rows: [["1", "2"], ["3"]] },
    ]);
    expect(warnings.some((w) => w.path.includes("rows[1]"))).toBe(true);
  });

  it("pulls header/footer into the page setup, out of the flow", () => {
    const { typst } = compile([
      { type: "header", text: "Top" },
      { type: "heading", text: "Body" },
      { type: "footer", pageNumbers: true },
    ]);
    expect(typst).toContain("header:");
    expect(typst).toContain("counter(page)");
  });

  it("caps runaway nesting with a warning", () => {
    let block: Block = { type: "text", text: "deep" };
    for (let i = 0; i < 12; i++) block = { type: "columns", children: [[block]] };
    const { warnings } = compile([block]);
    expect(warnings.some((w) => String(w.expected).includes("nesting"))).toBe(true);
  });
});

describe("inline links", () => {
  it("turns a safe [label](url) into a Typst link", () => {
    const out = emitInline("see [docs](https://example.com) now", "typst");
    expect(out).toContain('#link("https://example.com")[docs]');
  });

  it("allows mailto links", () => {
    expect(emitInline("[mail](mailto:a@b.com)", "typst")).toContain('#link("mailto:a@b.com")[mail]');
  });

  it("leaves an unsafe scheme as literal text (no link)", () => {
    const out = emitInline("[x](javascript:alert(1))", "typst");
    expect(out).not.toContain("#link(");
    expect(out).toContain("javascript"); // rendered as escaped text, not executed
  });

  it("keeps inline math working alongside links", () => {
    const out = emitInline("[a](https://x.io) and $x^2$", "typst");
    expect(out).toContain('#link("https://x.io")[a]');
    expect(out).toContain("$x^2$");
  });
});

describe("block alignment", () => {
  it("wraps a centered heading in #align(center)", () => {
    const { typst } = compile([{ type: "heading", level: 1, text: "Title", align: "center" }]);
    expect(typst).toContain("#align(center)[= Title]");
  });

  it("wraps right-aligned text", () => {
    const { typst } = compile([{ type: "text", text: "x", align: "right" }]);
    expect(typst).toContain("#align(right)[x]");
  });

  it("leaves unaligned blocks unwrapped (left default, byte-stable)", () => {
    const { typst } = compile([{ type: "text", text: "plain" }]);
    expect(typst).not.toContain("#align(");
  });
});

describe("heading letter-spacing (theme tracking token)", () => {
  it("adds tracking to the heading show-rule when the theme sets it", () => {
    const tracked = { ...getTheme("default"), heading: { tracking: "0.25em" } };
    const { typst } = compileDocument([{ type: "heading", level: 2, text: "Caps" }], tracked);
    expect(typst).toContain("tracking: 0.25em");
  });

  it("omits tracking by default", () => {
    const { typst } = compile([{ type: "heading", level: 2, text: "Caps" }]);
    expect(typst).not.toContain("tracking:");
  });
});

describe("inline emphasis", () => {
  it("renders **bold** as Typst strong", () => {
    expect(emitInline("a **strong** b", "typst")).toContain("*strong*");
  });

  it("renders _italic_ as Typst emph at word boundaries", () => {
    expect(emitInline("a _stressed_ b", "typst")).toContain("_stressed_");
  });

  it("leaves intraword underscores alone (snake_case, file_name)", () => {
    const out = emitInline("use my_snake_case name", "typst");
    // escaped underscores, not emph delimiters
    expect(out).toContain("my\\_snake\\_case");
  });

  it("composes with math and links", () => {
    expect(emitInline("**$x^2$**", "typst")).toContain("*$x^2$*");
    expect(emitInline("[**b**](https://x.io)", "typst")).toContain('#link("https://x.io")[*b*]');
  });
});

describe("sidebar block", () => {
  const cv = getTheme("cv");
  const withCv = (blocks: Block[]) => compileDocument(blocks, cv);

  it("renders a full-height background band and places the rail content", () => {
    const { typst } = withCv([
      { type: "sidebar", side: "left", children: [{ type: "heading", level: 2, text: "Contact" }] },
      { type: "heading", level: 1, text: "Name" },
    ]);
    expect(typst).toContain("background: box(width: 100%, height: 100%");
    expect(typst).toContain("place(left + top, rect(");
    expect(typst).toContain("#place(top + left");
    // The main heading stays in the flow, the rail heading is inside the placed box.
    expect(typst).toContain("= Name");
  });

  it("mirrors to the right edge", () => {
    const { typst } = withCv([
      { type: "sidebar", side: "right", children: [{ type: "text", text: "x" }] },
      { type: "text", text: "main" },
    ]);
    expect(typst).toContain("place(right + top, rect(");
    expect(typst).toContain("#place(top + right");
  });

  it("emits a compile-time overflow guard so a too-tall rail can't clip silently", () => {
    const { typst } = withCv([
      { type: "sidebar", children: [{ type: "text", text: "x" }] },
      { type: "text", text: "main" },
    ]);
    expect(typst).toContain("measure(");
    expect(typst).toContain("PDFBUILDER_SIDEBAR_OVERFLOW");
  });

  it("places the rail inset from the page edge (no bleed): dx pulls back by width", () => {
    const { typst } = withCv([
      { type: "sidebar", side: "left", children: [{ type: "text", text: "x" }] },
      { type: "text", text: "main" },
    ]);
    // dx(left) = edge - width - gutter, resolved from the cv theme's scale
    // (edge=xl=24pt, gutter=lg=12pt, width=5.6cm).
    expect(typst).toContain("dx: (24pt - 5.6cm - 12pt)");
  });

  it("does not set a band when no sidebar is present", () => {
    const { typst } = withCv([{ type: "heading", level: 1, text: "Plain" }]);
    expect(typst).not.toContain("background: box");
    expect(typst).not.toContain("#place(top +");
  });

  it("warns and inlines a nested sidebar instead of dropping it", () => {
    const { typst, warnings } = withCv([
      { type: "columns", children: [[{ type: "sidebar", children: [{ type: "text", text: "nested" }] }]] },
    ]);
    expect(warnings.some((w) => String(w.expected).includes("top-level sidebar"))).toBe(true);
    expect(typst).toContain("nested");
  });
});

describe("spacing scale (semantic roles → primitive steps)", () => {
  it("resolves each role to the length its scale step points at", () => {
    const sp = resolveSpace(getTheme("default"));
    // default: block→sm(8pt), gutter→lg(16pt), inset→sm(8pt), edge→xl(24pt)
    expect(sp.block).toBe("8pt");
    expect(sp.gutter).toBe("16pt");
    expect(sp.edge).toBe("24pt");
  });

  it("a column gutter is the resolved length, not a step name", () => {
    const { typst } = compile([
      { type: "columns", children: [[{ type: "text", text: "a" }], [{ type: "text", text: "b" }]] },
    ]);
    expect(typst).toContain("gutter: 16pt");
    expect(typst).not.toContain("gutter: lg");
  });
});

describe("heading rules + color (theme-driven)", () => {
  it("adds an underline rule on the levels the theme asks for", () => {
    const { typst } = compileDocument([{ type: "heading", level: 2, text: "Section" }], getTheme("cv"));
    expect(typst).toMatch(/heading\.where\(level: 2\): it => block[\s\S]*line\(length: 100%/);
  });

  it("uses theme-tunable rule tokens (weight/gap/color), not hardcoded magic numbers", () => {
    const tuned = {
      ...getTheme("default"),
      heading: { rule: { levels: [1], weight: "1.5pt", gap: "0.4em", color: "#ff0000" } },
    };
    const { typst } = compileDocument([{ type: "heading", level: 1, text: "T" }], tuned);
    expect(typst).toContain("#v(0.4em)");
    expect(typst).toContain('1.5pt + rgb("#ff0000")');
  });

  it("leaves default-theme headings unruled (backward compatible)", () => {
    const { typst } = compile([{ type: "heading", level: 2, text: "Section" }]);
    expect(typst).not.toContain("it => block(width: 100%");
  });
});
