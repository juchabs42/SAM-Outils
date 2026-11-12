// Période : chaque outil déclare ses propres préréglages (7 derniers jours,
// 7 prochains jours, saison…) et garde son choix ; la sélection est mémorisée
// outil par outil sur l'appareil, ou seulement pendant la visite
// (remember: 'session' : la période par défaut revient à chaque ouverture du site).
import { storage, todayISO, addDaysISO, diffDaysISO, isISODate, clampISO, createEmitter, formatDateLong } from './util.js';

const emitter = createEmitter();
const sessionSelections = new Map();
let toolId = null;
let config = null;
let current = null;

function resolveLimit(value) {
  return typeof value === 'function' ? value() : value || null;
}

function displayFor(sel, preset) {
  if (sel.start && sel.end) {
    return sel.start === sel.end ? formatDateLong(sel.start) : `${formatDateLong(sel.start)} → ${formatDateLong(sel.end)}`;
  }
  return preset?.label || 'Toute la période';
}

function resolveSelection(selection) {
  if (!config) return null;
  const today = todayISO();
  const min = resolveLimit(config.min);
  const max = resolveLimit(config.max);

  if (selection?.preset === 'custom' && isISODate(selection.start) && isISODate(selection.end)) {
    let start = clampISO(selection.start, min, max);
    let end = clampISO(selection.end, min, max);
    if (start > end) [start, end] = [end, start];
    if (config.maxDays && diffDaysISO(start, end) + 1 > config.maxDays) start = addDaysISO(end, -(config.maxDays - 1));
    const sel = { preset: 'custom', start, end, label: 'Dates personnalisées' };
    return { ...sel, display: displayFor(sel) };
  }

  const presets = config.presets || [];
  const preset = presets.find(p => p.id === selection?.preset) || presets.find(p => p.id === config.defaultPreset) || presets[0];
  if (!preset) return null;
  const range = preset.resolve ? preset.resolve(today) : null;
  const start = range?.start ? clampISO(range.start, min, max) : null;
  const end = range?.end ? clampISO(range.end, min, max) : null;
  const sel = { preset: preset.id, start, end, label: preset.label };
  return { ...sel, display: displayFor(sel, preset) };
}

function sameSelection(a, b) {
  return a && b && a.preset === b.preset && a.start === b.start && a.end === b.end;
}

export const period = {
  get config() { return config; },
  get toolId() { return toolId; },
  get() { return current; },
  onChange: fn => emitter.on(fn),

  /** Déclare la période d'un outil (null = outil sans période). */
  configure(id, cfg) {
    toolId = id;
    config = cfg || null;
    if (!config) {
      current = null;
      emitter.emit(null, { reason: 'configure' });
      return null;
    }
    const saved = config.remember === 'session' ? sessionSelections.get(id) || null : storage.get(`period.${id}`, null);
    current = resolveSelection(saved || { preset: config.defaultPreset });
    emitter.emit(current, { reason: 'configure' });
    return current;
  },

  /** Choix d'un préréglage ({ preset }) ou de dates ({ start, end }). */
  set(selection) {
    if (!config) return;
    const next = selection.preset && selection.preset !== 'custom'
      ? resolveSelection({ preset: selection.preset })
      : resolveSelection({ preset: 'custom', start: selection.start, end: selection.end });
    if (!next) return;
    const remembered = next.preset === 'custom'
      ? { preset: 'custom', start: next.start, end: next.end }
      : { preset: next.preset };
    if (config.remember === 'session') sessionSelections.set(toolId, remembered);
    else storage.set(`period.${toolId}`, remembered);
    if (sameSelection(next, current)) return;
    current = next;
    emitter.emit(current, { reason: 'user' });
  },

  /** Recalcule le préréglage en cours (ex. quand les données de l'outil arrivent). */
  refresh() {
    if (!config || !current) return;
    const next = resolveSelection(current.preset === 'custom' ? current : { preset: current.preset });
    if (sameSelection(next, current)) return;
    current = next;
    emitter.emit(current, { reason: 'refresh' });
  }
};

// Préréglages réutilisables -------------------------------------------------
export const presets = {
  lastDays: (n, label = `${n} derniers jours`) => ({
    id: `last${n}`, label,
    resolve: today => ({ start: addDaysISO(today, -(n - 1)), end: today })
  }),
  nextDays: (n, label = `${n} prochains jours`) => ({
    id: `next${n}`, label,
    resolve: today => ({ start: today, end: addDaysISO(today, n - 1) })
  }),
  sinceJanuary: (label = 'Depuis le 1er janvier') => ({
    id: 'ytd', label,
    resolve: today => ({ start: `${today.slice(0, 4)}-01-01`, end: today })
  })
};
