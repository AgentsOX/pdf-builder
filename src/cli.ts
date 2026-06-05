#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { basename, extname } from "node:path";
import { parse as parseYaml } from "yaml";
import { build } from "./pipeline.js";
import { listThemes } from "./theme/index.js";
import { listTemplates } from "./templates/index.js";
import { SpecError } from "./spec/validate.js";
import { TypstMissingError, TypstCompileError } from "./typst.js";

interface Flags {
  _: string[];
  [k: string]: string | boolean | string[];
}

function parseArgs(argv: string[]): Flags {
  const flags: Flags = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        flags[key] = true;
      } else {
        flags[key] = next;
        i++;
      }
    } else {
      (flags._ as string[]).push(a);
    }
  }
  return flags;
}

function loadSpec(file: string): unknown {
  const raw = readFileSync(file, "utf8");
  const ext = extname(file).toLowerCase();
  return ext === ".json" ? JSON.parse(raw) : parseYaml(raw);
}

function fail(msg: string): never {
  process.stderr.write(msg + "\n");
  process.exit(1);
}

const HELP = `pdf — declarative spec → PDF (Typst)

Usage:
  pdf build <file> [--theme <name>] [--out <dir>] [--png] [--png-ppi <n>] [--strict]
  pdf new [--template <name>] [--out <file>]
  pdf themes
  pdf templates

Examples:
  pdf build invoice.yaml --theme default --png
  pdf new --template invoice --out invoice.yaml
`;

function cmdBuild(flags: Flags) {
  const file = (flags._ as string[])[1];
  if (!file) fail("build: missing <file>.\n\n" + HELP);

  let spec: unknown;
  try {
    spec = loadSpec(file);
  } catch (e) {
    fail(`Could not read/parse ${file}: ${(e as Error).message}`);
  }

  try {
    const result = build(spec, {
      theme: typeof flags.theme === "string" ? flags.theme : undefined,
      out: typeof flags.out === "string" ? flags.out : undefined,
      basename: basename(file, extname(file)),
      png: Boolean(flags.png),
      pngPpi: typeof flags["png-ppi"] === "string" ? Number(flags["png-ppi"]) : undefined,
      strict: Boolean(flags.strict),
    });
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    if (result.warnings.length) {
      process.stderr.write(`\n${result.warnings.length} warning(s):\n`);
      for (const w of result.warnings) process.stderr.write(`  - [${w.path}] ${w.fix}\n`);
    }
  } catch (e) {
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
  const name = typeof flags.template === "string" ? flags.template : "freeform";
  const starter = STARTERS[name];
  if (!starter) fail(`new: no starter for "${name}". Try: ${Object.keys(STARTERS).join(", ")}`);
  const yamlOut = JSON.stringify(starter, null, 2);
  if (typeof flags.out === "string") {
    writeFileSync(flags.out, yamlOut + "\n", "utf8");
    process.stdout.write(`Wrote ${flags.out}\n`);
  } else {
    process.stdout.write(yamlOut + "\n");
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
  const cmd = (flags._ as string[])[0];
  switch (cmd) {
    case "build":
      return cmdBuild(flags);
    case "new":
      return cmdNew(flags);
    case "themes":
      return cmdThemes();
    case "templates":
      return cmdTemplates();
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
