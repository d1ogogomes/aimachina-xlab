<script lang="ts">
  import { t, locale } from '../i18n';
  import { onMount } from 'svelte';
  import {
    GOLF_DATASET,
    IRIS_DATASET,
    getCustomDatasets,
    saveCustomDataset,
    deleteCustomDataset,
    type TabularDataset
  } from '../ml/tabularDatasets';
  import {
    buildTabularTree,
    postPruneTabularTree,
    predictTabular,
    computeAccuracy,
    countNodes,
    type TabularTreeNode,
    computeFeatureImportance,
    getPythonBoilerplate,
    getJsBoilerplate,
    extractNaturalRules,
    naturalizePath
  } from '../ml/tabularDecisionTree';
  import TabularDecisionTreeViz from './TabularDecisionTreeViz.svelte';
  import { driver } from 'driver.js';
  import 'driver.js/dist/driver.css';

  // Guided tour for this lab. Rebuilt on every call so the popovers reflect
  // the active language. The tree visualizer anchor only exists once a tree
  // has been built, which the lab does automatically on load.
  export function startTour() {
    const step = (element: string, n: number) => ({
      element,
      popover: {
        title: $t(`dt_tour_step${n}_title`),
        description: $t(`dt_tour_step${n}_desc`),
        side: "bottom" as const,
        align: "center" as const,
      },
    });
    document.body.classList.add('tour-active');
    driver({
      showProgress: true,
      popoverClass: 'aimachina-tour',
      nextBtnText: $t('tour_btn_next'),
      prevBtnText: $t('tour_btn_prev'),
      doneBtnText: $t('tour_btn_done'),
      onDestroyed: () => {
        document.body.classList.remove('tour-active');
        if (typeof window !== "undefined") {
          window.scrollTo(0, 0);
        }
      },
      steps: [
        step('#ds-select', 1),
        step('#dt-criterion', 2),
        step('#dt-pruning', 3),
        step('#dt-metrics', 5),
        step('#dt-viz', 6),
        step('#dt-predictor', 7),
      ],
    }).drive();
  }

  // ─── STATE MANAGEMENT ──────────────────────────────────────────
  let datasets: TabularDataset[] = [];
  let selectedDatasetId = 'golf';
  let activeDataset: TabularDataset = GOLF_DATASET;

  // Custom dataset editor state
  let isEditingCustom = false;
  let customDatasetName = '';
  let customFeatures: string[] = ['feature1', 'feature2'];
  let customFeatureTypes: Record<string, 'categorical' | 'numerical'> = {
    feature1: 'categorical',
    feature2: 'numerical',
  };
  let customTargetName = 'label';
  let customTargetClasses: string[] = ['no', 'yes'];
  let customData: Record<string, any>[] = [
    { feature1: 'A', feature2: 10, label: 'no' },
    { feature1: 'B', feature2: 25, label: 'yes' },
  ];

  // Train / Test split and training options
  let trainRatio = 0.8; // 80% train, 20% test
  let splittingCriterion: 'gini' | 'entropy' = 'gini';
  let maxDepth = 4;
  let minSamplesSplit = 2;
  let minSamplesLeaf = 1;

  // Training results
  let trainSet: Record<string, any>[] = [];
  let testSet: Record<string, any>[] = [];
  let trainedTree: TabularTreeNode | null = null;
  let unprunedTree: TabularTreeNode | null = null; // Stored to compare unpruned vs pruned
  let postPrunedTree: TabularTreeNode | null = null; // Stores validation/test post-pruned state
  let isPostPrunedApplied = false;

  // Pruning statistics telemetry
  let unprunedStats = { splits: 0, leaves: 0, maxDepth: 0 };
  let prunedStats = { splits: 0, leaves: 0, maxDepth: 0 };

  let trainAccuracy = 0;
  let testAccuracy = 0;
  let unprunedTrainAccuracy = 0;
  let unprunedTestAccuracy = 0;

  // Predictor state (manually populated inputs for real-time predictions)
  let predictorInputs: Record<string, any> = {};
  let predictionResult = '';
  let predictionConfidence = 0;
  let highlightPath: TabularTreeNode[] = [];
  let isTranslatingDataset = false;
  let showTreeTextMode = false;

  // Feature Importance & Exporter state
  let featureImportance: Record<string, number> = {};
  let codeExportTab: 'graph' | 'rules' | 'python' | 'js' = 'graph';
  let copyFeedback = false;

  // Localized connectors for the plain-language rules and "Why?" view.
  $: ruleIfWord = $locale === 'pt' ? 'Se ' : $locale === 'fr' ? 'Si ' : 'If ';
  $: ruleAndWord = $locale === 'pt' ? 'e' : $locale === 'fr' ? 'et' : 'and';
  $: ruleThenLead =
    $locale === 'pt' ? `, então ${activeDataset.targetName} é `
    : $locale === 'fr' ? `, alors ${activeDataset.targetName} est `
    : `, then ${activeDataset.targetName} is `;
  $: ruleAlwaysLead =
    $locale === 'pt' ? `${activeDataset.targetName} é sempre `
    : $locale === 'fr' ? `${activeDataset.targetName} est toujours `
    : `${activeDataset.targetName} is always `;
  $: ruleConfidenceWord =
    $locale === 'pt' ? 'de confiança' : $locale === 'fr' ? 'de confiance' : 'confidence';
  $: ruleExampleWord = $locale === 'pt' ? 'exemplo' : $locale === 'fr' ? 'exemple' : 'example';
  $: ruleExamplesWord = $locale === 'pt' ? 'exemplos' : $locale === 'fr' ? 'exemples' : 'examples';

  // Plain-language explanation for the live prediction ("Why?").
  $: whyPath = naturalizePath(highlightPath, $locale);

  // UI tabs within the lab
  let activeSubTab: 'train' | 'data' = 'train';

  // ─── LIFECYCLE & INITIALIZATION ────────────────────────────────
  onMount(() => {
    loadAllDatasets();
    triggerTrain();
  });

  function loadAllDatasets() {
    const customList = getCustomDatasets();
    datasets = [GOLF_DATASET, IRIS_DATASET, ...customList];
    
    // Refresh active reference
    const found = datasets.find(d => d.id === selectedDatasetId);
    if (found) {
      activeDataset = found;
    } else {
      selectedDatasetId = 'golf';
      activeDataset = GOLF_DATASET;
    }
  }

  function handleDatasetChange(e: Event) {
    const target = e.target as HTMLSelectElement;
    selectedDatasetId = target.value;
    activeDataset = datasets.find(d => d.id === selectedDatasetId) || GOLF_DATASET;
    isEditingCustom = false;
    isPostPrunedApplied = false;
    postPrunedTree = null;
    initPredictorInputs();
    triggerTrain();
  }

  function initPredictorInputs() {
    predictorInputs = {};
    for (const f of activeDataset.features) {
      if (activeDataset.featureTypes[f] === 'numerical') {
        // Find midpoint/average for continuous numerical starting values
        const vals = activeDataset.data.map(d => Number(d[f])).filter(v => !isNaN(v));
        const avg = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
        predictorInputs[f] = Math.round(avg * 100) / 100;
      } else {
        // Choose first available category
        const vals = Array.from(new Set(activeDataset.data.map(d => String(d[f]))));
        predictorInputs[f] = vals[0] || '';
      }
    }
    runLivePrediction();
  }

  // ─── DATASET EDITOR ACTIONS ───────────────────────────────────
  function openCustomDatasetBuilder() {
    isEditingCustom = true;
    activeSubTab = 'data';
    customDatasetName = 'Meu Dataset Personalizado';
    customFeatures = ['Aspecto', 'Vento'];
    customFeatureTypes = { Aspecto: 'categorical', Vento: 'numerical' };
    customTargetName = 'Jogar';
    customTargetClasses = ['Nao', 'Sim'];
    customData = [
      { Aspecto: 'Sol', Vento: 15, Jogar: 'Nao' },
      { Aspecto: 'Sol', Vento: 5, Jogar: 'Sim' },
      { Aspecto: 'Nuvens', Vento: 12, Jogar: 'Sim' },
      { Aspecto: 'Chuva', Vento: 25, Jogar: 'Nao' },
      { Aspecto: 'Chuva', Vento: 8, Jogar: 'Sim' },
    ];
  }

  function updateFeatureName(idx: number, newName: string) {
    const oldName = customFeatures[idx];
    if (oldName === newName) return;
    
    // Update the features array
    customFeatures[idx] = newName;
    customFeatures = [...customFeatures];
    
    // Rename key in customFeatureTypes
    if (customFeatureTypes[oldName] !== undefined) {
      customFeatureTypes[newName] = customFeatureTypes[oldName];
      delete customFeatureTypes[oldName];
      customFeatureTypes = { ...customFeatureTypes };
    }
    
    // Rename keys in customData rows
    customData = customData.map(row => {
      const newRow = { ...row };
      if (oldName in newRow) {
        newRow[newName] = newRow[oldName];
        delete newRow[oldName];
      }
      return newRow;
    });
  }

  function updateFeatureType(f: string, type: 'categorical' | 'numerical') {
    customFeatureTypes[f] = type;
    customFeatureTypes = { ...customFeatureTypes };
    
    // Coerce values in customData to prevent type mismatches
    customData = customData.map(row => {
      const newRow = { ...row };
      if (type === 'numerical') {
        const num = Number(newRow[f]);
        newRow[f] = isNaN(num) ? 0 : num;
      } else {
        newRow[f] = String(newRow[f]);
      }
      return newRow;
    });
  }

  function updateTargetName(newName: string) {
    const oldName = customTargetName;
    if (oldName === newName) return;
    
    customTargetName = newName;
    
    // Rename keys in customData rows
    customData = customData.map(row => {
      const newRow = { ...row };
      if (oldName in newRow) {
        newRow[newName] = newRow[oldName];
        delete newRow[oldName];
      }
      return newRow;
    });
  }

  function addFeatureColumn() {
    const name = `feature_${customFeatures.length + 1}`;
    customFeatures = [...customFeatures, name];
    customFeatureTypes[name] = 'categorical';
    customFeatureTypes = { ...customFeatureTypes };
    for (let i = 0; i < customData.length; i++) {
      customData[i][name] = 'A';
    }
    customData = [...customData];
  }

  function removeFeatureColumn(col: string) {
    customFeatures = customFeatures.filter(f => f !== col);
    delete customFeatureTypes[col];
    customFeatureTypes = { ...customFeatureTypes };
    for (let i = 0; i < customData.length; i++) {
      delete customData[i][col];
    }
    customData = [...customData];
  }

  function addRow() {
    const newRow: Record<string, any> = {};
    for (const f of customFeatures) {
      newRow[f] = customFeatureTypes[f] === 'numerical' ? 0 : 'A';
    }
    newRow[customTargetName] = customTargetClasses[0] || 'Nao';
    customData = [...customData, newRow];
  }

  function deleteRow(idx: number) {
    customData = customData.filter((_, i) => i !== idx);
  }

  function saveDataset() {
    if (!customDatasetName.trim()) {
      alert($t('dt_alert_enter_name'));
      return;
    }
    if (customData.length < 3) {
      alert($t('dt_alert_min_rows'));
      return;
    }

    const uniqueClasses = Array.from(new Set(customData.map(d => String(d[customTargetName]))));

    const newDataset: TabularDataset = {
      id: 'custom_' + Date.now(),
      name: customDatasetName,
      features: customFeatures,
      featureTypes: customFeatureTypes,
      targetName: customTargetName,
      targetClasses: uniqueClasses.length > 0 ? uniqueClasses : customTargetClasses,
      data: customData
    };

    saveCustomDataset(newDataset);
    selectedDatasetId = newDataset.id;
    loadAllDatasets();
    isEditingCustom = false;
    activeSubTab = 'train';
    initPredictorInputs();
    triggerTrain();
  }

  function handleDeleteCustom(id: string) {
    if (confirm($t('dt_confirm_delete'))) {
      deleteCustomDataset(id);
      selectedDatasetId = 'golf';
      loadAllDatasets();
      isEditingCustom = false;
      initPredictorInputs();
      triggerTrain();
    }
  }

  function handleImportDataset(e: Event) {
    const target = e.target as HTMLInputElement;
    if (!target.files || target.files.length === 0) return;
    const file = target.files[0];
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        let importedData: Record<string, any>[] = [];
        let name = file.name.replace(/\.[^/.]+$/, ""); // strip extension

        if (file.name.endsWith('.json')) {
          importedData = JSON.parse(text);
          if (!Array.isArray(importedData)) {
            throw new Error($t('dt_err_json_must_be_array'));
          }
        } else {
          // Parse CSV
          const lines = text.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
          if (lines.length < 2) {
            throw new Error($t('dt_err_csv_min_rows'));
          }
          
          // Detect separator: comma, semicolon or tab
          const firstLine = lines[0];
          let separator = ',';
          if (firstLine.includes(';')) separator = ';';
          else if (firstLine.includes('\t')) separator = '\t';

          // Helper to split CSV row respecting quotes
          const parseCSVLine = (line: string) => {
            const result: string[] = [];
            let current = '';
            let inQuotes = false;
            for (let i = 0; i < line.length; i++) {
              const char = line[i];
              if (char === '"') {
                inQuotes = !inQuotes;
              } else if (char === separator && !inQuotes) {
                result.push(current.trim());
                current = '';
              } else {
                current += char;
              }
            }
            result.push(current.trim());
            return result.map(v => v.replace(/^"|"$/g, '')); // remove enclosing quotes
          };

          const headers = parseCSVLine(firstLine);
          for (let i = 1; i < lines.length; i++) {
            const values = parseCSVLine(lines[i]);
            const row: Record<string, any> = {};
            for (let j = 0; j < headers.length; j++) {
              const header = headers[j];
              let val: any = values[j] !== undefined ? values[j] : '';
              // Try to convert to number
              if (val !== '' && !isNaN(Number(val))) {
                val = Number(val);
              }
              row[header] = val;
            }
            importedData.push(row);
          }
        }

        if (importedData.length < 3) {
          throw new Error($t('dt_err_min_samples'));
        }

        // Extract features and target column
        // We will assume the last column is the Target (Label) column
        const allKeys = Object.keys(importedData[0]);
        if (allKeys.length < 2) {
          throw new Error($t('dt_err_min_features'));
        }
        const targetName = allKeys[allKeys.length - 1];
        const features = allKeys.slice(0, -1);

        // Infer feature types (numerical vs categorical)
        const featureTypes: Record<string, 'categorical' | 'numerical'> = {};
        for (const f of features) {
          let allNumerical = true;
          let hasValues = false;
          for (const row of importedData) {
            const val = row[f];
            if (val !== undefined && val !== null && String(val).trim() !== '') {
              hasValues = true;
              if (isNaN(Number(val))) {
                allNumerical = false;
                break;
              }
            }
          }
          featureTypes[f] = (hasValues && allNumerical) ? 'numerical' : 'categorical';
        }

        // Get unique target classes
        const targetClasses = Array.from(new Set(importedData.map(d => String(d[targetName]))));

        const newDataset: TabularDataset = {
          id: 'custom_' + Date.now(),
          name: name,
          features: features,
          featureTypes: featureTypes,
          targetName: targetName,
          targetClasses: targetClasses,
          data: importedData
        };

        saveCustomDataset(newDataset);
        selectedDatasetId = newDataset.id;
        loadAllDatasets();
        isEditingCustom = false;
        activeSubTab = 'train';
        initPredictorInputs();
        triggerTrain();
        alert($t('dataset_imported_success'));
      } catch (err: any) {
        alert($t('dt_import_error') + ": " + err.message);
      }
    };

    reader.readAsText(file);
    target.value = ''; // Reset file input
  }

  async function translateActiveDataset() {
    if (isTranslatingDataset) return;
    isTranslatingDataset = true;

    const targetLang = $locale === 'pt' ? 'pt-PT' : $locale;
    const textToTranslateSet = new Set<string>();
    
    // 1. Gather all headers and categorical cell values
    textToTranslateSet.add(activeDataset.targetName);
    for (const f of activeDataset.features) {
      textToTranslateSet.add(f);
    }
    
    for (const row of activeDataset.data) {
      for (const f of activeDataset.features) {
        if (activeDataset.featureTypes[f] === 'categorical') {
          const val = row[f];
          if (val !== undefined && val !== null && val !== '') {
            textToTranslateSet.add(String(val));
          }
        }
      }
      const targetVal = row[activeDataset.targetName];
      if (targetVal !== undefined && targetVal !== null && targetVal !== '') {
        textToTranslateSet.add(String(targetVal));
      }
    }

    const uniqueTexts = Array.from(textToTranslateSet);
    const translationMap: Record<string, string> = {};

    try {
      // 2. Translate a single unique string (returns the original on any soft failure)
      const translateOne = async (text: string): Promise<string> => {
        // Skip purely numeric/empty strings
        if (text.trim() === '' || (!isNaN(Number(text)) && !isNaN(parseFloat(text)))) {
          return text;
        }

        // Domain-specific custom overrides to ensure perfect context (e.g. Golf Play dataset)
        const lowerText = text.trim().toLowerCase();
        if (lowerText === 'play') return targetLang.startsWith('pt') ? 'Jogar' : targetLang.startsWith('fr') ? 'Jouer' : text;
        if (lowerText === 'outlook') return targetLang.startsWith('pt') ? 'Clima' : targetLang.startsWith('fr') ? 'Météo' : text;
        if (lowerText === 'windy') return targetLang.startsWith('pt') ? 'Vento' : targetLang.startsWith('fr') ? 'Vent' : text;

        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Google Translation API request failed (HTTP ${res.status})`);
        const result = await res.json();

        // Expected shape: [[["translated","original",...], ...], ...]
        const translated = result?.[0]?.[0]?.[0];
        if (typeof translated !== 'string' || translated.trim() === '') {
          // Malformed/empty response — keep the original rather than corrupting the cell
          return text;
        }
        return translated.trim();
      };

      // 2b. Run translations through a bounded worker pool. Firing one fetch per
      // unique value at once trips Google's rate limiting (HTTP 429) and CORS
      // throttling on larger datasets; a hard request error aborts the batch.
      const CONCURRENCY = 8;
      let cursor = 0;
      let aborted = false;
      const worker = async () => {
        while (cursor < uniqueTexts.length && !aborted) {
          const text = uniqueTexts[cursor++];
          try {
            translationMap[text] = await translateOne(text);
          } catch (err) {
            aborted = true;
            throw err;
          }
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, uniqueTexts.length) }, () => worker())
      );

      // 3. Map features, headers and categorical values
      const translatedFeatures = activeDataset.features.map(f => translationMap[f] || f);
      const translatedTargetName = translationMap[activeDataset.targetName] || activeDataset.targetName;
      
      const translatedFeatureTypes: Record<string, 'categorical' | 'numerical'> = {};
      for (const f of activeDataset.features) {
        const transF = translationMap[f] || f;
        translatedFeatureTypes[transF] = activeDataset.featureTypes[f];
      }

      const translatedTargetClasses = activeDataset.targetClasses.map(c => translationMap[c] || c);

      const translatedData = activeDataset.data.map(row => {
        const newRow: Record<string, any> = {};
        for (const f of activeDataset.features) {
          const transF = translationMap[f] || f;
          const val = row[f];
          if (activeDataset.featureTypes[f] === 'categorical' && typeof val === 'string') {
            newRow[transF] = translationMap[val] || val;
          } else {
            newRow[transF] = val;
          }
        }
        const targetVal = row[activeDataset.targetName];
        if (typeof targetVal === 'string') {
          newRow[translatedTargetName] = translationMap[targetVal] || targetVal;
        } else {
          newRow[translatedTargetName] = targetVal;
        }
        return newRow;
      });

      // 4. Create new translated dataset
      const translatedDataset: TabularDataset = {
        id: activeDataset.id.startsWith('custom_') ? activeDataset.id : 'custom_' + Date.now(),
        name: `${activeDataset.name.replace(/\s\([A-Z-]{2,5}\)$/, '')} (${$locale.toUpperCase()})`,
        features: translatedFeatures,
        featureTypes: translatedFeatureTypes,
        targetName: translatedTargetName,
        targetClasses: translatedTargetClasses,
        data: translatedData
      };

      // 5. Update Svelte states. Capture the previous id BEFORE reassigning
      // activeDataset, otherwise the lookup below compares against the new id.
      const prevId = activeDataset.id;
      activeDataset = translatedDataset;

      if (translatedDataset.id === prevId) {
        // In-place re-translation of an existing custom dataset.
        datasets = datasets.map(d => d.id === prevId ? translatedDataset : d);
      } else {
        // Built-in dataset translated into a new custom copy — keep the
        // original and append the translated version.
        datasets = [...datasets, translatedDataset];
      }

      if (translatedDataset.id.startsWith('custom_')) {
        saveCustomDataset(translatedDataset);
      }

      selectedDatasetId = translatedDataset.id;
      initPredictorInputs();
      triggerTrain();

    } catch (e: any) {
      console.error("Dataset translation failed:", e);
      alert($locale === 'pt' ? 'Erro na tradução: ' + e.message : $locale === 'fr' ? 'Erreur de traduction : ' + e.message : 'Translation error: ' + e.message);
    } finally {
      isTranslatingDataset = false;
    }
  }

  // Deterministic seeded shuffle to ensure Train/Test split is reproducible and stable
  function seededShuffle<T>(array: T[], seed: number): T[] {
    let m = array.length, t, i;
    const arr = [...array];
    let rand = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    while (m) {
      i = Math.floor(rand() * m--);
      t = arr[m];
      arr[m] = arr[i];
      arr[i] = t;
    }
    return arr;
  }

  // ─── DECISION TREE TRAINING ──────────────────────────────────
  function triggerTrain() {
    isPostPrunedApplied = false;
    postPrunedTree = null;

    // 1. Split Train and Test set deterministically
    const shuffled = seededShuffle(activeDataset.data, 12345);
    const splitIdx = Math.floor(shuffled.length * trainRatio);
    
    // Ensure train ratio yields valid subsets
    trainSet = shuffled.slice(0, Math.max(2, splitIdx));
    testSet = shuffled.slice(Math.max(2, splitIdx));

    // 2. Build Tree WITH Pre-pruning parameters
    trainedTree = buildTabularTree(
      trainSet,
      activeDataset.features,
      activeDataset.featureTypes,
      activeDataset.targetName,
      {
        criterion: splittingCriterion,
        maxDepth: maxDepth,
        minSamplesSplit: minSamplesSplit,
        minSamplesLeaf: minSamplesLeaf
      }
    );
    if (trainedTree) {
      unprunedStats = countNodes(trainedTree);
    }

    // 3. Build Full Unpruned Tree (Unlimited) to illustrate Overfitting
    unprunedTree = buildTabularTree(
      trainSet,
      activeDataset.features,
      activeDataset.featureTypes,
      activeDataset.targetName,
      {
        criterion: splittingCriterion,
        maxDepth: 10,
        minSamplesSplit: 2,
        minSamplesLeaf: 1
      }
    );

    // Calculate accuracies
    trainAccuracy = computeAccuracy(trainedTree, trainSet, activeDataset.targetName);
    testAccuracy = computeAccuracy(trainedTree, testSet, activeDataset.targetName);

    unprunedTrainAccuracy = computeAccuracy(unprunedTree, trainSet, activeDataset.targetName);
    unprunedTestAccuracy = computeAccuracy(unprunedTree, testSet, activeDataset.targetName);

    if (trainedTree) {
      featureImportance = computeFeatureImportance(trainedTree, activeDataset.features);
    }

    if (Object.keys(predictorInputs).length === 0) {
      initPredictorInputs();
    } else {
      runLivePrediction();
    }
  }

  function applyPostPruning() {
    if (!trainedTree) return;
    
    // We post-prune the pre-pruned tree based on validation/test set error
    postPrunedTree = postPruneTabularTree(
      // Create a fresh copy to avoid deep reference mutation of current tree
      JSON.parse(JSON.stringify(trainedTree)),
      trainSet,
      testSet,
      activeDataset.targetName
    );
    if (postPrunedTree) {
      prunedStats = countNodes(postPrunedTree);
    }

    isPostPrunedApplied = true;
    
    // Update accuracies based on pruned tree
    trainAccuracy = computeAccuracy(postPrunedTree, trainSet, activeDataset.targetName);
    testAccuracy = computeAccuracy(postPrunedTree, testSet, activeDataset.targetName);
    
    if (postPrunedTree) {
      featureImportance = computeFeatureImportance(postPrunedTree, activeDataset.features);
    }

    runLivePrediction();
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    copyFeedback = true;
    setTimeout(() => {
      copyFeedback = false;
    }, 2000);
  }

  // ─── PREDICTION SYSTEM ───────────────────────────────────────
  function runLivePrediction() {
    const treeToUse = isPostPrunedApplied && postPrunedTree ? postPrunedTree : trainedTree;
    if (!treeToUse) return;

    const { predictedClass, path } = predictTabular(treeToUse, predictorInputs);
    predictionResult = predictedClass;
    highlightPath = path;

    // Get leaf node confidence
    const finalLeaf = path[path.length - 1];
    if (finalLeaf && finalLeaf.type === 'leaf') {
      predictionConfidence = finalLeaf.confidence;
    }
  }

  function handlePredictorInput(f: string, val: any) {
    predictorInputs[f] = activeDataset.featureTypes[f] === 'numerical' ? Number(val) : val;
    predictorInputs = { ...predictorInputs };
    runLivePrediction();
  }

  function formatConditionsHtml(conditions: string[], lang: string): string {
    const andWord = lang === 'pt' ? ' <strong>e</strong> ' : lang === 'fr' ? ' <strong>et</strong> ' : ' <strong>and</strong> ';
    return conditions
      .map(cond => cond.replace(/"([^"]+)"/g, '<strong class="text-ink">"$1"</strong>'))
      .join(andWord);
  }
</script>
<div class="w-full max-w-[88rem] mx-auto px-5 sm:px-8 mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6 relative z-10">

  <!-- ═══ LEFT: data + live controls ═══════════════════════════ -->
  <div class="lg:col-span-5 flex flex-col gap-5">

    <!-- Intro -->
    <div class="bg-dt-wash rounded-2xl p-4 border border-dt/20">
      <div class="flex items-start gap-3">
        <div class="w-9 h-9 bg-dt/10 rounded-xl flex items-center justify-center text-dt shrink-0 mt-0.5">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275Z"/></svg>
        </div>
        <div class="flex flex-col gap-1">
          <h4 class="text-sm font-semibold text-ink">
            {$locale === 'pt' ? 'O que é uma Árvore de Decisão?' : $locale === 'fr' ? 'Qu\'est-ce qu\'un Arbre de Décision ?' : 'What is a Decision Tree?'}
          </h4>
          <p class="text-xs text-ink-muted leading-relaxed">
            {$locale === 'pt'
              ? 'Uma sequência de perguntas simples (ex: "Está a chover?") que leva a uma decisão. Mexe nos controlos e vê a árvore mudar ao lado, em tempo real.'
              : $locale === 'fr'
              ? 'Une suite de questions simples (ex : "Pleut-il ?") qui mène à une décision. Touche aux réglages et vois l\'arbre changer à côté, en temps réel.'
              : 'A sequence of simple questions (e.g. "Is it raining?") leading to a decision. Move the controls and watch the tree change beside you, in real time.'}
          </p>
        </div>
      </div>
    </div>

    <!-- Data -->
    <section class="bg-surface rounded-2xl border border-hairline/60 shadow-sm p-5 flex flex-col gap-3.5">
      <div class="flex items-center gap-2.5">
        <span class="w-6 h-6 rounded-full bg-dt text-white font-mono text-xs font-semibold flex items-center justify-center shrink-0">1</span>
        <h2 class="text-base text-ink">{$locale === 'pt' ? 'Os dados' : $locale === 'fr' ? 'Les données' : 'The data'}</h2>
      </div>

      {#if isEditingCustom}
        <div class="flex flex-col gap-3">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-semibold text-dt">{$t('dt_create_dataset_title')}</h3>
            <button on:click={() => isEditingCustom = false} class="text-xs text-ink-faint font-semibold hover:text-ink-muted cursor-pointer">{$t('dt_back_btn')}</button>
          </div>
          <div class="flex flex-col gap-1">
            <label for="ds-name-inp" class="text-xs font-semibold text-ink-faint">{$t('dt_dataset_name_label')}</label>
            <input id="ds-name-inp" type="text" bind:value={customDatasetName} class="bg-sunken border border-hairline rounded-lg px-2.5 py-1.5 text-xs text-ink-muted outline-none focus:border-dt" />
          </div>
          <div class="flex flex-col gap-1">
            <label for="ds-target-inp" class="text-xs font-semibold text-ink-faint">{$t('dt_target_column_label')}</label>
            <input id="ds-target-inp" type="text" value={customTargetName} on:input={(e) => updateTargetName((e.target as HTMLInputElement).value)} class="bg-sunken border border-hairline rounded-lg px-2.5 py-1.5 text-xs text-ink-muted outline-none font-bold focus:border-dt" />
          </div>
          <div class="flex items-center justify-between text-xs font-bold text-ink-muted mt-1">
            <span>{$t('dt_features_label')}</span>
            <button on:click={addFeatureColumn} class="text-brand hover:text-brand-ink cursor-pointer">{$t('dt_add_column_btn')}</button>
          </div>
          <div class="flex flex-col gap-2 max-h-[150px] overflow-y-auto pr-1">
            {#each customFeatures as f, idx}
              <div class="flex items-center gap-2 bg-sunken border border-hairline p-2 rounded-lg">
                <input type="text" value={f} on:input={(e) => updateFeatureName(idx, (e.target as HTMLInputElement).value)} class="bg-surface border border-hairline rounded px-1.5 py-0.5 text-[11px] font-semibold text-ink-muted outline-none flex-1" />
                <select value={customFeatureTypes[f]} on:change={(e) => updateFeatureType(f, (e.target as HTMLSelectElement).value as 'categorical' | 'numerical')} class="bg-surface border border-hairline rounded px-1.5 py-0.5 text-[10px] font-bold text-ink-muted">
                  <option value="categorical">{$t('dt_categorical_type')}</option>
                  <option value="numerical">{$t('dt_numerical_type')}</option>
                </select>
                <button on:click={() => removeFeatureColumn(f)} class="text-xs text-danger hover:text-danger-ink px-1 cursor-pointer">×</button>
              </div>
            {/each}
          </div>
          <div class="flex items-center justify-between text-xs font-bold text-ink-muted mt-1 border-t border-hairline pt-2">
            <span>{$t('dt_rows_samples_label')} ({customData.length})</span>
            <button on:click={addRow} class="text-brand hover:text-brand-ink cursor-pointer">{$t('dt_add_row_btn')}</button>
          </div>
          <div class="overflow-x-auto border border-hairline rounded-lg max-h-[220px] overflow-y-auto">
            <table class="w-full text-left border-collapse text-[11px]">
              <thead>
                <tr class="bg-sunken border-b border-hairline text-ink-faint">
                  <th class="p-2 border-r border-hairline">#</th>
                  {#each customFeatures as f}<th class="p-2 border-r border-hairline">{f}</th>{/each}
                  <th class="p-2 border-r border-hairline text-dt font-bold">{customTargetName}</th>
                  <th class="p-2 text-center"></th>
                </tr>
              </thead>
              <tbody>
                {#each customData as row, rIdx}
                  <tr class="border-b border-hairline/50 hover:bg-sunken/50">
                    <td class="p-2 text-ink-faint font-mono text-[10px] border-r border-hairline/50 bg-sunken/20">{rIdx + 1}</td>
                    {#each customFeatures as f}
                      <td class="p-1 border-r border-hairline/50">
                        {#if customFeatureTypes[f] === 'numerical'}
                          <input type="number" bind:value={row[f]} on:input={() => customData = customData} class="w-full bg-transparent border-0 outline-none p-1" />
                        {:else}
                          <input type="text" bind:value={row[f]} on:input={() => customData = customData} class="w-full bg-transparent border-0 outline-none p-1" />
                        {/if}
                      </td>
                    {/each}
                    <td class="p-1 border-r border-hairline/50 font-bold">
                      <input type="text" bind:value={row[customTargetName]} on:input={() => customData = customData} class="w-full bg-transparent border-0 outline-none p-1 text-dt font-bold" />
                    </td>
                    <td class="p-1 text-center">
                      <button on:click={() => deleteRow(rIdx)} class="text-danger hover:text-danger-ink font-bold font-mono">×</button>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
          <button on:click={saveDataset} class="w-full bg-dt text-white font-bold py-2.5 rounded-xl hover:bg-dt-ink transition-colors shadow-sm cursor-pointer text-xs">{$t('dt_save_dataset_btn')}</button>
        </div>
      {:else}
        <div class="flex flex-col gap-1.5">
          <label for="ds-select" class="text-xs font-semibold text-ink-faint">{$t('dt_active_dataset_label')}</label>
          <select id="ds-select" bind:value={selectedDatasetId} on:change={handleDatasetChange} class="w-full bg-sunken border border-hairline rounded-xl px-3.5 py-2.5 text-sm font-semibold text-ink-muted outline-none focus:border-dt transition-all cursor-pointer">
            {#each datasets as ds}
              <option value={ds.id}>{ds.name} {ds.id.startsWith('custom_') ? $t('dt_localstorage_label') : $t('dt_default_label')}</option>
            {/each}
          </select>
        </div>

        <div class="flex items-center gap-2 bg-sunken rounded-xl p-2.5 border border-hairline text-xs text-ink-muted leading-snug">
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" class="text-dt shrink-0" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>
          <span><strong class="text-ink">{activeDataset.data.length}</strong> {$t('dt_dataset_samples')} · <strong class="text-ink">{activeDataset.features.length}</strong> {$t('dt_dataset_features')}</span>
        </div>

        <details class="group">
          <summary class="flex items-center gap-1.5 text-xs font-semibold text-ink-muted cursor-pointer select-none list-none hover:text-ink py-1">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="transition-transform group-open:rotate-90"><polyline points="9 18 15 12 9 6"/></svg>
            {$locale === 'pt' ? `Ver os dados (${activeDataset.data.length})` : $locale === 'fr' ? `Voir les données (${activeDataset.data.length})` : `See the data (${activeDataset.data.length})`}
          </summary>
          <div class="overflow-x-auto border border-hairline rounded-xl max-h-[300px] mt-3">
            <table class="w-full text-left border-collapse text-xs">
              <thead>
                <tr class="bg-sunken border-b border-hairline text-ink-faint">
                  <th class="p-2.5 font-bold">#</th>
                  {#each activeDataset.features as f}<th class="p-2.5 font-bold">{f}</th>{/each}
                  <th class="p-2.5 font-bold text-dt bg-dt-wash/50">{activeDataset.targetName}</th>
                </tr>
              </thead>
              <tbody>
                {#each activeDataset.data as row, idx}
                  <tr class="border-b border-hairline/50 hover:bg-sunken/50">
                    <td class="p-2.5 text-ink-faint font-mono text-[10px]">{idx + 1}</td>
                    {#each activeDataset.features as f}<td class="p-2.5 text-ink-muted font-medium">{row[f]}</td>{/each}
                    <td class="p-2.5 font-bold text-dt bg-dt-wash/10">{row[activeDataset.targetName]}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </details>

        <div class="flex flex-wrap items-center gap-2 border-t border-hairline/60 pt-3">
          <label class="text-xs font-semibold text-ink-muted bg-sunken hover:bg-raised hover:text-ink px-2.5 py-1.5 rounded-lg border border-hairline transition-colors cursor-pointer inline-flex items-center gap-1.5">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            {$t('dt_import_btn')}
            <input type="file" accept=".csv,.json" on:change={handleImportDataset} class="hidden" />
          </label>
          <button on:click={openCustomDatasetBuilder} class="text-xs font-semibold text-ink-muted bg-sunken hover:bg-raised hover:text-ink px-2.5 py-1.5 rounded-lg border border-hairline transition-colors cursor-pointer inline-flex items-center gap-1.5">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
            {$locale === 'pt' ? 'Criar' : $locale === 'fr' ? 'Créer' : 'Create'}
          </button>
          <button on:click={translateActiveDataset} disabled={isTranslatingDataset} class="text-xs font-semibold text-ink-muted bg-sunken hover:bg-raised hover:text-ink px-2.5 py-1.5 rounded-lg border border-hairline transition-colors cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed">
            {#if isTranslatingDataset}
              <svg class="animate-spin h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg>
              {$locale === 'pt' ? 'A traduzir…' : $locale === 'fr' ? 'Traduction…' : 'Translating…'}
            {:else}
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><path d="m5 8 6 6M4 14l6-6M2 5h12M7 2h1M22 22l-5-10-5 10M14 18h6"/></svg>
              {$locale === 'pt' ? 'Traduzir' : $locale === 'fr' ? 'Traduire' : 'Translate'}
            {/if}
          </button>
          {#if selectedDatasetId.startsWith('custom_')}
            <button on:click={() => handleDeleteCustom(selectedDatasetId)} class="text-xs font-semibold text-danger bg-danger-wash/60 hover:bg-danger-wash px-2.5 py-1.5 rounded-lg border border-danger/30 transition-colors cursor-pointer ml-auto">{$t('dt_delete_custom_btn')}</button>
          {/if}
        </div>
      {/if}
    </section>

    <!-- Live controls -->
    <section class="bg-surface rounded-2xl border border-hairline/60 shadow-sm p-5 flex flex-col gap-5">
      <div class="flex items-center gap-2.5">
        <span class="w-6 h-6 rounded-full bg-dt text-white font-mono text-xs font-semibold flex items-center justify-center shrink-0">2</span>
        <div class="leading-tight">
          <h2 class="text-base text-ink">{$locale === 'pt' ? 'Ajusta a árvore' : $locale === 'fr' ? 'Ajuste l\'arbre' : 'Adjust the tree'}</h2>
          <p class="text-[11px] text-ink-faint">{$locale === 'pt' ? 'Move e a árvore atualiza-se ao vivo →' : $locale === 'fr' ? 'Bouge et l\'arbre se met à jour en direct →' : 'Move it and the tree updates live →'}</p>
        </div>
      </div>

      <!-- Train/test split -->
      <div class="flex flex-col gap-1.5">
        <div class="flex items-center justify-between text-xs">
          <span class="font-semibold text-ink-muted">{$t('dt_split_ratio_label')}</span>
          <span class="font-bold text-dt bg-dt-wash px-2 py-0.5 rounded font-mono">{(trainRatio * 100).toFixed(0)}% / {((1 - trainRatio) * 100).toFixed(0)}%</span>
        </div>
        <input type="range" min="0.5" max="0.9" step="0.05" bind:value={trainRatio} on:input={triggerTrain} class="w-full accent-[var(--color-dt)] cursor-pointer" />
        <p class="text-[10px] text-ink-faint leading-snug">{$locale === 'pt' ? 'Quantos exemplos servem para treinar (o resto testa).' : $locale === 'fr' ? 'Combien d\'exemples servent à entraîner (le reste teste).' : 'How many examples are used to train (the rest test).'}</p>
      </div>

      <!-- Max depth -->
      <div class="flex flex-col gap-1.5">
        <div class="flex items-center justify-between text-xs">
          <span class="font-semibold text-ink-muted">{$t('dt_max_depth_label')}</span>
          <span class="font-bold text-dt font-mono">{maxDepth}</span>
        </div>
        <input type="range" min="1" max="10" step="1" bind:value={maxDepth} on:input={triggerTrain} class="w-full accent-[var(--color-dt)] cursor-pointer" />
        <p class="text-[10px] text-ink-faint leading-snug">{$locale === 'pt' ? 'Até quantas perguntas seguidas a árvore pode fazer.' : $locale === 'fr' ? 'Combien de questions d\'affilée l\'arbre peut poser.' : 'How many questions in a row the tree may ask.'}</p>
      </div>

      <!-- Criterion -->
      <div id="dt-criterion" class="flex flex-col gap-1.5">
        <span class="text-xs font-semibold text-ink-muted">{$t('dt_split_criterion_label')}</span>
        <div class="grid grid-cols-2 gap-2">
          <button on:click={() => { splittingCriterion = 'gini'; triggerTrain(); }} class="py-2 text-xs font-bold rounded-xl border transition-all cursor-pointer {splittingCriterion === 'gini' ? 'bg-dt border-dt text-white shadow-sm' : 'bg-sunken border-hairline text-ink-muted hover:bg-raised'}">{$t('dt_gini_impurity')}</button>
          <button on:click={() => { splittingCriterion = 'entropy'; triggerTrain(); }} class="py-2 text-xs font-bold rounded-xl border transition-all cursor-pointer {splittingCriterion === 'entropy' ? 'bg-dt border-dt text-white shadow-sm' : 'bg-sunken border-hairline text-ink-muted hover:bg-raised'}">{$t('dt_entropy_gain')}</button>
        </div>
        <div class="p-2.5 bg-sunken rounded-xl border border-hairline text-[11px] text-ink-faint leading-normal font-medium">
          {#if splittingCriterion === 'gini'}
            <strong class="text-ink-muted block mb-0.5">{$t('dt_gini_impurity')}:</strong>{$t('dt_gini_desc')}
          {:else}
            <strong class="text-ink-muted block mb-0.5">{$t('dt_entropy_gain')}:</strong>{$t('dt_entropy_desc')}
          {/if}
        </div>
      </div>

      <!-- More tuning -->
      <details id="dt-pruning" class="group border-t border-hairline/60 pt-3">
        <summary class="flex items-center gap-1.5 text-xs font-semibold text-ink-muted cursor-pointer select-none list-none hover:text-ink py-1">
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="transition-transform group-open:rotate-90"><polyline points="9 18 15 12 9 6"/></svg>
          {$t('dt_pre_pruning_params')}
        </summary>
        <div class="flex flex-col gap-4 mt-3">
          <div class="flex flex-col gap-1.5">
            <div class="flex items-center justify-between text-xs">
              <span class="font-semibold text-ink-muted">{$t('dt_min_samples_split')}</span>
              <span class="font-bold text-dt font-mono">{minSamplesSplit}</span>
            </div>
            <input type="range" min="2" max="20" step="1" bind:value={minSamplesSplit} on:input={triggerTrain} class="w-full accent-[var(--color-dt)] cursor-pointer" />
          </div>
          <div class="flex flex-col gap-1.5">
            <div class="flex items-center justify-between text-xs">
              <span class="font-semibold text-ink-muted">{$t('dt_min_samples_leaf')}</span>
              <span class="font-bold text-dt font-mono">{minSamplesLeaf}</span>
            </div>
            <input type="range" min="1" max="10" step="1" bind:value={minSamplesLeaf} on:input={triggerTrain} class="w-full accent-[var(--color-dt)] cursor-pointer" />
          </div>
        </div>
      </details>
    </section>
  </div>

  <!-- ═══ RIGHT: tree (sticky) + prediction ════════════════════ -->
  <div class="lg:col-span-7 flex flex-col gap-5 min-w-0">

    <div class="flex flex-col gap-4">
      <!-- Compact metrics -->
      <div id="dt-metrics" class="bg-surface rounded-2xl border border-hairline/60 shadow-sm px-5 py-3.5 flex flex-wrap items-center gap-x-5 gap-y-2">
        <div class="flex items-baseline gap-1.5">
          <span class="text-2xl font-semibold text-success font-mono nums">{(testAccuracy * 100).toFixed(0)}%</span>
          <span class="text-xs text-ink-faint leading-tight">{$locale === 'pt' ? 'em exemplos novos' : $locale === 'fr' ? 'sur exemples nouveaux' : 'on new examples'}</span>
        </div>
        <div class="h-7 w-px bg-hairline"></div>
        <span class="text-xs text-ink-muted">{$t('dt_train_accuracy_label')} <strong class="font-mono text-ink">{(trainAccuracy * 100).toFixed(0)}%</strong></span>
        {#if trainedTree}
          <span class="text-xs text-ink-muted font-mono nums hidden sm:inline">· {countNodes(trainedTree).splits} {$t('dt_stats_splits')} · {countNodes(trainedTree).leaves} {$t('dt_stats_leaves')} · {$t('dt_depth_label')} {countNodes(trainedTree).maxDepth}</span>
        {/if}
        {#if !isPostPrunedApplied}
          <button on:click={applyPostPruning} title={$t('dt_post_pruning_desc')} class="ml-auto text-[11px] font-semibold text-dt bg-dt-wash border border-dt/25 hover:bg-dt hover:text-white px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer">{$t('dt_run_post_pruning_btn')}</button>
        {:else}
          <button on:click={triggerTrain} class="ml-auto text-[11px] font-semibold text-ink-muted bg-sunken border border-hairline hover:bg-raised px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer">{$t('dt_remove_pruning_btn')}</button>
        {/if}
      </div>

      <!-- Overfitting alert -->
      {#if unprunedTrainAccuracy === 1 && unprunedTestAccuracy < 0.75}
        <div class="bg-danger-wash rounded-xl px-4 py-3 border border-danger/30 flex items-start gap-2.5">
          <span class="w-2 h-2 rounded-full bg-danger animate-pulse mt-1.5 shrink-0"></span>
          <p class="text-xs text-danger-ink leading-relaxed">
            <strong class="text-danger">{$t('dt_overfitting_alert_title')}:</strong>
            {$locale === 'pt'
              ? `decorou o treino (100%) mas só acerta ${(unprunedTestAccuracy * 100).toFixed(0)}% em exemplos novos. Tenta reduzir a profundidade ou usar a poda.`
              : $locale === 'fr'
              ? `il a mémorisé l'entraînement (100%) mais ne réussit que ${(unprunedTestAccuracy * 100).toFixed(0)}% sur de nouveaux exemples. Réduis la profondeur ou utilise l'élagage.`
              : `it memorized training (100%) but only gets ${(unprunedTestAccuracy * 100).toFixed(0)}% on new examples. Try reducing depth or using pruning.`}
          </p>
        </div>
      {/if}

      <!-- Tree -->
      {#if trainedTree}
        {@const activeTree = isPostPrunedApplied && postPrunedTree ? postPrunedTree : trainedTree}
        <div id="dt-viz" class="bg-surface rounded-2xl border border-hairline/60 shadow-sm p-5 flex flex-col gap-4 min-w-0">
          <div class="flex items-center bg-sunken p-0.5 rounded-lg border border-hairline gap-0.5 self-start overflow-x-auto max-w-full whitespace-nowrap">
            <button on:click={() => codeExportTab = 'graph'} class="px-2.5 py-1 text-[11px] font-medium rounded-md cursor-pointer transition-all {codeExportTab === 'graph' ? 'bg-surface text-dt shadow-xs' : 'text-ink-faint hover:text-ink-muted'}">{$t('dt_view_graph')}</button>
            <button on:click={() => codeExportTab = 'rules'} class="px-2.5 py-1 text-[11px] font-medium rounded-md cursor-pointer transition-all {codeExportTab === 'rules' ? 'bg-surface text-dt shadow-xs' : 'text-ink-faint hover:text-ink-muted'}">{$t('dt_rules_tab')}</button>
            <button on:click={() => codeExportTab = 'python'} class="px-2.5 py-1 text-[11px] font-mono font-medium rounded-md cursor-pointer transition-all {codeExportTab === 'python' ? 'bg-surface text-dt shadow-xs' : 'text-ink-faint hover:text-ink-muted'}">{$t('dt_export_python')}</button>
            <button on:click={() => codeExportTab = 'js'} class="px-2.5 py-1 text-[11px] font-mono font-medium rounded-md cursor-pointer transition-all {codeExportTab === 'js' ? 'bg-surface text-dt shadow-xs' : 'text-ink-faint hover:text-ink-muted'}">{$t('dt_export_js')}</button>
          </div>

          {#if codeExportTab === 'graph'}
            <div class="relative overflow-hidden">
              <TabularDecisionTreeViz tree={activeTree} targetClasses={activeDataset.targetClasses} highlightPath={highlightPath} />
            </div>
          {:else if codeExportTab === 'rules'}
            {@const naturalRules = extractNaturalRules(activeTree, $locale)}
            <div class="flex flex-col gap-3 max-h-[520px] overflow-y-auto pr-1">
              <p class="text-xs text-ink-faint leading-relaxed">
                {$locale === 'pt'
                  ? `Cada regra é um caminho da árvore, escrito por palavras. A árvore lê as condições de cima para baixo e prevê ${activeDataset.targetName}.`
                  : $locale === 'fr'
                    ? `Chaque règle est un chemin de l'arbre, écrit en toutes lettres. L'arbre lit les conditions de haut en bas et prédit ${activeDataset.targetName}.`
                    : `Each rule is one path through the tree, written out in words. The tree reads the conditions top to bottom and predicts ${activeDataset.targetName}.`}
              </p>
              {#each naturalRules as rule, i}
                <div class="bg-surface border border-hairline rounded-xl p-4 flex gap-3.5">
                  <span class="font-mono text-[11px] font-semibold text-dt bg-dt-wash border border-dt/20 rounded-md px-2 py-1 h-fit shrink-0">R{i + 1}</span>
                  <div class="flex flex-col gap-2 min-w-0">
                    <p class="text-sm text-ink leading-relaxed">
                      {#if rule.conditions.length === 0}
                        <span class="text-ink-muted">{ruleAlwaysLead}</span><span class="font-semibold text-ink">"{rule.predictedClass}"</span>.
                      {:else}
                        <span class="text-ink-muted">{ruleIfWord}</span>{#each rule.conditions as cond, ci}<span class="font-medium text-ink">{cond}</span>{#if ci < rule.conditions.length - 1}<span class="text-ink-muted">{ci === rule.conditions.length - 2 ? ` ${ruleAndWord} ` : ', '}</span>{/if}{/each}<span class="text-ink-muted">{ruleThenLead}</span><span class="font-semibold text-ink">"{rule.predictedClass}"</span>.
                      {/if}
                    </p>
                    <p class="text-[11px] text-ink-faint font-mono nums">{rule.confidence}% {ruleConfidenceWord} · {rule.samples} {rule.samples === 1 ? ruleExampleWord : ruleExamplesWord}</p>
                  </div>
                </div>
              {/each}
            </div>
          {:else if codeExportTab === 'python'}
            {@const pythonCode = getPythonBoilerplate(activeTree, activeDataset.targetName, $locale)}
            <div class="flex flex-col gap-3">
              <div class="flex justify-between items-center bg-sunken border border-hairline/50 rounded-xl px-4 py-2.5 text-xs text-ink-muted">
                <span class="font-semibold">{$t('dt_code_exporter_desc')}</span>
                <button on:click={() => copyToClipboard(pythonCode)} class="bg-dt hover:bg-dt-ink text-white font-bold px-3 py-1.5 rounded-lg transition-colors cursor-pointer text-[10px] flex items-center gap-1 shadow-xs shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                  {copyFeedback ? $t('dt_copied_success') : $t('dt_copy_btn')}
                </button>
              </div>
              <div class="bg-ink rounded-2xl p-6 font-mono text-xs text-white/85 overflow-x-auto leading-relaxed shadow-inner max-h-[500px] border border-line/40"><pre class="whitespace-pre">{pythonCode}</pre></div>
            </div>
          {:else if codeExportTab === 'js'}
            {@const jsCode = getJsBoilerplate(activeTree, activeDataset.targetName, $locale)}
            <div class="flex flex-col gap-3">
              <div class="flex justify-between items-center bg-sunken border border-hairline/50 rounded-xl px-4 py-2.5 text-xs text-ink-muted">
                <span class="font-semibold">{$t('dt_code_exporter_desc')}</span>
                <button on:click={() => copyToClipboard(jsCode)} class="bg-dt hover:bg-dt-ink text-white font-bold px-3 py-1.5 rounded-lg transition-colors cursor-pointer text-[10px] flex items-center gap-1 shadow-xs shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                  {copyFeedback ? $t('dt_copied_success') : $t('dt_copy_btn')}
                </button>
              </div>
              <div class="bg-ink rounded-2xl p-6 font-mono text-xs text-white/85 overflow-x-auto leading-relaxed shadow-inner max-h-[500px] border border-line/40"><pre class="whitespace-pre">{jsCode}</pre></div>
            </div>
          {/if}
        </div>
      {/if}
    </div>

    <!-- Prediction -->
    {#if trainedTree}
      <section id="dt-predictor" class="bg-surface rounded-2xl border border-hairline/60 shadow-sm p-5 flex flex-col gap-4">
        <div class="flex items-center gap-2.5">
          <span class="w-6 h-6 rounded-full bg-dt text-white font-mono text-xs font-semibold flex items-center justify-center shrink-0">3</span>
          <div class="leading-tight">
            <h2 class="text-base text-ink">{$locale === 'pt' ? 'Experimenta uma previsão' : $locale === 'fr' ? 'Essaie une prédiction' : 'Try a prediction'}</h2>
            <p class="text-[11px] text-ink-faint">{$t('dt_live_prediction_desc')}</p>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {#each activeDataset.features as f}
            <div class="flex flex-col gap-1.5">
              <div class="flex items-center justify-between text-xs font-semibold">
                <span class="text-ink-muted">{f}:</span>
                <span class="text-ink font-bold font-mono">{predictorInputs[f] !== undefined ? predictorInputs[f] : ''}</span>
              </div>
              {#if activeDataset.featureTypes[f] === 'numerical'}
                {@const minVal = Math.min(...activeDataset.data.map(d => Number(d[f])))}
                {@const maxVal = Math.max(...activeDataset.data.map(d => Number(d[f])))}
                <div class="flex items-center gap-3">
                  <span class="text-[10px] text-ink-faint font-bold font-mono">{minVal}</span>
                  <input type="range" min={minVal} max={maxVal} step={Math.round((maxVal - minVal) / 20 * 100) / 100 || 0.1} value={predictorInputs[f] || minVal} on:input={(e) => handlePredictorInput(f, (e.target as HTMLInputElement).value)} class="flex-1 accent-[var(--color-dt)] cursor-pointer h-1 bg-sunken rounded-lg appearance-none" />
                  <span class="text-[10px] text-ink-faint font-bold font-mono">{maxVal}</span>
                </div>
              {:else}
                {@const uniqueCats = Array.from(new Set(activeDataset.data.map(d => String(d[f]))))}
                <select value={predictorInputs[f] || ''} on:change={(e) => handlePredictorInput(f, (e.target as HTMLSelectElement).value)} class="bg-sunken border border-hairline rounded-xl px-3 py-2 text-xs font-semibold text-ink-muted outline-none cursor-pointer focus:border-dt">
                  {#each uniqueCats as cat}<option value={cat}>{cat}</option>{/each}
                </select>
              {/if}
            </div>
          {/each}
        </div>

        <div class="bg-dt-wash border border-dt/30 rounded-2xl p-4 flex items-center justify-between">
          <div class="flex flex-col">
            <span class="text-[10px] font-semibold text-dt uppercase tracking-wider">{$t('dt_prediction_result_label')}</span>
            <span class="text-base font-semibold text-ink mt-0.5">{predictionResult || $t('dt_prediction_none')}</span>
          </div>
          <div class="flex flex-col text-right">
            <span class="text-[10px] font-semibold text-ink-faint uppercase tracking-wider">{$t('dt_leaf_confidence_label')}</span>
            <span class="text-base font-semibold text-dt mt-0.5 font-mono">{predictionConfidence}%</span>
          </div>
        </div>

        {#if predictionResult}
          <div class="bg-sunken border border-hairline/60 rounded-2xl p-5 flex flex-col gap-2.5">
            <h4 class="text-sm font-semibold text-ink flex items-center gap-1.5">
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-dt"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>
              {$locale === 'pt' ? 'Porquê?' : $locale === 'fr' ? 'Pourquoi ?' : 'Why?'}
            </h4>
            {#if whyPath.length > 0}
              <p class="text-sm text-ink leading-relaxed">
                {$locale === 'pt' ? 'A previsão é ' : $locale === 'fr' ? 'La prédiction est ' : 'The prediction is '}<strong class="font-semibold">"{predictionResult}"</strong>{$locale === 'pt' ? ' porque ' : $locale === 'fr' ? ' parce que ' : ' because '}{#each whyPath as cond, i}<span class="font-medium">{cond}</span>{#if i < whyPath.length - 1}<span class="text-ink-muted">{i === whyPath.length - 2 ? ` ${ruleAndWord} ` : ', '}</span>{/if}{/each}.
              </p>
              <p class="text-xs text-ink-muted leading-relaxed border-t border-hairline/60 pt-2.5">
                {$locale === 'pt'
                  ? `Seguindo estas condições, a árvore chega a um grupo de exemplos onde ${predictionConfidence}% são "${predictionResult}".`
                  : $locale === 'fr'
                    ? `En suivant ces conditions, l'arbre atteint un groupe d'exemples où ${predictionConfidence}% sont "${predictionResult}".`
                    : `Following these conditions, the tree reaches a group of examples where ${predictionConfidence}% are "${predictionResult}".`}
              </p>
            {:else}
              <p class="text-sm text-ink leading-relaxed">
                {$locale === 'pt'
                  ? `A árvore prevê sempre "${predictionResult}" — não há condições a verificar.`
                  : $locale === 'fr'
                    ? `L'arbre prédit toujours "${predictionResult}" — il n'y a aucune condition à vérifier.`
                    : `The tree always predicts "${predictionResult}" — there are no conditions to check.`}
              </p>
            {/if}
          </div>
        {/if}

        {#if Object.keys(featureImportance).length > 0}
          <details class="group border-t border-hairline/60 pt-3">
            <summary class="flex items-center gap-1.5 text-xs font-semibold text-ink-muted cursor-pointer select-none list-none hover:text-ink py-1">
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="transition-transform group-open:rotate-90"><polyline points="9 18 15 12 9 6"/></svg>
              {$t('dt_feature_importance')}
            </summary>
            <div class="flex flex-col gap-3 mt-3">
              <p class="text-[11px] text-ink-faint leading-relaxed">{$t('dt_feature_importance_desc')}</p>
              {#each Object.entries(featureImportance).sort((a, b) => b[1] - a[1]) as [feat, val]}
                {@const pct = Math.round(val * 100)}
                <div class="flex flex-col gap-1">
                  <div class="flex justify-between items-center text-xs font-bold">
                    <span class="text-ink-muted font-mono">{feat}</span>
                    <span class="text-dt">{pct}%</span>
                  </div>
                  <div class="w-full h-2 bg-sunken rounded-full overflow-hidden border border-hairline/30">
                    <div class="h-full bg-dt rounded-full transition-all duration-500" style="width: {pct}%"></div>
                  </div>
                </div>
              {/each}
            </div>
          </details>
        {/if}
      </section>
    {/if}
  </div>
</div>
