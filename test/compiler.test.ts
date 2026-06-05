import { describe, it, expect } from "vitest";
import { compileDocument } from "../src/compiler/index.js";
import { escapeText, emitInline } from "../src/compiler/escape.js";
import { getTheme } from "../src/theme/index.js";
import type { Block } from "../src/spec/schema.js";

const theme = getTheme("default");
const compile = (blocks: Block[]) => compileDocument(blocks, theme);

describe("escaping", () => {
  it("escapes Typst special characters", () => {
    expect(escapeText("a # b * c")).toBe("a \\# b \\* c");
  });

  it("passes inline math through but escapes prose", () => {
    const out = emitInline("rate # is $x^2$ today");
    expect(out).toContain("$x^2$");
    expect(out).toContain("\\#");
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

  it("emits display math", () => {
    const { typst } = compile([{ type: "math", tex: "a^2 + b^2 = c^2" }]);
    expect(typst).toContain("$ a^2 + b^2 = c^2 $");
  });

  it("calls the callout helper", () => {
    const { typst } = compile([
      { type: "callout", kind: "definition", title: "Term", body: [{ type: "text", text: "x" }] },
    ]);
    expect(typst).toContain('#callout("definition"');
  });

  it("warns (does not fail) on charts in v1", () => {
    const { warnings } = compile([
      { type: "chart", kind: "bar", data: [{ label: "Jan", value: 1 }] },
    ]);
    expect(warnings.some((w) => String(w.got).includes("chart"))).toBe(true);
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
