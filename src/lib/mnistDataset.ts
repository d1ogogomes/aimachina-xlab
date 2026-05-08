import type { DemoDataset, DemoImageRef } from './demoDataset';

// Carrega todos os URLs das imagens MNIST no diretório raiz usando o Vite
const mnistGlob = import.meta.glob('/mnist_png/**/*.png', { as: 'url', eager: true });

// Organizar as imagens por dígito (0-9)
const digitImages: Record<string, string[]> = {};

for (const path in mnistGlob) {
    // path é algo como "/mnist_png/training/0/1.png" ou "/mnist_png/testing/0/3.png"
    // Extraímos o dígito a partir do nome da pasta pai
    const match = path.match(/\/(\d+)\/[^/]+\.png$/);
    if (match) {
        const digit = match[1];
        if (!digitImages[digit]) digitImages[digit] = [];
        digitImages[digit].push((mnistGlob as Record<string, string>)[path]);
    }
}

// Construir os datasets para cada dígito, limitados a 20 imagens de treino e 10 de teste
export const mnistDatasets: DemoDataset[] = [];

for (let i = 0; i <= 9; i++) {
    const digit = i.toString();
    const images = digitImages[digit] || [];
    
    // Se não houver imagens suficientes, saltamos este dígito (por segurança)
    if (images.length === 0) continue;
    
    // Selecionar um subconjunto aleatório ou os primeiros N para evitar rebentar a memória
    const trainingImages = images.slice(0, 20).map(src => ({
        src,
        title: `MNIST Digit ${digit} (Train)`,
        author: "Alexander",
        license: "CC0: Public Domain",
        source: "https://www.kaggle.com/datasets/alexanderyyy/mnist-png"
    }));
    
    const testImages = images.slice(20, 30).map(src => ({
        src,
        title: `MNIST Digit ${digit} (Test)`,
        author: "Alexander",
        license: "CC0: Public Domain",
        source: "https://www.kaggle.com/datasets/alexanderyyy/mnist-png"
    }));
    
    mnistDatasets.push({
        labelKey: `demo_class_${digit}` as any, // Adicionaremos as traduções a seguir
        training: trainingImages,
        tests: testImages
    });
}
