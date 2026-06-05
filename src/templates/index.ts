import { z } from "zod";
import type { Block } from "../spec/schema.js";
import { InvoiceData, expandInvoice } from "./invoice.js";

/**
 * A template turns validated domain data into a block tree. Its schema guards
 * the agent's input; its expand() owns all layout AND all computation (totals,
 * VAT) so the agent never produces a number.
 */
export interface Template<T = unknown> {
  name: string;
  description: string;
  schema: z.ZodType<T>;
  expand: (data: T) => Block[];
}

const TEMPLATES: Record<string, Template<any>> = {
  invoice: {
    name: "invoice",
    description: "Invoice with computed subtotal/VAT/total (exempt or standard).",
    schema: InvoiceData,
    expand: expandInvoice,
  },
};

export function getTemplate(name: string): Template {
  const t = TEMPLATES[name];
  if (!t) {
    throw new Error(`Unknown template "${name}". Available: ${Object.keys(TEMPLATES).join(", ")}.`);
  }
  return t;
}

export function listTemplates(): { name: string; description: string }[] {
  return Object.values(TEMPLATES).map((t) => ({ name: t.name, description: t.description }));
}
