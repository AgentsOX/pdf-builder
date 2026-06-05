/** @agentsox/pdf-builder — declarative spec → deterministic PDF. */

export { build } from "./pipeline.js";
export type { BuildOptions, BuildResult, Manifest } from "./pipeline.js";

export { SpecSchema, BlockSchema } from "./spec/schema.js";
export type { Spec, Block, CalloutKind, Align, Dir } from "./spec/schema.js";

export { parseSpec, SpecError } from "./spec/validate.js";
export type { Issue } from "./spec/validate.js";

export { compileDocument } from "./compiler/index.js";

export { getTheme, listThemes, themeFromBrand } from "./theme/index.js";
export type { ThemeTokens } from "./theme/index.js";

export { getTemplate, listTemplates } from "./templates/index.js";
export type { Template } from "./templates/index.js";

export { hasTypst, resolveTypst } from "./typst.js";
