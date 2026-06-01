# AIMachina XLab

[![AIMachina XLab CI Pipeline](https://github.com/d1ogogomes/aimachina-xlab/actions/workflows/ci.yml/badge.svg)](https://github.com/d1ogogomes/aimachina-xlab/actions)

> An interactive, fully client-side **AI laboratory** that runs real machine-learning models directly in the browser — no backend, no GPU server, no data ever leaving the device.

AIMachina XLab is a single-page educational playground built to make the *internals* of modern AI tangible. It bundles three self-contained labs — **Computer Vision**, **LLM mechanics**, and **Decision Trees** — each one a hands-on, visual demonstration of a core ML concept. Everything (training, inference, explainability, tree induction) executes locally in the user's browser using TensorFlow.js and hand-written algorithms.

The UI is trilingual (🇵🇹 Português · 🇬🇧 English · 🇫🇷 Français) and polished with a glassmorphism design system.

---

## Table of Contents

- [Highlights](#highlights)
- [The Three Labs](#the-three-labs)
  - [1. Computer Vision Lab](#1-computer-vision-lab-cv)
  - [2. LLM Playground](#2-llm-playground-llm)
  - [3. Decision Tree Lab](#3-decision-tree-lab-dt)
- [Tech Stack](#tech-stack)
- [Architecture & Design Decisions](#architecture--design-decisions)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Available Scripts](#available-scripts)
- [Testing Suite](#testing-suite)
- [Internationalization (i18n)](#internationalization-i18n)
- [Machine Learning Internals](#machine-learning-internals)
- [Known Limitations](#known-limitations)
- [Credits & Attribution](#credits--attribution)

---

## Highlights

- 🧠 **Real ML in the browser** — transfer learning, custom classifier training, and CART decision-tree induction all run client-side via [TensorFlow.js](https://www.tensorflow.org/js) and pure-TypeScript algorithms.
- 🔍 **Explainable AI (XAI)** — occlusion-sensitivity heatmaps reveal *which pixels* drove a prediction.
- 📊 **Full evaluation suite** — confusion matrix, per-class precision/recall/F1, and a sample inspector.
- 🌳 **Two hand-written CART implementations** — one over MobileNet embedding vectors, one over arbitrary tabular data, both with Gini/Entropy criteria, pre-pruning, and reduced-error post-pruning.
- 🔤 **LLM Decoder Emulator** — interactive tokenizer and a temperature / nucleus (top-p) sampling visualizer explaining the probabilistic mechanics of generative models.
- 🌐 **Trilingual UI** — PT / EN / FR via a lightweight custom i18n store, plus on-the-fly dataset translation.
- 🔒 **Privacy by design** — no server, no telemetry; webcam frames, drawings, and datasets never leave the browser.
- 💾 **Persistence** — custom datasets and trained CV projects are saved to `localStorage`.
- 🧪 **Devops & Integrity** — full TypeScript type safety, automated CI pipelines, and a robust unit testing suite.

---

## The Three Labs

The app is organized as four tabs in [`src/App.svelte`](src/App.svelte): a **Home** landing page plus the three labs below.

### 1. Computer Vision Lab (CV)

A complete **transfer-learning** workflow that lets a user build an image classifier from scratch, in the browser, in a few clicks. Encapsulated in the modular [`ComputerVisionLab.svelte`](src/lib/components/ComputerVisionLab.svelte) component.

**Pipeline**
1. **Backbone** — [MobileNet v1](https://github.com/tensorflow/tfjs-models/tree/master/mobilenet) (α=1.0) loaded once; its penultimate layer yields a **1024-dimensional embedding** per image (`FEATURE_SIZE = 1024`).
2. **Data capture** — users add classes and feed them images via:
   - file upload,
   - **live webcam capture** ([`WebcamModal.svelte`](src/lib/components/WebcamModal.svelte)),
   - **freehand drawing** ([`DrawModal.svelte`](src/lib/components/DrawModal.svelte)),
   - or one of the bundled **demo datasets** (Cats vs Dogs, and MNIST digits).
3. **Embedding extraction** — each image is embedded once and cached; tensors are wrapped in `tf.tidy` so intermediate memory is freed even on error paths.
4. **Head training** — a small dense classifier ([`buildClassifier`](src/lib/ml/tfjs.ts)) is trained on top of the frozen embeddings.
5. **Inference** — live predictions with confidence scores via [`PreviewCard.svelte`](src/lib/components/PreviewCard.svelte).

**Beyond the basics**
- **Explainable AI** — `computeOcclusionMap` / `renderOcclusionOverlay` slide an occluding patch across the image and measure confidence drop, producing a sensitivity heatmap overlaid on the input.
- **MNIST preprocessing** — [`preprocess.ts`](src/lib/ml/preprocess.ts) replicates the classic LeCun et al. (1998) pipeline (bounding-box crop → 20×20 scale → 28×28 center-of-mass paste) so live drawings land in the same distribution as the training PNGs.
- **Evaluation** — `evaluateModel` builds a confusion matrix; per-class precision / recall / F1 are derived reactively.
- **Decision-tree diagnostic** — a CART tree ([`decisionTree.ts`](src/lib/ml/decisionTree.ts)) is induced over the embedding vectors and rendered ([`DecisionTreeViz.svelte`](src/lib/components/DecisionTreeViz.svelte)) to give a complementary, interpretable view of the feature space.
- **Model export** — the trained classifier can be exported via `exportModel`.
- **Project persistence** — full CV datasets (images as data URLs, classes, test samples) are saved to and restored from `localStorage`.

### 2. LLM Playground (LLM)

A fully client-side, illustrative look at how language models process text and choose tokens. Implemented in [`LlmPlayground.svelte`](src/lib/components/LlmPlayground.svelte) with two sub-tabs:

- **Tokenizer** — visualizes how text is split into tokens in **word** or **subword** mode, with hover highlighting and per-language default sample texts.
- **Decoding / Sampling (Visual Emulator)** — an interactive demonstration of how a probability distribution over the vocabulary becomes a chosen token. 
  
  *Note on Academic Honesty: This playground runs a visual emulator utilizing simulated vocabulary logits. It is designed purely to teach and make the mathematical mechanics of Temperature (`T`), Nucleus/Top-P sampling (`P`), and Top-K filters intuitive and visually understandable, showing how they shape logits distributions before final token selection.*

### 3. Decision Tree Lab (DT)

A from-scratch **CART** classifier for **tabular data**, in [`tabularDecisionTree.ts`](src/lib/ml/tabularDecisionTree.ts) and [`DecisionTreeLab.svelte`](src/lib/components/DecisionTreeLab.svelte).

**Algorithm**
- Supports both **numerical** (`feature <= threshold`) and **categorical** (`feature == value`) splits.
- Selectable impurity criterion: **Gini** or **Entropy** (information gain).
- **Pre-pruning** knobs: `maxDepth`, `minSamplesSplit`, `minSamplesLeaf`.
- **Reduced-Error Post-Pruning** against a held-out validation split.
- **Deterministic, seeded train/test shuffle** (`seededShuffle`) so the split — and therefore the tree and its accuracy — is reproducible across runs.

**Interaction**
- **Built-in datasets**: *Golf Play* (classic categorical) and *Iris* (numerical).
- **Import your own** via CSV or JSON (the last column is treated as the target; feature types are auto-inferred).
- **Custom dataset persistence** to `localStorage` ([`tabularDatasets.ts`](src/lib/ml/tabularDatasets.ts)).
- **Interactive predictor** — fill in feature values and watch the decision path light up.
- **Two views of the model**:
  - **Graph** — an SVG tree ([`TabularDecisionTreeViz.svelte`](src/lib/components/TabularDecisionTreeViz.svelte)),
  - **Text rules** — the tree exported as nested `IF / ELSE / THEN` rules (`exportTreeToRulesText`).
- **Simplified rule path** (`simplifyPathRules`) — collapses a prediction's path into consolidated, human-readable conditions (e.g. merging `x > 2` and `x <= 5` into `2 < x <= 5`, and multiple `!=` into a single `NOT IN [...]`).
- **On-the-fly dataset translation** — translates headers and categorical values into the active UI language (via the Google Translate endpoint), with a bounded-concurrency request pool, domain-specific overrides, and graceful fallback to the original value on any failure.
- **Feature Importance** — mathematically computes Gini/Entropy impurity decreases weighted by sample support at split nodes, normalising scores to a `0-100%` scale displayed as modern animated progress bars.
- **Code Exporters** — translates the trained tree into copy-pasteable, production-ready, executable autonomous code in both **Python** (nested conditional script) and **JavaScript** (standalone prediction function).

---

## Tech Stack

| Layer | Choice |
|---|---|
| **Framework** | [Svelte 5](https://svelte.dev/) (`^5.53`) |
| **Build tool** | [Vite 8](https://vite.dev/) |
| **Test Runner** | [Vitest](https://vitest.dev/) (fast unit test executions) |
| **Language** | TypeScript 5.9 (strict, `checkJs` enabled) |
| **Styling** | [Tailwind CSS 4](https://tailwindcss.com/) + PostCSS + Autoprefixer |
| **ML runtime** | [TensorFlow.js 4.22](https://www.tensorflow.org/js) + `@tensorflow-models/mobilenet` |
| **Visual FX** | `shaders` (animated WebGL shaders on the landing hero) |
| **i18n** | Custom lightweight Svelte store (no dependency) |
| **Type-checking** | `svelte-check` |

---

## Architecture & Design Decisions

- **No backend.** Every model, dataset, and computation lives in the browser. This keeps the project trivially deployable as static files and makes privacy a structural guarantee rather than a promise.
- **Decoupled Architecture.** All heavy machine learning controllers are extracted from UI views. [`App.svelte`](src/App.svelte) serves as a lightweight Router and Shell, delegating the training, capturing, and XAI pipelines to the standalone [`ComputerVisionLab.svelte`](src/lib/components/ComputerVisionLab.svelte) component.
- **Memory discipline.** Every tensor-producing helper wraps work in `tf.tidy`, so intermediate tensors are released even when an error is thrown mid-pipeline.
- **Determinism where it matters.** The Decision Tree Lab uses a seeded shuffle so results are reproducible — important for a teaching tool where a user expects the same input to yield the same tree.
- **Graceful degradation in i18n.** The translation store resolves `key → translation → explicit fallback → key`, so a missing locale key surfaces readable text instead of a raw identifier.

---

## Project Structure

```
aimachina-xlab/
├── index.html                      # Vite entry; loads Inter font, mounts #app
├── vite.config.ts                  # Vite + Svelte plugin
├── svelte.config.js                # Svelte/Vite preprocess config
├── tailwind.config.js              # Tailwind setup
├── postcss.config.js
├── tsconfig*.json                  # App + node TS configs
├── .github/
│   └── workflows/
│       └── ci.yml                  # GitHub Actions CI Workflow configuration
├── public/
│   └── datasets/                   # Bundled Cats / Dogs demo images (+ ATTRIBUTION.md)
├── src/
│   ├── main.ts                     # App bootstrap
│   ├── App.svelte                  # Lightweight Svelte Application Shell / Router
│   ├── app.css                     # Global styles
│   ├── i18n.ts                     # Custom translation store (locale + t)
│   ├── locales/                    # en.json · pt.json · fr.json
│   ├── assets/                     # Hero / brand images
│   ├── demoDataset.ts              # Cats vs Dogs demo dataset definitions
│   ├── mnistDataset.ts             # MNIST demo dataset definitions
│   └── lib/
│       ├── components/
│       │   ├── HomeHero.svelte             # Animated shader landing page
│       │   ├── ComputerVisionLab.svelte    # Decoupled Deep Learning / CNN Lab
│       │   ├── PreviewCard.svelte          # Live CV inference card
│       │   ├── WebcamModal.svelte          # Webcam capture
│       │   ├── DrawModal.svelte            # Freehand drawing capture
│       │   ├── DecisionTreeViz.svelte      # SVG tree over embeddings
│       │   ├── TabularDecisionTreeViz.svelte # SVG tree over tabular data
│       │   ├── DecisionTreeLab.svelte      # Decision Tree Lab UI
│       │   └── LlmPlayground.svelte        # Tokenizer + decoding/sampling
│       └── ml/
│           ├── tfjs.ts                     # MobileNet, embeddings, classifier, occlusion XAI
│           ├── preprocess.ts               # MNIST canvas preprocessing
│           ├── decisionTree.ts             # CART over embedding vectors
│           ├── tabularDecisionTree.ts      # CART over tabular data (+ rule export)
│           ├── tabularDecisionTree.test.ts # Vitest suite for the CART algorithm
│           └── tabularDatasets.ts          # Built-in datasets + localStorage CRUD
└── mnist_png/, prune_mnist.js              # MNIST asset tooling
```

---

## Getting Started

### Prerequisites
- **Node.js ≥ 20** (developed on Node 22)
- npm

### Install & run

```bash
# install dependencies
npm install

# start the dev server (http://localhost:5173)
npm run dev

# run the vitest unit testing suite
npm run test

# type-check the whole project
npm run check

# production build → dist/
npm run build

# preview the production build locally
npm run preview
```

---

## Available Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start the Vite dev server with HMR |
| `npm run test` | Run the Vitest unit test suite |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run check` | `svelte-check` + `tsc` type-checking (0 errors enforced) |

---

## Testing Suite

The custom CART classification library is fully unit tested using **Vitest** for robust predictive calculations. Coverage in [`tabularDecisionTree.test.ts`](src/lib/ml/tabularDecisionTree.test.ts) includes:

- **Impurity Calculations**: Evaluates correct Gini and Entropy metrics on pure, partially pure, and fully mixed class distributions.
- **Tree Synthesis & Stopping Criteria**: Assures Gini/Entropy minimization paths and enforces early-stopping depth limits.
- **Post-Pruning Math**: Assures validation subsets are recursively sliced down to matching paths for Reduced Error Pruning without data leakages.
- **Purity & Support Routing**: Validates prediction fallback mechanisms when encountering row features with missing/empty values.
- **Normalized Feature Importance**: Assures that calculated relative Gini feature weights properly sum to exactly `1.0`.

Execute tests via:
```bash
npm run test
```

---

## Internationalization (i18n)

A deliberately tiny store in [`src/i18n.ts`](src/lib/i18n.ts):

```ts
export const locale = writable('pt');                       // default language
export const t = derived(locale, ($locale) =>
  (key: string, defaultVal?: string) =>
    translations[$locale]?.[key] || defaultVal || key);     // graceful fallback chain
```

Translation strings live in [`src/locales/`](src/locales) as `en.json`, `pt.json`, and `fr.json`. The `defaultVal` fallback means a missing key degrades to readable text (or an inline default) rather than leaking the raw key into the UI.

---

## Machine Learning Internals

| Module | What it does |
|---|---|
| [`tfjs.ts`](src/lib/ml/tfjs.ts) | Loads MobileNet v1; extracts single & batched 1024-d embeddings; builds and trains the dense classifier head; computes occlusion-sensitivity maps and renders the overlay. |
| [`preprocess.ts`](src/lib/ml/preprocess.ts) | MNIST-faithful canvas normalization (bbox → 20×20 → 28×28 center-of-mass) so hand-drawn digits match the training distribution. |
| [`decisionTree.ts`](src/lib/ml/decisionTree.ts) | CART over embedding vectors: Gini impurity, recursive splitting, leaf confidence, and SVG layout. |
| [`tabularDecisionTree.ts`](src/lib/ml/tabularDecisionTree.ts) | CART over tabular data: numerical & categorical splits, Gini/Entropy, pre-pruning, reduced-error post-pruning, accuracy, node counting, SVG layout, text-rule export, and path simplification. |
| [`tabularDatasets.ts`](src/lib/ml/tabularDatasets.ts) | Built-in Golf & Iris datasets + `localStorage`-backed CRUD for user datasets. |

---

## Known Limitations

- **Compute-bound by the browser.** MobileNet inference and training run on the client; very large datasets or many images will be slow on low-end devices.
- **LLM Playground is illustrative.** The decoding demo uses fixed logits to teach temperature/top-p mechanics; it does not call a real language model.
- **Dataset translation** relies on an undocumented public Google Translate endpoint and is best-effort (rate-limited, no SLA); failures fall back to original text.
- **Persistence is `localStorage`-only** — datasets and saved projects are per-browser and subject to storage quotas.

---

## Credits & Attribution

- Demo image datasets (Cats / Dogs) are sourced from Wikimedia Commons under their respective licenses — see [`public/datasets/ATTRIBUTION.md`](public/datasets/ATTRIBUTION.md) and the per-image metadata in [`src/demoDataset.ts`](src/lib/demoDataset.ts).
- MNIST digits per LeCun, Cortes & Burges.
- Built with Svelte, Vite, TensorFlow.js, and Tailwind CSS.

---

<p align="center"><em>AIMachina XLab — making the inside of AI visible, one browser tab at a time.</em></p>
