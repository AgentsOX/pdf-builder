import { SpecError } from "./spec/validate.js";
import { TypstMissingError, TypstCompileError } from "./typst.js";

/** Machine-classifiable failure categories for the `--json` error envelope. */
export type ErrorKind = "validation" | "typst_missing" | "typst_compile" | "io" | "unknown";

/** A file that couldn't be read or parsed (vs. a structurally invalid spec). */
export class InputError extends Error {
  readonly kind = "io" as const;
}

/** Map a thrown error to a stable `ErrorKind` an agent can branch on. */
export function classifyError(e: unknown): ErrorKind {
  if (e instanceof SpecError) return "validation";
  if (e instanceof TypstMissingError) return "typst_missing";
  if (e instanceof TypstCompileError) return "typst_compile";
  if (e instanceof InputError) return "io";
  return "unknown";
}
