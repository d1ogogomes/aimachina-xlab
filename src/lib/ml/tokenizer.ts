// Pure tokenizer used by the LLM Playground's Tokenizer view.
//
// Two modes are supported:
//   - "word":    one token per word / number / punctuation symbol
//   - "subword": a rule-based simulation of BPE that splits known long words
//                into subword pieces and prefixes word-initial pieces with
//                the GPT-style "Ġ" space marker.
//
// The logic is intentionally framework-free so it can be unit tested in
// isolation; the Svelte component only renders the result.

export type TokenizerMode = "word" | "subword";

export type TokenRepresentation = {
  text: string;
  id: number;
  spaceBefore: boolean;
};

// Deterministic, stable string hash. Used to assign a plausible token id to
// out-of-vocabulary words and to pick a consistent colour per token.
export function getStringHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

// Predefined vocabulary for realism (maps common words/subwords to
// authentic GPT-4-like token IDs).
const VOCAB_MAP: Record<string, number> = {
  Over: 6439,
  over: 724,
  hill: 7329,
  dale: 31201,
  Thorough: 44781,
  thorough: 18274,
  bush: 14502,
  brier: 48122,
  park: 4203,
  pale: 19483,
  flood: 12891,
  fire: 3290,
  The: 464,
  the: 262,
  dog: 5679,
  was: 373,
  hungry: 9821,
  because: 842,
  it: 366,
  "hadn't": 1982,
  eaten: 12903,
  all: 477,
  day: 1110,
  Albert: 13928,
  Einstein: 22912,
  scientist: 13812,
  physicist: 25890,
  genius: 18921,
  German: 4920,
  famous: 6203,
  FBI: 8493,
  chasing: 14930,
  criminal: 9823,
  on: 319,
  run: 1004,
  O: 53,
  Pedro: 14920,
  comprou: 38291,
  um: 429,
  livro: 21820,
  e: 259,
  leu: 19821,
  "-o": 492,
  na: 420,
  biblioteca: 33902,
};

// Subword dictionary to split words realistically.
const SUBWORD_RULES: Record<string, string[]> = {
  Thorough: ["Thor", "ough"],
  thorough: ["thor", "ough"],
  Thoroughly: ["Thor", "ough", "ly"],
  everywhere: ["every", "where"],
  Einstein: ["Eins", "tein"],
  physicist: ["physic", "ist"],
  comprou: ["com", "prou"],
  biblioteca: ["biblio", "teca"],
  University: ["Uni", "ver", "sity"],
  Texas: ["Tex", "as"],
  Austin: ["Aus", "tin"],
};

// Resolve a token id: prefer the curated vocabulary (case-insensitive
// fallback), otherwise derive a stable pseudo-id from the hash.
function resolveId(text: string): number {
  return (
    VOCAB_MAP[text] ||
    VOCAB_MAP[text.toLowerCase()] ||
    10000 + (getStringHash(text) % 89999)
  );
}

// Unicode-aware splitter:
//   - \s+              → whitespace runs
//   - [\p{L}\p{N}_]+   → "word" runs that include accented chars (pública…)
//   - [^\p{L}\p{N}\s_] → single punctuation/symbol char
// Without the `u` flag and \p{} classes, \w is ASCII-only and accented
// letters silently fall into the punctuation branch.
const WORD_RE = /(\s+|[\p{L}\p{N}_]+|[^\p{L}\p{N}\s_])/gu;
const IS_PUNCT_RE = /^[^\p{L}\p{N}_]+$/u;

export function tokenize(
  text: string,
  mode: TokenizerMode,
): TokenRepresentation[] {
  if (!text) return [];

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
    // spaceBefore: was the immediately-preceding text whitespace? Tracked via
    // a flag (rather than indexOf) so repeated words are handled correctly.
    const spaceBefore = !firstToken && prevWasSpace;
    firstToken = false;
    prevWasSpace = false;

    if (mode === "word") {
      result.push({ text: w, id: resolveId(w), spaceBefore });
      continue;
    }

    // Subword (BPE simulation).
    const isPunct = IS_PUNCT_RE.test(w);
    const rules = !isPunct && (SUBWORD_RULES[w] || SUBWORD_RULES[w.toLowerCase()]);

    if (rules) {
      rules.forEach((sub, subIdx) => {
        const lead = subIdx === 0 && spaceBefore;
        result.push({
          text: lead ? `Ġ${sub}` : sub,
          id: resolveId(sub),
          spaceBefore: lead,
        });
      });
    } else if (!isPunct && w.length > 7) {
      // Fallback split for unknown long words: split in half.
      const mid = Math.floor(w.length / 2);
      const part1 = w.slice(0, mid);
      const part2 = w.slice(mid);
      result.push({
        text: spaceBefore ? `Ġ${part1}` : part1,
        id: resolveId(part1),
        spaceBefore,
      });
      result.push({ text: part2, id: resolveId(part2), spaceBefore: false });
    } else {
      const lead = spaceBefore && !isPunct;
      result.push({
        text: lead ? `Ġ${w}` : w,
        id: resolveId(w),
        spaceBefore: lead,
      });
    }
  }

  return result;
}
