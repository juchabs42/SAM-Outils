// SAM Cartographie — toutes les stations du réseau SAM sur une carte.
// Survol : dernières mesures de la station ; clic : ouverture de ses données (onglet Données).
// Les stations trop proches pour être distinguées à l'échelle affichée sont regroupées
// en une pastille numérotée ; un clic sur la pastille zoome sur le groupe.
import { stationState } from '../core/stations.js';
import { formatNumber, formatDateShort, escapeHtml } from '../core/util.js';

const TZ = 'Europe/Paris';
const HOUR = 3600000;
const PAGE = 1000;
const MAX_ZOOM = 19;
const CLUSTER_MAX_ZOOM = 15;     // au-delà, chaque station est affichée seule
const CLUSTER_RADIUS = 30;       // px : en dessous, deux stations se chevauchent
const DOT = 22;                  // diamètre d'une station (px)
const RING = 40;                 // diamètre d'un groupe (px)

const STATES = [
  { key: 'ok', label: 'Transmet', color: '#2e7d32' },
  { key: 'late', label: 'En retard', color: '#e08a00' },
  { key: 'silent', label: 'Muette', color: '#8a9099' },
  { key: 'off', label: 'Collecte arrêtée', color: '#5f6670' },
  { key: 'never', label: 'Aucune donnée', color: '#b8bcc4' },
  { key: 'pending', label: 'Pas encore installée', color: '#cdd1d7' }
];
const STATE_ORDER = Object.fromEntries(STATES.map((s, i) => [s.key, i]));

const IGN = layer => `https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layer}&STYLE=normal&FORMAT=${layer.startsWith('ORTHO') ? 'image/jpeg' : 'image/png'}&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}`;

const TEMPLATE = `
<div class="carte-main">
  <div class="carte-setup hidden" id="carteSetup"></div>
  <section class="carte-card">
    <div class="carte-map" id="carteMap" aria-label="Carte des stations du réseau SAM"></div>
    <div class="carte-foot">
      <div class="carte-legend" id="carteLegend" aria-label="Légende"></div>
      <p class="carte-hint" id="carteHint"></p>
    </div>
    <p class="carte-admin hidden" id="carteAdmin"></p>
  </section>
</div>`;

// Vue de la carte gardée le temps de la session : en revenant des Données,
// on retrouve la carte telle qu'on l'a laissée.
let savedView = null;

const dayKeyFormat = new Intl.DateTimeFormat('fr-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const hourFormat = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
const num = value => (value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? null : Number(value));
const located = s => Number.isFinite(s.latitude) && Number.isFinite(s.longitude);

function whenLabel(date) {
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return 'à l’instant';
  if (minutes < 60) return `il y a ${minutes} min`;
  if (minutes < 24 * 60) return `il y a ${Math.round(minutes / 60)} h`;
  return `le ${formatDateShort(dayKeyFormat.format(date))} à ${hourFormat.format(date)}`;
}

export async function mount(root, ctx) {
  root.innerHTML = TEMPLATE;
  const $ = id => root.querySelector(`#${id}`);
  const store = ctx.stations.store;
  // Avec une souris : infobulle au survol, clic = données. Sans souris (téléphone,
  // tablette) : un toucher ouvre une fiche avec un bouton « Voir les données ».
  const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  let map = null;
  let layer = null;
  let latest = new Map();
  let latestLoaded = false;

  $('carteHint').textContent = canHover
    ? 'Survolez une station pour voir ses dernières mesures, cliquez dessus pour ouvrir ses données. Les pastilles numérotées regroupent des stations voisines : cliquez pour zoomer.'
    : 'Touchez une station pour voir ses dernières mesures et ouvrir ses données. Les pastilles numérotées regroupent des stations voisines : touchez pour zoomer.';

  // ---------------------------------------------------------------------------
  // Données
  // ---------------------------------------------------------------------------
  async function loadLatest() {
    const since = new Date(Date.now() - 24 * HOUR).toISOString();
    const rows = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await ctx.supabase.from('station_mesures')
        .select('station_id,mesure_le,t_air,hr,pluie')
        .gte('mesure_le', since)
        .order('mesure_le', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      rows.push(...(data || []));
      if (!data || data.length < PAGE) break;
    }
    const next = new Map();
    rows.forEach(row => {
      const entry = next.get(row.station_id) || { t: null, hr: null, rain: 0 };
      if (num(row.t_air) !== null) entry.t = num(row.t_air);
      if (num(row.hr) !== null) entry.hr = num(row.hr);
      entry.rain += num(row.pluie) || 0;
      next.set(row.station_id, entry);
    });
    latest = next;
    latestLoaded = true;
  }

  // Une station pas encore installée n'a pas de données : seuls les administrateurs l'ouvrent
  // (pour compléter sa fiche).
  const canOpen = station => station.installee !== false || ctx.isAdmin;

  function openStation(id) {
    store.select(id);
    ctx.navigate('donnees');
  }

  // ---------------------------------------------------------------------------
  // Contenu des infobulles
  // ---------------------------------------------------------------------------
  function stationHtml(station, action) {
    const state = stationState(station);
    const info = latest.get(station.id);
    const sub = [station.commune, Number.isFinite(station.altitude) ? `${Math.round(station.altitude)} m` : ''].filter(Boolean).join(' · ');
    const when = station.derniere_mesure && state.key !== 'pending' ? ` · ${whenLabel(new Date(station.derniere_mesure))}` : '';
    let values = '';
    if (info) {
      values = `<span class="carte-tip-values">
        <span><b>${formatNumber(info.t, 1)}</b> °C</span>
        <span><b>${formatNumber(info.hr, 0)}</b> % HR</span>
        <span>Pluie 24 h <b>${formatNumber(info.rain, 1)}</b> mm</span>
      </span>`;
    } else if (!latestLoaded && state.key !== 'pending') {
      values = '<span class="carte-tip-values is-loading">Dernières mesures en cours de chargement…</span>';
    }
    return `<div class="carte-tip">
      <strong class="carte-tip-name">${escapeHtml(station.nom)}</strong>
      ${sub ? `<span class="carte-tip-sub">${escapeHtml(sub)}</span>` : ''}
      <span class="carte-tip-state is-${state.key}">${escapeHtml(state.label)}${escapeHtml(when)}</span>
      ${values}
      ${action}
    </div>`;
  }

  function groupHtml(items) {
    const shown = items.slice(0, 8);
    const rows = shown.map(s => {
      const state = stationState(s);
      const t = latest.get(s.id)?.t;
      const detail = state.key === 'ok' || state.key === 'late'
        ? (t === null || t === undefined ? state.label : `${formatNumber(t, 1)} °C`)
        : state.label;
      return `<li><i class="is-${state.key}"></i><span>${escapeHtml(s.nom)}</span><em>${escapeHtml(detail)}</em></li>`;
    }).join('');
    const more = items.length > shown.length ? `<li class="carte-tip-more">+ ${items.length - shown.length} autre${items.length - shown.length > 1 ? 's' : ''}</li>` : '';
    return `<div class="carte-tip is-group">
      <strong class="carte-tip-name">${items.length} stations voisines</strong>
      <ul class="carte-tip-list">${rows}${more}</ul>
      <span class="carte-tip-cta">${canHover ? 'Cliquer' : 'Toucher'} pour zoomer</span>
    </div>`;
  }

  // ---------------------------------------------------------------------------
  // Carte
  // ---------------------------------------------------------------------------
  async function ensureMap() {
    if (map) return true;
    await ctx.vendor.leaflet();
    if (ctx.scope.disposed || typeof window.L === 'undefined') return false;
    const L = window.L;
    map = L.map($('carteMap'), { zoomControl: true, scrollWheelZoom: true, maxZoom: MAX_ZOOM });
    const plan = L.tileLayer(IGN('GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2'), { maxZoom: MAX_ZOOM, attribution: '© IGN – Géoplateforme' });
    const ortho = L.tileLayer(IGN('ORTHOIMAGERY.ORTHOPHOTOS'), { maxZoom: MAX_ZOOM, attribution: '© IGN – Géoplateforme' });
    // Vue satellite (photos aériennes IGN) par défaut ; le plan reste disponible.
    ortho.addTo(map);
    L.control.layers({ 'Photos aériennes IGN': ortho, 'Plan IGN': plan }, null, { collapsed: true }).addTo(map);
    L.control.scale({ imperial: false }).addTo(map);
    layer = L.layerGroup().addTo(map);

    const points = store.list.filter(located);
    if (savedView) map.setView(savedView.center, savedView.zoom, { animate: false });
    else if (points.length > 1) map.fitBounds(L.latLngBounds(points.map(s => [s.latitude, s.longitude])), { padding: [48, 48], maxZoom: 12, animate: false });
    else if (points.length === 1) map.setView([points[0].latitude, points[0].longitude], 12, { animate: false });
    else map.setView([43.85, 4.2], 8, { animate: false });

    map.on('zoomend', renderMarkers);
    map.on('moveend', () => { savedView = { center: map.getCenter(), zoom: map.getZoom() }; });
    // Bouton « Voir les données » des fiches (écrans tactiles)
    map.on('popupopen', event => {
      const button = event.popup.getElement()?.querySelector('.carte-open');
      if (button) button.addEventListener('click', () => openStation(button.dataset.station), { once: true });
    });

    const observer = new ResizeObserver(() => map?.invalidateSize());
    observer.observe($('carteMap'));
    ctx.scope.add(() => { observer.disconnect(); map?.remove(); map = null; });
    return true;
  }

  // Infobulle placée du côté où elle tient dans la carte (au-dessus de préférence) :
  // près d'un bord, elle passe dessous ou sur le côté au lieu d'être coupée.
  function placeTooltip(marker, radius) {
    const tooltip = marker.getTooltip();
    const el = tooltip?.getElement();
    if (!el || !map) return;
    const size = map.getSize();
    const pt = map.latLngToContainerPoint(marker.getLatLng());
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const gap = radius + 2;
    const reach = gap + 6;   // + flèche de l'infobulle
    const boxes = {
      top: [pt.x - w / 2, pt.y - reach - h],
      bottom: [pt.x - w / 2, pt.y + reach],
      right: [pt.x + reach, pt.y - h / 2],
      left: [pt.x - reach - w, pt.y - h / 2]
    };
    const overflow = ([x, y]) => Math.max(0, 6 - x) + Math.max(0, x + w - size.x + 6) + Math.max(0, 6 - y) + Math.max(0, y + h - size.y + 6);
    const direction = Object.keys(boxes).reduce((best, key) => (overflow(boxes[key]) < overflow(boxes[best]) ? key : best), 'top');
    if (tooltip.options.direction === direction) return;
    tooltip.options.direction = direction;
    tooltip.options.offset = { top: [0, -gap], bottom: [0, gap], right: [gap, 0], left: [-gap, 0] }[direction];
    tooltip.update();
  }

  function attachTooltip(marker, html, radius) {
    marker.bindTooltip(html, { direction: 'top', offset: [0, -(radius + 2)], opacity: 1, className: 'carte-tooltip' });
    marker.on('tooltipopen', () => placeTooltip(marker, radius));
  }

  // Regroupe les stations qui se chevauchent à l'échelle affichée (en pixels).
  function clusters(stations) {
    const zoom = map.getZoom();
    const sorted = [...stations].sort((a, b) =>
      (STATE_ORDER[stationState(a).key] - STATE_ORDER[stationState(b).key]) || a.id.localeCompare(b.id));
    const groups = [];
    sorted.forEach(station => {
      const point = map.project([station.latitude, station.longitude], zoom);
      const group = zoom <= CLUSTER_MAX_ZOOM ? groups.find(g => g.seed.distanceTo(point) < CLUSTER_RADIUS) : null;
      if (group) group.items.push(station);
      else groups.push({ seed: point, items: [station] });
    });
    return groups;
  }

  function stationMarker(station) {
    const L = window.L;
    const state = stationState(station);
    const clickable = canOpen(station);
    const marker = L.marker([station.latitude, station.longitude], {
      icon: L.divIcon({
        className: `carte-marker${clickable ? '' : ' is-static'}`,
        html: `<span class="carte-dot is-${state.key}"></span>`,
        iconSize: [DOT, DOT],
        iconAnchor: [DOT / 2, DOT / 2],
        popupAnchor: [0, -DOT / 2]
      }),
      keyboard: true,
      riseOnHover: true,
      riseOffset: 5000,
      zIndexOffset: state.key === 'pending' ? 0 : 1000
    });
    if (canHover) {
      attachTooltip(marker, stationHtml(station, clickable ? '<span class="carte-tip-cta">Cliquer pour voir les données →</span>' : ''), DOT / 2);
      if (clickable) {
        marker.on('click', () => openStation(station.id));
        marker.on('keypress', event => { if (event.originalEvent.key === 'Enter') openStation(station.id); });
      }
    } else {
      marker.bindPopup(stationHtml(station, clickable ? `<button type="button" class="carte-open" data-station="${escapeHtml(station.id)}">Voir les données</button>` : ''), {
        className: 'carte-popup', closeButton: true, maxWidth: 300
      });
    }
    marker.on('add', () => {
      const el = marker.getElement();
      el?.setAttribute('aria-label', `${station.nom} — ${state.label}${clickable ? ' : ouvrir les données' : ''}`);
      if (!clickable) el?.setAttribute('role', 'img');
    });
    return marker;
  }

  function groupMarker(items) {
    const L = window.L;
    const lat = items.reduce((sum, s) => sum + s.latitude, 0) / items.length;
    const lng = items.reduce((sum, s) => sum + s.longitude, 0) / items.length;
    // Anneau coloré : part de chaque état dans le groupe
    let at = 0;
    const stops = STATES.map(def => {
      const share = items.filter(s => stationState(s).key === def.key).length / items.length * 100;
      if (!share) return null;
      const stop = `${def.color} ${at.toFixed(2)}% ${(at + share).toFixed(2)}%`;
      at += share;
      return stop;
    }).filter(Boolean).join(', ');
    const marker = L.marker([lat, lng], {
      icon: L.divIcon({
        className: 'carte-cluster',
        html: `<span class="carte-cluster-ring" style="background: conic-gradient(${stops})"><b>${items.length}</b></span>`,
        iconSize: [RING, RING],
        iconAnchor: [RING / 2, RING / 2]
      }),
      keyboard: true,
      riseOnHover: true,
      riseOffset: 5000,
      zIndexOffset: 2000
    });
    const zoomIn = () => {
      marker.closeTooltip();
      map.flyToBounds(L.latLngBounds(items.map(s => [s.latitude, s.longitude])), { padding: [70, 70], maxZoom: CLUSTER_MAX_ZOOM + 1, duration: 0.6 });
    };
    if (canHover) attachTooltip(marker, groupHtml(items), RING / 2);
    marker.on('click', zoomIn);
    marker.on('keypress', event => { if (event.originalEvent.key === 'Enter') zoomIn(); });
    marker.on('add', () => marker.getElement()?.setAttribute('aria-label', `${items.length} stations voisines : ${items.map(s => s.nom).join(', ')}. Zoomer sur le groupe`));
    return marker;
  }

  function renderLegend(stations) {
    const counts = {};
    stations.forEach(s => { const key = stationState(s).key; counts[key] = (counts[key] || 0) + 1; });
    $('carteLegend').innerHTML = STATES.filter(def => counts[def.key])
      .map(def => `<span><i class="is-${def.key}"></i>${escapeHtml(def.label)} <b>${counts[def.key]}</b></span>`).join('');
  }

  function renderMarkers() {
    if (!map || !window.L) return;
    layer.clearLayers();
    const points = store.list.filter(located);
    clusters(points).forEach(group => {
      (group.items.length > 1 ? groupMarker(group.items) : stationMarker(group.items[0])).addTo(layer);
    });
    renderLegend(points);
    const missing = store.list.filter(s => !located(s));
    $('carteAdmin').textContent = missing.length
      ? `Sans coordonnées, donc absentes de la carte : ${missing.map(s => s.nom).join(', ')}. Les coordonnées se saisissent dans la « Fiche station » de l’onglet Données.`
      : '';
    $('carteAdmin').classList.toggle('hidden', !ctx.isAdmin || !missing.length);
  }

  async function refresh(force = false) {
    await store.load(force);
    if (ctx.scope.disposed) return;
    if (store.error) {
      const missing = /relation|does not exist|schema cache/i.test(store.error.message || '');
      $('carteSetup').textContent = missing ? 'Les stations ne sont pas encore créées dans Supabase.' : `Stations indisponibles : ${store.error.message || store.error}`;
      $('carteSetup').classList.remove('hidden');
      return;
    }
    $('carteSetup').classList.add('hidden');
    // La carte s'affiche tout de suite ; les dernières mesures complètent les infobulles ensuite.
    if (!(await ensureMap())) return;
    renderMarkers();
    try {
      await loadLatest();
    } catch (error) {
      console.warn('Dernières mesures indisponibles', error);
      latestLoaded = true;
    }
    if (!ctx.scope.disposed) renderMarkers();
  }

  ctx.onAuthChange(() => renderMarkers());
  ctx.scope.interval(() => { if (document.visibilityState === 'visible') refresh(true); }, 10 * 60 * 1000);

  await refresh();
  return {};
}
