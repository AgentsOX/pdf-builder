/**
 * Typst packages we depend on. The versions here MUST match the directories
 * vendored under vendor/typst-packages/preview/<name>/<version>/ — this is the
 * single source of truth for both the import statements and the vendored cache.
 */
export const TYPST_PACKAGES = {
  mitex: "0.2.5",
  cetz: "0.4.2",
  "cetz-plot": "0.1.3",
  oxifmt: "1.0.0", // transitive dep of cetz-plot
} as const;

const ref = (name: keyof typeof TYPST_PACKAGES) => `@preview/${name}:${TYPST_PACKAGES[name]}`;

/** Import line for mitex (LaTeX → Typst math). */
export const MITEX_IMPORT = `#import "${ref("mitex")}": mi, mitex`;

/** Import lines for the cetz chart packages. */
export const CETZ_IMPORT = `#import "${ref("cetz")}"\n#import "${ref("cetz-plot")}": chart, plot`;
