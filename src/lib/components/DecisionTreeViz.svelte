<script lang="ts">
  import { t } from '../i18n';
  import { afterUpdate } from 'svelte';
  import { layoutTree, NODE_W, NODE_H, type TreeNode, type LayoutEntry } from '../ml/decisionTree';

  export let tree: TreeNode;
  export let classNames: string[];

  const CLASS_COLORS = [
    '#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6',
    '#06b6d4', '#f97316', '#ec4899', '#14b8a6', '#84cc16',
  ];
  const CLASS_BG = [
    '#eef2ff', '#fffbeb', '#ecfdf5', '#fef2f2', '#f5f3ff',
    '#ecfeff', '#fff7ed', '#fdf2f8', '#f0fdfa', '#f7fee7',
  ];

  function color(i: number) { return CLASS_COLORS[i % CLASS_COLORS.length]; }
  function bgColor(i: number) { return CLASS_BG[i % CLASS_BG.length]; }

  function majorityClass(dist: number[]): number {
    if (dist.length === 0) return -1;
    let best = 0;
    for (let i = 1; i < dist.length; i++) if (dist[i] > dist[best]) best = i;
    return best;
  }

  function distBar(dist: number[], total: number): { cls: number; pct: number; offset: number }[] {
    if (total === 0) return [];
    const segs = dist.map((c, cls) => ({ cls, pct: (c / total) * 100, offset: 0 })).filter(d => d.pct > 0);
    // Pre-compute cumulative offsets once — avoids O(n²) reduce inside the template
    let acc = 0;
    for (const s of segs) { s.offset = acc; acc += s.pct; }
    return segs;
  }

  $: layout = layoutTree(tree);
  $: entries = layout.entries;
  $: svgW = layout.width;
  $: svgH = layout.height;

  $: edges = entries
    .filter(e => e.parentX !== undefined)
    .map(e => ({
      x1: e.parentX! + NODE_W / 2,
      y1: e.parentY! + NODE_H,
      x2: e.x + NODE_W / 2,
      y2: e.y,
      isLeft: e.isLeftChild,
    }));

  const PAD = 20;
  $: vb = `${-PAD} ${-PAD} ${svgW + PAD * 2} ${svgH + PAD * 2}`;

  let scrollEl: HTMLDivElement;

  // Drag-to-pan
  let isDragging = false;
  let dragStartX = 0;
  let dragStartScrollLeft = 0;

  function onPointerDown(e: PointerEvent) {
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
    scrollEl.releasePointerCapture(e.pointerId);
  }

  // Center on the root once per tree instance.
  // Plain `let` (not $:) so the assignment never triggers another Svelte cycle.
  // afterUpdate fires after DOM settles — no RAF race, no repeated snapping.
  let _centeredForTree: TreeNode | null = null;
  afterUpdate(() => {
    if (tree === _centeredForTree || !scrollEl) return;
    _centeredForTree = tree;
    const center = svgW / 2 - scrollEl.clientWidth / 2;
    if (center > 0) scrollEl.scrollLeft = center;
  });
</script>

<div class="border border-zinc-200 rounded-xl shadow-sm bg-white" style="overflow:clip">

  <!-- Title + legend in one bar -->
  <div class="px-4 py-2.5 border-b border-zinc-100 flex flex-wrap items-center gap-x-4 gap-y-2">
    <span class="text-sm font-bold text-zinc-800 shrink-0">{$t('dtree_title')}</span>
    <div class="w-px h-4 bg-zinc-200 shrink-0 hidden sm:block"></div>
    <div class="flex flex-wrap gap-x-3 gap-y-1">
      {#each classNames as name, i}
        <div class="flex items-center gap-1">
          <span class="w-2.5 h-2.5 rounded-sm shrink-0" style="background:{color(i)}"></span>
          <span class="text-xs text-zinc-500">{name}</span>
        </div>
      {/each}
    </div>
  </div>

  <!-- Scrollable tree canvas — auto-centered on the root -->
  <div
    bind:this={scrollEl}
    role="region"
    aria-label={$t('dtree_title')}
    class="overflow-x-auto bg-zinc-50"
    style="will-change: scroll-position; cursor:{isDragging ? 'grabbing' : 'grab'}; user-select:none"
    on:pointerdown={onPointerDown}
    on:pointermove={onPointerMove}
    on:pointerup={onPointerUp}
    on:pointercancel={onPointerUp}
  >
    <svg
      viewBox={vb}
      width={svgW + PAD * 2}
      height={svgH + PAD * 2}
      style="display:block; min-width:{svgW + PAD * 2}px"
      font-family="system-ui, -apple-system, sans-serif"
      role="img"
      aria-label={$t('dtree_title')}
    >
      <!-- Edges first (behind nodes) -->
      {#each edges as edge}
        <path
          d="M{edge.x1},{edge.y1} C{edge.x1},{edge.y1 + 32} {edge.x2},{edge.y2 - 32} {edge.x2},{edge.y2}"
          fill="none"
          stroke={edge.isLeft ? '#86efac' : '#fca5a5'}
          stroke-width="2.5"
          stroke-linecap="round"
        />
        <!-- Edge label pill -->
        <rect
          x={(edge.x1 + edge.x2) / 2 + (edge.isLeft ? -20 : 6)}
          y={(edge.y1 + edge.y2) / 2 - 8}
          width="16"
          height="16"
          rx="8"
          fill={edge.isLeft ? '#dcfce7' : '#fee2e2'}
        />
        <text
          x={(edge.x1 + edge.x2) / 2 + (edge.isLeft ? -12 : 14)}
          y={(edge.y1 + edge.y2) / 2 + 1}
          font-size="11"
          font-weight="700"
          fill={edge.isLeft ? '#16a34a' : '#dc2626'}
          text-anchor="middle"
          dominant-baseline="middle"
        >{edge.isLeft ? '≤' : '>'}</text>
      {/each}

      <!-- Nodes -->
      {#each entries as entry}
        {@const n = entry.node}
        {@const maj = majorityClass(n.classDist)}
        {@const bars = distBar(n.classDist, n.samples)}
        {@const BAR_Y = NODE_H - 13}
        {@const BAR_H = 7}
        {@const BAR_X = 14}
        {@const BAR_W = NODE_W - 28}

        <g transform="translate({entry.x},{entry.y})">
          {#if n.type === 'split'}
            <!-- Split node: white card -->
            <rect width={NODE_W} height={NODE_H} rx="10" fill="#ffffff" stroke="#e4e4e7" stroke-width="1.5"/>

            <!-- Feature chip at top-center -->
            <rect x={NODE_W/2 - 34} y="10" width="68" height="15" rx="7" fill="#f4f4f5"/>
            <text x={NODE_W/2} y="17.5"
              font-size="9" font-weight="600" fill="#71717a"
              text-anchor="middle" dominant-baseline="middle" letter-spacing="0.3">
              FEATURE #{n.featureIndex}
            </text>

            <!-- Threshold (the decision question) -->
            <text x={NODE_W/2} y="38"
              font-size="14" font-weight="700" fill="#18181b"
              text-anchor="middle" dominant-baseline="middle">
              ≤ {n.threshold}
            </text>

            <!-- n + gini footer -->
            <text x={NODE_W/2} y="54"
              font-size="9" fill="#a1a1aa"
              text-anchor="middle" dominant-baseline="middle">
              n={n.samples} · gini={n.gini}
            </text>

            <!-- Distribution bar -->
            <rect x={BAR_X} y={BAR_Y} width={BAR_W} height={BAR_H} rx="3.5" fill="#f4f4f5"/>
            {#each bars as seg, si}
              <rect
                x={BAR_X + BAR_W * seg.offset / 100}
                y={BAR_Y}
                width={Math.max(2, BAR_W * seg.pct / 100)}
                height={BAR_H}
                rx={si === 0 ? 3.5 : (si === bars.length - 1 ? 3.5 : 0)}
                fill={color(seg.cls)}
                opacity="0.85"
              />
            {/each}

          {:else}
            <!-- Leaf node: colored card -->
            <rect width={NODE_W} height={NODE_H} rx="10" fill={bgColor(maj)} stroke={color(maj)} stroke-width="2"/>

            <!-- Class name -->
            <text x={NODE_W/2} y="22"
              font-size="13" font-weight="800" fill={color(maj)}
              text-anchor="middle" dominant-baseline="middle">
              {classNames[maj] ?? `Class ${maj}`}
            </text>

            <!-- Confidence badge -->
            <rect x={NODE_W/2 - 22} y="32" width="44" height="16" rx="8" fill={color(maj)} opacity="0.15"/>
            <text x={NODE_W/2} y="40"
              font-size="10" font-weight="700" fill={color(maj)}
              text-anchor="middle" dominant-baseline="middle">
              {n.confidence}%
            </text>

            <!-- Sample count -->
            <text x={NODE_W/2} y="55"
              font-size="9" fill="#71717a"
              text-anchor="middle" dominant-baseline="middle">
              n={n.samples} · gini={n.gini}
            </text>

            <!-- Distribution bar -->
            <rect x={BAR_X} y={BAR_Y} width={BAR_W} height={BAR_H} rx="3.5" fill="#00000012"/>
            {#each bars as seg, si}
              <rect
                x={BAR_X + BAR_W * seg.offset / 100}
                y={BAR_Y}
                width={Math.max(2, BAR_W * seg.pct / 100)}
                height={BAR_H}
                rx={si === 0 ? 3.5 : (si === bars.length - 1 ? 3.5 : 0)}
                fill={color(seg.cls)}
                opacity="0.9"
              />
            {/each}
          {/if}
        </g>
      {/each}
    </svg>
  </div>

  <!-- How to read -->
  <div class="px-4 py-3 border-t border-zinc-100 space-y-2.5">
    <p class="text-xs font-semibold text-zinc-500 uppercase tracking-widest">{$t('dtree_how_title')}</p>
    <div class="grid grid-cols-1 sm:grid-cols-4 gap-2.5">

      <div class="flex items-start gap-2.5 bg-zinc-50 rounded-lg px-3 py-2.5">
        <span class="w-5 h-5 rounded-full bg-zinc-200 text-zinc-500 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>
        <div>
          <p class="text-xs font-semibold text-zinc-700">{$t('dtree_how_split_title')}</p>
          <p class="text-xs text-zinc-500 leading-snug mt-0.5">{@html $t('dtree_how_split_body')}</p>
        </div>
      </div>

      <div class="flex items-start gap-2.5 bg-zinc-50 rounded-lg px-3 py-2.5">
        <span class="w-5 h-5 rounded-full bg-zinc-200 text-zinc-500 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>
        <div>
          <p class="text-xs font-semibold text-zinc-700">{$t('dtree_how_leaf_title')}</p>
          <p class="text-xs text-zinc-500 leading-snug mt-0.5">{@html $t('dtree_how_leaf_body')}</p>
        </div>
      </div>

      <div class="flex items-start gap-2.5 bg-zinc-50 rounded-lg px-3 py-2.5">
        <span class="w-5 h-5 rounded-full bg-zinc-200 text-zinc-500 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">3</span>
        <div>
          <p class="text-xs font-semibold text-zinc-700">{$t('dtree_how_bar_title')}</p>
          <p class="text-xs text-zinc-500 leading-snug mt-0.5">{@html $t('dtree_how_bar_body')}</p>
        </div>
      </div>

      <div class="flex items-start gap-2.5 bg-zinc-50 rounded-lg px-3 py-2.5">
        <span class="w-5 h-5 rounded-full bg-zinc-200 text-zinc-500 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">4</span>
        <div>
          <p class="text-xs font-semibold text-zinc-700">{$t('dtree_how_stats_title')}</p>
          <p class="text-xs text-zinc-500 leading-snug mt-0.5">{@html $t('dtree_how_stats_body')}</p>
        </div>
      </div>

    </div>
  </div>

</div>
