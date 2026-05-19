<script lang="ts">
  import { t, locale } from '../i18n';
  import { onMount } from 'svelte';

  // Sub-tabs within the LLM Playground
  let activeSubTab: 'tokenizer' | 'decoding' | 'attention' = 'tokenizer';

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
    const currentLocale = $locale || 'en';
    const prevDefault = DEFAULT_TOKEN_INPUTS[lastLocale];
    const newDefault = DEFAULT_TOKEN_INPUTS[currentLocale] || DEFAULT_TOKEN_INPUTS.en;
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
      'bg-violet-100/80 border-violet-200 text-violet-900',
      'bg-fuchsia-100/80 border-fuchsia-200 text-fuchsia-900',
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

    if (tokenizerMode === 'word') {
      // Split by words, spaces and punctuation
      const words = tokenInput.match(/(\s+|\w+|[^\w\s])/g) || [];
      let result: TokenRepresentation[] = [];

      words.forEach((w) => {
        if (!w) return;
        const isSpace = /^\s+$/.test(w);
        if (isSpace) {
          // Spaces are not standalone tokens in this simplified word model,
          // they attach to the next word, or represent spaceBefore.
          if (result.length > 0) {
            // mark previous token as having space after (we just use basic mapping)
          }
          return;
        }

        const cleanWord = w;
        // Check if there was space before
        const idxInInput = tokenInput.indexOf(w);
        const spaceBefore = idxInInput > 0 && /\s/.test(tokenInput[idxInInput - 1]);

        let id = VOCAB_MAP[cleanWord] || VOCAB_MAP[cleanWord.toLowerCase()];
        if (!id) {
          id = 10000 + (getStringHash(cleanWord) % 89999);
        }

        result.push({ text: cleanWord, id, spaceBefore });
      });
      return result;
    } else {
      // Subword BPE simulation: Break longer words
      const words = tokenInput.match(/(\s+|\w+|[^\w\s])/g) || [];
      let result: TokenRepresentation[] = [];

      words.forEach((w) => {
        if (!w || /^\s+$/.test(w)) return;

        // Check if there was a space before this word in the input
        const idxInInput = tokenInput.indexOf(w);
        const spaceBefore = idxInInput > 0 && /\s/.test(tokenInput[idxInInput - 1]);

        // Simulated BPE Rule-based Split
        const rules = SUBWORD_RULES[w] || SUBWORD_RULES[w.toLowerCase()];
        if (rules) {
          rules.forEach((sub, subIdx) => {
            let cleanSub = sub;
            // The first subword gets the space indicator 'Ġ' if there was space before
            const displaySub = (subIdx === 0 && spaceBefore) ? `Ġ${cleanSub}` : cleanSub;
            let id = VOCAB_MAP[cleanSub] || VOCAB_MAP[cleanSub.toLowerCase()];
            if (!id) {
              id = 10000 + (getStringHash(cleanSub) % 89999);
            }
            result.push({ text: displaySub, id, spaceBefore: subIdx === 0 && spaceBefore });
          });
        } else if (w.length > 7 && !/^[^\w\s]+$/.test(w)) {
          // Fallback split for random long words: split in half
          const mid = Math.floor(w.length / 2);
          const part1 = w.slice(0, mid);
          const part2 = w.slice(mid);
          
          const displayPart1 = spaceBefore ? `Ġ${part1}` : part1;
          let id1 = 10000 + (getStringHash(part1) % 89999);
          let id2 = 10000 + (getStringHash(part2) % 89999);

          result.push({ text: displayPart1, id: id1, spaceBefore });
          result.push({ text: part2, id: id2, spaceBefore: false });
        } else {
          // Represent BPE space indicator Ġ
          const displayText = spaceBefore ? `Ġ${w}` : w;
          let id = VOCAB_MAP[w] || VOCAB_MAP[w.toLowerCase()];
          if (!id) {
            id = 10000 + (getStringHash(w) % 89999);
          }
          result.push({ text: displayText, id, spaceBefore });
        }
      });
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
  let activePrompt = "";
  let temperature = 0.7;
  let topP = 0.9;
  let isAutoCompleting = false;
  let autoTimer: any = null;

  $: filteredPresets = PROMPT_PRESETS.filter(p => p.lang === $locale);

  $: {
    if ($locale) {
      selectedPresetIdx = 0;
      activePrompt = filteredPresets[0]?.text || "";
      stopAutoComplete();
    }
  }

  const FALLBACK_CANDIDATES: Record<string, { word: string; logit: number }[]> = {
    en: [
      { word: "and", logit: 4.0 },
      { word: "the", logit: 3.5 },
      { word: "process", logit: 3.0 },
      { word: "technology", logit: 2.8 },
      { word: "science", logit: 2.5 },
      { word: "of", logit: 2.2 },
      { word: "future", logit: 2.0 },
      { word: ".", logit: 1.8 }
    ],
    pt: [
      { word: "e", logit: 4.0 },
      { word: "o", logit: 3.5 },
      { word: "processo", logit: 3.0 },
      { word: "tecnologia", logit: 2.8 },
      { word: "ciência", logit: 2.5 },
      { word: "do", logit: 2.2 },
      { word: "futuro", logit: 2.0 },
      { word: ".", logit: 1.8 }
    ],
    fr: [
      { word: "et", logit: 4.0 },
      { word: "le", logit: 3.5 },
      { word: "processus", logit: 3.0 },
      { word: "technologie", logit: 2.8 },
      { word: "science", logit: 2.5 },
      { word: "du", logit: 2.2 },
      { word: "futur", logit: 2.0 },
      { word: ".", logit: 1.8 }
    ]
  };

  // Track currently active candidate logits dynamically based on active prompt end
  $: activeCandidates = (() => {
    const preset = filteredPresets[selectedPresetIdx] || filteredPresets[0];
    if (!preset) return [];

    // IF activePrompt is exactly the initial prompt, return the preset's own starting candidates!
    if (activePrompt.trim() === preset.text.trim()) {
      return preset.candidates;
    }

    // Clean prompt to match transition keys robustly
    const cleanPrompt = activePrompt.trim().toLowerCase().replace(/[.,!?;]/g, '');
    const promptWords = cleanPrompt.split(/\s+/).filter(Boolean);
    if (promptWords.length === 0) {
      return preset.candidates;
    }

    // Sort transition keys by word count (descending) so multi-word phrases match first
    const transitionKeys = Object.keys(preset.transitions).sort((a, b) => {
      const aLen = a.split(/\s+/).length;
      const bLen = b.split(/\s+/).length;
      if (aLen !== bLen) return bLen - aLen;
      return b.length - a.length;
    });

    for (const key of transitionKeys) {
      const keyWords = key.toLowerCase().split(/\s+/).filter(Boolean);
      if (promptWords.length >= keyWords.length) {
        let match = true;
        for (let i = 0; i < keyWords.length; i++) {
          if (promptWords[promptWords.length - keyWords.length + i] !== keyWords[i]) {
            match = false;
            break;
          }
        }
        if (match) {
          return preset.transitions[key];
        }
      }
    }

    // Default: if transition map ends or no match, generate random but realistic placeholder next-tokens
    // so the generator doesn't break and can build text infinitely!
    return FALLBACK_CANDIDATES[$locale] || FALLBACK_CANDIDATES.en;
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
    activePrompt = filteredPresets[idx]?.text || "";
    stopAutoComplete();
  }

  // Draw weighted sample from filtered distribution
  function sampleNextToken(): string {
    const r = Math.random();
    let cumulative = 0;
    const active = computedCandidates.filter(c => !c.filtered);
    if (active.length === 0) return ".";

    for (const c of active) {
      cumulative += c.normProb;
      if (r <= cumulative) {
        return c.word;
      }
    }
    return active[0].word;
  }

  // Append next token to prompt
  function generateNextWord() {
    const nextWord = sampleNextToken();
    if (nextWord === ".") {
      activePrompt = activePrompt.trim() + ".";
    } else {
      activePrompt = activePrompt.trim() + " " + nextWord;
    }
  }

  // Toggle autocomplete typing animation
  function toggleAutoComplete() {
    if (isAutoCompleting) {
      stopAutoComplete();
    } else {
      isAutoCompleting = true;
      runStep();
    }
  }

  function runStep() {
    if (!isAutoCompleting) return;
    generateNextWord();
    
    // Stop auto if sentence ends in fullstop
    if (activePrompt.endsWith(".")) {
      stopAutoComplete();
      return;
    }

    autoTimer = setTimeout(runStep, 600);
  }

  function stopAutoComplete() {
    isAutoCompleting = false;
    if (autoTimer) {
      clearTimeout(autoTimer);
      autoTimer = null;
    }
  }

  function resetPrompt() {
    stopAutoComplete();
    activePrompt = (filteredPresets[selectedPresetIdx] || filteredPresets[0])?.text || "";
  }

  // ─── PART 3: ATTENTION MECHANISM STATE ─────────────────────
  type SentenceWord = {
    word: string;
    weights: number[]; // attention weight directed at each word index
    explanation: Record<string, string>; // language code -> explanation
  };

  type AttentionPreset = {
    lang: 'en' | 'pt' | 'fr';
    label: string;
    words: SentenceWord[];
  };

  const ATTENTION_PRESETS: AttentionPreset[] = [
    // --- ENGLISH ---
    {
      lang: "en",
      label: "The dog was hungry because it...",
      words: [
        { word: "The", weights: [0.30, 0.05, 0.02, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01], explanation: { pt: "Artigo comum.", en: "Standard article.", fr: "Article standard." } },
        { word: "dog", weights: [0.05, 0.40, 0.05, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02], explanation: { pt: "O sujeito principal da frase.", en: "The main subject of the sentence.", fr: "Le sujet principal de la phrase." } },
        { word: "was", weights: [0.02, 0.05, 0.20, 0.05, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02], explanation: { pt: "Verbo de ligação.", en: "Linking verb.", fr: "Verbe d'état." } },
        { word: "hungry", weights: [0.01, 0.15, 0.08, 0.35, 0.05, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02], explanation: { pt: "Adjetivo descrevendo o estado do cão.", en: "Adjective describing the dog's state.", fr: "Adjectif décrivant l'état du chien." } },
        { word: "because", weights: [0.01, 0.02, 0.02, 0.05, 0.25, 0.05, 0.02, 0.02, 0.02, 0.02, 0.02], explanation: { pt: "Conjunção causal.", en: "Causal conjunction.", fr: "Conjonction causale." } },
        { word: "it", weights: [0.02, 0.70, 0.02, 0.12, 0.02, 0.05, 0.01, 0.02, 0.02, 0.01, 0.01], explanation: { pt: "O pronome neutro 'it' foca fortemente (70%) em 'dog' porque se refere diretamente a ele no contexto!", en: "The pronoun 'it' focuses heavily (70%) on 'dog' because it directly references the animal grammatically!", fr: "Le pronom neutre 'it' se concentre fortement (70%) sur 'dog' car il y fait directement référence dans le contexte !" } },
        { word: "hadn't", weights: [0.01, 0.02, 0.02, 0.02, 0.02, 0.05, 0.30, 0.05, 0.02, 0.01, 0.01], explanation: { pt: "Verbo auxiliar negativo.", en: "Negative auxiliary verb.", fr: "Verbe auxiliaire négatif." } },
        { word: "eaten", weights: [0.01, 0.10, 0.02, 0.20, 0.02, 0.02, 0.05, 0.40, 0.05, 0.02, 0.01], explanation: { pt: "O verbo auxiliar 'eaten' refere-se ao estado de fome ('hungry': 20%) e ao cão ('dog': 10%)!", en: "The verb 'eaten' links back to being 'hungry' (20%) and to the 'dog' (10%) who is doing the eating!", fr: "Le verbe 'eaten' est lié à la faim ('hungry': 20%) et au chien ('dog': 10%) !" } },
        { word: "all", weights: [0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.02, 0.02, 0.25, 0.05, 0.01], explanation: { pt: "Quantificador.", en: "Quantifier.", fr: "Quantificateur." } },
        { word: "day", weights: [0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.02, 0.05, 0.35, 0.02], explanation: { pt: "Substantivo temporal.", en: "Temporal noun.", fr: "Nom temporel." } },
        { word: ".", weights: [0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.02, 0.40], explanation: { pt: "Ponto final da frase.", en: "Punctuation.", fr: "Punctuation." } }
      ]
    },
    {
      lang: "en",
      label: "The FBI is chasing a criminal...",
      words: [
        { word: "The", weights: [0.35, 0.05, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01], explanation: { pt: "Artigo.", en: "Article.", fr: "Article." } },
        { word: "FBI", weights: [0.05, 0.45, 0.05, 0.02, 0.01, 0.02, 0.01, 0.01, 0.01, 0.01], explanation: { pt: "Sujeito que executa a ação (Polícia Federal americana).", en: "The agency executing the chase.", fr: "L'organisation qui poursuit le criminel." } },
        { word: "is", weights: [0.01, 0.05, 0.30, 0.05, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01], explanation: { pt: "Verbo auxiliar.", en: "Auxiliary verb.", fr: "Verbe auxiliaire." } },
        { word: "chasing", weights: [0.01, 0.55, 0.05, 0.40, 0.01, 0.35, 0.01, 0.01, 0.01, 0.01], explanation: { pt: "Ação principal! Associa fortemente o agente ('FBI': 55%) e o alvo ('criminal': 35%)!", en: "Core action! Strongly connects the pursuer ('FBI': 55%) and the target ('criminal': 35%)!", fr: "L'action principale ! Relie fortement le poursuivant ('FBI': 55%) et la cible ('criminal': 35%) !" } },
        { word: "a", weights: [0.01, 0.01, 0.01, 0.01, 0.20, 0.05, 0.01, 0.01, 0.01, 0.01], explanation: { pt: "Artigo indefinido.", en: "Indefinite article.", fr: "Article indéfini." } },
        { word: "criminal", weights: [0.01, 0.40, 0.01, 0.45, 0.01, 0.50, 0.02, 0.02, 0.15, 0.01], explanation: { pt: "O alvo da ação ('chasing': 45%) feito pelo sujeito ('FBI': 40%). A atenção estabelece a ponte criminoso-polícia!", en: "The target of the chase ('chasing': 45%) by the agent ('FBI': 40%). Attention binds target to pursuer!", fr: "La cible de l'action ('chasing': 45%) menée par le sujet ('FBI': 40%) !" } },
        { word: "on", weights: [0.01, 0.01, 0.01, 0.02, 0.01, 0.05, 0.25, 0.05, 0.01, 0.01], explanation: { pt: "Preposição.", en: "Preposition.", fr: "Préposition." } },
        { word: "the", weights: [0.01, 0.01, 0.01, 0.01, 0.01, 0.02, 0.05, 0.25, 0.05, 0.01], explanation: { pt: "Artigo.", en: "Article.", fr: "Article." } },
        { word: "run", weights: [0.01, 0.10, 0.01, 0.20, 0.01, 0.45, 0.02, 0.05, 0.50, 0.05], explanation: { pt: "O estado de fuga ('run') conecta-se ao 'criminal' (45%) e à ação de caça 'chasing' (20%)!", en: "The state of fleeing ('run') relates back to the 'criminal' (45%) and the 'chasing' (20%)!", fr: "L'état de fuite ('run') est lié au 'criminal' (45%) et à la poursuite 'chasing' (20%) !" } },
        { word: ".", weights: [0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.02, 0.45], explanation: { pt: "Fim da frase.", en: "Punctuation.", fr: "Punctuation." } }
      ]
    },
    // --- PORTUGUESE ---
    {
      lang: "pt",
      label: "O cão estava com fome porque ele...",
      words: [
        { word: "O", weights: [0.30, 0.05, 0.02, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01], explanation: { pt: "Artigo masculino singular.", en: "Masculine singular article.", fr: "Article masculin singulier." } },
        { word: "cão", weights: [0.05, 0.40, 0.05, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02], explanation: { pt: "O sujeito principal da frase.", en: "The main subject of the sentence.", fr: "Le sujet principal de la phrase." } },
        { word: "estava", weights: [0.02, 0.05, 0.20, 0.05, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02], explanation: { pt: "Verbo de ligação (estado temporário).", en: "Linking verb.", fr: "Verbe d'état." } },
        { word: "com", weights: [0.01, 0.02, 0.05, 0.25, 0.05, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02], explanation: { pt: "Preposição que introduz o estado.", en: "Preposition introducing state.", fr: "Préposition introduisant l'état." } },
        { word: "fome", weights: [0.01, 0.15, 0.08, 0.05, 0.35, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02], explanation: { pt: "Substantivo que descreve o estado do cão.", en: "Noun describing the dog's state.", fr: "Nom décrivant l'état du chien." } },
        { word: "porque", weights: [0.01, 0.02, 0.02, 0.02, 0.05, 0.25, 0.05, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02], explanation: { pt: "Conjunção explicativa/causal.", en: "Causal conjunction.", fr: "Conjonction causale." } },
        { word: "ele", weights: [0.02, 0.70, 0.02, 0.01, 0.12, 0.02, 0.05, 0.01, 0.02, 0.02, 0.01, 0.01, 0.01, 0.01], explanation: { pt: "O pronome pessoal 'ele' foca fortemente (70%) no 'cão' porque se refere diretamente a ele!", en: "The personal pronoun 'ele' focuses heavily (70%) on 'cão' (dog) because it directly references it grammatically!", fr: "Le pronom personnel 'ele' se concentre fortement (70%) sur 'cão' car il y fait directement référence !" } },
        { word: "não", weights: [0.01, 0.02, 0.02, 0.01, 0.02, 0.02, 0.05, 0.30, 0.05, 0.02, 0.01, 0.01, 0.01, 0.01], explanation: { pt: "Advérbio de negação.", en: "Negation adverb.", fr: "Adverbe de négation." } },
        { word: "tinha", weights: [0.01, 0.02, 0.02, 0.01, 0.02, 0.02, 0.02, 0.05, 0.30, 0.05, 0.02, 0.01, 0.01, 0.01], explanation: { pt: "Verbo auxiliar no pretérito mais-que-perfeito composto.", en: "Auxiliary verb.", fr: "Verbe auxiliaire." } },
        { word: "comido", weights: [0.01, 0.10, 0.02, 0.01, 0.20, 0.02, 0.02, 0.05, 0.05, 0.40, 0.05, 0.02, 0.01, 0.01], explanation: { pt: "O particípio 'comido' refere-se ao estado de fome ('fome': 20%) e ao cão ('cão': 10%)!", en: "The participle 'comido' links back to being hungry ('fome': 20%) and to the dog ('cão': 10%) who is eating!", fr: "Le participe passé 'comido' est lié à la faim ('fome': 20%) et au chien ('cão': 10%) !" } },
        { word: "o", weights: [0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.02, 0.02, 0.05, 0.25, 0.05, 0.01, 0.01], explanation: { pt: "Artigo definido masculino.", en: "Definite article.", fr: "Article défini." } },
        { word: "dia", weights: [0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.02, 0.05, 0.05, 0.35, 0.02, 0.01], explanation: { pt: "Substantivo temporal.", en: "Temporal noun.", fr: "Nom temporel." } },
        { word: "todo", weights: [0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.02, 0.05, 0.10, 0.40, 0.02], explanation: { pt: "Determinante indefinido (totalidade).", en: "Quantifier.", fr: "Quantificateur." } },
        { word: ".", weights: [0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.02, 0.02, 0.45], explanation: { pt: "Ponto final da frase.", en: "Punctuation.", fr: "Punctuation." } }
      ]
    },
    {
      lang: "pt",
      label: "O FBI está a perseguir um criminoso...",
      words: [
        { word: "O", weights: [0.35, 0.05, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01], explanation: { pt: "Artigo definido masculino.", en: "Definite article.", fr: "Article défini." } },
        { word: "FBI", weights: [0.05, 0.45, 0.05, 0.02, 0.01, 0.02, 0.01, 0.01, 0.01, 0.01], explanation: { pt: "Sujeito que executa a ação (Polícia Federal americana).", en: "The agency executing the chase.", fr: "L'organisation qui poursuit le criminel." } },
        { word: "está", weights: [0.01, 0.05, 0.30, 0.05, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01], explanation: { pt: "Verbo auxiliar (gerúndio / aspeto contínuo).", en: "Auxiliary verb.", fr: "Verbe auxiliaire." } },
        { word: "a", weights: [0.01, 0.01, 0.01, 0.20, 0.05, 0.01, 0.01, 0.01, 0.01, 0.01], explanation: { pt: "Preposição que acompanha o gerúndio.", en: "Preposition.", fr: "Préposition." } },
        { word: "perseguir", weights: [0.01, 0.55, 0.05, 0.01, 0.40, 0.01, 0.35, 0.01, 0.01, 0.01], explanation: { pt: "Ação principal! Associa fortemente o agente ('FBI': 55%) e o alvo ('criminoso': 35%)!", en: "Core action! Strongly connects the pursuer ('FBI': 55%) and the target ('criminoso': 35%)!", fr: "L'action principale ! Relie fortement le poursuivant et la cible." } },
        { word: "um", weights: [0.01, 0.01, 0.01, 0.01, 0.01, 0.20, 0.05, 0.01, 0.01, 0.01], explanation: { pt: "Artigo indefinido masculino.", en: "Indefinite article.", fr: "Article indéfini." } },
        { word: "criminoso", weights: [0.01, 0.40, 0.01, 0.01, 0.45, 0.01, 0.50, 0.02, 0.15, 0.01], explanation: { pt: "O alvo da ação ('perseguir': 45%) feito pelo sujeito ('FBI': 40%). A atenção estabelece a ponte criminoso-polícia!", en: "The target of the chase ('perseguir': 45%) by the agent ('FBI': 40%). Attention binds target to pursuer!", fr: "La cible de la poursuite." } },
        { word: "em", weights: [0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.05, 0.25, 0.05, 0.01], explanation: { pt: "Preposição.", en: "Preposition.", fr: "Préposition." } },
        { word: "fuga", weights: [0.01, 0.10, 0.01, 0.01, 0.20, 0.01, 0.45, 0.02, 0.50, 0.05], explanation: { pt: "O estado de fuga ('fuga') conecta-se ao 'criminoso' (45%) e à ação 'perseguir' (20%)!", en: "The state of fleeing ('fuga') relates back to the 'criminoso' (45%) and the 'perseguir' (20%)!", fr: "L'état de fuite." } },
        { word: ".", weights: [0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.02, 0.45], explanation: { pt: "Fim da frase.", en: "Punctuation.", fr: "Punctuation." } }
      ]
    },
    // --- FRENCH ---
    {
      lang: "fr",
      label: "Le chien avait faim car il...",
      words: [
        { word: "Le", weights: [0.30, 0.05, 0.02, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01], explanation: { pt: "Artigo definido masculino.", en: "Definite article.", fr: "Article défini masculin singulier." } },
        { word: "chien", weights: [0.05, 0.40, 0.05, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02], explanation: { pt: "O sujeito principal da frase.", en: "The main subject of the sentence.", fr: "Le sujet principal de la phrase." } },
        { word: "avait", weights: [0.02, 0.05, 0.20, 0.05, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02], explanation: { pt: "Verbo auxiliar ter.", en: "Auxiliary verb.", fr: "Verbe auxiliaire (avoir)." } },
        { word: "faim", weights: [0.01, 0.15, 0.08, 0.35, 0.05, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02], explanation: { pt: "Substantivo que descreve o estado do cão.", en: "Noun describing the dog's state.", fr: "Nom décrivant l'état du chien." } },
        { word: "car", weights: [0.01, 0.02, 0.02, 0.05, 0.25, 0.05, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02], explanation: { pt: "Conjunção de coordenação explicativa.", en: "Causal conjunction.", fr: "Conjonction de coordination causale." } },
        { word: "il", weights: [0.02, 0.70, 0.02, 0.12, 0.02, 0.05, 0.01, 0.02, 0.02, 0.01, 0.01, 0.01, 0.01], explanation: { pt: "O pronome 'il' foca fortemente (70%) em 'chien' porque se refere diretamente a ele!", en: "The pronoun 'il' focuses heavily (70%) on 'chien' (dog) because it directly references the animal grammatically!", fr: "Le pronom 'il' se concentre fortement (70%) sur 'chien' car il y fait directement référence dans le contexte !" } },
        { word: "n'avait", weights: [0.01, 0.02, 0.02, 0.02, 0.02, 0.05, 0.30, 0.05, 0.02, 0.01, 0.01, 0.01, 0.01], explanation: { pt: "Verbo auxiliar com negação parcial.", en: "Negated auxiliary verb.", fr: "Verbe auxiliaire avec négation partielle." } },
        { word: "pas", weights: [0.01, 0.01, 0.01, 0.01, 0.01, 0.02, 0.05, 0.30, 0.05, 0.01, 0.01, 0.01, 0.01], explanation: { pt: "Adveŕbio de negação.", en: "Negation particle.", fr: "Adverbe de négation complétant la négation." } },
        { word: "mangé", weights: [0.01, 0.10, 0.02, 0.20, 0.02, 0.02, 0.05, 0.05, 0.40, 0.05, 0.02, 0.01, 0.01], explanation: { pt: "O verbo 'mangé' refere-se ao estado de fome ('faim': 20%) e ao cão ('chien': 10%)!", en: "The participle 'mangé' links back to being 'faim' (hungry: 20%) and to the 'chien' (dog: 10%)!", fr: "Le participe passé 'mangé' est lié à la faim ('faim': 20%) et au chien ('chien': 10%) !" } },
        { word: "de", weights: [0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.02, 0.02, 0.05, 0.25, 0.05, 0.01, 0.01], explanation: { pt: "Preposição.", en: "Preposition.", fr: "Préposition." } },
        { word: "la", weights: [0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.02, 0.02, 0.05, 0.25, 0.05, 0.01], explanation: { pt: "Artigo definido feminino.", en: "Definite article.", fr: "Article défini féminin singulier." } },
        { word: "journée", weights: [0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.02, 0.05, 0.05, 0.35, 0.02], explanation: { pt: "Substantivo temporal.", en: "Temporal noun.", fr: "Nom temporel." } },
        { word: ".", weights: [0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.02, 0.02, 0.40], explanation: { pt: "Ponto final.", en: "Punctuation.", fr: "Punctuation." } }
      ]
    },
    {
      lang: "fr",
      label: "Le FBI poursuit un criminel...",
      words: [
        { word: "Le", weights: [0.35, 0.05, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01], explanation: { pt: "Artigo definido masculino.", en: "Definite article.", fr: "Article défini masculin singulier." } },
        { word: "FBI", weights: [0.05, 0.45, 0.05, 0.02, 0.01, 0.02, 0.01, 0.01], explanation: { pt: "Sujeito da ação (Federal Bureau of Investigation).", en: "The agency pursuing.", fr: "Le sujet qui poursuit le criminel." } },
        { word: "poursuit", weights: [0.01, 0.55, 0.05, 0.40, 0.01, 0.35, 0.01, 0.01], explanation: { pt: "Ação principal! Associa fortemente o perseguidor ('FBI': 55%) e o alvo ('criminel': 35%)!", en: "Core action! Strongly connects the pursuer ('FBI': 55%) and the target ('criminel': 35%)!", fr: "L'action principale ! Relie fortement le poursuivant ('FBI': 55%) et la cible ('criminel': 35%) !" } },
        { word: "un", weights: [0.01, 0.01, 0.01, 0.01, 0.20, 0.05, 0.01, 0.01], explanation: { pt: "Artigo indefinido.", en: "Indefinite article.", fr: "Article indéfini." } },
        { word: "criminel", weights: [0.01, 0.40, 0.01, 0.45, 0.01, 0.50, 0.02, 0.02], explanation: { pt: "O alvo da ação ('poursuit': 45%) feito pelo sujeito ('FBI': 40%). A atenção estabelece a ponte criminoso-polícia!", en: "The target of the chase ('poursuit': 45%) by the agent ('FBI': 40%). Attention binds target to pursuer!", fr: "La cible de l'action ('poursuit': 45%) menée par le sujet ('FBI': 40%) !" } },
        { word: "en", weights: [0.01, 0.01, 0.01, 0.02, 0.01, 0.05, 0.25, 0.05], explanation: { pt: "Preposição.", en: "Preposition.", fr: "Préposition." } },
        { word: "cavale", weights: [0.01, 0.10, 0.01, 0.20, 0.01, 0.45, 0.50, 0.05], explanation: { pt: "O estado de fuga ('cavale') conecta-se ao 'criminel' (45%) e à ação 'poursuit' (20%)!", en: "The state of fleeing ('cavale') relates back to the 'criminel' (45%) and the 'poursuit' (20%)!", fr: "L'état de fuite ('cavale') est lié au 'criminel' (45%) et à la poursuite 'poursuit' (20%) !" } },
        { word: ".", weights: [0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.02, 0.45], explanation: { pt: "Fim da frase.", en: "Punctuation.", fr: "Punctuation." } }
      ]
    }
  ];

  let selectedAttentionIdx = 0;
  let hoveredWordIdx: number | null = 5;

  function getDefaultHoveredIdx(presetIdx: number, lang: string): number {
    if (presetIdx === 0) {
      return lang === 'pt' ? 6 : 5;
    } else {
      if (lang === 'pt') return 6;
      if (lang === 'fr') return 4;
      return 5;
    }
  }

  $: filteredAttentionPresets = ATTENTION_PRESETS.filter(p => p.lang === $locale);

  $: {
    if ($locale) {
      selectedAttentionIdx = 0;
      hoveredWordIdx = getDefaultHoveredIdx(0, $locale || 'en');
    }
  }

  // Clear timers on unmount
  onMount(() => {
    return () => {
      if (autoTimer) clearTimeout(autoTimer);
    };
  });
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
      <button
        on:click={() => activeSubTab = 'attention'}
        class="px-4 py-2 text-xs font-bold rounded-lg transition-all duration-150 {activeSubTab === 'attention' ? 'bg-white text-indigo-600 shadow-sm' : 'text-zinc-500 hover:text-zinc-800'}"
      >
        {$t('att_title')}
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

          <!-- Prompt Output Text Area -->
          <div class="relative bg-zinc-900 rounded-xl p-5 border border-zinc-800 shadow-md">
            <div class="absolute top-2 right-3 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{$t('dec_active_context')}</div>
            
            <div class="min-h-24 text-sm font-mono text-zinc-100 flex flex-wrap items-center gap-1.5 leading-relaxed select-text mt-3">
              {#each activePrompt.split(/\s+/) as word, wIdx}
                <span class="px-1 py-0.5 rounded transition-all bg-zinc-800/80 hover:bg-zinc-700 hover:text-white border border-zinc-700/30">{word}</span>
              {/each}
              {#if isAutoCompleting}
                <span class="inline-block w-2.5 h-4 bg-indigo-400 ml-1 animate-pulse"></span>
              {/if}
            </div>

            <!-- Generate Buttons and reset -->
            <div class="flex flex-wrap gap-3 mt-5 pt-4 border-t border-zinc-800/80 justify-between items-center">
              <div class="flex gap-2">
                <button
                  on:click={generateNextWord}
                  disabled={isAutoCompleting}
                  class="px-4 py-2.5 text-xs font-semibold bg-indigo-600 text-white rounded-lg shadow-sm hover:bg-indigo-700 disabled:opacity-40 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
                  {$t('dec_btn_next')}
                </button>
                <button
                  on:click={toggleAutoComplete}
                  class="px-4 py-2.5 text-xs font-semibold rounded-lg shadow-sm border transition-colors flex items-center gap-1.5 cursor-pointer
                         {isAutoCompleting ? 'bg-red-500 text-white border-red-500 hover:bg-red-600' : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border-zinc-700'}"
                >
                  {#if isAutoCompleting}
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect></svg>
                    {$t('dec_btn_stop')}
                  {:else}
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                    {$t('dec_btn_auto')}
                  {/if}
                </button>
              </div>

              <button
                on:click={resetPrompt}
                class="px-3.5 py-2 text-xs font-medium border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 rounded-lg transition-colors cursor-pointer"
              >
                {$t('dec_btn_reset')}
              </button>
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

    <!-- ─── SUB-TAB 3: ATTENTION PLAYGROUND ────────────────────── -->
    {#if activeSubTab === 'attention'}
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-fade-in">
        <!-- Sentence Hover Visualizer -->
        <div class="lg:col-span-8 flex flex-col gap-6">
          <div class="flex flex-col gap-1.5">
            <span class="text-xs font-bold uppercase tracking-wider text-zinc-400">{$t('att_title')}</span>
            <p class="text-sm text-zinc-600 leading-relaxed font-normal">{@html $t('att_desc')}</p>
          </div>

          <!-- Preset selection -->
          <div class="flex flex-col gap-2">
            <span class="text-xs font-bold text-zinc-700">{$t('att_sentence_label')}</span>
            <div class="flex flex-wrap gap-2">
              {#each filteredAttentionPresets as preset, idx}
                <button
                  on:click={() => { selectedAttentionIdx = idx; hoveredWordIdx = getDefaultHoveredIdx(idx, $locale || 'en'); }}
                  class="px-3.5 py-2 text-xs font-bold rounded-lg border transition-all
                         {selectedAttentionIdx === idx ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-white text-indigo-600 border-zinc-200 hover:border-indigo-300 hover:bg-indigo-50/50'}"
                >
                  {preset.label}
                </button>
              {/each}
            </div>
          </div>

          <!-- Interactive word hover container -->
          <div class="bg-white border border-zinc-200 rounded-2xl p-6 shadow-xs flex flex-col gap-5">
            <div class="flex items-center justify-between border-b border-zinc-100 pb-3">
              <span class="text-xs font-bold uppercase tracking-wider text-zinc-400">{$t('att_sentence_interactive')}</span>
              <span class="text-[11px] font-semibold text-zinc-400">{$t('att_hover_hint')}</span>
            </div>

            <!-- Words List display -->
            <div class="flex flex-wrap gap-x-3 gap-y-4 py-8 px-6 rounded-xl bg-zinc-50/60 border border-zinc-100 justify-center">
              {#each (filteredAttentionPresets[selectedAttentionIdx]?.words || []) as wObj, idx}
                {@const activeWeight = hoveredWordIdx !== null ? wObj.weights[hoveredWordIdx] : 0}
                <!-- Intensity color-mix calculations -->
                {@const opacity = 0.05 + activeWeight * 0.9}
                {@const isSelectedWord = hoveredWordIdx === idx}

                <!-- svelte-ignore a11y-mouse-events-have-key-events -->
                <button
                  on:mouseover={() => hoveredWordIdx = idx}
                  class="relative px-3.5 py-2 text-sm font-semibold rounded-lg font-mono border transition-all duration-200 scale-100 active:scale-95 cursor-default select-none
                         {isSelectedWord ? 'bg-indigo-600 border-indigo-600 text-white ring-4 ring-indigo-500/30 scale-105 z-10' : 'bg-indigo-50 border-indigo-200 text-indigo-900'}"
                  style={!isSelectedWord ? `background-color: rgba(99, 102, 241, ${opacity}); color: ${activeWeight > 0.3 ? '#ffffff' : '#1e1b4b'}; border-color: rgba(99, 102, 241, ${opacity + 0.1})` : ''}
                >
                  {wObj.word}

                  <!-- Display little weight float -->
                  {#if hoveredWordIdx !== null && activeWeight > 0 && !isSelectedWord}
                    <span class="absolute -top-3.5 left-1/2 -translate-x-1/2 px-1 rounded bg-zinc-900 text-white text-[8px] font-mono font-bold tracking-tight shadow-xs tabular-nums">
                      {Math.round(activeWeight * 100)}%
                    </span>
                  {/if}
                </button>
              {/each}
            </div>

            <!-- Legend color bar -->
            <div class="flex items-center justify-between bg-zinc-50 rounded-lg p-3 border border-zinc-100 text-xs">
              <span class="text-zinc-400 font-semibold uppercase tracking-wider text-[9px]">{$t('att_chart_legend')}</span>
              <div class="flex items-center gap-2 font-medium text-zinc-500">
                <span>{$t('att_legend_low')}</span>
                <div class="h-3 w-28 rounded bg-gradient-to-r from-indigo-100 to-indigo-700"></div>
                <span>{$t('att_legend_high')}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Attention Explanation Card -->
        <div class="lg:col-span-4 flex flex-col gap-6">
          <div class="bg-white border border-zinc-200 rounded-2xl p-5 shadow-xs flex-1 flex flex-col gap-4">
            <div class="flex items-center gap-2 border-b border-zinc-100 pb-3">
              <div class="w-7 h-7 bg-indigo-50 rounded-lg flex items-center justify-center text-indigo-600">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
              </div>
              <span class="text-xs font-bold uppercase tracking-wider text-zinc-700">{$t('att_focus_title')}</span>
            </div>

            {#if hoveredWordIdx !== null}
              {@const selectedWord = (filteredAttentionPresets[selectedAttentionIdx]?.words || [])[hoveredWordIdx]}
              {#if selectedWord}
                <div class="flex flex-col gap-3">
                  <div class="flex items-center gap-2">
                    <span class="text-xs font-bold text-zinc-400">{$t('att_focused_word')}</span>
                    <span class="px-2 py-1 font-mono text-sm font-bold bg-indigo-600 text-white rounded">"{selectedWord.word}"</span>
                  </div>

                  <div class="mt-2 flex flex-col gap-2.5">
                    <span class="text-xs font-semibold text-zinc-400 uppercase tracking-widest">{$t('att_explanation_label')}</span>
                    <p class="text-xs text-zinc-600 leading-relaxed font-normal bg-zinc-50/50 border border-zinc-100 rounded-lg p-3.5 shadow-inner">
                      {selectedWord.explanation[$t('locale') as 'pt' | 'en' | 'fr'] || selectedWord.explanation['en']}
                    </p>
                  </div>

                  <!-- Show weights listing -->
                  <div class="mt-4 flex flex-col gap-2">
                    <span class="text-xs font-bold text-zinc-400 uppercase tracking-widest">{$t('att_weights_allocation')}</span>
                    <div class="flex flex-col gap-1.5 max-h-[180px] overflow-y-auto pr-1">
                      {#each (filteredAttentionPresets[selectedAttentionIdx]?.words || []) as wObj, wIdx}
                        {@const weight = wObj.weights[hoveredWordIdx]}
                        {#if weight > 0.02}
                          <div class="flex justify-between items-center text-xs">
                            <span class="font-mono font-medium text-zinc-700">"{wObj.word}"</span>
                            <span class="font-mono font-extrabold text-indigo-600 tabular-nums">{Math.round(weight * 100)}%</span>
                          </div>
                        {/if}
                      {/each}
                    </div>
                  </div>
                </div>
              {:else}
                <div class="flex-1 flex items-center justify-center text-xs text-zinc-400 italic">{$t('att_hover_hint')}</div>
              {/if}
            {:else}
              <div class="flex-1 flex items-center justify-center text-xs text-zinc-400 italic">{$t('att_hover_hint')}</div>
            {/if}
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
