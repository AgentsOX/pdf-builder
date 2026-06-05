# Releasing

Releases are **tag-driven**: pushing a `vX.Y.Z` tag runs `.github/workflows/publish.yml`,
which builds + typechecks + tests, publishes to npm **with provenance**, and
creates a GitHub Release.

## Versioning (SemVer)

- **patch** (`0.1.0 → 0.1.1`) — backward-compatible bug fixes.
- **minor** (`0.1.0 → 0.2.0`) — backward-compatible features (new block, theme, flag).
- **major** (`0.1.0 → 1.0.0`) — breaking spec/CLI/API change. Bump `SCHEMA_VERSION`
  and add a migration when the **spec** contract changes.

Pre-1.0, treat minor as the "may break" lane and document any break in the CHANGELOG.

## One-time setup

1. **npm org** — create the `@agentsox` org (scoped package), or rename to unscoped.
2. **GitHub repo** — create `agentsox/pdf-builder`, push this repo to it.
3. **Auth for CI publish**, pick one:
   - **Trusted Publishing (recommended, no secret):** on npmjs.com → the package →
     Settings → Trusted Publisher → add this GitHub repo + `publish.yml`. Then the
     workflow publishes via OIDC with no token. (Requires one prior publish to create
     the package; do the first one manually, then switch.)
   - **Granular token:** create a package-scoped npm token, add it as the repo secret
     `NPM_TOKEN`. Works for the first publish too.

## Cutting a release

1. Land all changes on `main` (CI green).
2. Move the CHANGELOG `[Unreleased]` items into a new `[X.Y.Z] — DATE` section.
3. Bump the version: `npm version X.Y.Z` (updates package.json + commits + tags),
   or edit `package.json` and `git tag vX.Y.Z` by hand.
4. Push: `git push && git push --tags`.
5. The Publish workflow runs → npm + GitHub Release. Verify:
   - `npm view @agentsox/pdf-builder version`
   - the package page shows the **provenance** badge.

## First publish (manual fallback)

`provenance: true` makes a *local* `npm publish` fail (provenance needs CI). For a
one-off manual first publish: `npm login`, temporarily remove `provenance` from
`publishConfig`, `npm publish`, then restore it and switch to the tag flow above.

## Future automation (optional)

For hands-off releases, adopt [release-please](https://github.com/googleapis/release-please)
(PR-based: conventional commits → version + changelog + tag) or
[semantic-release](https://semantic-release.gitbook.io/). Not needed for a single
small package, but the conventional-commit style in CONTRIBUTING.md keeps the door open.
