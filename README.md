# @agentsox/pdf-builder

[![npm](https://img.shields.io/npm/v/@agentsox/pdf-builder)](https://www.npmjs.com/package/@agentsox/pdf-builder)
[![CI](https://github.com/AgentsOX/pdf-builder/actions/workflows/ci.yml/badge.svg)](https://github.com/AgentsOX/pdf-builder/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/npm/l/@agentsox/pdf-builder)](./LICENSE)

Turn a YAML (or JSON) spec into a PDF. You describe what's on the page — headings, tables, totals, equations, charts — and it renders with [Typst](https://typst.app). The same spec always produces the same bytes.

It's built to be driven by an LLM agent: the agent writes one structured file, gets a PDF plus page images back, and can look at what it made and fix it. It's also just a CLI, and works fine by hand.

```
spec.yaml  →  pdf  →  PDF + page PNGs + a manifest
```

## Quick start

```bash
npm install -g @agentsox/pdf-builder
brew install typst                 # the render engine (other platforms below)
pdf new --template invoice > invoice.yaml
pdf build invoice.yaml --png
```

You get `invoice.pdf`, one PNG per page, and a manifest next to it.

## What you write

A spec is either data for a template, or a list of blocks. Both become the same block tree.

With a template you give the data; the template handles layout and arithmetic:

```yaml
template: invoice
data:
  client: { name: "Acme Co" }
  number: "INV-001"
  lineItems:
    - { description: "Setup", qty: 1, unitPrice: 1200 }
```

Totals and VAT are computed in code, never by you or the agent.

Freeform mode places blocks directly, for anything that isn't a template:

```yaml
blocks:
  - { type: heading, level: 1, text: "Q2 Report" }
  - { type: text, text: "Revenue grew, with $\\Delta = 72\\%$ QoQ." }
  - type: table
    header: ["Client", "MRR"]
    rows: [["Acme", "$1,200"], ["Globex", "$900"]]
```

The full set of blocks: `heading`, `text` (with inline `$…$` math), `list`, `table`, `kv`, `math`, `chart`, `image`, `columns`, `callout`, `spacer`, `pagebreak`, `header`, `footer`. It's deliberately small, so it fits in your head (or an agent's context window).

## What it handles

- **LaTeX math** like `\frac{d}{dx}`, `\int_a^b`, `\vec{F}`. It's the default; set `math: typst` for native Typst math. A copy of [mitex](https://github.com/mitex-rs/mitex) is bundled, so there's no first-run download and the output stays stable.
- **Right-to-left and mixed scripts.** Set `dir: rtl` and `lang` on the document or any block. Hebrew, English, and numbers on one line resolve correctly, and a Hebrew font (David Libre) ships in the package.
- **Charts** (bar, line, pie) via a bundled [cetz](https://github.com/cetz-package/cetz), drawn in your brand color.
- **Errors instead of bad PDFs.** Unknown keys, ragged tables, missing images, unavailable fonts — each comes back as `{ path, expected, got, fix }`. You won't get a wrong-but-plausible document.
- **A JSON Schema** (`pdf schema`) for validation and editor autocomplete on spec files.

Invoices, reports, recipes, CVs, cheat sheets, study notes — they're all just blocks.

## Theming

A theme owns the look: fonts, colors, the logo, callout styles. Specs never touch any of that, so an agent can't pick clashing colors or the wrong font. To brand it, extend a built-in theme and override what differs:

```yaml
# themes/acme.yaml
extends: default
fonts: { heading: "Poppins", body: "Inter" }
color: { primary: "#E11D48", text: "#111" }
logo: assets/acme-logo.svg
```

```bash
pdf theme init acme --out themes/acme.yaml                       # scaffold one
pdf build report.yaml --theme acme                               # found in ./themes
pdf build report.yaml --theme acme --font-path ./brand-fonts     # bring your own fonts
```

Switch `--theme` and the same spec re-renders in a different brand.

## Profiles

A profile bundles a theme with document defaults and reusable identity under a name like `business` or `academic`. Set it once and your specs carry only what changes between documents.

```yaml
# ~/.config/pdf-builder/profiles/business.yaml
name: business
theme: acme
defaults: { lang: he, dir: rtl }
template:
  invoice:
    seller: { name: "Acme Ltd", taxId: "514…" }
    currency: ILS
    vat: { mode: standard }
```

```bash
pdf onboard                 # set one up interactively
pdf profile list            # ★ marks the default
pdf profile use academic    # change the default
pdf build invoice.yaml --profile business
pdf build paper.yaml --no-profile
```

Now an invoice is just the client and line items; the profile fills in the seller, tax ID, brand, and VAT. When a spec and a profile disagree, the spec wins, and the manifest records which profile was used. Your business details live in one file instead of every spec you hand out.

## Examples

Each renders with `pdf build examples/<name>.yaml --png`:

| File | Shows |
|---|---|
| `invoice.yaml` | template path, computed totals |
| `hebrew-invoice.yaml` | RTL invoice, localized labels, LTR amounts |
| `bilingual.yaml` | mixed RTL/LTR on one line |
| `study-summary.yaml` | LaTeX math, callouts, columns |
| `physics-cheatsheet.yaml` | dense formula sheet |
| `recipe.yaml` | columns and lists |
| `report.yaml` | kv rows, a bar chart, tables, callouts |

## Install

```bash
npm install -g @agentsox/pdf-builder
```

You also need the Typst CLI on your PATH:

```bash
brew install typst          # macOS
cargo install typst-cli     # anywhere with Rust
winget install Typst.Typst  # Windows
```

It pins Typst `0.14.x`, since the engine version changes layout and output bytes. A mismatch warns; override with `PDF_BUILDER_ALLOW_TYPST_MISMATCH=1`.

## Commands

```
pdf build <file>     render a spec → PDF (+ PNGs, manifest)
pdf new              scaffold a starter spec
pdf templates        list templates
pdf themes           list built-in themes
pdf fonts            list font families Typst can see
pdf theme init       scaffold a brand theme
pdf schema           write the spec's JSON Schema
pdf guide            print the full playbook (see below)
```

`build` flags: `--theme <name|path>`, `--themes-dir <dir>`, `--font-path <dir>` (repeatable), `--out <dir>`, `--basename <name>`, `--png`, `--png-ppi <n>`, `--pdf-standard <a-2b|ua-1>`, `--strict`, `--json`, `--emit-typst`, `--emit-expanded-spec`.

## Determinism

The same spec produces a byte-identical PDF. Fonts are embedded, the creation date is pinned to zero, system fonts are ignored, and the Typst packages are vendored so nothing is fetched while rendering. Every build also writes a manifest:

```json
{ "schemaVersion": 1, "pages": 1, "blocks": 6, "theme": "default",
  "typstVersion": "0.14.2", "hashes": { "spec": "…", "typst": "…", "output": "…" } }
```

For archival output, use `--pdf-standard a-2b` (PDF/A) or `ua-1` (PDF/UA). If the result doesn't conform, the build fails instead of pretending it did.

## Using it from an agent

Run `pdf guide --json` once. It returns everything in a single call: the workflow, the block list, the available themes, templates, and profiles, the paths to write config to, a worked example, and the JSON Schema. An agent can onboard from that alone, with nothing pasted into its prompt.

The loop it's designed for: the person describes their brand in plain words ("we're Acme, teal, VAT-registered, logo's attached"); the agent writes the theme and profile files to the paths from `pdf guide`, runs `pdf profile use`, and every build after that is branded. Same idea for "summarise these files into one PDF" — the agent reads them, writes a freeform spec, builds it, looks at the PNGs, and adjusts. (`pdf onboard` is just the by-hand version of that setup.)

Every command accepts `--json` and prints one envelope, a discriminated union on `ok`, with a non-zero exit on failure:

```jsonc
// success
{ "ok": true, "pdfPath": "…", "pageImages": ["…"], "manifest": { }, "warnings": [ { "path", "expected", "got", "fix" } ] }

// failure
{ "ok": false, "error": { "kind": "validation", "message": "…", "issues": [ { "path", "expected", "got", "fix" } ] } }
```

`error.kind` is one of `validation`, `typst_missing`, `typst_compile`, `io`, `unknown`, so an agent branches on it without matching strings.

## Library

```ts
import { build } from "@agentsox/pdf-builder";

const result = await build(spec, { theme: "default", png: true });
// → { pdfPath, pageImages, manifest, warnings }
```

## License

MIT. See [LICENSE](./LICENSE).
