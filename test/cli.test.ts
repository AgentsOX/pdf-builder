import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { hasTypst } from "../src/typst.js";

// These spawn the built binary, so they pin the agent-facing contract end to end.
// Gated on a build having run (CI builds before test); hermetic config dir.
const CLI = "dist/cli.js";
const haveCli = existsSync(CLI);
const CONFIG = resolve("out", "cli-test-config");

function run(args: string[]): { code: number; stdout: string } {
  try {
    const stdout = execFileSync("node", [CLI, ...args], {
      encoding: "utf8",
      env: { ...process.env, PDF_BUILDER_CONFIG_HOME: CONFIG },
    });
    return { code: 0, stdout };
  } catch (e) {
    const err = e as { status?: number; stdout?: string };
    return { code: err.status ?? 1, stdout: err.stdout ?? "" };
  }
}

describe.skipIf(!haveCli)("cli --json contract", () => {
  beforeAll(() => {
    rmSync(CONFIG, { recursive: true, force: true });
    mkdirSync("out", { recursive: true });
  });

  it("themes --json → { ok, themes }", () => {
    const r = run(["themes", "--json"]);
    const j = JSON.parse(r.stdout);
    expect(j.ok).toBe(true);
    expect(Array.isArray(j.themes)).toBe(true);
    expect(r.code).toBe(0);
  });

  it("guide --json → playbook with schema + paths", () => {
    const j = JSON.parse(run(["guide", "--json"]).stdout);
    expect(j.ok).toBe(true);
    expect(j.workflow.length).toBeGreaterThan(0);
    expect(j.schema).toBeTruthy();
    expect(j.paths.profiles.global).toBeTruthy();
  });

  it("profile list --json on a fresh config → empty", () => {
    const j = JSON.parse(run(["profile", "list", "--json"]).stdout);
    expect(j.ok).toBe(true);
    expect(j.profiles).toEqual([]);
    expect(j.default).toBe(null);
  });

  it("build invalid spec --json → ok:false, error.kind=validation, exit 1", () => {
    const bad = join("out", "cli-bad.json");
    writeFileSync(bad, JSON.stringify({ blocks: [{ type: "heading", titl: "x" }] }));
    const r = run(["build", bad, "--no-profile", "--json"]);
    const j = JSON.parse(r.stdout);
    expect(j.ok).toBe(false);
    expect(j.error.kind).toBe("validation");
    expect(r.code).toBe(1);
  });

  it("build missing file --json → error.kind=io", () => {
    const j = JSON.parse(run(["build", "out/does-not-exist.yaml", "--no-profile", "--json"]).stdout);
    expect(j.error.kind).toBe("io");
  });
});

describe.skipIf(!haveCli || !hasTypst())("cli build success contract", () => {
  it("build invoice --json → ok + manifest hashes", () => {
    const r = run(["build", "examples/invoice.yaml", "--no-profile", "--out", join("out", "cli"), "--basename", "ci", "--json"]);
    const j = JSON.parse(r.stdout);
    expect(j.ok).toBe(true);
    expect(j.pdf_path).toMatch(/\.pdf$/);
    expect(j.manifest.hashes.output).toMatch(/^[0-9a-f]{64}$/);
    expect(r.code).toBe(0);
  });
});
