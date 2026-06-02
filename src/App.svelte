<script lang="ts">
  import { onMount, tick } from "svelte";
  import { locale, t } from "./lib/i18n";
  import { loadBackbone } from "./lib/ml/tfjs";
  import type * as mobilenet from "@tensorflow-models/mobilenet";
  import HomeHero from "./lib/components/HomeHero.svelte";
  import LlmPlayground from "./lib/components/LlmPlayground.svelte";
  import DecisionTreeLab from "./lib/components/DecisionTreeLab.svelte";
  import ComputerVisionLab from "./lib/components/ComputerVisionLab.svelte";
  import OnboardingModal from "./lib/components/OnboardingModal.svelte";

  let activeTab: "home" | "cv" | "llm" | "dt" = "home";

  // ─── Shared MobileNet backbone ────────────────────────────
  // Loaded once on startup behind the global loading overlay and handed to
  // the CV lab as a prop. Kept here (rather than inside the lab) so the
  // overlay can block the whole app during init, preserving prior behaviour.
  let isReady = false;
  let isLoadingModel = false;
  let net: mobilenet.MobileNet;

  let langOpen = false;

  // ─── Lab bridges ──────────────────────────────────────────
  // Each lab lives in its own component. The shared header reads the CV
  // "trained" state (badge + Export button) and can launch the active lab's
  // guided tour. Refs for the LLM / DT labs are only set while their tab is
  // mounted, which is exactly when their tour can run.
  let cvLab: ComputerVisionLab;
  let llmLab: LlmPlayground;
  let dtLab: DecisionTreeLab;
  let cvIsModelTrained = false;

  type LabTab = "cv" | "llm" | "dt";

  // ─── Onboarding & guided tours ────────────────────────────
  // First visit shows a welcome modal (language + offer a tour). Choosing
  // the guided path turns on per-lab auto-tours: each lab runs its tour once,
  // the first time it is opened. "Explore on my own" disables them. Either
  // way the header Tour button replays the current lab's tour on demand.
  const ONBOARDING_KEY = "aimachina_onboarding_completed";
  const AUTOTOUR_KEY = "aimachina_autotour";
  let showOnboarding = false;
  let autoTour = false;

  function tourSeen(tab: LabTab): boolean {
    try {
      return !!localStorage.getItem("aimachina_tour_" + tab);
    } catch {
      return true;
    }
  }

  function runTour(tab: LabTab) {
    try {
      localStorage.setItem("aimachina_tour_" + tab, "1");
    } catch {}
    // The lab markup mounts only when its tab is active, so defer the query
    // by one frame after the DOM has settled.
    requestAnimationFrame(() => {
      if (tab === "cv") cvLab?.startTour();
      else if (tab === "llm") llmLab?.startTour();
      else if (tab === "dt") dtLab?.startTour();
    });
  }

  async function goTab(tab: "home" | LabTab) {
    activeTab = tab;
    if (tab === "home") return;
    await tick();
    if (autoTour && !tourSeen(tab)) runTour(tab);
  }

  function startCurrentTour() {
    if (activeTab !== "home") runTour(activeTab);
  }

  function completeOnboarding() {
    try {
      localStorage.setItem(ONBOARDING_KEY, "1");
    } catch {}
    showOnboarding = false;
  }

  function persistAutoTour() {
    try {
      localStorage.setItem(AUTOTOUR_KEY, autoTour ? "1" : "0");
    } catch {}
  }

  function chooseGuided() {
    autoTour = true;
    persistAutoTour();
    completeOnboarding();
    goTab("cv"); // first CV visit auto-launches its tour
  }

  function chooseExplore() {
    autoTour = false;
    persistAutoTour();
    completeOnboarding();
  }

  const languages = [
    { code: "pt", label: "Português", short: "PT" },
    { code: "en", label: "English", short: "EN" },
    { code: "fr", label: "Français", short: "FR" },
  ];

  onMount(async () => {
    try {
      showOnboarding = !localStorage.getItem(ONBOARDING_KEY);
      autoTour = localStorage.getItem(AUTOTOUR_KEY) === "1";
    } catch {}
    try {
      isLoadingModel = true;
      net = await loadBackbone();
      isReady = true;
    } catch (e) {
      console.error("Initialization error:", e);
    } finally {
      isLoadingModel = false;
    }
  });
</script>

<div
  class="min-h-screen bg-[#FAF9FC] relative overflow-hidden flex flex-col font-sans text-zinc-900 selection:bg-indigo-500 selection:text-white {activeTab ===
  'home'
    ? ''
    : 'pb-20'}"
>
  <!-- Ambient background glow elements, completely matching the landing page colors -->
  <div
    class="absolute top-[-200px] left-[10%] w-[600px] h-[600px] bg-indigo-200/25 rounded-full blur-[130px] pointer-events-none z-0"
  ></div>
  <div
    class="absolute top-[300px] right-[5%] w-[500px] h-[500px] bg-teal-200/20 rounded-full blur-[120px] pointer-events-none z-0"
  ></div>
  <div
    class="absolute bottom-[-100px] left-[20%] w-[700px] h-[700px] bg-indigo-100/20 rounded-full blur-[140px] pointer-events-none z-0"
  ></div>

  <!-- Subtle Halftone grid matching the main landing page feel -->
  <div
    class="absolute inset-0 bg-[radial-gradient(#e4e4e7_1.2px,transparent_1.2px)] [background-size:24px_24px] opacity-[0.45] pointer-events-none z-0"
  ></div>

  <!-- Loading overlay while MobileNet initialises -->
  {#if isLoadingModel}
    <div
      class="fixed inset-0 bg-[#FAF9FC]/95 backdrop-blur-md z-[100] flex flex-col items-center justify-center gap-6"
    >
      <!-- Beautiful Ambient background glow elements inside loader too -->
      <div
        class="absolute top-[20%] left-[20%] w-[300px] h-[300px] bg-indigo-200/40 rounded-full blur-[80px] pointer-events-none"
      ></div>
      <div
        class="absolute bottom-[20%] right-[20%] w-[300px] h-[300px] bg-teal-200/30 rounded-full blur-[80px] pointer-events-none"
      ></div>

      <div class="relative flex items-center justify-center">
        <!-- Outer glowing spinner rings -->
        <div
          class="w-24 h-24 rounded-full border-4 border-indigo-100 border-t-indigo-600 animate-spin"
        ></div>
        <div
          class="absolute w-16 h-16 rounded-full border-4 border-teal-100 border-b-teal-500 animate-spin [animation-direction:reverse] opacity-75"
        ></div>
        <div
          class="absolute w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-600 to-teal-500 shadow-md animate-pulse"
        ></div>
      </div>

      <div class="flex flex-col items-center gap-2 text-center max-w-sm px-6 z-10">
        <h3 class="text-lg font-black text-zinc-950 uppercase tracking-wider">
          {$locale === "pt"
            ? "A Inicializar o Laboratório..."
            : $locale === "fr"
              ? "Initialisation du Lab..."
              : "Initializing Lab..."}
        </h3>
        <p class="text-xs text-zinc-500 font-semibold leading-relaxed">
          {$locale === "pt"
            ? "A carregar e a otimizar o MobileNet v1 no seu browser. Isto pode demorar alguns segundos."
            : $locale === "fr"
              ? "Chargement et optimisation du MobileNet v1 dans votre navigateur. Cela peut prendre quelques secondes."
              : "Loading and optimizing MobileNet v1 in your browser. This might take a few seconds."}
        </p>
      </div>
    </div>
  {/if}

  {#if activeTab !== "home"}
    <div class="w-full max-w-[85rem] mx-auto px-8 pt-6 sticky top-0 z-50">
      <header
        class="bg-white/80 backdrop-blur-md rounded-full p-2 grid grid-cols-3 items-center shadow-[0_10px_30px_rgba(79,70,229,0.06)] border border-white/50"
      >
        <!-- Left: Home Logo and Title -->
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div
          on:click={() => goTab("home")}
          class="flex items-center gap-3 cursor-pointer select-none text-left bg-transparent border-0 outline-none p-0 group ml-1 justify-start"
        >
          <!-- Super clean, elegant minimalist AI gradient logo -->
          <div
            class="w-10 h-10 bg-gradient-to-tr from-indigo-600 via-indigo-500 to-teal-500 rounded-full flex items-center justify-center text-white text-[13px] font-black tracking-wider shadow-[0_4px_14px_rgba(79,70,229,0.18)] group-hover:scale-105 group-hover:shadow-[0_4px_20px_rgba(79,70,229,0.28)] transition-all duration-300 select-none"
          >
            AI
          </div>
          <div class="hidden sm:flex flex-col">
            <span
              class="text-sm font-black tracking-tight text-zinc-950 leading-none flex items-center gap-1 select-none"
            >
              <span>AIMachina</span>
              <span
                class="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 via-indigo-500 to-teal-500 font-black"
                >XLab</span
              >
            </span>
            {#if cvIsModelTrained && activeTab === "cv"}
              <span
                class="text-[9px] font-bold text-emerald-600 flex items-center gap-1 mt-1 leading-none"
              >
                <span
                  class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"
                ></span>
                {$t("trained_button")}
              </span>
            {/if}
          </div>
        </div>

        <!-- Center: Tab Switcher (beautifully animated glass pill) -->
        <div class="flex items-center justify-center">
          <div
            class="flex items-center gap-1 bg-zinc-100/70 p-1 rounded-full border border-zinc-200/50"
          >
            <button
              on:click={() => goTab("cv")}
              class="px-4 py-1.5 text-xs font-bold rounded-full transition-all duration-300 cursor-pointer {activeTab ===
              'cv'
                ? 'bg-indigo-600 text-white shadow-md scale-[1.02]'
                : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/50'}"
            >
              {$t("tab_cv")}
            </button>
            <button
              on:click={() => goTab("llm")}
              class="px-4 py-1.5 text-xs font-bold rounded-full transition-all duration-300 cursor-pointer {activeTab ===
              'llm'
                ? 'bg-teal-600 text-white shadow-md scale-[1.02]'
                : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/50'}"
            >
              {$t("tab_llm")}
            </button>
            <button
              on:click={() => goTab("dt")}
              class="px-4 py-1.5 text-xs font-bold rounded-full transition-all duration-300 cursor-pointer {activeTab ===
              'dt'
                ? 'bg-amber-600 text-white shadow-md scale-[1.02]'
                : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/50'}"
            >
              {$t("tab_dt")}
            </button>
          </div>
        </div>

        <!-- Right: Actions (Language & Export Model) -->
        <div class="flex items-center justify-end gap-2 mr-1">
          <!-- Launch the active lab's guided tour -->
          <button
            on:click={startCurrentTour}
            title={$t("tour_launch")}
            aria-label={$t("tour_launch")}
            class="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-zinc-600 bg-zinc-100/70 border border-zinc-200/40 rounded-full hover:bg-zinc-200/80 transition-colors cursor-pointer"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
              ><circle cx="12" cy="12" r="10"></circle><polygon
                points="10 8 16 12 10 16 10 8"
              ></polygon></svg
            >
            <span class="hidden lg:inline">{$t("tour_launch")}</span>
          </button>

          <!-- Language Picker -->
          <div class="relative">
            <button
              on:click={() => (langOpen = !langOpen)}
              class="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-zinc-600 bg-zinc-100/70 border border-zinc-200/40 rounded-full hover:bg-zinc-200/80 transition-colors cursor-pointer"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                stroke-linecap="round"
                stroke-linejoin="round"
                ><circle cx="12" cy="12" r="10"></circle><line
                  x1="2"
                  y1="12"
                  x2="22"
                  y2="12"
                ></line><path
                  d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
                ></path></svg
              >
              <span
                >{languages.find((l) => l.code === $locale)?.short ??
                  $locale.toUpperCase()}</span
              >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="3"
                ><polyline
                  points={langOpen ? "18 15 12 9 6 15" : "6 9 12 15 18 9"}
                ></polyline></svg
              >
            </button>

            {#if langOpen}
              <!-- svelte-ignore a11y-no-static-element-interactions -->
              <div
                class="absolute right-0 mt-2 w-36 bg-white/95 backdrop-blur-md border border-zinc-200/80 rounded-2xl shadow-xl z-[60] overflow-hidden py-1"
                on:mouseleave={() => (langOpen = false)}
              >
                {#each languages as lang}
                  <button
                    on:click={() => {
                      $locale = lang.code;
                      langOpen = false;
                    }}
                    class="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-zinc-50 transition-colors cursor-pointer {$locale ===
                    lang.code
                      ? 'font-bold text-indigo-600 bg-indigo-50/50'
                      : 'text-zinc-700'}"
                  >
                    <span
                      class="font-mono text-[10px] w-5 text-center bg-zinc-100 rounded px-1 py-0.5"
                      >{lang.short}</span
                    >
                    <span>{lang.label}</span>
                    {#if $locale === lang.code}
                      <svg
                        class="ml-auto text-indigo-600"
                        xmlns="http://www.w3.org/2000/svg"
                        width="10"
                        height="10"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="3"
                        ><polyline points="20 6 9 17 4 12"></polyline></svg
                      >
                    {/if}
                  </button>
                {/each}
              </div>
            {/if}
          </div>

          <!-- Export Model (CV Lab only) -->
          {#if activeTab === "cv"}
            <button
              on:click={() => cvLab?.exportModel()}
              disabled={!cvIsModelTrained}
              class="flex items-center gap-1.5 px-4 py-2 text-xs font-bold border border-zinc-200/50 rounded-full hover:bg-zinc-50 transition-all shadow-sm bg-white/80 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                ><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"
                ></path><polyline points="7 10 12 15 17 10"></polyline><line
                  x1="12"
                  y1="15"
                  x2="12"
                  y2="3"
                ></line></svg
              >
              <span class="hidden md:inline">{$t("export_model")}</span>
            </button>
          {/if}
        </div>
      </header>
    </div>
  {/if}

  {#if showOnboarding && !isLoadingModel}
    <OnboardingModal
      on:startTour={chooseGuided}
      on:dismiss={chooseExplore}
    />
  {/if}

  <ComputerVisionLab
    bind:this={cvLab}
    bind:isModelTrained={cvIsModelTrained}
    {net}
    {isReady}
    active={activeTab === "cv"}
  />

  {#if activeTab === "home"}
    <HomeHero on:selectTab={(e) => goTab(e.detail)} />
  {/if}

  {#if activeTab === "llm"}
    <main
      class="max-w-[85rem] mx-auto w-full px-8 mt-10 animate-fade-in relative z-10"
    >
      <LlmPlayground bind:this={llmLab} />
    </main>
  {/if}

  {#if activeTab === "dt"}
    <main
      class="max-w-[85rem] mx-auto w-full px-8 mt-10 animate-fade-in relative z-10"
    >
      <DecisionTreeLab bind:this={dtLab} />
    </main>
  {/if}
</div>
