#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { basename, extname } from "node:path";
import { parse as parseYaml } from "yaml";
import { bundledFontsDir } from "./paths.js";
import { build, renderTypst, expandSpec, type BuildOptions } from "./pipeline.js";
import { listThemes } from "./theme/index.js";
import { listTemplates } from "./templates/index.js";
import { SpecError } from "./spec/validate.js";
import { specJsonSchema } from "./spec/jsonschema.js";
import { resolveTypst, listFontFamilies, TypstMissingError, TypstCompileError } from "./typst.js";

interface Flags {
  _: string[];
  [k: string]: string | boolean | string[];
}

// Flags that never take a value, so a following positional isn't swallowed
// (e.g. `pdf build --png file.yaml`).
const BOOLEAN_FLAGS = new Set(["png", "strict", "help", "json", "emit-typst", "emit-expanded-spec"]);

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
  const raw = readFileSync(file, "utf8");
  return extname(file).toLowerCase() === ".json" ? JSON.parse(raw) : parseYaml(raw);
}

function fail(msg: string): never {
  process.stderr.write(msg + "\n");
  process.exit(1);
}

const HELP = `pdf — declarative spec → PDF (Typst)

Usage:
  pdf build <file> [--theme <name>] [--themes-dir <dir>] [--font-path <dir>]
                   [--out <dir>] [--basename <name>] [--png] [--png-ppi <n>]
                   [--pdf-standard <a-2b|ua-1|...>] [--strict] [--json]
                   [--emit-typst] [--emit-expanded-spec]
  pdf new [--template <name>] [--out <file>]
  pdf themes
  pdf templates
  pdf fonts [--font-path <dir>]        list font families Typst can see
  pdf theme init <name> [--out <file>] scaffold a brand theme file
  pdf schema [--out <file>]            emit the spec's JSON Schema

Examples:
  pdf build invoice.yaml --theme default --png
  pdf build report.yaml --theme ./themes/acme.yaml --font-path ./brand-fonts
  pdf build invoice.yaml --pdf-standard a-2b      # PDF/A-2b conformance
  pdf build report.yaml --emit-typst              # debug: print generated Typst
  pdf build report.yaml --json                    # machine-readable result/errors
`;

function buildOptions(flags: Flags, file: string): BuildOptions {
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
  };
}

function cmdBuild(flags: Flags) {
  const file = (flags._ as string[])[1];
  if (!file) fail("build: missing <file>.\n\n" + HELP);
  const json = Boolean(flags.json);

  const emitError = (e: unknown) => {
    if (json) {
      const issues = e instanceof SpecError ? e.issues : undefined;
      const stderr = e instanceof TypstCompileError ? e.stderr : undefined;
      process.stdout.write(JSON.stringify({ ok: false, error: (e as Error).message, issues, stderr }, null, 2) + "\n");
      process.exit(1);
    }
    if (e instanceof SpecError) {
      process.stderr.write("Invalid spec:\n");
      for (const i of e.issues) {
        process.stderr.write(`  - ${i.path}: expected ${i.expected}, got ${JSON.stringify(i.got)}\n    fix: ${i.fix}\n`);
      }
      process.exit(1);
    }
    if (e instanceof TypstMissingError) fail(e.message);
    if (e instanceof TypstCompileError) fail(`Typst compile failed:\n${e.stderr}`);
    fail((e as Error).message);
  };

  try {
    const spec = loadSpec(file);
    const opts = buildOptions(flags, file);

    // Debug front doors — no engine needed.
    if (flags["emit-expanded-spec"]) {
      const ex = expandSpec(spec, opts);
      process.stdout.write(
        JSON.stringify(
          { schemaVersion: ex.validated.schemaVersion, theme: ex.themeName, template: ex.templateName, blocks: ex.blocks },
          null,
          2,
        ) + "\n",
      );
      return;
    }
    if (flags["emit-typst"]) {
      process.stdout.write(renderTypst(spec, opts).typst);
      return;
    }

    const result = build(spec, opts);
    if (json) {
      process.stdout.write(JSON.stringify({ ok: true, ...result }, null, 2) + "\n");
    } else {
      process.stdout.write(JSON.stringify(result, null, 2) + "\n");
      if (result.warnings.length) {
        process.stderr.write(`\n${result.warnings.length} warning(s):\n`);
        for (const w of result.warnings) process.stderr.write(`  - [${w.path}] ${w.fix}\n`);
      }
    }
  } catch (e) {
    emitError(e);
  }
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
  const out = JSON.stringify(starter, null, 2);
  const dest = str(flags.out);
  if (dest) {
    writeFileSync(dest, out + "\n", "utf8");
    process.stdout.write(`Wrote ${dest}\n`);
  } else {
    process.stdout.write(out + "\n");
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
    process.stdout.write(`Wrote ${dest}\n`);
  } else {
    process.stdout.write(content);
  }
}

function cmdFonts(flags: Flags) {
  const typst = resolveTypst();
  if (!typst) fail(new TypstMissingError().message);
  const fams = listFontFamilies(typst.bin, [bundledFontsDir, ...multi(flags["font-path"])]);
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

function cmdThemes() {
  for (const t of listThemes()) process.stdout.write(`${t.name.padEnd(12)} ${t.description}\n`);
}

function cmdTemplates() {
  for (const t of listTemplates()) process.stdout.write(`${t.name.padEnd(12)} ${t.description}\n`);
}

function main() {
  const flags = parseArgs(process.argv.slice(2));
  const argv = flags._ as string[];
  const cmd = argv[0];
  switch (cmd) {
    case "build":
      return cmdBuild(flags);
    case "new":
      return cmdNew(flags);
    case "themes":
      return cmdThemes();
    case "templates":
      return cmdTemplates();
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

main();
