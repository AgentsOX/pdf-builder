#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { basename, extname } from "node:path";
import { stringify as toYaml } from "yaml";
import { bundledFontsDir } from "./paths.js";
import { build, renderTypst, expandSpec, type BuildOptions } from "./pipeline.js";
import { listThemes } from "./theme/index.js";
import { listTemplates } from "./templates/index.js";
import { SpecError } from "./spec/validate.js";
import { specJsonSchema } from "./spec/jsonschema.js";
import { resolveTypst, listFontFamilies, TypstMissingError, TypstCompileError } from "./typst.js";
import { loadProfile, listProfiles, getDefaultProfile, setDefaultProfile, writeProfile } from "./profile/load.js";
import { profileInitTemplate, themeInitTemplate } from "./profile/scaffold.js";
import { runOnboard } from "./profile/onboard.js";
import { profileSearchDirs, themeSearchDirs, fontCacheDirs } from "./profile/paths.js";
import { addFonts, FONT_PACKS } from "./fonts.js";
import { classifyError, exitCodeFor, EXIT_CODES } from "./diagnostics.js";
import { readStructuredFile } from "./util/config-file.js";

interface Flags {
  positionals: string[];
  [k: string]: string | boolean | string[];
}

// Flags that never take a value, so a following positional isn't swallowed
// (e.g. `pdf build --png file.yaml`).
const BOOLEAN_FLAGS = new Set([
  "png", "strict", "help", "json", "emit-typst", "emit-expanded-spec", "no-profile", "local", "global",
]);

/** Parse argv into positionals + flags. Repeated flags accumulate into arrays. */
function parseArgs(argv: string[]): Flags {
  const flags: Flags = { positionals: [] };
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
      flags.positionals.push(a);
    }
  }
  return flags;
}

/** A flag's value as a single string (or undefined). */
const asString = (v: Flags[string]): string | undefined => (typeof v === "string" ? v : undefined);
/** A flag's value(s) as a string array (empty if unset). */
const asList = (v: Flags[string]): string[] => (v === undefined ? [] : Array.isArray(v) ? v : [String(v)]);

function fail(msg: string, code = 1): never {
  process.stderr.write(msg + "\n");
  process.exit(code);
}

const HELP = `pdf — declarative spec → PDF (Typst)

Agents: run \`pdf guide --json\` first — it returns the whole playbook (workflow,
blocks, themes/templates/profiles, recipes, example, JSON Schema). Then build.

Build:
  pdf build <file> [--profile <name> | --no-profile] [--theme <name>] [--out <dir>]
      [--png] [--pdf-standard <a-2b|ua-1|…>] [--strict] [--json]
      [--emit-typst | --emit-expanded-spec] [--font-path <dir>]… [--themes-dir <dir>]…
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
  pdf guide [--json]   everything an agent needs (workflow, blocks, schema, recipes)
  pdf themes | templates | fonts | schema
  pdf fonts add <pack|url>   download an extra font on demand (cached, auto-used)

For agents: start with 'pdf guide --json'. Skip the interactive 'onboard' — use
'pdf profile init' (or write a profile YAML). Add --json to any command for one
stable {ok,…} / {ok:false,error:{kind,…}} envelope.

Examples:
  pdf build invoice.yaml                      # uses your default profile
  pdf build invoice.yaml --profile academic   # plain, no brand
  pdf build invoice.yaml --pdf-standard a-2b  # PDF/A-2b conformance
  pdf build report.yaml --emit-typst          # debug: print generated Typst
  pdf build report.yaml --json                # machine-readable result/errors
`;

function buildOptions(flags: Flags, file: string): BuildOptions {
  // Profile: explicit --profile, else the configured default, unless --no-profile.
  const profile = flags["no-profile"] ? undefined : (asString(flags.profile) ?? getDefaultProfile() ?? undefined);
  return {
    theme: asString(flags.theme),
    themesDir: asList(flags["themes-dir"]),
    fontPaths: asList(flags["font-path"]),
    out: asString(flags.out),
    basename: asString(flags.basename) ?? basename(file, extname(file)),
    png: Boolean(flags.png),
    pngPpi: asString(flags["png-ppi"]) ? Number(asString(flags["png-ppi"])) : undefined,
    strict: Boolean(flags.strict),
    pdfStandard: asString(flags["pdf-standard"]),
    profile,
  };
}

// Under `--json`, every command prints one envelope (discriminated on `ok`):
//   success: { ok: true, ...command data }
//   failure: { ok: false, error: { kind, message, issues?, stderr? } }
// where kind ∈ validation | typst_missing | typst_compile | io | unknown.
const printJson = (value: unknown) => process.stdout.write(JSON.stringify(value, null, 2) + "\n");
const printSuccess = (data: Record<string, unknown>) => printJson({ ok: true, ...data });

function errorObject(e: unknown): Record<string, unknown> {
  const o: Record<string, unknown> = { kind: classifyError(e), message: (e as Error).message };
  if (e instanceof SpecError) o.issues = e.issues;
  if (e instanceof TypstCompileError) o.stderr = e.stderr;
  return o;
}

function printErrorHuman(e: unknown, code: number): never {
  if (e instanceof SpecError) {
    process.stderr.write("Invalid spec:\n");
    for (const i of e.issues) {
      process.stderr.write(`  - ${i.path}: expected ${i.expected}, got ${JSON.stringify(i.got)}\n    fix: ${i.fix}\n`);
    }
    process.exit(code);
  }
  if (e instanceof TypstCompileError) fail(`Typst compile failed:\n${e.stderr}`, code);
  fail((e as Error).message, code);
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
  process.stdout.write(`✓ ${result.pdfPath}  (${meta})\n`);
  for (const p of result.pageImages) process.stdout.write(`  + ${p}\n`);
  if (result.warnings.length) {
    process.stderr.write(`\n${result.warnings.length} warning(s):\n`);
    for (const w of result.warnings) process.stderr.write(`  - [${w.path}] ${w.fix}\n`);
  }
}

function cmdBuild(flags: Flags) {
  const file = flags.positionals[1];
  if (!file) fail("build: missing <file>.\n\n" + HELP);
  const spec = readStructuredFile(file);
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
    printSuccess({ pdfPath: result.pdfPath, pageImages: result.pageImages, manifest: result.manifest, warnings: result.warnings });
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

/** Write generated content to a file (--out) or stdout, honoring --json. */
function emitContent(content: string, flags: Flags) {
  const dest = asString(flags.out);
  if (dest) {
    writeFileSync(dest, content, "utf8");
    if (flags.json) printSuccess({ path: dest });
    else process.stdout.write(`Wrote ${dest}\n`);
  } else if (flags.json) {
    printSuccess({ content });
  } else {
    process.stdout.write(content);
  }
}

function cmdNew(flags: Flags) {
  const name = asString(flags.template) ?? "freeform";
  const starter = STARTERS[name];
  if (!starter) fail(`new: no starter for "${name}". Try: ${Object.keys(STARTERS).join(", ")}`);
  emitContent(toYaml(starter), flags);
}

function cmdThemeInit(flags: Flags) {
  const name = flags.positionals[2];
  if (!name) fail("theme init: missing <name>.  e.g. pdf theme init acme --out themes/acme.yaml");
  emitContent(themeInitTemplate(name), flags);
}

function cmdFonts(flags: Flags) {
  const typst = resolveTypst();
  if (!typst) throw new TypstMissingError(); // main() renders it (json or prose)
  const fams = listFontFamilies(typst.bin, [bundledFontsDir, ...fontCacheDirs(), ...asList(flags["font-path"])]);
  if (flags.json) return printSuccess({ fonts: fams });
  if (!fams.length) fail("No fonts found.");
  for (const f of fams) process.stdout.write(f + "\n");
}

async function cmdFontsAdd(flags: Flags) {
  const args = flags.positionals.slice(2); // after "fonts add"
  if (!args.length) {
    fail(`fonts add: give a pack name or a direct .ttf/.otf URL.\nPacks: ${Object.keys(FONT_PACKS).join(", ")}`);
  }
  const added = await addFonts(args, { global: !flags.local });
  if (flags.json) return printSuccess({ added });
  for (const f of added) process.stdout.write(`added ${f}\n`);
}

function cmdSchema(flags: Flags) {
  const schema = specJsonSchema();
  const dest = asString(flags.out);
  if (dest) {
    writeFileSync(dest, JSON.stringify(schema, null, 2) + "\n", "utf8");
    return flags.json ? printSuccess({ path: dest }) : void process.stdout.write(`Wrote ${dest}\n`);
  }
  printJson(schema); // the schema is itself the JSON payload — emit it raw, not wrapped
}

// --- pdf guide: everything an agent needs, self-describing -------------------

const GUIDE_WORKFLOW = [
  "Write a spec (YAML or JSON). Template path: emit `template:` + `data:` for a known type (see TEMPLATES). Freeform path: emit `blocks: [...]` for anything else.",
  "Render: `pdf build <file> --png --json`.",
  "On `{ok:false}`: fix using `error.kind` and each `issues[].fix`, then rebuild.",
  "On `{ok:true}`: OPEN the `pageImages` and look at them; fix the spec and rebuild until it's correct.",
  "You never set colors/fonts (themes do) or compute totals (templates do). Pass `--profile <name>` to apply the user's brand/identity.",
];

const GUIDE_BLOCKS = [
  "heading — section title (level 1-4)",
  "text — paragraph; inline LaTeX math inside $…$",
  "list — bullets, or ordered: true",
  "table — header + rows (string cells)",
  "kv — label→value rows (e.g. totals); emphasis: true to bold",
  "math — display equation (LaTeX by default; syntax: typst to switch)",
  "chart — kind: bar|line|pie, data: [{label,value}]",
  "image — src (relative to cwd), width, alt",
  "columns — children: [[blocks],[blocks]] side by side",
  "callout — kind: definition|theorem|tip|note, with title + body blocks",
  "spacer / pagebreak — spacing and page breaks",
  "header / footer — page furniture (logo, text, pageNumbers)",
];

const GUIDE_RECIPES = [
  {
    name: "Set up a brand profile from a user's description (NLP → profile)",
    how:
      "The USER describes their brand in plain language (company, colors, logo, tax/VAT). YOU do the CLI/file work — never make the user run commands. " +
      "Steps: (1) get target dirs from `paths` below (use the global dir unless the user wants project-local). " +
      "(2) Write a brand theme YAML to <themes-dir>/<name>.yaml: `extends: default` + `color: { primary, text }` + optional `fonts: { heading, body }` (only families on the font path — check `pdf fonts`) + optional `logo: <abs path>`. " +
      "(3) Write a profile YAML to <profiles-dir>/<name>.yaml: `theme: <name>`, `defaults: { lang, dir }`, and `template: { invoice: { seller: {name,email,taxId}, currency, vat: {mode} } }`. " +
      "(4) `pdf profile use <name>` to make it default, then verify with `pdf profile show <name> --json`. " +
      "After this, the user just says 'make an invoice for X' and you build with the profile applied.",
  },
  {
    name: "Summarize many files into one PDF",
    how: "Read each source with your own file tools and pull the key points. Then emit a FREEFORM spec: a title heading, a short intro, one section per source (heading + bullet list or callout), an optional comparison table, and a closing summary. Build with --png, look at the image, refine. Don't dump raw text — structure it.",
  },
  {
    name: "Invoice / receipt",
    how: "template: invoice with only the per-document data (client + lineItems + number + date). Subtotal/VAT/total are computed for you. Use --profile <name> to fill seller identity, currency, VAT, labels, and brand.",
  },
  {
    name: "Report with charts",
    how: "Freeform: header, kv (period/author), chart (bar|line|pie), tables, side-by-side callouts via columns, footer with pageNumbers.",
  },
  {
    name: "Study sheet / math notes",
    how: "Freeform with math blocks and inline $…$ LaTeX; theme: study; callouts for definitions/theorems.",
  },
];

// The response contract, returned by `pdf guide` so an agent learns the shape
// of every reply from the same call it onboards with.
const GUIDE_CONTRACT = {
  envelope: "Every command prints ONE JSON object on stdout under --json. Success: { ok: true, ...data }. Failure: { ok: false, error: { kind, message, issues? } }.",
  errorKinds: Object.keys(EXIT_CODES),
  exitCodes: EXIT_CODES,
  issue: { path: "string", expected: "string", got: "any", fix: "string — how to correct it" },
  buildResult: { pdfPath: "string", pageImages: "string[]", manifest: "object", warnings: "issue[]" },
};

const GUIDE_EXAMPLE = {
  theme: "default",
  blocks: [
    { type: "heading", level: 1, text: "Quarterly Summary" },
    { type: "text", text: "Revenue grew, with $\\Delta = 72\\%$ QoQ." },
    {
      type: "chart",
      kind: "bar",
      title: "Revenue by month",
      data: [
        { label: "Apr", value: 18 },
        { label: "May", value: 24 },
        { label: "Jun", value: 31 },
      ],
    },
    { type: "table", header: ["Client", "MRR"], rows: [["Acme", "$1,200"], ["Globex", "$900"]] },
    { type: "callout", kind: "tip", title: "Takeaway", body: [{ type: "text", text: "Three new clients drove growth." }] },
  ],
};

function cmdGuide(flags: Flags) {
  const themes = listThemes();
  const templates = listTemplates();
  const profiles = listProfiles().map((p) => p.name);
  const defaultProfile = getDefaultProfile();
  // [local, global] — write profiles/themes here to create them by name.
  const [profilesLocal, profilesGlobal] = profileSearchDirs();
  const [themesLocal, themesGlobal] = themeSearchDirs();
  const paths = {
    profiles: { global: profilesGlobal, local: profilesLocal },
    themes: { global: themesGlobal, local: themesLocal },
  };

  if (flags.json) {
    return printSuccess({
      workflow: GUIDE_WORKFLOW,
      blocks: GUIDE_BLOCKS,
      themes,
      templates,
      profiles: { available: profiles, default: defaultProfile },
      paths,
      recipes: GUIDE_RECIPES,
      contract: GUIDE_CONTRACT,
      example: GUIDE_EXAMPLE,
      schema: specJsonSchema(),
    });
  }

  const w = (s = "") => process.stdout.write(s + "\n");
  w("pdf-builder — agent guide");
  w("Turn a declarative spec into a PDF. Self-correct by rendering and looking.\n");
  w("WORKFLOW");
  GUIDE_WORKFLOW.forEach((s, i) => w(`  ${i + 1}. ${s}`));
  w("\nBLOCKS (freeform vocabulary)");
  GUIDE_BLOCKS.forEach((b) => w(`  - ${b}`));
  w("\nTHEMES");
  themes.forEach((t) => w(`  ${t.name.padEnd(10)} ${t.description}`));
  w("\nTEMPLATES");
  templates.forEach((t) => w(`  ${t.name.padEnd(10)} ${t.description}`));
  if (profiles.length) {
    w("\nPROFILES");
    profiles.forEach((n) => w(`  ${n}${n === defaultProfile ? " (default)" : ""}`));
  }
  w("\nWRITE PATHS (create profiles/themes by name by writing files here)");
  w(`  profiles: ${paths.profiles.global}  (global)`);
  w(`            ${paths.profiles.local}  (project-local)`);
  w(`  themes:   ${paths.themes.global}  (global)`);
  w("\nRECIPES");
  GUIDE_RECIPES.forEach((r) => w(`  • ${r.name}\n      ${r.how}`));
  w("\nEXAMPLE (freeform spec)");
  w(toYaml(GUIDE_EXAMPLE).replace(/^/gm, "  "));
  w("\nCONTRACT");
  w("  Every command prints one JSON object under --json:");
  w("    success  { ok: true, ...data }");
  w("    failure  { ok: false, error: { kind, message, issues? } }");
  w(`  error.kind ∈ ${GUIDE_CONTRACT.errorKinds.join(" | ")}`);
  w(`  exit codes: ${Object.entries(EXIT_CODES).map(([k, v]) => `${k}=${v}`).join(", ")}`);
  w("  `pdf schema` prints the full JSON Schema.");
}

function cmdProfile(flags: Flags) {
  const argv = flags.positionals;
  const sub = argv[1];
  const json = Boolean(flags.json);
  const global = !flags.local; // global by default; --local for project-local
  switch (sub) {
    case "init": {
      const name = argv[2];
      if (!name) fail("profile init: missing <name>.  e.g. pdf profile init business");
      const file = writeProfile(name, profileInitTemplate(name), { global });
      if (json) return printSuccess({ path: file });
      process.stdout.write(`Wrote ${file}\nEdit it, then: pdf build <file> --profile ${name}\n`);
      return;
    }
    case "list": {
      const def = getDefaultProfile();
      const profiles = listProfiles().map((p) => ({ ...p, default: p.name === def }));
      if (json) return printSuccess({ profiles, default: def });
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
      if (json) return printSuccess({ default: name, file });
      process.stdout.write(`Default profile set to "${name}" (${file})\n`);
      return;
    }
    case "show": {
      const name = argv[2];
      if (!name) fail("profile show: missing <name>.");
      const { profile, file } = loadProfile(name);
      if (json) return printSuccess({ profile, file });
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
  writeFileSync(sample, toYaml(STARTERS.freeform), "utf8");
  process.stdout.write(`Scaffolded a project:\n  ${file}\n  ${sample}\n\nRender it: pdf build ${sample} --png\n`);
}

/** Shared renderer for the list commands (themes, templates). */
function cmdList(flags: Flags, key: string, items: { name: string; description: string }[]) {
  if (flags.json) return printSuccess({ [key]: items });
  for (const it of items) process.stdout.write(`${it.name.padEnd(12)} ${it.description}\n`);
}

async function dispatch(flags: Flags) {
  const argv = flags.positionals;
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
      return cmdList(flags, "themes", listThemes());
    case "templates":
      return cmdList(flags, "templates", listTemplates());
    case "fonts":
      return argv[1] === "add" ? cmdFontsAdd(flags) : cmdFonts(flags);
    case "theme":
      if (argv[1] === "init") return cmdThemeInit(flags);
      return fail(`Unknown 'theme' subcommand "${argv[1] ?? ""}". Try: pdf theme init <name>`);
    case "schema":
      return cmdSchema(flags);
    case "guide":
      return cmdGuide(flags);
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
    // Exit code is per error.kind (see EXIT_CODES) so a shell/agent can branch on $?.
    const code = exitCodeFor(e);
    if (flags.json) {
      printJson({ ok: false, error: errorObject(e) });
      process.exit(code);
    }
    printErrorHuman(e, code);
  }
}

main();
