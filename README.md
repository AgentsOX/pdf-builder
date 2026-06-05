# @agentsox/pdf-builder

An **agent-first CLI that turns a declarative document spec into a correct, branded PDF.**

Describe *what the page contains* — headings, tables, totals, equations, charts — and the tool renders it deterministically with [Typst](https://typst.app). It's built so an LLM agent can produce a single structured file and get a perfect PDF back, with a tight see-and-correct loop and no silent failures.

```
spec (YAML/JSON)  ──►  pdf-builder  ──►  PDF  (+ page images + manifest)
```

## Why

Most "agent makes a PDF" tools are imperative SDKs the model drives blind — so they truncate content, miscompute totals, and produce ugly output. pdf-builder inverts that:

- **One declarative spec, one render.** No multi-step imperative API to sequence wrong.
- **The agent owns content; the theme owns aesthetics.** It can't pick bad colors or fonts.
- **The engine computes numbers; the agent never does.** Invoice totals are derived in code.
- **No silent failure.** Invalid specs, bad math, and overflow surface as `{path → expected → got → fix}` — never a wrong-but-valid-looking PDF.
- **Deterministic.** Same spec → byte-stable PDF (fonts embedded, creation date pinned).
- **Renders back page images** so an agent can *see* its output and self-correct.

## The mental model

> A document is **data**. A template turns data into **blocks**. A theme **paints** blocks. The renderer is written once and never changes.

Two front doors, one block tree:

- **Template path** — emit domain data (invoice fields); a template expands it to blocks.
- **Freeform path** — emit `blocks[]` directly. Any document type, no template needed.

### Block vocabulary (closed, ~14)

`heading` · `text` (inline `$…$` math) · `list` · `table` · `kv` (label→value rows, e.g. totals) · `math` (display equation) · `chart` · `image` · `columns` · `callout` (definition/theorem/tip/note) · `spacer` · `pagebreak` · `header` · `footer`

## Capabilities

- **LaTeX math** — write standard LaTeX (`\frac{d}{dx}`, `\int_a^b`, `\vec{F}`); it's the default math syntax (set `math: typst` for native Typst math, or per-block `syntax`). Rendered via a vendored [mitex](https://github.com/mitex-rs/mitex), so it works **offline and deterministically** — no first-run download.
- **RTL & LTR** — set `dir: rtl` + `lang` on the document, or `dir` on any block. A Hebrew font (David Libre) is bundled.
- **Mixed bidi on one line** — Hebrew + English + numbers in the same line resolve correctly via Unicode bidi (e.g. `Total: 2,400 ₪ · Renewal: התחדשות`).
- **Real charts** — bar/line/pie via vendored [cetz](https://github.com/cetz-package/cetz) (offline), styled with your brand color.
- **Strict & loud** — unknown/typo'd keys, ragged tables, missing images/logos, and unavailable fonts are reported as `{path → expected → got → fix}`; nothing fails silently.
- **JSON Schema** — `pdf schema` emits a schema for agent validation and editor autocomplete on spec files.
- **Any document** — invoices, reports, recipes, cover letters, CVs, cheat sheets, study notes — all from the same block vocabulary.

## Profiles — one setup per context

A **profile** is a named context (business, academic, side-project) = a theme **+ document defaults + reusable identity**. Set it once; then your specs only carry the per-document content.

```bash
pdf onboard                 # interactive: name, brand color/logo, seller, default
pdf profile list            # ★ marks the default
pdf profile use academic    # switch your default
pdf build invoice.yaml                      # uses your default profile
pdf build invoice.yaml --profile business   # pick one explicitly
pdf build paper.yaml --no-profile           # ignore profiles entirely
```

A profile (in `~/.config/pdf-builder/profiles/` globally, or `./.pdfbuilder/` per project):

```yaml
name: business
theme: acme                       # a brand theme (colors/fonts/logo)
defaults: { lang: he, dir: rtl }
template:
  invoice:
    seller: { name: "Acme Ltd", taxId: "514…" }   # never repeated in a spec
    currency: ILS
    vat: { mode: standard }
```

Now an invoice spec is just the content — `client` + line items — and the profile fills the seller, tax ID, brand, language, and VAT. **The spec always wins on conflicts**, and the manifest records which profile rendered the PDF. Your private business identity lives in one profile, not in every spec you share.

## Branding — clone and make it yours (no code)

Define a theme file that inherits a built-in and overrides only what differs:

```yaml
# themes/acme.yaml
extends: default
fonts: { heading: "Poppins", body: "Inter" }
color: { primary: "#E11D48", text: "#111" }
logo: assets/acme-logo.svg        # relative to this file; shows in the header
```

```bash
pdf theme init acme --out themes/acme.yaml   # scaffold a starter
pdf build report.yaml --theme acme           # searched in ./themes
pdf build report.yaml --theme acme --font-path ./brand-fonts   # your own fonts
pdf fonts --font-path ./brand-fonts          # see which families Typst can use
```

The **same spec** renders in any brand just by switching `--theme` — colors, fonts, chart color, callouts, and logo all follow.

## Examples

Render any of these with `pdf build examples/<name>.yaml --png`:

| File | Shows |
|---|---|
| `invoice.yaml` | template path, computed totals |
| `hebrew-invoice.yaml` | **RTL** invoice, localized labels, LTR amounts |
| `bilingual.yaml` | **mixed RTL/LTR on one line** |
| `study-summary.yaml` | **LaTeX** math, callouts, columns |
| `physics-cheatsheet.yaml` | dense **LaTeX** formula sheet |
| `recipe.yaml` | columns, ordered/unordered lists |
| `report.yaml` | kv, real bar chart, tables, callouts |
| `themes/acme.yaml` | a brand theme (`--theme examples/themes/acme.yaml`) |

## Install

```bash
npm install -g @agentsox/pdf-builder
```

You also need the Typst CLI on your PATH:

```bash
brew install typst         # macOS
cargo install typst-cli    # any platform with Rust
winget install Typst.Typst # Windows
```

## Usage

```bash
pdf build invoice.yaml --theme default --png   # render → PDF + per-page PNGs + manifest
pdf new --template invoice                      # scaffold a starter spec
pdf templates                                   # list templates
pdf themes                                       # list built-in themes
pdf fonts [--font-path <dir>]                    # list available font families
pdf theme init <name> [--out <file>]            # scaffold a brand theme
pdf schema [--out <file>]                        # emit the spec's JSON Schema
```

`build` flags: `--theme <name|path>`, `--themes-dir <dir>`, `--font-path <dir>` (repeatable), `--out <dir>`, `--basename <name>`, `--png`, `--png-ppi <n>`, `--pdf-standard <a-2b|ua-1|…>`, `--strict`, `--json` (machine-readable result/errors), `--emit-typst`, `--emit-expanded-spec`.

## Determinism & provenance

- **Pinned engine** — requires Typst `0.14.x` (override with `PDF_BUILDER_ALLOW_TYPST_MISMATCH=1`). With `--creation-timestamp 0`, `--ignore-system-fonts`, bundled fonts, and vendored offline packages, the **same spec → byte-identical PDF**.
- **Manifest** — every build returns `{ schemaVersion, pages, blocks, theme, template, assets, typstVersion, pdfStandard?, hashes: { spec, typst, output } }`, so a render is reproducible and auditable.
- **Versioned contract** — `spec.schemaVersion` (current: 1); a newer version is rejected with an explicit upgrade message.
- **PDF standards** — `--pdf-standard a-2b` (PDF/A) or `ua-1` (PDF/UA); non-conformance fails loudly.

### Example spec (freeform)

```yaml
theme: default
blocks:
  - { type: heading, level: 1, text: "Q2 Report" }
  - { type: text, text: "Revenue grew, with $\\Delta = 72\\%$ QoQ." }
  - type: table
    header: ["Client", "MRR"]
    rows:
      - ["Acme", "$1,200"]
      - ["Globex", "$900"]
```

### Example spec (template)

```yaml
template: invoice
theme: default
data:
  seller: { name: "AgentsOX" }
  client: { name: "Acme Co" }
  number: "INV-001"
  date: "2026-06-05"
  currency: "USD"
  vat: { mode: "exempt" }
  lineItems:
    - { description: "FAQ bot setup", qty: 1, unitPrice: 1200 }
```

## For agents: the `--json` contract

`pdf build … --json` prints one stable envelope to stdout (a discriminated union on `ok`) and exits non-zero on failure — no prose to parse:

```jsonc
// success
{ "ok": true, "pdf_path": "...", "page_images": ["..."], "manifest": { ... }, "warnings": [ { "path","expected","got","fix" } ] }

// failure
{ "ok": false, "error": { "kind": "validation", "message": "...", "issues": [ { "path","expected","got","fix" } ] } }
```

`error.kind` is one of `validation · typst_missing · typst_compile · io · unknown`, so failures are branchable without string-matching. Without `--json`, build prints a short human summary and lists warnings on stderr.

**`--json` works on every command**, with the same envelope: `pdf profile list --json` → `{ ok, profiles, default }`, `pdf themes --json` → `{ ok, themes }`, `pdf fonts --json` → `{ ok, fonts }`, etc. Any failure is `{ ok: false, error: { kind, message } }` with a non-zero exit.

## Programmatic API

```ts
import { build } from "@agentsox/pdf-builder";

const result = await build(spec, { theme: "default", png: true });
// → { pdf_path, page_images[], manifest, warnings }
```

## License

MIT © AgentsOX
