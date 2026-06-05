# Fonts

These fonts are **bundled and shipped** so output is self-contained and
deterministic — it does not depend on whatever fonts the Typst binary happens to
embed. The build passes this directory via `--font-path` with
`--ignore-system-fonts`, so only these (and Typst's built-ins) are used.

| Family | Files | Used by | License |
|---|---|---|---|
| Libertinus Serif | `LibertinusSerif-{Regular,Bold,Italic}.otf` | `default` theme | OFL (`LibertinusSerif-OFL.txt`) |
| New Computer Modern | `NewCM10-{Regular,Bold,Italic}.otf`, `NewCMMath-Regular.otf` | `study` theme + math | GUST FL (`NewComputerModern-GUST-LICENSE.txt`) |
| DejaVu Sans Mono | `DejaVuSansMono{,-Bold}.ttf` | code/mono in both themes | Bitstream Vera / public-domain-ish (`DejaVuSansMono-LICENSE.txt`) |
| David Libre | `DavidLibre-{Regular,Bold}.ttf` | Hebrew/RTL fallback | OFL (`DavidLibre-OFL.txt`) |

All are SIL OFL / GUST / permissive — safe to redistribute. License files sit
alongside each face.

## Adding your own font

1. Drop the `.ttf` / `.otf` into this directory (or any dir you pass with
   `--font-path`, which is additive to this one).
2. Reference the family name in a theme (`src/theme/*.ts` or a theme file).
3. `pdf fonts` lists every family Typst can currently see.

Only ship fonts whose license permits redistribution, and include their license.
