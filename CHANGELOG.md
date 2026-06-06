# Changelog

All notable changes to `@agentsox/pdf-builder` are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- **`sidebar` block** — a full-height colored side rail (left or right) for layouts like a
  CV contact column. The block carries only `side`/`width`/`children`; the theme owns the
  rail's `fill` and `text` color. Drawn as a repeating page background, so the band shows on
  every page while the main content flows and paginates normally.
- **Heading accent color + rules** — new optional theme tokens `heading.color` and
  `heading.rule` (which levels get an underline rule). Default and study themes are
  unchanged (headings still use the text color with no rule).
- **Inline links** — `[label](url)` in any text becomes a clickable Typst link for
  `http(s)`/`mailto` URLs; other schemes render literally (never executed).
- **Inline emphasis** — `**bold**` and `_italic_` in any text (semantic strong/emph; the
  theme owns how they look). Italic underscores must be on word boundaries, so `snake_case`
  and `file_name` are untouched. Composes with math and links (`[**bold**](url)`, `**$x$**`).
- **`cv` built-in theme** — a résumé look (navy side rail, ruled accent section headings,
  tight one-page spacing) plus an `examples/cv.yaml` golden.
- Theme files (`extends:`) can now override `heading`, `sidebar`, and `space.line`
  (paragraph leading).

### Changed (theme tokens)
- New `stroke` theme token (`hairline`, `accent`, `radius`) replaces the hardcoded
  rule/table/callout line weights and corner radius in the engine, so a theme owns those
  too. Built-in themes keep the previous values, so output is unchanged.

### Changed (theme spacing model)
- Spacing is now a **two-tier scale** (design-token style): a theme defines primitive steps
  `space.scale` (`xs…xl`) and points semantic roles at them — `block`, `gutter`, `inset`,
  and a new `edge` (safe-area padding between content and a colored fill). Every gap/padding
  resolves to a step, so spacing is harmonious by construction and there are no ad-hoc
  lengths in layout. The sidebar's padding/gap now come from `edge`/`gutter` rather than
  bespoke `sidebar.inset`/`gap` (both removed). Theme files set steps (e.g. `block: sm`),
  not raw lengths.

### Fixed / hardened
- Sidebar content no longer bleeds to the page edge: the rail's headings, rules, and
  bullets all share one `inset` (a safe-area padding), and `sidebar.gap` now separates the
  rail from the main column independently of that padding.
- Heading-rule styling is theme-tunable (`heading.rule.weight/gap/color`) instead of
  hardcoded constants in the engine — the magic-number class that caused the edge bleed.
- A too-tall sidebar now fails with a clear `{ path, expected, got, fix }` issue at build
  time instead of silently clipping (the rail is placed on page 1 only).

## [0.2.1] — 2026-06-05

### Added
- `-o` / `--output <file|dir>` for `pdf build`: a `.pdf` path sets the exact output file,
  any other path is treated as the output directory. The familiar single-flag form
  alongside the existing `--out <dir>` + `--basename <name>` (which still take precedence).
- The CLI parser now understands short flags (e.g. `-o`).

## [0.2.0] — 2026-06-05

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

[Unreleased]: https://github.com/AgentsOX/pdf-builder/compare/v0.2.1...HEAD
[0.2.1]: https://github.com/AgentsOX/pdf-builder/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/AgentsOX/pdf-builder/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/AgentsOX/pdf-builder/releases/tag/v0.1.0
