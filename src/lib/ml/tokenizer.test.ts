import { describe, it, expect } from "vitest";
import { tokenize, getStringHash } from "./tokenizer";

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

describe("tokenize - subword (BPE simulation)", () => {
  it("splits known words using subword rules", () => {
    const toks = tokenize("Thorough", "subword");
    expect(toks.map((t) => t.text)).toEqual(["Thor", "ough"]);
    expect(toks[0].spaceBefore).toBe(false);
  });

  it("prefixes word-initial subwords with the Ġ space marker", () => {
    const toks = tokenize("the Thorough", "subword");
    expect(toks.map((t) => t.text)).toEqual(["the", "ĠThor", "ough"]);
    expect(toks[1].spaceBefore).toBe(true);
    expect(toks[2].spaceBefore).toBe(false); // only the lead piece carries Ġ
  });

  it("never splits or prefixes punctuation", () => {
    const toks = tokenize("dog,", "subword");
    expect(toks.map((t) => t.text)).toEqual(["dog", ","]);
  });

  it("falls back to a half split for long unknown words", () => {
    const toks = tokenize("strawberry", "subword"); // 10 chars, no rule
    expect(toks.map((t) => t.text)).toEqual(["straw", "berry"]);
  });

  it("is deterministic", () => {
    expect(tokenize("the Thorough dog", "subword")).toEqual(
      tokenize("the Thorough dog", "subword"),
    );
  });
});
