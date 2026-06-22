import fs from 'fs';
import path from 'path';

const targetDir = path.join(process.cwd(), 'src', 'mnist_png');

if (!fs.existsSync(targetDir)) {
    console.error("Erro: A pasta src/mnist_png não foi encontrada!");
    process.exit(1);
}

const folders = fs.readdirSync(targetDir).filter(f => !f.startsWith('.'));

let totalDeleted = 0;

folders.forEach(folder => {
    const folderPath = path.join(targetDir, folder);
    if (fs.statSync(folderPath).isDirectory()) {
        const files = fs.readdirSync(folderPath).filter(f => f.endsWith('.png'));
        
        // Ordenar os ficheiros alfabeticamente para consistência
        files.sort();
        
        // A nossa aplicação apenas precisa de 20 para treino + 10 para teste.
        // Guardamos 40 por precaução.
        const filesToDelete = files.slice(40);
        
        filesToDelete.forEach(file => {
            fs.unlinkSync(path.join(folderPath, file));
        });
        
        totalDeleted += filesToDelete.length;
        console.log(`Dígito [${folder}]: Apagadas ${filesToDelete.length} imagens (mantidas 40).`);
    }
});

console.log(`\nLimpeza concluída! Apagaste um total de ${totalDeleted} imagens desnecessárias.`);

