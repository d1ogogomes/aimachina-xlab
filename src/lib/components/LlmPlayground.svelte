<script lang="ts">
  import { t, locale } from '../i18n';

  // Sub-tabs within the LLM Playground
  let activeSubTab: 'tokenizer' | 'decoding' = 'tokenizer';

  $: currentLangCode = $locale || 'pt';

  // ─── PART 1: TOKENIZER STATE ──────────────────────────────
  const DEFAULT_TOKEN_INPUTS: Record<string, string> = {
    en: "Over hill, over dale, Thorough bush, thorough brier, Over park, over pale, Thorough flood, thorough fire!",
    pt: "O Pedro comprou um livro e leu-o na biblioteca pública perto da universidade.",
    fr: "Par les monts, par les vaux, à travers les buissons et les ronces, par-delà les parcs, par-delà les barrières."
  };

  let tokenInput = "";
  let tokenizerMode: 'word' | 'subword' = 'word';
  let hoveredTokenIdx: number | null = null;

  let lastLocale = 'pt';
  $: {
    // Keep the default-locale fallback aligned with i18n.ts (writable('pt'))
    // and with currentLangCode below — previously this used 'en', causing
    // lastLocale ('pt') and currentLocale ('en') to disagree on first mount
    // when the user had not yet picked a language.
    const currentLocale = $locale || 'pt';
    const prevDefault = DEFAULT_TOKEN_INPUTS[lastLocale];
    const newDefault = DEFAULT_TOKEN_INPUTS[currentLocale] || DEFAULT_TOKEN_INPUTS.pt;
    if (!tokenInput || tokenInput === prevDefault) {
      tokenInput = newDefault;
    }
    lastLocale = currentLocale;
  }

  // Simple deterministic hash for arbitrary strings (for IDs)
  function getStringHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return Math.abs(hash);
  }

  // Predefined vocabulary for realism (maps common words/subwords to authentic GPT-4-like token IDs)
  const VOCAB_MAP: Record<string, number> = {
    "Over": 6439, "over": 724, "hill": 7329, "dale": 31201, "Thorough": 44781,
    "thorough": 18274, "bush": 14502, "brier": 48122, "park": 4203, "pale": 19483,
    "flood": 12891, "fire": 3290, "The": 464, "the": 262, "dog": 5679, "was": 373,
    "hungry": 9821, "because": 842, "it": 366, "hadn't": 1982, "eaten": 12903,
    "all": 477, "day": 1110, "Albert": 13928, "Einstein": 22912, "scientist": 13812,
    "physicist": 25890, "genius": 18921, "German": 4920, "famous": 6203,
    "FBI": 8493, "chasing": 14930, "criminal": 9823, "on": 319, "run": 1004,
    "O": 53, "Pedro": 14920, "comprou": 38291, "um": 429, "livro": 21820,
    "e": 259, "leu": 19821, "-o": 492, "na": 420, "biblioteca": 33902
  };

  // Subword dictionary to split words realistically
  const SUBWORD_RULES: Record<string, string[]> = {
    "Thorough": ["Thor", "ough"],
    "thorough": ["thor", "ough"],
    "Thoroughly": ["Thor", "ough", "ly"],
    "everywhere": ["every", "where"],
    "Einstein": ["Eins", "tein"],
    "physicist": ["physic", "ist"],
    "comprou": ["com", "prou"],
    "biblioteca": ["biblio", "teca"],
    "University": ["Uni", "ver", "sity"],
    "Texas": ["Tex", "as"],
    "Austin": ["Aus", "tin"]
  };

  // Color mapping based on token hash to keep same tokens colored identically
  function getTokenBgClass(token: string): string {
    const colors = [
      'bg-indigo-100/80 border-indigo-200 text-indigo-900',
      'bg-emerald-100/80 border-emerald-200 text-emerald-900',
      'bg-amber-100/80 border-amber-200 text-amber-900',
      'bg-rose-100/80 border-rose-200 text-rose-900',
      'bg-sky-100/80 border-sky-200 text-sky-900',
      'bg-slate-100/80 border-slate-200 text-slate-900',
      'bg-orange-100/80 border-orange-200 text-orange-900',
      'bg-teal-100/80 border-teal-200 text-teal-900',
    ];
    const hash = getStringHash(token);
    return colors[hash % colors.length];
  }

  // Token definition
  type TokenRepresentation = {
    text: string;
    id: number;
    spaceBefore: boolean;
  };

  // Reactive tokenization
  $: tokens = (() => {
    if (!tokenInput) return [] as TokenRepresentation[];

    // Unicode-aware splitter:
    //   - \s+              → whitespace runs
    //   - [\p{L}\p{N}_]+   → "word" runs that include accented chars (pública, dégagé, fome…)
    //   - [^\p{L}\p{N}\s_] → single punctuation/symbol char
    // Without the `u` flag and \p{} classes, \w is ASCII-only and accented
    // letters silently fall into the punctuation branch — "pública" was being
    // shredded into ["p", "ú", "blica"] in the PT default input.
    const wordRe = /(\s+|[\p{L}\p{N}_]+|[^\p{L}\p{N}\s_])/gu;

    if (tokenizerMode === 'word') {
      const result: TokenRepresentation[] = [];
      let m: RegExpExecArray | null;
      let prevWasSpace = false;
      let firstToken = true;
      while ((m = wordRe.exec(tokenInput)) !== null) {
        const w = m[0];
        if (/^\s+$/.test(w)) {
          prevWasSpace = true;
          continue;
        }
        // spaceBefore: was the immediately-preceding text whitespace?
        // Using indexOf(w) here was buggy: for repeated words like "the … the"
        // every occurrence picked up the position of the FIRST occurrence,
        // so spaceBefore (and Ġ in subword mode) was wrong on duplicates.
        const spaceBefore = !firstToken && prevWasSpace;
        firstToken = false;
        prevWasSpace = false;

        let id = VOCAB_MAP[w] || VOCAB_MAP[w.toLowerCase()];
        if (!id) {
          id = 10000 + (getStringHash(w) % 89999);
        }
        result.push({ text: w, id, spaceBefore });
      }
      return result;
    } else {
      // Subword BPE simulation: Break longer words
      const result: TokenRepresentation[] = [];
      let m: RegExpExecArray | null;
      let prevWasSpace = false;
      let firstToken = true;
      while ((m = wordRe.exec(tokenInput)) !== null) {
        const w = m[0];
        if (/^\s+$/.test(w)) {
          prevWasSpace = true;
          continue;
        }

        const spaceBefore = !firstToken && prevWasSpace;
        firstToken = false;
        prevWasSpace = false;

        // Punctuation and symbols never get split or prefixed with Ġ
        const isPunct = /^[^\p{L}\p{N}_]+$/u.test(w);

        // Simulated BPE Rule-based Split
        const rules = !isPunct && (SUBWORD_RULES[w] || SUBWORD_RULES[w.toLowerCase()]);
        if (rules) {
          rules.forEach((sub, subIdx) => {
            const cleanSub = sub;
            const displaySub = (subIdx === 0 && spaceBefore) ? `Ġ${cleanSub}` : cleanSub;
            let id = VOCAB_MAP[cleanSub] || VOCAB_MAP[cleanSub.toLowerCase()];
            if (!id) {
              id = 10000 + (getStringHash(cleanSub) % 89999);
            }
            result.push({ text: displaySub, id, spaceBefore: subIdx === 0 && spaceBefore });
          });
        } else if (!isPunct && w.length > 7) {
          // Fallback split for unknown long words: split in half
          const mid = Math.floor(w.length / 2);
          const part1 = w.slice(0, mid);
          const part2 = w.slice(mid);

          const displayPart1 = spaceBefore ? `Ġ${part1}` : part1;
          const id1 = 10000 + (getStringHash(part1) % 89999);
          const id2 = 10000 + (getStringHash(part2) % 89999);

          result.push({ text: displayPart1, id: id1, spaceBefore });
          result.push({ text: part2, id: id2, spaceBefore: false });
        } else {
          const displayText = (spaceBefore && !isPunct) ? `Ġ${w}` : w;
          let id = VOCAB_MAP[w] || VOCAB_MAP[w.toLowerCase()];
          if (!id) {
            id = 10000 + (getStringHash(w) % 89999);
          }
          result.push({ text: displayText, id, spaceBefore: spaceBefore && !isPunct });
        }
      }
      return result;
    }
  })();

  $: totalChars = tokenInput.length;
  $: totalTokens = tokens.length;
  $: avgCharsPerToken = totalTokens > 0 ? (totalChars / totalTokens).toFixed(1) : "0.0";
  $: estimatedCost = totalTokens > 0 ? ((totalTokens / 1000000) * 2.50).toFixed(6) : "0.000000";

  type PromptPreset = {
    lang: 'en' | 'pt' | 'fr';
    title: string;
    text: string;
    candidates: { word: string; logit: number }[];
    transitions: Record<string, { word: string; logit: number }[]>;
  };

  const PROMPT_PRESETS: PromptPreset[] = [
    // --- ENGLISH ---
    {
      lang: "en",
      title: "The sky is...",
      text: "The sky is",
      candidates: [
        { word: "blue", logit: 4.8 },
        { word: "cloudy", logit: 3.5 },
        { word: "clear", logit: 3.1 },
        { word: "dark", logit: 2.8 },
        { word: "falling", logit: 1.8 },
        { word: "purple", logit: 1.2 },
        { word: "banana", logit: -2.5 },
        { word: "running", logit: -3.0 }
      ],
      transitions: {
        "blue": [
          { word: "and", logit: 4.5 },
          { word: "today", logit: 3.0 },
          { word: "with", logit: 2.5 }
        ],
        "cloudy": [
          { word: "with", logit: 4.8 },
          { word: "and", logit: 3.2 },
          { word: "over", logit: 2.0 }
        ],
        "clear": [
          { word: "and", logit: 4.6 },
          { word: "tonight", logit: 3.8 },
          { word: "with", logit: 2.2 }
        ],
        "dark": [
          { word: "and", logit: 4.2 },
          { word: "as", logit: 3.5 },
          { word: "outside", logit: 3.0 }
        ],
        "falling": [
          { word: "down", logit: 5.0 },
          { word: "on", logit: 3.2 },
          { word: "slowly", logit: 2.8 }
        ],
        "and": [
          { word: "beautiful", logit: 4.0 },
          { word: "bright", logit: 3.8 },
          { word: "windy", logit: 3.5 },
          { word: "cold", logit: 3.2 }
        ],
        "with": [
          { word: "some", logit: 4.2 },
          { word: "white", logit: 3.8 },
          { word: "heavy", logit: 3.5 },
          { word: "clouds", logit: 3.0 }
        ],
        "tonight": [
          { word: "in", logit: 4.0 },
          { word: "after", logit: 3.2 },
          { word: "across", logit: 2.8 }
        ],
        "beautiful": [
          { word: "today", logit: 4.5 },
          { word: "with", logit: 3.5 },
          { word: "and", logit: 3.0 },
          { word: ".", logit: 2.5 }
        ]
      }
    },
    {
      lang: "en",
      title: "Albert Einstein was...",
      text: "Albert Einstein was a",
      candidates: [
        { word: "physicist", logit: 5.2 },
        { word: "genius", logit: 4.5 },
        { word: "German", logit: 3.8 },
        { word: "famous", logit: 3.5 },
        { word: "scientist", logit: 3.2 },
        { word: "violinist", logit: 1.5 },
        { word: "skateboarder", logit: -3.5 },
        { word: "politician", logit: -1.2 }
      ],
      transitions: {
        "physicist": [
          { word: "who", logit: 4.8 },
          { word: "known", logit: 4.0 },
          { word: "born", logit: 3.0 }
        ],
        "genius": [
          { word: "who", logit: 4.5 },
          { word: "and", logit: 3.8 },
          { word: "with", logit: 2.5 }
        ],
        "German": [
          { word: "physicist", logit: 5.0 },
          { word: "scientist", logit: 4.2 },
          { word: "man", logit: 2.8 }
        ],
        "famous": [
          { word: "physicist", logit: 4.8 },
          { word: "for", logit: 4.5 },
          { word: "scientist", logit: 4.0 }
        ],
        "scientist": [
          { word: "who", logit: 4.8 },
          { word: "of", logit: 3.5 },
          { word: "active", logit: 2.5 }
        ],
        "who": [
          { word: "discovered", logit: 5.0 },
          { word: "formulated", logit: 4.8 },
          { word: "developed", logit: 4.5 },
          { word: "changed", logit: 4.0 }
        ],
        "discovered": [
          { word: "relativity", logit: 5.5 },
          { word: "the", logit: 4.0 },
          { word: "photoelectric", logit: 3.8 }
        ],
        "formulated": [
          { word: "the", logit: 4.8 },
          { word: "theory", logit: 4.5 },
          { word: "equation", logit: 4.0 }
        ],
        "theory": [
          { word: "of", logit: 5.2 },
          { word: "about", logit: 3.0 },
          { word: ".", logit: 2.5 }
        ],
        "of": [
          { word: "relativity", logit: 5.8 },
          { word: "general", logit: 4.5 },
          { word: "quantum", logit: 4.0 }
        ],
        "relativity": [
          { word: "in", logit: 4.2 },
          { word: "which", logit: 3.8 },
          { word: ".", logit: 3.5 }
        ],
        "for": [
          { word: "his", logit: 4.8 },
          { word: "discovering", logit: 4.0 },
          { word: "the", logit: 3.5 }
        ],
        "his": [
          { word: "theory", logit: 4.6 },
          { word: "equation", logit: 4.2 },
          { word: "hair", logit: 3.8 },
          { word: "contributions", logit: 3.5 }
        ]
      }
    },
    {
      lang: "en",
      title: "Artificial Intelligence...",
      text: "Artificial Intelligence is",
      candidates: [
        { word: "incredible", logit: 4.5 },
        { word: "powerful", logit: 4.2 },
        { word: "complex", logit: 3.8 },
        { word: "useful", logit: 3.5 },
        { word: "dangerous", logit: 2.8 },
        { word: "revolutionary", logit: 2.5 },
        { word: "a", logit: 2.0 },
        { word: "potato", logit: -3.0 }
      ],
      transitions: {
        "incredible": [
          { word: "and", logit: 4.5 },
          { word: "because", logit: 3.2 },
          { word: ".", logit: 2.5 }
        ],
        "powerful": [
          { word: "tool", logit: 4.8 },
          { word: "and", logit: 3.5 },
          { word: "technology", logit: 3.0 }
        ],
        "complex": [
          { word: "to", logit: 4.5 },
          { word: "and", logit: 3.2 },
          { word: "for", logit: 2.8 }
        ],
        "useful": [
          { word: "for", logit: 4.8 },
          { word: "in", logit: 3.8 },
          { word: "and", logit: 3.5 }
        ],
        "dangerous": [
          { word: "if", logit: 4.5 },
          { word: "for", logit: 3.0 },
          { word: "but", logit: 2.8 }
        ],
        "and": [
          { word: "transformative", logit: 4.0 },
          { word: "fast", logit: 3.8 },
          { word: "efficient", logit: 3.5 },
          { word: "can", logit: 3.2 }
        ],
        "for": [
          { word: "the", logit: 4.5 },
          { word: "helping", logit: 4.0 },
          { word: "automating", logit: 3.8 },
          { word: "us", logit: 3.5 }
        ],
        "helping": [
          { word: "to", logit: 4.5 },
          { word: "people", logit: 3.8 },
          { word: "society", logit: 3.5 }
        ],
        "to": [
          { word: "create", logit: 4.5 },
          { word: "solve", logit: 4.2 },
          { word: "improve", logit: 3.8 }
        ]
      }
    },
    // --- PORTUGUESE ---
    {
      lang: "pt",
      title: "O céu está...",
      text: "O céu está",
      candidates: [
        { word: "azul", logit: 4.8 },
        { word: "nublado", logit: 3.5 },
        { word: "limpo", logit: 3.1 },
        { word: "escuro", logit: 2.8 },
        { word: "a cair", logit: 1.8 },
        { word: "roxo", logit: 1.2 },
        { word: "banana", logit: -2.5 },
        { word: "a correr", logit: -3.0 }
      ],
      transitions: {
        "azul": [
          { word: "e", logit: 4.5 },
          { word: "hoje", logit: 3.0 },
          { word: "com", logit: 2.5 }
        ],
        "nublado": [
          { word: "com", logit: 4.8 },
          { word: "e", logit: 3.2 },
          { word: "sobre", logit: 2.0 }
        ],
        "limpo": [
          { word: "e", logit: 4.6 },
          { word: "esta noite", logit: 3.8 },
          { word: "com", logit: 2.2 }
        ],
        "escuro": [
          { word: "e", logit: 4.2 },
          { word: "como", logit: 3.5 },
          { word: "lá fora", logit: 3.0 }
        ],
        "a cair": [
          { word: "sobre", logit: 5.0 },
          { word: "em", logit: 3.2 },
          { word: "lentamente", logit: 2.8 }
        ],
        "e": [
          { word: "belo", logit: 4.0 },
          { word: "brilhante", logit: 3.8 },
          { word: "frio", logit: 3.5 },
          { word: "ventoso", logit: 3.2 }
        ],
        "com": [
          { word: "algumas", logit: 4.2 },
          { word: "nuvens", logit: 3.8 },
          { word: "estrelas", logit: 3.5 },
          { word: "nevoeiro", logit: 3.0 }
        ],
        "hoje": [
          { word: "em", logit: 4.0 },
          { word: "depois", logit: 3.2 },
          { word: "por", logit: 2.8 }
        ],
        "belo": [
          { word: "hoje", logit: 4.5 },
          { word: "com", logit: 3.5 },
          { word: "e", logit: 3.0 },
          { word: ".", logit: 2.5 }
        ]
      }
    },
    {
      lang: "pt",
      title: "Albert Einstein foi...",
      text: "Albert Einstein foi um",
      candidates: [
        { word: "físico", logit: 5.2 },
        { word: "gênio", logit: 4.5 },
        { word: "alemão", logit: 3.8 },
        { word: "famoso", logit: 3.5 },
        { word: "cientista", logit: 3.2 },
        { word: "violinista", logit: 1.5 },
        { word: "skatista", logit: -3.5 },
        { word: "político", logit: -1.2 }
      ],
      transitions: {
        "físico": [
          { word: "que", logit: 4.8 },
          { word: "conhecido", logit: 4.0 },
          { word: "nascido", logit: 3.0 }
        ],
        "gênio": [
          { word: "que", logit: 4.5 },
          { word: "e", logit: 3.8 },
          { word: "com", logit: 2.5 }
        ],
        "alemão": [
          { word: "físico", logit: 5.0 },
          { word: "cientista", logit: 4.2 },
          { word: "brilhante", logit: 2.8 }
        ],
        "famoso": [
          { word: "físico", logit: 4.8 },
          { word: "por", logit: 4.5 },
          { word: "cientista", logit: 4.0 }
        ],
        "cientista": [
          { word: "que", logit: 4.8 },
          { word: "de", logit: 3.5 },
          { word: "ativo", logit: 2.5 }
        ],
        "que": [
          { word: "descobriu", logit: 5.0 },
          { word: "formulou", logit: 4.8 },
          { word: "desenvolveu", logit: 4.5 },
          { word: "mudou", logit: 4.0 }
        ],
        "descobriu": [
          { word: "a relatividade", logit: 5.5 },
          { word: "o", logit: 4.0 },
          { word: "efeito", logit: 3.8 }
        ],
        "formulou": [
          { word: "a", logit: 4.8 },
          { word: "teoria", logit: 4.5 },
          { word: "equação", logit: 4.0 }
        ],
        "teoria": [
          { word: "da", logit: 5.2 },
          { word: "sobre", logit: 3.0 },
          { word: ".", logit: 2.5 }
        ],
        "da": [
          { word: "relatividade", logit: 5.8 },
          { word: "mecânica", logit: 4.5 },
          { word: "física", logit: 4.0 }
        ],
        "relatividade": [
          { word: "em", logit: 4.2 },
          { word: "que", logit: 3.8 },
          { word: ".", logit: 3.5 }
        ],
        "por": [
          { word: "sua", logit: 4.8 },
          { word: "descobrir", logit: 4.0 },
          { word: "ter", logit: 3.5 }
        ],
        "sua": [
          { word: "teoria", logit: 4.6 },
          { word: "equação", logit: 4.2 },
          { word: "vida", logit: 3.8 }
        ]
      }
    },
    {
      lang: "pt",
      title: "Inteligência Artificial...",
      text: "A Inteligência Artificial é",
      candidates: [
        { word: "incrível", logit: 4.5 },
        { word: "poderosa", logit: 4.2 },
        { word: "complexa", logit: 3.8 },
        { word: "útil", logit: 3.5 },
        { word: "perigosa", logit: 2.8 },
        { word: "revolucionária", logit: 2.5 },
        { word: "uma", logit: 2.0 },
        { word: "batata", logit: -3.0 }
      ],
      transitions: {
        "incrível": [
          { word: "e", logit: 4.5 },
          { word: "porque", logit: 3.2 },
          { word: ".", logit: 2.5 }
        ],
        "poderosa": [
          { word: "ferramenta", logit: 4.8 },
          { word: "e", logit: 3.5 },
          { word: "tecnologia", logit: 3.0 }
        ],
        "complexa": [
          { word: "de", logit: 4.5 },
          { word: "e", logit: 3.2 },
          { word: "para", logit: 2.8 }
        ],
        "útil": [
          { word: "para", logit: 4.8 },
          { word: "no", logit: 3.8 },
          { word: "e", logit: 3.5 }
        ],
        "perigosa": [
          { word: "se", logit: 4.5 },
          { word: "para", logit: 3.0 },
          { word: "mas", logit: 2.8 }
        ],
        "e": [
          { word: "transformadora", logit: 4.0 },
          { word: "rápida", logit: 3.8 },
          { word: "eficiente", logit: 3.5 },
          { word: "pode", logit: 3.2 }
        ],
        "para": [
          { word: "o", logit: 4.5 },
          { word: "ajudar", logit: 4.0 },
          { word: "automatizar", logit: 3.8 },
          { word: "as", logit: 3.5 }
        ],
        "ajudar": [
          { word: "a", logit: 4.5 },
          { word: "os", logit: 3.8 },
          { word: "na", logit: 3.5 }
        ],
        "a": [
          { word: "sociedade", logit: 4.5 },
          { word: "humanidade", logit: 4.2 },
          { word: "criar", logit: 3.8 },
          { word: "resolver", logit: 3.5 }
        ],
        "sociedade": [
          { word: "moderna", logit: 4.5 },
          { word: "a", logit: 3.0 },
          { word: ".", logit: 2.5 }
        ]
      }
    },
    // --- FRENCH ---
    {
      lang: "fr",
      title: "Le ciel est...",
      text: "Le ciel est",
      candidates: [
        { word: "bleu", logit: 4.8 },
        { word: "nuageux", logit: 3.5 },
        { word: "dégagé", logit: 3.1 },
        { word: "sombre", logit: 2.8 },
        { word: "en train de tomber", logit: 1.8 },
        { word: "violet", logit: 1.2 },
        { word: "une banane", logit: -2.5 },
        { word: "en train de courir", logit: -3.0 }
      ],
      transitions: {
        "bleu": [
          { word: "et", logit: 4.5 },
          { word: "aujourd'hui", logit: 3.0 },
          { word: "avec", logit: 2.5 }
        ],
        "nuageux": [
          { word: "avec", logit: 4.8 },
          { word: "et", logit: 3.2 },
          { word: "au-dessus", logit: 2.0 }
        ],
        "dégagé": [
          { word: "et", logit: 4.6 },
          { word: "ce soir", logit: 3.8 },
          { word: "avec", logit: 2.2 }
        ],
        "sombre": [
          { word: "et", logit: 4.2 },
          { word: "comme", logit: 3.5 },
          { word: "dehors", logit: 3.0 }
        ],
        "et": [
          { word: "beau", logit: 4.0 },
          { word: "lumineux", logit: 3.8 },
          { word: "froid", logit: 3.5 },
          { word: "venteux", logit: 3.2 }
        ],
        "avec": [
          { word: "quelques", logit: 4.2 },
          { word: "nuages", logit: 3.8 },
          { word: "étoiles", logit: 3.5 },
          { word: "brouillard", logit: 3.0 }
        ],
        "aujourd'hui": [
          { word: "en", logit: 4.0 },
          { word: "après", logit: 3.2 },
          { word: "par", logit: 2.8 }
        ],
        "beau": [
          { word: "aujourd'hui", logit: 4.5 },
          { word: "avec", logit: 3.5 },
          { word: "et", logit: 3.0 },
          { word: ".", logit: 2.5 }
        ]
      }
    },
    {
      lang: "fr",
      title: "Albert Einstein était...",
      text: "Albert Einstein était un",
      candidates: [
        { word: "physicien", logit: 5.2 },
        { word: "génie", logit: 4.5 },
        { word: "Allemand", logit: 3.8 },
        { word: "célèbre", logit: 3.5 },
        { word: "scientifique", logit: 3.2 },
        { word: "violoniste", logit: 1.5 },
        { word: "skateur", logit: -3.5 },
        { word: "politicien", logit: -1.2 }
      ],
      transitions: {
        "physicien": [
          { word: "qui", logit: 4.8 },
          { word: "connu", logit: 4.0 },
          { word: "né", logit: 3.0 }
        ],
        "génie": [
          { word: "qui", logit: 4.5 },
          { word: "et", logit: 3.8 },
          { word: "avec", logit: 2.5 }
        ],
        "Allemand": [
          { word: "physicien", logit: 5.0 },
          { word: "scientifique", logit: 4.2 },
          { word: "brillant", logit: 2.8 }
        ],
        "célèbre": [
          { word: "physicien", logit: 4.8 },
          { word: "pour", logit: 4.5 },
          { word: "scientifique", logit: 4.0 }
        ],
        "scientifique": [
          { word: "qui", logit: 4.8 },
          { word: "de", logit: 3.5 },
          { word: "actif", logit: 2.5 }
        ],
        "qui": [
          { word: "a découvert", logit: 5.0 },
          { word: "a formulé", logit: 4.8 },
          { word: "a développé", logit: 4.5 },
          { word: "a changé", logit: 4.0 }
        ],
        "a découvert": [
          { word: "la relativité", logit: 5.5 },
          { word: "l'effet", logit: 4.0 },
          { word: "la", logit: 3.8 }
        ],
        "a formulé": [
          { word: "la", logit: 4.8 },
          { word: "théorie", logit: 4.5 },
          { word: "équation", logit: 4.0 }
        ],
        "théorie": [
          { word: "de", logit: 5.2 },
          { word: "sur", logit: 3.0 },
          { word: ".", logit: 2.5 }
        ],
        "de": [
          { word: "la relativité", logit: 5.8 },
          { word: "générale", logit: 4.5 },
          { word: "la physique", logit: 4.0 }
        ],
        "la relativité": [
          { word: "en", logit: 4.2 },
          { word: "qui", logit: 3.8 },
          { word: ".", logit: 3.5 }
        ],
        "pour": [
          { word: "ses", logit: 4.8 },
          { word: "avoir", logit: 4.0 },
          { word: "sa", logit: 3.5 }
        ],
        "ses": [
          { word: "travaux", logit: 4.6 },
          { word: "découvertes", logit: 4.2 },
          { word: "contributions", logit: 3.8 }
        ]
      }
    },
    {
      lang: "fr",
      title: "L'Intelligence Artificielle...",
      text: "L'Intelligence Artificielle est",
      candidates: [
        { word: "incroyable", logit: 4.5 },
        { word: "puissante", logit: 4.2 },
        { word: "complexe", logit: 3.8 },
        { word: "utile", logit: 3.5 },
        { word: "dangereuse", logit: 2.8 },
        { word: "révolutionnaire", logit: 2.5 },
        { word: "une", logit: 2.0 },
        { word: "une patate", logit: -3.0 }
      ],
      transitions: {
        "incroyable": [
          { word: "et", logit: 4.5 },
          { word: "parce que", logit: 3.2 },
          { word: ".", logit: 2.5 }
        ],
        "puissante": [
          { word: "technologie", logit: 4.8 },
          { word: "et", logit: 3.5 },
          { word: "ressource", logit: 3.0 }
        ],
        "complexe": [
          { word: "à", logit: 4.5 },
          { word: "et", logit: 3.2 },
          { word: "pour", logit: 2.8 }
        ],
        "utile": [
          { word: "pour", logit: 4.8 },
          { word: "dans", logit: 3.8 },
          { word: "et", logit: 3.5 }
        ],
        "dangereuse": [
          { word: "si", logit: 4.5 },
          { word: "pour", logit: 3.0 },
          { word: "mais", logit: 2.8 }
        ],
        "et": [
          { word: "transformatrice", logit: 4.0 },
          { word: "rapide", logit: 3.8 },
          { word: "efficace", logit: 3.5 },
          { word: "peut", logit: 3.2 }
        ],
        "pour": [
          { word: "l'avenir", logit: 4.5 },
          { word: "aider", logit: 4.0 },
          { word: "automatiser", logit: 3.8 },
          { word: "les", logit: 3.5 }
        ],
        "aider": [
          { word: "à", logit: 4.5 },
          { word: "les", logit: 3.8 },
          { word: "la", logit: 3.5 }
        ],
        "à": [
          { word: "créer", logit: 4.5 },
          { word: "résoudre", logit: 4.2 },
          { word: "améliorer", logit: 3.8 }
        ]
      }
    }
  ];

  let selectedPresetIdx = 0;
  let temperature = 0.7;
  let topP = 0.9;

  $: filteredPresets = PROMPT_PRESETS.filter(p => p.lang === currentLangCode);

  $: {
    if (currentLangCode) {
      selectedPresetIdx = 0;
    }
  }

  // Candidate logits for the currently selected preset.
  // Without the interactive generator there is no growing prompt to walk
  // transitions for — we always show the preset's starting candidates so
  // the Softmax/Top-P chart reflects the initial token decision.
  $: activeCandidates = (() => {
    const preset = filteredPresets[selectedPresetIdx] || filteredPresets[0];
    if (!preset) return [];
    return preset.candidates;
  })();

  type ProcessedCandidate = {
    word: string;
    logit: number;
    scaledLogit: number;
    rawProb: number;
    filtered: boolean;
    normProb: number;
  };

  // Perform reactive Softmax & Top-P Calculations
  $: computedCandidates = (() => {
    // 1. Scale logits by Temperature
    // Re-entrancy guard for Temperature = 0 (use 0.01 to prevent division by zero)
    const tempValue = Math.max(0.01, temperature);
    const scaled = activeCandidates.map(c => ({
      word: c.word,
      logit: c.logit,
      scaledLogit: c.logit / tempValue
    }));

    // 2. Raw Softmax probabilities
    const maxScaledLogit = Math.max(...scaled.map(s => s.scaledLogit)); // numerical stability
    const exps = scaled.map(s => Math.exp(s.scaledLogit - maxScaledLogit));
    const sumExps = exps.reduce((a, b) => a + b, 0);
    const rawProbs = scaled.map((s, i) => exps[i] / sumExps);

    // Assemble initial array
    let list: ProcessedCandidate[] = scaled.map((s, i) => ({
      word: s.word,
      logit: s.logit,
      scaledLogit: s.scaledLogit,
      rawProb: rawProbs[i],
      filtered: false,
      normProb: rawProbs[i]
    }));

    // 3. Sort descending for Top-P (Nucleus) filter
    list.sort((a, b) => b.rawProb - a.rawProb);

    // 4. Apply Top-P Threshold filtering
    let cumSum = 0;
    let keepCount = 0;
    for (let i = 0; i < list.length; i++) {
      cumSum += list[i].rawProb;
      keepCount++;
      if (cumSum >= topP) {
        break;
      }
    }

    // Mark as filtered beyond keepCount
    for (let i = keepCount; i < list.length; i++) {
      list[i].filtered = true;
      list[i].normProb = 0;
    }

    // 5. Re-normalize probabilities of kept tokens
    const sumKept = list.filter(l => !l.filtered).reduce((sum, l) => sum + l.rawProb, 0);
    list = list.map(l => {
      if (l.filtered) return l;
      return {
        ...l,
        normProb: sumKept > 0 ? (l.rawProb / sumKept) : 1.0
      };
    });

    // Re-sort back to logit descending or keep probability descending
    return list;
  })();

  // Select Preset Prompt
  function handlePresetChange(idx: number) {
    selectedPresetIdx = idx;
  }
</script>

<div class="bg-zinc-50 rounded-2xl shadow-sm border border-zinc-200 overflow-hidden flex flex-col transition-all duration-200">
  <!-- Inner Playground sub-navigation -->
  <div class="bg-white border-b border-zinc-200 px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
    <div>
      <h2 class="text-lg font-bold tracking-tight text-zinc-900">{$t('llm_tab_title')}</h2>
      <p class="text-xs text-zinc-500 mt-1 max-w-xl">{$t('llm_tab_desc')}</p>
    </div>
    
    <!-- Pills tabs -->
    <div class="flex items-center gap-1 bg-zinc-100 p-1.5 rounded-xl self-start md:self-auto border border-zinc-200/50">
      <button
        on:click={() => activeSubTab = 'tokenizer'}
        class="px-4 py-2 text-xs font-bold rounded-lg transition-all duration-150 {activeSubTab === 'tokenizer' ? 'bg-white text-indigo-600 shadow-sm' : 'text-zinc-500 hover:text-zinc-800'}"
      >
        {$t('tok_title')}
      </button>
      <button
        on:click={() => activeSubTab = 'decoding'}
        class="px-4 py-2 text-xs font-bold rounded-lg transition-all duration-150 {activeSubTab === 'decoding' ? 'bg-white text-indigo-600 shadow-sm' : 'text-zinc-500 hover:text-zinc-800'}"
      >
        {$t('dec_title')}
      </button>
    </div>
  </div>

  <div class="p-6 md:p-8 flex-1 min-h-[500px]">
    <!-- ─── SUB-TAB 1: TOKENIZER PLAYGROUND ────────────────────── -->
    {#if activeSubTab === 'tokenizer'}
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-fade-in">
        <!-- Input section -->
        <div class="lg:col-span-7 flex flex-col gap-6">
          <div class="flex flex-col gap-2">
            <label for="tokInput" class="text-xs font-bold uppercase tracking-wider text-zinc-400">{$t('tok_title')} Playground</label>
            <p class="text-sm text-zinc-600 leading-relaxed font-normal">{@html $t('tok_desc')}</p>
          </div>

          <div class="flex items-center gap-2 bg-zinc-100 p-1 rounded-xl self-start border border-zinc-200/40">
            <button
              on:click={() => tokenizerMode = 'word'}
              class="px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all {tokenizerMode === 'word' ? 'bg-white text-indigo-600 shadow-xs' : 'text-zinc-500 hover:text-zinc-800'}"
            >
              {$t('tok_mode_word')}
            </button>
            <button
              on:click={() => tokenizerMode = 'subword'}
              class="px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all {tokenizerMode === 'subword' ? 'bg-white text-teal-600 shadow-xs' : 'text-zinc-500 hover:text-zinc-800'}"
            >
              {$t('tok_mode_subword')}
            </button>
          </div>

          <textarea
            id="tokInput"
            bind:value={tokenInput}
            placeholder={$t('tok_input_placeholder')}
            rows="4"
            class="w-full p-4 text-sm border border-zinc-200 rounded-xl outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100/50 transition-all font-sans bg-white shadow-xs resize-none"
          ></textarea>

          <!-- Color Tokens Container -->
          <div class="bg-white border border-zinc-200 rounded-xl p-5 shadow-xs flex flex-col gap-4">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold uppercase tracking-wider text-zinc-400">{$t('tok_visualizer_label')}</span>
              {#if hoveredTokenIdx !== null}
                <span class="text-xs font-semibold text-indigo-600 animate-pulse">{$t('tok_token')} #{hoveredTokenIdx + 1} ID: {tokens[hoveredTokenIdx]?.id}</span>
              {/if}
            </div>

            {#if tokens.length > 0}
              <div class="flex flex-wrap gap-x-1.5 gap-y-2 border border-zinc-100 p-4 rounded-lg bg-zinc-50/50">
                {#each tokens as tok, idx}
                  <!-- svelte-ignore a11y-mouse-events-have-key-events -->
                  <!-- svelte-ignore a11y-no-static-element-interactions -->
                  <span
                    on:mouseover={() => hoveredTokenIdx = idx}
                    on:mouseleave={() => hoveredTokenIdx = null}
                    class="px-2 py-1 text-sm font-semibold font-mono rounded border transition-all cursor-default shrink-0 select-none
                           {getTokenBgClass(tok.text)}
                           {hoveredTokenIdx === idx ? 'ring-2 ring-indigo-500 scale-105 shadow-xs' : ''}"
                  >
                    {tok.text}
                  </span>
                {/each}
              </div>
              <p class="text-[11px] text-zinc-400 italic">{$t('tok_hover_hint')}</p>
            {:else}
              <div class="h-28 rounded-lg border border-dashed border-zinc-200 flex items-center justify-center text-xs text-zinc-400 italic bg-zinc-50">
                {$t('tok_input_placeholder')}
              </div>
            {/if}
          </div>
        </div>

        <!-- Right Side: Stats and IDs Table -->
        <div class="lg:col-span-5 flex flex-col gap-6">
          <div class="grid grid-cols-2 gap-4">
            <div class="bg-white border border-zinc-200 rounded-xl p-4 shadow-xs flex flex-col">
              <span class="text-[10px] font-bold uppercase tracking-wider text-zinc-400">{$t('tok_stats_chars')}</span>
              <span class="text-2xl font-extrabold tracking-tight text-zinc-900 mt-1 tabular-nums">{totalChars}</span>
            </div>
            <div class="bg-white border border-zinc-200 rounded-xl p-4 shadow-xs flex flex-col">
              <span class="text-[10px] font-bold uppercase tracking-wider text-zinc-400">{$t('tok_stats_tokens')}</span>
              <span class="text-2xl font-extrabold tracking-tight text-zinc-900 mt-1 tabular-nums">{totalTokens}</span>
            </div>
            <div class="bg-white border border-zinc-200 rounded-xl p-4 shadow-xs flex flex-col">
              <span class="text-[10px] font-bold uppercase tracking-wider text-zinc-400">{$t('tok_stats_avg')}</span>
              <span class="text-2xl font-extrabold tracking-tight text-zinc-900 mt-1 tabular-nums">{avgCharsPerToken}</span>
            </div>
            <div class="bg-white border border-zinc-200 rounded-xl p-4 shadow-xs flex flex-col group relative cursor-help">
              <span class="text-[10px] font-bold uppercase tracking-wider text-zinc-400">{$t('tok_stats_cost')}</span>
              <span class="text-2xl font-extrabold tracking-tight text-emerald-600 mt-1 tabular-nums">${estimatedCost}</span>
              <!-- Tooltip explain -->
              <div class="absolute bottom-full left-0 mb-2 w-56 bg-zinc-900 text-white text-[10px] rounded p-2 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity shadow-lg leading-relaxed z-50">
                {$t('tok_stats_cost_tooltip')}
              </div>
            </div>
          </div>

          <!-- Token ID Table -->
          <div class="bg-white border border-zinc-200 rounded-xl shadow-xs overflow-hidden flex-1 flex flex-col">
            <div class="px-4 py-3 bg-zinc-50 border-b border-zinc-200 flex items-center justify-between">
              <span class="text-xs font-bold uppercase tracking-wider text-zinc-500">{$t('tok_table_title')}</span>
              {#if tokenizerMode === 'subword'}
                <div class="relative group cursor-help">
                  <span class="inline-flex items-center gap-1 text-[10px] font-bold text-teal-600 hover:text-teal-700 bg-teal-50 border border-teal-200/50 rounded-full px-2 py-0.5 shadow-xs transition-colors">
                    <span>{$t('tok_what_is_g')}</span>
                    <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                  </span>
                  <div class="absolute right-0 top-full mt-2 w-72 bg-zinc-950 text-white text-[11px] rounded-lg p-3 opacity-0 group-hover:opacity-100 pointer-events-none transition-all shadow-lg leading-relaxed z-50 transform translate-y-1 group-hover:translate-y-0 duration-200">
                    <p class="font-bold text-teal-400 mb-1">{$t('tok_what_is_g')}</p>
                    <p class="text-zinc-300 font-sans font-normal leading-relaxed">{@html $t('tok_g_explanation')}</p>
                  </div>
                </div>
              {/if}
            </div>
            
            <div class="flex-1 overflow-y-auto max-h-[280px]">
              {#if tokens.length > 0}
                <table class="w-full text-xs text-left border-collapse">
                  <thead class="bg-zinc-50/50 sticky top-0 border-b border-zinc-100 font-semibold text-zinc-400">
                    <tr>
                      <th class="px-4 py-2 border-r border-zinc-100">{$t('tok_table_index')}</th>
                      <th class="px-4 py-2 border-r border-zinc-100">{$t('tok_id_table_token')}</th>
                      <th class="px-4 py-2 border-r border-zinc-100">{$t('tok_id_table_id')}</th>
                      <th class="px-4 py-2">{$t('tok_id_table_bytes')}</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-zinc-100 bg-white">
                    {#each tokens as tok, idx}
                      <tr class="hover:bg-zinc-50 transition-colors {hoveredTokenIdx === idx ? 'bg-indigo-50/50' : ''}">
                        <td class="px-4 py-2.5 font-mono text-zinc-400 border-r border-zinc-100 tabular-nums">#{idx + 1}</td>
                        <td class="px-4 py-2.5 font-bold font-mono border-r border-zinc-100">{tok.text}</td>
                        <td class="px-4 py-2.5 font-semibold font-mono text-indigo-600 border-r border-zinc-100 tabular-nums">{tok.id}</td>
                        <td class="px-4 py-2.5 text-zinc-500 text-[11px]">
                          {#if tok.spaceBefore}
                            <span class="text-zinc-400 bg-zinc-100 font-mono px-1 rounded">{$t('tok_space')}</span> + "{tok.text.replace('Ġ','')}"
                          {:else}
                            "{tok.text}"
                          {/if}
                        </td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              {:else}
                <div class="h-44 flex items-center justify-center text-xs text-zinc-400 italic">{$t('tok_table_empty')}</div>
              {/if}
            </div>
          </div>
        </div>
      </div>
    {/if}

    <!-- ─── SUB-TAB 2: DECODING PLAYGROUND ────────────────────── -->
    {#if activeSubTab === 'decoding'}
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-fade-in">
        <!-- Decoding Controls & Prompt -->
        <div class="lg:col-span-6 flex flex-col gap-6">
          <div class="flex flex-col gap-1.5">
            <span class="text-xs font-bold uppercase tracking-wider text-zinc-400">{$t('dec_title')}</span>
            <p class="text-sm text-zinc-600 leading-relaxed font-normal">{@html $t('dec_desc')}</p>
          </div>

          <!-- Prompt Preset selection -->
          <div class="flex flex-col gap-2">
            <span class="text-xs font-bold text-zinc-700">{$t('dec_prompt_label')}</span>
            <div class="flex flex-wrap gap-2">
              {#each filteredPresets as preset, idx}
                <button
                  on:click={() => handlePresetChange(idx)}
                  class="px-3.5 py-2 text-xs font-bold rounded-lg border transition-all
                         {selectedPresetIdx === idx ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-white text-indigo-600 border-zinc-200 hover:border-indigo-300 hover:bg-indigo-50/50'}"
                >
                  {preset.title}
                </button>
              {/each}
            </div>
          </div>

          <!-- Parameter Sliders -->
          <div class="bg-white border border-zinc-200 rounded-2xl p-5 shadow-xs flex flex-col gap-6">
            <div class="flex flex-col gap-2">
              <div class="flex justify-between items-center">
                <span class="text-xs font-bold text-zinc-800">{$t('dec_temp_label')}</span>
                <span class="px-2 py-0.5 text-xs font-mono font-bold bg-indigo-50 border border-indigo-100 text-indigo-700 rounded tabular-nums">T = {temperature.toFixed(2)}</span>
              </div>
              <input
                type="range"
                bind:value={temperature}
                min="0.1"
                max="2.0"
                step="0.05"
                class="w-full accent-indigo-600 h-1.5 bg-zinc-100 rounded-lg cursor-pointer"
              />
              <p class="text-[11px] text-zinc-500 leading-normal">{$t('dec_temp_desc')}</p>
            </div>

            <div class="flex flex-col gap-2">
              <div class="flex justify-between items-center">
                <span class="text-xs font-bold text-zinc-800">{$t('dec_topp_label')}</span>
                <span class="px-2 py-0.5 text-xs font-mono font-bold bg-teal-50 border border-teal-100 text-teal-700 rounded tabular-nums">P = {topP.toFixed(2)}</span>
              </div>
              <input
                type="range"
                bind:value={topP}
                min="0.1"
                max="1.0"
                step="0.05"
                class="w-full accent-teal-600 h-1.5 bg-zinc-100 rounded-lg cursor-pointer"
              />
              <p class="text-[11px] text-zinc-500 leading-normal">{$t('dec_topp_desc')}</p>
            </div>
          </div>
        </div>

        <!-- Probability Distribution Output Chart -->
        <div class="lg:col-span-6 flex flex-col gap-4">
          <div class="bg-white border border-zinc-200 rounded-2xl p-5 shadow-xs flex-1 flex flex-col gap-4">
            <div class="flex items-center justify-between border-b border-zinc-100 pb-3">
              <span class="text-xs font-bold uppercase tracking-wider text-zinc-500">{$t('dec_probs_chart_title')}</span>
              <div class="flex items-center gap-3">
                <div class="flex items-center gap-1">
                  <span class="w-2.5 h-2.5 bg-indigo-500 rounded-sm"></span>
                  <span class="text-[10px] text-zinc-500">{$t('dec_prob_legend')}</span>
                </div>
                <div class="flex items-center gap-1">
                  <span class="w-2.5 h-2.5 bg-zinc-200 rounded-sm"></span>
                  <span class="text-[10px] text-zinc-500">{$t('dec_legend_filtered')}</span>
                </div>
              </div>
            </div>

            <!-- Softmax Formula Box -->
            <div class="bg-zinc-50 rounded-xl p-3 border border-zinc-200/50 flex flex-col gap-2">
              <span class="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{$t('dec_math_title')}</span>
              <div class="flex items-center justify-between text-xs text-zinc-600 gap-4 flex-wrap leading-relaxed">
                <div>
                  <code class="bg-white border border-zinc-200 px-1.5 py-0.5 rounded font-mono text-zinc-700">logit_novo = logit / T</code>
                </div>
                <div class="font-mono text-zinc-400">→</div>
                <div>
                  <code class="bg-white border border-zinc-200 px-1.5 py-0.5 rounded font-mono text-zinc-700">prob_i = exp(logit_i) / Σ exp(logit_j)</code>
                </div>
              </div>
            </div>

            <!-- Bar Chart Component -->
            <div class="flex-1 flex flex-col gap-3 justify-center min-h-[300px]">
              {#each computedCandidates as cand}
                <div class="flex items-center gap-3 w-full">
                  <!-- Word tag -->
                  <div class="w-36 shrink-0 text-right">
                    <span class="text-sm font-semibold font-mono {cand.filtered ? 'text-zinc-400 line-through' : 'text-zinc-800'}">
                      "{cand.word}"
                    </span>
                  </div>

                  <!-- Progress container -->
                  <div class="flex-1 h-6 bg-zinc-100 rounded-md overflow-hidden relative border border-zinc-200/40">
                    <!-- Progress bar -->
                    <div
                      class="h-full rounded-l-md transition-all duration-300
                             {cand.filtered ? 'bg-zinc-200 border-r border-zinc-300' : 'bg-gradient-to-r from-indigo-500 to-indigo-600'}"
                      style="width: {cand.normProb * 100}%"
                    ></div>

                    <!-- Percent float text -->
                    <span class="absolute inset-y-0 right-3 flex items-center text-[10px] font-mono font-bold tabular-nums {cand.filtered ? 'text-zinc-400' : 'text-indigo-900'}">
                      {#if cand.filtered}
                        {$t('dec_legend_filtered')} ({Math.round(cand.rawProb * 100)}%)
                      {:else}
                        {Math.round(cand.normProb * 100)}%
                      {/if}
                    </span>
                  </div>

                  <!-- Logit score -->
                  <div class="w-14 shrink-0 font-mono text-[10px] text-zinc-400 text-left tabular-nums">
                    ({cand.logit >= 0 ? '+' : ''}{cand.logit.toFixed(1)})
                  </div>
                </div>
              {/each}
            </div>

            <p class="text-[11px] text-zinc-400 leading-normal border-t border-zinc-100 pt-3">
              {@html $t('dec_note')}
            </p>
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(6px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .animate-fade-in {
    animation: fadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }
</style>
