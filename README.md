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
pdf themes                                       # list themes
```

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

## Programmatic API

```ts
import { build } from "@agentsox/pdf-builder";

const result = await build(spec, { theme: "default", png: true });
// → { pdf_path, page_images[], manifest, warnings }
```

## License

MIT © AgentsOX
