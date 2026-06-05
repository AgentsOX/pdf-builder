import { describe, it, expect, beforeAll } from "vitest";
import { resolve } from "node:path";
import { rmSync } from "node:fs";

// Hermetic global config dir (must be set before the profile modules read it).
const CONFIG = resolve("out", "test-config");
process.env.PDF_BUILDER_CONFIG_HOME = CONFIG;

const { writeProfile, loadProfile, listProfiles, getDefaultProfile, setDefaultProfile } = await import("../src/profile/load.js");
const { applyProfile } = await import("../src/profile/apply.js");
const { expandSpec } = await import("../src/pipeline.js");

const PROFILE_YAML = `
theme: default
out: invoices
defaults: { lang: he, dir: rtl, math: typst }
template:
  invoice:
    seller: { name: "ACME LTD", taxId: "514" }
    currency: ILS
    vat: { mode: standard }
`;

const invoiceSpec = (data: Record<string, unknown> = {}) => ({
  template: "invoice",
  data: {
    client: { name: "Client" },
    number: "1",
    date: "2026-01-01",
    lineItems: [{ description: "x", qty: 1, unitPrice: 100 }],
    ...data,
  },
});

beforeAll(() => {
  rmSync(CONFIG, { recursive: true, force: true });
  writeProfile("biz", PROFILE_YAML, { global: true });
});

describe("profiles", () => {
  it("loads, lists, and validates a profile", () => {
    expect(loadProfile("biz").profile.theme).toBe("default");
    expect(listProfiles().some((p) => p.name === "biz")).toBe(true);
  });

  it("sets and reads the default profile", () => {
    setDefaultProfile("biz", { global: true });
    expect(getDefaultProfile()).toBe("biz");
  });

  it("merges profile defaults + identity under the spec", () => {
    const loaded = loadProfile("biz");
    const app = applyProfile(invoiceSpec(), loaded) as { spec: Record<string, any> };
    expect(app.spec.lang).toBe("he"); // doc default from profile
    expect(app.spec.data.seller.name).toBe("ACME LTD"); // identity from profile
    expect(app.spec.data.currency).toBe("ILS");
  });

  it("lets the spec win over the profile", () => {
    const loaded = loadProfile("biz");
    const app = applyProfile(invoiceSpec({ currency: "USD" }), loaded) as { spec: Record<string, any> };
    expect(app.spec.data.currency).toBe("USD"); // spec overrides profile
  });

  it("expandSpec applies the profile end-to-end (theme + seller in blocks)", () => {
    const ex = expandSpec(invoiceSpec(), { profile: "biz" });
    expect(ex.profileName).toBe("biz");
    expect(ex.validated.lang).toBe("he");
    expect(ex.blocks.some((b) => b.type === "header" && b.text === "ACME LTD")).toBe(true);
  });
});
