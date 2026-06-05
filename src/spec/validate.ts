import { z } from "zod";
import { SpecSchema, type Spec } from "./schema.js";

/**
 * One uniform error/warning shape across the whole tool. Validation failures,
 * runtime warnings (chart stubs, overflow), and Typst stderr all map to this so
 * an agent always gets `path → expected → got → fix` and can self-correct.
 */
export interface Issue {
  path: string;
  expected: string;
  got: unknown;
  fix: string;
}

export class SpecError extends Error {
  issues: Issue[];
  constructor(issues: Issue[]) {
    super(`Invalid spec (${issues.length} issue${issues.length === 1 ? "" : "s"})`);
    this.name = "SpecError";
    this.issues = issues;
  }
}

function getAtPath(root: unknown, path: PropertyKey[]): unknown {
  let cur: unknown = root;
  for (const key of path) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<PropertyKey, unknown>)[key];
  }
  return cur;
}

function issueFromZod(issue: z.core.$ZodIssue, input: unknown): Issue {
  const path = issue.path.length ? issue.path.join(".") : "(root)";
  const got = issue.path.length ? getAtPath(input, issue.path) : undefined;

  let expected = issue.message;
  let fix = issue.message;

  switch (issue.code) {
    case "invalid_type":
      expected = String((issue as z.core.$ZodIssueInvalidType).expected);
      fix = `Set "${path}" to a ${expected}.`;
      break;
    case "invalid_value":
    case "invalid_union":
      expected = issue.message;
      fix = `Check "${path}" — ${issue.message}.`;
      break;
    case "too_small":
    case "too_big":
      expected = issue.message;
      fix = `Adjust "${path}" — ${issue.message}.`;
      break;
    default:
      fix = `Fix "${path}": ${issue.message}.`;
  }

  return { path, expected, got, fix };
}

/** Map a ZodError into agent-fixable issues. */
export function formatZodError(err: z.ZodError, input: unknown): Issue[] {
  return err.issues.map((i) => issueFromZod(i, input));
}

/** Validate a raw object as a Spec, throwing a SpecError with fixable issues on failure. */
export function parseSpec(input: unknown): Spec {
  const result = SpecSchema.safeParse(input);
  if (!result.success) throw new SpecError(formatZodError(result.error, input));
  return result.data;
}

/** Validate arbitrary template data against the template's own schema. */
export function parseData<T>(schema: z.ZodType<T>, input: unknown, templateName: string): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    const issues = formatZodError(result.error, input).map((i) => ({
      ...i,
      path: `data.${i.path === "(root)" ? "" : i.path}`.replace(/\.$/, ""),
      fix: `${i.fix} (template "${templateName}")`,
    }));
    throw new SpecError(issues);
  }
  return result.data;
}
