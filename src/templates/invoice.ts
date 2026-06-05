import { z } from "zod";
import type { Block } from "../spec/schema.js";

export const InvoiceData = z.object({
  seller: z.object({
    name: z.string(),
    email: z.string().optional(),
    phone: z.string().optional(),
    address: z.string().optional(),
    taxId: z.string().optional(),
    logo: z.string().optional(),
  }),
  client: z.object({
    name: z.string(),
    email: z.string().optional(),
    address: z.string().optional(),
  }),
  number: z.string(),
  date: z.string(),
  currency: z.string().default("USD"),
  vat: z
    .object({
      mode: z.enum(["exempt", "standard"]).default("exempt"),
      rate: z.number().default(0.18),
    })
    .default({ mode: "exempt", rate: 0.18 }),
  lineItems: z
    .array(
      z.object({
        description: z.string(),
        qty: z.number(),
        unitPrice: z.number(),
      }),
    )
    .min(1),
  notes: z.string().optional(),
});

export type InvoiceData = z.infer<typeof InvoiceData>;

const SYMBOLS: Record<string, string> = { USD: "$", EUR: "€", GBP: "£", ILS: "₪" };

function money(amount: number, currency: string): string {
  const sym = SYMBOLS[currency] ?? `${currency} `;
  return `${sym}${amount.toFixed(2)}`;
}

/**
 * Expand invoice data into blocks. ALL arithmetic (subtotal, VAT, total) is done
 * here in code — never by the agent — so the numbers on a legal document are
 * always correct.
 */
export function expandInvoice(data: InvoiceData): Block[] {
  const cur = data.currency;
  const subtotal = data.lineItems.reduce((s, it) => s + it.qty * it.unitPrice, 0);
  const vatAmount = data.vat.mode === "standard" ? subtotal * data.vat.rate : 0;
  const total = subtotal + vatAmount;

  const blocks: Block[] = [];

  blocks.push({ type: "header", text: data.seller.name, logo: data.seller.logo });
  blocks.push({ type: "heading", level: 1, text: "Invoice" });

  const meta: { label: string; value: string }[] = [
    { label: "Invoice #", value: data.number },
    { label: "Date", value: data.date },
  ];
  if (data.seller.taxId) meta.push({ label: "Tax ID", value: data.seller.taxId });
  blocks.push({ type: "kv", rows: meta });

  blocks.push({ type: "heading", level: 3, text: "Bill to" });
  const client = [data.client.name, data.client.address, data.client.email].filter(Boolean).join(" · ");
  blocks.push({ type: "text", text: client });

  blocks.push({ type: "spacer" });
  blocks.push({
    type: "table",
    header: ["Description", "Qty", "Unit", "Amount"],
    align: ["left", "right", "right", "right"],
    rows: data.lineItems.map((it) => [
      it.description,
      String(it.qty),
      money(it.unitPrice, cur),
      money(it.qty * it.unitPrice, cur),
    ]),
  });

  const totals: { label: string; value: string; emphasis?: boolean }[] = [
    { label: "Subtotal", value: money(subtotal, cur) },
  ];
  if (data.vat.mode === "standard") {
    totals.push({ label: `VAT (${(data.vat.rate * 100).toFixed(0)}%)`, value: money(vatAmount, cur) });
  }
  totals.push({ label: "Total", value: money(total, cur), emphasis: true });
  blocks.push({ type: "kv", rows: totals });

  if (data.vat.mode === "exempt") {
    blocks.push({ type: "spacer" });
    blocks.push({ type: "text", text: "VAT-exempt dealer — invoice does not include VAT." });
  }
  if (data.notes) {
    blocks.push({ type: "callout", kind: "note", body: [{ type: "text", text: data.notes }] });
  }

  blocks.push({ type: "footer", text: data.seller.name, pageNumbers: true });
  return blocks;
}
