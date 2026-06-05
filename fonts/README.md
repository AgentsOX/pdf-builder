# Fonts

v1 themes reference Typst's **embedded** fonts (Libertinus Serif, New Computer
Modern + NCM Math, DejaVu Sans Mono), so the tool renders with **no external
font files** and stays deterministic.

To use a custom face (e.g. a brand font, or Hebrew via a libre face like Heebo):

1. Drop the font files (`.ttf` / `.otf`) into this directory.
2. Reference the family name in a theme (`src/theme/*.ts`).

This directory is passed to Typst via `--font-path`. Only ship fonts whose
license permits redistribution (SIL OFL / Apache-2.0). Include each font's
license file alongside it.
