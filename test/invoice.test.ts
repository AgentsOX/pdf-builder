import { describe, it, expect } from "vitest";
import { InvoiceData, expandInvoice } from "../src/templates/invoice.js";
import type { Block } from "../src/spec/schema.js";

function totalsRow(blocks: Block[]): { label: string; value: string; emphasis?: boolean }[] {
  const kvs = blocks.filter((b): b is Extract<Block, { type: "kv" }> => b.type === "kv");
  return kvs[kvs.length - 1].rows;
}

describe("invoice template", () => {
  const base = {
    seller: { name: "Me" },
    client: { name: "You" },
    number: "INV-1",
    date: "2026-01-01",
    currency: "USD",
    lineItems: [
      { description: "A", qty: 2, unitPrice: 100 },
      { description: "B", qty: 1, unitPrice: 50 },
    ],
  };

  it("computes subtotal/total with no VAT for exempt dealers", () => {
    const data = InvoiceData.parse({ ...base, vat: { mode: "exempt" } });
    const rows = totalsRow(expandInvoice(data));
    expect(rows.find((r) => r.label === "Subtotal")?.value).toBe("$250.00");
    expect(rows.find((r) => r.label.startsWith("VAT"))).toBeUndefined();
    expect(rows.find((r) => r.label === "Total")?.value).toBe("$250.00");
  });

  it("computes VAT for standard dealers", () => {
    const data = InvoiceData.parse({ ...base, vat: { mode: "standard", rate: 0.18 } });
    const rows = totalsRow(expandInvoice(data));
    expect(rows.find((r) => r.label.startsWith("VAT"))?.value).toBe("$45.00");
    expect(rows.find((r) => r.label === "Total")?.value).toBe("$295.00");
  });

  it("marks the total row as emphasized", () => {
    const data = InvoiceData.parse({ ...base, vat: { mode: "exempt" } });
    const rows = totalsRow(expandInvoice(data));
    expect(rows.find((r) => r.label === "Total")?.emphasis).toBe(true);
  });

  it("includes header and footer furniture", () => {
    const data = InvoiceData.parse({ ...base, vat: { mode: "exempt" } });
    const blocks = expandInvoice(data);
    expect(blocks.some((b) => b.type === "header")).toBe(true);
    expect(blocks.some((b) => b.type === "footer")).toBe(true);
  });
});
