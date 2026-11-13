// Cadre de l'application : barre du haut (sections, profil, déconnexion), bandeau de
// gauche (stations, uniquement dans l'onglet Données), cartes des outils, filtres
// Localisation / Période, navigation et montage des outils.
import { icons } from './icons.js';
import { auth, signOut } from './auth.js';
import { places, searchPlaces, locateMe, placeLabel } from './places.js';
import { period } from './period.js';
import { profile } from './profile.js';
import { stationStore, stationState } from './stations.js';
import { storage, debounce, escapeHtml, formatDateShort, loadScript, loadCss, VENDOR, isISODate, todayISO } from './util.js';

const APP_VERSION = '2026-11-13.2';

export const TOOLS = [
  { id: 'indicateurs', title: 'SAM Indicateurs agroclimatiques', card: 'Indicateurs <br>agro&shy;clima&shy;tiques', icon: 'toolIndicateurs' },
  { id: 'irrigation', title: 'SAM Programmation irrigation', card: 'Program&shy;mation <br>irrigation', icon: 'toolIrrigation' },
  { id: 'bilan', title: 'SAM Bilan hydrique', card: 'Bilan <br>hydrique', icon: 'toolBilan' },
  { id: 'phenologie', title: 'SAM Suivi phénologique', card: 'Suivi <br>phéno&shy;logique', icon: 'toolPheno', admin: true },
  { id: 'tavelure', title: 'SAM Tavelure', card: 'Tavelure', icon: 'toolTavelure', admin: true },
  { id: 'piegeage', title: 'SAM Piégeage', card: 'Piégeage', icon: 'toolPiegeage', admin: true }
];
const HIDDEN_TOOLS = [
  { id: 'migration', title: 'Migration des données Piégeage', hidden: true, adminOnly: true }
];
// Rubriques hors « Outils SAM » : pas de cartes d'outils.
const SECTIONS = [
  { id: 'donnees', title: 'Données des stations SAM', section: true, sidebar: 'stations' },
  { id: 'carte', title: 'Cartographie des stations SAM', section: true },
  { id: 'admin', title: 'Administration SAM', section: true, adminOnly: true },
  { id: 'profil', title: 'Mon profil', section: true }
];
const DEFAULT_TOOL = 'indicateurs';

const $ = id => document.getElementById(id);
let currentMount = null;
let mountToken = 0;
let deferredInstall = null;
let started = false;

// ---------------------------------------------------------------------------
// Icônes
// ---------------------------------------------------------------------------
export function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach(el => {
    const name = el.dataset.icon;
    if (icons[name] && !el.firstElementChild) el.innerHTML = icons[name];
  });
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------
let toastTimer = null;
export function toast(message, duration = 3200) {
  const el = $('sam-toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-visible'), duration);
}

function setModePill(text = '', kind = '') {
  const pill = $('sam-mode-pill');
  if (!text) {
    pill.classList.add('hidden');
    return;
  }
  pill.className = `sam-mode-pill${kind === 'admin' ? ' is-admin' : ''}`;
  pill.innerHTML = `${kind === 'admin' ? icons.edit : kind === 'readonly' ? icons.lock : ''}<span>${escapeHtml(text)}</span>`;
}

// ---------------------------------------------------------------------------
// Bandeau de gauche : stations du réseau (onglet Données)
// ---------------------------------------------------------------------------
const sideState = { showOthers: null };

function stationItem(station) {
  const state = stationState(station);
  const isFavorite = profile.favorites().includes(station.id);
  const isCurrent = station.id === stationStore.selectedId;
  return `<li class="sam-station${isCurrent ? ' is-current' : ''}" data-station-id="${escapeHtml(station.id)}">
    <button class="sam-station-select" type="button" data-action="select" title="${escapeHtml(`${station.nom} — ${state.label}`)}"${isCurrent ? ' aria-current="true"' : ''}>
      <i class="sam-dot is-${state.key}" aria-hidden="true"></i><span>${escapeHtml(station.nom)}</span>
    </button>
    <button class="sam-place-star" type="button" data-action="favorite" aria-pressed="${isFavorite}" aria-label="${isFavorite ? `Retirer ${escapeHtml(station.nom)} des favoris` : `Ajouter ${escapeHtml(station.nom)} aux favoris`}" title="${isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}">${isFavorite ? icons.starFilled : icons.star}</button>
  </li>`;
}

function renderStationSidebar() {
  const status = $('sam-stations-status');
  if (!stationStore.loaded) {
    status.textContent = 'Chargement…';
    status.classList.remove('hidden');
    return;
  }
  if (stationStore.error) {
    const missing = /relation|does not exist|schema cache/i.test(stationStore.error.message || '');
    status.textContent = missing ? 'Les stations ne sont pas encore créées dans Supabase.' : 'Stations indisponibles pour le moment.';
    status.classList.remove('hidden');
    ['sam-stations-fav', 'sam-stations-others', 'sam-stations-pending'].forEach(id => { $(id).innerHTML = ''; });
    $('sam-stations-toggle').classList.add('hidden');
    $('sam-stations-hint').classList.add('hidden');
    return;
  }
  const { favorites, installed, pending } = stationStore.groups();
  const total = favorites.length + installed.length + pending.length;
  status.textContent = total ? '' : 'Aucune station visible pour le moment.';
  status.classList.toggle('hidden', Boolean(total));

  // Sans favori, toutes les stations sont dépliées ; avec des favoris, les autres sont repliées.
  const others = installed.length + pending.length;
  const open = sideState.showOthers ?? !favorites.length;
  $('sam-stations-fav').innerHTML = favorites.map(stationItem).join('');
  $('sam-stations-others').innerHTML = installed.map(stationItem).join('');
  $('sam-stations-pending').innerHTML = pending.map(stationItem).join('');
  $('sam-stations-pending-title').classList.toggle('hidden', !pending.length);
  $('sam-stations-hint').classList.toggle('hidden', favorites.length > 0 || !total);
  const toggle = $('sam-stations-toggle');
  toggle.classList.toggle('hidden', !favorites.length || !others);
  toggle.setAttribute('aria-expanded', String(open));
  toggle.innerHTML = open
    ? `<span>Masquer les autres stations</span>${icons.chevronDown}`
    : `<span>Voir les autres stations (${others})</span>${icons.chevronDown}`;
  $('sam-stations-more').hidden = !open || !others;
}

function handleStationListClick(event) {
  const button = event.target.closest('button[data-action]');
  const item = event.target.closest('[data-station-id]');
  if (!button || !item) return;
  const id = item.dataset.stationId;
  if (button.dataset.action === 'select') {
    stationStore.select(id);
    closeDrawer();
  } else if (button.dataset.action === 'favorite') {
    const station = stationStore.list.find(s => s.id === id);
    const wasFavorite = profile.favorites().includes(id);
    profile.toggleFavorite(id).then(({ error }) => {
      if (error && profile.remote === false) toast('Favori gardé sur cet appareil (profil pas encore créé dans Supabase).', 4500);
    });
    if (!wasFavorite && station) toast(`${station.nom} ajoutée à vos favoris.`);
  }
}

async function enterStationSidebar() {
  renderStationSidebar();
  await Promise.all([profile.load(), stationStore.load()]);
  renderStationSidebar();
}

// ---------------------------------------------------------------------------
// Lieux (choix de la localisation des outils)
// ---------------------------------------------------------------------------
function renderLocationValue() {
  $('sam-location-value').textContent = places.current ? placeLabel(places.current) : '—';
}

function renderSearchResults(container, results) {
  if (!results) {
    container.innerHTML = '';
    return;
  }
  if (!results.length) {
    container.innerHTML = '<p class="sam-pop-message">Aucune commune trouvée en France.</p>';
    return;
  }
  container.innerHTML = results.map((place, index) => `
    <button type="button" class="sam-pop-option" data-result-index="${index}">
      <span class="sam-pop-main"><strong>${escapeHtml(place.name)}</strong>
      <small>${escapeHtml([place.postcode, place.admin2, place.admin1].filter(Boolean).join(' · '))}</small></span>
    </button>`).join('');
  container._results = results;
}

function wirePlaceSearch(input, container, { onSelect } = {}) {
  let lastQuery = '';
  const run = debounce(async () => {
    const query = input.value.trim();
    if (query === lastQuery) return;
    lastQuery = query;
    if (query.length < 2) {
      renderSearchResults(container, null);
      return;
    }
    try {
      const results = await searchPlaces(query);
      if (input.value.trim() === query) renderSearchResults(container, results);
    } catch {
      container.innerHTML = '<p class="sam-pop-message">Recherche indisponible (connexion ?).</p>';
    }
  }, 320);
  input.addEventListener('input', run);
  container.addEventListener('click', event => {
    const button = event.target.closest('[data-result-index]');
    if (!button) return;
    const place = container._results?.[Number(button.dataset.resultIndex)];
    if (!place) return;
    places.select(place);
    input.value = '';
    lastQuery = '';
    renderSearchResults(container, null);
    onSelect?.(place);
  });
}

async function useMyPosition(button) {
  const original = button?.innerHTML;
  if (button) {
    button.disabled = true;
    button.textContent = 'Localisation…';
  }
  try {
    const place = await locateMe();
    places.select(place);
    toast(`Lieu : ${place.name}`);
    closePopovers();
  } catch (error) {
    toast(error.message);
  } finally {
    if (button) {
      button.disabled = false;
      button.innerHTML = original;
    }
  }
}

// ---------------------------------------------------------------------------
// Bandeau : repli (ordinateur) et tiroir (téléphone)
// ---------------------------------------------------------------------------
function setCollapsed(collapsed) {
  $('sam-app').classList.toggle('is-collapsed', collapsed);
  storage.set('sidebarCollapsed', collapsed);
  // Les graphiques s'adaptent à la nouvelle largeur.
  setTimeout(() => window.dispatchEvent(new Event('resize')), 260);
}

function openDrawer() {
  $('sam-app').classList.add('drawer-open');
  $('sam-drawer-backdrop').hidden = false;
  $('sam-burger').setAttribute('aria-expanded', 'true');
}

function closeDrawer() {
  $('sam-app').classList.remove('drawer-open');
  $('sam-drawer-backdrop').hidden = true;
  $('sam-burger').setAttribute('aria-expanded', 'false');
}

// ---------------------------------------------------------------------------
// Compte connecté
// ---------------------------------------------------------------------------
function renderAuth() {
  // L'adresse mail affichée en haut à droite ouvre la page « Mon profil ».
  const p = profile.data;
  const name = [p?.prenom, p?.nom].filter(Boolean).join(' ').trim();
  $('sam-perso-email').textContent = auth.user?.email || 'Mon profil';
  $('sam-perso').title = `${name ? `${name} · ` : ''}${auth.isAdmin ? 'compte administrateur' : 'compte en lecture seule'} — Mon profil`;
  // Onglet « Administration » : visible des seuls administrateurs.
  $('sam-nav-admin').hidden = !auth.isAdmin;
  $('sam-app').classList.toggle('is-admin', Boolean(auth.isAdmin));
  updateToolModePill();
}

async function handleLogout() {
  try {
    await signOut();
  } finally {
    window.location.reload();
  }
}

// ---------------------------------------------------------------------------
// Cartes des outils
// ---------------------------------------------------------------------------
function renderToolCards(activeId) {
  $('sam-tools').innerHTML = TOOLS.map(tool => `
    <a class="sam-tool-card${tool.id === activeId ? ' is-active' : ''}" href="#/${tool.id}" ${tool.id === activeId ? 'aria-current="page"' : ''}>
      <span class="sam-tool-card-icon"><img src="assets/img/tools/${tool.id}.png" alt="" width="40" height="40" decoding="async"></span>
      <span class="sam-tool-card-label">${tool.card}</span>
    </a>`).join('');
  const active = $('sam-tools').querySelector('.is-active');
  if (active && window.matchMedia('(max-width: 760px)').matches) {
    active.scrollIntoView({ block: 'nearest', inline: 'center' });
  }
}

let activeTool = null;

function updateToolModePill() {
  if (!activeTool) return setModePill('');
  if (activeTool.admin || activeTool.adminOnly) {
    if (auth.isAdmin) setModePill('Mode administrateur', 'admin');
    else setModePill('Lecture seule', 'readonly');
  }
}

// ---------------------------------------------------------------------------
// Filtres : localisation et période
// ---------------------------------------------------------------------------
const filterState = { location: true, period: true, locationLabel: 'Localisation', hint: '', mountIn: null };

function placeFilters(target) {
  const filters = $('sam-filters');
  const host = target || $('sam-filters-home');
  if (filters.parentElement !== host) host.appendChild(filters);
  filters.classList.toggle('is-embedded', Boolean(target));
}

function applyFilterVisibility() {
  const showLocation = filterState.location;
  const showPeriod = filterState.period && Boolean(period.config);
  $('sam-filter-location').classList.toggle('hidden', !showLocation);
  $('sam-filter-period').classList.toggle('hidden', !showPeriod);
  const actions = $('sam-filter-actions');
  $('sam-filters').classList.toggle('hidden', !showLocation && !showPeriod && !actions.children.length);
  $('sam-location-label').textContent = filterState.locationLabel;
  $('sam-filter-hint').textContent = filterState.hint || '';
}

function setFilterOptions(options = {}) {
  Object.assign(filterState, {
    location: options.location ?? true,
    period: options.period ?? true,
    locationLabel: options.locationLabel || 'Localisation',
    hint: options.hint || '',
    mountIn: options.mountIn || null
  });
  placeFilters(filterState.mountIn);
  applyFilterVisibility();
}

function renderPeriodValue() {
  const current = period.get();
  $('sam-period-value').textContent = current ? current.display : '—';
  applyFilterVisibility();
}

function closePopovers() {
  document.querySelectorAll('.sam-popover').forEach(pop => pop.classList.add('hidden'));
  document.querySelectorAll('.sam-filter-button').forEach(btn => btn.setAttribute('aria-expanded', 'false'));
}

function togglePopover(button, popover, render) {
  const open = popover.classList.contains('hidden');
  closePopovers();
  if (!open) return;
  render(popover);
  hydrateIcons(popover);
  popover.classList.remove('hidden');
  button.setAttribute('aria-expanded', 'true');
}

function renderLocationPopover(pop) {
  const current = places.current;
  pop.innerHTML = `
    <div class="sam-pop-section">
      <p class="sam-pop-title">Rechercher une commune</p>
      <div class="sam-pop-search"><input class="sam-input" id="sam-pop-search-input" type="search" placeholder="Ville, commune ou code postal" autocomplete="off"></div>
      <div class="sam-pop-list" id="sam-pop-search-results"></div>
    </div>
    <div class="sam-pop-section">
      <p class="sam-pop-title">Mes lieux</p>
      <div class="sam-pop-list">
        ${places.saved.map(place => {
          const isFavorite = place.id === places.favoriteId;
          return `<div class="sam-pop-place${current?.id === place.id ? ' is-selected' : ''}" data-place-id="${escapeHtml(place.id)}">
            <button type="button" class="sam-pop-option${current?.id === place.id ? ' is-selected' : ''}" data-action="select">
              <span class="sam-radio-dot"></span>
              <span class="sam-pop-main">${escapeHtml(place.name)}<small>${escapeHtml([place.admin2, place.admin1].filter(Boolean).join(' · ') || 'France')}</small></span>
            </button>
            <button type="button" class="sam-pop-icon${isFavorite ? ' is-on' : ''}" data-action="favorite" aria-pressed="${isFavorite}" title="${isFavorite ? 'Lieu ouvert par défaut' : 'Ouvrir ce lieu par défaut'}" aria-label="${isFavorite ? `${escapeHtml(place.name)} : lieu par défaut` : `Ouvrir ${escapeHtml(place.name)} par défaut`}">${isFavorite ? icons.starFilled : icons.star}</button>
            ${places.saved.length > 1 && !isFavorite ? `<button type="button" class="sam-pop-icon" data-action="remove" title="Retirer de mes lieux" aria-label="Retirer ${escapeHtml(place.name)}">${icons.close}</button>` : '<span class="sam-pop-icon-spacer"></span>'}
          </div>`;
        }).join('')}
      </div>
    </div>
    <div class="sam-pop-section">
      <button type="button" class="sam-button" id="sam-pop-gps"><span data-icon="gps"></span>Utiliser ma position</button>
    </div>`;
  const input = pop.querySelector('#sam-pop-search-input');
  wirePlaceSearch(input, pop.querySelector('#sam-pop-search-results'), { onSelect: () => closePopovers() });
  pop.querySelectorAll('[data-place-id] [data-action]').forEach(btn => btn.addEventListener('click', () => {
    const id = btn.closest('[data-place-id]').dataset.placeId;
    const place = places.saved.find(p => p.id === id);
    if (!place) return;
    if (btn.dataset.action === 'select') {
      places.select(place);
      closePopovers();
    } else if (btn.dataset.action === 'favorite') {
      places.setFavorite(id);
      toast(`${place.name} sera ouvert par défaut.`);
      renderLocationPopover(pop);
      hydrateIcons(pop);
    } else if (btn.dataset.action === 'remove') {
      places.remove(id);
      renderLocationPopover(pop);
      hydrateIcons(pop);
    }
  }));
  pop.querySelector('#sam-pop-gps').addEventListener('click', event => useMyPosition(event.currentTarget));
  if (!window.matchMedia('(max-width: 760px)').matches) setTimeout(() => input.focus(), 20);
}

function rangeText(range) {
  if (!range?.start || !range?.end) return '';
  if (range.start === range.end) return formatDateShort(range.start);
  const sameYear = range.start.slice(0, 4) === range.end.slice(0, 4);
  return `${formatDateShort(range.start, !sameYear)} → ${formatDateShort(range.end, !sameYear)}`;
}

function renderPeriodPopover(pop) {
  const cfg = period.config;
  const current = period.get();
  if (!cfg) {
    pop.innerHTML = '<p class="sam-pop-message">Cet outil n’utilise pas de période.</p>';
    return;
  }
  const today = todayISO();
  const min = typeof cfg.min === 'function' ? cfg.min() : cfg.min;
  const max = typeof cfg.max === 'function' ? cfg.max() : cfg.max;
  const presetRows = (cfg.presets || []).map(preset => {
    const range = preset.resolve ? preset.resolve(today) : null;
    const selected = current?.preset === preset.id;
    return `<button type="button" class="sam-pop-option${selected ? ' is-selected' : ''}" data-preset="${escapeHtml(preset.id)}">
      <span class="sam-radio-dot"></span>
      <span class="sam-pop-main">${escapeHtml(preset.label)}</span>
      <span class="sam-pop-dates">${escapeHtml(preset.detail || rangeText(range))}</span>
    </button>`;
  }).join('');
  const custom = cfg.custom !== false;
  pop.innerHTML = `
    <div class="sam-pop-section">
      <p class="sam-pop-title">Période</p>
      <div class="sam-pop-list">${presetRows}</div>
    </div>
    ${custom ? `
    <div class="sam-pop-section">
      <p class="sam-pop-title">Dates personnalisées</p>
      <form class="sam-pop-dates-form" id="sam-period-custom">
        <label class="sam-field">Du<input type="date" id="sam-period-start" ${min ? `min="${min}"` : ''} ${max ? `max="${max}"` : ''} value="${current?.start || ''}" required></label>
        <label class="sam-field">Au<input type="date" id="sam-period-end" ${min ? `min="${min}"` : ''} ${max ? `max="${max}"` : ''} value="${current?.end || ''}" required></label>
        <button class="sam-button sam-button-primary" type="submit">Appliquer</button>
      </form>
      ${cfg.hint ? `<p class="sam-pop-note">${escapeHtml(cfg.hint)}</p>` : ''}
    </div>` : (cfg.hint ? `<p class="sam-pop-note">${escapeHtml(cfg.hint)}</p>` : '')}`;
  pop.querySelectorAll('[data-preset]').forEach(btn => btn.addEventListener('click', () => {
    period.set({ preset: btn.dataset.preset });
    closePopovers();
  }));
  pop.querySelector('#sam-period-custom')?.addEventListener('submit', event => {
    event.preventDefault();
    const start = pop.querySelector('#sam-period-start').value;
    const end = pop.querySelector('#sam-period-end').value;
    if (!isISODate(start) || !isISODate(end)) return;
    period.set({ start, end });
    closePopovers();
  });
}

// ---------------------------------------------------------------------------
// Montage des outils
// ---------------------------------------------------------------------------
function createContext(tool, root) {
  const cleanups = [];
  let disposed = false;
  const track = fn => { cleanups.push(fn); return fn; };

  const scope = {
    on(target, type, handler, options) {
      target.addEventListener(type, handler, options);
      track(() => target.removeEventListener(type, handler, options));
    },
    timeout(fn, ms) {
      const id = setTimeout(() => { if (!disposed) fn(); }, ms);
      track(() => clearTimeout(id));
      return id;
    },
    interval(fn, ms) {
      const id = setInterval(() => { if (!disposed) fn(); }, ms);
      track(() => clearInterval(id));
      return id;
    },
    add: track,
    get disposed() { return disposed; }
  };

  const ctx = {
    tool,
    root,
    scope,
    get supabase() { return auth.client; },
    get user() { return auth.user; },
    get isAdmin() { return auth.isAdmin; },
    onAuthChange(fn) { track(auth.onChange(() => { if (!disposed) fn(auth); })); },
    location: {
      get: () => places.current,
      onChange(fn) { track(places.onChange(event => { if (!disposed && event.type === 'current') fn(places.current); })); }
    },
    period: {
      configure: cfg => period.configure(tool.id, cfg),
      get: () => period.get(),
      set: selection => period.set(selection),
      refresh: () => period.refresh(),
      onChange(fn) { track(period.onChange((value, info) => { if (!disposed && info?.reason !== 'configure') fn(value, info); })); }
    },
    /** Options des filtres ; mountIn = élément de l'outil qui accueille les filtres. */
    filters: options => setFilterOptions(options),
    /** Emplacement à droite de la période pour les boutons propres à l'outil. */
    filterActions: () => $('sam-filter-actions'),
    stations: {
      store: stationStore,
      onChange(fn) { track(stationStore.onChange(event => { if (!disposed) fn(event); })); }
    },
    profile: {
      get data() { return profile.data; },
      load: force => profile.load(force),
      save: patch => profile.save(patch),
      onChange(fn) { track(profile.onChange(data => { if (!disposed) fn(data); })); }
    },
    ui: { toast, setMode: setModePill, openLogin: () => toast('Vous êtes déjà connecté.'), logout: handleLogout },
    loadScript,
    vendor: {
      xlsx: () => loadScript(VENDOR.xlsx),
      leaflet: async () => { await loadCss(VENDOR.leafletCss); await loadScript(VENDOR.leaflet); }
    },
    navigate: id => { window.location.hash = `#/${id}`; }
  };

  return {
    ctx,
    dispose() {
      disposed = true;
      cleanups.splice(0).reverse().forEach(fn => { try { fn(); } catch (error) { console.warn(error); } });
    }
  };
}

function destroyDetachedCharts() {
  const instances = window.Chart?.instances ? Object.values(window.Chart.instances) : [];
  instances.forEach(chart => {
    if (!chart.canvas || !document.body.contains(chart.canvas)) {
      try { chart.destroy(); } catch { /* déjà détruit */ }
    }
  });
}

function routeFromHash() {
  const id = (window.location.hash || '').replace(/^#\/?/, '').split(/[/?]/)[0];
  return TOOLS.find(t => t.id === id) || SECTIONS.find(t => t.id === id) || HIDDEN_TOOLS.find(t => t.id === id) || null;
}

function applyLayout(tool) {
  const withSidebar = tool.sidebar === 'stations';
  $('sam-app').classList.toggle('has-sidebar', withSidebar);
  $('sam-top-brand').href = `#/${storage.get('lastTool', DEFAULT_TOOL)}`;
  if (!withSidebar) closeDrawer();
  else enterStationSidebar().catch(error => console.warn(error));
}

async function mountTool(tool) {
  const token = ++mountToken;
  const root = $('sam-tool');
  closePopovers();
  closeDrawer();

  if (currentMount) {
    try { await currentMount.instance?.unmount?.(); } catch (error) { console.warn(error); }
    currentMount.dispose();
    currentMount = null;
  }
  // Les filtres ont pu être placés dans l'outil précédent : on les remet à leur place
  // avant de vider la page.
  placeFilters(null);
  root.innerHTML = '';
  root.className = `tool-root tool-${tool.id}`;
  destroyDetachedCharts();

  activeTool = tool;
  document.title = `${tool.title} — SAM Outils`;
  $('sam-title').textContent = tool.title;
  $('sam-tools').classList.toggle('hidden', Boolean(tool.section));
  if (!tool.section) renderToolCards(tool.id);
  applyLayout(tool);
  updateTopNav(tool);
  setModePill('');
  updateToolModePill();
  period.configure(tool.id, null);
  $('sam-filter-actions').innerHTML = '';
  setFilterOptions(tool.section ? { location: false, period: false } : {});
  $('sam-tool-loading').classList.remove('hidden');

  try {
    const [module] = await Promise.all([
      import(`../tools/${tool.id}.js?v=${APP_VERSION}`),
      loadCss(`css/tools/${tool.id}.css?v=${APP_VERSION}`)
    ]);
    if (token !== mountToken) return;
    const handle = createContext(tool, root);
    currentMount = { tool, dispose: handle.dispose, instance: null };
    $('sam-tool-loading').classList.add('hidden');
    const instance = await module.mount(root, handle.ctx);
    if (currentMount && currentMount.tool === tool) currentMount.instance = instance || null;
    hydrateIcons(root);
    hydrateIcons($('sam-filters'));
  } catch (error) {
    console.error(error);
    if (token !== mountToken) return;
    $('sam-tool-loading').classList.add('hidden');
    root.innerHTML = `<div class="sam-tool-error"><strong>Impossible d’ouvrir cet outil.</strong><br>${escapeHtml(error.message || String(error))}</div>`;
  }
}

function updateTopNav(tool) {
  const inData = tool?.id === 'donnees';
  const inMap = tool?.id === 'carte';
  const inAdmin = tool?.id === 'admin';
  const inTools = !tool?.section;
  const outils = $('sam-nav-outils');
  const donnees = $('sam-nav-donnees');
  const carte = $('sam-nav-carte');
  outils.href = `#/${storage.get('lastTool', DEFAULT_TOOL)}`;
  outils.classList.toggle('is-active', inTools);
  donnees.classList.toggle('is-active', inData);
  carte.classList.toggle('is-active', inMap);
  const admin = $('sam-nav-admin');
  admin.classList.toggle('is-active', inAdmin);
  $('sam-perso').classList.toggle('is-active', tool?.id === 'profil');
  [[outils, inTools], [donnees, inData], [carte, inMap], [admin, inAdmin]].forEach(([link, on]) => {
    if (on) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}

function handleRoute() {
  const tool = routeFromHash();
  if (!tool) {
    window.location.replace(`#/${storage.get('lastTool', DEFAULT_TOOL)}`);
    return;
  }
  if (TOOLS.includes(tool)) storage.set('lastTool', tool.id);
  if (currentMount?.tool?.id === tool.id) return;
  mountTool(tool);
}

// ---------------------------------------------------------------------------
// Application installable
// ---------------------------------------------------------------------------
function detectPlatform() {
  const ua = navigator.userAgent;
  const ios = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const android = /android/i.test(ua);
  if (ios) return { id: 'ios', mobile: true, safari: !/crios|fxios|edgios/i.test(ua) };
  if (android && /samsungbrowser/i.test(ua)) return { id: 'samsung', mobile: true };
  if (android && /firefox/i.test(ua)) return { id: 'firefox-android', mobile: true };
  if (android) return { id: 'android', mobile: true };
  return { id: 'desktop', mobile: false, firefox: /firefox/i.test(ua), safari: /^((?!chrome|android|edg).)*safari/i.test(ua) };
}

function installSteps(platform) {
  const intro = '<p>Une fois installée, SAM Outils apparaît avec vos autres applications et s’ouvre en plein écran, sans barre d’adresse. Elle se met à jour toute seule.</p>';
  const oldShortcut = '<p>Si vous aviez déjà ajouté un simple raccourci SAM Outils sur l’écran d’accueil, supprimez-le d’abord.</p>';
  switch (platform.id) {
    case 'ios':
      return `${intro}<p class="sam-install-platform">iPhone / iPad</p>
        <ol>${platform.safari ? '' : '<li>Ouvrez cette page dans <strong>Safari</strong> (copiez l’adresse si besoin).</li>'}
          <li>Touchez le bouton <strong>Partager</strong> (carré avec une flèche vers le haut), en bas de l’écran.</li>
          <li>Faites défiler et choisissez <strong>« Sur l’écran d’accueil »</strong>.</li>
          <li>Touchez <strong>« Ajouter »</strong> : l’icône SAM Outils apparaît sur l’écran d’accueil.</li></ol>
        <p>Sur iPhone, c’est la seule façon d’installer une application web : elle s’ouvre ensuite comme une vraie appli.</p>${oldShortcut}`;
    case 'samsung':
      return `${intro}<p class="sam-install-platform">Samsung Internet</p>
        <ol><li>Touchez l’icône <strong>Installer</strong> (flèche vers le bas) dans la barre d’adresse,</li>
          <li>ou ouvrez le menu <kbd>≡</kbd> puis <strong>« Ajouter la page à » → « Écran d’accueil »</strong>.</li>
          <li>Validez <strong>« Installer »</strong>.</li></ol>${oldShortcut}`;
    case 'firefox-android':
      return `${intro}<p class="sam-install-platform">Firefox</p>
        <ol><li>Ouvrez le menu <kbd>⋮</kbd>.</li><li>Touchez <strong>« Installer »</strong>, puis validez.</li></ol>
        <p>Si l’option n’apparaît pas, ouvrez la page dans <strong>Chrome</strong>.</p>${oldShortcut}`;
    case 'android':
      return `${intro}<p class="sam-install-platform">Android (Chrome)</p>
        <ol><li>Ouvrez le menu <kbd>⋮</kbd> en haut à droite de Chrome.</li>
          <li>Touchez <strong>« Installer l’application »</strong>. Si vous voyez plutôt « Ajouter à l’écran d’accueil », touchez-le puis choisissez <strong>« Installer »</strong>, et non « Créer un raccourci ».</li>
          <li>Validez : SAM Outils rejoint la liste de vos applications.</li></ol>${oldShortcut}`;
    default:
      if (platform.firefox || platform.safari) {
        return `${intro}<p class="sam-install-platform">Ordinateur</p><p>Ce navigateur n’installe pas les applications web. Ouvrez la page dans <strong>Chrome</strong> ou <strong>Edge</strong>, ou installez-la depuis votre téléphone.</p>`;
      }
      return `${intro}<p class="sam-install-platform">Ordinateur (Chrome, Edge)</p>
        <ol><li>Cliquez sur l’icône <strong>Installer</strong> (écran avec une flèche) à droite de la barre d’adresse,</li>
          <li>ou cherchez <strong>« Installer SAM Outils »</strong> dans le menu <kbd>⋮</kbd> du navigateur.</li></ol>`;
  }
}

function initPwa() {
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || local)) {
    navigator.serviceWorker.register('./service-worker.js').catch(error => console.warn('Service worker non enregistré', error));
  }
  const platform = detectPlatform();
  const standaloneQuery = window.matchMedia('(display-mode: standalone)');
  const isStandalone = () => standaloneQuery.matches || navigator.standalone === true;
  const topButton = $('sam-install');
  const banner = $('sam-install-banner');
  const dialog = $('sam-install-dialog');
  const DISMISS_KEY = 'installBannerDismissedAt';

  function refresh() {
    const installed = isStandalone();
    const dismissedAt = Number(storage.get(DISMISS_KEY, 0)) || 0;
    const recentlyDismissed = Date.now() - dismissedAt < 30 * 24 * 3600 * 1000;
    const canOffer = !installed && (platform.mobile || Boolean(deferredInstall));
    topButton.classList.toggle('hidden', !canOffer);
    banner.classList.toggle('hidden', !canOffer || !platform.mobile || recentlyDismissed);
  }

  async function install() {
    if (deferredInstall) {
      const prompt = deferredInstall;
      deferredInstall = null;
      prompt.prompt();
      const choice = await prompt.userChoice.catch(() => null);
      if (choice?.outcome !== 'accepted') toast('Installation annulée. Vous pourrez la relancer avec le bouton « Installer ».');
      refresh();
      return;
    }
    $('sam-install-steps').innerHTML = installSteps(platform);
    closeDrawer();
    if (typeof dialog.showModal === 'function') dialog.showModal();
  }

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstall = event;
    refresh();
  });
  window.addEventListener('appinstalled', () => {
    deferredInstall = null;
    refresh();
    toast('SAM Outils est installée sur cet appareil.');
  });
  standaloneQuery.addEventListener?.('change', refresh);

  [topButton, $('sam-install-banner-go')].forEach(button => button.addEventListener('click', install));
  $('sam-install-banner-close').addEventListener('click', () => {
    storage.set(DISMISS_KEY, Date.now());
    refresh();
  });
  $('sam-install-close').addEventListener('click', () => dialog.close());
  $('sam-install-ok').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  refresh();
}

// ---------------------------------------------------------------------------
// Démarrage (après connexion)
// ---------------------------------------------------------------------------
export function startShell() {
  if (started) return;
  started = true;
  $('sam-app').hidden = false;
  hydrateIcons(document);
  $('sam-version').textContent = `SAM v${window.SAM_CONFIG?.version || '2.0.0'}`;

  // Bandeau des stations (onglet Données)
  ['sam-stations-fav', 'sam-stations-others', 'sam-stations-pending'].forEach(id => $(id).addEventListener('click', handleStationListClick));
  $('sam-stations-toggle').addEventListener('click', () => {
    const { favorites } = stationStore.groups();
    const open = sideState.showOthers ?? !favorites.length;
    sideState.showOthers = !open;
    renderStationSidebar();
  });
  stationStore.onChange(() => renderStationSidebar());
  profile.onChange(() => {
    renderAuth();
    if ($('sam-app').classList.contains('has-sidebar')) {
      stationStore.ensureSelection();
      renderStationSidebar();
    }
  });
  $('sam-collapse').addEventListener('click', () => setCollapsed(true));
  $('sam-expand').addEventListener('click', () => setCollapsed(false));
  if (storage.get('sidebarCollapsed', false)) $('sam-app').classList.add('is-collapsed');
  $('sam-burger').addEventListener('click', () => ($('sam-app').classList.contains('drawer-open') ? closeDrawer() : openDrawer()));
  $('sam-drawer-backdrop').addEventListener('click', closeDrawer);

  // Lieux des outils
  renderLocationValue();
  places.onChange(() => renderLocationValue());

  // Compte
  renderAuth();
  auth.onChange(() => renderAuth());
  profile.load().then(renderAuth).catch(() => {});
  $('sam-logout').addEventListener('click', handleLogout);

  // Filtres
  $('sam-location-button').addEventListener('click', event => {
    event.stopPropagation();
    togglePopover($('sam-location-button'), $('sam-location-popover'), renderLocationPopover);
  });
  $('sam-period-button').addEventListener('click', event => {
    event.stopPropagation();
    togglePopover($('sam-period-button'), $('sam-period-popover'), renderPeriodPopover);
  });
  document.querySelectorAll('.sam-popover').forEach(pop => pop.addEventListener('click', event => event.stopPropagation()));
  document.addEventListener('click', closePopovers);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      closePopovers();
      closeDrawer();
    }
  });
  period.onChange(() => renderPeriodValue());

  initPwa();
  window.addEventListener('hashchange', handleRoute);
  handleRoute();
}
