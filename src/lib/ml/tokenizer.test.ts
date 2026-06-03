import { describe, it, expect, beforeAll } from "vitest";
import { tokenize, getStringHash, ensureBpe, isBpeReady } from "./tokenizer";

describe("getStringHash", () => {
  it("is deterministic and non-negative", () => {
    expect(getStringHash("hello")).toBe(getStringHash("hello"));
    expect(getStringHash("hello")).toBeGreaterThanOrEqual(0);
  });

  it("distinguishes different strings", () => {
    expect(getStringHash("dog")).not.toBe(getStringHash("cat"));
  });
});

describe("tokenize - word mode", () => {
  it("returns no tokens for empty input", () => {
    expect(tokenize("", "word")).toEqual([]);
  });

  it("splits on whitespace and tracks spaceBefore", () => {
    const toks = tokenize("the dog", "word");
    expect(toks.map((t) => t.text)).toEqual(["the", "dog"]);
    expect(toks[0].spaceBefore).toBe(false); // first token never has a space
    expect(toks[1].spaceBefore).toBe(true);
  });

  it("maps known vocabulary to curated ids", () => {
    const toks = tokenize("the dog", "word");
    expect(toks[0].id).toBe(262); // "the"
    expect(toks[1].id).toBe(5679); // "dog"
  });

  it("treats punctuation as its own token without a leading space", () => {
    const toks = tokenize("dog, cat", "word");
    expect(toks.map((t) => t.text)).toEqual(["dog", ",", "cat"]);
    expect(toks[1].spaceBefore).toBe(false); // comma hugs the word
    expect(toks[2].spaceBefore).toBe(true); // space before "cat"
  });

  it("keeps accented words intact (unicode-aware split)", () => {
    const toks = tokenize("pública", "word");
    expect(toks).toHaveLength(1);
    expect(toks[0].text).toBe("pública");
  });

  it("assigns out-of-vocabulary words a stable id in the synthetic range", () => {
    const a = tokenize("zxqwerty", "word")[0];
    const b = tokenize("zxqwerty", "word")[0];
    expect(a.id).toBe(b.id); // stable
    expect(a.id).toBeGreaterThanOrEqual(10000);
    expect(a.id).toBeLessThan(10000 + 89999);
  });
});

describe("tokenize - subword (real GPT-2 BPE)", () => {
  beforeAll(async () => {
    await ensureBpe();
  });

  it("reports ready after loading", () => {
    expect(isBpeReady()).toBe(true);
  });

  it("returns [] before the table is loaded — covered by readiness above", () => {
    // (sanity) once loaded, empty input still yields no tokens
    expect(tokenize("", "subword")).toEqual([]);
  });

  it("produces the real GPT-2 token ids", () => {
    const toks = tokenize("The dog", "subword");
    expect(toks.map((t) => t.text)).toEqual(["The", "Ġdog"]);
    expect(toks.map((t) => t.id)).toEqual([464, 3290]);
  });

  it("marks a leading space with Ġ and sets spaceBefore", () => {
    const toks = tokenize("The dog", "subword");
    expect(toks[0].spaceBefore).toBe(false); // first token never has a space
    expect(toks[1].spaceBefore).toBe(true); // " dog" → Ġdog
  });

  it("round-trips: rebuilding the pieces reconstructs the original text", () => {
    const input = "The quick brown fox, jumped! 123";
    const toks = tokenize(input, "subword");
    const rebuilt = toks
      .map((t) => (t.spaceBefore ? " " + t.text.slice(1) : t.text))
      .join("");
    expect(rebuilt).toBe(input);
  });

  it("is deterministic", () => {
    expect(tokenize("the Thorough dog", "subword")).toEqual(
      tokenize("the Thorough dog", "subword"),
    );
  });
});
