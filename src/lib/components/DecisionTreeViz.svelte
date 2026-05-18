<script lang="ts">
  import { t } from '../i18n';
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

  function color(classIdx: number) { return CLASS_COLORS[classIdx % CLASS_COLORS.length]; }
  function bgColor(classIdx: number) { return CLASS_BG[classIdx % CLASS_BG.length]; }

  function majorityClass(dist: number[]): number {
    let best = 0;
    for (let i = 1; i < dist.length; i++) if (dist[i] > dist[best]) best = i;
    return best;
  }

  function distBar(dist: number[], total: number): { cls: number; pct: number }[] {
    if (total === 0) return [];
    return dist.map((c, cls) => ({ cls, pct: (c / total) * 100 })).filter(d => d.pct > 0);
  }

  $: layout = layoutTree(tree);
  $: entries = layout.entries;
  $: svgW = layout.width;
  $: svgH = layout.height;

  // Edges: from parent center-bottom to child center-top
  $: edges = entries
    .filter(e => e.parentX !== undefined)
    .map(e => ({
      x1: e.parentX! + NODE_W / 2,
      y1: e.parentY! + NODE_H,
      x2: e.x + NODE_W / 2,
      y2: e.y,
      isLeft: e.isLeftChild,
    }));
</script>

<div class="border border-zinc-200 rounded-lg overflow-hidden">
  <div class="px-4 py-3 bg-zinc-50 border-b border-zinc-200 flex items-center justify-between">
    <div class="flex items-center gap-2">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-indigo-600"><circle cx="12" cy="5" r="3"/><line x1="12" y1="8" x2="12" y2="14"/><line x1="12" y1="14" x2="6" y2="20"/><line x1="12" y1="14" x2="18" y2="20"/></svg>
      <h4 class="text-sm font-semibold text-zinc-700">{$t("dtree_title")}</h4>
    </div>
    <span class="text-xs text-zinc-400">{$t("dtree_subtitle")}</span>
  </div>

  <!-- Legend -->
  <div class="px-4 py-2 bg-white border-b border-zinc-100 flex flex-wrap gap-3">
    {#each classNames as name, i}
    <div class="flex items-center gap-1.5">
      <span class="w-3 h-3 rounded-sm shrink-0" style="background:{color(i)}"></span>
      <span class="text-xs font-medium text-zinc-600">{name}</span>
    </div>
    {/each}
  </div>

  <!-- SVG Tree -->
  <div class="overflow-x-auto bg-zinc-50/50 p-4">
    <svg
      width={svgW}
      height={svgH}
      viewBox="0 0 {svgW} {svgH}"
      class="mx-auto"
      style="min-width:{svgW}px"
    >
      <!-- Edges -->
      {#each edges as edge}
        <path
          d="M{edge.x1},{edge.y1} C{edge.x1},{edge.y1 + 28} {edge.x2},{edge.y2 - 28} {edge.x2},{edge.y2}"
          fill="none"
          stroke="#d4d4d8"
          stroke-width="2"
        />
        <!-- Edge label -->
        <text
          x={(edge.x1 + edge.x2) / 2 + (edge.isLeft ? -12 : 12)}
          y={(edge.y1 + edge.y2) / 2}
          font-size="10"
          font-weight="600"
          fill={edge.isLeft ? '#22c55e' : '#ef4444'}
          text-anchor="middle"
          dominant-baseline="middle"
        >
          {edge.isLeft ? '≤' : '>'}
        </text>
      {/each}

      <!-- Nodes -->
      {#each entries as entry}
        {@const n = entry.node}
        {@const maj = majorityClass(n.classDist)}
        {@const barSegments = distBar(n.classDist, n.samples)}

        <g transform="translate({entry.x},{entry.y})">
          <!-- Node background -->
          <rect
            width={NODE_W}
            height={NODE_H}
            rx="10"
            ry="10"
            fill={n.type === 'leaf' ? bgColor(maj) : '#ffffff'}
            stroke={n.type === 'leaf' ? color(maj) : '#d4d4d8'}
            stroke-width={n.type === 'leaf' ? 2 : 1.5}
          />

          {#if n.type === 'split'}
            <!-- Split node content -->
            <text x={NODE_W / 2} y="18" font-size="11" font-weight="700" fill="#3f3f46" text-anchor="middle" dominant-baseline="middle">
              Feature #{n.featureIndex}
            </text>
            <text x={NODE_W / 2} y="32" font-size="10" fill="#71717a" text-anchor="middle" dominant-baseline="middle">
              ≤ {n.threshold}
            </text>
            <!-- Sample count + Gini -->
            <text x={NODE_W / 2} y="46" font-size="9" fill="#a1a1aa" text-anchor="middle" dominant-baseline="middle">
              n={n.samples} · gini={n.gini}
            </text>
            <!-- Distribution bar -->
            {#each barSegments as seg, si}
              {@const prevPct = barSegments.slice(0, si).reduce((s, d) => s + d.pct, 0)}
              <rect
                x={12 + (NODE_W - 24) * prevPct / 100}
                y={NODE_H - 14}
                width={Math.max(1, (NODE_W - 24) * seg.pct / 100)}
                height="6"
                rx="3"
                fill={color(seg.cls)}
                opacity="0.8"
              />
            {/each}
          {:else}
            <!-- Leaf node content -->
            <text x={NODE_W / 2} y="18" font-size="12" font-weight="700" fill={color(maj)} text-anchor="middle" dominant-baseline="middle">
              {classNames[maj] ?? `Class ${maj}`}
            </text>
            <text x={NODE_W / 2} y="34" font-size="10" fill="#52525b" text-anchor="middle" dominant-baseline="middle">
              {n.confidence}% · n={n.samples}
            </text>
            <text x={NODE_W / 2} y="48" font-size="9" fill="#a1a1aa" text-anchor="middle" dominant-baseline="middle">
              gini={n.gini}
            </text>
            <!-- Distribution bar -->
            {#each barSegments as seg, si}
              {@const prevPct = barSegments.slice(0, si).reduce((s, d) => s + d.pct, 0)}
              <rect
                x={12 + (NODE_W - 24) * prevPct / 100}
                y={NODE_H - 14}
                width={Math.max(1, (NODE_W - 24) * seg.pct / 100)}
                height="6"
                rx="3"
                fill={color(seg.cls)}
                opacity="0.9"
              />
            {/each}
          {/if}
        </g>
      {/each}
    </svg>
  </div>

  <!-- Explanation -->
  <div class="px-4 py-3 bg-white border-t border-zinc-100">
    <p class="text-xs text-zinc-500 leading-relaxed">{$t("dtree_note")}</p>
  </div>
</div>
