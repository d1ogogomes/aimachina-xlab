<script lang="ts">
  import { t, locale } from "../i18n";
  import { tick } from "svelte";
  import { driver } from "driver.js";
  import "driver.js/dist/driver.css";
  import {
    tokenize,
    getStringHash,
    type TokenRepresentation,
  } from "../ml/tokenizer";

  // Sub-tabs within the LLM Playground
  let activeSubTab: "tokenizer" | "decoding" = "tokenizer";

  // Guided tour for this lab. The first four steps live in the Tokenizer
  // sub-tab and the last three in the Decoding sub-tab, so the next/prev
  // handlers flip `activeSubTab` and await `tick()` before driver queries the
  // target — otherwise it would look for elements that are not mounted yet.
  // Rebuilt on every call so popovers match the active language.
  export function startTour() {
    activeSubTab = "tokenizer";
    const TOKENIZER_LAST = 3; // index of #llm-token-stats
    const DECODING_FIRST = 4; // index of #llm-temp
    const step = (element: string, n: number) => ({
      element,
      popover: {
        title: $t(`llm_tour_step${n}_title`),
        description: $t(`llm_tour_step${n}_desc`),
        side: "bottom" as const,
        align: "center" as const,
      },
    });
    document.body.classList.add("tour-active");
    const d = driver({
      showProgress: true,
      popoverClass: "aimachina-tour",
      nextBtnText: $t("tour_btn_next"),
      prevBtnText: $t("tour_btn_prev"),
      doneBtnText: $t("tour_btn_done"),
      onDestroyed: () => {
        document.body.classList.remove("tour-active");
        if (typeof window !== "undefined") {
          window.scrollTo(0, 0);
        }
      },
      onNextClick: () => {
        if (d.getActiveIndex() === TOKENIZER_LAST) {
          activeSubTab = "decoding";
          tick().then(() => d.moveNext());
        } else {
          d.moveNext();
        }
      },
      onPrevClick: () => {
        if (d.getActiveIndex() === DECODING_FIRST) {
          activeSubTab = "tokenizer";
          tick().then(() => d.movePrevious());
        } else {
          d.movePrevious();
        }
      },
      steps: [
        step("#llm-subtabs", 1),
        step("#llm-tok-mode", 2),
        step("#tokInput", 3),
        step("#llm-token-stats", 4),
        step("#llm-temp", 5),
        step("#llm-topp", 6),
        step("#llm-decode-result", 7),
      ],
    });
    d.drive();
  }

  $: currentLangCode = $locale || "pt";

  // ─── PART 1: TOKENIZER STATE ──────────────────────────────
  const DEFAULT_TOKEN_INPUTS: Record<string, string> = {
    en: "Over hill, over dale, Thorough bush, thorough brier, Over park, over pale, Thorough flood, thorough fire!",
    pt: "O Pedro comprou um livro e leu-o na biblioteca pública perto da universidade.",
    fr: "Par les monts, par les vaux, à travers les buissons et les ronces, par-delà les parcs, par-delà les barrières.",
  };

  let tokenInput = "";
  let tokenizerMode: "word" | "subword" = "word";
  let hoveredTokenIdx: number | null = null;

  let lastLocale = "";
  $: {
    const currentLocale = $locale || "pt";
    if (lastLocale === "") {
      // First initialization
      tokenInput =
        DEFAULT_TOKEN_INPUTS[currentLocale] || DEFAULT_TOKEN_INPUTS.pt;
      lastLocale = currentLocale;
    } else if (currentLocale !== lastLocale) {
      // Language switched: only load new default if empty or if matching the previous default
      const prevDefault = DEFAULT_TOKEN_INPUTS[lastLocale];
      const newDefault =
        DEFAULT_TOKEN_INPUTS[currentLocale] || DEFAULT_TOKEN_INPUTS.pt;
      if (!tokenInput || tokenInput === prevDefault) {
        tokenInput = newDefault;
      }
      lastLocale = currentLocale;
    }
  }

  // Simple deterministic hash for arbitrary strings (for IDs)
  // Color mapping based on token hash to keep same tokens colored identically
  function getTokenBgClass(token: string): string {
    const colors = [
      "bg-indigo-100/80 border-indigo-200 text-indigo-900",
      "bg-emerald-100/80 border-emerald-200 text-emerald-900",
      "bg-amber-100/80 border-amber-200 text-amber-900",
      "bg-rose-100/80 border-rose-200 text-rose-900",
      "bg-sky-100/80 border-sky-200 text-sky-900",
      "bg-slate-100/80 border-slate-200 text-slate-900",
      "bg-orange-100/80 border-orange-200 text-orange-900",
      "bg-teal-100/80 border-teal-200 text-teal-900",
    ];
    const hash = getStringHash(token);
    return colors[hash % colors.length];
  }

  // Reactive tokenization (pure logic lives in ../ml/tokenizer).
  $: tokens = tokenize(tokenInput, tokenizerMode) as TokenRepresentation[];

  $: totalTokens = tokens.length;
  $: estimatedCost =
    totalTokens > 0 ? ((totalTokens / 1000000) * 2.5).toFixed(6) : "0.000000";

  type PromptPreset = {
    lang: "en" | "pt" | "fr";
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
        { word: "running", logit: -3.0 },
      ],
      transitions: {
        blue: [
          { word: "and", logit: 4.5 },
          { word: "today", logit: 3.0 },
          { word: "with", logit: 2.5 },
        ],
        cloudy: [
          { word: "with", logit: 4.8 },
          { word: "and", logit: 3.2 },
          { word: "over", logit: 2.0 },
        ],
        clear: [
          { word: "and", logit: 4.6 },
          { word: "tonight", logit: 3.8 },
          { word: "with", logit: 2.2 },
        ],
        dark: [
          { word: "and", logit: 4.2 },
          { word: "as", logit: 3.5 },
          { word: "outside", logit: 3.0 },
        ],
        falling: [
          { word: "down", logit: 5.0 },
          { word: "on", logit: 3.2 },
          { word: "slowly", logit: 2.8 },
        ],
        and: [
          { word: "beautiful", logit: 4.0 },
          { word: "bright", logit: 3.8 },
          { word: "windy", logit: 3.5 },
          { word: "cold", logit: 3.2 },
        ],
        with: [
          { word: "some", logit: 4.2 },
          { word: "white", logit: 3.8 },
          { word: "heavy", logit: 3.5 },
          { word: "clouds", logit: 3.0 },
        ],
        tonight: [
          { word: "in", logit: 4.0 },
          { word: "after", logit: 3.2 },
          { word: "across", logit: 2.8 },
        ],
        beautiful: [
          { word: "today", logit: 4.5 },
          { word: "with", logit: 3.5 },
          { word: "and", logit: 3.0 },
          { word: ".", logit: 2.5 },
        ],
      },
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
        { word: "politician", logit: -1.2 },
      ],
      transitions: {
        physicist: [
          { word: "who", logit: 4.8 },
          { word: "known", logit: 4.0 },
          { word: "born", logit: 3.0 },
        ],
        genius: [
          { word: "who", logit: 4.5 },
          { word: "and", logit: 3.8 },
          { word: "with", logit: 2.5 },
        ],
        German: [
          { word: "physicist", logit: 5.0 },
          { word: "scientist", logit: 4.2 },
          { word: "man", logit: 2.8 },
        ],
        famous: [
          { word: "physicist", logit: 4.8 },
          { word: "for", logit: 4.5 },
          { word: "scientist", logit: 4.0 },
        ],
        scientist: [
          { word: "who", logit: 4.8 },
          { word: "of", logit: 3.5 },
          { word: "active", logit: 2.5 },
        ],
        who: [
          { word: "discovered", logit: 5.0 },
          { word: "formulated", logit: 4.8 },
          { word: "developed", logit: 4.5 },
          { word: "changed", logit: 4.0 },
        ],
        discovered: [
          { word: "relativity", logit: 5.5 },
          { word: "the", logit: 4.0 },
          { word: "photoelectric", logit: 3.8 },
        ],
        formulated: [
          { word: "the", logit: 4.8 },
          { word: "theory", logit: 4.5 },
          { word: "equation", logit: 4.0 },
        ],
        theory: [
          { word: "of", logit: 5.2 },
          { word: "about", logit: 3.0 },
          { word: ".", logit: 2.5 },
        ],
        of: [
          { word: "relativity", logit: 5.8 },
          { word: "general", logit: 4.5 },
          { word: "quantum", logit: 4.0 },
        ],
        relativity: [
          { word: "in", logit: 4.2 },
          { word: "which", logit: 3.8 },
          { word: ".", logit: 3.5 },
        ],
        for: [
          { word: "his", logit: 4.8 },
          { word: "discovering", logit: 4.0 },
          { word: "the", logit: 3.5 },
        ],
        his: [
          { word: "theory", logit: 4.6 },
          { word: "equation", logit: 4.2 },
          { word: "hair", logit: 3.8 },
          { word: "contributions", logit: 3.5 },
        ],
      },
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
        { word: "potato", logit: -3.0 },
      ],
      transitions: {
        incredible: [
          { word: "and", logit: 4.5 },
          { word: "because", logit: 3.2 },
          { word: ".", logit: 2.5 },
        ],
        powerful: [
          { word: "tool", logit: 4.8 },
          { word: "and", logit: 3.5 },
          { word: "technology", logit: 3.0 },
        ],
        complex: [
          { word: "to", logit: 4.5 },
          { word: "and", logit: 3.2 },
          { word: "for", logit: 2.8 },
        ],
        useful: [
          { word: "for", logit: 4.8 },
          { word: "in", logit: 3.8 },
          { word: "and", logit: 3.5 },
        ],
        dangerous: [
          { word: "if", logit: 4.5 },
          { word: "for", logit: 3.0 },
          { word: "but", logit: 2.8 },
        ],
        and: [
          { word: "transformative", logit: 4.0 },
          { word: "fast", logit: 3.8 },
          { word: "efficient", logit: 3.5 },
          { word: "can", logit: 3.2 },
        ],
        for: [
          { word: "the", logit: 4.5 },
          { word: "helping", logit: 4.0 },
          { word: "automating", logit: 3.8 },
          { word: "us", logit: 3.5 },
        ],
        helping: [
          { word: "to", logit: 4.5 },
          { word: "people", logit: 3.8 },
          { word: "society", logit: 3.5 },
        ],
        to: [
          { word: "create", logit: 4.5 },
          { word: "solve", logit: 4.2 },
          { word: "improve", logit: 3.8 },
        ],
      },
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
        { word: "a correr", logit: -3.0 },
      ],
      transitions: {
        azul: [
          { word: "e", logit: 4.5 },
          { word: "hoje", logit: 3.0 },
          { word: "com", logit: 2.5 },
        ],
        nublado: [
          { word: "com", logit: 4.8 },
          { word: "e", logit: 3.2 },
          { word: "sobre", logit: 2.0 },
        ],
        limpo: [
          { word: "e", logit: 4.6 },
          { word: "esta noite", logit: 3.8 },
          { word: "com", logit: 2.2 },
        ],
        escuro: [
          { word: "e", logit: 4.2 },
          { word: "como", logit: 3.5 },
          { word: "lá fora", logit: 3.0 },
        ],
        "a cair": [
          { word: "sobre", logit: 5.0 },
          { word: "em", logit: 3.2 },
          { word: "lentamente", logit: 2.8 },
        ],
        e: [
          { word: "belo", logit: 4.0 },
          { word: "brilhante", logit: 3.8 },
          { word: "frio", logit: 3.5 },
          { word: "ventoso", logit: 3.2 },
        ],
        com: [
          { word: "algumas", logit: 4.2 },
          { word: "nuvens", logit: 3.8 },
          { word: "estrelas", logit: 3.5 },
          { word: "nevoeiro", logit: 3.0 },
        ],
        hoje: [
          { word: "em", logit: 4.0 },
          { word: "depois", logit: 3.2 },
          { word: "por", logit: 2.8 },
        ],
        belo: [
          { word: "hoje", logit: 4.5 },
          { word: "com", logit: 3.5 },
          { word: "e", logit: 3.0 },
          { word: ".", logit: 2.5 },
        ],
      },
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
        { word: "político", logit: -1.2 },
      ],
      transitions: {
        físico: [
          { word: "que", logit: 4.8 },
          { word: "conhecido", logit: 4.0 },
          { word: "nascido", logit: 3.0 },
        ],
        gênio: [
          { word: "que", logit: 4.5 },
          { word: "e", logit: 3.8 },
          { word: "com", logit: 2.5 },
        ],
        alemão: [
          { word: "físico", logit: 5.0 },
          { word: "cientista", logit: 4.2 },
          { word: "brilhante", logit: 2.8 },
        ],
        famoso: [
          { word: "físico", logit: 4.8 },
          { word: "por", logit: 4.5 },
          { word: "cientista", logit: 4.0 },
        ],
        cientista: [
          { word: "que", logit: 4.8 },
          { word: "de", logit: 3.5 },
          { word: "ativo", logit: 2.5 },
        ],
        que: [
          { word: "descobriu", logit: 5.0 },
          { word: "formulou", logit: 4.8 },
          { word: "desenvolveu", logit: 4.5 },
          { word: "mudou", logit: 4.0 },
        ],
        descobriu: [
          { word: "a relatividade", logit: 5.5 },
          { word: "o", logit: 4.0 },
          { word: "efeito", logit: 3.8 },
        ],
        formulou: [
          { word: "a", logit: 4.8 },
          { word: "teoria", logit: 4.5 },
          { word: "equação", logit: 4.0 },
        ],
        teoria: [
          { word: "da", logit: 5.2 },
          { word: "sobre", logit: 3.0 },
          { word: ".", logit: 2.5 },
        ],
        da: [
          { word: "relatividade", logit: 5.8 },
          { word: "mecânica", logit: 4.5 },
          { word: "física", logit: 4.0 },
        ],
        relatividade: [
          { word: "em", logit: 4.2 },
          { word: "que", logit: 3.8 },
          { word: ".", logit: 3.5 },
        ],
        por: [
          { word: "sua", logit: 4.8 },
          { word: "descobrir", logit: 4.0 },
          { word: "ter", logit: 3.5 },
        ],
        sua: [
          { word: "teoria", logit: 4.6 },
          { word: "equação", logit: 4.2 },
          { word: "vida", logit: 3.8 },
        ],
      },
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
        { word: "batata", logit: -3.0 },
      ],
      transitions: {
        incrível: [
          { word: "e", logit: 4.5 },
          { word: "porque", logit: 3.2 },
          { word: ".", logit: 2.5 },
        ],
        poderosa: [
          { word: "ferramenta", logit: 4.8 },
          { word: "e", logit: 3.5 },
          { word: "tecnologia", logit: 3.0 },
        ],
        complexa: [
          { word: "de", logit: 4.5 },
          { word: "e", logit: 3.2 },
          { word: "para", logit: 2.8 },
        ],
        útil: [
          { word: "para", logit: 4.8 },
          { word: "no", logit: 3.8 },
          { word: "e", logit: 3.5 },
        ],
        perigosa: [
          { word: "se", logit: 4.5 },
          { word: "para", logit: 3.0 },
          { word: "mas", logit: 2.8 },
        ],
        e: [
          { word: "transformadora", logit: 4.0 },
          { word: "rápida", logit: 3.8 },
          { word: "eficiente", logit: 3.5 },
          { word: "pode", logit: 3.2 },
        ],
        para: [
          { word: "o", logit: 4.5 },
          { word: "ajudar", logit: 4.0 },
          { word: "automatizar", logit: 3.8 },
          { word: "as", logit: 3.5 },
        ],
        ajudar: [
          { word: "a", logit: 4.5 },
          { word: "os", logit: 3.8 },
          { word: "na", logit: 3.5 },
        ],
        a: [
          { word: "sociedade", logit: 4.5 },
          { word: "humanidade", logit: 4.2 },
          { word: "criar", logit: 3.8 },
          { word: "resolver", logit: 3.5 },
        ],
        sociedade: [
          { word: "moderna", logit: 4.5 },
          { word: "a", logit: 3.0 },
          { word: ".", logit: 2.5 },
        ],
      },
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
        { word: "en train de courir", logit: -3.0 },
      ],
      transitions: {
        bleu: [
          { word: "et", logit: 4.5 },
          { word: "aujourd'hui", logit: 3.0 },
          { word: "avec", logit: 2.5 },
        ],
        nuageux: [
          { word: "avec", logit: 4.8 },
          { word: "et", logit: 3.2 },
          { word: "au-dessus", logit: 2.0 },
        ],
        dégagé: [
          { word: "et", logit: 4.6 },
          { word: "ce soir", logit: 3.8 },
          { word: "avec", logit: 2.2 },
        ],
        sombre: [
          { word: "et", logit: 4.2 },
          { word: "comme", logit: 3.5 },
          { word: "dehors", logit: 3.0 },
        ],
        et: [
          { word: "beau", logit: 4.0 },
          { word: "lumineux", logit: 3.8 },
          { word: "froid", logit: 3.5 },
          { word: "venteux", logit: 3.2 },
        ],
        avec: [
          { word: "quelques", logit: 4.2 },
          { word: "nuages", logit: 3.8 },
          { word: "étoiles", logit: 3.5 },
          { word: "brouillard", logit: 3.0 },
        ],
        "aujourd'hui": [
          { word: "en", logit: 4.0 },
          { word: "après", logit: 3.2 },
          { word: "par", logit: 2.8 },
        ],
        beau: [
          { word: "aujourd'hui", logit: 4.5 },
          { word: "avec", logit: 3.5 },
          { word: "et", logit: 3.0 },
          { word: ".", logit: 2.5 },
        ],
      },
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
        { word: "politicien", logit: -1.2 },
      ],
      transitions: {
        physicien: [
          { word: "qui", logit: 4.8 },
          { word: "connu", logit: 4.0 },
          { word: "né", logit: 3.0 },
        ],
        génie: [
          { word: "qui", logit: 4.5 },
          { word: "et", logit: 3.8 },
          { word: "avec", logit: 2.5 },
        ],
        Allemand: [
          { word: "physicien", logit: 5.0 },
          { word: "scientifique", logit: 4.2 },
          { word: "brillant", logit: 2.8 },
        ],
        célèbre: [
          { word: "physicien", logit: 4.8 },
          { word: "pour", logit: 4.5 },
          { word: "scientifique", logit: 4.0 },
        ],
        scientifique: [
          { word: "qui", logit: 4.8 },
          { word: "de", logit: 3.5 },
          { word: "actif", logit: 2.5 },
        ],
        qui: [
          { word: "a découvert", logit: 5.0 },
          { word: "a formulé", logit: 4.8 },
          { word: "a développé", logit: 4.5 },
          { word: "a changé", logit: 4.0 },
        ],
        "a découvert": [
          { word: "la relativité", logit: 5.5 },
          { word: "l'effet", logit: 4.0 },
          { word: "la", logit: 3.8 },
        ],
        "a formulé": [
          { word: "la", logit: 4.8 },
          { word: "théorie", logit: 4.5 },
          { word: "équation", logit: 4.0 },
        ],
        théorie: [
          { word: "de", logit: 5.2 },
          { word: "sur", logit: 3.0 },
          { word: ".", logit: 2.5 },
        ],
        de: [
          { word: "la relativité", logit: 5.8 },
          { word: "générale", logit: 4.5 },
          { word: "la physique", logit: 4.0 },
        ],
        "la relativité": [
          { word: "en", logit: 4.2 },
          { word: "qui", logit: 3.8 },
          { word: ".", logit: 3.5 },
        ],
        pour: [
          { word: "ses", logit: 4.8 },
          { word: "avoir", logit: 4.0 },
          { word: "sa", logit: 3.5 },
        ],
        ses: [
          { word: "travaux", logit: 4.6 },
          { word: "découvertes", logit: 4.2 },
          { word: "contributions", logit: 3.8 },
        ],
      },
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
        { word: "une patate", logit: -3.0 },
      ],
      transitions: {
        incroyable: [
          { word: "et", logit: 4.5 },
          { word: "parce que", logit: 3.2 },
          { word: ".", logit: 2.5 },
        ],
        puissante: [
          { word: "technologie", logit: 4.8 },
          { word: "et", logit: 3.5 },
          { word: "ressource", logit: 3.0 },
        ],
        complexe: [
          { word: "à", logit: 4.5 },
          { word: "et", logit: 3.2 },
          { word: "pour", logit: 2.8 },
        ],
        utile: [
          { word: "pour", logit: 4.8 },
          { word: "dans", logit: 3.8 },
          { word: "et", logit: 3.5 },
        ],
        dangereuse: [
          { word: "si", logit: 4.5 },
          { word: "pour", logit: 3.0 },
          { word: "mais", logit: 2.8 },
        ],
        et: [
          { word: "transformatrice", logit: 4.0 },
          { word: "rapide", logit: 3.8 },
          { word: "efficace", logit: 3.5 },
          { word: "peut", logit: 3.2 },
        ],
        pour: [
          { word: "l'avenir", logit: 4.5 },
          { word: "aider", logit: 4.0 },
          { word: "automatiser", logit: 3.8 },
          { word: "les", logit: 3.5 },
        ],
        aider: [
          { word: "à", logit: 4.5 },
          { word: "les", logit: 3.8 },
          { word: "la", logit: 3.5 },
        ],
        à: [
          { word: "créer", logit: 4.5 },
          { word: "résoudre", logit: 4.2 },
          { word: "améliorer", logit: 3.8 },
        ],
      },
    },
  ];

  let selectedPresetIdx = 0;
  let temperature = 0.7;
  let topP = 0.9;

  $: filteredPresets = PROMPT_PRESETS.filter((p) => p.lang === currentLangCode);

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
    const scaled = activeCandidates.map((c) => ({
      word: c.word,
      logit: c.logit,
      scaledLogit: c.logit / tempValue,
    }));

    // 2. Raw Softmax probabilities
    const maxScaledLogit = Math.max(...scaled.map((s) => s.scaledLogit)); // numerical stability
    const exps = scaled.map((s) => Math.exp(s.scaledLogit - maxScaledLogit));
    const sumExps = exps.reduce((a, b) => a + b, 0);
    const rawProbs = scaled.map((s, i) => exps[i] / sumExps);

    // Assemble initial array
    let list: ProcessedCandidate[] = scaled.map((s, i) => ({
      word: s.word,
      logit: s.logit,
      scaledLogit: s.scaledLogit,
      rawProb: rawProbs[i],
      filtered: false,
      normProb: rawProbs[i],
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
    const sumKept = list
      .filter((l) => !l.filtered)
      .reduce((sum, l) => sum + l.rawProb, 0);
    list = list.map((l) => {
      if (l.filtered) return l;
      return {
        ...l,
        normProb: sumKept > 0 ? l.rawProb / sumKept : 1.0,
      };
    });

    // Re-sort back to logit descending or keep probability descending
    return list;
  })();

  // Most probable surviving candidate — used to surface the "winner"
  // in plain English above the chart so beginners read the result before
  // the math.
  $: topCandidate = computedCandidates.find((c) => !c.filtered) ?? null;

  // Select Preset Prompt
  function handlePresetChange(idx: number) {
    selectedPresetIdx = idx;
  }
</script>

<div
  class="bg-zinc-50 rounded-2xl shadow-sm border border-zinc-200 overflow-hidden flex flex-col transition-all duration-200"
>
  <!-- Inner Playground sub-navigation -->
  <div
    class="bg-white border-b border-zinc-200 px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4"
  >
    <div>
      <h2 class="text-lg font-bold tracking-tight text-zinc-900">
        {$t("llm_tab_title")}
      </h2>
      <p class="text-xs text-zinc-500 mt-1 max-w-xl">{$t("llm_tab_desc")}</p>
    </div>

    <!-- Pills tabs -->
    <div
      id="llm-subtabs"
      class="flex items-center gap-1 bg-zinc-100 p-1.5 rounded-xl self-start md:self-auto border border-zinc-200/50"
    >
      <button
        on:click={() => (activeSubTab = "tokenizer")}
        class="px-4 py-2 text-xs font-bold rounded-lg transition-all duration-150 {activeSubTab ===
        'tokenizer'
          ? 'bg-white text-indigo-600 shadow-sm'
          : 'text-zinc-500 hover:text-zinc-800'}"
      >
        {$t("tok_title")}
      </button>
      <button
        on:click={() => (activeSubTab = "decoding")}
        class="px-4 py-2 text-xs font-bold rounded-lg transition-all duration-150 {activeSubTab ===
        'decoding'
          ? 'bg-white text-indigo-600 shadow-sm'
          : 'text-zinc-500 hover:text-zinc-800'}"
      >
        {$t("dec_title")}
      </button>
    </div>
  </div>

  <div class="p-6 md:p-8 flex-1 min-h-[500px]">
    <!-- ─── SUB-TAB 1: TOKENIZER PLAYGROUND ────────────────────── -->
    {#if activeSubTab === "tokenizer"}
      <div class="flex flex-col gap-6 animate-fade-in max-w-3xl mx-auto">
        <!-- Lead: one paragraph, no callouts. The toggle below the input
             is itself the lesson — we let the user discover the difference
             between modes by clicking, not by reading three boxes of copy. -->
        <div class="flex flex-col gap-2">
          <p class="text-base text-zinc-700 leading-relaxed">
            {@html $t("tok_desc")}
          </p>
        </div>

        <!-- Mode toggle: Simple vs BPE. The single most pedagogically
             important interaction on this page. -->
        <div
          id="llm-tok-mode"
          class="flex items-center gap-2 bg-zinc-100 p-1 rounded-xl self-start border border-zinc-200/40"
        >
          <button
            on:click={() => (tokenizerMode = "word")}
            class="px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all {tokenizerMode ===
            'word'
              ? 'bg-white text-indigo-600 shadow-xs'
              : 'text-zinc-500 hover:text-zinc-800'}"
          >
            {$t("tok_mode_word")}
          </button>
          <button
            on:click={() => (tokenizerMode = "subword")}
            class="px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all {tokenizerMode ===
            'subword'
              ? 'bg-white text-teal-600 shadow-xs'
              : 'text-zinc-500 hover:text-zinc-800'}"
          >
            {$t("tok_mode_subword")}
          </button>
        </div>

        <textarea
          id="tokInput"
          bind:value={tokenInput}
          placeholder={$t("tok_input_placeholder")}
          rows="3"
          class="w-full p-4 text-sm border border-zinc-200 rounded-xl outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100/50 transition-all font-sans bg-white shadow-xs resize-none"
        ></textarea>

        <!-- Visualizer: the centerpiece. Token chips, no header, no hint
             text. The interaction is self-evident. -->
        {#if tokens.length > 0}
          <div
            class="flex flex-wrap gap-x-1.5 gap-y-2 p-5 rounded-xl bg-white border border-zinc-200 shadow-xs"
          >
            {#each tokens as tok, idx}
              <!-- svelte-ignore a11y-mouse-events-have-key-events -->
              <!-- svelte-ignore a11y-no-static-element-interactions -->
              <span
                on:mouseover={() => (hoveredTokenIdx = idx)}
                on:mouseleave={() => (hoveredTokenIdx = null)}
                class="px-2 py-1 text-sm font-semibold font-mono rounded border transition-all cursor-default shrink-0 select-none
                       {getTokenBgClass(tok.text)}
                       {hoveredTokenIdx === idx
                  ? 'ring-2 ring-indigo-500 scale-105 shadow-xs'
                  : ''}"
              >
                {tok.text}
              </span>
            {/each}
          </div>
          <!-- BPE-only legend: the "Ġ" prefix is jarring without context.
               Only show it in subword mode where it actually appears. -->
          {#if tokenizerMode === "subword"}
            <p class="text-[11px] text-zinc-500 leading-relaxed -mt-3">
              {@html $t("tok_g_legend")}
            </p>
          {/if}
        {:else}
          <div
            class="h-28 rounded-xl border border-dashed border-zinc-200 flex items-center justify-center text-sm text-zinc-400 italic bg-white"
          >
            {$t("tok_input_placeholder")}
          </div>
        {/if}

        <!-- Two stats only: count and cost. Characters and chars/token are
             technical noise for a first-time reader. The cost intuition
             ("≈ 1 cent per 4 000 tokens") lives inline next to the dollar
             figure so the number stops being abstract. -->
        <div id="llm-token-stats" class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div
            class="bg-white border border-zinc-200 rounded-xl px-5 py-4 shadow-xs"
          >
            <span
              class="text-[10px] font-bold uppercase tracking-wider text-zinc-400"
              >{$t("tok_stats_tokens")}</span
            >
            <div
              class="text-3xl font-extrabold tracking-tight text-zinc-900 mt-1 tabular-nums"
            >
              {totalTokens}
            </div>
          </div>
          <div
            class="bg-white border border-zinc-200 rounded-xl px-5 py-4 shadow-xs"
          >
            <span
              class="text-[10px] font-bold uppercase tracking-wider text-zinc-400"
              >{$t("tok_stats_cost")}</span
            >
            <div
              class="text-3xl font-extrabold tracking-tight text-emerald-600 mt-1 tabular-nums"
            >
              ${estimatedCost}
            </div>
            <div class="text-[11px] text-zinc-400 mt-1">
              {$t("tok_stats_cost_intuition")}
            </div>
          </div>
        </div>
      </div>
    {/if}

    <!-- ─── SUB-TAB 2: DECODING PLAYGROUND ────────────────────── -->
    {#if activeSubTab === "decoding"}
      <div class="flex flex-col gap-6 animate-fade-in max-w-3xl mx-auto">
        <!-- Lead. -->
        <div class="flex flex-col gap-2">
          <p class="text-base text-zinc-700 leading-relaxed">
            {@html $t("dec_desc")}
          </p>
        </div>

        <!-- Prompt presets. -->
        <div class="flex flex-col gap-2">
          <span class="text-xs font-bold text-zinc-700"
            >{$t("dec_prompt_label")}</span
          >
          <div class="flex flex-wrap gap-2">
            {#each filteredPresets as preset, idx}
              <button
                on:click={() => handlePresetChange(idx)}
                class="px-3.5 py-2 text-xs font-bold rounded-lg border transition-all
                       {selectedPresetIdx === idx
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                  : 'bg-white text-indigo-600 border-zinc-200 hover:border-indigo-300 hover:bg-indigo-50/50'}"
              >
                {preset.title}
              </button>
            {/each}
          </div>
        </div>

        <!-- Sliders: kept compact. End-anchors give intuition; the small
             one-line description below each slider is enough for context. -->
        <div
          class="bg-white border border-zinc-200 rounded-2xl p-5 shadow-xs flex flex-col gap-6"
        >
          <div id="llm-temp" class="flex flex-col gap-2">
            <div class="flex justify-between items-center">
              <span class="text-xs font-bold text-zinc-800"
                >{$t("dec_temp_label")}</span
              >
              <span
                class="px-2 py-0.5 text-xs font-mono font-bold bg-indigo-50 border border-indigo-100 text-indigo-700 rounded tabular-nums"
                >T = {temperature.toFixed(2)}</span
              >
            </div>
            <input
              type="range"
              bind:value={temperature}
              min="0.1"
              max="2.0"
              step="0.05"
              class="w-full accent-indigo-600 h-1.5 bg-zinc-100 rounded-lg cursor-pointer"
            />
            <div
              class="flex justify-between text-[10px] font-semibold text-zinc-400 uppercase tracking-wider px-0.5"
            >
              <span>← {$t("dec_temp_anchor_low")}</span>
              <span>{$t("dec_temp_anchor_high")} →</span>
            </div>
            <p class="text-[11px] text-zinc-500 leading-normal">
              {$t("dec_temp_desc")}
            </p>
          </div>

          <div id="llm-topp" class="flex flex-col gap-2">
            <div class="flex justify-between items-center">
              <span class="text-xs font-bold text-zinc-800"
                >{$t("dec_topp_label")}</span
              >
              <span
                class="px-2 py-0.5 text-xs font-mono font-bold bg-teal-50 border border-teal-100 text-teal-700 rounded tabular-nums"
                >P = {topP.toFixed(2)}</span
              >
            </div>
            <input
              type="range"
              bind:value={topP}
              min="0.1"
              max="1.0"
              step="0.05"
              class="w-full accent-teal-600 h-1.5 bg-zinc-100 rounded-lg cursor-pointer"
            />
            <div
              class="flex justify-between text-[10px] font-semibold text-zinc-400 uppercase tracking-wider px-0.5"
            >
              <span>← {$t("dec_topp_anchor_low")}</span>
              <span>{$t("dec_topp_anchor_high")} →</span>
            </div>
            <p class="text-[11px] text-zinc-500 leading-normal">
              {$t("dec_topp_desc")}
            </p>
          </div>
        </div>

        <!-- Result card: surface the most-likely word in plain text. The
             chart that follows it is supporting evidence, not the headline. -->
        {#if topCandidate}
          <div
            id="llm-decode-result"
            class="bg-gradient-to-br from-indigo-50 to-indigo-50/40 border border-indigo-100 rounded-xl px-5 py-4 flex items-center gap-3"
          >
            <div
              class="w-9 h-9 rounded-full bg-indigo-600 flex items-center justify-center text-white shrink-0"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"><polyline points="9 18 15 12 9 6" /></svg
              >
            </div>
            <div class="flex-1 min-w-0">
              <div
                class="text-[10px] font-bold uppercase tracking-widest text-indigo-500"
              >
                {$t("dec_winner_label")}
              </div>
              <div
                class="text-lg font-bold text-indigo-900 truncate font-mono mt-0.5"
              >
                "{topCandidate.word}"
                <span class="text-sm font-semibold text-indigo-400 tabular-nums"
                  >· {Math.round(topCandidate.normProb * 100)}%</span
                >
              </div>
            </div>
          </div>
        {/if}

        <!-- Probability bars: simplified. No raw logits, no math toggle.
             Filtered (Top-P excluded) bars are visibly muted so the user
             still sees the cut. -->
        <div
          class="bg-white border border-zinc-200 rounded-2xl p-5 shadow-xs flex flex-col gap-3"
        >
          {#each computedCandidates as cand}
            <div class="flex items-center gap-3 w-full">
              <div class="w-32 shrink-0 text-right">
                <span
                  class="text-sm font-semibold font-mono {cand.filtered
                    ? 'text-zinc-400 line-through'
                    : 'text-zinc-800'}"
                >
                  "{cand.word}"
                </span>
              </div>
              <div
                class="flex-1 h-6 bg-zinc-100 rounded-md overflow-hidden relative border border-zinc-200/40"
              >
                <div
                  class="h-full rounded-l-md transition-all duration-300
                         {cand.filtered
                    ? 'bg-zinc-200'
                    : 'bg-gradient-to-r from-indigo-500 to-indigo-600'}"
                  style="width: {(cand.filtered
                    ? cand.rawProb
                    : cand.normProb) * 100}%"
                ></div>
                <span
                  class="absolute inset-y-0 right-3 flex items-center text-[10px] font-mono font-bold tabular-nums {cand.filtered
                    ? 'text-zinc-400'
                    : 'text-indigo-900'}"
                >
                  {Math.round(
                    (cand.filtered ? cand.rawProb : cand.normProb) * 100,
                  )}%
                </span>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .animate-fade-in {
    animation: fadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }
</style>
