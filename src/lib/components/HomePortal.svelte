<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { t } from "../i18n";

  const dispatch = createEventDispatcher<{
    selectTab: 'cv' | 'llm';
  }>();

  function triggerTab(tab: 'cv' | 'llm') {
    dispatch("selectTab", tab);
  }
</script>

<div class="relative w-full min-h-screen overflow-hidden bg-[#fafafa] flex flex-col items-center select-none pb-20">
  <!-- Dynamic Halftone/Grit Dot Background Grid Overlay -->
  <div class="absolute inset-0 bg-[radial-gradient(#e4e4e7_1.5px,transparent_1.5px)] [background-size:24px_24px] opacity-[0.55] pointer-events-none z-0"></div>
  
  <!-- Sleek Radial Gradients for Premium Ambient Lighting with Drifting Floating Animations -->
  <div class="absolute -top-40 -left-40 w-[35rem] h-[35rem] bg-indigo-300/20 rounded-full blur-[120px] pointer-events-none z-0 animate-float-1"></div>
  <div class="absolute top-[25rem] -right-40 w-[40rem] h-[40rem] bg-purple-300/15 rounded-full blur-[130px] pointer-events-none z-0 animate-float-2"></div>
  <div class="absolute -bottom-40 left-1/3 w-[30rem] h-[30rem] bg-teal-200/10 rounded-full blur-[120px] pointer-events-none z-0 animate-float-3"></div>

  <!-- Hero Container -->
  <section class="relative z-10 max-w-[85rem] w-full px-6 pt-24 md:pt-32 pb-4 flex flex-col items-center text-center">
    <!-- Main Title (Large, Bold, Premium, responsive with subtle gradient) -->
    <h1 class="text-5xl md:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-b from-zinc-950 via-zinc-900 to-indigo-950 tracking-tight max-w-4xl leading-[1.08] mb-6">
      {@html $t('home_hero_title')}
    </h1>

    <!-- Subtext -->
    <p class="text-base md:text-[18px] text-zinc-500 max-w-2xl font-normal leading-relaxed mb-6 px-4">
      {$t('home_hero_subtitle')}
    </p>
  </section>


  <!-- Portal Section Header -->
  <div id="portal-section" class="relative z-10 w-full max-w-5xl px-8 pt-16 text-center scroll-mt-24">
    <h2 class="text-[10px] font-black tracking-[0.2em] text-zinc-400 uppercase mb-3">
      {$t('home_trusted_by')}
    </h2>
    <div class="w-12 h-[3px] bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full mx-auto shadow-sm"></div>
  </div>

  <!-- Interactive Lab Portal Cards Grid -->
  <section class="relative z-10 max-w-5xl w-full px-8 pb-12 mt-10 grid grid-cols-1 md:grid-cols-2 gap-8">
    
    <!-- Portal Card 1: Computer Vision -->
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div 
      on:click={() => triggerTab('cv')}
      class="group relative flex flex-col justify-between p-8 rounded-2xl border border-zinc-200/80 bg-white/70 backdrop-blur-xl hover:-translate-y-1.5 hover:scale-[1.01] hover:border-indigo-300 hover:shadow-[0_20px_50px_rgba(79,70,229,0.08)] transition-all duration-300 cursor-pointer overflow-hidden"
    >
      <!-- Background SVG grid lines for subtle lab-like feel -->
      <svg class="absolute top-0 right-0 h-40 w-40 text-zinc-100 opacity-20 pointer-events-none group-hover:text-indigo-100/40 transition-colors duration-500" width="160" height="160" fill="none" viewBox="0 0 160 160">
        <path stroke="currentColor" stroke-dasharray="4" stroke-width="1.5" d="M0 20h160M0 60h160M0 100h160M0 140h160M20 0v160M60 0v160M100 0v160M140 0v160"/>
      </svg>

      <!-- Elegant Accent Gradient Glow Border (Hover) -->
      <div class="absolute inset-0 bg-gradient-to-br from-indigo-500/0 via-indigo-500/0 to-indigo-500/4 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>

      <div>
        <!-- Icon Iris Container -->
        <div class="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-all duration-300 mb-6 shadow-sm">
          <!-- Animated Iris SVG -->
          <svg class="w-6 h-6 transform group-hover:rotate-[90deg] transition-transform duration-700" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M3 7V5a2 2 0 0 1 2-2h2"></path>
            <path d="M17 3h2a2 2 0 0 1 2 2v2"></path>
            <path d="M21 17v2a2 2 0 0 1-2 2h-2"></path>
            <path d="M7 21H5a2 2 0 0 1-2-2v-2"></path>
          </svg>
        </div>

        <h3 class="text-xl font-bold text-zinc-900 group-hover:text-indigo-600 transition-colors mb-3">
          {$t('home_cv_card_title')}
        </h3>
        
        <p class="text-[13px] leading-relaxed text-zinc-500 mb-8">
          {$t('home_cv_card_desc')}
        </p>
      </div>

      <div>
        <button class="inline-flex items-center gap-2 text-sm font-bold text-indigo-600 group-hover:text-indigo-800 transition-colors cursor-pointer">
          <span>{$t('home_cv_card_btn')}</span>
          <svg class="w-4 h-4 transform group-hover:translate-x-1.5 transition-transform duration-300" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
            <line x1="5" y1="12" x2="19" y2="12"></line>
            <polyline points="12 5 19 12 12 19"></polyline>
          </svg>
        </button>
      </div>
    </div>

    <!-- Portal Card 2: LLMs for Beginners -->
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div 
      on:click={() => triggerTab('llm')}
      class="group relative flex flex-col justify-between p-8 rounded-2xl border border-zinc-200/80 bg-white/70 backdrop-blur-xl hover:-translate-y-1.5 hover:scale-[1.01] hover:border-purple-300 hover:shadow-[0_20px_50px_rgba(147,51,234,0.08)] transition-all duration-300 cursor-pointer overflow-hidden"
    >
      <!-- Background SVG chat shapes for subtle natural-language feel -->
      <svg class="absolute top-0 right-0 h-40 w-40 text-zinc-100 opacity-20 pointer-events-none group-hover:text-purple-100/40 transition-colors duration-500" width="160" height="160" fill="none" viewBox="0 0 160 160">
        <rect x="20" y="30" width="80" height="50" rx="10" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3"/>
        <rect x="60" y="90" width="80" height="40" rx="10" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3"/>
      </svg>

      <!-- Elegant Accent Gradient Glow Border (Hover) -->
      <div class="absolute inset-0 bg-gradient-to-br from-purple-500/0 via-purple-500/0 to-purple-500/4 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>

      <div>
        <!-- Icon Chat/Brain Container -->
        <div class="w-12 h-12 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600 group-hover:bg-purple-600 group-hover:text-white transition-all duration-300 mb-6 shadow-sm">
          <!-- Animated Chat SVG -->
          <svg class="w-6 h-6 transform group-hover:scale-110 transition-transform duration-300" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            <circle cx="8" cy="10" r="1" fill="currentColor"></circle>
            <circle cx="12" cy="10" r="1" fill="currentColor"></circle>
            <circle cx="16" cy="10" r="1" fill="currentColor"></circle>
          </svg>
        </div>

        <h3 class="text-xl font-bold text-zinc-900 group-hover:text-purple-600 transition-colors mb-3">
          {$t('home_llm_card_title')}
        </h3>
        
        <p class="text-[13px] leading-relaxed text-zinc-500 mb-8">
          {$t('home_llm_card_desc')}
        </p>
      </div>

      <div>
        <button class="inline-flex items-center gap-2 text-sm font-bold text-purple-600 group-hover:text-purple-800 transition-colors cursor-pointer">
          <span>{$t('home_llm_card_btn')}</span>
          <svg class="w-4 h-4 transform group-hover:translate-x-1.5 transition-transform duration-300" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
            <line x1="5" y1="12" x2="19" y2="12"></line>
            <polyline points="12 5 19 12 12 19"></polyline>
          </svg>
        </button>
      </div>
    </div>
  </section>
</div>

<style>
  /* Curated floating animation keyframes for state-of-the-art visual depth */
  @keyframes float-slow {
    0%, 100% {
      transform: translate(0, 0) scale(1);
    }
    33% {
      transform: translate(30px, -45px) scale(1.08);
    }
    66% {
      transform: translate(-25px, 25px) scale(0.96);
    }
  }

  @keyframes float-medium {
    0%, 100% {
      transform: translate(0, 0) scale(1);
    }
    50% {
      transform: translate(-35px, 35px) scale(1.04);
    }
  }

  .animate-float-1 {
    animation: float-slow 24s ease-in-out infinite;
  }

  .animate-float-2 {
    animation: float-medium 18s ease-in-out infinite;
  }

  .animate-float-3 {
    animation: float-slow 28s ease-in-out infinite;
    animation-delay: 4s;
  }

  /* Sweep reflection for main button */
  @keyframes shine {
    100% {
      transform: translateX(250%);
    }
  }
  :global(.animate-shine) {
    animation: shine 0.85s cubic-bezier(0.4, 0, 0.2, 1) forwards;
  }
</style>
