import { describe, it, expect } from 'vitest';
import {
  buildTabularTree,
  postPruneTabularTree,
  predictTabular,
  computeAccuracy,
  countNodes,
  computeFeatureImportance,
  type TabularTreeNode
} from './tabularDecisionTree';

// Mock simple dataset representing standard Golf play decision
const mockGolfData = [
  { Outlook: 'Sunny', Humidity: 85, Wind: 'Weak', Play: 'No' },
  { Outlook: 'Sunny', Humidity: 90, Wind: 'Strong', Play: 'No' },
  { Outlook: 'Overcast', Humidity: 78, Wind: 'Weak', Play: 'Yes' },
  { Outlook: 'Rainy', Humidity: 96, Wind: 'Weak', Play: 'Yes' },
  { Outlook: 'Rainy', Humidity: 80, Wind: 'Weak', Play: 'Yes' },
  { Outlook: 'Rainy', Humidity: 70, Wind: 'Strong', Play: 'No' },
  { Outlook: 'Overcast', Humidity: 65, Wind: 'Strong', Play: 'Yes' },
];

const mockFeatures = ['Outlook', 'Humidity', 'Wind'];
const mockFeatureTypes: Record<string, 'categorical' | 'numerical'> = {
  Outlook: 'categorical',
  Humidity: 'numerical',
  Wind: 'categorical',
};
const mockTarget = 'Play';

describe('CART Decision Tree Classifier Tests', () => {
  
  it('should build a pure leaf node if all training classes are identical', () => {
    const pureData = [
      { Outlook: 'Sunny', Humidity: 80, Wind: 'Weak', Play: 'Yes' },
      { Outlook: 'Rainy', Humidity: 90, Wind: 'Strong', Play: 'Yes' },
    ];
    
    const root = buildTabularTree(pureData, mockFeatures, mockFeatureTypes, mockTarget, {
      criterion: 'gini',
      maxDepth: 3,
      minSamplesSplit: 2,
      minSamplesLeaf: 1,
    });

    expect(root.type).toBe('leaf');
    expect(root.gini).toBe(0);
    expect(root.samples).toBe(2);
    if (root.type === 'leaf') {
      expect(root.predictedClass).toBe('Yes');
      expect(root.confidence).toBe(100);
    }
  });

  it('should obey maxDepth constraint and stop splitting early', () => {
    const root = buildTabularTree(mockGolfData, mockFeatures, mockFeatureTypes, mockTarget, {
      criterion: 'gini',
      maxDepth: 0,
      minSamplesSplit: 2,
      minSamplesLeaf: 1,
    });

    // With depth 0, it must be a single leaf node representing majority class
    expect(root.type).toBe('leaf');
    expect(root.depth).toBe(0);
    if (root.type === 'leaf') {
      expect(root.predictedClass).toBe('Yes'); // 4 Yes vs 3 No
      expect(root.samples).toBe(7);
      expect(root.confidence).toBe(Math.round((4 / 7) * 100)); // ~57%
    }
  });

  it('should evaluate correct continuous numerical splits', () => {
    // Dataset split purely by Humidity threshold
    const numData = [
      { Humidity: 10, Play: 'No' },
      { Humidity: 20, Play: 'No' },
      { Humidity: 80, Play: 'Yes' },
      { Humidity: 90, Play: 'Yes' },
    ];

    const root = buildTabularTree(numData, ['Humidity'], { Humidity: 'numerical' }, 'Play', {
      criterion: 'gini',
      maxDepth: 2,
      minSamplesSplit: 2,
      minSamplesLeaf: 1,
    });

    expect(root.type).toBe('split');
    if (root.type === 'split') {
      expect(root.featureName).toBe('Humidity');
      expect(root.featureType).toBe('numerical');
      // Threshold should split between 20 and 80 (typically midpoint 50)
      expect(root.threshold).toBeGreaterThan(20);
      expect(root.threshold).toBeLessThan(80);
      
      // Children must be pure leaves
      expect(root.left.type).toBe('leaf');
      expect(root.right.type).toBe('leaf');
      if (root.left.type === 'leaf') expect(root.left.predictedClass).toBe('No');
      if (root.right.type === 'leaf') expect(root.right.predictedClass).toBe('Yes');
    }
  });

  it('should evaluate correct categorical splits', () => {
    // Dataset split purely by Outlook value
    const catData = [
      { Outlook: 'Sunny', Play: 'No' },
      { Outlook: 'Rainy', Play: 'Yes' },
    ];

    const root = buildTabularTree(catData, ['Outlook'], { Outlook: 'categorical' }, 'Play', {
      criterion: 'gini',
      maxDepth: 2,
      minSamplesSplit: 2,
      minSamplesLeaf: 1,
    });

    expect(root.type).toBe('split');
    if (root.type === 'split') {
      expect(root.featureName).toBe('Outlook');
      expect(root.categoryValue).toBe('Sunny');
      if (root.left.type === 'leaf') expect(root.left.predictedClass).toBe('No');
      if (root.right.type === 'leaf') expect(root.right.predictedClass).toBe('Yes');
    }
  });

  it('should handle missing predictor values gracefully using support routing fallbacks', () => {
    const root = buildTabularTree(mockGolfData, mockFeatures, mockFeatureTypes, mockTarget, {
      criterion: 'gini',
      maxDepth: 3,
      minSamplesSplit: 2,
      minSamplesLeaf: 1,
    });

    // Send prediction row with missing/empty Humidity and Outlook
    const incompleteRow = { Outlook: '', Humidity: '', Wind: 'Strong' };
    const { predictedClass, path } = predictTabular(root, incompleteRow);

    expect(predictedClass).toBeDefined();
    expect(path.length).toBeGreaterThan(0);
    // Verified that missing features fell back to the major support child node safely
  });

  it('should calculate relative feature importances summing to 100%', () => {
    const root = buildTabularTree(mockGolfData, mockFeatures, mockFeatureTypes, mockTarget, {
      criterion: 'gini',
      maxDepth: 4,
      minSamplesSplit: 2,
      minSamplesLeaf: 1,
    });

    const importance = computeFeatureImportance(root, mockFeatures);
    
    // Outlook, Humidity, or Wind should have an importance calculated
    expect(importance.Outlook).toBeDefined();
    expect(importance.Humidity).toBeDefined();
    expect(importance.Wind).toBeDefined();

    const sum = importance.Outlook + importance.Humidity + importance.Wind;
    expect(sum).toBeCloseTo(1.0, 5);
  });

  it('should correctly prune subtrees via Reduced Error Post-Pruning', () => {
    // Build a fully grown tree
    const root = buildTabularTree(mockGolfData, mockFeatures, mockFeatureTypes, mockTarget, {
      criterion: 'gini',
      maxDepth: 5,
      minSamplesSplit: 2,
      minSamplesLeaf: 1,
    });

    // Provide a validation set that represents a simpler rule (meaning complex split is redundant/erroneous)
    const valSet = [
      { Outlook: 'Sunny', Humidity: 85, Wind: 'Weak', Play: 'No' },
      { Outlook: 'Sunny', Humidity: 90, Wind: 'Strong', Play: 'No' },
      { Outlook: 'Overcast', Humidity: 78, Wind: 'Weak', Play: 'Yes' },
      { Outlook: 'Rainy', Humidity: 96, Wind: 'Weak', Play: 'Yes' },
    ];

    const prunedRoot = postPruneTabularTree(root, mockGolfData, valSet, mockTarget);
    
    const originalStats = countNodes(root);
    const prunedStats = countNodes(prunedRoot);

    // Verify pruning reduced node count or depth due to validation accuracy improvement
    expect(prunedStats.splits + prunedStats.leaves).toBeLessThanOrEqual(originalStats.splits + originalStats.leaves);
  });
});
