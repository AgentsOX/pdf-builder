import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { build } from "../src/pipeline.js";
import { hasTypst } from "../src/typst.js";

const OUT = join("out", "test");
const loadExample = (name: string) => parseYaml(readFileSync(join("examples", name), "utf8"));

// These need the Typst binary; skipped (green) when it isn't installed.
describe.skipIf(!hasTypst())("end-to-end render", () => {
  it("renders the invoice example to a real PDF + PNG with a correct manifest", () => {
    const r = build(loadExample("invoice.yaml"), { out: OUT, basename: "invoice", png: true });
    expect(existsSync(r.pdf_path)).toBe(true);
    expect(r.page_images.length).toBeGreaterThan(0);
    expect(r.manifest.template).toBe("invoice");
    expect(r.manifest.pages).toBeGreaterThanOrEqual(1);
  });

  it("renders the study-summary (math + callouts) freeform example", () => {
    const r = build(loadExample("study-summary.yaml"), { out: OUT, basename: "study", png: true });
    expect(existsSync(r.pdf_path)).toBe(true);
    expect(r.manifest.theme).toBe("study");
  });

  it("is deterministic: same spec → byte-identical PDF", () => {
    const spec = loadExample("invoice.yaml");
    const a = build(spec, { out: OUT, basename: "det-a" });
    const b = build(spec, { out: OUT, basename: "det-b" });
    expect(readFileSync(a.pdf_path)).toEqual(readFileSync(b.pdf_path));
  });
});
