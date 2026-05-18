/**
 * Minimal CART (Classification and Regression Trees) implementation
 * that operates on MobileNet embedding vectors.
 *
 * Builds a shallow, interpretable decision tree from the same
 * embeddings used by the dense classifier, giving a complementary
 * view of how feature-space regions map to classes.
 */

// ─── Types ────────────────────────────────────────────────────

export type SplitNode = {
  type: 'split';
  featureIndex: number;
  threshold: number;
  left: TreeNode;
  right: TreeNode;
  samples: number;
  classDist: number[];
  depth: number;
  gini: number;
};

export type LeafNode = {
  type: 'leaf';
  predictedClass: number;
  samples: number;
  classDist: number[];
  confidence: number;
  depth: number;
  gini: number;
};

export type TreeNode = SplitNode | LeafNode;

// ─── Helpers ──────────────────────────────────────────────────

function giniImpurity(counts: number[], total: number): number {
  if (total === 0) return 0;
  let sumSq = 0;
  for (const c of counts) {
    const p = c / total;
    sumSq += p * p;
  }
  return 1 - sumSq;
}

function classCounts(labels: number[], numClasses: number): number[] {
  const out = new Array(numClasses).fill(0);
  for (const l of labels) out[l]++;
  return out;
}

function majorityClass(counts: number[]): number {
  let best = 0;
  for (let i = 1; i < counts.length; i++) {
    if (counts[i] > counts[best]) best = i;
  }
  return best;
}

// ─── CART Builder ─────────────────────────────────────────────

/** Max features to evaluate per split (keeps it fast for 1024-d). */
const MAX_FEATURES_PER_SPLIT = 64;

/**
 * Build a CART decision tree from embedding vectors.
 *
 * @param X  N × D matrix (row = sample, col = feature)
 * @param y  N labels in [0..numClasses-1]
 * @param numClasses  total number of classes
 * @param maxDepth    max tree depth (default 3, keeps it readable)
 * @param minLeaf     min samples to allow in a leaf
 */
export function buildDecisionTree(
  X: number[][],
  y: number[],
  numClasses: number,
  maxDepth = 3,
  minLeaf = 1,
): TreeNode {
  return buildNode(X, y, numClasses, 0, maxDepth, minLeaf);
}

function buildNode(
  X: number[][],
  y: number[],
  numClasses: number,
  depth: number,
  maxDepth: number,
  minLeaf: number,
): TreeNode {
  const n = X.length;
  const counts = classCounts(y, numClasses);
  const g = giniImpurity(counts, n);
  const nonZero = counts.filter(c => c > 0).length;

  // Stopping criteria → leaf
  if (depth >= maxDepth || n < 2 * minLeaf || nonZero <= 1) {
    const pred = majorityClass(counts);
    return {
      type: 'leaf',
      predictedClass: pred,
      samples: n,
      classDist: counts,
      confidence: n > 0 ? Math.round((counts[pred] / n) * 100) : 0,
      depth,
      gini: Math.round(g * 1000) / 1000,
    };
  }

  const D = X[0].length;

  // Sample a random subset of features for speed
  let features: number[];
  if (D <= MAX_FEATURES_PER_SPLIT) {
    features = Array.from({ length: D }, (_, i) => i);
  } else {
    const set = new Set<number>();
    while (set.size < MAX_FEATURES_PER_SPLIT) set.add(Math.floor(Math.random() * D));
    features = [...set];
  }

  let bestGini = Infinity;
  let bestFeature = -1;
  let bestThreshold = 0;

  for (const f of features) {
    // Collect sorted unique values for this feature
    const vals: number[] = [];
    for (let i = 0; i < n; i++) vals.push(X[i][f]);
    vals.sort((a, b) => a - b);

    // Deduplicate and compute midpoints
    let prev = vals[0];
    for (let i = 1; i < vals.length; i++) {
      if (vals[i] === prev) continue;
      const threshold = (prev + vals[i]) / 2;
      prev = vals[i];

      // Count left/right class distributions
      const lc = new Array(numClasses).fill(0);
      const rc = new Array(numClasses).fill(0);
      let nL = 0;
      for (let j = 0; j < n; j++) {
        if (X[j][f] <= threshold) { lc[y[j]]++; nL++; }
        else { rc[y[j]]++; }
      }
      const nR = n - nL;
      if (nL < minLeaf || nR < minLeaf) continue;

      const wg = (nL * giniImpurity(lc, nL) + nR * giniImpurity(rc, nR)) / n;
      if (wg < bestGini) {
        bestGini = wg;
        bestFeature = f;
        bestThreshold = threshold;
      }
    }
  }

  // No valid split → leaf
  if (bestFeature === -1) {
    const pred = majorityClass(counts);
    return {
      type: 'leaf',
      predictedClass: pred,
      samples: n,
      classDist: counts,
      confidence: n > 0 ? Math.round((counts[pred] / n) * 100) : 0,
      depth,
      gini: Math.round(g * 1000) / 1000,
    };
  }

  // Partition data
  const lX: number[][] = [], lY: number[] = [];
  const rX: number[][] = [], rY: number[] = [];
  for (let i = 0; i < n; i++) {
    if (X[i][bestFeature] <= bestThreshold) { lX.push(X[i]); lY.push(y[i]); }
    else { rX.push(X[i]); rY.push(y[i]); }
  }

  return {
    type: 'split',
    featureIndex: bestFeature,
    threshold: Math.round(bestThreshold * 1000) / 1000,
    left: buildNode(lX, lY, numClasses, depth + 1, maxDepth, minLeaf),
    right: buildNode(rX, rY, numClasses, depth + 1, maxDepth, minLeaf),
    samples: n,
    classDist: counts,
    depth,
    gini: Math.round(g * 1000) / 1000,
  };
}

// ─── Layout helpers for visualization ─────────────────────────

export type LayoutEntry = {
  node: TreeNode;
  x: number;
  y: number;
  parentX?: number;
  parentY?: number;
  isLeftChild?: boolean;
};

const NODE_W = 160;
const NODE_H = 72;
const H_GAP = 24;
const V_GAP = 56;

/**
 * Compute (x, y) positions for every node.
 * Leaves are placed left-to-right; parents sit above at the midpoint.
 */
export function layoutTree(root: TreeNode): { entries: LayoutEntry[]; width: number; height: number } {
  const entries: LayoutEntry[] = [];
  let leafIdx = 0;

  type Range = { minX: number; maxX: number };

  function walk(node: TreeNode, parentX?: number, parentY?: number, isLeft?: boolean): Range {
    if (node.type === 'leaf') {
      const x = leafIdx * (NODE_W + H_GAP);
      const y = node.depth * (NODE_H + V_GAP);
      entries.push({ node, x, y, parentX, parentY, isLeftChild: isLeft });
      leafIdx++;
      return { minX: x, maxX: x };
    }

    const leftRange = walk(node.left, undefined, undefined, true);
    const rightRange = walk(node.right, undefined, undefined, false);

    const x = (leftRange.minX + rightRange.maxX) / 2;
    const y = node.depth * (NODE_H + V_GAP);

    entries.push({ node, x, y, parentX, parentY, isLeftChild: isLeft });

    // Back-patch children's parentX/parentY
    for (const e of entries) {
      if (e.node === node.left && e.parentX === undefined) { e.parentX = x; e.parentY = y; }
      if (e.node === node.right && e.parentX === undefined) { e.parentX = x; e.parentY = y; }
    }

    return { minX: leftRange.minX, maxX: rightRange.maxX };
  }

  walk(root);

  const maxX = Math.max(...entries.map(e => e.x));
  const maxY = Math.max(...entries.map(e => e.y));

  return {
    entries,
    width: maxX + NODE_W + H_GAP,
    height: maxY + NODE_H + 20,
  };
}

export { NODE_W, NODE_H };
