<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { locale, t } from '../i18n';
  import { Shader, Swirl, ChromaFlow, FlutedGlass, FilmGrain } from 'shaders/svelte';

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

    <!-- Primary entrance cards / options with descriptions -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl w-full mt-2 px-4 mb-8">
      <!-- Computer Vision Lab Card -->
      <button
        on:click={() => dispatch('selectTab', 'cv')}
        class="group flex flex-col items-center p-8 rounded-3xl bg-white/40 border border-white/60 hover:bg-white/80 hover:border-indigo-500/30 hover:shadow-[0_20px_50px_rgba(99,102,241,0.08)] hover:-translate-y-1 transition-all duration-300 backdrop-blur-md cursor-pointer text-center relative w-full"
      >
        <!-- Icon container with glowing circle -->
        <div class="w-14 h-14 rounded-2xl bg-indigo-50/50 text-indigo-600 flex items-center justify-center mb-5 group-hover:scale-110 group-hover:bg-indigo-500 group-hover:text-white transition-all duration-500 shadow-sm">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
            <circle cx="12" cy="13" r="4"/>
          </svg>
        </div>

        <h3 class="text-xl font-extrabold text-zinc-900 mb-2">{$t('home_cv_btn_xlab')}</h3>
        
        <p class="text-[14px] text-zinc-500 leading-relaxed mb-6 max-w-sm">
          {$t('home_cv_desc_short_xlab')}
        </p>

        <!-- Premium dynamic action CTA -->
        <div class="mt-auto flex items-center justify-between sm:justify-start gap-4 bg-indigo-600 group-hover:bg-indigo-700 text-white text-[13px] font-bold rounded-full pl-5 pr-1.5 py-1.5 transition-colors duration-300 shadow-[0_4px_14px_rgba(79,70,229,0.2)]">
          <span class="relative overflow-hidden h-[18px] flex flex-col">
            <span class="flex flex-col transition-transform duration-500 ease-[cubic-bezier(0.25,0.1,0.25,1)] group-hover:-translate-y-1/2">
              <span class="h-[18px] flex items-center">{$t('home_cv_btn_enter_xlab')}</span>
              <span class="h-[18px] flex items-center">{$t('home_cv_btn_enter_xlab')}</span>
            </span>
          </span>
          <span class="w-7 h-7 rounded-full bg-white flex items-center justify-center transform transition-transform duration-500 ease-[cubic-bezier(0.25,0.1,0.25,1)] group-hover:-rotate-45">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="text-indigo-600"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          </span>
        </div>
      </button>

      <!-- LLM Lab Card -->
      <button
        on:click={() => dispatch('selectTab', 'llm')}
        class="group flex flex-col items-center p-8 rounded-3xl bg-white/40 border border-white/60 hover:bg-white/80 hover:border-teal-500/30 hover:shadow-[0_20px_50px_rgba(13,148,136,0.08)] hover:-translate-y-1 transition-all duration-300 backdrop-blur-md cursor-pointer text-center relative w-full"
      >
        <!-- Icon container with glowing circle -->
        <div class="w-14 h-14 rounded-2xl bg-teal-50/50 text-teal-600 flex items-center justify-center mb-5 group-hover:scale-110 group-hover:bg-teal-500 group-hover:text-white transition-all duration-500 shadow-sm">
          <svg class="transform translate-x-[-1px] translate-y-[1px]" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            <path d="M8 9h8"/>
            <path d="M8 13h6"/>
          </svg>
        </div>

        <h3 class="text-xl font-extrabold text-zinc-900 mb-2">{$t('home_llm_btn_xlab')}</h3>
        
        <p class="text-[14px] text-zinc-500 leading-relaxed mb-6 max-w-sm">
          {$t('home_llm_desc_short_xlab')}
        </p>

        <!-- Premium dynamic action CTA -->
        <div class="mt-auto flex items-center justify-between sm:justify-start gap-4 bg-teal-600 group-hover:bg-teal-700 text-white text-[13px] font-bold rounded-full pl-5 pr-1.5 py-1.5 transition-colors duration-300 shadow-[0_4px_14px_rgba(13,148,136,0.2)]">
          <span class="relative overflow-hidden h-[18px] flex flex-col">
            <span class="flex flex-col transition-transform duration-500 ease-[cubic-bezier(0.25,0.1,0.25,1)] group-hover:-translate-y-1/2">
              <span class="h-[18px] flex items-center">{$t('home_llm_btn_enter_xlab')}</span>
              <span class="h-[18px] flex items-center">{$t('home_llm_btn_enter_xlab')}</span>
            </span>
          </span>
          <span class="w-7 h-7 rounded-full bg-white flex items-center justify-center transform transition-transform duration-500 ease-[cubic-bezier(0.25,0.1,0.25,1)] group-hover:-rotate-45">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="text-teal-600"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          </span>
        </div>
      </button>

      <!-- Decision Tree Lab Card -->
      <button
        on:click={() => dispatch('selectTab', 'dt')}
        class="group flex flex-col items-center p-8 rounded-3xl bg-white/40 border border-white/60 hover:bg-white/80 hover:border-amber-500/30 hover:shadow-[0_20px_50px_rgba(245,158,11,0.08)] hover:-translate-y-1 transition-all duration-300 backdrop-blur-md cursor-pointer text-center relative w-full"
      >
        <!-- Icon container with glowing circle -->
        <div class="w-14 h-14 rounded-2xl bg-amber-50/50 text-amber-600 flex items-center justify-center mb-5 group-hover:scale-110 group-hover:bg-amber-500 group-hover:text-white transition-all duration-500 shadow-sm">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <!-- Root decision node -->
            <rect x="7" y="1" width="10" height="6" rx="1.5"/>
            <!-- Branches from root to leaves -->
            <line x1="12" y1="7" x2="5" y2="15"/>
            <line x1="12" y1="7" x2="19" y2="15"/>
            <!-- Left leaf node -->
            <rect x="1" y="15" width="8" height="6" rx="1.5"/>
            <!-- Right leaf node -->
            <rect x="15" y="15" width="8" height="6" rx="1.5"/>
          </svg>
        </div>

        <h3 class="text-xl font-extrabold text-zinc-900 mb-2">{$t('home_dt_btn_xlab')}</h3>
        
        <p class="text-[14px] text-zinc-500 leading-relaxed mb-6 max-w-sm">
          {$t('home_dt_desc_short_xlab')}
        </p>

        <!-- Premium dynamic action CTA -->
        <div class="mt-auto flex items-center justify-between sm:justify-start gap-4 bg-amber-600 group-hover:bg-amber-700 text-white text-[13px] font-bold rounded-full pl-5 pr-1.5 py-1.5 transition-colors duration-300 shadow-[0_4px_14px_rgba(245,158,11,0.2)]">
          <span class="relative overflow-hidden h-[18px] flex flex-col">
            <span class="flex flex-col transition-transform duration-500 ease-[cubic-bezier(0.25,0.1,0.25,1)] group-hover:-translate-y-1/2">
              <span class="h-[18px] flex items-center">{$t('home_dt_btn_enter_xlab')}</span>
              <span class="h-[18px] flex items-center">{$t('home_dt_btn_enter_xlab')}</span>
            </span>
          </span>
          <span class="w-7 h-7 rounded-full bg-white flex items-center justify-center transform transition-transform duration-500 ease-[cubic-bezier(0.25,0.1,0.25,1)] group-hover:-rotate-45">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="text-amber-600"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          </span>
        </div>
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
