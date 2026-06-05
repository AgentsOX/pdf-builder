import { describe, it, expect } from "vitest";
import { expandSpec, renderTypst } from "../src/pipeline.js";
import { SpecError } from "../src/spec/validate.js";

describe("expandSpec / renderTypst (no engine)", () => {
  it("defaults schemaVersion to 1", () => {
    const ex = expandSpec({ blocks: [{ type: "text", text: "hi" }] });
    expect(ex.validated.schemaVersion).toBe(1);
  });

  it("rejects a newer, unknown schemaVersion with a fixable error", () => {
    try {
      expandSpec({ schemaVersion: 99, blocks: [{ type: "text", text: "x" }] });
      expect.unreachable("should throw");
    } catch (e) {
      expect(e).toBeInstanceOf(SpecError);
      expect((e as SpecError).issues[0].path).toBe("schemaVersion");
    }
  });

  it("expands a template to a block tree", () => {
    const ex = expandSpec({
      template: "invoice",
      data: {
        seller: { name: "x" },
        client: { name: "y" },
        number: "1",
        date: "2026-01-01",
        lineItems: [{ description: "a", qty: 1, unitPrice: 1 }],
      },
    });
    expect(ex.templateName).toBe("invoice");
    expect(ex.blocks.length).toBeGreaterThan(0);
  });

  it("renders Typst source and collects declared assets without a binary", () => {
    const r = renderTypst({ blocks: [{ type: "image", src: "logo.png" }] });
    expect(r.typst).toContain("image(");
    expect(r.assets).toContain("logo.png");
  });
});
