/** @agentsox/pdf-builder — declarative spec → deterministic PDF. */

export { build, expandSpec, renderTypst } from "./pipeline.js";
export type { BuildOptions, BuildResult, Manifest, ExpandResult, RenderResult } from "./pipeline.js";

export { SpecSchema, BlockSchema, SCHEMA_VERSION } from "./spec/schema.js";
export type { Spec, Block, CalloutKind, Align, Dir, MathSyntax } from "./spec/schema.js";

export { parseSpec, SpecError } from "./spec/validate.js";
export type { Issue } from "./spec/validate.js";

export { compileDocument } from "./compiler/index.js";

export { getTheme, listThemes, themeFromBrand } from "./theme/index.js";
export type { ThemeTokens } from "./theme/index.js";

export { getTemplate, listTemplates } from "./templates/index.js";
export type { Template } from "./templates/index.js";

export { hasTypst, resolveTypst } from "./typst.js";

export { loadProfile, listProfiles, getDefaultProfile, setDefaultProfile } from "./profile/load.js";
export { ProfileSchema } from "./profile/schema.js";
export type { Profile } from "./profile/schema.js";
