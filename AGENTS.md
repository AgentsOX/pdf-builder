# AGENTS.md — @agentsox/pdf-builder

Rules for any agent working in this repo.

## What this is

An agent-first CLI: a declarative document **spec** (YAML/JSON) → a deterministic **PDF** via Typst.
This is its **own git repository**, added to the AgentsOX monorepo as a **git submodule**, and is
**published as open source** (`@agentsox/pdf-builder`, MIT).

## The one principle

**Split the fuzzy part (agent) from the exact part (deterministic engine). Never blur them.**

```
fuzzy input → [agent] → validated spec → [engine] → PDF
              drafts,    zod-checked      renders exactly: numbers, layout, brand
              extracts                    NEVER guesses
```

- The agent does intake/drafting/extraction. It never touches pixels, never sets colors/fonts,
  never computes totals.
- The engine renders deterministically. It computes numbers (VAT, totals) and owns all aesthetics
  (the theme). It never invents a value.

## Hard rules (these keep open-sourcing safe)

- **Self-contained.** No import, symlink, or file-read may reach outside this repo's tree. Do NOT
  read from the parent monorepo (`../../branding`, `../../products`, etc.). Brand values are copied
  into theme modules as plain values, never imported.
- **Public-npm deps only.** Currently `zod` + `yaml`. No `@agentsox/*` internal packages.
- **No secrets, ever.** Nothing from the parent workspace belongs here. This repo's history is public.
- **No silent failure.** Validation errors and runtime warnings use one shape:
  `{ path, expected, got, fix }`. Never return a blank/wrong PDF silently.
- **Determinism.** Output must be byte-stable: pin the Typst version, pass `--creation-timestamp 0`
  and `--ignore-system-fonts`.

## Layout

```
src/
  index.ts        programmatic API: build(spec, opts)
  cli.ts          the `pdf` command
  typst.ts        Typst binary resolution + deterministic compile/raster
  pipeline.ts     validate → expand → compile → render → manifest
  spec/           zod schema + agent-fixable error mapper
  compiler/       block tree → Typst markup
  theme/          ThemeTokens → Typst preamble; theme registry
  templates/      data → blocks (invoice, …)
examples/         worked specs (also used as golden tests)
test/             unit + snapshot (no binary) and integration (skipIf no typst)
```

## Conventions

- TypeScript, ESM, strict. Tests with vitest. CLI parses `process.argv` (no commander).
- A new block type is rare: prefer a property on an existing block. The vocabulary is meant to fit
  in an agent's context.
- Tests that need the `typst` binary must `skipIf(!hasTypst)` so `npm test` is green without it.
