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
  /** Localizable labels — any subset; unset labels fall back to English. */
  labels: z
    .object({
      invoice: z.string(),
      billTo: z.string(),
      number: z.string(),
      date: z.string(),
      taxId: z.string(),
      description: z.string(),
      qty: z.string(),
      unit: z.string(),
      amount: z.string(),
      subtotal: z.string(),
      vat: z.string(),
      total: z.string(),
      exemptNote: z.string(),
    })
    .partial()
    .optional(),
});

export type InvoiceData = z.infer<typeof InvoiceData>;

const DEFAULT_LABELS = {
  invoice: "Invoice",
  billTo: "Bill to",
  number: "Invoice #",
  date: "Date",
  taxId: "Tax ID",
  description: "Description",
  qty: "Qty",
  unit: "Unit",
  amount: "Amount",
  subtotal: "Subtotal",
  vat: "VAT",
  total: "Total",
  exemptNote: "VAT-exempt dealer — invoice does not include VAT.",
} as const;

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

  const L = { ...DEFAULT_LABELS, ...(data.labels ?? {}) };
  const blocks: Block[] = [];

  blocks.push({ type: "header", text: data.seller.name, logo: data.seller.logo });
  blocks.push({ type: "heading", level: 1, text: L.invoice });

  const meta: { label: string; value: string }[] = [
    { label: L.number, value: data.number },
    { label: L.date, value: data.date },
  ];
  if (data.seller.taxId) meta.push({ label: L.taxId, value: data.seller.taxId });
  blocks.push({ type: "kv", rows: meta });

  blocks.push({ type: "heading", level: 3, text: L.billTo });
  const client = [data.client.name, data.client.address, data.client.email].filter(Boolean).join(" · ");
  blocks.push({ type: "text", text: client });

  blocks.push({ type: "spacer" });
  blocks.push({
    type: "table",
    header: [L.description, L.qty, L.unit, L.amount],
    align: ["left", "right", "right", "right"],
    rows: data.lineItems.map((it) => [
      it.description,
      String(it.qty),
      money(it.unitPrice, cur),
      money(it.qty * it.unitPrice, cur),
    ]),
  });

  const totals: { label: string; value: string; emphasis?: boolean }[] = [
    { label: L.subtotal, value: money(subtotal, cur) },
  ];
  if (data.vat.mode === "standard") {
    totals.push({ label: `${L.vat} (${(data.vat.rate * 100).toFixed(0)}%)`, value: money(vatAmount, cur) });
  }
  totals.push({ label: L.total, value: money(total, cur), emphasis: true });
  blocks.push({ type: "kv", rows: totals });

  if (data.vat.mode === "exempt") {
    blocks.push({ type: "spacer" });
    blocks.push({ type: "text", text: L.exemptNote });
  }
  if (data.notes) {
    blocks.push({ type: "callout", kind: "note", body: [{ type: "text", text: data.notes }] });
  }

  blocks.push({ type: "footer", text: data.seller.name, pageNumbers: true });
  return blocks;
}
