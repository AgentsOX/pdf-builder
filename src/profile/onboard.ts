import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { stringify as toYaml } from "yaml";
import { profileObject, brandThemeYaml, type ProfileAnswers, type BrandAnswers } from "./scaffold.js";
import { writeProfile, writeThemeFile, setDefaultProfile } from "./load.js";

/** Interactive `pdf onboard`: build a profile (and brand theme) for a context. */
export async function runOnboard(): Promise<void> {
  const rl = createInterface({ input: stdin, output: stdout });
  const ask = async (q: string, def = "") => {
    const a = (await rl.question(def ? `${q} [${def}]: ` : `${q}: `)).trim();
    return a || def;
  };
  const yes = async (q: string, def = true) => {
    const a = (await ask(q, def ? "Y/n" : "y/N")).toLowerCase();
    return a.startsWith("y");
  };

  try {
    stdout.write("Let's set up a profile.\n\n");
    const name = await ask("Profile name", "business");
    const kind = (await ask("Kind (business/academic/personal)", "business")).toLowerCase() as ProfileAnswers["kind"];
    const global = !(await ask("Scope (global/local)", "global")).toLowerCase().startsWith("l");

    const answers: ProfileAnswers = { name, kind };
    answers.lang = await ask("Default language (e.g. en, he)", "en");
    answers.dir = ["he", "ar", "fa"].includes(answers.lang) ? "rtl" : "ltr";

    let themeFile: string | undefined;
    if (kind === "business" && (await yes("Add brand colors/logo?"))) {
      const brand: BrandAnswers = { name, primary: await ask("Brand primary color (hex)", "#2563eb") };
      const logo = await ask("Logo path (optional)");
      const heading = await ask("Heading font (optional, must be on your font path)");
      if (logo) brand.logo = logo;
      if (heading) brand.heading = heading;
      themeFile = writeThemeFile(name, brandThemeYaml(brand), { global });
      answers.theme = name;
    }

    if (kind === "business") {
      answers.seller = {
        name: await ask("Seller / business name", name),
        email: await ask("Seller email (optional)"),
        taxId: await ask("Tax ID (optional)"),
      };
      answers.currency = await ask("Currency", "USD");
      answers.vatMode = (await ask("VAT mode (exempt/standard)", "exempt")) as ProfileAnswers["vatMode"];
    } else {
      answers.math = (await ask("Math syntax (latex/typst)", "latex")) as ProfileAnswers["math"];
    }

    const profileFile = writeProfile(name, toYaml(profileObject(answers)), { global });
    const makeDefault = await yes("Set as your default profile?");
    if (makeDefault) setDefaultProfile(name, { global });

    stdout.write(`\n✓ Profile "${name}" created${makeDefault ? " (default)" : ""}.\n`);
    stdout.write(`  profile: ${profileFile}\n`);
    if (themeFile) stdout.write(`  theme:   ${themeFile}\n`);
    stdout.write(`\nTry it:  pdf build invoice.yaml${makeDefault ? "" : ` --profile ${name}`}\n`);
  } finally {
    rl.close();
  }
}
