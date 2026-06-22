<script lang="ts">
  import { t } from '../i18n';
  import { afterUpdate } from 'svelte';
  import {
    layoutTabularTree,
    NODE_W,
    NODE_H,
    type TabularTreeNode,
    type TabularLayoutEntry
  } from '../ml/tabularDecisionTree';

  export let tree: TabularTreeNode;
  export let targetClasses: string[];
  export let highlightPath: TabularTreeNode[] = [];
  export let criterion: 'gini' | 'entropy' = 'gini';

  const CLASS_COLORS = [
    '#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
    '#06b6d4', '#f97316', '#ec4899', '#14b8a6', '#84cc16',
  ];
  const CLASS_BG = [
    '#eef2ff', '#ecfdf5', '#fffbeb', '#fef2f2', '#f5f3ff',
    '#ecfeff', '#fff7ed', '#fdf2f8', '#f0fdfa', '#f7fee7',
  ];

  function color(cls: string) {
    const idx = targetClasses.indexOf(cls);
    return CLASS_COLORS[idx >= 0 ? idx % CLASS_COLORS.length : 0];
  }

  function bgColor(cls: string) {
    const idx = targetClasses.indexOf(cls);
    return CLASS_BG[idx >= 0 ? idx % CLASS_BG.length : 0];
  }

  function getMajorityClass(dist: Record<string, number>): string {
    let best = '';
    let max = -1;
    for (const cls in dist) {
      if (dist[cls] > max) {
        max = dist[cls];
        best = cls;
      }
    }
    return best;
  }

  function distBar(dist: Record<string, number>, total: number): { cls: string; pct: number; offset: number }[] {
    if (total === 0) return [];
    
    // Ensure all target classes are represented in order for visual consistency
    const segs = targetClasses
      .map(cls => ({
        cls,
        pct: ((dist[cls] || 0) / total) * 100,
        offset: 0
      }))
      .filter(d => d.pct > 0);

    let acc = 0;
    for (const s of segs) {
      s.offset = acc;
      acc += s.pct;
    }
    return segs;
  }

  $: layout = layoutTabularTree(tree);
  $: entries = layout.entries;
  $: svgW = layout.width;
  $: svgH = layout.height;

  $: edges = entries
    .filter(e => e.parentX !== undefined)
    .map(e => {
      // Find parent entry to examine the rule
      const parentEntry = entries.find(p => p.x === e.parentX && p.y === e.parentY);
      const parentNode = parentEntry?.node;
      
      let label = '';
      if (parentNode && parentNode.type === 'split') {
        if (parentNode.featureType === 'numerical') {
          const fmtThreshold = typeof parentNode.threshold === 'number'
            ? Math.round(parentNode.threshold * 1000) / 1000
            : parentNode.threshold;
          label = e.isLeftChild ? `≤ ${fmtThreshold}` : `> ${fmtThreshold}`;
        } else {
          label = e.isLeftChild ? `= ${parentNode.categoryValue}` : `≠ ${parentNode.categoryValue}`;
        }
      }

      // Check if both parent and child are on the highlighted prediction path
      const isParentOnPath = parentNode ? highlightPath.some(n => n === parentNode) : false;
      const isChildOnPath = highlightPath.some(n => n === e.node);
      const isHighlighted = isParentOnPath && isChildOnPath;

      return {
        id: `${e.parentX}-${e.parentY}-${e.x}-${e.y}`,
        x1: e.parentX! + NODE_W / 2,
        y1: e.parentY! + NODE_H,
        x2: e.x + NODE_W / 2,
        y2: e.y,
        isLeft: e.isLeftChild,
        label,
        isHighlighted
      };
    });

  const PAD = 30;
  $: vb = `${-PAD} ${-PAD} ${svgW + PAD * 2} ${svgH + PAD * 2}`;
  $: aspect = (svgW + PAD * 2) / (svgH + PAD * 2);

  let scrollEl: HTMLDivElement;

  // Default: scale the whole tree to fit the panel (no scrolling). The user
  // can switch to 1:1 to inspect a large tree, where drag-to-pan kicks in.
  let fitView = true;

  // Drag-to-pan controls (1:1 mode only) — pans both axes
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragStartScrollLeft = 0;
  let dragStartScrollTop = 0;

  function onPointerDown(e: PointerEvent) {
    // Only drag with left click, and only when not fitted to view
    if (fitView || e.button !== 0) return;
    isDragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragStartScrollLeft = scrollEl.scrollLeft;
    dragStartScrollTop = scrollEl.scrollTop;
    scrollEl.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent) {
    if (!isDragging) return;
    scrollEl.scrollLeft = dragStartScrollLeft - (e.clientX - dragStartX);
    scrollEl.scrollTop = dragStartScrollTop - (e.clientY - dragStartY);
  }

  function onPointerUp(e: PointerEvent) {
    isDragging = false;
    try {
      scrollEl.releasePointerCapture(e.pointerId);
    } catch {}
  }

  function onLostPointerCapture() {
    isDragging = false;
  }

  let _centeredForTree: TabularTreeNode | null = null;
  afterUpdate(() => {
    if (fitView || tree === _centeredForTree || !scrollEl) return;
    _centeredForTree = tree;
    // Center the canvas on both axes so the root is in view when entering 1:1.
    const centerX = (scrollEl.scrollWidth - scrollEl.clientWidth) / 2;
    if (centerX > 0) scrollEl.scrollLeft = centerX;
    scrollEl.scrollTop = 0;
  });
</script>

<div class="border border-hairline rounded-2xl shadow-sm bg-surface overflow-hidden relative">

  <!-- Legend Header Bar -->
  <div class="px-6 py-4 border-b border-hairline flex flex-wrap items-center justify-between gap-4 bg-sunken/50">
    <div class="flex items-center gap-2">
      <span class="w-2.5 h-2.5 bg-brand rounded-full animate-pulse"></span>
      <span class="text-sm font-bold text-ink-muted">{$t('dtree_title')}</span>
    </div>
    
    <div class="flex flex-wrap items-center gap-3">
      <span class="text-xs text-ink-faint font-medium">Classes:</span>
      {#each targetClasses as cls (cls)}
        <div class="flex items-center gap-1.5 bg-surface px-2.5 py-1 rounded-full border border-hairline/60 shadow-sm text-xs font-semibold">
          <span class="w-2.5 h-2.5 rounded-full" style="background:{color(cls)}"></span>
          <span class="text-ink-muted">{cls}</span>
        </div>
      {/each}

      <!-- Fit / 1:1 zoom toggle -->
      <div class="flex items-center gap-0.5 bg-sunken p-0.5 rounded-lg border border-hairline ml-1">
        <button
          on:click={() => (fitView = true)}
          aria-pressed={fitView}
          class="px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors cursor-pointer {fitView ? 'bg-surface text-ink shadow-xs' : 'text-ink-faint hover:text-ink'}"
        >
          {$t('dtree_fit', 'Fit')}
        </button>
        <button
          on:click={() => (fitView = false)}
          aria-pressed={!fitView}
          class="px-2.5 py-1 text-[11px] font-mono font-medium rounded-md transition-colors cursor-pointer {!fitView ? 'bg-surface text-ink shadow-xs' : 'text-ink-faint hover:text-ink'}"
        >
          1:1
        </button>
      </div>
    </div>
  </div>

  <!-- Interactive Scrollable Canvas -->
  <div
    bind:this={scrollEl}
    role="region"
    aria-label={$t('dtree_title')}
    data-allow-hscroll
    class="bg-[var(--color-paper)] select-none {fitView
      ? 'flex items-center justify-center overflow-hidden w-full'
      : 'block overflow-auto min-h-[400px]'}"
    style={fitView
      ? `aspect-ratio:${aspect}; max-height:72vh;`
      : `max-height:72vh; will-change:scroll-position; cursor:${isDragging ? 'grabbing' : 'grab'}; touch-action:none;`}
    on:pointerdown={onPointerDown}
    on:pointermove={onPointerMove}
    on:pointerup={onPointerUp}
    on:pointercancel={onPointerUp}
    on:lostpointercapture={onLostPointerCapture}
  >
    <svg
      viewBox={vb}
      width={fitView ? '100%' : svgW + PAD * 2}
      height={fitView ? '100%' : svgH + PAD * 2}
      preserveAspectRatio="xMidYMid meet"
      style="display:block; {fitView ? 'max-height:72vh;' : `min-width:${svgW + PAD * 2}px; margin:0 auto;`}"
      font-family="system-ui, -apple-system, sans-serif"
    >
      <defs>
        <!-- Modern Grid Pattern -->
        <pattern id="dot-grid" width="22" height="22" patternUnits="userSpaceOnUse">
          <circle cx="11" cy="11" r="0.85" fill="var(--color-hairline)" />
        </pattern>

        <!-- Premium Standard Card Shadow -->
        <filter id="standard-shadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="4" stdDeviation="4.5" flood-color="var(--color-ink)" flood-opacity="0.04" />
        </filter>

        <!-- Glowing active path split shadow -->
        <filter id="active-split-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="5" stdDeviation="6" flood-color="var(--color-dt)" flood-opacity="0.22" />
        </filter>

        <!-- Glowing active path leaf shadows -->
        {#each targetClasses as cls, i (cls)}
          <filter id="leaf-glow-{i}" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="5" stdDeviation="6" flood-color={color(cls)} flood-opacity="0.22" />
          </filter>
        {/each}
      </defs>

      <!-- Draw Background blueprint dot grid -->
      <rect x={-PAD} y={-PAD} width={svgW + PAD * 2} height={svgH + PAD * 2} fill="url(#dot-grid)" />

      <!-- Draw Connection Edges -->
      {#each edges as edge (edge.id)}
        <!-- Glow backing path for highlighted path -->
        {#if edge.isHighlighted}
          <path
            d="M{edge.x1},{edge.y1} C{edge.x1},{edge.y1 + 25} {edge.x2},{edge.y2 - 25} {edge.x2},{edge.y2}"
            fill="none"
            stroke="var(--color-dt-wash)"
            stroke-width="7"
            stroke-linecap="round"
            opacity="0.5"
            class="transition-all duration-300"
          />
        {/if}

        <path
          d="M{edge.x1},{edge.y1} C{edge.x1},{edge.y1 + 25} {edge.x2},{edge.y2 - 25} {edge.x2},{edge.y2}"
          fill="none"
          stroke={edge.isHighlighted ? 'var(--color-dt)' : 'var(--color-line)'}
          stroke-width={edge.isHighlighted ? '3.5' : '1.8'}
          stroke-linecap="round"
          stroke-dasharray={edge.isHighlighted ? 'none' : '4,4'}
          class="transition-all duration-300"
        />

        <!-- Edge Split Rule Label Pill -->
        {#if edge.label}
          {@const textLen = edge.label.length * 6 + 12}
          <g transform="translate({(edge.x1 + edge.x2) / 2}, {(edge.y1 + edge.y2) / 2})">
            <rect
              x={-textLen / 2}
              y="-10"
              width={textLen}
              height="20"
              rx="10"
              fill={edge.isHighlighted ? 'var(--color-dt)' : 'var(--color-surface)'}
              stroke={edge.isHighlighted ? 'var(--color-dt)' : 'var(--color-hairline)'}
              stroke-width="1"
              filter="url(#standard-shadow)"
              class="transition-all duration-300"
            />
            <text
              y="1"
              font-size="9"
              font-weight="800"
              fill={edge.isHighlighted ? 'var(--color-surface)' : 'var(--color-ink-muted)'}
              text-anchor="middle"
              dominant-baseline="middle"
              class="transition-all duration-300 font-mono"
            >
              {edge.label}
            </text>
          </g>
        {/if}
      {/each}

      <!-- Draw Nodes -->
      {#each entries as entry (`${entry.x}-${entry.y}`)}
        {@const n = entry.node}
        {@const maj = getMajorityClass(n.classDist)}
        {@const bars = distBar(n.classDist, n.samples)}
        {@const BAR_Y = NODE_H - 12}
        {@const BAR_H = 6}
        {@const BAR_X = 14}
        {@const BAR_W = NODE_W - 28}
        {@const isOnPath = highlightPath.some(node => node === n)}

        <g transform="translate({entry.x},{entry.y})">
          {#if n.type === 'split'}
            <!-- Split Card -->
            <rect
              width={NODE_W}
              height={NODE_H}
              rx="14"
              fill="var(--color-surface)"
              fill-opacity="0.98"
              stroke={isOnPath ? 'var(--color-dt)' : 'var(--color-hairline)'}
              stroke-width={isOnPath ? '3' : '1.5'}
              filter={isOnPath ? 'url(#active-split-glow)' : 'url(#standard-shadow)'}
              class="transition-all duration-300"
            />

            <!-- Feature Name Tag (dynamic width based on text length to prevent overflow) -->
            {@const featureTagW = Math.min(NODE_W - 24, n.featureName.length * 6.5 + 16)}
            <rect x={NODE_W/2 - featureTagW/2} y="10" width={featureTagW} height="16" rx="8" fill="var(--color-paper)" stroke="var(--color-hairline)" stroke-width="1"/>
            <text x={NODE_W/2} y="18"
              font-size="9" font-weight="800" fill="var(--color-ink-muted)"
              text-anchor="middle" dominant-baseline="middle" letter-spacing="0.3">
              {n.featureName.toUpperCase()}
            </text>

            <!-- Condition description -->
            <text x={NODE_W/2} y="40"
              font-size="13.5" font-weight="800" fill="var(--color-ink)"
              text-anchor="middle" dominant-baseline="middle" class="font-mono">
              {#if n.featureType === 'numerical'}
                ≤ {typeof n.threshold === 'number' ? Math.round(n.threshold * 1000) / 1000 : n.threshold}
              {:else}
                = {n.categoryValue}
              {/if}
            </text>

            <!-- Stats footer -->
            <text x={NODE_W/2} y="56"
              font-size="9" font-weight="600" fill="var(--color-ink-faint)"
              text-anchor="middle" dominant-baseline="middle">
              n={n.samples} · {criterion === 'gini' ? 'gini' : 'entropy'}={n.gini}
            </text>

            <!-- Dist Bar backing -->
            <rect x={BAR_X} y={BAR_Y} width={BAR_W} height={BAR_H} rx="3" fill="var(--color-sunken)"/>
            {#each bars as seg, si (seg.cls)}
              <rect
                x={BAR_X + BAR_W * seg.offset / 100}
                y={BAR_Y}
                width={Math.max(2, BAR_W * seg.pct / 100 + 0.5)}
                height={BAR_H}
                rx={si === 0 ? 3 : (si === bars.length - 1 ? 3 : 0)}
                fill={color(seg.cls)}
                opacity="0.95"
              />
            {/each}

          {:else}
            <!-- Leaf Card with Left-border Accent Stripe -->
            {@const classIdx = targetClasses.indexOf(maj)}
            <rect
              width={NODE_W}
              height={NODE_H}
              rx="14"
              fill="var(--color-surface)"
              fill-opacity="0.98"
              stroke={isOnPath && classIdx >= 0 ? color(maj) : 'var(--color-hairline)'}
              stroke-width={isOnPath ? '3' : '1.5'}
              filter={isOnPath && classIdx >= 0 ? 'url(#leaf-glow-' + classIdx + ')' : 'url(#standard-shadow)'}
              class="transition-all duration-300"
            />

            <!-- Left border accent stripe -->
            <rect
              x="1.5"
              y="1.5"
              width="6"
              height={NODE_H - 3}
              rx="3"
              fill={color(maj)}
            />

            <!-- Majority Class Name -->
            <text x={NODE_W/2 + 3} y="22"
              font-size="13" font-weight="800" fill="var(--color-ink)"
              text-anchor="middle" dominant-baseline="middle">
              {maj}
            </text>

            <!-- Confidence Badge -->
            <rect x={NODE_W/2 - 26} y="32" width="52" height="15" rx="7.5" fill={bgColor(maj)} stroke={color(maj)} stroke-opacity="0.15" stroke-width="1"/>
            <text x={NODE_W/2} y="39.5"
              font-size="9" font-weight="800" fill={color(maj)}
              text-anchor="middle" dominant-baseline="middle">
              {n.confidence}%
            </text>

            <!-- Sample count and impurity -->
            <text x={NODE_W/2} y="56"
              font-size="9" font-weight="600" fill="var(--color-ink-muted)"
              text-anchor="middle" dominant-baseline="middle">
              n={n.samples} · {criterion === 'gini' ? 'gini' : 'entropy'}={n.gini}
            </text>

            <!-- Dist Bar backing -->
            <rect x={BAR_X} y={BAR_Y} width={BAR_W} height={BAR_H} rx="3" fill="var(--color-ink)10"/>
            {#each bars as seg, si (seg.cls)}
              <rect
                x={BAR_X + BAR_W * seg.offset / 100}
                y={BAR_Y}
                width={Math.max(2, BAR_W * seg.pct / 100 + 0.5)}
                height={BAR_H}
                rx={si === 0 ? 3 : (si === bars.length - 1 ? 3 : 0)}
                fill={color(seg.cls)}
                opacity="0.95"
              />
            {/each}
          {/if}
        </g>
      {/each}
    </svg>
  </div>

  <!-- Drag hint, shown only in 1:1 mode where panning applies -->
  {#if !fitView}
    <div class="absolute bottom-4 right-4 flex items-center bg-surface px-3 py-1.5 border border-hairline rounded-full shadow-sm gap-2 text-[10px] text-ink-faint font-bold pointer-events-none">
      <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m15 18-6-6 6-6"/></svg>
      {$t('dtree_scroll_hint').toUpperCase()}
      <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m9 18 6-6-6-6"/></svg>
    </div>
  {/if}

</div>
