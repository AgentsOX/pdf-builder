# Security Policy

## Reporting a vulnerability

Please report security issues privately via GitHub Security Advisories
("Report a vulnerability" on the repo's Security tab), or by email to
security@agentsox.com. Don't open a public issue for vulnerabilities.

We aim to acknowledge within a few business days.

## Scope notes

- The tool shells out to the `typst` binary using **argv-style execution** (no shell
  string interpolation), and sandboxes file access with Typst's `--root`.
- Spec-supplied image/logo paths are normalized and rejected if they escape the root.
- `pdf fonts add` downloads from URLs you pass and validates the bytes are a real
  font before writing. Only add fonts from sources you trust.
- Rendering does not execute spec content as code; the engine input is generated
  Typst markup, not arbitrary scripts.
