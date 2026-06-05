import { homedir } from "node:os";
import { join, resolve } from "node:path";

/**
 * Where profiles, brand themes, and the default-profile config live.
 * Two roots, local-first:
 *   - project-local:  ./.pdfbuilder        (committed per project)
 *   - global user:    $PDF_BUILDER_CONFIG_HOME | $XDG_CONFIG_HOME/pdf-builder | ~/.config/pdf-builder
 * The env override makes the global root testable/hermetic.
 */
export function globalConfigDir(): string {
  if (process.env.PDF_BUILDER_CONFIG_HOME) return resolve(process.env.PDF_BUILDER_CONFIG_HOME);
  const base = process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config");
  return join(base, "pdf-builder");
}

export function localConfigDir(): string {
  return resolve(".pdfbuilder");
}

/** Local then global — local wins on name collisions. */
export function configRoots(): string[] {
  return [localConfigDir(), globalConfigDir()];
}

export function profileSearchDirs(): string[] {
  return configRoots().map((d) => join(d, "profiles"));
}

export function themeSearchDirs(): string[] {
  return configRoots().map((d) => join(d, "themes"));
}

export function configFiles(): string[] {
  return configRoots().map((d) => join(d, "config.json"));
}
