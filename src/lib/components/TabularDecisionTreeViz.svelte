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

  let scrollEl: HTMLDivElement;

  // Drag-to-pan controls
  let isDragging = false;
  let dragStartX = 0;
  let dragStartScrollLeft = 0;

  function onPointerDown(e: PointerEvent) {
    // Only drag with left click
    if (e.button !== 0) return;
    isDragging = true;
    dragStartX = e.clientX;
    dragStartScrollLeft = scrollEl.scrollLeft;
    scrollEl.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent) {
    if (!isDragging) return;
    scrollEl.scrollLeft = dragStartScrollLeft - (e.clientX - dragStartX);
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
    if (tree === _centeredForTree || !scrollEl) return;
    _centeredForTree = tree;
    const center = svgW / 2 - scrollEl.clientWidth / 2;
    if (center > 0) scrollEl.scrollLeft = center;
  });
</script>

<div class="border border-zinc-200 rounded-2xl shadow-sm bg-white overflow-hidden relative">

  <!-- Legend Header Bar -->
  <div class="px-6 py-4 border-b border-zinc-100 flex flex-wrap items-center justify-between gap-4 bg-zinc-50/50">
    <div class="flex items-center gap-2">
      <span class="w-2.5 h-2.5 bg-indigo-600 rounded-full animate-pulse"></span>
      <span class="text-sm font-bold text-zinc-800">{$t('dtree_title')}</span>
    </div>
    
    <div class="flex flex-wrap items-center gap-3">
      <span class="text-xs text-zinc-400 font-medium">Classes:</span>
      {#each targetClasses as cls (cls)}
        <div class="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-full border border-zinc-200/60 shadow-sm text-xs font-semibold">
          <span class="w-2.5 h-2.5 rounded-full" style="background:{color(cls)}"></span>
          <span class="text-zinc-600">{cls}</span>
        </div>
      {/each}
    </div>
  </div>

  <!-- Interactive Scrollable Canvas -->
  <div
    bind:this={scrollEl}
    role="region"
    aria-label={$t('dtree_title')}
    class="overflow-x-auto bg-[#fafafd] min-h-[400px] flex items-center select-none"
    style="will-change: scroll-position; cursor:{isDragging ? 'grabbing' : 'grab'}; touch-action:none;"
    on:pointerdown={onPointerDown}
    on:pointermove={onPointerMove}
    on:pointerup={onPointerUp}
    on:pointercancel={onPointerUp}
    on:lostpointercapture={onLostPointerCapture}
  >
    <svg
      viewBox={vb}
      width={svgW + PAD * 2}
      height={svgH + PAD * 2}
      style="display:block; min-width:{svgW + PAD * 2}px; margin: 0 auto;"
      font-family="system-ui, -apple-system, sans-serif"
    >
      <defs>
        <!-- Modern Grid Pattern -->
        <pattern id="dot-grid" width="22" height="22" patternUnits="userSpaceOnUse">
          <circle cx="11" cy="11" r="0.85" fill="#e2e8f0" />
        </pattern>

        <!-- Premium Standard Card Shadow -->
        <filter id="standard-shadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="4" stdDeviation="4.5" flood-color="#0f172a" flood-opacity="0.04" />
        </filter>

        <!-- Glowing active path split shadow -->
        <filter id="active-split-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="5" stdDeviation="6" flood-color="#6366f1" flood-opacity="0.22" />
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
            stroke="#c7d2fe"
            stroke-width="7"
            stroke-linecap="round"
            opacity="0.5"
            class="transition-all duration-300"
          />
        {/if}

        <path
          d="M{edge.x1},{edge.y1} C{edge.x1},{edge.y1 + 25} {edge.x2},{edge.y2 - 25} {edge.x2},{edge.y2}"
          fill="none"
          stroke={edge.isHighlighted ? '#6366f1' : '#cbd5e1'}
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
              fill={edge.isHighlighted ? '#4f46e5' : '#ffffff'}
              stroke={edge.isHighlighted ? '#6366f1' : '#e2e8f0'}
              stroke-width="1"
              filter="url(#standard-shadow)"
              class="transition-all duration-300"
            />
            <text
              y="1"
              font-size="9"
              font-weight="800"
              fill={edge.isHighlighted ? '#ffffff' : '#475569'}
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
              fill="#ffffff"
              fill-opacity="0.98"
              stroke={isOnPath ? '#4f46e5' : '#e2e8f0'}
              stroke-width={isOnPath ? '3' : '1.5'}
              filter={isOnPath ? 'url(#active-split-glow)' : 'url(#standard-shadow)'}
              class="transition-all duration-300"
            />

            <!-- Feature Name Tag (dynamic width based on text length to prevent overflow) -->
            {@const featureTagW = Math.min(NODE_W - 24, n.featureName.length * 6.5 + 16)}
            <rect x={NODE_W/2 - featureTagW/2} y="10" width={featureTagW} height="16" rx="8" fill="#f8fafc" stroke="#e2e8f0" stroke-width="1"/>
            <text x={NODE_W/2} y="18"
              font-size="9" font-weight="800" fill="#64748b"
              text-anchor="middle" dominant-baseline="middle" letter-spacing="0.3">
              {n.featureName.toUpperCase()}
            </text>

            <!-- Condition description -->
            <text x={NODE_W/2} y="40"
              font-size="13.5" font-weight="800" fill="#0f172a"
              text-anchor="middle" dominant-baseline="middle" class="font-mono">
              {#if n.featureType === 'numerical'}
                ≤ {typeof n.threshold === 'number' ? Math.round(n.threshold * 1000) / 1000 : n.threshold}
              {:else}
                = {n.categoryValue}
              {/if}
            </text>

            <!-- Stats footer -->
            <text x={NODE_W/2} y="56"
              font-size="9" font-weight="600" fill="#94a3b8"
              text-anchor="middle" dominant-baseline="middle">
              n={n.samples} · gini={n.gini}
            </text>

            <!-- Dist Bar backing -->
            <rect x={BAR_X} y={BAR_Y} width={BAR_W} height={BAR_H} rx="3" fill="#f1f5f9"/>
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
              fill="#ffffff"
              fill-opacity="0.98"
              stroke={isOnPath && classIdx >= 0 ? color(maj) : '#e2e8f0'}
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
              font-size="13" font-weight="800" fill="#0f172a"
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
              font-size="9" font-weight="600" fill="#64748b"
              text-anchor="middle" dominant-baseline="middle">
              n={n.samples} · gini={n.gini}
            </text>

            <!-- Dist Bar backing -->
            <rect x={BAR_X} y={BAR_Y} width={BAR_W} height={BAR_H} rx="3" fill="#00000010"/>
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

  <!-- Drag / Centering controls bottom right overlay -->
  <div class="absolute bottom-4 right-4 flex items-center bg-white/90 backdrop-blur-md px-3 py-1.5 border border-zinc-200 rounded-full shadow-sm gap-2 text-[10px] text-zinc-500 font-bold pointer-events-none">
    <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m15 18-6-6 6-6"/></svg>
    {$t('dtree_scroll_hint').toUpperCase()}
    <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m9 18 6-6-6-6"/></svg>
  </div>

</div>
