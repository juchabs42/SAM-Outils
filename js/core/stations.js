// Stations du réseau SAM : liste partagée entre le bandeau de gauche (onglet Données)
// et la page Données. Favoris du compte en premier, autres stations repliées.
import { auth } from './auth.js';
import { profile } from './profile.js';
import { createEmitter } from './util.js';

const HOUR = 3600000;
const LATE_HOURS = 3;
const SILENT_HOURS = 48;
const emitter = createEmitter();
const state = { list: [], loaded: false, loading: null, error: null, selectedId: null };

/** État de transmission d'une station. */
export function stationState(station) {
  const hours = station.derniere_mesure ? (Date.now() - new Date(station.derniere_mesure).getTime()) / HOUR : Infinity;
  if (station.installee === false && hours > SILENT_HOURS) return { key: 'pending', label: 'Pas encore installée' };
  if (!station.derniere_mesure) return { key: 'never', label: 'Aucune donnée' };
  if (!station.active) return { key: 'off', label: 'Collecte arrêtée' };
  if (hours <= LATE_HOURS) return { key: 'ok', label: 'Transmet' };
  if (hours <= SILENT_HOURS) return { key: 'late', label: 'En retard' };
  return { key: 'silent', label: 'Muette' };
}

const byName = (a, b) => a.nom.localeCompare(b.nom, 'fr');

export const stationStore = {
  get list() { return state.list; },
  get loaded() { return state.loaded; },
  get error() { return state.error; },
  get selectedId() { return state.selectedId; },
  get selected() { return state.list.find(s => s.id === state.selectedId) || null; },
  onChange: fn => emitter.on(fn),

  async load(force = false) {
    if (state.loaded && !force) return state.list;
    if (!state.loading) {
      state.loading = (async () => {
        // Les favoris du compte décident de la station ouverte par défaut.
        await profile.load().catch(() => null);
        if (!auth.client) throw new Error('Connexion à la base indisponible.');
        const { data, error } = await auth.client.from('stations').select('*').order('nom');
        if (error) throw error;
        state.list = data || [];
        state.loaded = true;
        state.error = null;
      })().catch(error => {
        state.error = error;
        state.loaded = true;
      }).finally(() => { state.loading = null; });
    }
    await state.loading;
    stationStore.ensureSelection();
    emitter.emit({ type: 'list' });
    return state.list;
  },

  /** Ordre du bandeau : favoris (dans l'ordre choisi), puis stations installées, puis à venir. */
  groups() {
    const favIds = profile.favorites();
    const favorites = favIds.map(id => state.list.find(s => s.id === id)).filter(Boolean);
    const rest = state.list.filter(s => !favIds.includes(s.id));
    const installed = rest.filter(s => s.installee !== false).sort(byName);
    const pending = auth.isAdmin ? rest.filter(s => s.installee === false).sort(byName) : [];
    return { favorites, installed, pending };
  },

  /** Première station du bandeau : premier favori, sinon première station installée. */
  first() {
    const { favorites, installed, pending } = stationStore.groups();
    return favorites[0] || installed[0] || pending[0] || null;
  },

  ensureSelection() {
    const visible = stationStore.groups();
    const ids = [...visible.favorites, ...visible.installed, ...visible.pending].map(s => s.id);
    if (!state.selectedId || !ids.includes(state.selectedId)) state.selectedId = stationStore.first()?.id || null;
  },

  select(id) {
    if (!id || id === state.selectedId) return;
    state.selectedId = id;
    emitter.emit({ type: 'select', id });
  },

  /** Met à jour une station après modification (fiche station). */
  patch(id, values) {
    const station = state.list.find(s => s.id === id);
    if (station) Object.assign(station, values);
    emitter.emit({ type: 'list' });
  }
};
