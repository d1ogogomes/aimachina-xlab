<script lang="ts">
  import { t, locale } from "../i18n";
  import { tick } from "svelte";
  import { driver } from "driver.js";
  import "driver.js/dist/driver.css";
  import {
    tokenize,
    getStringHash,
    ensureBpe,
    type TokenRepresentation,
  } from "../ml/tokenizer";

  // Sub-tabs within the LLM Playground
  let activeSubTab: "tokenizer" | "decoding" = "tokenizer";

  // State for hiding/showing advanced settings (like Top-P)
  let showAdvancedSettings = false;

  // Guided tour for this lab. The first four steps live in the Tokenizer
  // sub-tab and the last three in the Decoding sub-tab, so next/prev switch
  // tabs before Driver looks for the target elements.
  export async function startTour() {
    activeSubTab = "tokenizer";
    showAdvancedSettings = true;
    await tick();
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
      "bg-brand-wash/80 border-brand/30 text-brand",
      "bg-success-wash/80 border-success/30 text-success",
      "bg-warning-wash/80 border-warning/30 text-warning",
      "bg-danger-wash/80 border-danger/30 text-danger",
      "bg-llm-wash/80 border-llm/30 text-llm",
      "bg-sunken/80 border-hairline text-ink",
      "bg-warning-wash/80 border-warning/30 text-warning",
      "bg-llm-wash/80 border-llm/30 text-llm",
    ];
    const hash = getStringHash(token);
    return colors[hash % colors.length];
  }

  // The real GPT-2 BPE table loads lazily the first time subword mode is used.
  let bpeReady = false;
  let bpeLoading = false;
  async function loadBpe() {
    if (bpeReady || bpeLoading) return;
    bpeLoading = true;
    try {
      await ensureBpe();
      bpeReady = true;
    } finally {
      bpeLoading = false;
    }
  }
  $: if (tokenizerMode === "subword") loadBpe();

  // Reactive tokenization (pure logic lives in ../ml/tokenizer). In subword
  // mode we wait for the BPE table; `bpeReady` is a dep so it recomputes once loaded.
  $: tokens = (tokenizerMode === "subword" && !bpeReady
    ? []
    : tokenize(tokenInput, tokenizerMode)) as TokenRepresentation[];

  $: totalTokens = tokens.length;
  $: estimatedCost =
    totalTokens > 0 ? ((totalTokens / 1000000) * 2.5).toFixed(6) : "0.000000";

  type DemoCandidate = { word: string; piece: string; logit: number };
  type PromptPreset = {
    title: string;
    text: string;
    candidates: DemoCandidate[];
    transitions: Record<string, DemoCandidate[]>;
  };

  const punct = new Set([".", ",", "!", "?", ":", ";"]);
  const makeCandidate = (word: string, logit: number): DemoCandidate => ({
    word,
    piece: punct.has(word) ? word : ` ${word}`,
    logit,
  });
  const c = makeCandidate;

  // A small, reliable classroom language model. It is intentionally curated:
  // beginners should see coherent probabilities in all supported languages
  // while still being able to experiment with temperature and top-p.
  const PROMPT_PRESETS: Record<string, PromptPreset[]> = {
    en: [
      {
        title: "Once upon a time…",
        text: "Once upon a time, there was a",
        candidates: [c("young", 5.2), c("small", 4.6), c("brave", 4.1), c("hidden", 3.2), c("strange", 2.8), c("blue", 1.4), c("potato", -1.8), c("because", -2.5)],
        transitions: {
          young: [c("inventor", 5.1), c("student", 4.4), c("artist", 3.9), c("traveler", 3.4), c("dragon", 2.8), c(".", 1.3)],
          small: [c("village", 5.0), c("robot", 4.0), c("garden", 3.7), c("island", 3.1), c("idea", 2.2), c(".", 1.0)],
          brave: [c("girl", 5.0), c("boy", 4.6), c("team", 3.7), c("explorer", 3.1), c("choice", 2.1), c(".", 1.1)],
          inventor: [c("who", 5.0), c("with", 3.8), c("from", 3.4), c("and", 3.0), c(".", 2.0)],
          who: [c("built", 5.1), c("found", 4.2), c("wanted", 3.7), c("learned", 3.2), c("forgot", 1.5)],
          built: [c("a", 5.0), c("the", 3.5), c("new", 2.7), c("carefully", 1.8)],
        },
      },
      {
        title: "The capital of France…",
        text: "The capital of France is",
        candidates: [c("Paris", 6.2), c("known", 2.6), c("famous", 2.3), c("beautiful", 1.9), c("London", -1.2), c("blue", -2.4)],
        transitions: {
          Paris: [c(".", 5.7), c("and", 3.5), c(",", 3.0), c("because", 1.2)],
          and: [c("it", 4.8), c("the", 3.2), c("many", 2.1)],
        },
      },
      {
        title: "My favorite food…",
        text: "My favorite food is",
        candidates: [c("pizza", 4.9), c("rice", 4.0), c("soup", 3.7), c("pasta", 3.5), c("fresh", 2.5), c("running", -2.0)],
        transitions: {
          pizza: [c("because", 4.7), c("with", 4.0), c("and", 3.2), c(".", 2.8)],
          rice: [c("with", 4.6), c("because", 3.8), c("and", 3.0), c(".", 2.3)],
          because: [c("it", 5.0), c("the", 3.4), c("I", 3.0)],
          it: [c("is", 5.2), c("tastes", 4.0), c("feels", 2.8)],
        },
      },
      {
        title: "The best way to learn…",
        text: "The best way to learn is to",
        candidates: [c("practice", 5.4), c("ask", 4.5), c("experiment", 4.1), c("read", 3.4), c("sleep", 1.2), c("banana", -2.4)],
        transitions: {
          practice: [c("every", 4.8), c("with", 4.0), c("and", 3.2), c(".", 2.0)],
          ask: [c("questions", 5.1), c("for", 3.5), c("why", 3.0)],
          experiment: [c("with", 4.8), c("and", 3.5), c("until", 2.8)],
        },
      },
    ],
    pt: [
      {
        title: "Era uma vez…",
        text: "Era uma vez, havia um",
        candidates: [c("jovem", 5.2), c("pequeno", 4.6), c("robô", 4.1), c("castelo", 3.4), c("mistério", 2.9), c("azul", 1.3), c("batata", -1.8), c("porque", -2.4)],
        transitions: {
          jovem: [c("inventor", 5.1), c("estudante", 4.4), c("artista", 3.8), c("viajante", 3.2), c(".", 1.3)],
          pequeno: [c("robô", 4.9), c("dragão", 4.2), c("jardim", 3.6), c("segredo", 3.0), c(".", 1.0)],
          robô: [c("que", 5.0), c("com", 3.8), c("muito", 3.0), c(".", 2.0)],
          inventor: [c("que", 5.0), c("com", 3.7), c("da", 3.1), c("e", 2.9), c(".", 1.8)],
          que: [c("construiu", 5.1), c("descobriu", 4.3), c("queria", 3.8), c("aprendeu", 3.2)],
          construiu: [c("uma", 4.9), c("um", 4.4), c("a", 3.3), c("com", 2.0)],
        },
      },
      {
        title: "A capital de Portugal…",
        text: "A capital de Portugal é",
        candidates: [c("Lisboa", 6.2), c("conhecida", 2.7), c("bonita", 2.3), c("importante", 2.0), c("Porto", -0.8), c("azul", -2.5)],
        transitions: {
          Lisboa: [c(".", 5.7), c("e", 3.5), c(",", 3.0), c("porque", 1.2)],
          e: [c("tem", 4.6), c("é", 3.8), c("fica", 3.0)],
        },
      },
      {
        title: "A minha comida favorita…",
        text: "A minha comida favorita é",
        candidates: [c("pizza", 4.8), c("arroz", 4.2), c("sopa", 3.8), c("massa", 3.5), c("fresca", 2.1), c("correr", -2.0)],
        transitions: {
          pizza: [c("porque", 4.8), c("com", 4.0), c("e", 3.1), c(".", 2.8)],
          arroz: [c("com", 4.6), c("porque", 3.8), c("e", 3.0), c(".", 2.2)],
          porque: [c("é", 5.0), c("tem", 3.7), c("me", 3.0)],
          é: [c("simples", 4.7), c("deliciosa", 4.3), c("boa", 3.5)],
        },
      },
      {
        title: "A melhor forma de aprender…",
        text: "A melhor forma de aprender é",
        candidates: [c("praticar", 5.4), c("perguntar", 4.6), c("experimentar", 4.1), c("ler", 3.4), c("dormir", 1.1), c("banana", -2.3)],
        transitions: {
          praticar: [c("todos", 4.8), c("com", 4.0), c("e", 3.2), c(".", 2.0)],
          perguntar: [c("porquê", 4.9), c("sempre", 3.8), c("a", 3.0)],
          experimentar: [c("com", 4.7), c("e", 3.5), c("até", 2.8)],
        },
      },
    ],
    fr: [
      {
        title: "Il était une fois…",
        text: "Il était une fois, il y avait un",
        candidates: [c("jeune", 5.2), c("petit", 4.7), c("robot", 4.2), c("château", 3.3), c("mystère", 2.8), c("bleu", 1.3), c("pomme", -1.8), c("parce", -2.4)],
        transitions: {
          jeune: [c("inventeur", 5.1), c("élève", 4.4), c("artiste", 3.8), c("voyageur", 3.2), c(".", 1.3)],
          petit: [c("robot", 4.9), c("dragon", 4.2), c("jardin", 3.6), c("secret", 3.0), c(".", 1.0)],
          robot: [c("qui", 5.0), c("avec", 3.8), c("très", 3.0), c(".", 2.0)],
          inventeur: [c("qui", 5.0), c("avec", 3.7), c("du", 3.1), c("et", 2.9), c(".", 1.8)],
          qui: [c("construisait", 5.1), c("découvrait", 4.3), c("voulait", 3.8), c("apprenait", 3.2)],
          construisait: [c("une", 4.9), c("un", 4.4), c("la", 3.3), c("avec", 2.0)],
        },
      },
      {
        title: "La capitale de la France…",
        text: "La capitale de la France est",
        candidates: [c("Paris", 6.2), c("connue", 2.7), c("belle", 2.3), c("importante", 2.0), c("Londres", -1.0), c("bleue", -2.5)],
        transitions: {
          Paris: [c(".", 5.7), c("et", 3.5), c(",", 3.0), c("parce", 1.2)],
          et: [c("elle", 4.5), c("la", 3.3), c("beaucoup", 2.1)],
        },
      },
      {
        title: "Mon plat préféré…",
        text: "Mon plat préféré est",
        candidates: [c("la", 4.7), c("une", 4.1), c("le", 3.8), c("simple", 2.5), c("chaud", 2.0), c("courir", -2.0)],
        transitions: {
          la: [c("pizza", 5.0), c("soupe", 4.2), c("pâte", 3.0)],
          le: [c("riz", 4.8), c("pain", 3.8), c("fromage", 3.5)],
          pizza: [c("parce", 4.8), c("avec", 4.0), c("et", 3.2), c(".", 2.7)],
          parce: [c("qu'elle", 5.0), c("que", 4.0), c("qu'il", 3.4)],
        },
      },
      {
        title: "La meilleure façon d'apprendre…",
        text: "La meilleure façon d'apprendre est",
        candidates: [c("de", 5.5), c("pratiquer", 4.3), c("expérimenter", 4.0), c("lire", 3.2), c("dormir", 1.1), c("banane", -2.3)],
        transitions: {
          de: [c("pratiquer", 5.1), c("poser", 4.0), c("tester", 3.7), c("lire", 3.0)],
          pratiquer: [c("chaque", 4.8), c("avec", 4.0), c("et", 3.2), c(".", 2.0)],
          poser: [c("des", 4.9), c("la", 2.8), c("toujours", 2.4)],
        },
      },
    ],
  };

  const GENERIC_CANDIDATES: Record<string, DemoCandidate[]> = {
    en: [c("is", 4.5), c("can", 4.0), c("because", 3.5), c("and", 3.2), c("the", 2.8), c(".", 1.2)],
    pt: [c("é", 4.5), c("pode", 4.0), c("porque", 3.5), c("e", 3.2), c("o", 2.8), c(".", 1.2)],
    fr: [c("est", 4.5), c("peut", 4.0), c("parce", 3.5), c("et", 3.2), c("le", 2.8), c(".", 1.2)],
  };

  let selectedPresetIdx = 0;
  let temperature = 0.7;
  let topP = 0.9;

  $: filteredPresets = PROMPT_PRESETS[currentLangCode] ?? PROMPT_PRESETS.pt;

  let llmPrompt = "";

  // Seed the prompt from the active preset until the user types their own.
  let promptTouched = false;
  $: if (!promptTouched && filteredPresets.length) {
    if (selectedPresetIdx >= filteredPresets.length) selectedPresetIdx = 0;
    llmPrompt = (filteredPresets[selectedPresetIdx] || filteredPresets[0]).text;
  }

  // Append a chosen token to build an autoregressive sentence.
  function appendToken(piece: string) {
    promptTouched = true;
    llmPrompt = llmPrompt + piece;
  }

  function normalizeWord(word: string): string {
    return word.replace(/^Ġ/, "").trim().toLowerCase();
  }

  function currentPreset(): PromptPreset {
    return filteredPresets[selectedPresetIdx] || filteredPresets[0];
  }

  $: activeCandidates = (() => {
    const preset = currentPreset();
    if (!preset) return GENERIC_CANDIDATES[currentLangCode] ?? GENERIC_CANDIDATES.pt;
    if (llmPrompt.startsWith(preset.text)) {
      const tail = llmPrompt.slice(preset.text.length).trim();
      if (!tail) return preset.candidates;
      const parts = tail.match(/[\p{L}\p{N}'’À-ÿ-]+|[.,!?;:]/gu) ?? [];
      const last = normalizeWord(parts[parts.length - 1] ?? "");
      return preset.transitions[last] ?? GENERIC_CANDIDATES[currentLangCode] ?? GENERIC_CANDIDATES.pt;
    }
    return GENERIC_CANDIDATES[currentLangCode] ?? GENERIC_CANDIDATES.pt;
  })();

  type ProcessedCandidate = {
    word: string;
    piece: string;
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
      piece: c.piece,
      logit: c.logit,
      scaledLogit: c.logit / tempValue,
    }));
    if (scaled.length === 0) return [] as ProcessedCandidate[];

    // 2. Raw Softmax probabilities
    const maxScaledLogit = Math.max(...scaled.map((s) => s.scaledLogit)); // numerical stability
    const exps = scaled.map((s) => Math.exp(s.scaledLogit - maxScaledLogit));
    const sumExps = exps.reduce((a, b) => a + b, 0);
    const rawProbs = scaled.map((s, i) => exps[i] / sumExps);

    // Assemble initial array
    let list: ProcessedCandidate[] = scaled.map((s, i) => ({
      word: s.word,
      piece: s.piece,
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
    promptTouched = false;
    llmPrompt = (filteredPresets[idx] || filteredPresets[0]).text;
  }
</script>

<div
  class="bg-sunken rounded-2xl shadow-sm border border-hairline overflow-hidden flex flex-col transition-all duration-200"
>
  <!-- Header / Overview Intro Banner -->
  <div
    id="llm-subtabs"
    class="bg-surface border-b border-hairline px-6 py-5 flex flex-col md:flex-row md:items-center justify-between gap-4"
  >
    <div>
      <h2 class="text-lg font-bold tracking-tight text-ink font-sans">
        {$t("llm_tab_title")}
      </h2>
      <p class="text-xs text-ink-faint mt-1 max-w-xl">{$t("llm_tab_desc")}</p>
    </div>
    <div class="flex items-center gap-1.5 bg-sunken p-1 rounded-xl border border-hairline/40 self-start md:self-center">
      <button
        type="button"
        on:click={() => (activeSubTab = "tokenizer")}
        class="px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer {activeSubTab === 'tokenizer' ? 'bg-surface text-brand shadow-xs' : 'text-ink-faint hover:text-ink-muted'}"
      >
        {$t("tok_title")}
      </button>
      <button
        type="button"
        on:click={() => (activeSubTab = "decoding")}
        class="px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer {activeSubTab === 'decoding' ? 'bg-surface text-llm shadow-xs' : 'text-ink-faint hover:text-ink-muted'}"
      >
        {$t("dec_title")}
      </button>
    </div>
  </div>

  <div class="p-6 md:p-8 flex-1 min-h-[500px]">
    {#if activeSubTab === "tokenizer"}
      <div class="animate-fade-in max-w-3xl mx-auto flex flex-col gap-6">
        <!-- Step 1 Card: How the AI Reads -->
        <section class="bg-surface border border-hairline/60 rounded-2xl p-5 shadow-xs flex flex-col gap-5">
          <div class="flex items-center gap-2.5">
            <span class="w-6 h-6 rounded-full bg-llm text-white font-mono text-xs font-semibold flex items-center justify-center shrink-0">1</span>
            <div class="leading-tight">
              <h2 class="text-base font-semibold text-ink">{$locale === "pt" ? "Como a IA lê (Tokenização)" : $locale === "fr" ? "Comment l'IA lit (Tokenisation)" : "How the AI reads (Tokenization)"}</h2>
              <p class="text-[11px] text-ink-faint">{$locale === "pt" ? "Transforma texto em números (tokens)" : $locale === "fr" ? "Transforme le texte en nombres (tokens)" : "Turns text into numbers (tokens)"}</p>
            </div>
          </div>

          <p class="text-xs text-ink-muted leading-relaxed">
            {@html $t("tok_desc")}
          </p>

          <!-- Word vs Subword Toggle -->
          <div class="flex flex-col gap-1.5">
            <span class="text-xs font-semibold text-ink-muted">{$locale === "pt" ? "Modo de Divisão:" : $locale === "fr" ? "Mode de Division :" : "Splitting Mode:"}</span>
            <div id="llm-tok-mode" class="flex items-center gap-1.5 bg-sunken p-1 rounded-xl border border-hairline/40 self-start">
              <button
                type="button"
                on:click={() => (tokenizerMode = "word")}
                class="px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer {tokenizerMode === 'word' ? 'bg-surface text-brand shadow-xs' : 'text-ink-faint hover:text-ink-muted'}"
              >
                {$t("tok_mode_word")}
              </button>
              <button
                type="button"
                on:click={() => (tokenizerMode = "subword")}
                class="px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer {tokenizerMode === 'subword' ? 'bg-surface text-llm shadow-xs' : 'text-ink-faint hover:text-ink-muted'}"
              >
                {$t("tok_mode_subword")}
              </button>
            </div>
          </div>

          <!-- Input Textarea -->
          <div class="flex flex-col gap-1.5">
            <label for="tokInput" class="text-xs font-semibold text-ink-muted">{$locale === "pt" ? "Texto de Entrada:" : $locale === "fr" ? "Texte d'Entrée :" : "Input Text:"}</label>
            <textarea
              id="tokInput"
              bind:value={tokenInput}
              placeholder={$t("tok_input_placeholder")}
              rows="3"
              class="w-full p-3.5 text-sm border border-hairline rounded-xl outline-none focus:border-brand/50 focus:ring-2 focus:ring-brand/40 transition-all font-sans bg-surface shadow-xs resize-none"
            ></textarea>
          </div>

          <!-- Token Visualizer -->
          {#if tokens.length > 0}
            <div class="flex flex-col gap-2">
              <span class="text-xs font-semibold text-ink-muted">{$locale === "pt" ? "Visualização dos Tokens:" : $locale === "fr" ? "Visualisation des Tokens :" : "Token Visualization:"}</span>
              <div class="flex flex-wrap gap-x-1.5 gap-y-2 p-4 rounded-xl bg-sunken/45 border border-hairline/50 shadow-xs">
                {#each tokens as tok, idx}
                  <!-- svelte-ignore a11y-mouse-events-have-key-events -->
                  <!-- svelte-ignore a11y-no-static-element-interactions -->
                  <span
                    on:mouseover={() => (hoveredTokenIdx = idx)}
                    on:mouseleave={() => (hoveredTokenIdx = null)}
                    title={`id ${tok.id}`}
                    class="px-2 py-0.5 text-xs font-semibold font-mono rounded border transition-all cursor-default shrink-0 select-none
                           {getTokenBgClass(tok.text)}
                           {hoveredTokenIdx === idx ? 'ring-2 ring-llm scale-105 shadow-xs' : ''}"
                  >
                    {tok.text}
                  </span>
                {/each}
              </div>

              <!-- Hover readout -->
              <div class="flex items-center gap-1.5 text-[11px] font-mono min-h-[1.5rem] bg-sunken px-2.5 py-1.5 rounded-lg border border-hairline/50">
                {#if hoveredTokenIdx !== null && tokens[hoveredTokenIdx]}
                  <span class="px-1.5 py-0.5 rounded bg-surface border border-hairline text-ink">{tokens[hoveredTokenIdx].spaceBefore ? "␣" : ""}{tokens[hoveredTokenIdx].text.replace(/^Ġ/, "")}</span>
                  <span class="text-ink-faint">→ id</span>
                  <span class="font-semibold text-llm">{tokens[hoveredTokenIdx].id}</span>
                  {#if tokenizerMode === "subword"}
                    <span class="text-ink-faint">/ 50257 {$locale === "pt" ? "(vocabulário real)" : $locale === "fr" ? "(vocabulaire réel)" : "(real vocabulary)"}</span>
                  {/if}
                {:else}
                  <span class="text-ink-faint italic">{$locale === "pt" ? "Passa o rato para ver o id real." : $locale === "fr" ? "Survole pour voir le vrai id." : "Hover to see real id."}</span>
                {/if}
              </div>

              <!-- BPE-only legend -->
              {#if tokenizerMode === "subword"}
                <p class="text-[10px] text-ink-faint leading-normal mt-0.5">
                  {@html $t("tok_g_legend")}
                </p>
              {/if}
            </div>
          {:else if tokenizerMode === "subword" && !bpeReady && tokenInput}
            <div class="h-28 rounded-xl border border-dashed border-hairline flex items-center justify-center gap-2.5 text-xs text-ink-faint bg-sunken">
              <svg class="animate-spin h-3.5 w-3.5 text-llm" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
              {$locale === "pt" ? "A carregar o tokenizer BPE real…" : $locale === "fr" ? "Chargement du vrai tokenizer BPE…" : "Loading the real BPE tokenizer…"}
            </div>
          {:else}
            <div class="h-24 rounded-xl border border-dashed border-hairline flex items-center justify-center text-xs text-ink-faint italic bg-sunken">
              {$locale === "pt" ? "Escreve algo acima para ver a tokenização..." : $locale === "fr" ? "Écris quelque chose ci-dessus..." : "Write something above..."}
            </div>
          {/if}

          <!-- Token count and Cost Metrics -->
          <div id="llm-token-stats" class="grid grid-cols-2 gap-3.5 border-t border-hairline/60 pt-4">
            <div class="bg-sunken border border-hairline/60 rounded-xl px-4 py-3 shadow-xs">
              <span class="text-[10px] font-bold uppercase tracking-wider text-ink-faint">{$t("tok_stats_tokens")}</span>
              <div class="text-2xl font-bold tracking-tight text-ink mt-0.5 tabular-nums">{totalTokens}</div>
            </div>
            <div class="bg-sunken border border-hairline/60 rounded-xl px-4 py-3 shadow-xs">
              <span class="text-[10px] font-bold uppercase tracking-wider text-ink-faint">{$t("tok_stats_cost")}</span>
              <div class="text-2xl font-bold tracking-tight text-success mt-0.5 tabular-nums">${estimatedCost}</div>
              <div class="text-[9px] text-ink-faint mt-0.5 leading-tight">{$t("tok_stats_cost_intuition")}</div>
            </div>
          </div>
        </section>

      </div>
    {:else}
      <div class="animate-fade-in max-w-3xl mx-auto flex flex-col gap-6">

        <!-- Step 2 Card: Starting Prompt -->
        <section class="bg-surface border border-hairline/60 rounded-2xl p-5 shadow-xs flex flex-col gap-4">
          <div class="flex items-center gap-2.5">
            <span class="w-6 h-6 rounded-full bg-llm text-white font-mono text-xs font-semibold flex items-center justify-center shrink-0">2</span>
            <div class="leading-tight">
              <h2 class="text-base font-semibold text-ink">{$locale === "pt" ? "Define o Ponto de Partida" : $locale === "fr" ? "Définir le Point de Départ" : "Set the Starting Point"}</h2>
              <p class="text-[11px] text-ink-faint">{$locale === "pt" ? "Escreve um prompt ou escolhe um preset" : $locale === "fr" ? "Écris un prompt ou choisis un preset" : "Write a prompt or pick a preset"}</p>
            </div>
          </div>

          <div class="flex flex-col gap-2">
            <span class="text-xs font-semibold text-ink-muted">{$t("dec_prompt_label")}</span>
            <div class="flex flex-wrap gap-1.5">
              {#each filteredPresets as preset, idx}
                <button
                  type="button"
                  on:click={() => handlePresetChange(idx)}
                  class="px-3.5 py-2 text-xs font-bold rounded-lg border transition-all cursor-pointer
                         {selectedPresetIdx === idx
                    ? 'bg-llm text-white border-llm shadow-sm'
                    : 'bg-sunken text-llm border-hairline hover:border-llm/40 hover:bg-raised'}"
                >
                  {preset.title}
                </button>
              {/each}
            </div>

            <!-- Prompt editor -->
            <textarea
              bind:value={llmPrompt}
              on:input={() => (promptTouched = true)}
              rows="2"
              class="w-full p-3.5 text-sm border border-hairline rounded-xl outline-none focus:border-llm/50 focus:ring-2 focus:ring-llm/40 transition-all font-mono bg-surface shadow-xs resize-none mt-1"
            ></textarea>
          </div>
        </section>

        <!-- Step 3 Card: Creativity Settings -->
        <section class="bg-surface border border-hairline/60 rounded-2xl p-5 shadow-xs flex flex-col gap-4">
          <div class="flex items-center gap-2.5">
            <span class="w-6 h-6 rounded-full bg-llm text-white font-mono text-xs font-semibold flex items-center justify-center shrink-0">3</span>
            <div class="leading-tight">
              <h2 class="text-base font-semibold text-ink">{$locale === "pt" ? "Ajustes de Criatividade" : $locale === "fr" ? "Réglages de Créativité" : "Creativity Settings"}</h2>
              <p class="text-[11px] text-ink-faint">{$locale === "pt" ? "Decide quão ousado ou focado deve ser o modelo" : $locale === "fr" ? "Décide du niveau d'audace du modèle" : "Decide how bold or focused the model should be"}</p>
            </div>
          </div>

          <p class="text-xs text-ink-muted leading-relaxed">
            {@html $t("dec_desc")}
          </p>

          <!-- Temperature Control (Visible by default) -->
          <div id="llm-temp" class="flex flex-col gap-2 bg-sunken/30 border border-hairline/40 p-4 rounded-xl">
            <div class="flex justify-between items-center">
              <span class="text-xs font-bold text-ink-muted">{$t("dec_temp_label")}</span>
              <span class="px-2 py-0.5 text-xs font-mono font-bold bg-brand-wash border border-brand/30 text-brand rounded tabular-nums">T = {temperature.toFixed(2)}</span>
            </div>
            <input
              type="range"
              bind:value={temperature}
              min="0.1"
              max="2.0"
              step="0.05"
              class="w-full accent-indigo-600 h-1.5 bg-sunken rounded-lg cursor-pointer"
            />
            <div class="flex justify-between text-[9px] font-bold text-ink-faint uppercase tracking-wider px-0.5">
              <span>← {$t("dec_temp_anchor_low")}</span>
              <span>{$t("dec_temp_anchor_high")} →</span>
            </div>
            <p class="text-[11px] text-ink-faint leading-normal mt-0.5">
              {$t("dec_temp_desc")}
            </p>
          </div>

          <!-- Advanced Toggle Link -->
          <button
            type="button"
            on:click={() => (showAdvancedSettings = !showAdvancedSettings)}
            class="flex items-center gap-1 text-xs font-semibold text-llm hover:text-llm-ink cursor-pointer select-none self-start transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="transition-transform duration-200 {showAdvancedSettings ? 'rotate-90' : ''}"><polyline points="9 18 15 12 9 6"/></svg>
            {showAdvancedSettings ? ($locale === "pt" ? "Ocultar Configurações Avançadas" : $locale === "fr" ? "Masquer les Paramètres Avancés" : "Hide Advanced Settings") : ($locale === "pt" ? "Mostrar Configurações Avançadas" : $locale === "fr" ? "Afficher les Paramètres Avancés" : "Show Advanced Settings")}
          </button>

          <!-- Top-P Control (Hidden by default) -->
          {#if showAdvancedSettings}
            <div id="llm-topp" class="flex flex-col gap-2 bg-sunken/30 border border-hairline/40 p-4 rounded-xl animate-fade-in">
              <div class="flex justify-between items-center">
                <span class="text-xs font-bold text-ink-muted">{$t("dec_topp_label")}</span>
                <span class="px-2 py-0.5 text-xs font-mono font-bold bg-llm-wash border border-llm/30 text-llm rounded tabular-nums">P = {topP.toFixed(2)}</span>
              </div>
              <input
                type="range"
                bind:value={topP}
                min="0.1"
                max="1.0"
                step="0.05"
                class="w-full accent-teal-600 h-1.5 bg-sunken rounded-lg cursor-pointer"
              />
              <div class="flex justify-between text-[9px] font-bold text-ink-faint uppercase tracking-wider px-0.5">
                <span>← {$t("dec_topp_anchor_low")}</span>
                <span>{$t("dec_topp_anchor_high")} →</span>
              </div>
              <p class="text-[11px] text-ink-faint leading-normal mt-0.5">
                {$t("dec_topp_desc")}
              </p>
            </div>
          {/if}
        </section>

        <!-- Step 4 Card: Next Word Prediction -->
        <section class="bg-surface border border-hairline/60 rounded-2xl p-5 shadow-xs flex flex-col gap-4">
          <div class="flex items-center gap-2.5">
            <span class="w-6 h-6 rounded-full bg-llm text-white font-mono text-xs font-semibold flex items-center justify-center shrink-0">4</span>
            <div class="leading-tight">
              <h2 class="text-base font-semibold text-ink">{$locale === "pt" ? "Previsão do Próximo Token" : $locale === "fr" ? "Prédiction du Prochain Token" : "Next Token Prediction"}</h2>
              <p class="text-[11px] text-ink-faint">{$locale === "pt" ? "Clica num token para construir a frase interativamente" : $locale === "fr" ? "Clique sur un token pour construire la phrase" : "Click a token to build the sentence interactively"}</p>
            </div>
          </div>

          <!-- Winner Card -->
          {#if topCandidate}
            <div id="llm-decode-result" class="bg-llm-wash/60 border border-llm/25 rounded-2xl p-4 flex items-center gap-3">
              <div class="w-8 h-8 rounded-full bg-llm flex items-center justify-center text-white shrink-0 shadow-sm">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
              </div>
              <div class="flex-1 min-w-0">
                <div class="text-[10px] font-bold uppercase tracking-wider text-llm-ink">{$t("dec_winner_label")}</div>
                <div class="text-base font-bold text-ink truncate font-mono mt-0.5">
                  "{topCandidate.word}"
                  <span class="text-xs font-semibold text-llm-ink tabular-nums">· {Math.round(topCandidate.normProb * 100)}%</span>
                </div>
              </div>
            </div>
          {/if}

          <!-- Candidate token bars list -->
          {#if computedCandidates.length > 0}
            <div class="flex flex-col gap-2.5">
              <p class="text-[11px] text-ink-faint">
                {$locale === "pt" ? "Escolhe uma palavra para continuar a escrever:" : $locale === "fr" ? "Choisis un mot pour continuer :" : "Pick a word to continue writing:"}
              </p>
              <div class="bg-sunken/45 border border-hairline/60 rounded-2xl p-4 flex flex-col gap-2">
                {#each computedCandidates as cand}
                  <button
                    type="button"
                    on:click={() => appendToken(cand.piece)}
                    title={$locale === "pt" ? "Acrescentar este token" : $locale === "fr" ? "Ajouter ce token" : "Append this token"}
                    class="flex items-center gap-3.5 w-full text-left rounded-lg p-1 hover:bg-surface/85 hover:shadow-xs border border-transparent hover:border-hairline/40 transition-all cursor-pointer group"
                  >
                    <div class="w-24 shrink-0 text-right">
                      <span class="text-xs font-semibold font-mono group-hover:text-llm transition-colors {cand.filtered ? 'text-ink-faint line-through' : 'text-ink-muted'}">
                        "{cand.word}"
                      </span>
                    </div>
                    <div class="flex-1 h-5 bg-sunken/60 rounded-md overflow-hidden relative border border-hairline/30">
                      <div
                        class="h-full rounded-l-md transition-all duration-300 {cand.filtered ? 'bg-line/60' : 'bg-llm'}"
                        style="width: {(cand.filtered ? cand.rawProb : cand.normProb) * 100}%"
                      ></div>
                      <span class="absolute inset-y-0 right-2.5 flex items-center text-[9px] font-mono font-bold tabular-nums {cand.filtered ? 'text-ink-faint' : 'text-llm'}">
                        {Math.round((cand.filtered ? cand.rawProb : cand.normProb) * 100)}%
                      </span>
                    </div>
                  </button>
                {/each}
              </div>
            </div>
          {:else}
            <div class="bg-sunken border border-dashed border-hairline rounded-2xl p-5 h-28 flex items-center justify-center text-xs text-ink-faint gap-2.5">
              {$locale === "pt" ? "Escreve um prompt para calcular as probabilidades." : $locale === "fr" ? "Écris une amorce pour calculer les probabilités." : "Write a prompt to compute probabilities."}
            </div>
          {/if}
        </section>

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
