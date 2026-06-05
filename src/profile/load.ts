import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname, resolve, isAbsolute, basename } from "node:path";
import { parse as parseYaml } from "yaml";
import { formatZodError, SpecError } from "../spec/validate.js";
import { ProfileSchema, type Profile } from "./schema.js";
import { globalConfigDir, localConfigDir, profileSearchDirs, configFiles } from "./paths.js";

export interface LoadedProfile {
  profile: Profile;
  file: string;
  /** Directory of the profile file — base for its relative fontPaths/out. */
  dir: string;
}

function readProfileFile(file: string): Profile {
  const raw = readFileSync(file, "utf8");
  const data = /\.json$/i.test(file) ? JSON.parse(raw) : parseYaml(raw);
  const result = ProfileSchema.safeParse(data);
  if (!result.success) {
    const issues = formatZodError(result.error, data).map((i) => ({ ...i, fix: `${i.fix} (profile ${file})` }));
    throw new SpecError(issues);
  }
  return result.data;
}

function findProfileFile(name: string): string | null {
  if (name.includes("/") || /\.(ya?ml|json)$/i.test(name)) {
    const p = isAbsolute(name) ? name : resolve(name);
    return existsSync(p) ? p : null;
  }
  for (const dir of profileSearchDirs()) {
    for (const ext of [".yaml", ".yml", ".json"]) {
      const p = join(dir, name + ext);
      if (existsSync(p)) return p;
    }
  }
  return null;
}

/** Resolve a profile by name (searched local→global) or by file path. */
export function loadProfile(name: string): LoadedProfile {
  const file = findProfileFile(name);
  if (!file) {
    const dirs = profileSearchDirs().join(", ");
    throw new Error(`Unknown profile "${name}". Searched: ${dirs}. Create one with: pdf profile init ${name}`);
  }
  return { profile: readProfileFile(file), file, dir: dirname(file) };
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

/** The configured default profile name (local config wins), or null. */
export function getDefaultProfile(): string | null {
  for (const f of configFiles()) {
    if (!existsSync(f)) continue;
    try {
      const cfg = JSON.parse(readFileSync(f, "utf8"));
      if (typeof cfg.defaultProfile === "string") return cfg.defaultProfile;
    } catch {
      /* ignore malformed config */
    }
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
  let cfg: Record<string, unknown> = {};
  if (existsSync(file)) {
    try {
      cfg = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      /* overwrite malformed */
    }
  }
  if (name === null) delete cfg.defaultProfile;
  else cfg.defaultProfile = name;
  writeFileSync(file, JSON.stringify(cfg, null, 2) + "\n", "utf8");
  return file;
}

/** Write a profile file into the local/global profiles dir; returns its path. */
export function writeProfile(name: string, yamlContent: string, opts: { global?: boolean } = {}): string {
  const dir = join(configDir(opts.global ?? true), "profiles");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${name}.yaml`);
  writeFileSync(file, yamlContent, "utf8");
  return file;
}

/** Write a brand theme file into the local/global themes dir; returns its path. */
export function writeThemeFile(name: string, yamlContent: string, opts: { global?: boolean } = {}): string {
  const dir = join(configDir(opts.global ?? true), "themes");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${name}.yaml`);
  writeFileSync(file, yamlContent, "utf8");
  return file;
}

/** Strip a path/extension to a bare profile name (for `--profile ./x.yaml`). */
export function profileNameOf(nameOrPath: string): string {
  return basename(nameOrPath).replace(/\.(ya?ml|json)$/i, "");
}
