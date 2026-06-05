import { z } from "zod";
import { SpecSchema } from "./schema.js";

/**
 * JSON Schema for the document spec — for agent validation and editor
 * autocomplete/linting on `.yaml`/`.json` spec files.
 */
export function specJsonSchema(): unknown {
  return z.toJSONSchema(SpecSchema, { target: "draft-2020-12", io: "input" });
}
