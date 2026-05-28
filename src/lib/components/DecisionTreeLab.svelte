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
    exportTreeToRulesText,
    simplifyPathRules
  } from '../ml/tabularDecisionTree';
  import TabularDecisionTreeViz from './TabularDecisionTreeViz.svelte';

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

  let trainAccuracy = 0;
  let testAccuracy = 0;
  let unprunedTrainAccuracy = 0;
  let unprunedTestAccuracy = 0;

  // Predictor state (manually populated inputs for real-time predictions)
  let predictorInputs: Record<string, any> = {};
  let predictionResult = '';
  let predictionConfidence = 0;
  let highlightPath: TabularTreeNode[] = [];
  let showTreeTextMode = false;
  let simplifiedRulesPath: string[] = [];
  let isTranslatingDataset = false;

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
          for (const row of importedData) {
            const val = row[f];
            if (val !== undefined && val !== null && val !== '') {
              if (isNaN(Number(val))) {
                allNumerical = false;
                break;
              }
            }
          }
          featureTypes[f] = allNumerical ? 'numerical' : 'categorical';
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

    isPostPrunedApplied = true;
    
    // Update accuracies based on pruned tree
    trainAccuracy = computeAccuracy(postPrunedTree, trainSet, activeDataset.targetName);
    testAccuracy = computeAccuracy(postPrunedTree, testSet, activeDataset.targetName);
    
    runLivePrediction();
  }

  // ─── PREDICTION SYSTEM ───────────────────────────────────────
  function runLivePrediction() {
    const treeToUse = isPostPrunedApplied && postPrunedTree ? postPrunedTree : trainedTree;
    if (!treeToUse) return;

    const { predictedClass, path } = predictTabular(treeToUse, predictorInputs);
    predictionResult = predictedClass;
    highlightPath = path;
    simplifiedRulesPath = simplifyPathRules(path, $t);

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
</script>

<div class="w-full max-w-[85rem] mx-auto px-8 mt-6 grid grid-cols-1 lg:grid-cols-12 gap-8 relative z-10">
  
  <!-- LEFT PANEL: DATASETS & CONFIGURATIONS -->
  <section class="lg:col-span-4 flex flex-col gap-6">

    <!-- Dataset Selector Card -->
    <div class="bg-white/80 backdrop-blur-md rounded-2xl p-6 border border-zinc-200/50 shadow-sm flex flex-col gap-4">
      <div class="flex items-center justify-between gap-4">
        <h3 class="text-sm font-black text-zinc-950 uppercase tracking-wider leading-snug">{$t('dt_step_select_dataset')}</h3>
        <div class="flex items-center gap-1.5 shrink-0">
          <!-- Upload Button -->
          <label 
            class="text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 hover:text-indigo-700 px-3 py-1.5 rounded-xl border border-indigo-100 transition-all cursor-pointer inline-flex items-center justify-center gap-1.5 whitespace-nowrap shadow-xs"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            {$t('dt_import_btn')}
            <input
              type="file"
              accept=".csv,.json"
              on:change={handleImportDataset}
              class="hidden"
            />
          </label>
        </div>
      </div>

      <div class="flex flex-col gap-1.5">
        <label for="ds-select" class="text-xs font-semibold text-zinc-500">{$t('dt_active_dataset_label')}</label>
        <select
          id="ds-select"
          bind:value={selectedDatasetId}
          on:change={handleDatasetChange}
          class="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-zinc-800 outline-none focus:border-amber-500 transition-all cursor-pointer"
        >
          {#each datasets as ds}
            <option value={ds.id}>
              {ds.name} {ds.id.startsWith('custom_') ? $t('dt_localstorage_label') : $t('dt_default_label')}
            </option>
          {/each}
        </select>
      </div>

      {#if selectedDatasetId.startsWith('custom_')}
        <button
          on:click={() => handleDeleteCustom(selectedDatasetId)}
          class="w-full text-xs font-bold text-red-600 hover:bg-red-50 py-2 rounded-xl border border-red-100/50 transition-colors cursor-pointer"
        >
          {$t('dt_delete_custom_btn')}
        </button>
      {/if}
      
      <div class="flex items-center gap-1.5 bg-zinc-50 rounded-xl p-3 border border-zinc-100 text-[11px] text-zinc-500 leading-snug">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="text-amber-500 shrink-0"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>
        <span>
          {$t('dt_dataset_contains')} <strong>{activeDataset.data.length} {$t('dt_dataset_samples')}</strong> {$t('dt_dataset_and')} <strong>{activeDataset.features.length} {$t('dt_dataset_features')}</strong>.
        </span>
      </div>

      <!-- Translate Dataset Button (Google Translate API) -->
      <button
        on:click={translateActiveDataset}
        disabled={isTranslatingDataset}
        class="w-full text-xs font-bold bg-indigo-50 border border-indigo-100 text-indigo-600 hover:bg-indigo-100 py-2.5 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {#if isTranslatingDataset}
          <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg>
          {$locale === 'pt' ? 'A traduzir com o Google...' : $locale === 'fr' ? 'Traduction avec Google...' : 'Translating with Google...'}
        {:else}
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m5 8 6 6M4 14l6-6M2 5h12M7 2h1M22 22l-5-10-5 10M14 18h6"/></svg>
          {$locale === 'pt' ? 'Traduzir Dataset (Google)' : $locale === 'fr' ? 'Traduire le Dataset (Google)' : 'Translate Dataset (Google)'}
        {/if}
      </button>
    </div>

    <!-- Mode Subtabs Switcher -->
    <div class="flex bg-zinc-100 p-1 rounded-xl border border-zinc-200/50 shadow-inner">
      <button 
        on:click={() => activeSubTab = 'train'}
        class="flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer {activeSubTab === 'train' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-800'}"
      >
        {$t('dt_subtab_train_prune')}
      </button>
      <button 
        on:click={() => activeSubTab = 'data'}
        class="flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer {activeSubTab === 'data' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-800'}"
      >
        {$t('dt_subtab_dataset_data')}
      </button>
    </div>

    {#if activeSubTab === 'train'}
      <!-- Training Parameters Panel -->
      <div class="bg-white/80 backdrop-blur-md rounded-2xl p-6 border border-zinc-200/50 shadow-sm flex flex-col gap-5">
        <h3 class="text-sm font-black text-zinc-950 uppercase tracking-wider">{$t('dt_step_tree_params')}</h3>

        <!-- Split Slider -->
        <div class="flex flex-col gap-2">
          <div class="flex items-center justify-between text-xs">
            <span class="font-semibold text-zinc-500">{$t('dt_split_ratio_label')}</span>
            <span class="font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded font-mono">{(trainRatio * 100).toFixed(0)}% / {((1 - trainRatio) * 100).toFixed(0)}%</span>
          </div>
          <input
            type="range"
            min="0.5"
            max="0.9"
            step="0.05"
            bind:value={trainRatio}
            on:input={triggerTrain}
            class="w-full accent-amber-500 cursor-pointer"
          />
        </div>

        <!-- Criterion Selector -->
        <div class="flex flex-col gap-1.5">
          <span class="text-xs font-semibold text-zinc-500">{$t('dt_split_criterion_label')}</span>
          <div class="grid grid-cols-2 gap-2">
            <button
              on:click={() => { splittingCriterion = 'gini'; triggerTrain(); }}
              class="py-2 text-xs font-bold rounded-xl border transition-all cursor-pointer {splittingCriterion === 'gini' ? 'bg-amber-500 border-amber-600 text-white shadow-sm' : 'bg-zinc-50 border-zinc-200 text-zinc-600 hover:bg-zinc-100'}"
            >
              {$t('dt_gini_impurity')}
            </button>
            <button
              on:click={() => { splittingCriterion = 'entropy'; triggerTrain(); }}
              class="py-2 text-xs font-bold rounded-xl border transition-all cursor-pointer {splittingCriterion === 'entropy' ? 'bg-amber-500 border-amber-600 text-white shadow-sm' : 'bg-zinc-50 border-zinc-200 text-zinc-600 hover:bg-zinc-100'}"
            >
              {$t('dt_entropy_gain')}
            </button>
          </div>
          <!-- Simple dynamic explanation banner based on the active criterion -->
          <div class="mt-1 p-2.5 bg-zinc-50 rounded-xl border border-zinc-100 text-[11px] text-zinc-500 leading-normal font-medium">
            {#if splittingCriterion === 'gini'}
              <strong class="text-zinc-700 block mb-0.5">{$t('dt_gini_impurity')}:</strong>
              {$t('dt_gini_desc')}
            {:else}
              <strong class="text-zinc-700 block mb-0.5">{$t('dt_entropy_gain')}:</strong>
              {$t('dt_entropy_desc')}
            {/if}
          </div>
        </div>

        <div class="w-full h-px bg-zinc-100"></div>

        <span class="text-xs font-black text-zinc-400 uppercase tracking-wider">{$t('dt_pre_pruning_params')}</span>

        <!-- Max Depth Slider -->
        <div class="flex flex-col gap-2">
          <div class="flex items-center justify-between text-xs">
            <span class="font-semibold text-zinc-500">{$t('dt_max_depth_label')}</span>
            <span class="font-bold text-amber-700 font-mono">{maxDepth}</span>
          </div>
          <input
            type="range"
            min="1"
            max="10"
            step="1"
            bind:value={maxDepth}
            on:input={triggerTrain}
            class="w-full accent-amber-500 cursor-pointer"
          />
        </div>

        <!-- Min Samples Split -->
        <div class="flex flex-col gap-2">
          <div class="flex items-center justify-between text-xs">
            <span class="font-semibold text-zinc-500">{$t('dt_min_samples_split')}</span>
            <span class="font-bold text-amber-700 font-mono">{minSamplesSplit}</span>
          </div>
          <input
            type="range"
            min="2"
            max="20"
            step="1"
            bind:value={minSamplesSplit}
            on:input={triggerTrain}
            class="w-full accent-amber-500 cursor-pointer"
          />
        </div>

        <!-- Min Samples Leaf -->
        <div class="flex flex-col gap-2">
          <div class="flex items-center justify-between text-xs">
            <span class="font-semibold text-zinc-500">{$t('dt_min_samples_leaf')}</span>
            <span class="font-bold text-amber-700 font-mono">{minSamplesLeaf}</span>
          </div>
          <input
            type="range"
            min="1"
            max="10"
            step="1"
            bind:value={minSamplesLeaf}
            on:input={triggerTrain}
            class="w-full accent-amber-500 cursor-pointer"
          />
        </div>

        <button
          on:click={triggerTrain}
          class="w-full mt-2 bg-zinc-950 text-white font-bold py-3 rounded-xl hover:bg-zinc-800 transition-colors shadow-sm cursor-pointer text-xs"
        >
          {$t('dt_train_tree_btn')}
        </button>
      </div>
    {:else}
      <!-- Raw Data Grid Display & Custom Grid Editor -->
      <div class="bg-white/80 backdrop-blur-md rounded-2xl p-6 border border-zinc-200/50 shadow-sm flex flex-col gap-4">
        {#if isEditingCustom}
          <div class="flex flex-col gap-3">
            <div class="flex items-center justify-between">
              <h3 class="text-sm font-black text-zinc-950 uppercase tracking-wider text-amber-600">{$t('dt_create_dataset_title')}</h3>
              <button 
                on:click={() => isEditingCustom = false} 
                class="text-xs text-zinc-500 font-semibold hover:text-zinc-800 cursor-pointer"
              >
                {$t('dt_back_btn')}
              </button>
            </div>

            <div class="flex flex-col gap-1">
              <label for="ds-name-inp" class="text-xs font-semibold text-zinc-500">{$t('dt_dataset_name_label')}</label>
              <input 
                id="ds-name-inp"
                type="text" 
                bind:value={customDatasetName} 
                class="bg-zinc-50 border border-zinc-200 rounded-lg px-2.5 py-1.5 text-xs text-zinc-800 outline-none"
              />
            </div>

            <div class="flex flex-col gap-1">
              <label for="ds-target-inp" class="text-xs font-semibold text-zinc-500">{$t('dt_target_column_label')}</label>
              <input 
                id="ds-target-inp"
                type="text" 
                bind:value={customTargetName} 
                class="bg-zinc-50 border border-zinc-200 rounded-lg px-2.5 py-1.5 text-xs text-zinc-800 outline-none font-bold"
              />
            </div>

            <div class="flex items-center justify-between text-xs font-bold text-zinc-700 mt-2">
              <span>{$t('dt_features_label')}</span>
              <button on:click={addFeatureColumn} class="text-indigo-600 hover:text-indigo-800 cursor-pointer">{$t('dt_add_column_btn')}</button>
            </div>

            <!-- Features list editing -->
            <div class="flex flex-col gap-2 max-h-[150px] overflow-y-auto pr-1">
              {#each customFeatures as f, idx}
                <div class="flex items-center gap-2 bg-zinc-50 border border-zinc-200 p-2 rounded-lg">
                  <input 
                    type="text" 
                    bind:value={customFeatures[idx]} 
                    class="bg-white border border-zinc-200 rounded px-1.5 py-0.5 text-[11px] font-semibold text-zinc-800 outline-none flex-1"
                  />
                  <select 
                    bind:value={customFeatureTypes[f]} 
                    class="bg-white border border-zinc-200 rounded px-1.5 py-0.5 text-[10px] font-bold text-zinc-700"
                  >
                    <option value="categorical">{$t('dt_categorical_type')}</option>
                    <option value="numerical">{$t('dt_numerical_type')}</option>
                  </select>
                  <button 
                    on:click={() => removeFeatureColumn(f)} 
                    class="text-xs text-red-500 hover:text-red-700 px-1 cursor-pointer"
                  >
                    ×
                  </button>
                </div>
              {/each}
            </div>

            <div class="flex items-center justify-between text-xs font-bold text-zinc-700 mt-2 border-t border-zinc-100 pt-2">
              <span>{$t('dt_rows_samples_label')} ({customData.length})</span>
              <button on:click={addRow} class="text-indigo-600 hover:text-indigo-800 cursor-pointer">{$t('dt_add_row_btn')}</button>
            </div>

            <!-- Spreadsheet Grid Editor -->
            <div class="overflow-x-auto border border-zinc-200 rounded-lg max-h-[220px] overflow-y-auto">
              <table class="w-full text-left border-collapse text-[11px]">
                <thead>
                  <tr class="bg-zinc-50 border-b border-zinc-200 text-zinc-500">
                    <th class="p-2 border-r border-zinc-200">#</th>
                    {#each customFeatures as f}
                      <th class="p-2 border-r border-zinc-200">{f}</th>
                    {/each}
                    <th class="p-2 border-r border-zinc-200 text-indigo-600 font-bold">{customTargetName}</th>
                    <th class="p-2 text-center"></th>
                  </tr>
                </thead>
                <tbody>
                  {#each customData as row, rIdx}
                    <tr class="border-b border-zinc-200/50 hover:bg-zinc-50/50">
                      <td class="p-2 text-zinc-400 font-mono text-[10px] border-r border-zinc-200/50 bg-zinc-50/20">{rIdx + 1}</td>
                      {#each customFeatures as f}
                        <td class="p-1 border-r border-zinc-200/50">
                          {#if customFeatureTypes[f] === 'numerical'}
                            <input 
                              type="number" 
                              bind:value={row[f]} 
                              class="w-full bg-transparent border-0 outline-none p-1"
                            />
                          {:else}
                            <input 
                              type="text" 
                              bind:value={row[f]} 
                              class="w-full bg-transparent border-0 outline-none p-1"
                            />
                          {/if}
                        </td>
                      {/each}
                      <td class="p-1 border-r border-zinc-200/50 font-bold">
                        <input 
                           type="text" 
                          bind:value={row[customTargetName]} 
                          class="w-full bg-transparent border-0 outline-none p-1 text-indigo-700 font-bold"
                        />
                      </td>
                      <td class="p-1 text-center">
                        <button on:click={() => deleteRow(rIdx)} class="text-red-500 hover:text-red-700 font-bold font-mono">×</button>
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>

            <button 
              on:click={saveDataset} 
              class="w-full bg-amber-500 text-white font-bold py-2.5 rounded-xl hover:bg-amber-600 transition-colors shadow-sm cursor-pointer text-xs"
            >
              {$t('dt_save_dataset_btn')}
            </button>
          </div>
        {:else}
          <div class="flex flex-col gap-3">
            <h3 class="text-sm font-black text-zinc-950 uppercase tracking-wider">{$t('dt_dataset_samples_title')}</h3>
            
            <div class="overflow-x-auto border border-zinc-200 rounded-xl max-h-[350px]">
              <table class="w-full text-left border-collapse text-xs">
                <thead>
                  <tr class="bg-zinc-50 border-b border-zinc-200 text-zinc-500">
                    <th class="p-2.5 font-bold">#</th>
                    {#each activeDataset.features as f}
                      <th class="p-2.5 font-bold">{f}</th>
                    {/each}
                    <th class="p-2.5 font-bold text-amber-700 bg-amber-50/50">{activeDataset.targetName}</th>
                  </tr>
                </thead>
                <tbody>
                  {#each activeDataset.data as row, idx}
                    <tr class="border-b border-zinc-200/50 hover:bg-zinc-50/50">
                      <td class="p-2.5 text-zinc-400 font-mono text-[10px]">{idx + 1}</td>
                      {#each activeDataset.features as f}
                        <td class="p-2.5 text-zinc-700 font-medium">{row[f]}</td>
                      {/each}
                      <td class="p-2.5 font-bold text-amber-700 bg-amber-50/10">{row[activeDataset.targetName]}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          </div>
        {/if}
      </div>
    {/if}
  </section>

  <!-- RIGHT PANEL: INTERACTIVE DASHBOARD AND VISUALIZER -->
  <section class="lg:col-span-8 flex flex-col gap-6">

    <!-- Intro explanation banner -->
    <div class="bg-gradient-to-r from-amber-500/10 via-indigo-500/5 to-transparent rounded-2xl p-5 border border-amber-500/20 shadow-sm relative overflow-hidden group">
      <div class="absolute -right-8 -bottom-8 w-24 h-24 bg-amber-500 rounded-full blur-[35px] pointer-events-none opacity-20"></div>
      <div class="flex items-start gap-3 relative z-10">
        <div class="w-10 h-10 bg-amber-500/10 rounded-xl flex items-center justify-center text-amber-600 shrink-0 mt-0.5">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275Z"/></svg>
        </div>
        <div class="flex flex-col gap-1">
          <h4 class="text-sm font-black text-zinc-900">
            {$locale === 'pt' ? 'O que é uma Árvore de Decisão?' : $locale === 'fr' ? 'Qu\'est-ce qu\'un Arbre de Décision ?' : 'What is a Decision Tree?'}
          </h4>
          <p class="text-xs text-zinc-600 leading-relaxed font-semibold">
            {$locale === 'pt' 
              ? 'É uma sequência de perguntas simples (ex: "Está a chover? Sim ou Não") para chegar a uma decisão final. O computador cria estas regras automaticamente a partir do dataset!' 
              : $locale === 'fr' 
              ? 'C\'est une suite de questions simples (ex : "Pleut-il ? Oui ou Non") pour arriver à une décision. L\'ordinateur crée ces règles automatiquement à partir de votre dataset !' 
              : 'It is a sequence of simple questions (e.g., "Is it raining? Yes or No") to reach a final decision. The computer builds these rules automatically from your dataset!'}
          </p>
        </div>
      </div>
    </div>

    <!-- Overfitting Analysis & Metrics Panel -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
      
      <!-- Metrics Card 1: Train/Test accuracies -->
      <div class="bg-white/80 backdrop-blur-md rounded-2xl p-6 border border-zinc-200/50 shadow-sm flex flex-col justify-between">
        <span class="text-[10px] font-black text-zinc-400 uppercase tracking-widest">{$t('dt_model_accuracy_label')}</span>
        <div class="flex items-baseline gap-2 mt-2">
          <span class="text-3xl font-black text-emerald-600">{(testAccuracy * 100).toFixed(0)}%</span>
          <span class="text-xs text-zinc-400">{$t('dt_on_test_label')}</span>
        </div>
        
        <div class="mt-4 flex items-center justify-between text-xs border-t border-zinc-100 pt-3">
          <span class="text-zinc-500 font-semibold">{$t('dt_train_accuracy_label')}</span>
          <span class="font-bold text-zinc-800 font-mono">{(trainAccuracy * 100).toFixed(0)}%</span>
        </div>
      </div>

      <!-- Metrics Card 2: Overfitting warning checker -->
      {#if unprunedTrainAccuracy === 1 && unprunedTestAccuracy < 0.75}
        <div class="bg-rose-50/80 backdrop-blur-md rounded-2xl p-6 border border-rose-200/50 shadow-sm flex flex-col justify-between relative overflow-hidden group">
          <!-- Ambient overlay glow -->
          <div class="absolute -right-8 -top-8 w-24 h-24 bg-rose-200 rounded-full blur-[35px] pointer-events-none opacity-40"></div>
          
          <div class="flex items-center gap-1.5">
            <span class="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
            <span class="text-[10px] font-black text-rose-500 uppercase tracking-widest">{$t('dt_overfitting_alert_title')}</span>
          </div>
          
          <p class="text-xs text-rose-950/80 leading-relaxed font-semibold mt-2.5">
            {$t('dt_overfitting_alert_text_start')} <strong class="text-rose-600">100%</strong> {$t('dt_overfitting_alert_text_mid')} <strong class="text-rose-600">{(unprunedTestAccuracy * 100).toFixed(0)}%</strong>{$t('dt_overfitting_alert_text_end')}
          </p>

          <div class="mt-3 p-2 bg-rose-100/40 rounded-lg border border-rose-200/30 text-[10px] text-rose-900 leading-snug font-medium">
            <strong>{$locale === 'pt' ? 'Decorar vs Aprender' : $locale === 'fr' ? 'Mémoriser vs Apprendre' : 'Memorize vs Learn'}:</strong>
            {$locale === 'pt' 
              ? 'O modelo decorou as perguntas do treino. Ao mudar a pergunta no teste real, ele falha porque não percebeu as regras gerais!' 
              : $locale === 'fr' 
              ? 'Le modèle a mémorisé par cœur. Si on change un chiffre à l\'examen réel, il échoue car il n\'a pas compris la règle générale !' 
              : 'The model memorized the training questions. When asked new questions in the real test, it fails because it didn\'t learn the general rules!'}
          </div>
        </div>
      {:else}
        <div class="bg-indigo-50/80 backdrop-blur-md rounded-2xl p-6 border border-indigo-200/50 shadow-sm flex flex-col justify-between relative overflow-hidden">
          <div class="absolute -right-8 -top-8 w-24 h-24 bg-indigo-200 rounded-full blur-[35px] pointer-events-none opacity-30"></div>
          <span class="text-[10px] font-black text-indigo-400 uppercase tracking-widest">{$t('dt_physical_stats_title')}</span>
          <div class="grid grid-cols-2 gap-4 mt-2">
            <div>
              <span class="text-2xl font-black text-indigo-950">{trainedTree ? countNodes(trainedTree).splits : 0}</span>
              <p class="text-[9px] font-bold text-indigo-500 uppercase tracking-wider">{$t('dt_stats_splits')}</p>
            </div>
            <div>
              <span class="text-2xl font-black text-indigo-950">{trainedTree ? countNodes(trainedTree).leaves : 0}</span>
              <p class="text-[9px] font-bold text-indigo-500 uppercase tracking-wider">{$t('dt_stats_leaves')}</p>
            </div>
          </div>
          <div class="text-[10px] font-bold text-indigo-700 mt-2">
            {$t('dt_depth_label')}: {trainedTree ? countNodes(trainedTree).maxDepth : 0} {$t('dt_levels_label')}
          </div>
        </div>
      {/if}

      <!-- Metrics Card 3: Post-Pruning Actions -->
      <div class="bg-white/80 backdrop-blur-md rounded-2xl p-6 border border-zinc-200/50 shadow-sm flex flex-col justify-between">
        <span class="text-[10px] font-black text-zinc-400 uppercase tracking-widest">{$t('dt_post_pruning_title')}</span>
        
        {#if !isPostPrunedApplied}
          <p class="text-xs text-zinc-500 leading-snug mt-2">
            {$t('dt_post_pruning_desc')}
          </p>
          <div class="mt-2 text-[10px] text-zinc-500 leading-snug font-medium">
            <strong>{$locale === 'pt' ? 'O que é a Poda?' : $locale === 'fr' ? 'Qu\'est-ce que l\'élagage ?' : 'What is Pruning?'}:</strong>
            {$locale === 'pt' 
              ? 'Corta os ramos desnecessários ou inúteis para simplificar a árvore, tornando-a melhor a adivinhar novas situações.' 
              : $locale === 'fr' 
              ? 'Coupe les branches inutiles pour simplifier l\'arbre et le rendre meilleur pour de nouvelles situations.' 
              : 'Trims unnecessary branches to simplify the tree, making it better at predicting new situations.'}
          </div>
          <button
            on:click={applyPostPruning}
            class="w-full mt-3 bg-amber-500 hover:bg-amber-600 text-white font-extrabold py-2 rounded-xl text-xs transition-colors shadow-sm cursor-pointer"
          >
            {$t('dt_run_post_pruning_btn')}
          </button>
        {:else}
          <div class="mt-2 text-xs text-emerald-800 bg-emerald-50 border border-emerald-100 p-2.5 rounded-xl font-medium leading-tight">
            {$t('dt_post_pruning_success')}
          </div>
          <button
            on:click={triggerTrain}
            class="w-full mt-3 bg-zinc-100 hover:bg-zinc-200 text-zinc-600 font-extrabold py-2 rounded-xl text-xs transition-colors border border-zinc-200 cursor-pointer"
          >
            {$t('dt_remove_pruning_btn')}
          </button>
        {/if}
      </div>

    </div>

    <!-- Tree Visualizer Canvas / Text Mode -->
    {#if trainedTree}
      <div class="bg-white/80 backdrop-blur-md rounded-3xl p-6 border border-zinc-200/50 shadow-sm flex flex-col gap-4">
        <div class="flex items-center justify-between border-b border-zinc-100 pb-4">
          <h3 class="text-sm font-black text-zinc-950 uppercase tracking-wider flex items-center gap-1.5">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="5" r="3"/><circle cx="6" cy="19" r="3"/><circle cx="18" cy="19" r="3"/><path d="M12 8v8M12 12H6M12 12h6"/></svg>
            {$t('dt_decision_rules_title')}
          </h3>
          <div class="flex bg-zinc-100 p-0.5 rounded-lg border border-zinc-200">
            <button
              on:click={() => showTreeTextMode = false}
              class="px-3 py-1 text-xs font-extrabold rounded-md cursor-pointer transition-all {!showTreeTextMode ? 'bg-white text-indigo-600 shadow-xs' : 'text-zinc-500 hover:text-zinc-800'}"
            >
              {$t('dt_view_graph')}
            </button>
            <button
              on:click={() => showTreeTextMode = true}
              class="px-3 py-1 text-xs font-extrabold rounded-md cursor-pointer transition-all {showTreeTextMode ? 'bg-white text-indigo-600 shadow-xs' : 'text-zinc-500 hover:text-zinc-800'}"
            >
              {$t('dt_view_text')}
            </button>
          </div>
        </div>

        {#if !showTreeTextMode}
          <div class="relative group overflow-hidden">
            <TabularDecisionTreeViz 
              tree={isPostPrunedApplied && postPrunedTree ? postPrunedTree : trainedTree} 
              targetClasses={activeDataset.targetClasses}
              highlightPath={highlightPath}
            />
          </div>
        {:else}
          <div class="bg-zinc-900 rounded-2xl p-6 font-mono text-xs text-zinc-100 overflow-x-auto leading-relaxed shadow-inner max-h-[500px] border border-zinc-950">
            <pre class="whitespace-pre">{exportTreeToRulesText(isPostPrunedApplied && postPrunedTree ? postPrunedTree : trainedTree, $t)}</pre>
          </div>
        {/if}
      </div>
    {/if}

    <!-- Interactive Real-time Predictor -->
    <div class="bg-white/80 backdrop-blur-md rounded-3xl p-6 border border-zinc-200/50 shadow-sm flex flex-col justify-between">
      <div class="flex flex-col gap-1">
        <h3 class="text-sm font-black text-zinc-950 uppercase tracking-wider">{$t('dt_step_live_prediction')}</h3>
        <p class="text-xs text-zinc-500 leading-snug">
          {$t('dt_live_prediction_desc')}
        </p>
      </div>

      <div class="flex flex-col gap-4 mt-6">
        {#each activeDataset.features as f}
          <div class="flex flex-col gap-1.5">
            <div class="flex items-center justify-between text-xs font-semibold">
              <span class="text-zinc-600">{f}:</span>
              <span class="text-zinc-950 font-bold font-mono">{predictorInputs[f] !== undefined ? predictorInputs[f] : ''}</span>
            </div>
            
            {#if activeDataset.featureTypes[f] === 'numerical'}
              <!-- Numerical Slider -->
              {@const minVal = Math.min(...activeDataset.data.map(d => Number(d[f])))}
              {@const maxVal = Math.max(...activeDataset.data.map(d => Number(d[f])))}
              <div class="flex items-center gap-3">
                <span class="text-[10px] text-zinc-400 font-bold font-mono">{minVal}</span>
                <input
                  type="range"
                  min={minVal}
                  max={maxVal}
                  step={Math.round((maxVal - minVal) / 20 * 100) / 100 || 0.1}
                  value={predictorInputs[f] || minVal}
                  on:input={(e) => handlePredictorInput(f, (e.target as HTMLInputElement).value)}
                  class="flex-1 accent-indigo-500 cursor-pointer h-1 bg-zinc-200 rounded-lg appearance-none"
                />
                <span class="text-[10px] text-zinc-400 font-bold font-mono">{maxVal}</span>
              </div>
            {:else}
              <!-- Categorical Dropdown -->
              {@const uniqueCats = Array.from(new Set(activeDataset.data.map(d => String(d[f]))))}
              <select
                value={predictorInputs[f] || ''}
                on:change={(e) => handlePredictorInput(f, (e.target as HTMLSelectElement).value)}
                class="bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs font-semibold text-zinc-800 outline-none cursor-pointer"
              >
                {#each uniqueCats as cat}
                  <option value={cat}>{cat}</option>
                {/each}
              </select>
            {/if}
          </div>
        {/each}
      </div>

      <!-- Resulting Live Decision Card -->
      <div class="mt-6 bg-gradient-to-r from-indigo-500/10 to-teal-500/10 border border-indigo-100 rounded-2xl p-4 flex items-center justify-between">
        <div class="flex flex-col">
          <span class="text-[10px] font-black text-indigo-400 uppercase tracking-wider">{$t('dt_prediction_result_label')}</span>
          <span class="text-base font-black text-zinc-900 mt-0.5">{predictionResult || $t('dt_prediction_none')}</span>
        </div>
        <div class="flex flex-col text-right">
          <span class="text-[10px] font-black text-teal-600 uppercase tracking-wider">{$t('dt_leaf_confidence_label')}</span>
          <span class="text-base font-black text-teal-800 mt-0.5 font-mono">{predictionConfidence}%</span>
        </div>
      </div>

      <!-- Simplified Active Prediction Rules Path -->
      {#if trainedTree && predictionResult}
        <div class="mt-4 bg-zinc-50 border border-zinc-200/60 rounded-2xl p-5 flex flex-col gap-2">
          <h4 class="text-[10px] font-black text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            {$t('dt_active_rules_path')}
          </h4>
          <p class="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">{$t('dt_rules_simplified')}</p>
          
          {#if simplifiedRulesPath.length > 0}
            <div class="flex flex-wrap gap-2 mt-1">
              {#each simplifiedRulesPath as rule, index}
                <div class="flex items-center gap-2">
                  <span class="bg-indigo-50 border border-indigo-100 text-indigo-700 px-3 py-1.5 rounded-xl text-xs font-mono font-bold shadow-xs">
                    {rule}
                  </span>
                  {#if index < simplifiedRulesPath.length - 1}
                    <span class="text-[9px] font-black text-indigo-400 uppercase tracking-wider font-mono">
                      {$locale === 'pt' ? 'E' : $locale === 'fr' ? 'ET' : 'AND'}
                    </span>
                  {/if}
                </div>
              {/each}
              <div class="flex items-center gap-1.5 w-full border-t border-zinc-200/50 pt-2.5 mt-2 text-xs font-semibold text-zinc-600">
                <span class="text-[10px] font-black text-indigo-500 uppercase tracking-wider">➔</span>
                {$locale === 'pt' ? 'Previsão:' : $locale === 'fr' ? 'Prévision :' : 'Prediction:'}
                <strong class="text-zinc-900 font-extrabold">{predictionResult}</strong>
                <span class="text-[10px] text-zinc-400">({predictionConfidence}% {$locale === 'pt' ? 'de confiança' : $locale === 'fr' ? 'de confiance' : 'confidence'})</span>
              </div>
            </div>
          {:else}
            <p class="text-xs text-zinc-400 font-medium italic mt-1">{$t('dt_rule_path_none')}</p>
          {/if}
        </div>
      {/if}
    </div>
  </section>
</div>
