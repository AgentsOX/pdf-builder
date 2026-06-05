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

/** Commented starter for `pdf theme init <name>` (a brand theme to hand-edit). */
export function themeInitTemplate(name: string): string {
  return `# Theme: ${name}
# Inherit a built-in (default | study) and override only what you need.
# Run:  pdf build doc.yaml --theme ${name}   (searched in ./themes by default)
extends: default
description: "${name} brand theme"

# logo: assets/${name}-logo.svg     # path is relative to THIS file; shows in the header

fonts:
  heading: "Space Grotesk"          # any family on your --font-path (see: pdf fonts)
  body: "Inter"

color:
  primary: "#2563eb"                # accents, chart fill, callout borders
  text: "#111111"
  # callout: { definition: { bg: "#eef2ff", border: "#6366f1" } }

# page: { paper: "us-letter", margin: "2cm" }
`;
}

/**
 * Commented starter for `pdf profile init <name>` — also the non-interactive
 * on-ramp for scripts/agents. All fields are optional; delete what you don't need.
 */
export function profileInitTemplate(name: string): string {
  return `# Profile "${name}" — a context (business / academic / side-project).
# A profile = theme + document defaults + reusable identity.
# Apply:        pdf build <spec>.yaml --profile ${name}
# Make default: pdf profile use ${name}

# theme: ${name}            # brand theme (see: pdf theme init); omit for plain "default"
out: out                    # default output directory
# pdfStandard: a-2b         # a-1b | a-2b | a-3b | a-4 | ua-1 — enforce on every render

defaults:
  lang: en                  # any language code; he/ar/fa imply RTL
  dir: ltr                  # ltr | rtl
  math: latex               # latex | typst

# Reusable identity, deep-merged UNDER each spec's data (the spec always wins):
template:
  invoice:
    seller:
      name: Your Company
      email: you@example.com
      # taxId: "..."
      # address: "..."
    currency: USD
    vat: { mode: exempt }   # exempt | standard
`;
}
