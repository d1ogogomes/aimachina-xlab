// CART (Classification and Regression Trees) Implementation for Tabular Data
// Supports continuous (numerical) and discrete (categorical) features.
// Features pre-pruning and Reduced Error Post-Pruning.

// ─── Types ────────────────────────────────────────────────────

export type TabularSplitNode = {
  type: 'split';
  featureName: string;
  featureType: 'categorical' | 'numerical';
  threshold?: number;         // Used for continuous features
  categoryValue?: any;        // Used for categorical features (split: == categoryValue vs !=)
  left: TabularTreeNode;
  right: TabularTreeNode;
  samples: number;
  classDist: Record<string, number>;
  depth: number;
  gini: number;               // Node impurity metric
  gain: number;               // Impurity reduction achieved by this split
};

export type TabularLeafNode = {
  type: 'leaf';
  predictedClass: string;
  samples: number;
  classDist: Record<string, number>;
  confidence: number;         // percentage of samples in the node belonging to predicted class
  depth: number;
  gini: number;
};

export type TabularTreeNode = TabularSplitNode | TabularLeafNode;

// ─── Mathematical Helpers ─────────────────────────────────────

function calculateImpurity(
  classCounts: Record<string, number>,
  total: number,
  criterion: 'gini' | 'entropy'
): number {
  if (total === 0) return 0;
  
  if (criterion === 'gini') {
    let sumSq = 0;
    for (const cls in classCounts) {
      const p = classCounts[cls] / total;
      sumSq += p * p;
    }
    return 1 - sumSq;
  } else {
    // Entropy
    let entropy = 0;
    for (const cls in classCounts) {
      const p = classCounts[cls] / total;
      if (p > 0) {
        entropy -= p * Math.log2(p);
      }
    }
    return entropy;
  }
}

function getClassDist(
  data: Record<string, any>[],
  targetName: string
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of data) {
    const label = String(row[targetName]);
    counts[label] = (counts[label] || 0) + 1;
  }
  return counts;
}

function getMajorityClass(classCounts: Record<string, number>): string {
  let bestClass = '';
  let maxCount = -1;
  for (const cls in classCounts) {
    if (classCounts[cls] > maxCount) {
      maxCount = classCounts[cls];
      bestClass = cls;
    }
  }
  return bestClass;
}

// ─── CART Builder ─────────────────────────────────────────────

export type TrainingConfig = {
  criterion: 'gini' | 'entropy';
  maxDepth: number;
  minSamplesSplit: number;
  minSamplesLeaf: number;
};

export function buildTabularTree(
  data: Record<string, any>[],
  features: string[],
  featureTypes: Record<string, 'categorical' | 'numerical'>,
  targetName: string,
  config: TrainingConfig
): TabularTreeNode {
  return buildNode(data, features, featureTypes, targetName, 0, config);
}

function buildNode(
  data: Record<string, any>[],
  features: string[],
  featureTypes: Record<string, 'categorical' | 'numerical'>,
  targetName: string,
  depth: number,
  config: TrainingConfig
): TabularTreeNode {
  const n = data.length;
  const counts = getClassDist(data, targetName);
  const impurityVal = calculateImpurity(counts, n, config.criterion);
  const classesPresent = Object.keys(counts).filter(c => counts[c] > 0);

  // Stopping conditions (Pre-pruning)
  if (
    depth >= config.maxDepth ||
    n < config.minSamplesSplit ||
    classesPresent.length <= 1 ||
    impurityVal === 0
  ) {
    const pred = getMajorityClass(counts);
    return {
      type: 'leaf',
      predictedClass: pred,
      samples: n,
      classDist: counts,
      confidence: n > 0 ? Math.round((counts[pred] / n) * 100) : 0,
      depth,
      gini: Math.round(impurityVal * 1000) / 1000,
    };
  }

  let bestGain = -Infinity;
  let bestFeature = '';
  let bestThreshold: number | undefined = undefined;
  let bestCategoryValue: any = undefined;
  let bestSplitLeft: Record<string, any>[] = [];
  let bestSplitRight: Record<string, any>[] = [];

  for (const f of features) {
    const type = featureTypes[f];

    if (type === 'numerical') {
      // Numerical Split: sort and evaluate midpoints
      const vals = data.map(d => Number(d[f])).filter(v => !isNaN(v));
      if (vals.length === 0) continue;
      
      const sortedUniqueVals = Array.from(new Set(vals)).sort((a, b) => a - b);
      
      for (let i = 0; i < sortedUniqueVals.length - 1; i++) {
        const threshold = (sortedUniqueVals[i] + sortedUniqueVals[i + 1]) / 2;
        
        // Split data
        const left = data.filter(d => Number(d[f]) <= threshold);
        const right = data.filter(d => Number(d[f]) > threshold);
        
        if (left.length < config.minSamplesLeaf || right.length < config.minSamplesLeaf) continue;

        const leftCounts = getClassDist(left, targetName);
        const rightCounts = getClassDist(right, targetName);

        const leftImp = calculateImpurity(leftCounts, left.length, config.criterion);
        const rightImp = calculateImpurity(rightCounts, right.length, config.criterion);

        const splitImp = (left.length * leftImp + right.length * rightImp) / n;
        const gain = impurityVal - splitImp;

        if (gain > bestGain) {
          bestGain = gain;
          bestFeature = f;
          bestThreshold = threshold;
          bestCategoryValue = undefined;
          bestSplitLeft = left;
          bestSplitRight = right;
        }
      }
    } else {
      // Categorical Split: split as f === val vs f !== val
      const vals = data.map(d => String(d[f]));
      const uniqueVals = Array.from(new Set(vals));

      for (const val of uniqueVals) {
        // Split data
        const left = data.filter(d => String(d[f]) === val);
        const right = data.filter(d => String(d[f]) !== val);

        if (left.length < config.minSamplesLeaf || right.length < config.minSamplesLeaf) continue;

        const leftCounts = getClassDist(left, targetName);
        const rightCounts = getClassDist(right, targetName);

        const leftImp = calculateImpurity(leftCounts, left.length, config.criterion);
        const rightImp = calculateImpurity(rightCounts, right.length, config.criterion);

        const splitImp = (left.length * leftImp + right.length * rightImp) / n;
        const gain = impurityVal - splitImp;

        if (gain > bestGain) {
          bestGain = gain;
          bestFeature = f;
          bestThreshold = undefined;
          bestCategoryValue = val;
          bestSplitLeft = left;
          bestSplitRight = right;
        }
      }
    }
  }

  // If no split is better or possible, stop early (create leaf)
  if (bestFeature === '' || bestGain <= 0) {
    const pred = getMajorityClass(counts);
    return {
      type: 'leaf',
      predictedClass: pred,
      samples: n,
      classDist: counts,
      confidence: n > 0 ? Math.round((counts[pred] / n) * 100) : 0,
      depth,
      gini: Math.round(impurityVal * 1000) / 1000,
    };
  }

  // Recursive builds
  const leftNode = buildNode(bestSplitLeft, features, featureTypes, targetName, depth + 1, config);
  const rightNode = buildNode(bestSplitRight, features, featureTypes, targetName, depth + 1, config);

  return {
    type: 'split',
    featureName: bestFeature,
    featureType: featureTypes[bestFeature],
    threshold: bestThreshold !== undefined ? Math.round(bestThreshold * 1000) / 1000 : undefined,
    categoryValue: bestCategoryValue,
    left: leftNode,
    right: rightNode,
    samples: n,
    classDist: counts,
    depth,
    gini: Math.round(impurityVal * 1000) / 1000,
    gain: Math.round(bestGain * 1000) / 1000,
  };
}

// ─── Post-Pruning (Reduced Error Pruning) ────────────────────

export function postPruneTabularTree(
  node: TabularTreeNode,
  trainData: Record<string, any>[],
  valData: Record<string, any>[],
  targetName: string
): TabularTreeNode {
  if (node.type === 'leaf') return node;

  // Prune left and right subtrees first
  node.left = postPruneTabularTree(node.left, trainData, valData, targetName);
  node.right = postPruneTabularTree(node.right, trainData, valData, targetName);

  // If no validation data, do not collapse
  if (valData.length === 0) return node;

  // 1. Calculate validation accuracy WITH the split
  const accWithSplit = computeAccuracy(node, valData, targetName);

  // 2. Create temporary leaf representing majority class from TRAINING samples in this node
  const majority = getMajorityClass(node.classDist);
  const maxCount = node.classDist[majority] || 0;
  
  const leafEquivalent: TabularLeafNode = {
    type: 'leaf',
    predictedClass: majority,
    samples: node.samples,
    classDist: node.classDist,
    confidence: node.samples > 0 ? Math.round((maxCount / node.samples) * 100) : 0,
    depth: node.depth,
    gini: node.gini,
  };

  // 3. Calculate validation accuracy IF collapsed to leaf
  const accAsLeaf = computeAccuracy(leafEquivalent, valData, targetName);

  // 4. Prune if accuracy as leaf is equal to or better (simplifies the tree without hurting generalization)
  if (accAsLeaf >= accWithSplit) {
    return leafEquivalent;
  }

  return node;
}

// ─── Evaluation & Predict Helpers ─────────────────────────────

export function predictTabular(
  node: TabularTreeNode,
  row: Record<string, any>
): { predictedClass: string; path: TabularTreeNode[] } {
  const path: TabularTreeNode[] = [node];
  let curr = node;

  while (curr.type === 'split') {
    const val = row[curr.featureName];
    let goesLeft = false;

    if (curr.featureType === 'numerical') {
      const numVal = Number(val);
      goesLeft = !isNaN(numVal) && numVal <= curr.threshold!;
    } else {
      goesLeft = String(val) === String(curr.categoryValue);
    }

    curr = goesLeft ? curr.left : curr.right;
    path.push(curr);
  }

  return {
    predictedClass: (curr as TabularLeafNode).predictedClass,
    path
  };
}

export function computeAccuracy(
  node: TabularTreeNode,
  data: Record<string, any>[],
  targetName: string
): number {
  if (data.length === 0) return 0;
  let correct = 0;
  for (const row of data) {
    const { predictedClass } = predictTabular(node, row);
    if (String(predictedClass) === String(row[targetName])) {
      correct++;
    }
  }
  return correct / data.length;
}

export function countNodes(node: TabularTreeNode): { splits: number; leaves: number; maxDepth: number } {
  if (node.type === 'leaf') {
    return { splits: 0, leaves: 1, maxDepth: node.depth };
  }
  const leftStats = countNodes(node.left);
  const rightStats = countNodes(node.right);
  return {
    splits: 1 + leftStats.splits + rightStats.splits,
    leaves: leftStats.leaves + rightStats.leaves,
    maxDepth: Math.max(leftStats.maxDepth, rightStats.maxDepth),
  };
}

// ─── Layout Coordinate Builder ────────────────────────────────

export type TabularLayoutEntry = {
  node: TabularTreeNode;
  x: number;
  y: number;
  parentX?: number;
  parentY?: number;
  isLeftChild?: boolean;
};

const NODE_W = 190;
const NODE_H = 85;
const H_GAP = 20;
const V_GAP = 70;

export function layoutTabularTree(
  root: TabularTreeNode
): { entries: TabularLayoutEntry[]; width: number; height: number } {
  const entries: TabularLayoutEntry[] = [];
  let leafIdx = 0;

  type Range = { minX: number; maxX: number };

  function walk(node: TabularTreeNode, parentX?: number, parentY?: number, isLeft?: boolean): Range {
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

    // Back-patch children parent references
    for (const e of entries) {
      if (e.node === node.left && e.parentX === undefined) { e.parentX = x; e.parentY = y; }
      if (e.node === node.right && e.parentX === undefined) { e.parentX = x; e.parentY = y; }
    }

    return { minX: leftRange.minX, maxX: rightRange.maxX };
  }

  walk(root);

  const maxX = entries.length > 0 ? Math.max(...entries.map(e => e.x)) : 0;
  const maxY = entries.length > 0 ? Math.max(...entries.map(e => e.y)) : 0;

  return {
    entries,
    width: maxX + NODE_W + H_GAP,
    height: maxY + NODE_H + 20,
  };
}

export { NODE_W, NODE_H };
