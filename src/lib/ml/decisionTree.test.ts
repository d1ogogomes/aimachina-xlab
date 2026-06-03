import { describe, it, expect } from "vitest";
import { buildDecisionTree, type TreeNode } from "./decisionTree";

// Walk the tree the same way the builder partitions: x[f] <= threshold => left.
function predict(node: TreeNode, x: number[]): number {
  let cur = node;
  while (cur.type === "split") {
    cur = x[cur.featureIndex] <= cur.threshold ? cur.left : cur.right;
  }
  return cur.predictedClass;
}

function leafCount(node: TreeNode): number {
  return node.type === "leaf" ? 1 : leafCount(node.left) + leafCount(node.right);
}

describe("buildDecisionTree (CV embedding diagnostics)", () => {
  it("returns a pure leaf for a single-class dataset", () => {
    const tree = buildDecisionTree([[1], [2], [3]], [0, 0, 0], 2);
    expect(tree.type).toBe("leaf");
    if (tree.type === "leaf") {
      expect(tree.predictedClass).toBe(0);
      expect(tree.gini).toBe(0);
      expect(tree.confidence).toBe(100);
      expect(tree.samples).toBe(3);
    }
  });

  it("returns a leaf (majority class) when maxDepth is 0", () => {
    const tree = buildDecisionTree(
      [[0], [1], [10], [11]],
      [0, 0, 1, 1],
      2,
      0,
    );
    expect(tree.type).toBe("leaf");
  });

  it("splits a linearly separable 1-D dataset and classifies correctly", () => {
    const X = [[0], [1], [10], [11]];
    const y = [0, 0, 1, 1];
    const tree = buildDecisionTree(X, y, 2);

    expect(tree.type).toBe("split");
    if (tree.type === "split") {
      expect(tree.featureIndex).toBe(0);
      expect(tree.threshold).toBeGreaterThan(1);
      expect(tree.threshold).toBeLessThan(10);
    }

    // All training points classified correctly.
    X.forEach((x, i) => expect(predict(tree, x)).toBe(y[i]));
    // And unseen points on each side of the boundary.
    expect(predict(tree, [0.5])).toBe(0);
    expect(predict(tree, [10.5])).toBe(1);
  });

  it("picks the informative feature when others are noise", () => {
    // Feature 1 separates classes; feature 0 is constant noise.
    const X = [
      [5, 0],
      [5, 1],
      [5, 8],
      [5, 9],
    ];
    const y = [0, 0, 1, 1];
    const tree = buildDecisionTree(X, y, 2);
    expect(tree.type).toBe("split");
    if (tree.type === "split") expect(tree.featureIndex).toBe(1);
    X.forEach((x, i) => expect(predict(tree, x)).toBe(y[i]));
  });

  it("respects maxDepth (tree never deeper than requested)", () => {
    const X = [[0], [1], [2], [3], [4], [5], [6], [7]];
    const y = [0, 1, 0, 1, 0, 1, 0, 1];
    const tree = buildDecisionTree(X, y, 2, 2, 1);
    const maxDepth = (n: TreeNode): number =>
      n.type === "leaf" ? n.depth : Math.max(maxDepth(n.left), maxDepth(n.right));
    expect(maxDepth(tree)).toBeLessThanOrEqual(2);
  });

  it("keeps classDist consistent with samples and confidence in [0,100]", () => {
    const tree = buildDecisionTree(
      [[0], [0], [10], [11], [12]],
      [0, 0, 1, 1, 1],
      2,
    );
    const check = (n: TreeNode) => {
      const sum = n.classDist.reduce((a, b) => a + b, 0);
      expect(sum).toBe(n.samples);
      if (n.type === "leaf") {
        expect(n.confidence).toBeGreaterThanOrEqual(0);
        expect(n.confidence).toBeLessThanOrEqual(100);
      } else {
        check(n.left);
        check(n.right);
      }
    };
    check(tree);
    expect(leafCount(tree)).toBeGreaterThanOrEqual(2);
  });

  it("handles three classes", () => {
    const X = [[0], [1], [10], [11], [20], [21]];
    const y = [0, 0, 1, 1, 2, 2];
    const tree = buildDecisionTree(X, y, 3, 4, 1);
    X.forEach((x, i) => expect(predict(tree, x)).toBe(y[i]));
  });
});
