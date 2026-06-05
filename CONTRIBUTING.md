# Contributing

Thanks for helping improve `@agentsox/pdf-builder`.

## Dev loop

```bash
npm install
npm run typecheck      # tsc --noEmit
npm test              # vitest; engine tests skip if Typst isn't installed
npm run build         # compile to dist/
```

You'll want the [Typst](https://typst.app) CLI (`brew install typst`, pinned 0.14.x)
to run the render/integration tests; without it they skip and the rest still pass.

## Principles (please keep these)

- **Agent ⇄ engine split:** the spec is the contract. Validate before rendering;
  never emit a wrong-but-valid PDF. Errors carry `{ path, expected, got, fix }`.
- **Determinism:** same spec → same bytes (pinned Typst, fixed timestamp, bundled
  fonts, no network at render time).
- **Self-contained / OSS-clean:** public-npm deps only; no imports outside this repo.
- **Aesthetics live in themes; numbers in templates; the agent only arranges blocks.**

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`,
`docs:`, `refactor:`, `test:`, `chore:`. `feat:` → minor, `fix:` → patch, and
`feat!:`/`BREAKING CHANGE:` → major. This keeps the history readable and the door
open to automated releases.

## Pull requests

- Add/adjust tests for the change; keep `npm test` and `npm run typecheck` green.
- Note any user-facing change in `CHANGELOG.md` under `[Unreleased]`.
- Keep diffs focused; prefer generalizing a mechanism over a special case.
