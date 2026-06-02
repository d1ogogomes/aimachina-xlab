import { writable, derived } from 'svelte/store';
import pt from '../locales/pt.json';
import en from '../locales/en.json';
import fr from '../locales/fr.json';

const translations: Record<string, Record<string, string>> = { pt, en, fr };

// O idioma padrão inicial (detetado do localStorage se disponível)
const initialLocale = typeof window !== 'undefined' ? localStorage.getItem('aimachina_locale') || 'pt' : 'pt';
export const locale = writable(initialLocale);

// Guardar no localStorage sempre que o idioma for alterado
if (typeof window !== 'undefined') {
    locale.subscribe(($locale) => {
        localStorage.setItem('aimachina_locale', $locale);
    });
}

// Função reativa que recebe a chave (e um fallback opcional)
export const t = derived(locale, ($locale) => (key: string, defaultVal?: string) => {
    return translations[$locale]?.[key] || defaultVal || key;
});
