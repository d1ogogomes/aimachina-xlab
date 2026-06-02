<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { locale, t } from "../i18n";

  const dispatch = createEventDispatcher<{ startTour: void; dismiss: void }>();

  const languages = [
    { code: "pt", label: "Português", short: "PT" },
    { code: "en", label: "English", short: "EN" },
    { code: "fr", label: "Français", short: "FR" },
  ];
</script>

<div
  class="fixed inset-0 bg-black/60 z-[110] flex items-center justify-center p-4 backdrop-blur-sm transition-opacity fade-in"
>
  <div
    class="bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col fade-up border border-white/60"
  >
    <div class="p-7">
      <!-- Brand mark -->
      <div
        class="w-12 h-12 bg-gradient-to-tr from-indigo-600 via-indigo-500 to-teal-500 rounded-full flex items-center justify-center text-white text-sm font-black tracking-wider shadow-[0_4px_14px_rgba(79,70,229,0.25)] mb-5 mx-auto"
      >
        AI
      </div>

      <h2 class="text-xl font-black text-zinc-950 text-center tracking-tight mb-2">
        {$t("onboarding_title")}
      </h2>
      <p class="text-sm text-zinc-500 text-center leading-relaxed mb-6">
        {$t("onboarding_desc")}
      </p>

      <!-- Language selection -->
      <p class="text-xs font-semibold text-zinc-600 mb-2">
        {$t("onboarding_select_lang")}
      </p>
      <div class="grid grid-cols-3 gap-2 mb-6">
        {#each languages as lang}
          <button
            on:click={() => ($locale = lang.code)}
            class="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-semibold transition-colors {$locale ===
            lang.code
              ? 'border-indigo-400 bg-indigo-50 text-indigo-700'
              : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50'}"
          >
            <span
              class="font-mono text-[10px] w-6 text-center bg-zinc-100 rounded px-1 py-0.5"
              >{lang.short}</span
            >
            <span class="hidden sm:inline">{lang.label}</span>
          </button>
        {/each}
      </div>

      <!-- Tour invitation -->
      <p class="text-sm text-zinc-600 text-center leading-relaxed">
        {$t("onboarding_start_q")}
      </p>
    </div>

    <div class="px-7 py-4 bg-zinc-50/80 border-t border-zinc-100 flex gap-3">
      <button
        on:click={() => dispatch("dismiss")}
        class="flex-1 px-4 py-2.5 text-sm font-semibold text-zinc-600 bg-white border border-zinc-200 hover:bg-zinc-50 hover:text-zinc-900 rounded-lg transition-colors"
      >
        {$t("onboarding_btn_no")}
      </button>
      <button
        on:click={() => dispatch("startTour")}
        class="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-sm"
      >
        {$t("onboarding_btn_yes")}
      </button>
    </div>
  </div>
</div>
