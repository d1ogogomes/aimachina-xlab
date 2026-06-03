<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { locale, t } from '../i18n';

  const dispatch = createEventDispatcher<{ selectTab: 'cv' | 'llm' | 'dt' }>();

  const languages = [
    { code: 'pt', label: 'Português', short: 'PT' },
    { code: 'en', label: 'English', short: 'EN' },
    { code: 'fr', label: 'Français', short: 'FR' },
  ];

  let langOpen = false;

  $: currentLang = languages.find(l => l.code === $locale) ?? languages[0];

  function selectLang(code: string) {
    locale.set(code);
    langOpen = false;
  }

  // The three labs, as instruments on a bench. The short code is a real
  // abbreviation used throughout the app, not decorative numbering; the
  // color is each lab's semantic accent, kept consistent with the nav.
  $: labs = [
    {
      id: 'cv' as const,
      code: 'CV',
      accent: 'var(--color-cv)',
      wash: 'var(--color-cv-wash)',
      title: $t('home_cv_btn_xlab'),
      desc: $t('home_cv_desc_short_xlab'),
      cta: $t('home_cv_btn_enter_xlab'),
      icon: 'cv',
    },
    {
      id: 'dt' as const,
      code: 'DT',
      accent: 'var(--color-dt)',
      wash: 'var(--color-dt-wash)',
      title: $t('home_dt_btn_xlab'),
      desc: $t('home_dt_desc_short_xlab'),
      cta: $t('home_dt_btn_enter_xlab'),
      icon: 'dt',
    },
    {
      id: 'llm' as const,
      code: 'LLM',
      accent: 'var(--color-llm)',
      wash: 'var(--color-llm-wash)',
      title: $t('home_llm_btn_xlab'),
      desc: $t('home_llm_desc_short_xlab'),
      cta: $t('home_llm_btn_enter_xlab'),
      icon: 'llm',
    },
  ];

  $: privacyNote =
    $locale === 'pt'
      ? 'Sem servidor · Sem telemetria · Corre inteiramente no seu browser'
      : $locale === 'fr'
        ? 'Aucun serveur · Aucune télémétrie · Tout s’exécute dans votre navigateur'
        : 'No server · No telemetry · Runs entirely in your browser';
</script>

<div class="relative min-h-screen w-full flex-1 flex flex-col bg-paper overflow-hidden">
  <!-- Faint engineering grid: graph-paper texture, on-theme, fades to edges -->
  <div
    class="grid-paper absolute inset-0 pointer-events-none"
    style="z-index: var(--z-base); -webkit-mask-image: radial-gradient(ellipse 90% 75% at 50% 38%, black, transparent 100%); mask-image: radial-gradient(ellipse 90% 75% at 50% 38%, black, transparent 100%);"
  ></div>

  <!-- Top bar: wordmark + language switcher (header is hidden on Home).
       Full-bleed to the corners so it frames the viewport. -->
  <div
    class="relative w-full px-6 sm:px-10 lg:px-14 pt-6 flex items-center justify-between"
    style="z-index: var(--z-sticky)"
  >
    <div class="flex items-center gap-2.5 select-none">
      <span class="w-2 h-2 rotate-45 rounded-[1px] bg-brand shrink-0"></span>
      <span class="text-[15px] font-semibold tracking-tight text-ink">
        AIMachina <span class="text-brand">XLab</span>
      </span>
    </div>

    <div class="relative">
      <button
        on:click={() => (langOpen = !langOpen)}
        class="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-ink-muted bg-surface border border-hairline rounded-lg hover:bg-sunken hover:text-ink transition-colors cursor-pointer"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
        <span>{currentLang.short}</span>
        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" class="transition-transform duration-200 {langOpen ? 'rotate-180' : ''}"><polyline points="6 9 12 15 18 9"/></svg>
      </button>

      {#if langOpen}
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div class="fixed inset-0 bg-transparent" style="z-index: var(--z-dropdown)" on:click={() => (langOpen = false)}></div>
        <div
          class="absolute right-0 mt-2 w-40 bg-surface border border-hairline rounded-xl shadow-pop overflow-hidden p-1 animate-fade-in"
          style="z-index: var(--z-dropdown)"
        >
          {#each languages as lang}
            <button
              on:click={() => selectLang(lang.code)}
              class="w-full flex items-center gap-2.5 px-2.5 py-2 text-xs rounded-lg transition-colors cursor-pointer text-left {$locale === lang.code ? 'font-medium text-brand bg-brand-wash' : 'text-ink-muted hover:bg-sunken hover:text-ink'}"
            >
              <span class="font-mono text-[10px] w-6 text-center bg-sunken border border-hairline rounded px-1 py-0.5">{lang.short}</span>
              <span>{lang.label}</span>
              {#if $locale === lang.code}
                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" class="ml-auto text-brand"><polyline points="20 6 9 17 4 12"/></svg>
              {/if}
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </div>

  <!-- Main editorial column -->
  <div class="relative flex-1 flex flex-col justify-center w-full max-w-[85rem] mx-auto px-6 sm:px-10 py-14" style="z-index: var(--z-base)">
    <div class="max-w-3xl">
      <p class="font-mono text-[12px] text-ink-faint mb-6">
        {privacyNote}
      </p>

      <h1
        class="font-display text-ink leading-[1.02] tracking-[-0.02em] mb-6"
        style="font-size: clamp(2.75rem, 6vw, 4.75rem); font-weight: 500;"
      >
        AIMachina <span class="text-brand">XLab</span>
      </h1>

      <p class="font-display text-ink text-2xl sm:text-3xl leading-snug mb-5 max-w-2xl" style="font-weight: 400;">
        {$t('home_hero_subtitle_xlab')}
      </p>

      <p class="text-ink-muted text-base sm:text-lg leading-relaxed max-w-[60ch]">
        {$t('home_hero_desc_xlab')}
      </p>
    </div>

    <!-- The three labs -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5 mt-12 w-full">
      {#each labs as lab (lab.id)}
        <button
          on:click={() => dispatch('selectTab', lab.id)}
          class="group panel text-left p-6 flex flex-col hover:-translate-y-1 hover:shadow-card transition-[transform,box-shadow,border-color] duration-300 cursor-pointer"
          style="--lab: {lab.accent}; --lab-wash: {lab.wash};"
        >
          <div class="flex items-center justify-between mb-5">
            <span
              class="font-mono text-[11px] font-semibold px-2 py-1 rounded-md border"
              style="color: var(--lab); background: var(--lab-wash); border-color: color-mix(in oklab, var(--lab) 18%, transparent);"
            >
              {lab.code}
            </span>
            <span style="color: var(--lab);">
              {#if lab.icon === 'cv'}
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
              {:else if lab.icon === 'llm'}
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 9h8"/><path d="M8 13h6"/></svg>
              {:else}
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="1" width="10" height="6" rx="1.5"/><line x1="12" y1="7" x2="5" y2="15"/><line x1="12" y1="7" x2="19" y2="15"/><rect x="1" y="15" width="8" height="6" rx="1.5"/><rect x="15" y="15" width="8" height="6" rx="1.5"/></svg>
              {/if}
            </span>
          </div>

          <h3 class="text-xl text-ink mb-2">{lab.title}</h3>

          <p class="text-sm text-ink-muted leading-relaxed mb-6 flex-1">
            {lab.desc}
          </p>

          <span
            class="inline-flex items-center gap-2 text-sm font-medium mt-auto"
            style="color: var(--lab);"
          >
            {lab.cta}
            <svg
              class="transition-transform duration-300 group-hover:translate-x-1"
              xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"
            ><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          </span>
        </button>
      {/each}
    </div>
  </div>
</div>
