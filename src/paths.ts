import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

/**
 * Single source of truth for bundled-asset locations. Resolves the package root
 * from this module's location, so it's correct whether running from dist/ or
 * src/ (both are one level under the package root).
 */
export const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Bundled fonts directory (passed to Typst via --font-path). */
export const bundledFontsDir = join(packageRoot, "fonts");

/** Vendored Typst package cache (mitex, cetz, …) for offline rendering. */
export const vendorPackagesDir = join(packageRoot, "vendor", "typst-packages");
