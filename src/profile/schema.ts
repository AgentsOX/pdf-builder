import { z } from "zod";

/**
 * A profile is a named context (business / academic / side-project): a theme
 * plus document defaults plus reusable template identity (e.g. invoice seller).
 * Strict, so typos surface as fixable errors.
 */
export const ProfileSchema = z
  .object({
    name: z.string().optional(),
    description: z.string().optional(),
    /** Theme name (resolved from the config themes dirs) or a theme file path. */
    theme: z.string().optional(),
    /** Extra font directories (resolved relative to the profile file). */
    fontPaths: z.array(z.string()).optional(),
    /** Default output directory for renders. */
    out: z.string().optional(),
    /** Default PDF standard (e.g. "a-2b"). */
    pdfStandard: z.string().optional(),
    /** Document-level defaults applied unless the spec overrides them. */
    defaults: z
      .object({
        lang: z.string(),
        dir: z.enum(["ltr", "rtl"]),
        math: z.enum(["latex", "typst"]),
      })
      .partial()
      .strict()
      .optional(),
    /**
     * Per-template default data, deep-merged under each spec's `data`
     * (the spec wins). E.g. { invoice: { seller: {...}, currency: "ILS",
     * vat: { mode: "standard" }, labels: {...} } }.
     */
    template: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type Profile = z.infer<typeof ProfileSchema>;
