<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { locale, t } from '../i18n';
  import { Shader, Swirl, ChromaFlow, FlutedGlass, FilmGrain } from 'shaders/svelte';

  const dispatch = createEventDispatcher<{ selectTab: 'cv' | 'llm' }>();

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
</script>

<div class="min-h-screen w-full bg-[#FAF9FC] overflow-hidden flex flex-col justify-center items-center relative flex-1">
  <!-- Full-screen animated shader overlay (teal/indigo flow). The Shader
       component owns its own canvas and animation loop; we just declare
       the layered effects as children. The inline style forces the
       wrapper div the library renders to fill its parent — without it,
       the canvas inside collapses to zero height because <canvas>
       at 100%/100% needs an explicitly-sized parent. -->
  <div class="absolute inset-0 z-10 pointer-events-none w-full h-full">
    <Shader style="width:100%;height:100%">
      {#snippet children()}
        <Swirl colorA="#ffffff" colorB="#faf9fc" detail={1.7} />
        <ChromaFlow
          baseColor="#ffffff"
          downColor="#6366f1"
          leftColor="#4f46e5"
          rightColor="#0d9488"
          upColor="#14b8a6"
          momentum={13}
          radius={3.5}
        />
        <FlutedGlass
          aberration={0.61}
          angle={31}
          frequency={8}
          highlight={0.12}
          highlightSoftness={0}
          lightAngle={-90}
          refraction={4}
          shape="rounded"
          softness={1}
          speed={0.15}
        />
        <FilmGrain strength={0.05} />
      {/snippet}
    </Shader>
  </div>

  <!-- Top right floating language switcher -->
  <div class="absolute top-6 right-8 z-30">
    <div class="relative">
      <button
        on:click={() => (langOpen = !langOpen)}
        class="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-zinc-700 bg-white/80 backdrop-blur-md border border-white/50 rounded-full hover:bg-zinc-100/50 hover:border-zinc-300 transition-all duration-300 shadow-[0_4px_12px_rgba(0,0,0,0.03)] cursor-pointer"
      >
        <!-- Globe -->
        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="text-zinc-500"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
        <span>{currentLang.short}</span>
        <!-- Chevron -->
        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" class="text-zinc-500 transition-transform duration-300 {langOpen ? 'rotate-180' : ''}"><polyline points="6 9 12 15 18 9"/></svg>
      </button>

      {#if langOpen}
        <!-- Click-outside catcher: a transparent fixed layer below the menu. -->
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div class="fixed inset-0 z-40 bg-transparent" on:click={() => (langOpen = false)}></div>
        <div class="absolute right-0 mt-2 w-36 bg-white/95 backdrop-blur-md border border-zinc-200/80 rounded-2xl shadow-xl z-50 overflow-hidden py-1 animate-fade-in">
          {#each languages as lang}
            <button
              on:click={() => selectLang(lang.code)}
              class="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-zinc-50 transition-colors cursor-pointer text-left {$locale === lang.code ? 'font-bold text-indigo-600 bg-indigo-50/50' : 'text-zinc-700'}"
            >
              <span class="font-mono text-[10px] w-5 text-center bg-zinc-100 rounded px-1 py-0.5">{lang.short}</span>
              <span>{lang.label}</span>
              {#if $locale === lang.code}
                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" class="ml-auto text-indigo-600"><polyline points="20 6 9 17 4 12"/></svg>
              {/if}
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </div>

  <!-- Main content -->
  <div class="w-full max-w-[1440px] px-6 sm:px-12 z-20 relative text-center flex flex-col items-center justify-center">
    <h1 class="text-[clamp(2.5rem,7vw,5.5rem)] font-black leading-[1.05] tracking-[-0.03em] text-transparent bg-clip-text bg-gradient-to-b from-zinc-950 via-zinc-900 to-indigo-950 max-w-[1100px] mx-auto mb-4 select-none">
      AIMachina <span class="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-teal-600">XLab</span>
    </h1>

    <p class="text-lg sm:text-[22px] font-bold text-zinc-800 max-w-3xl mx-auto leading-snug mb-6 select-none">
      {$t('home_hero_subtitle_xlab')}
    </p>

    <p class="text-base sm:text-[17px] text-zinc-500 max-w-2xl mx-auto font-normal leading-relaxed mb-10 select-none">
      {$t('home_hero_desc_xlab')}
    </p>

    <!-- Primary entrance buttons -->
    <div class="flex flex-col sm:flex-row gap-4 justify-center items-center">
      <button
        on:click={() => dispatch('selectTab', 'cv')}
        class="group flex items-center justify-between sm:justify-start gap-4 bg-indigo-600 hover:bg-indigo-700 text-white text-[14px] font-bold rounded-full pl-6 pr-2 py-2 transition-colors duration-300 shadow-[0_4px_14px_rgba(79,70,229,0.25)] w-full sm:w-auto cursor-pointer"
      >
        <span class="relative overflow-hidden h-[20px] flex flex-col">
          <span class="flex flex-col transition-transform duration-500 ease-[cubic-bezier(0.25,0.1,0.25,1)] group-hover:-translate-y-1/2">
            <span class="h-[20px] flex items-center">{$t('home_cv_btn_xlab')}</span>
            <span class="h-[20px] flex items-center">{$t('home_cv_btn_xlab')}</span>
          </span>
        </span>
        <span class="w-8 h-8 rounded-full bg-white flex items-center justify-center transform transition-transform duration-500 ease-[cubic-bezier(0.25,0.1,0.25,1)] group-hover:-rotate-45">
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="text-indigo-600"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
        </span>
      </button>

      <button
        on:click={() => dispatch('selectTab', 'llm')}
        class="group flex items-center justify-between sm:justify-start gap-4 bg-teal-600 hover:bg-teal-700 text-white text-[14px] font-bold rounded-full pl-6 pr-2 py-2 transition-colors duration-300 shadow-[0_4px_14px_rgba(13,148,136,0.25)] w-full sm:w-auto cursor-pointer"
      >
        <span class="relative overflow-hidden h-[20px] flex flex-col">
          <span class="flex flex-col transition-transform duration-500 ease-[cubic-bezier(0.25,0.1,0.25,1)] group-hover:-translate-y-1/2">
            <span class="h-[20px] flex items-center">{$t('home_llm_btn_xlab')}</span>
            <span class="h-[20px] flex items-center">{$t('home_llm_btn_xlab')}</span>
          </span>
        </span>
        <span class="w-8 h-8 rounded-full bg-white flex items-center justify-center transform transition-transform duration-500 ease-[cubic-bezier(0.25,0.1,0.25,1)] group-hover:-rotate-45">
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="text-teal-600"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
        </span>
      </button>
    </div>
  </div>
</div>

<style>
  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(-2px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .animate-fade-in {
    animation: fadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }
</style>
