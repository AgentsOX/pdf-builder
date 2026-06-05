import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { InputError } from "../diagnostics.js";
import { findConfigFile, loadConfigFile } from "../util/config-file.js";
import { ProfileSchema, type Profile } from "./schema.js";
import { globalConfigDir, localConfigDir, profileSearchDirs, configFiles } from "./paths.js";

export interface LoadedProfile {
  profile: Profile;
  file: string;
  /** Directory of the profile file — base for its relative fontPaths/out. */
  dir: string;
}

/** Resolve a profile by name (searched local→global) or by file path. */
export function loadProfile(name: string): LoadedProfile {
  const file = findConfigFile(name, profileSearchDirs());
  if (!file) {
    const dirs = profileSearchDirs().join(", ");
    throw new InputError(`Unknown profile "${name}". Searched: ${dirs}. Create one with: pdf profile init ${name}`);
  }
  return { profile: loadConfigFile(file, ProfileSchema, "profile"), file, dir: dirname(file) };
}

export interface ProfileEntry {
  name: string;
  scope: "local" | "global";
  file: string;
}

/** List available profiles (local then global; local shadows global). */
export function listProfiles(): ProfileEntry[] {
  const dirs = profileSearchDirs();
  const scopes: ("local" | "global")[] = ["local", "global"];
  const seen = new Set<string>();
  const out: ProfileEntry[] = [];
  dirs.forEach((dir, i) => {
    if (!existsSync(dir)) return;
    for (const f of readdirSync(dir).sort()) {
      const m = f.match(/^(.+)\.(ya?ml|json)$/i);
      if (!m || seen.has(m[1])) continue;
      seen.add(m[1]);
      out.push({ name: m[1], scope: scopes[i], file: join(dir, f) });
    }
  });
  return out;
}

/** Read a JSON config file, tolerating missing/malformed files (→ {}). */
function readConfig(file: string): Record<string, unknown> {
  if (!existsSync(file)) return {};
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

/** The configured default profile name (local config wins), or null. */
export function getDefaultProfile(): string | null {
  for (const file of configFiles()) {
    const value = readConfig(file).defaultProfile;
    if (typeof value === "string") return value;
  }
  return null;
}

function configDir(global: boolean): string {
  return global ? globalConfigDir() : localConfigDir();
}

/** Set (or clear, with null) the default profile in the local or global config. */
export function setDefaultProfile(name: string | null, opts: { global?: boolean } = {}): string {
  const dir = configDir(opts.global ?? true);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "config.json");
  const cfg = readConfig(file);
  if (name === null) delete cfg.defaultProfile;
  else cfg.defaultProfile = name;
  writeFileSync(file, JSON.stringify(cfg, null, 2) + "\n", "utf8");
  return file;
}

/** Write a config file (profile or theme) into the local/global config tree. */
function writeConfigFile(kind: "profiles" | "themes", name: string, yamlContent: string, opts: { global?: boolean }): string {
  const dir = join(configDir(opts.global ?? true), kind);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${name}.yaml`);
  writeFileSync(file, yamlContent, "utf8");
  return file;
}

export const writeProfile = (name: string, yaml: string, opts: { global?: boolean } = {}) =>
  writeConfigFile("profiles", name, yaml, opts);

export const writeThemeFile = (name: string, yaml: string, opts: { global?: boolean } = {}) =>
  writeConfigFile("themes", name, yaml, opts);

/** Strip a path/extension to a bare profile name (for `--profile ./x.yaml`). */
export function profileNameOf(nameOrPath: string): string {
  return basename(nameOrPath).replace(/\.(ya?ml|json)$/i, "");
}
