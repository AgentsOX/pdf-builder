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
});
