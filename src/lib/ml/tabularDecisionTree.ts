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
      const vals = data
        .map(d => d[f])
        .filter(v => v !== undefined && v !== null && v !== '' && !isNaN(Number(v)))
        .map(v => Number(v));
      if (vals.length === 0) continue;
      
      const sortedUniqueVals = Array.from(new Set(vals)).sort((a, b) => a - b);
      
      for (let i = 0; i < sortedUniqueVals.length - 1; i++) {
        const threshold = (sortedUniqueVals[i] + sortedUniqueVals[i + 1]) / 2;
        
        // Split data
        const left = data.filter(d => d[f] !== undefined && d[f] !== null && d[f] !== '' && !isNaN(Number(d[f])) && Number(d[f]) <= threshold);
        const right = data.filter(d => d[f] !== undefined && d[f] !== null && d[f] !== '' && !isNaN(Number(d[f])) && Number(d[f]) > threshold);
        
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

  // Partition validation and training data based on the split rule to filter down subtrees
  let trainLeft: Record<string, any>[] = [];
  let trainRight: Record<string, any>[] = [];
  let valLeft: Record<string, any>[] = [];
  let valRight: Record<string, any>[] = [];

  const goesLeftForMissing = node.left.samples >= node.right.samples;

  if (node.featureType === 'numerical') {
    const tVal = node.threshold!;
    const routeRow = (row: Record<string, any>) => {
      const val = row[node.featureName];
      if (val === undefined || val === null || val === '' || isNaN(Number(val))) {
        return goesLeftForMissing;
      }
      return Number(val) <= tVal;
    };
    trainLeft = trainData.filter(routeRow);
    trainRight = trainData.filter(row => !routeRow(row));
    valLeft = valData.filter(routeRow);
    valRight = valData.filter(row => !routeRow(row));
  } else {
    const catVal = String(node.categoryValue);
    const routeRow = (row: Record<string, any>) => {
      const val = row[node.featureName];
      if (val === undefined || val === null || val === '') {
        return goesLeftForMissing;
      }
      return String(val) === catVal;
    };
    trainLeft = trainData.filter(routeRow);
    trainRight = trainData.filter(row => !routeRow(row));
    valLeft = valData.filter(routeRow);
    valRight = valData.filter(row => !routeRow(row));
  }

  // Prune left and right subtrees recursively with their filtered data subsets
  node.left = postPruneTabularTree(node.left, trainLeft, valLeft, targetName);
  node.right = postPruneTabularTree(node.right, trainRight, valRight, targetName);

  // If no validation data actually reaches this node, do not prune it (keep the trained structure)
  if (valData.length === 0) return node;

  // 1. Calculate validation accuracy of the active subtree on the validation subset reaching this node
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

    if (val === undefined || val === null || val === '') {
      // Missing value fallback: route to the child with more training samples
      goesLeft = curr.left.samples >= curr.right.samples;
    } else if (curr.featureType === 'numerical') {
      const numVal = Number(val);
      if (isNaN(numVal)) {
        goesLeft = curr.left.samples >= curr.right.samples;
      } else {
        goesLeft = numVal <= curr.threshold!;
      }
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

export function exportTreeToRulesText(
  node: TabularTreeNode,
  t: (key: string, defaultVal?: string) => string,
  indent = ""
): string {
  if (node.type === 'leaf') {
    const thenStr = t('dt_rule_then', '➔ THEN: Predict');
    const confidenceStr = t('dt_leaf_confidence_label', 'Leaf Confidence');
    const samplesStr = t('samples', 'Samples');
    return `${indent}${thenStr} "${node.predictedClass}" (${confidenceStr}: ${node.confidence}%, ${samplesStr}: ${node.samples})`;
  }

  const ifStr = t('dt_rule_if', 'IF');
  const elseStr = t('dt_rule_else', 'ELSE');

  let leftCond = "";
  let rightCond = "";
  if (node.featureType === 'numerical') {
    leftCond = `${node.featureName} <= ${node.threshold}`;
    rightCond = `${node.featureName} > ${node.threshold}`;
  } else {
    leftCond = `${node.featureName} == "${node.categoryValue}"`;
    rightCond = `${node.featureName} != "${node.categoryValue}"`;
  }

  return `${indent}${ifStr} ${leftCond}:\n` +
         exportTreeToRulesText(node.left, t, indent + "  ") + "\n" +
         `${indent}${elseStr} (${rightCond}):\n` +
         exportTreeToRulesText(node.right, t, indent + "  ");
}

export function simplifyPathRules(
  path: TabularTreeNode[],
  t: (key: string, defaultVal?: string) => string
): string[] {
  if (path.length <= 1) return [];

  const numericalBounds: Record<string, { min: number; max: number }> = {};
  const categoricalEqualities: Record<string, string> = {};
  const categoricalInequalities: Record<string, Set<string>> = {};
  const featureOrder: string[] = [];
  const seenFeatures = new Set<string>();

  for (let i = 0; i < path.length - 1; i++) {
    const curr = path[i];
    const next = path[i + 1];
    if (curr.type !== 'split') continue;

    const goesLeft = curr.left === next;
    const f = curr.featureName;

    // Track chronological feature order based on its first occurrence
    if (!seenFeatures.has(f)) {
      seenFeatures.add(f);
      featureOrder.push(f);
    }

    if (curr.featureType === 'numerical') {
      if (!numericalBounds[f]) {
        numericalBounds[f] = { min: -Infinity, max: Infinity };
      }
      const tVal = curr.threshold!;
      if (goesLeft) {
        numericalBounds[f].max = Math.min(numericalBounds[f].max, tVal);
      } else {
        numericalBounds[f].min = Math.max(numericalBounds[f].min, tVal);
      }
    } else {
      const val = String(curr.categoryValue);
      if (goesLeft) {
        categoricalEqualities[f] = val;
      } else {
        if (!categoricalInequalities[f]) {
          categoricalInequalities[f] = new Set();
        }
        categoricalInequalities[f].add(val);
      }
    }
  }

  const simplifiedRules: string[] = [];
  const notInStr = t('dt_rule_not_in', 'NOT IN');

  // Build the simplified rules in the exact order they are encountered in the tree (from root to leaf)
  for (const f of featureOrder) {
    if (numericalBounds[f]) {
      const { min, max } = numericalBounds[f];
      if (min !== -Infinity && max !== Infinity) {
        simplifiedRules.push(`${min} < ${f} <= ${max}`);
      } else if (max !== Infinity) {
        simplifiedRules.push(`${f} <= ${max}`);
      } else if (min !== -Infinity) {
        simplifiedRules.push(`${f} > ${min}`);
      }
    } else if (categoricalEqualities[f] !== undefined) {
      simplifiedRules.push(`${f} == "${categoricalEqualities[f]}"`);
    } else if (categoricalInequalities[f]) {
      const items = Array.from(categoricalInequalities[f]);
      if (items.length === 1) {
        simplifiedRules.push(`${f} != "${items[0]}"`);
      } else {
        simplifiedRules.push(`${f} ${notInStr} [${items.map(x => `"${x}"`).join(', ')}]`);
      }
    }
  }

  return simplifiedRules;
}

// ─── Natural-language rules (for non-programmers) ──────────────
// Turns each root-to-leaf path into a plain sentence, localized to the
// active UI language, so the rules read like prose rather than code.

export type NaturalRule = {
  conditions: string[];   // already-localized condition clauses
  predictedClass: string;
  confidence: number;
  samples: number;
};

function formatNum(n: number): string {
  return Number.isInteger(n) ? String(n) : parseFloat(n.toFixed(3)).toString();
}

function naturalConditions(path: TabularTreeNode[], lang: string): string[] {
  const numericalBounds: Record<string, { min: number; max: number }> = {};
  const categoricalEqualities: Record<string, string> = {};
  const categoricalInequalities: Record<string, Set<string>> = {};
  const featureOrder: string[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < path.length - 1; i++) {
    const curr = path[i];
    const next = path[i + 1];
    if (curr.type !== 'split') continue;
    const goesLeft = curr.left === next;
    const f = curr.featureName;
    if (!seen.has(f)) { seen.add(f); featureOrder.push(f); }

    if (curr.featureType === 'numerical') {
      if (!numericalBounds[f]) numericalBounds[f] = { min: -Infinity, max: Infinity };
      const tVal = curr.threshold!;
      if (goesLeft) numericalBounds[f].max = Math.min(numericalBounds[f].max, tVal);
      else numericalBounds[f].min = Math.max(numericalBounds[f].min, tVal);
    } else {
      const val = String(curr.categoryValue);
      if (goesLeft) categoricalEqualities[f] = val;
      else (categoricalInequalities[f] ??= new Set()).add(val);
    }
  }

  // Localized phrase builders
  const q = (v: string) => `"${v}"`;
  const catEq = (f: string, v: string) =>
    lang === 'pt' ? `${f} é ${q(v)}` : lang === 'fr' ? `${f} est ${q(v)}` : `${f} is ${q(v)}`;
  const catNeq = (f: string, v: string) =>
    lang === 'pt' ? `${f} não é ${q(v)}` : lang === 'fr' ? `${f} n'est pas ${q(v)}` : `${f} is not ${q(v)}`;
  const catNotIn = (f: string, items: string[]) => {
    const list = items.map(q).join(', ');
    return lang === 'pt' ? `${f} não é nenhum de ${list}`
         : lang === 'fr' ? `${f} n'est aucun de ${list}`
         : `${f} is none of ${list}`;
  };
  const numBetween = (f: string, min: string, max: string) =>
    lang === 'pt' ? `${f} está entre ${min} e ${max}`
    : lang === 'fr' ? `${f} est entre ${min} et ${max}`
    : `${f} is between ${min} and ${max}`;
  const numAtMost = (f: string, max: string) =>
    lang === 'pt' ? `${f} é no máximo ${max}`
    : lang === 'fr' ? `${f} est au plus ${max}`
    : `${f} is at most ${max}`;
  const numGreater = (f: string, min: string) =>
    lang === 'pt' ? `${f} é maior que ${min}`
    : lang === 'fr' ? `${f} est supérieur à ${min}`
    : `${f} is greater than ${min}`;

  const out: string[] = [];
  for (const f of featureOrder) {
    if (numericalBounds[f]) {
      const { min, max } = numericalBounds[f];
      if (min !== -Infinity && max !== Infinity) out.push(numBetween(f, formatNum(min), formatNum(max)));
      else if (max !== Infinity) out.push(numAtMost(f, formatNum(max)));
      else if (min !== -Infinity) out.push(numGreater(f, formatNum(min)));
    } else if (categoricalEqualities[f] !== undefined) {
      out.push(catEq(f, categoricalEqualities[f]));
    } else if (categoricalInequalities[f]) {
      const items = Array.from(categoricalInequalities[f]);
      out.push(items.length === 1 ? catNeq(f, items[0]) : catNotIn(f, items));
    }
  }
  return out;
}

// Plain-language conditions for a single (live prediction) path.
export function naturalizePath(path: TabularTreeNode[], lang = 'pt'): string[] {
  return naturalConditions(path, lang);
}

export function extractNaturalRules(root: TabularTreeNode, lang = 'pt'): NaturalRule[] {
  const rules: NaturalRule[] = [];
  function walk(node: TabularTreeNode, path: TabularTreeNode[]) {
    const next = [...path, node];
    if (node.type === 'leaf') {
      rules.push({
        conditions: naturalConditions(next, lang),
        predictedClass: node.predictedClass,
        confidence: node.confidence,
        samples: node.samples,
      });
      return;
    }
    walk(node.left, next);
    walk(node.right, next);
  }
  walk(root, []);
  return rules;
}

export function computeFeatureImportance(
  root: TabularTreeNode,
  features: string[]
): Record<string, number> {
  const importance: Record<string, number> = {};
  for (const f of features) {
    importance[f] = 0;
  }
  const rootSamples = root.samples;
  if (rootSamples === 0) return importance;

  function traverse(node: TabularTreeNode) {
    if (node.type === 'leaf') return;
    const f = node.featureName;
    importance[f] = (importance[f] || 0) + (node.samples / rootSamples) * node.gain;
    traverse(node.left);
    traverse(node.right);
  }

  traverse(root);

  // Normalize to sum to 1.0 if sum > 0
  let sum = 0;
  for (const f of features) {
    sum += importance[f];
  }
  if (sum > 0) {
    for (const f of features) {
      importance[f] = Math.round((importance[f] / sum) * 1000) / 1000;
    }
  }

  return importance;
}

export function exportTreeToPythonCode(
  node: TabularTreeNode,
  targetName: string,
  indent = "    ",
  lang = "pt"
): string {
  if (node.type === 'leaf') {
    let comment = `Confidence: ${node.confidence}%, Support: ${node.samples} samples`;
    if (lang === 'pt') {
      comment = `Confiança: ${node.confidence}%, Suporte: ${node.samples} amostras`;
    } else if (lang === 'fr') {
      comment = `Confiance: ${node.confidence}%, Support: ${node.samples} échantillons`;
    }
    return `${indent}return "${node.predictedClass}"  # (${comment})`;
  }

  let leftCond = "";
  let rightCond = "";
  if (node.featureType === 'numerical') {
    leftCond = `features.get('${node.featureName}') <= ${node.threshold}`;
    rightCond = `features.get('${node.featureName}') > ${node.threshold}`;
  } else {
    leftCond = `features.get('${node.featureName}') == '${node.categoryValue}'`;
    rightCond = `features.get('${node.featureName}') != '${node.categoryValue}'`;
  }

  return `${indent}if ${leftCond}:\n` +
         exportTreeToPythonCode(node.left, targetName, indent + "    ", lang) + "\n" +
         `${indent}else:  # ${rightCond}\n` +
         exportTreeToPythonCode(node.right, targetName, indent + "    ", lang);
}

export function getPythonBoilerplate(
  root: TabularTreeNode,
  targetName: string,
  lang = "pt"
): string {
  const code = exportTreeToPythonCode(root, targetName, "    ", lang);

  let docPredict = `Predicts the value of "${targetName}" using a trained decision tree model.`;
  let docParam = `features: dictionary with the feature key-value pairs`;
  let docReturn = `predicted class label (string)`;
  let usageComment = `Example usage:`;
  let predictionLabel = `Prediction:`;

  if (lang === 'pt') {
    docPredict = `Preve o valor de "${targetName}" com base num modelo de arvore de decisao treinado.`;
    docParam = `features: dicionario com os pares chave-valor dos atributos`;
    docReturn = `classe predita (string)`;
    usageComment = `Exemplo de utilizacao:`;
    predictionLabel = `Previsao:`;
  } else if (lang === 'fr') {
    docPredict = `Prédit la valeur de "${targetName}" à l'aide d'un modèle d'arbre de décision entraîné.`;
    docParam = `features: dictionnaire avec les paires clé-valeur des caractéristiques`;
    docReturn = `classe prédite (chaîne)`;
    usageComment = `Exemple d'utilisation :`;
    predictionLabel = `Prédiction :`;
  }

  return `def predict(features):\n` +
         `    """\n` +
         `    ${docPredict}\n` +
         `    :param features: ${docParam}\n` +
         `    :return: ${docReturn}\n` +
         `    """\n` +
         code + `\n\n` +
         `# ${usageComment}\n` +
         `# sample = { ... }\n` +
         `# print("${predictionLabel}", predict(sample))\n`;
}

export function exportTreeToJsCode(
  node: TabularTreeNode,
  targetName: string,
  indent = "  ",
  lang = "pt"
): string {
  if (node.type === 'leaf') {
    let comment = `Confidence: ${node.confidence}%, Support: ${node.samples} samples`;
    if (lang === 'pt') {
      comment = `Confiança: ${node.confidence}%, Suporte: ${node.samples} amostras`;
    } else if (lang === 'fr') {
      comment = `Confiance: ${node.confidence}%, Support: ${node.samples} échantillons`;
    }
    return `${indent}return "${node.predictedClass}"; // (${comment})`;
  }

  let leftCond = "";
  let rightCond = "";
  if (node.featureType === 'numerical') {
    leftCond = `Number(features['${node.featureName}']) <= ${node.threshold}`;
    rightCond = `Number(features['${node.featureName}']) > ${node.threshold}`;
  } else {
    leftCond = `String(features['${node.featureName}']) === "${node.categoryValue}"`;
    rightCond = `String(features['${node.featureName}']) !== "${node.categoryValue}"`;
  }

  return `${indent}if (${leftCond}) {\n` +
         exportTreeToJsCode(node.left, targetName, indent + "  ", lang) + "\n" +
         `${indent}} else { // ${rightCond}\n` +
         exportTreeToJsCode(node.right, targetName, indent + "  ", lang) + "\n" +
         `${indent}}`;
}

export function getJsBoilerplate(
  root: TabularTreeNode,
  targetName: string,
  lang = "pt"
): string {
  const code = exportTreeToJsCode(root, targetName, "  ", lang);

  let docPredict = `Predicts the value of "${targetName}" based on the decision tree.`;
  let docParam = `features - Dictionary with the attribute key-value pairs`;
  let docReturn = `predicted class`;
  let usageComment = `Example usage:`;
  let predictionLabel = `Prediction:`;

  if (lang === 'pt') {
    docPredict = `Preve o valor de "${targetName}" com base na arvore de decisao.`;
    docParam = `features - Dicionario com pares chave-valor dos atributos`;
    docReturn = `classe predita`;
    usageComment = `Exemplo de utilizacao:`;
    predictionLabel = `Previsao:`;
  } else if (lang === 'fr') {
    docPredict = `Prédit la valeur de "${targetName}" sur la base de l'arbre de décision.`;
    docParam = `features - Dictionnaire avec les paires clé-valeur des attributs`;
    docReturn = `classe prédite`;
    usageComment = `Exemple d'utilisation :`;
    predictionLabel = `Prédiction :`;
  }

  return `function predict(features) {\n` +
         `  /**\n` +
         `   * ${docPredict}\n` +
         `   * @param {Object} features - ${docParam}\n` +
         `   * @returns {string} ${docReturn}\n   */\n` +
         code + `\n` +
         `}\n\n` +
         `// ${usageComment}\n` +
         `// const sample = { ... };\n` +
         `// console.log("${predictionLabel}", predict(sample));\n`;
}

export { NODE_W, NODE_H };


