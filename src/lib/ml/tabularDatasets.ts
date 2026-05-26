// Built-in datasets and localStorage management for Decision Tree Tabular Datasets

export type TabularDataset = {
  id: string;
  name: string;
  features: string[];
  featureTypes: Record<string, 'categorical' | 'numerical'>;
  targetName: string;
  targetClasses: string[];
  data: Record<string, any>[];
};

// ─── GOLF PLAY DATASET (Categorical Split Classic) ────────────
export const GOLF_DATASET: TabularDataset = {
  id: 'golf',
  name: 'Golf Play (Categorias)',
  features: ['Outlook', 'Temperature', 'Humidity', 'Windy'],
  featureTypes: {
    Outlook: 'categorical',
    Temperature: 'categorical',
    Humidity: 'categorical',
    Windy: 'categorical',
  },
  targetName: 'Play',
  targetClasses: ['No', 'Yes'],
  data: [
    { Outlook: 'Sunny', Temperature: 'Hot', Humidity: 'High', Windy: 'FALSE', Play: 'No' },
    { Outlook: 'Sunny', Temperature: 'Hot', Humidity: 'High', Windy: 'TRUE', Play: 'No' },
    { Outlook: 'Overcast', Temperature: 'Hot', Humidity: 'High', Windy: 'FALSE', Play: 'Yes' },
    { Outlook: 'Rainy', Temperature: 'Mild', Humidity: 'High', Windy: 'FALSE', Play: 'Yes' },
    { Outlook: 'Rainy', Temperature: 'Cool', Humidity: 'Normal', Windy: 'FALSE', Play: 'Yes' },
    { Outlook: 'Rainy', Temperature: 'Cool', Humidity: 'Normal', Windy: 'TRUE', Play: 'No' },
    { Outlook: 'Overcast', Temperature: 'Cool', Humidity: 'Normal', Windy: 'TRUE', Play: 'Yes' },
    { Outlook: 'Sunny', Temperature: 'Mild', Humidity: 'High', Windy: 'FALSE', Play: 'No' },
    { Outlook: 'Sunny', Temperature: 'Cool', Humidity: 'Normal', Windy: 'FALSE', Play: 'Yes' },
    { Outlook: 'Rainy', Temperature: 'Mild', Humidity: 'Normal', Windy: 'FALSE', Play: 'Yes' },
    { Outlook: 'Sunny', Temperature: 'Mild', Humidity: 'Normal', Windy: 'TRUE', Play: 'Yes' },
    { Outlook: 'Overcast', Temperature: 'Mild', Humidity: 'High', Windy: 'TRUE', Play: 'Yes' },
    { Outlook: 'Overcast', Temperature: 'Hot', Humidity: 'Normal', Windy: 'FALSE', Play: 'Yes' },
    { Outlook: 'Rainy', Temperature: 'Mild', Humidity: 'High', Windy: 'TRUE', Play: 'No' },
  ],
};

// ─── IRIS FLOWER DATASET (Continuous Split Classic) ───────────
// 90 representative samples to fit comfortably and provide high mathematical accuracy
export const IRIS_DATASET: TabularDataset = {
  id: 'iris',
  name: 'Iris (Flores - Números)',
  features: ['SepalLength', 'SepalWidth', 'PetalLength', 'PetalWidth'],
  featureTypes: {
    SepalLength: 'numerical',
    SepalWidth: 'numerical',
    PetalLength: 'numerical',
    PetalWidth: 'numerical',
  },
  targetName: 'Species',
  targetClasses: ['setosa', 'versicolor', 'virginica'],
  data: [
    // Setosa
    { SepalLength: 5.1, SepalWidth: 3.5, PetalLength: 1.4, PetalWidth: 0.2, Species: 'setosa' },
    { SepalLength: 4.9, SepalWidth: 3.0, PetalLength: 1.4, PetalWidth: 0.2, Species: 'setosa' },
    { SepalLength: 4.7, SepalWidth: 3.2, PetalLength: 1.3, PetalWidth: 0.2, Species: 'setosa' },
    { SepalLength: 4.6, SepalWidth: 3.1, PetalLength: 1.5, PetalWidth: 0.2, Species: 'setosa' },
    { SepalLength: 5.0, SepalWidth: 3.6, PetalLength: 1.4, PetalWidth: 0.2, Species: 'setosa' },
    { SepalLength: 5.4, SepalWidth: 3.9, PetalLength: 1.7, PetalWidth: 0.4, Species: 'setosa' },
    { SepalLength: 4.6, SepalWidth: 3.4, PetalLength: 1.4, PetalWidth: 0.3, Species: 'setosa' },
    { SepalLength: 5.0, SepalWidth: 3.4, PetalLength: 1.5, PetalWidth: 0.2, Species: 'setosa' },
    { SepalLength: 4.4, SepalWidth: 2.9, PetalLength: 1.4, PetalWidth: 0.2, Species: 'setosa' },
    { SepalLength: 4.9, SepalWidth: 3.1, PetalLength: 1.5, PetalWidth: 0.1, Species: 'setosa' },
    { SepalLength: 5.4, SepalWidth: 3.7, PetalLength: 1.5, PetalWidth: 0.2, Species: 'setosa' },
    { SepalLength: 4.8, SepalWidth: 3.4, PetalLength: 1.6, PetalWidth: 0.2, Species: 'setosa' },
    { SepalLength: 4.8, SepalWidth: 3.0, PetalLength: 1.4, PetalWidth: 0.1, Species: 'setosa' },
    { SepalLength: 4.3, SepalWidth: 3.0, PetalLength: 1.1, PetalWidth: 0.1, Species: 'setosa' },
    { SepalLength: 5.8, SepalWidth: 4.0, PetalLength: 1.2, PetalWidth: 0.2, Species: 'setosa' },
    { SepalLength: 5.7, SepalWidth: 4.4, PetalLength: 1.5, PetalWidth: 0.4, Species: 'setosa' },
    { SepalLength: 5.4, SepalWidth: 3.9, PetalLength: 1.3, PetalWidth: 0.4, Species: 'setosa' },
    { SepalLength: 5.1, SepalWidth: 3.5, PetalLength: 1.4, PetalWidth: 0.3, Species: 'setosa' },
    { SepalLength: 5.7, SepalWidth: 3.8, PetalLength: 1.7, PetalWidth: 0.3, Species: 'setosa' },
    { SepalLength: 5.1, SepalWidth: 3.8, PetalLength: 1.5, PetalWidth: 0.3, Species: 'setosa' },
    { SepalLength: 5.4, SepalWidth: 3.4, PetalLength: 1.7, PetalWidth: 0.2, Species: 'setosa' },
    { SepalLength: 5.1, SepalWidth: 3.7, PetalLength: 1.5, PetalWidth: 0.4, Species: 'setosa' },
    { SepalLength: 4.6, SepalWidth: 3.6, PetalLength: 1.0, PetalWidth: 0.2, Species: 'setosa' },
    { SepalLength: 5.1, SepalWidth: 3.3, PetalLength: 1.7, PetalWidth: 0.5, Species: 'setosa' },
    { SepalLength: 4.8, SepalWidth: 3.4, PetalLength: 1.9, PetalWidth: 0.2, Species: 'setosa' },
    { SepalLength: 5.0, SepalWidth: 3.0, PetalLength: 1.6, PetalWidth: 0.2, Species: 'setosa' },
    { SepalLength: 5.0, SepalWidth: 3.2, PetalLength: 1.2, PetalWidth: 0.2, Species: 'setosa' },
    { SepalLength: 4.7, SepalWidth: 3.2, PetalLength: 1.6, PetalWidth: 0.2, Species: 'setosa' },
    { SepalLength: 4.8, SepalWidth: 3.1, PetalLength: 1.6, PetalWidth: 0.2, Species: 'setosa' },
    { SepalLength: 5.4, SepalWidth: 3.4, PetalLength: 1.5, PetalWidth: 0.4, Species: 'setosa' },

    // Versicolor
    { SepalLength: 7.0, SepalWidth: 3.2, PetalLength: 4.7, PetalWidth: 1.4, Species: 'versicolor' },
    { SepalLength: 6.4, SepalWidth: 3.2, PetalLength: 4.5, PetalWidth: 1.5, Species: 'versicolor' },
    { SepalLength: 6.9, SepalWidth: 3.1, PetalLength: 4.9, PetalWidth: 1.5, Species: 'versicolor' },
    { SepalLength: 5.5, SepalWidth: 2.3, PetalLength: 4.0, PetalWidth: 1.3, Species: 'versicolor' },
    { SepalLength: 6.5, SepalWidth: 2.8, PetalLength: 4.6, PetalWidth: 1.5, Species: 'versicolor' },
    { SepalLength: 5.7, SepalWidth: 2.8, PetalLength: 4.5, PetalWidth: 1.3, Species: 'versicolor' },
    { SepalLength: 6.3, SepalWidth: 3.3, PetalLength: 4.7, PetalWidth: 1.6, Species: 'versicolor' },
    { SepalLength: 4.9, SepalWidth: 2.4, PetalLength: 3.3, PetalWidth: 1.0, Species: 'versicolor' },
    { SepalLength: 6.6, SepalWidth: 2.9, PetalLength: 4.6, PetalWidth: 1.3, Species: 'versicolor' },
    { SepalLength: 5.2, SepalWidth: 2.7, PetalLength: 3.9, PetalWidth: 1.4, Species: 'versicolor' },
    { SepalLength: 5.0, SepalWidth: 2.0, PetalLength: 3.5, PetalWidth: 1.0, Species: 'versicolor' },
    { SepalLength: 5.9, SepalWidth: 3.0, PetalLength: 4.2, PetalWidth: 1.5, Species: 'versicolor' },
    { SepalLength: 6.0, SepalWidth: 2.2, PetalLength: 4.0, PetalWidth: 1.0, Species: 'versicolor' },
    { SepalLength: 6.1, SepalWidth: 2.9, PetalLength: 4.7, PetalWidth: 1.4, Species: 'versicolor' },
    { SepalLength: 5.6, SepalWidth: 2.9, PetalLength: 3.6, PetalWidth: 1.3, Species: 'versicolor' },
    { SepalLength: 6.7, SepalWidth: 3.1, PetalLength: 4.4, PetalWidth: 1.4, Species: 'versicolor' },
    { SepalLength: 5.6, SepalWidth: 3.0, PetalLength: 4.5, PetalWidth: 1.5, Species: 'versicolor' },
    { SepalLength: 5.8, SepalWidth: 2.7, PetalLength: 4.1, PetalWidth: 1.0, Species: 'versicolor' },
    { SepalLength: 6.2, SepalWidth: 2.2, PetalLength: 4.5, PetalWidth: 1.5, Species: 'versicolor' },
    { SepalLength: 5.6, SepalWidth: 2.5, PetalLength: 3.9, PetalWidth: 1.1, Species: 'versicolor' },
    { SepalLength: 5.9, SepalWidth: 3.2, PetalLength: 4.8, PetalWidth: 1.8, Species: 'versicolor' },
    { SepalLength: 6.1, SepalWidth: 2.8, PetalLength: 4.0, PetalWidth: 1.3, Species: 'versicolor' },
    { SepalLength: 6.3, SepalWidth: 2.5, PetalLength: 4.9, PetalWidth: 1.5, Species: 'versicolor' },
    { SepalLength: 6.1, SepalWidth: 2.8, PetalLength: 4.7, PetalWidth: 1.2, Species: 'versicolor' },
    { SepalLength: 6.4, SepalWidth: 2.9, PetalLength: 4.3, PetalWidth: 1.3, Species: 'versicolor' },
    { SepalLength: 6.6, SepalWidth: 3.0, PetalLength: 4.4, PetalWidth: 1.4, Species: 'versicolor' },
    { SepalLength: 6.8, SepalWidth: 2.8, PetalLength: 4.8, PetalWidth: 1.4, Species: 'versicolor' },
    { SepalLength: 6.7, SepalWidth: 3.0, PetalLength: 5.0, PetalWidth: 1.7, Species: 'versicolor' },
    { SepalLength: 6.0, SepalWidth: 2.9, PetalLength: 4.5, PetalWidth: 1.5, Species: 'versicolor' },
    { SepalLength: 5.7, SepalWidth: 2.6, PetalLength: 3.5, PetalWidth: 1.0, Species: 'versicolor' },

    // Virginica
    { SepalLength: 6.3, SepalWidth: 3.3, PetalLength: 6.0, PetalWidth: 2.5, Species: 'virginica' },
    { SepalLength: 5.8, SepalWidth: 2.7, PetalLength: 5.1, PetalWidth: 1.9, Species: 'virginica' },
    { SepalLength: 7.1, SepalWidth: 3.0, PetalLength: 5.9, PetalWidth: 2.1, Species: 'virginica' },
    { SepalLength: 6.3, SepalWidth: 2.9, PetalLength: 5.6, PetalWidth: 1.8, Species: 'virginica' },
    { SepalLength: 6.5, SepalWidth: 3.0, PetalLength: 5.8, PetalWidth: 2.2, Species: 'virginica' },
    { SepalLength: 7.6, SepalWidth: 3.0, PetalLength: 6.6, PetalWidth: 2.1, Species: 'virginica' },
    { SepalLength: 4.9, SepalWidth: 2.5, PetalLength: 4.5, PetalWidth: 1.7, Species: 'virginica' },
    { SepalLength: 7.3, SepalWidth: 2.9, PetalLength: 6.3, PetalWidth: 1.8, Species: 'virginica' },
    { SepalLength: 6.7, SepalWidth: 2.5, PetalLength: 5.8, PetalWidth: 1.8, Species: 'virginica' },
    { SepalLength: 7.2, SepalWidth: 3.6, PetalLength: 6.1, PetalWidth: 2.5, Species: 'virginica' },
    { SepalLength: 6.5, SepalWidth: 3.2, PetalLength: 5.1, PetalWidth: 2.0, Species: 'virginica' },
    { SepalLength: 6.4, SepalWidth: 2.7, PetalLength: 5.3, PetalWidth: 1.9, Species: 'virginica' },
    { SepalLength: 6.8, SepalWidth: 3.0, PetalLength: 5.5, PetalWidth: 2.1, Species: 'virginica' },
    { SepalLength: 5.7, SepalWidth: 2.5, PetalLength: 5.0, PetalWidth: 2.0, Species: 'virginica' },
    { SepalLength: 5.8, SepalWidth: 2.8, PetalLength: 5.1, PetalWidth: 2.4, Species: 'virginica' },
    { SepalLength: 6.4, SepalWidth: 3.2, PetalLength: 5.3, PetalWidth: 2.3, Species: 'virginica' },
    { SepalLength: 6.5, SepalWidth: 3.0, PetalLength: 5.5, PetalWidth: 1.8, Species: 'virginica' },
    { SepalLength: 7.7, SepalWidth: 3.8, PetalLength: 6.7, PetalWidth: 2.2, Species: 'virginica' },
    { SepalLength: 7.7, SepalWidth: 2.6, PetalLength: 6.9, PetalWidth: 2.3, Species: 'virginica' },
    { SepalLength: 6.0, SepalWidth: 2.2, PetalLength: 5.0, PetalWidth: 1.5, Species: 'virginica' },
    { SepalLength: 6.9, SepalWidth: 3.2, PetalLength: 5.7, PetalWidth: 2.3, Species: 'virginica' },
    { SepalLength: 5.6, SepalWidth: 2.8, PetalLength: 4.9, PetalWidth: 2.0, Species: 'virginica' },
    { SepalLength: 7.7, SepalWidth: 2.8, PetalLength: 6.7, PetalWidth: 2.0, Species: 'virginica' },
    { SepalLength: 6.3, SepalWidth: 2.7, PetalLength: 4.9, PetalWidth: 1.8, Species: 'virginica' },
    { SepalLength: 6.7, SepalWidth: 3.3, PetalLength: 5.7, PetalWidth: 2.1, Species: 'virginica' },
    { SepalLength: 7.2, SepalWidth: 3.2, PetalLength: 6.0, PetalWidth: 1.8, Species: 'virginica' },
    { SepalLength: 6.2, SepalWidth: 2.8, PetalLength: 4.8, PetalWidth: 1.8, Species: 'virginica' },
    { SepalLength: 6.1, SepalWidth: 3.0, PetalLength: 4.9, PetalWidth: 1.8, Species: 'virginica' },
    { SepalLength: 6.4, SepalWidth: 2.8, PetalLength: 5.6, PetalWidth: 2.1, Species: 'virginica' },
    { SepalLength: 7.2, SepalWidth: 3.0, PetalLength: 5.8, PetalWidth: 1.6, Species: 'virginica' },
  ],
};

const LOCAL_STORAGE_KEY = 'aimachina_custom_dt_datasets';

export function getCustomDatasets(): TabularDataset[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to load custom tabular datasets from localStorage:', e);
    return [];
  }
}

export function saveCustomDataset(dataset: TabularDataset): void {
  try {
    const existing = getCustomDatasets();
    const idx = existing.findIndex(d => d.id === dataset.id);
    if (idx >= 0) {
      existing[idx] = dataset;
    } else {
      existing.push(dataset);
    }
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(existing));
  } catch (e) {
    console.error('Failed to save custom tabular dataset to localStorage:', e);
  }
}

export function deleteCustomDataset(id: string): void {
  try {
    const existing = getCustomDatasets();
    const filtered = existing.filter(d => d.id !== id);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(filtered));
  } catch (e) {
    console.error('Failed to delete custom tabular dataset from localStorage:', e);
  }
}
