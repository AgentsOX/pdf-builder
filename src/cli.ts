#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { basename, extname } from "node:path";
import { parse as parseYaml, stringify as toYaml } from "yaml";
import { bundledFontsDir } from "./paths.js";
import { build, renderTypst, expandSpec, type BuildOptions } from "./pipeline.js";
import { listThemes } from "./theme/index.js";
import { listTemplates } from "./templates/index.js";
import { SpecError } from "./spec/validate.js";
import { specJsonSchema } from "./spec/jsonschema.js";
import { resolveTypst, listFontFamilies, TypstMissingError, TypstCompileError } from "./typst.js";
import {
  loadProfile,
  listProfiles,
  getDefaultProfile,
  setDefaultProfile,
  writeProfile,
  writeThemeFile,
} from "./profile/load.js";
import { profileInitTemplate } from "./profile/scaffold.js";
import { runOnboard } from "./profile/onboard.js";
import { InputError, classifyError } from "./diagnostics.js";

interface Flags {
  _: string[];
  [k: string]: string | boolean | string[];
}

// Flags that never take a value, so a following positional isn't swallowed
// (e.g. `pdf build --png file.yaml`).
const BOOLEAN_FLAGS = new Set([
  "png", "strict", "help", "json", "emit-typst", "emit-expanded-spec", "no-profile", "local", "global",
]);

/** Repeated flags accumulate into arrays (e.g. multiple --font-path). */
function parseArgs(argv: string[]): Flags {
  const flags: Flags = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      const takesValue = !BOOLEAN_FLAGS.has(key) && next !== undefined && !next.startsWith("--");
      const val: string | boolean = takesValue ? (i++, next) : true;
      const prev = flags[key];
      if (prev === undefined) flags[key] = val;
      else if (Array.isArray(prev)) prev.push(String(val));
      else flags[key] = [String(prev), String(val)];
    } else {
      (flags._ as string[]).push(a);
    }
  }
  return flags;
}

const str = (v: Flags[string]): string | undefined => (typeof v === "string" ? v : undefined);
const multi = (v: Flags[string]): string[] => (v === undefined ? [] : Array.isArray(v) ? v : [String(v)]);

function loadSpec(file: string): unknown {
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    throw new InputError(`Cannot read file: ${file}`);
  }
  try {
    return extname(file).toLowerCase() === ".json" ? JSON.parse(raw) : parseYaml(raw);
  } catch (e) {
    throw new InputError(`Cannot parse ${file}: ${(e as Error).message}`);
  }
}

function fail(msg: string): never {
  process.stderr.write(msg + "\n");
  process.exit(1);
}

const HELP = `pdf — declarative spec → PDF (Typst)

Build:
  pdf build <file> [--profile <name> | --no-profile] [--theme <name>] [--out <dir>]
      [--png] [--pdf-standard <a-2b|ua-1|…>] [--strict] [--json]
      [--emit-typst | --emit-expanded-spec] [--font-path <dir>]…
                                       render a spec; uses your default profile

Profiles (a context = theme + defaults + identity):
  pdf onboard                          set up a profile (interactive)
  pdf profile init <name> [--local]    scaffold a profile file to edit
  pdf profile list                     list profiles (★ = default)
  pdf profile use <name> [--local]     set the default profile
  pdf profile show <name>              print a profile

Authoring:
  pdf init                             scaffold a project (.pdfbuilder + sample)
  pdf new [--template <name>] [--out <file>]   print a starter spec
  pdf theme init <name> [--out <file>]         scaffold a brand theme file

Inspect:
  pdf themes | templates | fonts | schema

For agents: skip the interactive 'onboard' — use 'pdf profile init' (or write a
profile YAML). Add --json to any command (build, profile, themes, templates,
fonts, theme init) for one stable {ok,…} / {ok:false,error:{kind,…}} envelope.
The spec contract is 'pdf schema'.

Examples:
  pdf build invoice.yaml                      # uses your default profile
  pdf build invoice.yaml --profile academic   # plain, no brand
  pdf build invoice.yaml --pdf-standard a-2b  # PDF/A-2b conformance
  pdf build report.yaml --emit-typst          # debug: print generated Typst
  pdf build report.yaml --json                # machine-readable result/errors
`;

function buildOptions(flags: Flags, file: string): BuildOptions {
  // Profile: explicit --profile, else the configured default, unless --no-profile.
  const profile = flags["no-profile"] ? undefined : (str(flags.profile) ?? getDefaultProfile() ?? undefined);
  return {
    theme: str(flags.theme),
    themesDir: multi(flags["themes-dir"]),
    fontPaths: multi(flags["font-path"]),
    out: str(flags.out),
    basename: str(flags.basename) ?? basename(file, extname(file)),
    png: Boolean(flags.png),
    pngPpi: str(flags["png-ppi"]) ? Number(str(flags["png-ppi"])) : undefined,
    strict: Boolean(flags.strict),
    pdfStandard: str(flags["pdf-standard"]),
    profile,
  };
}

// Under `--json`, every command prints one envelope (discriminated on `ok`):
//   success: { ok: true, ...command data }
//   failure: { ok: false, error: { kind, message, issues?, stderr? } }
// where kind ∈ validation | typst_missing | typst_compile | io | unknown.
const printJson = (value: unknown) => process.stdout.write(JSON.stringify(value, null, 2) + "\n");
const ok = (data: Record<string, unknown>) => printJson({ ok: true, ...data });

function errorObject(e: unknown): Record<string, unknown> {
  const o: Record<string, unknown> = { kind: classifyError(e), message: (e as Error).message };
  if (e instanceof SpecError) o.issues = e.issues;
  if (e instanceof TypstCompileError) o.stderr = e.stderr;
  return o;
}

function printErrorHuman(e: unknown): never {
  if (e instanceof SpecError) {
    process.stderr.write("Invalid spec:\n");
    for (const i of e.issues) {
      process.stderr.write(`  - ${i.path}: expected ${i.expected}, got ${JSON.stringify(i.got)}\n    fix: ${i.fix}\n`);
    }
    process.exit(1);
  }
  if (e instanceof TypstCompileError) fail(`Typst compile failed:\n${e.stderr}`);
  fail((e as Error).message);
}

function printHumanResult(result: ReturnType<typeof build>) {
  const m = result.manifest;
  const meta = [
    `${m.pages} page${m.pages === 1 ? "" : "s"}`,
    `theme=${m.theme}`,
    m.profile ? `profile=${m.profile}` : null,
    m.pdfStandard ? `pdf=${m.pdfStandard}` : null,
  ]
    .filter(Boolean)
    .join(", ");
  process.stdout.write(`✓ ${result.pdf_path}  (${meta})\n`);
  for (const p of result.page_images) process.stdout.write(`  + ${p}\n`);
  if (result.warnings.length) {
    process.stderr.write(`\n${result.warnings.length} warning(s):\n`);
    for (const w of result.warnings) process.stderr.write(`  - [${w.path}] ${w.fix}\n`);
  }
}

function cmdBuild(flags: Flags) {
  const file = (flags._ as string[])[1];
  if (!file) fail("build: missing <file>.\n\n" + HELP);
  const spec = loadSpec(file);
  const opts = buildOptions(flags, file);

  // Debug front doors — no engine needed.
  if (flags["emit-expanded-spec"]) {
    const ex = expandSpec(spec, opts);
    printJson({ schemaVersion: ex.validated.schemaVersion, theme: ex.themeName, template: ex.templateName, blocks: ex.blocks });
    return;
  }
  if (flags["emit-typst"]) {
    process.stdout.write(renderTypst(spec, opts).typst);
    return;
  }

  const result = build(spec, opts);
  if (flags.json) {
    ok({ pdf_path: result.pdf_path, page_images: result.page_images, manifest: result.manifest, warnings: result.warnings });
  } else {
    printHumanResult(result);
  }
  // Errors propagate to main(), which renders them as JSON or prose per --json.
}

const STARTERS: Record<string, unknown> = {
  invoice: {
    template: "invoice",
    theme: "default",
    data: {
      seller: { name: "Your Company", email: "you@example.com" },
      client: { name: "Client Co" },
      number: "INV-001",
      date: "2026-01-01",
      currency: "USD",
      vat: { mode: "exempt" },
      lineItems: [{ description: "Service rendered", qty: 1, unitPrice: 1000 }],
    },
  },
  freeform: {
    theme: "default",
    blocks: [
      { type: "heading", level: 1, text: "Title" },
      { type: "text", text: "Body text with inline math $E = mc^2$." },
    ],
  },
};

function cmdNew(flags: Flags) {
  const name = str(flags.template) ?? "freeform";
  const starter = STARTERS[name];
  if (!starter) fail(`new: no starter for "${name}". Try: ${Object.keys(STARTERS).join(", ")}`);
  const out = toYaml(starter);
  const dest = str(flags.out);
  if (dest) {
    writeFileSync(dest, out, "utf8");
    process.stdout.write(`Wrote ${dest}\n`);
  } else {
    process.stdout.write(out);
  }
}

const THEME_STARTER = (name: string) => `# Theme: ${name}
# Inherit a built-in (default | study) and override only what you need.
# Run:  pdf build doc.yaml --theme ${name}   (searched in ./themes by default)
extends: default
description: "${name} brand theme"

# logo: assets/${name}-logo.svg     # path is relative to THIS file; shows in the header

fonts:
  heading: "Space Grotesk"          # any family on your --font-path (see: pdf fonts)
  body: "Inter"

color:
  primary: "#2563eb"                # accents, chart fill, callout borders
  text: "#111111"
  # callout: { definition: { bg: "#eef2ff", border: "#6366f1" } }

# page: { paper: "us-letter", margin: "2cm" }
`;

function cmdThemeInit(flags: Flags) {
  const name = (flags._ as string[])[2];
  if (!name) fail("theme init: missing <name>.  e.g. pdf theme init acme --out themes/acme.yaml");
  const content = THEME_STARTER(name);
  const dest = str(flags.out);
  if (dest) {
    writeFileSync(dest, content, "utf8");
    if (flags.json) ok({ path: dest });
    else process.stdout.write(`Wrote ${dest}\n`);
  } else {
    if (flags.json) ok({ content });
    else process.stdout.write(content);
  }
}

function cmdFonts(flags: Flags) {
  const typst = resolveTypst();
  if (!typst) throw new TypstMissingError(); // main() renders it (json or prose)
  const fams = listFontFamilies(typst.bin, [bundledFontsDir, ...multi(flags["font-path"])]);
  if (flags.json) return ok({ fonts: fams });
  if (!fams.length) fail("No fonts found.");
  for (const f of fams) process.stdout.write(f + "\n");
}

function cmdSchema(flags: Flags) {
  const json = JSON.stringify(specJsonSchema(), null, 2);
  const dest = str(flags.out);
  if (dest) {
    writeFileSync(dest, json + "\n", "utf8");
    process.stdout.write(`Wrote ${dest}\n`);
  } else {
    process.stdout.write(json + "\n");
  }
}

function cmdProfile(flags: Flags) {
  const argv = flags._ as string[];
  const sub = argv[1];
  const json = Boolean(flags.json);
  const global = !flags.local; // global by default; --local for project-local
  switch (sub) {
    case "init": {
      const name = argv[2];
      if (!name) fail("profile init: missing <name>.  e.g. pdf profile init business");
      const file = writeProfile(name, profileInitTemplate(name), { global });
      if (json) return ok({ path: file });
      process.stdout.write(`Wrote ${file}\nEdit it, then: pdf build <file> --profile ${name}\n`);
      return;
    }
    case "list": {
      const def = getDefaultProfile();
      const profiles = listProfiles().map((p) => ({ ...p, default: p.name === def }));
      if (json) return ok({ profiles, default: def });
      if (!profiles.length) {
        process.stdout.write("No profiles yet. Create one: pdf onboard  (or: pdf profile init <name>)\n");
        return;
      }
      for (const p of profiles) process.stdout.write(`${p.default ? "★" : " "} ${p.name.padEnd(16)} ${p.scope}\n`);
      return;
    }
    case "use": {
      const name = argv[2];
      if (!name) fail("profile use: missing <name>.");
      loadProfile(name); // validate it exists/parses before setting
      const file = setDefaultProfile(name, { global });
      if (json) return ok({ default: name, file });
      process.stdout.write(`Default profile set to "${name}" (${file})\n`);
      return;
    }
    case "show": {
      const name = argv[2];
      if (!name) fail("profile show: missing <name>.");
      const { profile, file } = loadProfile(name);
      if (json) return ok({ profile, file });
      process.stdout.write(`# ${file}\n${JSON.stringify(profile, null, 2)}\n`);
      return;
    }
    default:
      fail(`Unknown 'profile' subcommand "${sub ?? ""}". Try: init | list | use | show`);
  }
}

function cmdInit() {
  const file = writeProfile("local", profileInitTemplate("local"), { global: false });
  const sample = "example.yaml";
  writeFileSync(
    sample,
    [
      "theme: default",
      "blocks:",
      "  - { type: heading, level: 1, text: Hello }",
      "  - { type: text, text: Body with inline math $E = mc^2$. }",
      "",
    ].join("\n"),
    "utf8",
  );
  process.stdout.write(`Scaffolded a project:\n  ${file}\n  ${sample}\n\nRender it: pdf build ${sample} --png\n`);
}

function cmdThemes(flags: Flags) {
  const themes = listThemes();
  if (flags.json) return ok({ themes });
  for (const t of themes) process.stdout.write(`${t.name.padEnd(12)} ${t.description}\n`);
}

function cmdTemplates(flags: Flags) {
  const templates = listTemplates();
  if (flags.json) return ok({ templates });
  for (const t of templates) process.stdout.write(`${t.name.padEnd(12)} ${t.description}\n`);
}

async function dispatch(flags: Flags) {
  const argv = flags._ as string[];
  const cmd = argv[0];
  switch (cmd) {
    case "build":
      return cmdBuild(flags);
    case "new":
      return cmdNew(flags);
    case "onboard":
      return runOnboard();
    case "init":
      return cmdInit();
    case "profile":
      return cmdProfile(flags);
    case "themes":
      return cmdThemes(flags);
    case "templates":
      return cmdTemplates(flags);
    case "fonts":
      return cmdFonts(flags);
    case "theme":
      if (argv[1] === "init") return cmdThemeInit(flags);
      return fail(`Unknown 'theme' subcommand "${argv[1] ?? ""}". Try: pdf theme init <name>`);
    case "schema":
      return cmdSchema(flags);
    case undefined:
    case "help":
    case "--help":
      process.stdout.write(HELP);
      return;
    default:
      fail(`Unknown command "${cmd}".\n\n${HELP}`);
  }
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  try {
    await dispatch(flags);
  } catch (e) {
    // One error path for every command: JSON envelope under --json, else prose.
    if (flags.json) {
      printJson({ ok: false, error: errorObject(e) });
      process.exit(1);
    }
    printErrorHuman(e);
  }
}

main();
