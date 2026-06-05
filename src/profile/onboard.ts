import { createInterface } from "node:readline/promises";
import { stdin, stdout, stderr } from "node:process";
import { stringify as toYaml } from "yaml";
import { profileObject, brandThemeYaml, type ProfileAnswers, type BrandAnswers } from "./scaffold.js";
import { writeProfile, writeThemeFile, setDefaultProfile } from "./load.js";

/**
 * Interactive `pdf onboard`: build a profile (and brand theme) for a context.
 * Interactive by design — for scripts/agents use `pdf profile init` or write a
 * profile YAML directly (see the spec docs).
 */
export async function runOnboard(): Promise<void> {
  // Never hang a non-interactive caller (CI, pipes, agents).
  if (!stdin.isTTY) {
    stderr.write(
      [
        "`pdf onboard` is interactive and needs a terminal.",
        "For scripts or agents, create a profile non-interactively instead:",
        "  pdf profile init <name>     # writes a profile file to edit",
        "  pdf profile use <name>      # set it as the default",
        "",
      ].join("\n"),
    );
    process.exit(1);
  }

  const rl = createInterface({ input: stdin, output: stdout });
  const ask = async (q: string, def = "") => {
    const a = (await rl.question(def ? `${q} [${def}]: ` : `${q}: `)).trim();
    return a || def;
  };
  const askChoice = async (q: string, choices: string[], def: string) => {
    for (;;) {
      const a = (await ask(`${q} (${choices.join("/")})`, def)).toLowerCase();
      if (choices.includes(a)) return a;
      stdout.write(`  → please choose one of: ${choices.join(", ")}\n`);
    }
  };
  const askHex = async (q: string, def: string) => {
    for (;;) {
      const a = await ask(q, def);
      if (/^#?[0-9a-fA-F]{6}$/.test(a)) return a.startsWith("#") ? a.toLowerCase() : `#${a.toLowerCase()}`;
      stdout.write("  → enter a 6-digit hex color, e.g. #2563eb\n");
    }
  };
  const yes = async (q: string, def = true) => (await askChoice(q, ["y", "n"], def ? "y" : "n")) === "y";

  try {
    stdout.write("\nLet's set up a profile. Press Enter to accept the [default].\n\n");

    // 1. Identity
    const name = await ask("Profile name", "business");
    const kind = (await askChoice("Kind", ["business", "academic", "personal"], "business")) as ProfileAnswers["kind"];
    const global = (await askChoice("Scope", ["global", "local"], "global")) === "global";

    const answers: ProfileAnswers = { name, kind };
    answers.lang = await ask("Default language (e.g. en, he)", "en");
    answers.dir = ["he", "ar", "fa"].includes(answers.lang) ? "rtl" : "ltr";

    // 2. Brand (business only, optional)
    let brand: BrandAnswers | undefined;
    if (kind === "business" && (await yes("Add brand colors/logo?", false))) {
      brand = { name, primary: await askHex("Brand primary color", "#2563eb") };
      const logo = await ask("Logo path (optional)");
      const heading = await ask("Heading font (optional — must be on your font path)");
      if (logo) brand.logo = logo;
      if (heading) brand.heading = heading;
      answers.theme = name;
    }

    // 3. Identity defaults
    if (kind === "business") {
      answers.seller = {
        name: await ask("Seller / business name", name),
        email: await ask("Seller email (optional)"),
        taxId: await ask("Tax ID (optional)"),
      };
      answers.currency = await ask("Currency", "USD");
      answers.vatMode = (await askChoice("VAT mode", ["exempt", "standard"], "exempt")) as ProfileAnswers["vatMode"];
    } else {
      answers.math = (await askChoice("Math syntax", ["latex", "typst"], "latex")) as ProfileAnswers["math"];
    }

    const makeDefault = await yes("Set as your default profile?", true);

    // 4. Review, then write (nothing is written until you confirm).
    stdout.write(`\nReview:\n`);
    stdout.write(`  profile "${name}" (${kind}, ${global ? "global" : "local"}${makeDefault ? ", default" : ""})\n`);
    if (brand) stdout.write(`  brand theme "${name}" (primary ${brand.primary})\n`);
    stdout.write("\n" + toYaml(profileObject(answers)).replace(/^/gm, "  ") + "\n");
    if (!(await yes("Create it?", true))) {
      stdout.write("Cancelled — nothing written.\n");
      return;
    }

    const themeFile = brand ? writeThemeFile(name, brandThemeYaml(brand), { global }) : undefined;
    const profileFile = writeProfile(name, toYaml(profileObject(answers)), { global });
    if (makeDefault) setDefaultProfile(name, { global });

    stdout.write(`\n✓ Profile "${name}" created${makeDefault ? " (default)" : ""}.\n`);
    stdout.write(`  profile: ${profileFile}\n`);
    if (themeFile) stdout.write(`  theme:   ${themeFile}\n`);
    stdout.write(`\nNext:  pdf build invoice.yaml${makeDefault ? "" : ` --profile ${name}`}\n`);
  } finally {
    rl.close();
  }
}
