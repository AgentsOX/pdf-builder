import { describe, it, expect } from "vitest";
import { resolveFontArgs, looksLikeFont, FONT_PACKS } from "../src/fonts.js";

describe("fonts add (resolution + validation, no network)", () => {
  it("expands a known pack to its URLs", () => {
    const urls = resolveFontArgs(["cm"]);
    expect(urls.length).toBe(FONT_PACKS.cm.length);
    expect(urls.every((u) => u.endsWith(".otf"))).toBe(true);
  });

  it("passes a direct URL through unchanged", () => {
    expect(resolveFontArgs(["https://example.com/Brand.ttf"])).toEqual(["https://example.com/Brand.ttf"]);
  });

  it("rejects an unknown pack with guidance", () => {
    expect(() => resolveFontArgs(["nope"])).toThrow(/Unknown font pack/);
  });

  it("magic-byte check accepts fonts and rejects an HTML 404 page", () => {
    expect(looksLikeFont(Buffer.from("OTTO____"))).toBe(true); // CFF OpenType
    expect(looksLikeFont(Buffer.from([0x00, 0x01, 0x00, 0x00]))).toBe(true); // TrueType
    expect(looksLikeFont(Buffer.from("<!DOCTYPE html>"))).toBe(false);
  });
});
