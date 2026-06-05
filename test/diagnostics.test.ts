import { describe, it, expect } from "vitest";
import { classifyError, InputError } from "../src/diagnostics.js";
import { SpecError } from "../src/spec/validate.js";
import { TypstMissingError, TypstCompileError } from "../src/typst.js";

describe("error classification (the --json error.kind contract)", () => {
  it("maps each error type to a stable kind", () => {
    expect(classifyError(new SpecError([]))).toBe("validation");
    expect(classifyError(new TypstMissingError())).toBe("typst_missing");
    expect(classifyError(new TypstCompileError("boom"))).toBe("typst_compile");
    expect(classifyError(new InputError("bad file"))).toBe("io");
    expect(classifyError(new Error("???"))).toBe("unknown");
  });
});
