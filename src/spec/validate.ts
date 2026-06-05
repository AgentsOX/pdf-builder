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

// Every known field name across the spec — used for "did you mean?" hints.
const KNOWN_KEYS = [
  "type", "level", "text", "dir", "ordered", "items", "header", "rows", "align",
  "label", "value", "emphasis", "tex", "syntax", "kind", "title", "body", "data",
  "src", "width", "alt", "ratios", "children", "size", "logo", "pageNumbers",
  "template", "theme", "lang", "math", "blocks",
  "seller", "client", "number", "date", "currency", "vat", "lineItems", "notes",
  "labels", "description", "qty", "unitPrice", "mode", "rate", "name", "email",
  "phone", "address", "taxId",
];

function levenshtein(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

/** Only suggest a correction when it's within this many single-character edits. */
const MAX_SUGGESTION_DISTANCE = 2;
/** Serialized length of `got` beyond which we summarize it instead of inlining it. */
const GOT_PREVIEW_LIMIT = 200;

/** Closest candidate within MAX_SUGGESTION_DISTANCE edits, or null. Used for keys and values. */
function closestAmong(word: string, candidates: readonly string[]): string | null {
  let best: string | null = null;
  let bestD = MAX_SUGGESTION_DISTANCE + 1;
  for (const c of candidates) {
    const dist = levenshtein(word.toLowerCase(), c.toLowerCase());
    if (dist < bestD) {
      bestD = dist;
      best = c;
    }
  }
  return best;
}

const closestKey = (key: string) => closestAmong(key, KNOWN_KEYS);

/** Keep `got` small in the JSON envelope: summarize objects/arrays that serialize large. */
function clip(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (JSON.stringify(value).length <= GOT_PREVIEW_LIMIT) return value;
  if (Array.isArray(value)) return `[${value.length} items]`;
  const keys = Object.keys(value);
  return `{ ${keys.slice(0, 6).join(", ")}${keys.length > 6 ? ", …" : ""} }`;
}

/** A field that must be one of a fixed set — adds allowed values + a did-you-mean. */
function enumIssue(path: string, got: unknown, allowed: readonly string[]): Issue {
  const sugg = typeof got === "string" ? closestAmong(got, allowed) : null;
  const list = allowed.join(", ");
  return {
    path,
    expected: `one of: ${allowed.join(" | ")}`,
    got,
    fix: sugg ? `Set "${path}" to "${sugg}"? Allowed: ${list}.` : `Set "${path}" to one of: ${list}.`,
  };
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

  switch (issue.code) {
    case "unrecognized_keys": {
      const keys = (issue as z.core.$ZodIssueUnrecognizedKeys).keys ?? [];
      const hints = keys
        .map((k) => {
          const sugg = closestKey(k);
          return sugg ? `"${k}" (did you mean "${sugg}"?)` : `"${k}"`;
        })
        .join(", ");
      return {
        path: path === "(root)" ? keys.join(", ") : `${path}.${keys.join(",")}`,
        expected: "no unknown keys",
        got: keys,
        fix: `Remove unknown key(s) at "${path}": ${hints}.`,
      };
    }
    case "invalid_value": {
      // Enum mismatch: zod carries the allowed `values`.
      const values = (issue as { values?: unknown[] }).values;
      if (Array.isArray(values)) return enumIssue(path, got, values.map(String));
      return { path, expected: issue.message, got: clip(got), fix: `Check "${path}" — ${issue.message}.` };
    }
    case "invalid_union": {
      // Discriminated-union miss (e.g. bad block `type`): zod carries the allowed `options`.
      const options = (issue as { options?: unknown[] }).options;
      if (Array.isArray(options)) return enumIssue(path, got, options.map(String));
      return { path, expected: issue.message, got: clip(got), fix: `Check "${path}" — ${issue.message}.` };
    }
    case "invalid_type": {
      const expected = String((issue as z.core.$ZodIssueInvalidType).expected);
      const article = /^[aeiou]/.test(expected) ? "an" : "a";
      // A missing required field arrives as invalid_type with `got` undefined.
      const fix =
        got === undefined
          ? `Add the required field "${path}" (${article} ${expected}).`
          : `Set "${path}" to ${article} ${expected}.`;
      return { path, expected, got: clip(got), fix };
    }
    case "too_small":
    case "too_big":
      return { path, expected: issue.message, got: clip(got), fix: `Adjust "${path}" — ${issue.message}.` };
    default:
      return { path, expected: issue.message, got: clip(got), fix: `Fix "${path}": ${issue.message}.` };
  }
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
