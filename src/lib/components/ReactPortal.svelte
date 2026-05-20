<script lang="ts">
  import { onMount } from "svelte";
  import { createEventDispatcher } from "svelte";
  import { locale, t } from "../i18n";
  import React from "react";
  import ReactDOM from "react-dom/client";
  import AppReact from "../../AppReact";

  const dispatch = createEventDispatcher<{ selectTab: 'cv' | 'llm' }>();
  let container: HTMLDivElement;
  let root: any;

  function renderReact(loc: string, translate: any) {
    if (root) {
      root.render(React.createElement(AppReact, {
        locale: loc,
        t: translate,
        onSelectTab: (tab) => dispatch("selectTab", tab),
        onChangeLanguage: (lang: string) => {
          locale.set(lang);
        }
      }));
    }
  }

  // Reactive updates on store changes
  $: {
    // Read stores unconditionally to ensure Svelte 5 registers them as dependencies on initial run
    const currentLoc = $locale;
    const currentT = $t;
    if (root && container) {
      renderReact(currentLoc, currentT);
    }
  }

  onMount(() => {
    root = ReactDOM.createRoot(container);
    renderReact($locale, $t);
    return () => root.unmount();
  });
</script>

<div bind:this={container} class="w-full"></div>
