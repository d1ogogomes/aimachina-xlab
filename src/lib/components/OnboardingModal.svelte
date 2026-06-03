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
  class="fixed inset-0 bg-ink/50 flex items-center justify-center p-4 backdrop-blur-sm transition-opacity fade-in"
  style="z-index: var(--z-modal)"
>
  <div
    class="bg-surface rounded-2xl shadow-pop w-full max-w-md overflow-hidden flex flex-col fade-up border border-hairline"
  >
    <div class="p-7">
      <!-- Wordmark, consistent with the header masthead -->
      <div class="flex items-center justify-center gap-2 mb-5">
        <span class="w-2 h-2 rotate-45 rounded-[1px] bg-brand shrink-0"></span>
        <span class="text-base font-semibold tracking-tight text-ink">
          AIMachina <span class="text-brand">XLab</span>
        </span>
      </div>

      <h2 class="text-xl font-semibold text-ink text-center tracking-tight mb-2">
        {$t("onboarding_title")}
      </h2>
      <p class="text-sm text-ink-faint text-center leading-relaxed mb-6">
        {$t("onboarding_desc")}
      </p>

      <!-- Language selection -->
      <p class="text-xs font-semibold text-ink-muted mb-2">
        {$t("onboarding_select_lang")}
      </p>
      <div class="grid grid-cols-3 gap-2 mb-6">
        {#each languages as lang}
          <button
            on:click={() => ($locale = lang.code)}
            class="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-semibold transition-colors {$locale ===
            lang.code
              ? 'border-brand/50 bg-brand-wash text-brand'
              : 'border-hairline bg-surface text-ink-muted hover:border-line hover:bg-sunken'}"
          >
            <span
              class="font-mono text-[10px] w-6 text-center bg-sunken rounded px-1 py-0.5"
              >{lang.short}</span
            >
            <span class="hidden sm:inline">{lang.label}</span>
          </button>
        {/each}
      </div>

      <!-- Tour invitation -->
      <p class="text-sm text-ink-muted text-center leading-relaxed">
        {$t("onboarding_start_q")}
      </p>
    </div>

    <div class="px-7 py-4 bg-sunken/80 border-t border-hairline flex gap-3">
      <button
        on:click={() => dispatch("dismiss")}
        class="flex-1 px-4 py-2.5 text-sm font-semibold text-ink-muted bg-surface border border-hairline hover:bg-sunken hover:text-ink rounded-lg transition-colors"
      >
        {$t("onboarding_btn_no")}
      </button>
      <button
        on:click={() => dispatch("startTour")}
        class="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-brand hover:bg-brand-ink rounded-lg transition-colors shadow-sm"
      >
        {$t("onboarding_btn_yes")}
      </button>
    </div>
  </div>
</div>
