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
    if (typeof window !== "undefined") {
      window.scrollTo(0, 0);
    }
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
  class="min-h-screen bg-paper relative overflow-x-clip flex flex-col font-sans text-ink {activeTab ===
  'home'
    ? ''
    : 'pb-20'}"
>
  <!-- Loading overlay while MobileNet initialises -->
  {#if isLoadingModel}
    <div
      class="fixed inset-0 bg-paper/95 backdrop-blur-sm flex flex-col items-center justify-center gap-7"
      style="z-index: var(--z-modal)"
    >
      <!-- Single quiet ring with a brand pulse: an instrument warming up. -->
      <div class="relative flex items-center justify-center w-14 h-14">
        <div
          class="absolute inset-0 rounded-full border-2 border-hairline border-t-brand animate-spin"
          style="animation-duration: 0.9s"
        ></div>
        <div class="w-2 h-2 rounded-full bg-brand animate-pulse"></div>
      </div>

      <div class="flex flex-col items-center gap-2 text-center max-w-sm px-6">
        <h3 class="text-lg text-ink">
          {$locale === "pt"
            ? "A inicializar o laboratório"
            : $locale === "fr"
              ? "Initialisation du laboratoire"
              : "Initializing the lab"}
        </h3>
        <p
          class="font-mono text-[11px] text-ink-faint leading-relaxed tracking-tight"
        >
          {$locale === "pt"
            ? "A carregar o MobileNet v1 no seu browser. Pode demorar alguns segundos."
            : $locale === "fr"
              ? "Chargement de MobileNet v1 dans votre navigateur. Cela peut prendre quelques secondes."
              : "Loading MobileNet v1 in your browser. This may take a few seconds."}
        </p>
      </div>
    </div>
  {/if}

  {#if activeTab !== "home"}
    <div
      id="app-header"
      class="w-full max-w-[85rem] mx-auto px-4 sm:px-8 pt-6 sticky top-0"
      style="z-index: var(--z-sticky)"
    >
      <header
        class="bg-surface/85 backdrop-blur-md rounded-2xl py-2.5 pl-3 pr-2.5 grid grid-cols-[1fr_auto_1fr] items-center border border-hairline shadow-card"
      >
        <!-- Left: Home Logo and Title -->
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div
          on:click={() => goTab("home")}
          class="flex items-center gap-2.5 cursor-pointer select-none text-left bg-transparent border-0 outline-none p-0 group justify-start"
        >
          <!-- Wordmark masthead: a small diamond marker, no boxed monogram -->
          <span
            class="w-2 h-2 rotate-45 rounded-[1px] bg-brand shrink-0 transition-transform duration-200 group-hover:scale-125"
          ></span>
          <div class="flex flex-col leading-none">
            <span class="text-[15px] font-semibold tracking-tight text-ink">
              AIMachina <span class="text-brand">XLab</span>
            </span>
            {#if cvIsModelTrained && activeTab === "cv"}
              <span
                class="text-[10px] font-medium text-success flex items-center gap-1.5 mt-1.5 leading-none"
              >
                <span
                  class="w-1.5 h-1.5 rounded-full bg-success animate-pulse"
                ></span>
                {$t("trained_button")}
              </span>
            {/if}
          </div>
        </div>

        <!-- Center: Tab switcher. Each lab keeps its semantic color, used
             only on the active tab so the coding stays meaningful. -->
        <div class="flex items-center justify-center">
          <div
            class="flex items-center gap-1 bg-sunken p-1 rounded-xl border border-hairline"
          >
            <button
              on:click={() => goTab("cv")}
              class="px-2.5 sm:px-4 py-1.5 text-[11px] sm:text-xs font-medium rounded-lg transition-colors duration-200 cursor-pointer {activeTab ===
              'cv'
                ? 'bg-cv text-white'
                : 'text-ink-muted hover:text-ink hover:bg-raised'}"
            >
              {$t("tab_cv")}
            </button>
            <button
              on:click={() => goTab("dt")}
              class="px-2.5 sm:px-4 py-1.5 text-[11px] sm:text-xs font-medium rounded-lg transition-colors duration-200 cursor-pointer {activeTab ===
              'dt'
                ? 'bg-dt text-white'
                : 'text-ink-muted hover:text-ink hover:bg-raised'}"
            >
              {$t("tab_dt")}
            </button>
            <button
              on:click={() => goTab("llm")}
              class="px-2.5 sm:px-4 py-1.5 text-[11px] sm:text-xs font-medium rounded-lg transition-colors duration-200 cursor-pointer {activeTab ===
              'llm'
                ? 'bg-llm text-white'
                : 'text-ink-muted hover:text-ink hover:bg-raised'}"
            >
              {$t("tab_llm")}
            </button>
          </div>
        </div>

        <!-- Right: Actions (Language & Export Model) -->
        <div class="flex items-center justify-end gap-1.5 sm:gap-2">
          <!-- Launch the active lab's guided tour -->
          <button
            on:click={startCurrentTour}
            title={$t("tour_launch")}
            aria-label={$t("tour_launch")}
            class="flex items-center gap-1.5 px-2.5 sm:px-3 py-2 text-[11px] sm:text-xs font-medium text-ink-muted bg-sunken border border-hairline rounded-lg hover:bg-raised hover:text-ink transition-colors cursor-pointer"
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
              class="flex items-center gap-1.5 px-2.5 sm:px-3 py-2 text-[11px] sm:text-xs font-medium text-ink-muted bg-sunken border border-hairline rounded-lg hover:bg-raised hover:text-ink transition-colors cursor-pointer"
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
                class="absolute right-0 mt-2 w-40 bg-surface border border-hairline rounded-xl shadow-pop overflow-hidden p-1 animate-fade-in"
                style="z-index: var(--z-dropdown)"
                on:mouseleave={() => (langOpen = false)}
              >
                {#each languages as lang}
                  <button
                    on:click={() => {
                      $locale = lang.code;
                      langOpen = false;
                    }}
                    class="w-full flex items-center gap-2.5 px-2.5 py-2 text-xs rounded-lg transition-colors cursor-pointer {$locale ===
                    lang.code
                      ? 'font-medium text-brand bg-brand-wash'
                      : 'text-ink-muted hover:bg-sunken hover:text-ink'}"
                  >
                    <span
                      class="font-mono text-[10px] w-6 text-center bg-sunken border border-hairline rounded px-1 py-0.5"
                      >{lang.short}</span
                    >
                    <span>{lang.label}</span>
                    {#if $locale === lang.code}
                      <svg
                        class="ml-auto text-brand"
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
              class="flex items-center gap-1.5 px-2.5 sm:px-4 py-2 text-[11px] sm:text-xs font-medium text-ink border border-line rounded-lg bg-surface hover:bg-sunken transition-colors disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
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
