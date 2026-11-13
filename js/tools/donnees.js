// SAM Données — une station du réseau SAM à la fois (choisie dans le bandeau de gauche).
// Les mesures horaires sont collectées par Supabase (fichier supabase/stations.sql) :
// le site ne contacte jamais Comsag directement, le jeton d'accès reste côté serveur.
import { presets } from '../core/period.js';
import { icons } from '../core/icons.js';
import { stationState } from '../core/stations.js';
import { createZoomGroup, enableChartZoom, resetZoomGroup, timeAxis, timeTicksPlugin } from '../core/charts.js';
import { todayISO, addDaysISO, formatNumber, formatDayMonth, formatDateShort, escapeHtml, storage } from '../core/util.js';

const TZ = 'Europe/Paris';
const DATA_START = '2026-09-01';
const PAGE = 1000;
const HOUR = 3600000;
const COLORS = {
  temp: '#db0b1f', tmax: '#7d0a16', tmoy: '#db0b1f', tmin: '#3b8ad9',
  hr: '#2e7d32', hrLight: '#8cc58f', rain: '#3b8ad9', cumul: '#1f3b63', humect: '#0f766e'
};
const SENSOR_COLORS = ['#7c3aed', '#0f766e', '#b45309', '#be185d', '#475569', '#0891b2'];
const BASE_SENSORS = {
  t1: ['Température de l’air', '°C'], hyg1: ['Hygrométrie de l’air', '%'], pluv: ['Pluviométrie', 'mm'],
  hum: ['Humectation du feuillage', '%'], bat: ['Batterie', 'V'],
  ts1: ['Tensiomètre 1', 'cb'], ts2: ['Tensiomètre 2', 'cb'], ts3: ['Tensiomètre 3', 'cb'], ts4: ['Tensiomètre 4', 'cb'], ts5: ['Tensiomètre 5', 'cb'],
  decagon1: ['Humidité du sol 1', '%'], decagon2: ['Humidité du sol 2', '%']
};
// Familles de capteurs complémentaires (champ « autres » des mesures).
const FAMILIES = {
  dendro: { title: 'Dendromètre', unit: 'µm', hint: 'Variation du diamètre du tronc ou de la branche.', test: code => /^dend/i.test(code) },
  tensio: { title: 'Sondes tensiométriques', unit: 'cb', hint: 'Plus la valeur est élevée, plus le sol est sec.', test: code => /^ts\d+$/i.test(code) },
  capa: { title: 'Sondes capacitives', unit: '%', hint: 'Humidité du sol : plus la valeur est élevée, plus le sol est humide.', test: code => /^(decagon|capa)\d*$/i.test(code) },
  humect: { title: 'Humectation foliaire', unit: '%', hint: '', test: code => code === 'hum' }
};
const IGNORED = new Set(['bat', 't1', 'hyg1', 'pluv']);
const RIMPRO_MODELS = [
  { id: 'venturia', label: 'Tavelure', path: 'venturia.xhtml' },
  { id: 'cydia', label: 'Carpocapse', path: 'cydia.xhtml' }
];
const VIEWS = [
  { id: 'meteo', label: 'Météo', icon: 'viewMeteo' },
  { id: 'irrigation', label: 'Irrigation', icon: 'viewIrrigation' },
  { id: 'maladies', label: 'Maladies / ravageurs', icon: 'viewSanitaire' }
];

const TEMPLATE = `
<div class="don-main">
  <div class="don-setup hidden" id="donSetup"></div>

  <section class="don-card don-station" id="donStation">
    <header class="don-station-head">
      <div class="don-station-title">
        <h2 id="donStationName">—</h2>
        <p class="don-station-sub" id="donStationSub"></p>
      </div>
      <div class="don-head-actions">
        <span id="donStationState" class="don-state"></span>
        <button class="don-btn don-admin hidden" type="button" id="donSyncOne">Synchroniser</button>
        <button class="don-btn don-admin hidden" type="button" id="donEditStation">Fiche station</button>
      </div>
    </header>
    <div class="don-kpis" id="donKpis"></div>
  </section>

  <section class="don-toolbar" id="donToolbar">
    <div class="don-views" role="tablist" aria-label="Données affichées">
      ${VIEWS.map(v => `<button type="button" role="tab" class="don-view-tab" data-view="${v.id}" aria-selected="false"><span class="don-view-icon">${icons[v.icon]}</span><span class="don-view-label">${v.label}</span></button>`).join('')}
    </div>
    <div class="don-filters" id="donFilters"></div>
  </section>

  <div class="don-zoombar" id="donZoomBar">
    <span class="don-zoom-hint" id="donZoomHint">Glissez sur un graphique pour zoomer · double-clic pour revenir en arrière</span>
    <button class="don-btn don-btn-small hidden" type="button" id="donZoomReset">Toute la période</button>
  </div>

  <section class="don-view" data-panel="meteo">
    <p class="don-empty hidden" id="donMeteoEmpty"></p>
    <div class="don-chart-list" id="donMeteoCharts"></div>
    <article class="don-card don-daily" id="donDaily">
      <header class="don-chart-head">
        <div><h3>Résumé journalier</h3></div>
        <button class="sam-csv-button" type="button" id="donDailyCsv" title="Télécharger le résumé journalier (CSV)">CSV</button>
      </header>
      <div class="don-table-wrap">
        <table class="don-table">
          <thead id="donDailyHead"></thead>
          <tbody id="donDailyBody"></tbody>
        </table>
      </div>
      <button class="don-btn don-more hidden" type="button" id="donDailyMore"></button>
    </article>
  </section>

  <section class="don-view" data-panel="irrigation" hidden>
    <p class="don-empty hidden" id="donIrrigationEmpty"></p>
    <div class="don-chart-list" id="donIrrigationCharts"></div>
  </section>

  <section class="don-view" data-panel="maladies" hidden>
    <div id="donRimpro"></div>
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
      <label class="sam-field" id="donFieldRimproWrap">Identifiant RIMpro (station abonnée)<input id="donFieldRimpro" type="text" maxlength="20" placeholder="Ex. KFNYMs6" autocomplete="off" spellcheck="false"></label>
      <label class="sam-field">Commentaire<textarea id="donFieldComment" rows="2" maxlength="400"></textarea></label>
      <label class="don-check"><input id="donFieldActive" type="checkbox"> Collecte automatique active</label>
      <label class="don-check"><input id="donFieldPublic" type="checkbox"> Visible par tous les comptes</label>
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
const num = value => (value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? null : Number(value));
const round = (value, digits = 1) => (value === null || value === undefined ? null : Math.round(value * 10 ** digits) / 10 ** digits);
const csvNumber = value => (value === null || value === undefined ? '' : String(value).replace('.', ','));
const avg = list => (list?.length ? list.reduce((a, b) => a + b, 0) / list.length : null);
const safeName = text => String(text || 'station').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');

export async function mount(root, ctx) {
  root.innerHTML = TEMPLATE;
  const $ = id => root.querySelector(`#${id}`);
  const supabase = ctx.supabase;
  const store = ctx.stations.store;
  const charts = new Map(); // id → { chart, spec }
  let sensorLabels = {};
  let hourly = [];
  let recent = { rows: [], last: null };
  let loadToken = 0;
  let view = VIEWS.some(v => v.id === storage.get('donnees.view')) ? storage.get('donnees.view') : 'meteo';
  let mode = storage.get('donnees.mode', 'hourly') === 'daily' ? 'daily' : 'hourly';
  let rimproModel = 'venturia';
  let dailyExpanded = false;
  // Zoom partagé par tous les graphiques de l'onglet (même période affichée).
  const zoom = createZoomGroup(range => updateZoomBar(range));

  // Période et pas de temps à côté, sous les onglets.
  ctx.filters({ location: false, period: true, mountIn: $('donFilters') });
  ctx.period.configure({
    presets: [
      presets.lastDays(7),
      presets.lastDays(2, '48 dernières heures'),
      presets.lastDays(30),
      { id: 'all', label: 'Depuis le début des mesures', resolve: today => ({ start: DATA_START, end: today }) }
    ],
    defaultPreset: 'last7',
    remember: 'session',
    min: DATA_START,
    max: () => todayISO(),
    hint: 'Mesures horaires des stations Comsag du réseau SAM, collectées automatiquement toutes les 30 minutes.'
  });
  const slot = ctx.filterActions();
  slot.innerHTML = `<div class="sam-filter don-mode-filter">
    <span class="sam-filter-label">Pas de temps</span>
    <div class="don-seg don-mode" role="group" aria-label="Pas de temps">
      <button type="button" data-mode="hourly">Horaire</button><button type="button" data-mode="daily">Journalier</button>
    </div>
  </div>`;
  const modeButtons = [...slot.querySelectorAll('[data-mode]')];

  const isAdmin = () => Boolean(ctx.isAdmin);
  const sensorName = code => sensorLabels[code]?.libelle || BASE_SENSORS[code]?.[0] || code;
  const sensorUnit = code => sensorLabels[code]?.unite || BASE_SENSORS[code]?.[1] || '';
  const selected = () => store.selected;

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

  async function loadSensors() {
    const { data } = await supabase.from('station_capteurs').select('*').order('ordre');
    sensorLabels = Object.fromEntries((data || []).map(c => [c.code, c]));
  }

  const toRow = row => ({ at: new Date(row.mesure_le), t: num(row.t_air), hr: num(row.hr), rain: num(row.pluie), others: row.autres || {} });

  async function loadStationData() {
    const station = selected();
    const p = ctx.period.get();
    if (!station || !p?.start) { hourly = []; recent = { rows: [], last: null }; return; }
    const token = ++loadToken;
    const since = new Date(Date.now() - 24 * HOUR).toISOString();
    const [rows, last24] = await Promise.all([
      fetchAll(() => supabase.from('station_mesures')
        .select('mesure_le,t_air,hr,pluie,autres')
        .eq('station_id', station.id)
        .gte('mesure_le', parisInstant(p.start).toISOString())
        .lte('mesure_le', parisInstant(p.end, true).toISOString())
        .order('mesure_le', { ascending: true })),
      fetchAll(() => supabase.from('station_mesures')
        .select('mesure_le,t_air,hr,pluie,autres')
        .eq('station_id', station.id)
        .gte('mesure_le', since)
        .order('mesure_le', { ascending: true }))
    ]);
    let last = last24.length ? toRow(last24[last24.length - 1]) : null;
    if (!last && station.derniere_mesure) {
      const { data } = await supabase.from('station_mesures').select('mesure_le,t_air,hr,pluie,autres')
        .eq('station_id', station.id).order('mesure_le', { ascending: false }).limit(1);
      if (data?.[0]) last = toRow(data[0]);
    }
    if (token !== loadToken) return;
    hourly = rows.map(toRow);
    recent = { rows: last24.map(toRow), last };
  }

  // -------------------------------------------------------------------------
  // En-tête de la station et encarts du jour
  // -------------------------------------------------------------------------
  function kpi(label, value, foot) {
    return `<article class="don-kpi"><span class="don-kpi-label">${label}</span><strong class="don-kpi-value">${value}</strong><span class="don-kpi-foot">${escapeHtml(foot)}</span></article>`;
  }

  function renderHeader() {
    const station = selected();
    if (!station) return;
    const state = stationState(station);
    $('donStationName').textContent = station.nom;
    const sub = [
      station.commune,
      Number.isFinite(station.altitude) ? `${Math.round(station.altitude)} m d’altitude` : '',
      station.premiere_mesure ? `données depuis le ${formatDateShort(dayKey(new Date(station.premiere_mesure)), true)}` : '',
      station.commentaire
    ].filter(Boolean);
    $('donStationSub').textContent = sub.join(' · ');
    $('donStationState').className = `don-state is-${state.key}`;
    $('donStationState').textContent = state.label;
    $('donStationState').title = station.derniere_erreur || (station.derniere_mesure ? `Dernière mesure ${whenLabel(new Date(station.derniere_mesure))}` : '');

    const today = todayISO();
    const last = recent.last;
    const rain24 = recent.rows.reduce((s, r) => s + (r.rain || 0), 0);
    const todayRows = recent.rows.filter(r => r.t !== null && dayKey(r.at) === today);
    const minRow = todayRows.reduce((m, r) => (m && m.t <= r.t ? m : r), null);
    const maxRow = todayRows.reduce((m, r) => (m && m.t >= r.t ? m : r), null);
    $('donKpis').innerHTML = [
      kpi('Température', last?.t !== null && last ? `${formatNumber(last.t, 1)}<small> °C</small>` : '—', last ? whenLabel(last.at) : 'aucune mesure'),
      kpi('Humidité relative', last?.hr !== null && last ? `${formatNumber(last.hr, 0)}<small> %</small>` : '—', last ? whenLabel(last.at) : ''),
      kpi('Pluie 24 h', recent.rows.length ? `${formatNumber(rain24, 1)}<small> mm</small>` : '—', 'dernières 24 heures'),
      kpi('T min / T max du jour', minRow ? `${formatNumber(minRow.t, 1)} / ${formatNumber(maxRow.t, 1)}<small> °C</small>` : '—',
        minRow ? `aujourd’hui · min ${hourOf(minRow.at)} · max ${hourOf(maxRow.at)}` : 'aucune mesure aujourd’hui')
    ].join('');
  }

  // -------------------------------------------------------------------------
  // Base de temps (horaire ou journalière) et agrégats
  // -------------------------------------------------------------------------
  function timeBase() {
    const p = ctx.period.get();
    if (!p?.start) return { mode, labels: [], items: [] };
    if (mode === 'hourly') {
      const start = parisInstant(p.start).getTime();
      const end = Math.min(parisInstant(p.end, true).getTime(), Date.now());
      const bySlot = new Map(hourly.map(row => [Math.floor(row.at.getTime() / HOUR), row]));
      const items = [];
      for (let s = Math.floor(start / HOUR); s <= Math.floor(end / HOUR); s += 1) {
        const at = new Date(s * HOUR);
        items.push({ at, day: dayKey(at), hour: hourOf(at), row: bySlot.get(s) || null });
      }
      return { mode, items, labels: items.map(i => `${formatDayMonth(i.day)} ${i.hour.slice(0, 2)}h`) };
    }
    const items = dailyRows();
    return { mode, items, labels: items.map(d => formatDayMonth(d.day)) };
  }

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
        if (v !== null) (d.others[code] = d.others[code] || []).push(v);
      });
      d.n += 1;
      byDay.set(key, d);
    });
    const days = [];
    const last = p.end > todayISO() ? todayISO() : p.end;
    for (let day = p.start; day <= last; day = addDaysISO(day, 1)) {
      const d = byDay.get(day);
      days.push({
        day,
        tmin: d?.t.length ? Math.min(...d.t) : null,
        tmax: d?.t.length ? Math.max(...d.t) : null,
        tmoy: avg(d?.t),
        hrmin: d?.hr.length ? Math.min(...d.hr) : null,
        hrmax: d?.hr.length ? Math.max(...d.hr) : null,
        hr: avg(d?.hr),
        rain: d?.rainSeen ? d.rain : null,
        n: d?.n || 0,
        others: Object.fromEntries(Object.entries(d?.others || {}).map(([code, list]) => [code, avg(list)]))
      });
    }
    return days;
  }

  /** Codes des capteurs complémentaires présents (fiche station + mesures). */
  function sensorCodes() {
    const codes = new Set((selected()?.capteurs || []).filter(c => !IGNORED.has(c)));
    hourly.forEach(row => Object.keys(row.others).forEach(code => { if (!IGNORED.has(code)) codes.add(code); }));
    return [...codes].sort((a, b) => (sensorLabels[a]?.ordre ?? 100) - (sensorLabels[b]?.ordre ?? 100) || a.localeCompare(b));
  }

  // -------------------------------------------------------------------------
  // Graphiques : définitions par onglet
  // -------------------------------------------------------------------------
  function series(base, pick) {
    return base.items.map(item => round(pick(item)));
  }

  function lineSpec(id, title, unit, datasets, { hint = '', yMin, yMax } = {}) {
    return { id, title, unit, hint, kind: 'line', datasets, yMin, yMax };
  }

  function rainSpec(id, base, title = 'Pluie') {
    const values = base.items.map(item => (base.mode === 'hourly' ? item.row?.rain ?? null : item.rain));
    let total = 0;
    const cumul = values.map(v => { total += v || 0; return round(total); });
    return {
      id, title, unit: 'mm', hint: '', kind: 'rain',
      datasets: [
        { label: base.mode === 'hourly' ? 'Pluie horaire (mm)' : 'Pluie journalière (mm)', data: values.map(v => round(v)), color: COLORS.rain, type: 'bar' },
        { label: 'Cumul (mm)', data: cumul, color: COLORS.cumul, type: 'line', axis: 'y2' }
      ]
    };
  }

  function familySpec(id, family, codes, base) {
    const def = FAMILIES[family];
    const unit = def.unit || sensorUnit(codes[0]);
    return lineSpec(id, def.title, unit, codes.map((code, i) => ({
      label: `${sensorName(code)}${base.mode === 'daily' ? ' · moyenne du jour' : ''}`,
      data: base.mode === 'hourly' ? base.items.map(it => round(num(it.row?.others?.[code]))) : base.items.map(d => round(d.others[code] ?? null)),
      color: family === 'humect' ? COLORS.humect : SENSOR_COLORS[i % SENSOR_COLORS.length]
    })), { hint: def.hint, yMin: unit === '%' ? 0 : undefined, yMax: family === 'humect' ? 100 : undefined });
  }

  function meteoSpecs(base) {
    const specs = [];
    if (base.mode === 'hourly') {
      specs.push(lineSpec('temp', 'Température', '°C', [{ label: 'Température (°C)', data: series(base, it => it.row?.t ?? null), color: COLORS.temp }]));
      specs.push(lineSpec('hr', 'Humidité relative', '%', [{ label: 'Humidité relative (%)', data: series(base, it => it.row?.hr ?? null), color: COLORS.hr }], { yMin: 0, yMax: 100 }));
    } else {
      specs.push(lineSpec('temp', 'Température', '°C', [
        { label: 'T max (°C)', data: series(base, d => d.tmax), color: COLORS.tmax, dash: [6, 4], width: 1.8 },
        { label: 'T moy. (°C)', data: series(base, d => d.tmoy), color: COLORS.tmoy, width: 2.2 },
        { label: 'T min (°C)', data: series(base, d => d.tmin), color: COLORS.tmin, dash: [6, 4], width: 1.8 }
      ]));
      specs.push(lineSpec('hr', 'Humidité relative', '%', [
        { label: 'HR max (%)', data: series(base, d => d.hrmax), color: COLORS.hrLight, dash: [5, 4], width: 1.4 },
        { label: 'HR moy. (%)', data: series(base, d => d.hr), color: COLORS.hr },
        { label: 'HR min (%)', data: series(base, d => d.hrmin), color: COLORS.hrLight, dash: [2, 3], width: 1.4 }
      ], { yMin: 0, yMax: 100 }));
    }
    specs.push(rainSpec('rain', base));
    const humect = sensorCodes().filter(FAMILIES.humect.test);
    if (humect.length) specs.push(familySpec('humect', 'humect', humect, base));
    return specs;
  }

  function irrigationSpecs(base) {
    const codes = sensorCodes();
    const specs = [];
    ['dendro', 'tensio', 'capa'].forEach(family => {
      const list = codes.filter(FAMILIES[family].test);
      if (list.length) specs.push(familySpec(family, family, list, base));
    });
    const known = Object.values(FAMILIES);
    const others = codes.filter(code => !known.some(f => f.test(code)));
    if (others.length) {
      specs.push(lineSpec('autres', 'Autres capteurs', '', others.map((code, i) => ({
        label: `${sensorName(code)}${sensorUnit(code) ? ` (${sensorUnit(code)})` : ''}`,
        data: base.mode === 'hourly' ? base.items.map(it => round(num(it.row?.others?.[code]))) : base.items.map(d => round(d.others[code] ?? null)),
        color: SENSOR_COLORS[(i + 3) % SENSOR_COLORS.length]
      }))));
    }
    const probes = specs.length;
    specs.push(rainSpec('irr-rain', base, 'Pluviométrie'));
    return { specs, probes };
  }

  // -------------------------------------------------------------------------
  // Dessin, zoom et export
  // -------------------------------------------------------------------------
  const narrow = () => window.innerWidth < 600;

  function chartConfig(spec, base) {
    const labels = base.labels;
    const time = { items: base.items, mode: base.mode };
    const datasets = spec.datasets.map(ds => {
      if (ds.type === 'bar') {
        return { type: 'bar', label: ds.label, data: ds.data, backgroundColor: ds.color, borderRadius: 2, maxBarThickness: 14, yAxisID: 'y' };
      }
      return {
        type: 'line', label: ds.label, data: ds.data, borderColor: ds.color, backgroundColor: ds.color,
        borderWidth: ds.width || 2, borderDash: ds.dash || [], pointRadius: 0, pointHoverRadius: 3, tension: 0.25, spanGaps: false,
        yAxisID: ds.axis === 'y2' ? 'y2' : 'y'
      };
    });
    const scales = {
      // Petits traits au-dessus des dates : heures, jours, semaines selon la place disponible.
      x: timeAxis(time, { fontSize: narrow() ? 11 : 12 }),
      y: {
        beginAtZero: spec.kind === 'rain',
        min: spec.yMin, max: spec.yMax,
        grid: { color: '#eef0f3' }, border: { display: false },
        ticks: { color: '#4b5058' },
        title: { display: Boolean(spec.unit), text: spec.unit, color: '#4b5058', font: { size: 12, weight: '600' } }
      }
    };
    if (spec.kind === 'rain') {
      scales.y2 = { position: 'right', beginAtZero: true, grid: { drawOnChartArea: false }, border: { display: false }, ticks: { color: '#4b5058' }, title: { display: true, text: 'cumul (mm)', color: '#4b5058', font: { size: 12, weight: '600' } } };
    }
    return {
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 9, boxHeight: 8, padding: 16, font: { size: 13 }, color: '#2b3038' } },
          tooltip: {
            padding: 10, cornerRadius: 8,
            callbacks: { label: c => `${c.dataset.label} : ${c.parsed.y === null ? '—' : formatNumber(c.parsed.y, spec.unit === '%' || spec.unit === 'cb' ? 0 : 1)}` }
          },
          samTimeTicks: time
        },
        scales
      },
      plugins: [timeTicksPlugin]
    };
  }

  function updateZoomBar(range) {
    $('donZoomReset').classList.toggle('hidden', !range);
    const labels = [...charts.values()][0]?.chart.data.labels || [];
    $('donZoomHint').textContent = range
      ? `Zoom : ${labels[range.min] || ''} → ${labels[range.max] || ''} · double-clic pour revenir en arrière`
      : 'Glissez sur un graphique pour zoomer · double-clic pour revenir en arrière';
  }

  function resetZoom() {
    resetZoomGroup(zoom, { apply: false });
  }

  function destroyCharts() {
    charts.forEach(({ chart }) => chart.destroy());
    charts.clear();
  }

  function renderChartList(container, specs, base) {
    destroyCharts();
    container.innerHTML = specs.map(spec => `<article class="don-card don-chart-card" data-chart="${spec.id}">
      <header class="don-chart-head">
        <div>
          <h3>${escapeHtml(spec.title)}${spec.unit ? ` <small>(${escapeHtml(spec.unit)})</small>` : ''}</h3>
          ${spec.hint ? `<p class="don-chart-hint">${escapeHtml(spec.hint)}</p>` : ''}
        </div>
        <button class="sam-csv-button" type="button" data-csv="${spec.id}" title="Télécharger les données de ce graphique (CSV)">CSV</button>
      </header>
      <div class="don-chart${spec.kind === 'rain' ? ' is-short' : ''}"><canvas aria-label="${escapeHtml(spec.title)}"></canvas></div>
    </article>`).join('');
    specs.forEach(spec => {
      const canvas = container.querySelector(`[data-chart="${spec.id}"] canvas`);
      const chart = new window.Chart(canvas, chartConfig(spec, base));
      enableChartZoom(chart, { group: zoom, resetButton: false });
      charts.set(spec.id, { chart, spec, base });
    });
    updateZoomBar(zoom.range);
  }

  function download(name, lines) {
    const csv = lines.map(line => line.map(cell => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportChart(id) {
    const entry = charts.get(id);
    const station = selected();
    const p = ctx.period.get();
    if (!entry || !station) return;
    const { spec, base } = entry;
    const timeHeader = base.mode === 'hourly' ? ['date', 'heure'] : ['jour'];
    const header = [...timeHeader, ...spec.datasets.map(ds => ds.label)];
    const lines = base.items.map((item, i) => [
      ...(base.mode === 'hourly' ? [item.day, item.hour] : [item.day]),
      ...spec.datasets.map(ds => csvNumber(ds.data[i]))
    ]);
    download(`SAM_${safeName(station.nom)}_${safeName(spec.title)}_${base.mode === 'hourly' ? 'horaire' : 'journalier'}_${p.start}_${p.end}.csv`, [header, ...lines]);
  }

  // -------------------------------------------------------------------------
  // Onglets
  // -------------------------------------------------------------------------
  function renderMeteo() {
    const base = timeBase();
    const empty = !hourly.length;
    $('donMeteoEmpty').textContent = empty ? 'Aucune mesure reçue sur cette période.' : '';
    $('donMeteoEmpty').classList.toggle('hidden', !empty);
    if (empty) { destroyCharts(); $('donMeteoCharts').innerHTML = ''; }
    else renderChartList($('donMeteoCharts'), meteoSpecs(base), base);
    renderDailyTable();
  }

  function renderIrrigation() {
    const base = timeBase();
    const empty = !hourly.length;
    const { specs } = irrigationSpecs(base);
    $('donIrrigationEmpty').textContent = empty ? 'Aucune mesure reçue sur cette période.' : '';
    $('donIrrigationEmpty').classList.toggle('hidden', !empty);
    if (empty) { destroyCharts(); $('donIrrigationCharts').innerHTML = ''; }
    else renderChartList($('donIrrigationCharts'), specs, base);
  }

  function renderMaladies() {
    destroyCharts();
    const station = selected();
    const box = $('donRimpro');
    if (!station) { box.innerHTML = ''; return; }
    const id = (station.rimpro_id || '').trim();
    if (!id) {
      box.innerHTML = `<div class="don-card don-rim-empty">
        <h3>Pas de modèle RIMpro pour cette station</h3>
        <p>Les contaminations (tavelure, carpocapse…) calculées par RIMpro s’affichent ici pour les stations abonnées.</p>
        ${isAdmin() ? '<p class="don-hint">Administrateur : renseignez l’identifiant RIMpro de la station dans la « Fiche station ».</p>' : ''}
      </div>`;
      return;
    }
    const model = RIMPRO_MODELS.find(m => m.id === rimproModel) || RIMPRO_MODELS[0];
    const url = `https://www.rimpro.eu/${model.path}?id=${encodeURIComponent(id)}`;
    box.innerHTML = `<article class="don-card don-rim">
      <header class="don-rim-head">
        <div class="don-seg" role="group" aria-label="Modèle RIMpro">
          ${RIMPRO_MODELS.map(m => `<button type="button" data-rim="${m.id}" class="${m.id === model.id ? 'is-active' : ''}" aria-pressed="${m.id === model.id}">${m.label}</button>`).join('')}
        </div>
        <a class="don-btn" href="${escapeHtml(url)}" target="_blank" rel="noopener">Ouvrir dans RIMpro ↗</a>
      </header>
      <div class="don-rim-frame is-loading">
        <div class="don-rim-loading" role="status"><span class="don-rim-spinner" aria-hidden="true"></span><span id="donRimLoadingText">Chargement du modèle RIMpro…</span></div>
        <iframe src="${escapeHtml(url)}" title="RIMpro — ${escapeHtml(model.label)} — ${escapeHtml(station.nom)}" referrerpolicy="no-referrer-when-downgrade"></iframe>
      </div>
      <p class="don-hint">Modèle ${escapeHtml(model.label.toLowerCase())} calculé par RIMpro à partir de la station. Si le graphique ne s’affiche pas, utilisez « Ouvrir dans RIMpro ».</p>
    </article>`;
    const frame = box.querySelector('.don-rim-frame');
    const iframe = frame.querySelector('iframe');
    iframe.addEventListener('load', () => frame.classList.remove('is-loading'), { once: true });
    ctx.scope.timeout(() => {
      const text = box.querySelector('#donRimLoadingText');
      if (text && frame.classList.contains('is-loading')) text.textContent = 'RIMpro met un peu de temps à répondre…';
    }, 12000);
  }

  function renderDailyTable() {
    const days = dailyRows();
    const hasHumect = sensorCodes().some(FAMILIES.humect.test);
    $('donDailyHead').innerHTML = `<tr><th>Jour</th><th>T min</th><th>T max</th><th>T moy.</th><th>HR moy.</th><th>Pluie</th>${hasHumect ? '<th>Humect. moy.</th>' : ''}</tr>`;
    const cols = hasHumect ? 7 : 6;
    const body = $('donDailyBody');
    const more = $('donDailyMore');
    if (!days.length) {
      body.innerHTML = `<tr><td colspan="${cols}" class="don-empty-cell">Aucune donnée.</td></tr>`;
      more.classList.add('hidden');
      return;
    }
    const ordered = [...days].reverse();
    const shown = dailyExpanded ? ordered : ordered.slice(0, 7);
    body.innerHTML = shown.map(d => `<tr class="${d.n === 0 ? 'is-empty' : ''}">
      <td data-label="Jour">${formatDateShort(d.day, true)}</td>
      <td data-label="T min">${d.tmin === null ? '—' : `${formatNumber(d.tmin, 1)} °C`}</td>
      <td data-label="T max">${d.tmax === null ? '—' : `${formatNumber(d.tmax, 1)} °C`}</td>
      <td data-label="T moy.">${d.tmoy === null ? '—' : `${formatNumber(d.tmoy, 1)} °C`}</td>
      <td data-label="HR moy.">${d.hr === null ? '—' : `${formatNumber(d.hr, 0)} %`}</td>
      <td data-label="Pluie">${d.rain === null ? '—' : `${formatNumber(d.rain, 1)} mm`}</td>
      ${hasHumect ? `<td data-label="Humect. moy.">${d.others.hum === undefined || d.others.hum === null ? '—' : `${formatNumber(d.others.hum, 0)} %`}</td>` : ''}
    </tr>`).join('');
    const hidden = ordered.length - 7;
    more.classList.toggle('hidden', hidden <= 0);
    more.textContent = dailyExpanded ? 'Voir moins' : `Voir plus (${hidden} jour${hidden > 1 ? 's' : ''})`;
  }

  function exportDaily() {
    const station = selected();
    const p = ctx.period.get();
    const days = dailyRows();
    if (!station || !days.length) return ctx.ui.toast('Aucune donnée à exporter.');
    const hasHumect = sensorCodes().some(FAMILIES.humect.test);
    const header = ['jour', 't_min_C', 't_max_C', 't_moy_C', 'hr_moy_pct', 'pluie_mm', ...(hasHumect ? ['humectation_moy_pct'] : [])];
    const lines = days.map(d => [d.day, csvNumber(round(d.tmin)), csvNumber(round(d.tmax)), csvNumber(round(d.tmoy, 2)), csvNumber(round(d.hr)), csvNumber(d.rain === null ? null : round(d.rain)),
      ...(hasHumect ? [csvNumber(round(d.others.hum ?? null))] : [])]);
    download(`SAM_${safeName(station.nom)}_resume_journalier_${p.start}_${p.end}.csv`, [header, ...lines]);
  }

  function renderView() {
    root.querySelectorAll('.don-view-tab').forEach(tab => {
      const on = tab.dataset.view === view;
      tab.classList.toggle('is-active', on);
      tab.setAttribute('aria-selected', String(on));
    });
    root.querySelectorAll('.don-view').forEach(panel => { panel.hidden = panel.dataset.panel !== view; });
    // Les graphiques des onglets masqués sont retirés (ils seront redessinés à l'ouverture).
    destroyCharts();
    if (view !== 'meteo') $('donMeteoCharts').innerHTML = '';
    if (view !== 'irrigation') $('donIrrigationCharts').innerHTML = '';
    if (view !== 'maladies') $('donRimpro').innerHTML = '';
    const timed = view !== 'maladies';
    $('donFilters').classList.toggle('hidden', !timed);
    $('donZoomBar').classList.toggle('hidden', !timed || !hourly.length);
    modeButtons.forEach(b => {
      const on = b.dataset.mode === mode;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', String(on));
    });
    if (view === 'meteo') renderMeteo();
    else if (view === 'irrigation') renderIrrigation();
    else renderMaladies();
  }

  function renderAll() {
    const station = selected();
    $('donStation').classList.toggle('hidden', !station);
    $('donToolbar').classList.toggle('hidden', !station);
    root.querySelectorAll('.don-view').forEach(panel => panel.classList.toggle('hidden', !station));
    $('donZoomBar').classList.toggle('hidden', !station);
    if (!station) return;
    renderHeader();
    renderView();
  }

  // -------------------------------------------------------------------------
  // Administration
  // -------------------------------------------------------------------------
  async function synchronise() {
    const station = selected();
    if (!isAdmin() || !station) return;
    const button = $('donSyncOne');
    button.disabled = true;
    try {
      const { data: count, error } = await supabase.rpc('stations_synchroniser', { p_station: station.id });
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
      button.disabled = false;
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
    $('donFieldRimpro').value = station.rimpro_id || '';
    $('donFieldRimproWrap').classList.toggle('hidden', !('rimpro_id' in station));
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
    if ('rimpro_id' in station) payload.rimpro_id = $('donFieldRimpro').value.trim() || null;
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
    store.patch(station.id, payload);
    renderAll();
  }

  // -------------------------------------------------------------------------
  // Orchestration
  // -------------------------------------------------------------------------
  function showSetupMessage(error) {
    const missing = /relation|does not exist|schema cache|stations/i.test(error?.message || '');
    $('donSetup').innerHTML = missing
      ? 'Les tables des stations ne sont pas encore créées dans Supabase (fichier « supabase/stations.sql »).'
      : `Impossible de charger les stations : ${escapeHtml(error?.message || String(error))}`;
    $('donSetup').classList.remove('hidden');
  }

  async function refreshStation({ keepZoom = false } = {}) {
    if (!keepZoom) resetZoom();
    try {
      await loadStationData();
      if (!ctx.scope.disposed) renderAll();
    } catch (error) {
      console.error(error);
      ctx.ui.toast(`Mesures indisponibles : ${error.message || error}`, 6000);
    }
  }

  async function refreshAll() {
    await store.load(true);
    if (ctx.scope.disposed) return;
    if (store.error) {
      showSetupMessage(store.error);
      renderAll();
      return;
    }
    $('donSetup').classList.add('hidden');
    if (!store.list.length) {
      $('donSetup').textContent = 'Aucune station visible pour le moment.';
      $('donSetup').classList.remove('hidden');
    }
    await refreshStation({ keepZoom: true });
  }

  // Événements
  root.querySelectorAll('.don-view-tab').forEach(tab => tab.addEventListener('click', () => {
    if (view === tab.dataset.view) return;
    view = tab.dataset.view;
    storage.set('donnees.view', view);
    renderView();
  }));
  modeButtons.forEach(button => button.addEventListener('click', () => {
    if (mode === button.dataset.mode) return;
    mode = button.dataset.mode;
    storage.set('donnees.mode', mode);
    resetZoom();
    renderView();
  }));
  $('donZoomReset').addEventListener('click', () => resetZoomGroup(zoom));
  root.addEventListener('click', event => {
    const csv = event.target.closest('[data-csv]');
    if (csv) exportChart(csv.dataset.csv);
    const rim = event.target.closest('[data-rim]');
    if (rim) { rimproModel = rim.dataset.rim; renderMaladies(); }
  });
  $('donDailyMore').addEventListener('click', () => { dailyExpanded = !dailyExpanded; renderDailyTable(); });
  $('donDailyCsv').addEventListener('click', exportDaily);
  $('donSyncOne').addEventListener('click', synchronise);
  $('donEditStation').addEventListener('click', openEditor);
  $('donStationForm').addEventListener('submit', saveStation);
  $('donDialogClose').addEventListener('click', () => $('donStationDialog').close());
  ctx.stations.onChange(event => {
    if (event.type === 'select') {
      dailyExpanded = false;
      refreshStation();
    }
  });
  ctx.period.onChange(() => { dailyExpanded = false; refreshStation(); });
  ctx.onAuthChange(() => { renderAdmin(); renderAll(); });
  // Mise à jour automatique toutes les 10 minutes tant que la page est ouverte
  ctx.scope.interval(() => { if (document.visibilityState === 'visible') refreshAll(); }, 10 * 60 * 1000);

  renderAdmin();
  await Promise.all([store.load(), loadSensors().catch(() => null)]);
  if (ctx.scope.disposed) return {};
  if (store.error) showSetupMessage(store.error);
  else if (!store.list.length) {
    $('donSetup').textContent = 'Aucune station visible pour le moment.';
    $('donSetup').classList.remove('hidden');
  }
  await refreshStation();

  return {
    unmount() {
      destroyCharts();
    }
  };
}
