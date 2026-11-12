// Profil du compte connecté : informations personnelles et stations favorites
// (table Supabase « profils », une ligne par compte, visible par lui seul).
// Tant que la table n'existe pas, les favoris restent sur l'appareil.
import { auth } from './auth.js';
import { storage, createEmitter } from './util.js';

const emitter = createEmitter();
export const PROFILE_FIELDS = ['prenom', 'nom', 'structure', 'fonction', 'telephone', 'commune'];

const state = { data: null, userId: null, remote: true, loading: null };

function localKey() {
  return `profil.${state.userId || 'anonyme'}`;
}

function emptyProfile() {
  return { id: state.userId, stations_favorites: [], ...Object.fromEntries(PROFILE_FIELDS.map(f => [f, ''])) };
}

function normalise(row) {
  const base = emptyProfile();
  const data = { ...base, ...(row || {}) };
  data.stations_favorites = Array.isArray(data.stations_favorites) ? data.stations_favorites.filter(Boolean) : [];
  PROFILE_FIELDS.forEach(f => { data[f] = data[f] ?? ''; });
  return data;
}

async function fetchProfile() {
  state.userId = auth.user?.id || null;
  if (!state.userId || !auth.client) {
    state.data = normalise(storage.get(localKey(), null));
    state.remote = false;
    return state.data;
  }
  const { data, error } = await auth.client.from('profils').select('*').eq('id', state.userId).maybeSingle();
  if (error) {
    // Table pas encore créée (fichier connexion_comptes.sql) : repli sur l'appareil.
    console.warn('Profil indisponible dans Supabase', error);
    state.remote = false;
    state.data = normalise(storage.get(localKey(), null));
  } else {
    state.remote = true;
    const local = storage.get(localKey(), null);
    state.data = normalise(data || (local ? { ...local, id: state.userId } : null));
  }
  return state.data;
}

export const profile = {
  get data() { return state.data; },
  get remote() { return state.remote; },
  onChange: fn => emitter.on(fn),

  async load(force = false) {
    if (!force && state.data && state.userId === (auth.user?.id || null)) return state.data;
    if (!state.loading) state.loading = fetchProfile().finally(() => { state.loading = null; });
    const data = await state.loading;
    emitter.emit(data);
    return data;
  },

  /** Enregistre une partie du profil. Renvoie { error } (null si tout va bien). */
  async save(patch) {
    if (!state.data) await profile.load();
    const next = normalise({ ...state.data, ...patch, id: state.userId });
    storage.set(localKey(), next);
    let error = null;
    if (auth.client && state.userId) {
      const payload = { id: state.userId, ...Object.fromEntries(Object.keys(patch).map(k => [k, next[k]])), updated_at: new Date().toISOString() };
      const result = await auth.client.from('profils').upsert(payload, { onConflict: 'id' });
      error = result.error || null;
      state.remote = !error;
    }
    state.data = next;
    emitter.emit(next);
    return { error };
  },

  favorites() {
    return state.data?.stations_favorites || [];
  },

  async toggleFavorite(stationId) {
    const current = profile.favorites();
    const next = current.includes(stationId) ? current.filter(id => id !== stationId) : [...current, stationId];
    return profile.save({ stations_favorites: next });
  }
};
