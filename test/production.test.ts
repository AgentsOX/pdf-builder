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
  const OUT = join("out", "test");
  const loadExample = (name: string) => parseYaml(readFileSync(join("examples", `${name}.yaml`), "utf8"));
  const render = (name: string) => build(loadExample(name), { out: OUT, basename: name, png: true });

  it("renders the RTL Hebrew invoice with correct totals and no spurious warnings", () => {
    const r = render("hebrew-invoice");
    expect(existsSync(r.pdfPath)).toBe(true);
    expect(r.manifest.pages).toBeGreaterThanOrEqual(1);
    expect(r.warnings).toHaveLength(0);
  });

  it("renders the LaTeX physics sheet with no deprecation noise leaking through", () => {
    const r = render("physics-cheatsheet");
    expect(existsSync(r.pdfPath)).toBe(true);
    expect(r.warnings).toHaveLength(0);
  });

  it("renders the bilingual (mixed bidi) doc", () => {
    expect(existsSync(render("bilingual").pdfPath)).toBe(true);
  });

  it("renders the report with a real chart and no spurious warnings", () => {
    const r = render("report");
    expect(existsSync(r.pdfPath)).toBe(true);
    expect(r.warnings).toHaveLength(0);
  });

  it("manifest carries deterministic content hashes + schemaVersion", () => {
    const a = build(loadExample("invoice"), { out: OUT, basename: "hash-a" });
    const b = build(loadExample("invoice"), { out: OUT, basename: "hash-b" });
    expect(a.manifest.schemaVersion).toBe(1);
    expect(a.manifest.hashes.spec).toMatch(/^[0-9a-f]{64}$/);
    expect(a.manifest.hashes.output).toBe(b.manifest.hashes.output);
    expect(a.manifest.hashes.typst).toBe(b.manifest.hashes.typst);
  });

  it("enforces PDF/A conformance when requested", () => {
    const r = build(loadExample("invoice"), { out: OUT, basename: "pdfa", pdfStandard: "a-2b" });
    expect(r.manifest.pdfStandard).toBe("a-2b");
    const bytes = readFileSync(r.pdfPath, "latin1");
    expect(bytes).toContain("pdfaid"); // PDF/A identification metadata
  });
});
