import { stringify as toYaml } from "yaml";
import type { Profile } from "./schema.js";

export interface ProfileAnswers {
  name: string;
  kind: "business" | "academic" | "personal";
  theme?: string; // brand theme name to reference
  lang?: string;
  dir?: "ltr" | "rtl";
  math?: "latex" | "typst";
  out?: string;
  seller?: { name?: string; email?: string; taxId?: string; address?: string };
  currency?: string;
  vatMode?: "exempt" | "standard";
}

/** Build a Profile object from onboarding answers. */
export function profileObject(a: ProfileAnswers): Profile {
  const p: Profile = { name: a.name, description: `${a.kind} profile` };
  if (a.theme) p.theme = a.theme;
  if (a.out) p.out = a.out;

  const defaults: NonNullable<Profile["defaults"]> = {};
  if (a.lang) defaults.lang = a.lang;
  if (a.dir) defaults.dir = a.dir;
  if (a.math) defaults.math = a.math;
  if (Object.keys(defaults).length) p.defaults = defaults;

  if (a.kind === "business" && (a.seller || a.currency || a.vatMode)) {
    const invoice: Record<string, unknown> = {};
    if (a.seller && Object.values(a.seller).some(Boolean)) {
      invoice.seller = Object.fromEntries(Object.entries(a.seller).filter(([, v]) => v));
    }
    if (a.currency) invoice.currency = a.currency;
    if (a.vatMode) invoice.vat = { mode: a.vatMode };
    if (Object.keys(invoice).length) p.template = { invoice };
  }
  return p;
}

export function profileYaml(a: ProfileAnswers): string {
  return toYaml(profileObject(a));
}

export interface BrandAnswers {
  name: string;
  primary?: string;
  text?: string;
  logo?: string;
  heading?: string;
  body?: string;
}

/** Build a brand theme file (extends default, overrides only what's given). */
export function brandThemeYaml(b: BrandAnswers): string {
  const theme: Record<string, unknown> = { extends: "default", description: `${b.name} brand` };
  if (b.logo) theme.logo = b.logo;
  const fonts: Record<string, string> = {};
  if (b.heading) fonts.heading = b.heading;
  if (b.body) fonts.body = b.body;
  if (Object.keys(fonts).length) theme.fonts = fonts;
  const color: Record<string, string> = {};
  if (b.primary) color.primary = b.primary;
  if (b.text) color.text = b.text;
  if (Object.keys(color).length) theme.color = color;
  return toYaml(theme);
}

/** Commented starter for `pdf profile init <name>` (meant to be hand-edited). */
export function profileInitTemplate(name: string): string {
  return `# Profile: ${name}
# A profile = theme + document defaults + reusable identity for a context.
# Use:           pdf build invoice.yaml --profile ${name}
# Make default:  pdf profile use ${name}

# theme: ${name}              # a brand theme (see: pdf theme init); omit for the plain default
out: out                      # default output directory
# pdfStandard: a-2b           # enforce PDF/A on every render

defaults:
  lang: en
  dir: ltr
  math: latex

# Reusable identity, deep-merged UNDER each spec's data (the spec still wins):
template:
  invoice:
    seller:
      name: Your Company
      email: you@example.com
      # taxId: "..."
      # address: "..."
    currency: USD
    vat: { mode: exempt }
`;
}
