import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { filterTypstStderr, hasTypst } from "../src/typst.js";
import { InvoiceData, expandInvoice } from "../src/templates/invoice.js";
import { build } from "../src/pipeline.js";
import type { Block } from "../src/spec/schema.js";

describe("stderr filtering", () => {
  it("drops package + deprecation noise but keeps real warnings/errors", () => {
    const stderr = [
      "warning: `diff` is deprecated, use `partial` instead",
      "  ┌─ @preview/mitex:0.2.5/lib.typ:1:1",
      "warning: something the author can fix",
      "error: real failure",
    ].join("\n");
    const out = filterTypstStderr(stderr);
    expect(out).not.toContain("is deprecated");
    expect(out).not.toContain("@preview");
    expect(out).toContain("something the author can fix");
    expect(out).toContain("error: real failure");
  });
});

describe("invoice label localization", () => {
  const base = {
    seller: { name: "מוכר" },
    client: { name: "לקוח" },
    number: "1",
    date: "2026-01-01",
    currency: "ILS",
    lineItems: [{ description: "שירות", qty: 1, unitPrice: 100 }],
  };

  it("applies a partial label override, English for the rest", () => {
    const data = InvoiceData.parse({ ...base, labels: { total: "סה״כ", subtotal: "ביניים" } });
    const blocks = expandInvoice(data);
    const kvs = blocks.filter((b): b is Extract<Block, { type: "kv" }> => b.type === "kv");
    const totals = kvs[kvs.length - 1].rows;
    expect(totals.find((r) => r.value.includes("100"))).toBeDefined();
    expect(totals.some((r) => r.label === "סה״כ")).toBe(true); // overridden
    expect(totals.some((r) => r.label === "ביניים")).toBe(true); // overridden
    // header heading uses the default English "Invoice" since not overridden
    expect(blocks.some((b) => b.type === "heading" && b.text === "Invoice")).toBe(true);
  });
});

describe.skipIf(!hasTypst())("production renders (showcase)", () => {
  const render = (name: string) =>
    build(parseYaml(readFileSync(join("examples", `${name}.yaml`), "utf8")), {
      out: join("out", "test"),
      basename: name,
      png: true,
    });

  it("renders the RTL Hebrew invoice with correct totals and no spurious warnings", () => {
    const r = render("hebrew-invoice");
    expect(existsSync(r.pdf_path)).toBe(true);
    expect(r.manifest.pages).toBeGreaterThanOrEqual(1);
    expect(r.warnings).toHaveLength(0);
  });

  it("renders the LaTeX physics sheet with no deprecation noise leaking through", () => {
    const r = render("physics-cheatsheet");
    expect(existsSync(r.pdf_path)).toBe(true);
    expect(r.warnings).toHaveLength(0);
  });

  it("renders the bilingual (mixed bidi) doc", () => {
    expect(existsSync(render("bilingual").pdf_path)).toBe(true);
  });

  it("warns honestly that charts are stubbed (no silent failure)", () => {
    const r = render("report");
    expect(r.warnings.some((w) => String(w.got).includes("chart"))).toBe(true);
  });
});
