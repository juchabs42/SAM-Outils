// Lieux : recherche de communes (Open-Meteo), position GPS, lieux enregistrés.
import { storage, createEmitter } from './util.js';

export const DEFAULT_PLACE = {
  id: 'marsillargues',
  name: 'Marsillargues',
  admin1: 'Occitanie',
  admin2: 'Hérault',
  country: 'France',
  latitude: 43.6343,
  longitude: 4.1706,
  elevation: 2,
  timezone: 'Europe/Paris'
};

const emitter = createEmitter();

function placeId(place) {
  return `${Number(place.latitude).toFixed(4)}_${Number(place.longitude).toFixed(4)}`;
}

export function normalizePlace(raw) {
  const place = {
    name: raw.name || 'Lieu',
    admin1: raw.admin1 || '',
    admin2: raw.admin2 || '',
    postcode: raw.postcode || raw.postcodes?.[0] || '',
    country: raw.country || 'France',
    latitude: Number(raw.latitude),
    longitude: Number(raw.longitude),
    elevation: Number.isFinite(Number(raw.elevation)) ? Number(raw.elevation) : null,
    timezone: raw.timezone || 'Europe/Paris'
  };
  place.id = raw.id && raw.id !== 'gps' ? raw.id : placeId(place);
  return place;
}

function loadSaved() {
  const saved = storage.get('places', null);
  if (Array.isArray(saved) && saved.length) return saved.map(normalizePlace);

  // Première ouverture : on reprend les favoris de l'ancienne appli Indicateurs (même site).
  const legacy = storage.legacy('samIndicFavoritePlaces');
  const places = [normalizePlace(DEFAULT_PLACE)];
  if (Array.isArray(legacy)) {
    legacy.forEach(item => {
      if (!Number.isFinite(Number(item?.latitude)) || !Number.isFinite(Number(item?.longitude))) return;
      const place = normalizePlace(item);
      if (!places.some(p => p.id === place.id)) places.push(place);
    });
  }
  return places;
}

const state = {
  saved: loadSaved(),
  favoriteId: storage.get('favoritePlace', null),
  current: null
};

if (!state.saved.some(p => p.id === state.favoriteId)) state.favoriteId = state.saved[0]?.id || null;
state.current = storage.get('currentPlace', null);
if (!state.current || !Number.isFinite(Number(state.current.latitude))) {
  state.current = state.saved.find(p => p.id === state.favoriteId) || normalizePlace(DEFAULT_PLACE);
} else {
  state.current = normalizePlace(state.current);
}

function persist() {
  storage.set('places', state.saved);
  storage.set('favoritePlace', state.favoriteId);
  storage.set('currentPlace', state.current);
}

export const places = {
  get current() { return state.current; },
  get saved() { return state.saved; },
  get favoriteId() { return state.favoriteId; },
  onChange: fn => emitter.on(fn),

  select(raw, { save = true } = {}) {
    const place = normalizePlace(raw);
    const changed = !state.current || state.current.id !== place.id;
    state.current = place;
    if (save && !state.saved.some(p => p.id === place.id)) {
      state.saved.push(place);
      if (state.saved.length > 20) state.saved.splice(1, 1);
    }
    persist();
    emitter.emit({ type: changed ? 'current' : 'list', place });
  },

  setFavorite(id) {
    if (!state.saved.some(p => p.id === id)) return;
    state.favoriteId = id;
    persist();
    emitter.emit({ type: 'list' });
  },

  remove(id) {
    if (state.saved.length <= 1) return;
    state.saved = state.saved.filter(p => p.id !== id);
    if (state.favoriteId === id) state.favoriteId = state.saved[0]?.id || null;
    persist();
    emitter.emit({ type: 'list' });
  }
};

export function placeLabel(place, { long = false } = {}) {
  if (!place) return '—';
  const details = long ? [place.admin2, place.admin1].filter(Boolean).join(', ') : '';
  return details ? `${place.name} (${details})` : place.name;
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Erreur ${response.status}`);
  return response.json();
}

/** Recherche de communes en France (Open-Meteo Geocoding). */
export async function searchPlaces(query) {
  const params = new URLSearchParams({
    name: query.trim(),
    count: '8',
    language: 'fr',
    countryCode: 'FR',
    format: 'json'
  });
  const data = await fetchJson(`https://geocoding-api.open-meteo.com/v1/search?${params}`);
  return (data.results || []).map(normalizePlace);
}

/** Nom de la commune la plus proche d'une position (OpenStreetMap Nominatim). */
export async function reverseGeocode(latitude, longitude) {
  try {
    const data = await fetchJson(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=10&addressdetails=1&accept-language=fr`);
    const a = data.address || {};
    return {
      name: a.city || a.town || a.village || a.municipality || a.county || data.name || 'Ma position',
      admin1: a.state || '',
      admin2: a.county || '',
      postcode: a.postcode || ''
    };
  } catch {
    return { name: 'Ma position' };
  }
}

/** Position GPS de l'appareil → lieu. */
export function locateMe() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('La géolocalisation n’est pas disponible sur cet appareil.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async position => {
        const latitude = Math.round(position.coords.latitude * 1e4) / 1e4;
        const longitude = Math.round(position.coords.longitude * 1e4) / 1e4;
        const info = await reverseGeocode(latitude, longitude);
        resolve(normalizePlace({ ...info, latitude, longitude }));
      },
      () => reject(new Error('Position introuvable (autorisation refusée ou signal absent).')),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 }
    );
  });
}
