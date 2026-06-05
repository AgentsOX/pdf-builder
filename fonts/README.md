# Fonts

Kept deliberately small. The built-in `default` and `study` themes use fonts the
**Typst engine already embeds** (Libertinus Serif, New Computer Modern + Math,
DejaVu Sans Mono), so they render offline with nothing bundled here. The only
font shipped is the one Typst does *not* embed:

| Family | Files | Used by | License |
|---|---|---|---|
| David Libre | `DavidLibre-{Regular,Bold}.ttf` | Hebrew / RTL fallback | OFL (`DavidLibre-OFL.txt`) |

The build passes this directory (and the on-demand cache, below) via
`--font-path` with `--ignore-system-fonts`, so output is reproducible.

## Add fonts on demand (no 5 MB bundle)

Instead of shipping every font, download only what you need — they're cached and
auto-added to the font path:

```bash
pdf fonts add cm                  # a curated pack (New Computer Modern)
pdf fonts add https://…/Brand.otf # any direct .ttf/.otf URL (brand/extra language)
pdf fonts add cm --local          # into ./.pdfbuilder/fonts instead of global
pdf fonts                         # list everything Typst can now see
```

Cache: `~/.config/pdf-builder/fonts` (global) or `./.pdfbuilder/fonts` (local).

## Add a font manually

Drop a `.ttf` / `.otf` into this directory or any `--font-path` dir, then
reference its family name in a theme. Only ship fonts whose license permits
redistribution, with their license file alongside.
