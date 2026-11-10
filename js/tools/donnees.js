// SAM Données — stations du réseau SAM (Comsag / TCSD).
// Les mesures horaires sont collectées par la base Supabase (fichier supabase/stations.sql) :
// le site ne contacte jamais Comsag directement, le jeton d'accès reste côté serveur.
import { presets } from '../core/period.js';
import { todayISO, addDaysISO, diffDaysISO, formatNumber, formatDayMonth, formatDateShort, escapeHtml, storage } from '../core/util.js';

const TZ = 'Europe/Paris';
const DATA_START = '2026-09-01';
const PAGE = 1000;
const HOUR = 3600000;
const LATE_HOURS = 3;
const SILENT_HOURS = 48;
const COLORS = { temp: '#db0b1f', tmin: '#3b8ad9', tmoy: '#7f1d2d', hr: '#2e7d32', rain: '#3b8ad9', cumul: '#1f3b63' };
const SENSOR_COLORS = ['#7c3aed', '#0f766e', '#b45309', '#be185d', '#475569', '#0891b2'];
const BASE_SENSORS = {
  t1: ['Température de l’air', '°C'], hyg1: ['Hygrométrie de l’air', '%'], pluv: ['Pluviométrie', 'mm'],
  hum: ['Humectation du feuillage', '%'], bat: ['Batterie', 'V'],
  ts1: ['Tensiomètre 1', 'cb'], ts2: ['Tensiomètre 2', 'cb'], ts4: ['Tensiomètre 4', 'cb'], ts5: ['Tensiomètre 5', 'cb'],
  decagon1: ['Humidité du sol 1', '%'], decagon2: ['Humidité du sol 2', '%']
};
// Un graphique par famille de capteurs (même unité, même lecture).
const SENSOR_GROUPS = [
  { id: 'tensio', title: 'Tensiomètres', unit: 'cb', hint: 'Plus la valeur est élevée, plus le sol est sec.', test: code => /^ts\d+$/.test(code) },
  { id: 'sol', title: 'Humidité du sol', unit: '%', hint: 'Sondes Decagon : plus la valeur est élevée, plus le sol est humide.', test: code => /^decagon\d+$/.test(code) },
  { id: 'humect', title: 'Humectation du feuillage', unit: '%', hint: '', test: code => code === 'hum' },
  { id: 'autres', title: 'Autres capteurs', unit: '', hint: '', test: () => true }
];

const TEMPLATE = `
<div class="don-main">
  <section class="don-card" id="donNetwork">
    <header class="don-card-head">
      <div>
        <p class="don-kicker">Réseau SAM</p>
        <h2>Stations connectées</h2>
        <p class="don-sub" id="donNetworkSummary">Chargement…</p>
      </div>
      <div class="don-head-actions">
        <div class="don-seg" role="group" aria-label="Affichage">
          <button type="button" data-view="liste" class="is-active">Liste</button>
          <button type="button" data-view="carte">Carte</button>
        </div>
        <button class="don-btn don-admin hidden" type="button" id="donSyncAll">Synchroniser le réseau</button>
      </div>
    </header>
    <div id="donListView" class="don-table-wrap">
      <table class="don-table don-stations">
        <thead><tr><th>Station</th><th>État</th><th>Dernière mesure</th><th>Temp.</th><th>Humidité</th><th>Pluie 24 h</th><th>Batterie</th></tr></thead>
        <tbody id="donStationsBody"><tr><td colspan="7" class="don-empty">Chargement…</td></tr></tbody>
      </table>
    </div>
    <div id="donMapView" class="hidden">
      <div id="donMap" class="don-map" aria-label="Carte des stations"></div>
      <div class="don-map-legend" aria-label="Légende de la carte">
        <span><i class="is-ok"></i>Transmet</span><span><i class="is-late"></i>En retard</span><span><i class="is-silent"></i>Muette</span><span><i class="is-pending"></i>Pas encore installée</span>
      </div>
      <p class="don-hint" id="donMapHint"></p>
    </div>
  </section>

  <section class="don-card" id="donStation">
    <header class="don-card-head">
      <div class="don-station-pick">
        <label for="donStationSelect" class="don-kicker">Station</label>
        <div class="don-station-line">
          <select id="donStationSelect" aria-label="Choisir une station"></select>
          <span id="donStationState" class="don-state"></span>
        </div>
      </div>
      <div class="don-head-actions">
        <button class="don-btn don-admin hidden" type="button" id="donSyncOne">Synchroniser</button>
        <button class="don-btn don-admin hidden" type="button" id="donEditStation">Fiche station</button>
        <button class="don-btn" type="button" id="donExportHourly">Export horaire</button>
        <button class="don-btn" type="button" id="donExportDaily">Export journalier</button>
      </div>
    </header>
    <p class="don-meta" id="donStationMeta"></p>
    <div class="don-kpis" id="donKpis"></div>
    <p class="don-note hidden" id="donNote"></p>
    <div class="don-charts">
      <article class="don-chart-card">
        <h3>Température et humidité</h3>
        <div class="don-chart"><canvas id="donTempChart" aria-label="Température et humidité"></canvas></div>
      </article>
      <article class="don-chart-card">
        <h3>Pluie</h3>
        <div class="don-chart"><canvas id="donRainChart" aria-label="Pluie"></canvas></div>
      </article>
      <div class="don-sensor-charts" id="donSensorCharts"></div>
    </div>
    <div class="don-daily">
      <h3>Résumé journalier</h3>
      <div class="don-table-wrap">
        <table class="don-table">
          <thead><tr><th>Jour</th><th>T min</th><th>T max</th><th>T moy.</th><th>HR moy.</th><th>Pluie</th><th>Mesures</th></tr></thead>
          <tbody id="donDailyBody"></tbody>
        </table>
      </div>
    </div>
  </section>

  <dialog class="sam-dialog don-dialog" id="donStationDialog" aria-labelledby="donDialogTitle">
    <form class="don-form" id="donStationForm" method="dialog">
      <div class="sam-dialog-head">
        <div><p class="sam-kicker">Fiche station</p><h2 id="donDialogTitle">Station</h2></div>
        <button class="sam-icon-button" type="button" id="donDialogClose" aria-label="Fermer"><span data-icon="close"></span></button>
      </div>
      <label class="sam-field">Nom affiché<input id="donFieldName" type="text" required maxlength="80"></label>
      <label class="sam-field">Commune<input id="donFieldCommune" type="text" maxlength="80"></label>
      <div class="don-form-row">
        <label class="sam-field">Latitude<input id="donFieldLat" type="number" step="0.00001" min="-90" max="90" placeholder="43.6343"></label>
        <label class="sam-field">Longitude<input id="donFieldLon" type="number" step="0.00001" min="-180" max="180" placeholder="4.1706"></label>
        <label class="sam-field">Altitude (m)<input id="donFieldAlt" type="number" step="1"></label>
      </div>
      <label class="sam-field">Commentaire<textarea id="donFieldComment" rows="2" maxlength="400"></textarea></label>
      <label class="don-check"><input id="donFieldActive" type="checkbox"> Collecte automatique active</label>
      <label class="don-check"><input id="donFieldPublic" type="checkbox"> Visible sans compte (consultation libre)</label>
      <label class="don-check"><input id="donFieldInstalled" type="checkbox"> Station installée sur le terrain</label>
      <p class="sam-form-message" id="donFormMessage" role="status"></p>
      <button class="sam-button sam-button-primary" type="submit">Enregistrer</button>
    </form>
  </dialog>
</div>`;

// ---------------------------------------------------------------------------
// Dates (heure de Paris)
// ---------------------------------------------------------------------------
const dayKeyFormat = new Intl.DateTimeFormat('fr-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const hourFormat = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
const dayKey = date => dayKeyFormat.format(date);
const hourOf = date => hourFormat.format(date);

function parisOffsetMinutes(iso) {
  const label = new Date(`${iso}T12:00:00Z`).toLocaleString('en-US', { timeZone: TZ, timeZoneName: 'shortOffset' });
  const m = label.match(/GMT([+-]\d{1,2})(?::(\d{2}))?/);
  if (!m) return 60;
  const h = Number(m[1]);
  return h * 60 + Math.sign(h || 1) * Number(m[2] || 0);
}
function parisInstant(iso, endOfDay = false) {
  const offset = parisOffsetMinutes(iso);
  const sign = offset >= 0 ? '+' : '-';
  const abs = Math.abs(offset);
  const tz = `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
  return new Date(`${iso}T${endOfDay ? '23:59:59' : '00:00:00'}${tz}`);
}
function whenLabel(date) {
  if (!date) return '—';
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return 'à l’instant';
  if (minutes < 60) return `il y a ${minutes} min`;
  if (minutes < 24 * 60) return `il y a ${Math.round(minutes / 60)} h`;
  return `le ${formatDateShort(dayKey(date))} à ${hourOf(date)}`;
}
function stateOf(station) {
  const hours = station.derniere_mesure ? (Date.now() - new Date(station.derniere_mesure).getTime()) / HOUR : Infinity;
  if (station.installee === false && hours > SILENT_HOURS) return { key: 'pending', label: 'Pas encore installée' };
  if (!station.derniere_mesure) return { key: 'never', label: 'Aucune donnée' };
  if (!station.active) return { key: 'off', label: 'Collecte arrêtée' };
  if (hours <= LATE_HOURS) return { key: 'ok', label: 'Transmet' };
  if (hours <= SILENT_HOURS) return { key: 'late', label: 'En retard' };
  return { key: 'silent', label: 'Muette' };
}
const num = value => (value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? null : Number(value));
const round = (value, digits = 1) => (value === null ? null : Math.round(value * 10 ** digits) / 10 ** digits);
const csvNumber = value => (value === null || value === undefined ? '' : String(value).replace('.', ','));

export async function mount(root, ctx) {
  root.innerHTML = TEMPLATE;
  const $ = id => root.querySelector(`#${id}`);
  const supabase = ctx.supabase;
  const charts = {};
  let stations = [];
  let sensorLabels = {};
  let latest = new Map();
  let selectedId = storage.get('donnees.station', null);
  let hourly = [];
  let loadToken = 0;
  let map = null;
  let mapLayer = null;
  let view = 'liste';
  let showSilent = false;

  ctx.filters({ location: false, period: true });
  ctx.period.configure({
    presets: [
      presets.lastDays(2, '48 dernières heures'),
      presets.lastDays(7),
      presets.lastDays(30),
      { id: 'all', label: 'Depuis le début des mesures', resolve: today => ({ start: DATA_START, end: today }) }
    ],
    defaultPreset: 'last7',
    min: DATA_START,
    max: () => todayISO(),
    hint: 'Mesures horaires des stations Comsag du réseau SAM, collectées automatiquement toutes les 30 minutes.'
  });

  const isAdmin = () => Boolean(ctx.isAdmin);
  const sensorName = code => sensorLabels[code]?.libelle || BASE_SENSORS[code]?.[0] || code;
  const sensorUnit = code => sensorLabels[code]?.unite || BASE_SENSORS[code]?.[1] || '';
  const selected = () => stations.find(s => s.id === selectedId) || null;

  function renderAdmin() {
    root.querySelectorAll('.don-admin').forEach(el => el.classList.toggle('hidden', !isAdmin()));
  }

  // -------------------------------------------------------------------------
  // Chargement
  // -------------------------------------------------------------------------
  async function fetchAll(build) {
    const rows = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await build().range(from, from + PAGE - 1);
      if (error) throw error;
      rows.push(...(data || []));
      if (!data || data.length < PAGE) break;
    }
    return rows;
  }

  async function loadStations() {
    const [st, caps] = await Promise.all([
      supabase.from('stations').select('*').order('nom'),
      supabase.from('station_capteurs').select('*').order('ordre')
    ]);
    if (st.error) throw st.error;
    stations = st.data || [];
    sensorLabels = Object.fromEntries((caps.data || []).map(c => [c.code, c]));
    if (!selected()) {
      const firstActive = stations.find(s => stateOf(s).key === 'ok') || stations.find(s => s.derniere_mesure) || stations[0];
      selectedId = firstActive?.id || null;
    }
  }

  async function loadLatest() {
    const since = new Date(Date.now() - 24 * HOUR).toISOString();
    const rows = await fetchAll(() => supabase.from('station_mesures')
      .select('station_id,mesure_le,t_air,hr,pluie,autres')
      .gte('mesure_le', since)
      .order('mesure_le', { ascending: true }));
    latest = new Map();
    rows.forEach(row => {
      const entry = latest.get(row.station_id) || { last: null, rain: 0 };
      entry.last = row;
      entry.rain += num(row.pluie) || 0;
      latest.set(row.station_id, entry);
    });
  }

  async function loadStationData() {
    const station = selected();
    const p = ctx.period.get();
    if (!station || !p?.start) { hourly = []; return; }
    const token = ++loadToken;
    const rows = await fetchAll(() => supabase.from('station_mesures')
      .select('mesure_le,t_air,hr,pluie,autres')
      .eq('station_id', station.id)
      .gte('mesure_le', parisInstant(p.start).toISOString())
      .lte('mesure_le', parisInstant(p.end, true).toISOString())
      .order('mesure_le', { ascending: true }));
    if (token !== loadToken) return;
    hourly = rows.map(row => ({
      at: new Date(row.mesure_le),
      t: num(row.t_air),
      hr: num(row.hr),
      rain: num(row.pluie),
      others: row.autres || {}
    }));
  }

  // -------------------------------------------------------------------------
  // Réseau
  // -------------------------------------------------------------------------
  function renderNetwork() {
    const body = $('donStationsBody');
    if (!stations.length) {
      body.innerHTML = '<tr><td colspan="7" class="don-empty">Aucune station visible pour le moment.</td></tr>';
      $('donNetworkSummary').textContent = '';
      return;
    }
    const order = { ok: 0, late: 1, silent: 2, off: 3, never: 4, pending: 5 };
    const sorted = [...stations].sort((a, b) => order[stateOf(a).key] - order[stateOf(b).key] || a.nom.localeCompare(b.nom, 'fr'));
    // Les stations pas encore installées sont repliées (sauf la station choisie).
    const shown = s => stateOf(s).key !== 'pending' || s.id === selectedId;
    const hiddenCount = sorted.filter(s => !shown(s)).length;
    const anyShown = sorted.some(s => stateOf(s).key !== 'pending');
    const visible = showSilent || !anyShown ? sorted : sorted.filter(shown);
    body.innerHTML = visible.map(station => {
      const state = stateOf(station);
      const info = latest.get(station.id);
      const last = info?.last;
      const bat = num(last?.autres?.bat);
      return `<tr class="${station.id === selectedId ? 'is-selected' : ''}" data-station="${escapeHtml(station.id)}" tabindex="0">
        <td data-label="Station"><strong>${escapeHtml(station.nom)}</strong>${station.commune ? `<small>${escapeHtml(station.commune)}</small>` : ''}${!station.publique ? '<small class="don-private">Non publique</small>' : ''}</td>
        <td data-label="État"><span class="don-state is-${state.key}"${station.derniere_erreur ? ` title="${escapeHtml(station.derniere_erreur)}"` : ''}>${state.label}${station.derniere_erreur ? ' ⚠' : ''}</span></td>
        <td data-label="Dernière mesure" class="don-col-when">${station.derniere_mesure ? whenLabel(new Date(station.derniere_mesure)) : '—'}</td>
        <td data-label="Temp." class="don-col-value">${last ? `${formatNumber(num(last.t_air), 1)} °C` : '—'}</td>
        <td data-label="Humidité" class="don-col-value">${last ? `${formatNumber(num(last.hr), 0)} %` : '—'}</td>
        <td data-label="Pluie 24 h" data-short="pluie 24 h " class="don-col-value">${info ? `${formatNumber(info.rain, 1)} mm` : '—'}</td>
        <td data-label="Batterie" class="don-col-bat">${bat !== null ? `${formatNumber(bat, 1)} V` : '—'}</td>
      </tr>`;
    }).join('') + (anyShown && hiddenCount ? `<tr class="don-more-row"><td colspan="7"><button type="button" class="don-btn don-more" aria-expanded="${showSilent}">${showSilent ? 'Masquer les stations pas encore installées' : `Afficher les ${hiddenCount} station${hiddenCount > 1 ? 's' : ''} pas encore installée${hiddenCount > 1 ? 's' : ''}`}</button></td></tr>` : '');
    const transmitting = stations.filter(s => stateOf(s).key === 'ok').length;
    const pending = stations.filter(s => stateOf(s).key === 'pending').length;
    const syncs = stations.map(s => s.derniere_synchro).filter(Boolean).sort();
    const lastSync = syncs.length ? new Date(syncs[syncs.length - 1]) : null;
    $('donNetworkSummary').textContent = `${stations.length} stations · ${transmitting} transmettent${pending ? ` · ${pending} pas encore installée${pending > 1 ? 's' : ''}` : ''}${lastSync ? ` · dernière collecte ${whenLabel(lastSync)}` : ''}`;
  }

  function renderSelect() {
    const groups = [
      ['Transmettent', s => stateOf(s).key === 'ok'],
      ['En retard', s => stateOf(s).key === 'late'],
      ['Sans donnée récente', s => ['silent', 'off', 'never'].includes(stateOf(s).key)],
      ['Pas encore installées', s => stateOf(s).key === 'pending']
    ];
    $('donStationSelect').innerHTML = groups.map(([label, test]) => {
      const list = stations.filter(test).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
      if (!list.length) return '';
      return `<optgroup label="${label}">${list.map(s => `<option value="${escapeHtml(s.id)}"${s.id === selectedId ? ' selected' : ''}>${escapeHtml(s.nom)}</option>`).join('')}</optgroup>`;
    }).join('');
  }

  // -------------------------------------------------------------------------
  // Carte
  // -------------------------------------------------------------------------
  async function renderMap() {
    // Stations à venir dessinées d'abord, pour que les stations actives restent au-dessus.
    const located = stations
      .filter(s => Number.isFinite(s.latitude) && Number.isFinite(s.longitude))
      .sort((a, b) => (stateOf(b).key === 'pending') - (stateOf(a).key === 'pending'));
    $('donMapHint').textContent = located.length
      ? `${located.length} station${located.length > 1 ? 's' : ''} sur ${stations.length} placée${located.length > 1 ? 's' : ''} sur la carte.`
      : 'Aucune station n’a encore de coordonnées : un administrateur peut les saisir dans la « Fiche station » de chaque station.';
    if (view !== 'carte') return;
    await ctx.vendor.leaflet();
    if (ctx.scope.disposed || typeof window.L === 'undefined') return;
    const L = window.L;
    if (!map) {
      map = L.map($('donMap'), { zoomControl: true, scrollWheelZoom: false }).setView([43.85, 4.35], 8);
      const plan = L.tileLayer('https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&FORMAT=image/png&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}', { maxZoom: 19, attribution: '© IGN – Géoplateforme' });
      const ortho = L.tileLayer('https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&FORMAT=image/jpeg&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}', { maxZoom: 19, attribution: '© IGN – Géoplateforme' });
      plan.addTo(map);
      L.control.layers({ 'Plan IGN': plan, 'Photos aériennes IGN': ortho }, null, { collapsed: true }).addTo(map);
      mapLayer = L.layerGroup().addTo(map);
      ctx.scope.add(() => { map?.remove(); map = null; });
    }
    mapLayer.clearLayers();
    const colors = { ok: '#2e7d32', late: '#e08a00', silent: '#8a9099', off: '#8a9099', never: '#b8bcc4', pending: '#ffffff' };
    located.forEach(station => {
      const state = stateOf(station);
      const last = latest.get(station.id)?.last;
      const pendingStyle = state.key === 'pending';
      const marker = L.circleMarker([station.latitude, station.longitude], {
        radius: pendingStyle ? 7 : 9,
        weight: 2,
        color: pendingStyle ? '#8a9099' : '#fff',
        dashArray: pendingStyle ? '3 3' : null,
        fillColor: colors[state.key],
        fillOpacity: pendingStyle ? 0.9 : 0.95
      });
      marker.bindPopup(`<strong>${escapeHtml(station.nom)}</strong><br>${state.label}${last ? `<br>${formatNumber(num(last.t_air), 1)} °C · ${formatNumber(num(last.hr), 0)} % · pluie 24 h ${formatNumber(latest.get(station.id).rain, 1)} mm` : ''}<br><button type="button" class="don-map-open" data-station="${escapeHtml(station.id)}">Voir la station</button>`);
      marker.addTo(mapLayer);
    });
    if (located.length) map.fitBounds(L.latLngBounds(located.map(s => [s.latitude, s.longitude])).pad(0.25), { maxZoom: 12 });
    setTimeout(() => map?.invalidateSize(), 60);
  }

  function setView(next) {
    view = next;
    root.querySelectorAll('.don-seg button').forEach(b => b.classList.toggle('is-active', b.dataset.view === view));
    $('donListView').classList.toggle('hidden', view !== 'liste');
    $('donMapView').classList.toggle('hidden', view !== 'carte');
    renderMap().catch(error => console.warn(error));
  }

  // -------------------------------------------------------------------------
  // Station choisie
  // -------------------------------------------------------------------------
  function dailyRows() {
    const p = ctx.period.get();
    if (!p?.start) return [];
    const byDay = new Map();
    hourly.forEach(row => {
      const key = dayKey(row.at);
      const d = byDay.get(key) || { t: [], hr: [], rain: 0, rainSeen: false, n: 0, others: {} };
      if (row.t !== null) d.t.push(row.t);
      if (row.hr !== null) d.hr.push(row.hr);
      if (row.rain !== null) { d.rain += row.rain; d.rainSeen = true; }
      Object.entries(row.others).forEach(([code, value]) => {
        const v = num(value);
        if (v === null) return;
        (d.others[code] = d.others[code] || []).push(v);
      });
      d.n += 1;
      byDay.set(key, d);
    });
    const days = [];
    const last = p.end > todayISO() ? todayISO() : p.end;
    for (let day = p.start; day <= last; day = addDaysISO(day, 1)) {
      const d = byDay.get(day);
      const avg = list => (list?.length ? list.reduce((a, b) => a + b, 0) / list.length : null);
      days.push({
        day,
        tmin: d?.t.length ? Math.min(...d.t) : null,
        tmax: d?.t.length ? Math.max(...d.t) : null,
        tmoy: avg(d?.t),
        hr: avg(d?.hr),
        rain: d?.rainSeen ? d.rain : null,
        n: d?.n || 0,
        others: Object.fromEntries(Object.entries(d?.others || {}).map(([code, list]) => [code, avg(list)]))
      });
    }
    return days;
  }

  function hourlySlots() {
    const p = ctx.period.get();
    const start = parisInstant(p.start).getTime();
    const end = Math.min(parisInstant(p.end, true).getTime(), Date.now());
    const bySlot = new Map(hourly.map(row => [Math.floor(row.at.getTime() / HOUR), row]));
    const slots = [];
    for (let slot = Math.floor(start / HOUR); slot <= Math.floor(end / HOUR); slot += 1) {
      const at = new Date(slot * HOUR);
      slots.push({ at, row: bySlot.get(slot) || null });
    }
    return slots;
  }

  function otherCodes() {
    const codes = new Set();
    hourly.forEach(row => Object.keys(row.others).forEach(code => { if (code !== 'bat') codes.add(code); }));
    return [...codes].sort((a, b) => (sensorLabels[a]?.ordre ?? 100) - (sensorLabels[b]?.ordre ?? 100) || a.localeCompare(b));
  }

  function draw(key, canvasId, config) {
    if (charts[key]) charts[key].destroy();
    const canvas = $(canvasId);
    if (!canvas || !window.Chart) return;
    charts[key] = new window.Chart(canvas, config);
  }

  function baseOptions(extra = {}) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, padding: 14 } },
        tooltip: { padding: 10, cornerRadius: 8 }
      },
      ...extra
    };
  }

  function renderStation() {
    const station = selected();
    renderSelect();
    if (!station) {
      $('donStationMeta').textContent = '';
      $('donKpis').innerHTML = '';
      $('donDailyBody').innerHTML = '<tr><td colspan="7" class="don-empty">Aucune station.</td></tr>';
      return;
    }
    const state = stateOf(station);
    $('donStationState').className = `don-state is-${state.key}`;
    $('donStationState').textContent = state.label;
    $('donStationState').title = station.derniere_erreur || '';

    const sensors = (station.capteurs || []).map(code => {
      const name = sensorName(code);
      const unit = sensorUnit(code);
      if (!unit) return name;
      return name.endsWith(')') ? `${name.slice(0, -1)}, ${unit})` : `${name} (${unit})`;
    });
    const meta = [
      `<span>${escapeHtml(station.id)}</span>`,
      station.commune ? `<span>${escapeHtml(station.commune)}</span>` : '',
      Number.isFinite(station.latitude) ? `<span>${formatNumber(station.latitude, 4)} / ${formatNumber(station.longitude, 4)}${Number.isFinite(station.altitude) ? ` · ${Math.round(station.altitude)} m` : ''}</span>` : '',
      station.premiere_mesure ? `<span>Données depuis le ${formatDateShort(dayKey(new Date(station.premiere_mesure)), true)}</span>` : '',
      sensors.length ? `<span>Capteurs : ${escapeHtml(sensors.join(', '))}</span>` : '',
      station.commentaire ? `<span>${escapeHtml(station.commentaire)}</span>` : ''
    ].filter(Boolean);
    $('donStationMeta').innerHTML = meta.join('');

    const p = ctx.period.get();
    const days = dailyRows();
    const info = latest.get(station.id);
    const last = hourly.length ? hourly[hourly.length - 1] : null;
    const withT = hourly.filter(r => r.t !== null);
    const minRow = withT.reduce((m, r) => (m && m.t <= r.t ? m : r), null);
    const maxRow = withT.reduce((m, r) => (m && m.t >= r.t ? m : r), null);
    const rainPeriod = hourly.reduce((s, r) => s + (r.rain || 0), 0);
    const lastKnown = info?.last ? { at: new Date(info.last.mesure_le), t: num(info.last.t_air), hr: num(info.last.hr) } : last;
    $('donKpis').innerHTML = [
      kpi('Température', lastKnown ? `${formatNumber(lastKnown.t, 1)}<small> °C</small>` : '—', lastKnown ? whenLabel(lastKnown.at) : 'aucune mesure'),
      kpi('Humidité relative', lastKnown ? `${formatNumber(lastKnown.hr, 0)}<small> %</small>` : '—', lastKnown ? whenLabel(lastKnown.at) : ''),
      kpi('Pluie 24 h', info ? `${formatNumber(info.rain, 1)}<small> mm</small>` : '—', 'dernières 24 heures'),
      kpi('Pluie sur la période', hourly.length ? `${formatNumber(rainPeriod, 1)}<small> mm</small>` : '—', p?.display || ''),
      kpi('T min / T max', minRow ? `${formatNumber(minRow.t, 1)} / ${formatNumber(maxRow.t, 1)}<small> °C</small>` : '—', minRow ? `min ${formatDayMonth(dayKey(minRow.at))} ${hourOf(minRow.at)} · max ${formatDayMonth(dayKey(maxRow.at))} ${hourOf(maxRow.at)}` : 'sur la période')
    ].join('');

    const note = $('donNote');
    if (!hourly.length) {
      note.textContent = station.derniere_mesure
        ? `Aucune mesure sur la période choisie. Dernière mesure reçue ${whenLabel(new Date(station.derniere_mesure))}.`
        : 'Cette station n’a encore envoyé aucune mesure à Comsag.';
      note.classList.remove('hidden');
    } else {
      const missingDays = days.filter(d => d.n === 0).length;
      note.textContent = missingDays ? `${missingDays} jour${missingDays > 1 ? 's' : ''} sans mesure sur la période (station hors service ou non transmise).` : '';
      note.classList.toggle('hidden', !missingDays);
    }

    renderCharts(days);
    renderDailyTable(days);
  }

  function kpi(label, value, foot) {
    return `<article class="don-kpi"><span class="don-kpi-label">${label}</span><strong class="don-kpi-value">${value}</strong><span class="don-kpi-foot">${escapeHtml(foot)}</span></article>`;
  }

  function renderCharts(days) {
    const p = ctx.period.get();
    const nDays = p?.start ? diffDaysISO(p.start, p.end) + 1 : 0;
    const hourlyView = nDays <= 14;
    const slots = hourlyView ? hourlySlots() : [];
    const slotLabel = at => `${formatDayMonth(dayKey(at))} ${hourOf(at).slice(0, 2)}h`;

    // Température et humidité
    if (hourlyView) {
      draw('temp', 'donTempChart', {
        type: 'line',
        data: {
          labels: slots.map(s => slotLabel(s.at)),
          datasets: [
            { label: 'Température (°C)', data: slots.map(s => s.row?.t ?? null), borderColor: COLORS.temp, backgroundColor: COLORS.temp, borderWidth: 2, pointRadius: 0, tension: 0.25, yAxisID: 'yT' },
            { label: 'Humidité (%)', data: slots.map(s => s.row?.hr ?? null), borderColor: COLORS.hr, backgroundColor: COLORS.hr, borderWidth: 1.5, borderDash: [5, 4], pointRadius: 0, tension: 0.25, yAxisID: 'yHR' }
          ]
        },
        options: baseOptions({ scales: timeScales(slots.length, { yT: { position: 'left', title: { display: true, text: '°C' } }, yHR: { position: 'right', min: 0, max: 100, grid: { drawOnChartArea: false }, title: { display: true, text: '%' } } }) })
      });
    } else {
      draw('temp', 'donTempChart', {
        type: 'line',
        data: {
          labels: days.map(d => formatDayMonth(d.day)),
          datasets: [
            { label: 'T max (°C)', data: days.map(d => round(d.tmax)), borderColor: COLORS.temp, backgroundColor: COLORS.temp, borderWidth: 2, pointRadius: 0, tension: 0.25, yAxisID: 'yT' },
            { label: 'T moy. (°C)', data: days.map(d => round(d.tmoy)), borderColor: COLORS.tmoy, backgroundColor: COLORS.tmoy, borderWidth: 1.5, pointRadius: 0, tension: 0.25, yAxisID: 'yT' },
            { label: 'T min (°C)', data: days.map(d => round(d.tmin)), borderColor: COLORS.tmin, backgroundColor: COLORS.tmin, borderWidth: 2, pointRadius: 0, tension: 0.25, yAxisID: 'yT' },
            { label: 'HR moy. (%)', data: days.map(d => round(d.hr, 0)), borderColor: COLORS.hr, backgroundColor: COLORS.hr, borderWidth: 1.5, borderDash: [5, 4], pointRadius: 0, tension: 0.25, yAxisID: 'yHR' }
          ]
        },
        options: baseOptions({ scales: timeScales(days.length, { yT: { position: 'left', title: { display: true, text: '°C' } }, yHR: { position: 'right', min: 0, max: 100, grid: { drawOnChartArea: false }, title: { display: true, text: '%' } } }) })
      });
    }

    // Pluie : horaire jusqu'à 3 jours, journalière au-delà, avec cumul
    const rainHourly = nDays <= 3;
    const rainPoints = rainHourly
      ? slots.map(s => ({ label: slotLabel(s.at), value: s.row ? s.row.rain : null }))
      : days.map(d => ({ label: formatDayMonth(d.day), value: d.rain === null ? null : round(d.rain) }));
    let cumul = 0;
    const cumulData = rainPoints.map(pt => { cumul += pt.value || 0; return round(cumul); });
    draw('rain', 'donRainChart', {
      data: {
        labels: rainPoints.map(pt => pt.label),
        datasets: [
          { type: 'bar', label: rainHourly ? 'Pluie horaire (mm)' : 'Pluie journalière (mm)', data: rainPoints.map(pt => pt.value), backgroundColor: COLORS.rain, borderRadius: 3, maxBarThickness: 18, yAxisID: 'yR' },
          { type: 'line', label: 'Cumul (mm)', data: cumulData, borderColor: COLORS.cumul, backgroundColor: COLORS.cumul, borderWidth: 1.8, pointRadius: 0, tension: 0.2, yAxisID: 'yC' }
        ]
      },
      options: baseOptions({ scales: timeScales(rainPoints.length, { yR: { position: 'left', beginAtZero: true, title: { display: true, text: 'mm' } }, yC: { position: 'right', beginAtZero: true, grid: { drawOnChartArea: false }, title: { display: true, text: 'cumul (mm)' } } }) })
    });

    // Capteurs complémentaires : un graphique par famille (tensiomètres, humidité du sol, humectation…)
    renderSensorCharts(hourlyView, slots, days, slotLabel);
  }

  function sensorGroups() {
    const groups = SENSOR_GROUPS.map(group => ({ ...group, codes: [] }));
    otherCodes().forEach(code => groups.find(group => group.test(code)).codes.push(code));
    return groups.filter(group => group.codes.length);
  }

  function renderSensorCharts(hourlyView, slots, days, slotLabel) {
    const groups = sensorGroups();
    const container = $('donSensorCharts');
    const wanted = groups.map(group => group.id).join(',');
    if (container.dataset.groups !== wanted) {
      Object.keys(charts).filter(key => key.startsWith('sensor-')).forEach(key => { charts[key].destroy(); delete charts[key]; });
      container.innerHTML = groups.map(group => `<article class="don-chart-card${groups.length === 1 ? ' don-chart-wide' : ''}">
        <h3>${escapeHtml(group.title)}${group.unit ? ` <small>(${escapeHtml(group.unit)})</small>` : ''}</h3>
        ${group.hint ? `<p class="don-chart-hint">${escapeHtml(group.hint)}</p>` : ''}
        <div class="don-chart"><canvas id="donSensor-${group.id}" aria-label="${escapeHtml(group.title)}"></canvas></div>
      </article>`).join('');
      container.dataset.groups = wanted;
    }
    container.classList.toggle('hidden', !groups.length);
    const labels = hourlyView ? slots.map(s => slotLabel(s.at)) : days.map(d => formatDayMonth(d.day));
    groups.forEach(group => {
      draw(`sensor-${group.id}`, `donSensor-${group.id}`, {
        type: 'line',
        data: {
          labels,
          datasets: group.codes.map((code, i) => ({
            label: `${sensorName(code)}${!group.unit && sensorUnit(code) ? ` (${sensorUnit(code)})` : ''}${hourlyView ? '' : ' · moyenne du jour'}`,
            data: hourlyView ? slots.map(s => num(s.row?.others?.[code])) : days.map(d => round(d.others[code] ?? null)),
            borderColor: SENSOR_COLORS[i % SENSOR_COLORS.length],
            backgroundColor: SENSOR_COLORS[i % SENSOR_COLORS.length],
            borderWidth: 1.8,
            pointRadius: 0,
            tension: 0.2
          }))
        },
        options: baseOptions({ scales: timeScales(labels.length, { y: { position: 'left', title: { display: Boolean(group.unit), text: group.unit } } }) })
      });
    });
  }

  function timeScales(count, yScales) {
    return {
      x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: window.innerWidth < 600 ? 4 : count > 200 ? 10 : 12 } },
      ...Object.fromEntries(Object.entries(yScales).map(([key, cfg]) => [key, { grid: { color: '#eef0f3' }, border: { display: false }, ...cfg }]))
    };
  }

  function renderDailyTable(days) {
    const body = $('donDailyBody');
    if (!days.length) {
      body.innerHTML = '<tr><td colspan="7" class="don-empty">Aucune donnée.</td></tr>';
      return;
    }
    const today = todayISO();
    body.innerHTML = [...days].reverse().map(d => `<tr class="${d.n === 0 ? 'is-empty' : d.n < 20 && d.day !== today ? 'is-partial' : ''}">
      <td data-label="Jour">${formatDateShort(d.day, true)}</td>
      <td data-label="T min">${d.tmin === null ? '—' : `${formatNumber(d.tmin, 1)} °C`}</td>
      <td data-label="T max">${d.tmax === null ? '—' : `${formatNumber(d.tmax, 1)} °C`}</td>
      <td data-label="T moy.">${d.tmoy === null ? '—' : `${formatNumber(d.tmoy, 1)} °C`}</td>
      <td data-label="HR moy.">${d.hr === null ? '—' : `${formatNumber(d.hr, 0)} %`}</td>
      <td data-label="Pluie">${d.rain === null ? '—' : `${formatNumber(d.rain, 1)} mm`}</td>
      <td data-label="Mesures">${d.n}/24</td>
    </tr>`).join('');
  }

  // -------------------------------------------------------------------------
  // Exports CSV (séparateur ; et virgule décimale, pour Excel)
  // -------------------------------------------------------------------------
  function download(name, lines) {
    const csv = lines.map(line => line.map(cell => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(';')).join('\n');
    const url = URL.createObjectURL(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportHourly() {
    const station = selected();
    const p = ctx.period.get();
    if (!station || !hourly.length) return ctx.ui.toast('Aucune mesure à exporter sur cette période.');
    const codes = [...new Set(hourly.flatMap(r => Object.keys(r.others)))].sort();
    const header = ['date', 'heure', 'temperature_air_C', 'humidite_relative_pct', 'pluie_mm', ...codes];
    const lines = hourly.map(r => [dayKey(r.at), hourOf(r.at), csvNumber(r.t), csvNumber(r.hr), csvNumber(r.rain), ...codes.map(c => csvNumber(r.others[c]))]);
    download(`sam-${station.id}-${p.start}_${p.end}-horaire.csv`, [header, ...lines]);
  }

  function exportDaily() {
    const station = selected();
    const p = ctx.period.get();
    const days = dailyRows();
    if (!station || !days.length) return ctx.ui.toast('Aucune donnée à exporter.');
    const header = ['jour', 't_min_C', 't_max_C', 't_moy_C', 'hr_moy_pct', 'pluie_mm', 'nb_mesures'];
    const lines = days.map(d => [d.day, csvNumber(round(d.tmin)), csvNumber(round(d.tmax)), csvNumber(round(d.tmoy, 2)), csvNumber(round(d.hr)), csvNumber(d.rain === null ? null : round(d.rain)), d.n]);
    download(`sam-${station.id}-${p.start}_${p.end}-journalier.csv`, [header, ...lines]);
  }

  // -------------------------------------------------------------------------
  // Administration
  // -------------------------------------------------------------------------
  async function synchronise(stationId = null) {
    if (!isAdmin()) return;
    const buttons = [$('donSyncOne'), $('donSyncAll')];
    buttons.forEach(b => { b.disabled = true; });
    try {
      const { data: count, error } = await supabase.rpc('stations_synchroniser', { p_station: stationId });
      if (error) throw error;
      ctx.ui.toast(`Demande envoyée à Comsag (${count || 0} station${count > 1 ? 's' : ''})…`);
      await new Promise(resolve => ctx.scope.timeout(resolve, 6000));
      if (ctx.scope.disposed) return;
      const { data: written, error: e2 } = await supabase.rpc('stations_integrer');
      if (e2) throw e2;
      ctx.ui.toast(`${written || 0} mesure${written > 1 ? 's' : ''} mise${written > 1 ? 's' : ''} à jour.`);
      await refreshAll();
    } catch (error) {
      console.error(error);
      ctx.ui.toast(`Synchronisation impossible : ${error.message || error}`, 6000);
    } finally {
      buttons.forEach(b => { b.disabled = false; });
    }
  }

  function openEditor() {
    const station = selected();
    if (!station || !isAdmin()) return;
    $('donDialogTitle').textContent = station.nom;
    $('donFieldName').value = station.nom || '';
    $('donFieldCommune').value = station.commune || '';
    $('donFieldLat').value = station.latitude ?? '';
    $('donFieldLon').value = station.longitude ?? '';
    $('donFieldAlt').value = station.altitude ?? '';
    $('donFieldComment').value = station.commentaire || '';
    $('donFieldActive').checked = Boolean(station.active);
    $('donFieldPublic').checked = Boolean(station.publique);
    $('donFieldInstalled').checked = station.installee !== false;
    $('donFormMessage').textContent = '';
    $('donStationDialog').showModal();
  }

  async function saveStation(event) {
    event.preventDefault();
    const station = selected();
    if (!station || !isAdmin()) return;
    const numberOrNull = id => ($(id).value === '' ? null : Number($(id).value));
    const payload = {
      nom: $('donFieldName').value.trim() || station.nom,
      commune: $('donFieldCommune').value.trim() || null,
      latitude: numberOrNull('donFieldLat'),
      longitude: numberOrNull('donFieldLon'),
      altitude: numberOrNull('donFieldAlt'),
      commentaire: $('donFieldComment').value.trim() || null,
      active: $('donFieldActive').checked,
      publique: $('donFieldPublic').checked,
      installee: $('donFieldInstalled').checked,
      updated_at: new Date().toISOString()
    };
    if ((payload.latitude === null) !== (payload.longitude === null)) {
      $('donFormMessage').textContent = 'Indiquez la latitude et la longitude, ou aucune des deux.';
      return;
    }
    $('donFormMessage').textContent = 'Enregistrement…';
    const { error } = await supabase.from('stations').update(payload).eq('id', station.id);
    if (error) {
      $('donFormMessage').textContent = `Enregistrement impossible : ${error.message}`;
      return;
    }
    $('donStationDialog').close();
    ctx.ui.toast('Fiche station enregistrée.');
    await refreshAll();
  }

  // -------------------------------------------------------------------------
  // Orchestration
  // -------------------------------------------------------------------------
  function showSetupMessage(error) {
    const missing = /relation|does not exist|schema cache|stations/i.test(error?.message || '');
    $('donNetworkSummary').textContent = '';
    $('donStationsBody').innerHTML = `<tr><td colspan="7" class="don-empty">${missing
      ? 'Les tables des stations ne sont pas encore créées dans Supabase (fichier « supabase/stations.sql »).'
      : `Impossible de charger les stations : ${escapeHtml(error?.message || String(error))}`}</td></tr>`;
    $('donStation').classList.add('hidden');
  }

  async function refreshStation() {
    try {
      await loadStationData();
      if (!ctx.scope.disposed) renderStation();
    } catch (error) {
      console.error(error);
      ctx.ui.toast(`Mesures indisponibles : ${error.message || error}`, 6000);
    }
  }

  async function refreshAll() {
    try {
      await loadStations();
      await loadLatest();
    } catch (error) {
      console.error(error);
      showSetupMessage(error);
      return;
    }
    if (ctx.scope.disposed) return;
    $('donStation').classList.toggle('hidden', !stations.length);
    renderNetwork();
    renderMap().catch(error => console.warn(error));
    await refreshStation();
  }

  function selectStation(id, scroll = false) {
    if (!id || id === selectedId) return;
    selectedId = id;
    storage.set('donnees.station', id);
    renderNetwork();
    refreshStation();
    if (scroll) $('donStation').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function applyHashView() {
    const wantsMap = /[?&]vue=carte\b/.test(window.location.hash);
    if (wantsMap && view !== 'carte') setView('carte');
    if (wantsMap) $('donNetwork').scrollIntoView({ block: 'start' });
  }

  // Événements
  $('donStationSelect').addEventListener('change', event => selectStation(event.target.value));
  $('donStationsBody').addEventListener('click', event => {
    if (event.target.closest('.don-more')) {
      showSilent = !showSilent;
      renderNetwork();
      return;
    }
    const row = event.target.closest('tr[data-station]');
    if (row) selectStation(row.dataset.station, true);
  });
  $('donStationsBody').addEventListener('keydown', event => {
    const row = event.target.closest('tr[data-station]');
    if (row && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); selectStation(row.dataset.station, true); }
  });
  root.querySelectorAll('.don-seg button').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
  $('donMap').addEventListener('click', event => {
    const button = event.target.closest('.don-map-open');
    if (button) selectStation(button.dataset.station, true);
  });
  $('donSyncAll').addEventListener('click', () => synchronise(null));
  $('donSyncOne').addEventListener('click', () => synchronise(selectedId));
  $('donEditStation').addEventListener('click', openEditor);
  $('donStationForm').addEventListener('submit', saveStation);
  $('donDialogClose').addEventListener('click', () => $('donStationDialog').close());
  $('donExportHourly').addEventListener('click', exportHourly);
  $('donExportDaily').addEventListener('click', exportDaily);
  ctx.period.onChange(() => refreshStation());
  ctx.onAuthChange(() => { renderAdmin(); refreshAll(); });
  ctx.scope.on(window, 'hashchange', applyHashView);
  // Mise à jour automatique toutes les 10 minutes tant que la page est ouverte
  ctx.scope.interval(() => { if (document.visibilityState === 'visible') refreshAll(); }, 10 * 60 * 1000);

  renderAdmin();
  await refreshAll();
  applyHashView();

  return {
    unmount() {
      Object.values(charts).forEach(chart => chart.destroy());
    }
  };
}
