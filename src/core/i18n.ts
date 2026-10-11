import type { L10n, Lang } from './types';

const KEY = 'gnistan.lang';
let lang: Lang = readStored();
const listeners = new Set<(l: Lang) => void>();

function readStored(): Lang {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'sv' || v === 'en') return v;
  } catch { /* storage blocked */ }
  return navigator.language?.toLowerCase().startsWith('sv') ? 'sv' : 'sv';
}

export function getLang(): Lang {
  return lang;
}

export function setLang(l: Lang) {
  if (l === lang) return;
  lang = l;
  try { localStorage.setItem(KEY, l); } catch { /* ignore */ }
  document.documentElement.lang = l;
  listeners.forEach((fn) => fn(l));
}

export function onLangChange(fn: (l: Lang) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function t(text: L10n): string {
  return text[lang];
}

/** Shorthand for writing L10n literals. */
export const L = (sv: string, en: string): L10n => ({ sv, en });
