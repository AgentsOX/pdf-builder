import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getTheme } from "../src/theme/index.js";
import { parseSpec, SpecError } from "../src/spec/validate.js";
import { specJsonSchema } from "../src/spec/jsonschema.js";

const FIX = join("out", "test-fixtures");
mkdirSync(FIX, { recursive: true });

describe("external themes", () => {
  it("loads a theme file that extends a built-in and deep-merges overrides", () => {
    const file = join(FIX, "acme.yaml");
    writeFileSync(
      file,
      `extends: default
description: Acme brand
fonts: { heading: "Poppins" }
color: { primary: "#E11D48", callout: { tip: { border: "#E11D48" } } }
`,
    );
    const t = getTheme(file);
    expect(t.color.primary).toBe("#E11D48"); // overridden
    expect(t.fonts.heading).toBe("Poppins"); // overridden
    expect(t.fonts.body).toBe("Libertinus Serif"); // inherited from default
    expect(t.color.callout.tip.border).toBe("#E11D48"); // deep-merged
    expect(t.color.callout.definition.border).toBe("#6366f1"); // inherited
  });

  it("rejects an unknown key in a theme file (strict)", () => {
    const file = join(FIX, "bad.yaml");
    writeFileSync(file, `extends: default\ncolor: { primaryyy: "#000" }\n`);
    expect(() => getTheme(file)).toThrow(SpecError);
  });

  it("errors clearly on an unknown theme name", () => {
    expect(() => getTheme("does-not-exist")).toThrow(/Unknown theme/);
  });
});

describe("strict spec validation", () => {
  it("rejects an unknown block key with a did-you-mean suggestion", () => {
    try {
      parseSpec({ blocks: [{ type: "heading", text: "x", titl: "oops" }] });
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(SpecError);
      const all = (e as SpecError).issues.map((i) => i.fix).join(" ");
      expect(all).toContain("titl");
      expect(all).toContain("title"); // suggestion
    }
  });

  it("rejects an unknown top-level key", () => {
    expect(() => parseSpec({ blocks: [], thme: "default" })).toThrow(SpecError);
  });
});

describe("json schema export", () => {
  it("produces a JSON Schema object", () => {
    const s = specJsonSchema() as Record<string, unknown>;
    expect(typeof s).toBe("object");
    expect(JSON.stringify(s)).toContain("blocks");
  });
});
