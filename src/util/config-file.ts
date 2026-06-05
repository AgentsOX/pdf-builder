import { readFileSync, existsSync } from "node:fs";
import { isAbsolute, resolve, join, basename } from "node:path";
import { parse as parseYaml } from "yaml";
import type { z } from "zod";
import { formatZodError, SpecError } from "../spec/validate.js";
import { InputError } from "../diagnostics.js";

const CONFIG_EXTENSIONS = [".yaml", ".yml", ".json"];
/** Matches a config file extension (.yaml/.yml/.json). */
export const CONFIG_FILE_RE = /\.(ya?ml|json)$/i;

/** Strip the directory and config extension from a path → the bare config name. */
export const configBaseName = (file: string): string => basename(file).replace(CONFIG_FILE_RE, "");

/** Resolve `p` against `baseDir` unless it's already absolute. */
export const resolveFrom = (baseDir: string, p: string): string => (isAbsolute(p) ? p : resolve(baseDir, p));

/** True when `name` is an explicit path (has a separator or a config extension). */
function looksLikePath(name: string): boolean {
  return name.includes("/") || CONFIG_FILE_RE.test(name);
}

/** Resolve a name to a config file: an explicit path, else the first match in `dirs`. */
export function findConfigFile(name: string, dirs: string[]): string | null {
  if (looksLikePath(name)) {
    const path = isAbsolute(name) ? name : resolve(name);
    return existsSync(path) ? path : null;
  }
  for (const dir of dirs) {
    for (const ext of CONFIG_EXTENSIONS) {
      const path = join(dir, name + ext);
      if (existsSync(path)) return path;
    }
  }
  return null;
}

/** Read + parse a YAML or JSON file (by extension). Throws InputError on failure. */
export function readStructuredFile(file: string): unknown {
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    throw new InputError(`Cannot read file: ${file}`);
  }
  try {
    return /\.json$/i.test(file) ? JSON.parse(raw) : parseYaml(raw);
  } catch (e) {
    throw new InputError(`Cannot parse ${file}: ${(e as Error).message}`);
  }
}

/**
 * Read, parse, and validate a config file against a schema. Validation failures
 * become a SpecError whose fixes are labeled with the source (e.g. "theme file").
 */
export function loadConfigFile<T>(file: string, schema: z.ZodType<T>, label: string): T {
  const data = readStructuredFile(file);
  const result = schema.safeParse(data);
  if (!result.success) {
    const issues = formatZodError(result.error, data).map((i) => ({ ...i, fix: `${i.fix} (${label} ${file})` }));
    throw new SpecError(issues);
  }
  return result.data;
}
