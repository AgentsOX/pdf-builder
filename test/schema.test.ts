import { describe, it, expect } from "vitest";
import { parseSpec, SpecError } from "../src/spec/validate.js";

describe("spec validation", () => {
  it("accepts a freeform blocks spec", () => {
    const spec = parseSpec({ blocks: [{ type: "heading", text: "Hi" }] });
    expect(spec.blocks).toHaveLength(1);
  });

  it("accepts a template spec", () => {
    const spec = parseSpec({ template: "invoice", data: { anything: true } });
    expect(spec.template).toBe("invoice");
  });

  it("rejects a spec with neither blocks nor template+data", () => {
    expect(() => parseSpec({})).toThrow(SpecError);
  });

  it("rejects an unknown block type with a fixable issue", () => {
    try {
      parseSpec({ blocks: [{ type: "nope", text: "x" }] });
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(SpecError);
      const issues = (e as SpecError).issues;
      expect(issues.length).toBeGreaterThan(0);
      for (const i of issues) {
        expect(i).toHaveProperty("path");
        expect(i).toHaveProperty("expected");
        expect(i).toHaveProperty("got");
        expect(i).toHaveProperty("fix");
      }
    }
  });

  it("reports the path of a bad nested field", () => {
    try {
      parseSpec({ blocks: [{ type: "heading", level: 9, text: "x" }] });
      expect.unreachable("should have thrown");
    } catch (e) {
      const issues = (e as SpecError).issues;
      expect(issues.some((i) => i.path.includes("level"))).toBe(true);
    }
  });

  const issuesOf = (input: unknown) => {
    try {
      parseSpec(input);
      throw new Error("expected SpecError");
    } catch (e) {
      if (!(e instanceof SpecError)) throw e;
      return e.issues;
    }
  };

  it("suggests the closest value for a typo'd enum", () => {
    const kind = issuesOf({ blocks: [{ type: "chart", kind: "barr", data: [{ label: "a", value: 1 }] }] }).find((i) =>
      i.path.endsWith("kind"),
    );
    expect(kind?.expected).toContain("bar");
    expect(kind?.fix).toContain('"bar"');
  });

  it("suggests the closest block type for a typo", () => {
    const t = issuesOf({ blocks: [{ type: "tabel", rows: [["x"]] }] }).find((i) => i.path.endsWith("type"));
    expect(t?.fix).toContain('"table"');
  });

  it("names a missing required field clearly", () => {
    const issues = issuesOf({ blocks: [{ type: "table" }] });
    expect(issues.some((i) => /Add the required field/.test(i.fix) && i.path.endsWith("rows"))).toBe(true);
  });

  it("clips an oversized got value to a summary string", () => {
    const big = Object.fromEntries(Array.from({ length: 40 }, (_, n) => [`f${n}`, `v${n}`]));
    const got = issuesOf({ blocks: [{ type: "text", text: big }] }).find((i) => i.path.endsWith("text"))?.got;
    expect(typeof got).toBe("string");
  });
});
