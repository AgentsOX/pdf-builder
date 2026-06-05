# Changelog

All notable changes to `@agentsox/pdf-builder` are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

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
