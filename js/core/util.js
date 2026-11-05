// Utilitaires communs : dates, formatage, stockage local, chargement de scripts.

const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const MONTHS_LONG = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** Date du jour (Europe/Paris) au format AAAA-MM-JJ. */
export function todayISO() {
  const parts = new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

export function addDaysISO(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

export function diffDaysISO(a, b) {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

export function isISODate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function clampISO(iso, min, max) {
  if (min && iso < min) return min;
  if (max && iso > max) return max;
  return iso;
}

/** « 18 mai 2024 » */
export function formatDateLong(iso) {
  if (!isISODate(iso)) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS_LONG[m - 1]} ${y}`;
}

/** « 18 mai » ou « 18 mai 2024 » si l'année diffère de l'année courante. */
export function formatDateShort(iso, withYear = false) {
  if (!isISODate(iso)) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  const currentYear = Number(todayISO().slice(0, 4));
  return `${d} ${MONTHS[m - 1]}${withYear || y !== currentYear ? ` ${y}` : ''}`;
}

/** « 18/05 » */
export function formatDayMonth(iso) {
  if (!isISODate(iso)) return '';
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

export function formatNumber(value, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return Number(value).toLocaleString('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
}

export function debounce(fn, ms = 250) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

// Stockage local : toujours protégé (navigation privée, stockage bloqué…).
const PREFIX = 'samOutils.';

export const storage = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },
  remove(key) {
    try { localStorage.removeItem(PREFIX + key); } catch { /* rien */ }
  },
  /** Lecture d'une clé héritée des anciennes applis (même origine GitHub Pages). */
  legacy(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? null : JSON.parse(raw);
    } catch {
      return null;
    }
  }
};

const scriptPromises = new Map();

/** Charge un script classique une seule fois. */
export function loadScript(src) {
  if (!scriptPromises.has(src)) {
    scriptPromises.set(src, new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = src;
      el.async = true;
      el.onload = () => resolve();
      el.onerror = () => {
        scriptPromises.delete(src);
        reject(new Error(`Impossible de charger ${src}`));
      };
      document.head.appendChild(el);
    }));
  }
  return scriptPromises.get(src);
}

const cssPromises = new Map();

/** Charge une feuille de style une seule fois. */
export function loadCss(href) {
  if (!cssPromises.has(href)) {
    cssPromises.set(href, new Promise(resolve => {
      const el = document.createElement('link');
      el.rel = 'stylesheet';
      el.href = href;
      el.onload = () => resolve();
      el.onerror = () => resolve();
      document.head.appendChild(el);
    }));
  }
  return cssPromises.get(href);
}

export const VENDOR = {
  xlsx: 'assets/vendor/xlsx-0.18.5.full.min.js',
  leaflet: 'assets/vendor/leaflet/leaflet-1.9.4.js',
  leafletCss: 'assets/vendor/leaflet/leaflet-1.9.4.css'
};

/** Petit émetteur d'événements. */
export function createEmitter() {
  const listeners = new Set();
  return {
    on(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    emit(...args) {
      [...listeners].forEach(fn => {
        try { fn(...args); } catch (error) { console.error(error); }
      });
    }
  };
}

/** Récupère toutes les lignes d'une table Supabase par pages de 1000. */
export async function fetchAllRows(queryFactory, pageSize = 1000) {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await queryFactory().range(from, from + pageSize - 1);
    if (error) return { data: null, error };
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return { data: rows, error: null };
}
