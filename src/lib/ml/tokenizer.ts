// Tokenizer used by the LLM Playground's Tokenizer view.
//
// Two modes:
//   - "word":    naive split (one token per word / number / punctuation).
//                The "before" picture: how a person might split text.
//   - "subword": the REAL GPT-2 byte-level BPE (r50k_base) via gpt-tokenizer.
//                Real token ids, real merges, real leading-space handling.
//
// The BPE merge table (~1 MB) is loaded lazily the first time subword mode is
// used, so it never weighs on the initial page load. Call `ensureBpe()` and
// await it before calling `tokenize(text, "subword")`.

export type TokenizerMode = "word" | "subword";

export type TokenRepresentation = {
  text: string;
  id: number;
  spaceBefore: boolean;
};

// Deterministic, stable string hash. Used by the UI to pick a consistent
// colour per token, and to assign a plausible id to out-of-vocab words in
// naive "word" mode.
export function getStringHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

// Curated GPT-style ids for common words, used only by naive "word" mode so
// the ids look authentic. Real BPE mode uses the model's actual ids.
const VOCAB_MAP: Record<string, number> = {
  The: 464, the: 262, dog: 5679, was: 373, hungry: 9821, because: 842,
  it: 366, all: 477, day: 1110, on: 319, run: 1004,
  O: 53, um: 429, e: 259, na: 420,
};

function resolveId(text: string): number {
  return (
    VOCAB_MAP[text] ||
    VOCAB_MAP[text.toLowerCase()] ||
    10000 + (getStringHash(text) % 89999)
  );
}

// Unicode-aware splitter for naive mode:
//   - \s+              → whitespace runs
//   - [\p{L}\p{N}_]+   → word runs incl. accented chars (pública…)
//   - [^\p{L}\p{N}\s_] → single punctuation/symbol char
const WORD_RE = /(\s+|[\p{L}\p{N}_]+|[^\p{L}\p{N}\s_])/gu;

function tokenizeWords(text: string): TokenRepresentation[] {
  const re = new RegExp(WORD_RE.source, WORD_RE.flags);
  const result: TokenRepresentation[] = [];
  let m: RegExpExecArray | null;
  let prevWasSpace = false;
  let firstToken = true;

  while ((m = re.exec(text)) !== null) {
    const w = m[0];
    if (/^\s+$/.test(w)) {
      prevWasSpace = true;
      continue;
    }
    const spaceBefore = !firstToken && prevWasSpace;
    firstToken = false;
    prevWasSpace = false;
    result.push({ text: w, id: resolveId(w), spaceBefore });
  }
  return result;
}

// ─── Real GPT-2 BPE (lazy-loaded) ──────────────────────────────
type Bpe = { encode: (t: string) => number[]; decode: (ids: number[]) => string };
let bpe: Bpe | null = null;
let bpePromise: Promise<void> | null = null;

export function isBpeReady(): boolean {
  return bpe !== null;
}

// Loads the r50k_base (GPT-2) encoding once and caches it. Safe to call repeatedly.
export function ensureBpe(): Promise<void> {
  if (bpe) return Promise.resolve();
  if (!bpePromise) {
    bpePromise = import("gpt-tokenizer/encoding/r50k_base").then((m) => {
      bpe = { encode: m.encode, decode: m.decode };
    });
  }
  return bpePromise;
}

function tokenizeBpe(text: string): TokenRepresentation[] {
  if (!bpe) return []; // not loaded yet — caller shows a loading state
  return bpe.encode(text).map((id) => {
    const piece = bpe!.decode([id]);
    const spaceBefore = piece.startsWith(" ");
    return {
      // GPT-2 marks a leading space with "Ġ" for display; mirror that here.
      text: spaceBefore ? "Ġ" + piece.slice(1) : piece,
      id,
      spaceBefore,
    };
  });
}

export function tokenize(
  text: string,
  mode: TokenizerMode,
): TokenRepresentation[] {
  if (!text) return [];
  return mode === "subword" ? tokenizeBpe(text) : tokenizeWords(text);
}
