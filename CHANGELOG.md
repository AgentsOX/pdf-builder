# Changelog

All notable changes to `@agentsox/pdf-builder` are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Distinct process exit codes per `error.kind` (`validation`=1, `typst_missing`=2,
  `typst_compile`=3, `io`=4, `unknown`=5), so a shell or agent can branch on `$?`
  without parsing output.
- `pdf guide` now returns its own response **contract** — the `{ok,…}` envelope shape,
  the error kinds, the exit codes, and the build-result keys — so an agent learns the
  reply format from the same call it onboards with.

### Changed
- **BREAKING:** `--json` build result keys are now camelCase, matching the manifest:
  `pdf_path` → `pdfPath`, `page_images` → `pageImages`. (Bumps the next release to 0.2.0.)
- `pdf schema` now carries a `description` on every spec field, so agents and editors
  get the meaning of each field, not just its type.
- Validation suggests the closest valid value on enum/`type` typos
  (e.g. `kind: "barr"` → `"bar"`, `type: "tabel"` → `"table"`) and lists the allowed
  values in `expected` — not only key typos as before.
- Oversized `got` values in error issues are clamped to a compact preview, keeping the
  `--json` failure envelope small in an agent's context.
- Missing required fields now read "Add the required field …" instead of the awkward
  "Set … to a …".
- Internal cleanup (no behavior change): shared `configBaseName`/`resolveFrom` helpers,
  and named constants for output defaults, chart size, and suggestion thresholds.

### Docs
- README rewritten in a plainer, less marketing-flavored voice.

## [0.1.0] — 2026-06-05

### Added
- Declarative spec → deterministic PDF via Typst, as a CLI and a library.
- Two front doors: `template` data (e.g. `invoice`) and freeform `blocks`.
- LaTeX math (vendored mitex, offline) — default math syntax; `math: typst` for native.
- RTL/LTR and mixed-bidi support; bundled Hebrew fallback font (David Libre, OFL).
- Real charts (bar/line/pie) via vendored cetz/cetz-plot (offline).
- Custom branding: external theme files with `extends` inheritance, `--font-path`,
  `theme.logo`, `pdf theme init`, `pdf fonts`.
- Strict validation: unknown keys, ragged tables, missing assets, and unavailable
  fonts are reported as `{ path, expected, got, fix }`.
- `pdf schema` (JSON Schema export); `spec.schemaVersion` with explicit migration hook.
- Manifest with content hashes (spec / Typst source / output) and asset list.
- `--json` machine-readable diagnostics; `--emit-typst` / `--emit-expanded-spec` debug flags.
- `--pdf-standard` passthrough for PDF/A and PDF/UA conformance.

### Determinism
- Pinned Typst major.minor (hard requirement; override via `PDF_BUILDER_ALLOW_TYPST_MISMATCH`).
- `--creation-timestamp 0`, `--ignore-system-fonts`, vendored offline packages, bundled fonts.

[Unreleased]: https://github.com/AgentsOX/pdf-builder/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/AgentsOX/pdf-builder/releases/tag/v0.1.0
