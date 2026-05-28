import { writable, derived } from 'svelte/store';
import pt from '../locales/pt.json';
import en from '../locales/en.json';
import fr from '../locales/fr.json';

const translations: Record<string, Record<string, string>> = { pt, en, fr };

// O idioma padrão
export const locale = writable('pt');

// Função reativa que recebe a chave (e um fallback opcional)
export const t = derived(locale, ($locale) => (key: string, defaultVal?: string) => {
    return translations[$locale]?.[key] || defaultVal || key;
});
