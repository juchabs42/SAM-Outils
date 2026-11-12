// SAM Tavelure — périthèces, projections de spores (capteur Marchi) et pluie associée.
// Lecture par tous les comptes ; saisie réservée aux administrateurs SAM (équipe SudExpé).
import { presets } from '../core/period.js';
import { todayISO, addDaysISO } from '../core/util.js';

const DEFAULT_SCALE = { moyen: 500, fort: 2000 };
const HISTORY_LIMIT = 10;
const COLORS = { rain: '#3b8ad9', spores: '#8b5a2b', cumul: '#3d2410', noData: 'rgba(107, 113, 123, .075)' };

const TEMPLATE = `
<div class="tool-main">
  <section class="sam-team-note" aria-label="Suivi tavelure SudExpé">
    <p class="sam-team-kicker">Suivi tavelure SudExpé</p>
    <p>Résultats consultables par tous les comptes SAM. La maturation des périthèces et les projections de spores (capteur Marchi) sont relevées et saisies par l’équipe SudExpé.</p>
  </section>

  <div id="databaseWarning" class="warning-box hidden"></div>

  <section class="panel">
    <div class="panel-header">
      <div><p class="panel-kicker">Périthèces</p><h3>Stades de maturation observés</h3></div>
      <div id="stageAdminActions" class="admin-only hidden">
        <button id="saveStagesButton" class="primary-button" type="button">Enregistrer les dates</button>
      </div>
    </div>
    <div class="notice"><strong>Repère :</strong> le stade 7 correspond au moment où les spores sont prêtes à être projetées. Le J0 est la première date d’observation du stade 7.</div>
    <div class="table-wrap">
      <table class="stage-table mobile-card-table">
        <thead><tr><th>Stade</th><th>Lecture simplifiée</th><th>Formulation technique</th><th>Date observée</th></tr></thead>
        <tbody id="stageTableBody"></tbody>
      </table>
    </div>
    <div id="stageMessage" class="form-message admin-only hidden" role="status"></div>
  </section>

  <section class="panel">
    <div class="panel-header">
      <div><p class="panel-kicker">Spores + pluie</p><h3>Projections observées jour par jour</h3></div>
      <span id="monitoringStatusBadge" class="status-pill">Suivi en cours</span>
    </div>
    <div class="controls">
      <p class="period-reminder" id="periodReminder"></p>
      <div class="actions">
        <button id="resetFiltersButton" class="secondary-button" type="button">Toute la saison</button>
        <button id="exportGraphButton" class="primary-button" type="button">Exporter en CSV</button>
      </div>
    </div>
    <div class="tav-scale" id="tavScale" aria-label="Échelle d’intensité des projections"></div>
    <div id="j0Warning" class="warning-box hidden">Le graphique démarrera dès qu’une date sera renseignée pour le stade 7.</div>
    <div id="emptyGraphMessage" class="empty-state hidden">Aucun épisode enregistré sur la période sélectionnée.</div>
    <div class="chart-wrap tav-chart"><canvas id="sporeChart" aria-label="Pluie et spores projetées par jour, avec le cumul des spores"></canvas></div>
    <p class="tav-chart-note" id="tavChartNote"><span class="tav-nodata-swatch" aria-hidden="true"></span>Jour sans relevé (ni pluie ni spores enregistrées)</p>
  </section>

  <section id="episodeEntryPanel" class="panel admin-only hidden">
    <div class="panel-header"><div><p class="panel-kicker">Saisie</p><h3>Ajouter un relevé de projection</h3></div></div>
    <form id="episodeForm" class="form-grid episode-form">
      <label>Épisode<input id="entryEpisode" type="text" placeholder="Ex. Session 3" required></label>
      <div class="form-row">
        <label>Date<input id="entryDate" type="date" required></label>
        <label>Heure<input id="entryTime" type="time" required></label>
      </div>
      <div class="form-row">
        <label>Pluie (mm)<input id="entryRain" type="number" min="0" step="0.1" required></label>
        <label>Nombre de spores<input id="entrySpores" type="number" min="0" step="1"></label>
      </div>
      <button class="primary-button" type="submit">Ajouter le relevé</button>
    </form>
    <div id="episodeMessage" class="form-message" role="status"></div>

    <div class="monitoring-admin">
      <h4>Échelle d’intensité des projections</h4>
      <p class="tav-admin-hint">Nombre de spores par relevé à partir duquel la projection est jugée moyenne, puis forte.</p>
      <div class="form-row monitoring-row">
        <label>Moyenne à partir de<input id="scaleMediumInput" type="number" min="1" step="1"></label>
        <label>Forte à partir de<input id="scaleStrongInput" type="number" min="2" step="1"></label>
      </div>
      <button id="saveScaleButton" class="secondary-button" type="button">Enregistrer l’échelle</button>
      <div id="scaleMessage" class="form-message" role="status"></div>
    </div>

    <div class="monitoring-admin">
      <h4>État du suivi des projections</h4>
      <div class="form-row monitoring-row">
        <label class="checkbox-label"><input id="monitoringClosedInput" type="checkbox"> Suivi terminé</label>
        <label>Date de fin<input id="monitoringEndDateInput" type="date"></label>
      </div>
      <button id="saveMonitoringButton" class="secondary-button" type="button">Enregistrer l’état du suivi</button>
      <div id="monitoringMessage" class="form-message" role="status"></div>
    </div>
  </section>

  <section class="panel">
    <div class="panel-header"><div><p class="panel-kicker">Historique</p><h3>Données de comptage</h3></div></div>
    <div class="table-wrap">
      <table class="history-table mobile-card-table">
        <thead><tr><th>Épisode</th><th>Date / heure</th><th>Pluie</th><th>Spores</th><th>Intensité</th><th class="admin-only hidden">Action</th></tr></thead>
        <tbody id="historyTableBody"></tbody>
      </table>
    </div>
    <button id="historyMoreButton" class="secondary-button tav-more hidden" type="button"></button>
  </section>
</div>`;

const STAGE_DEFINITIONS = [
  { id: 1, simple: 'Aucune différenciation visible', technical: 'Pseudothèces sans différenciation' },
  { id: 2, simple: 'Les futures structures commencent à se former', technical: 'Pseudothèce avec asques en voie de différenciation' },
  { id: 3, simple: 'Les sacs contenant les spores sont formés', technical: 'Pseudothèce avec asques différenciés' },
  { id: 4, simple: 'Les spores sont visibles mais encore claires', technical: 'Pseudothèce avec ascospores claires' },
  { id: 5, simple: 'Début de coloration des spores', technical: 'Pseudothèce avec 1 à 15 asques contenant des ascospores colorées' },
  { id: 6, simple: 'Maturation bien engagée', technical: 'Pseudothèce avec 16 à 50 asques contenant des ascospores colorées' },
  { id: 7, simple: 'Spores prêtes à être projetées', technical: 'Pseudothèce avec plus de 50 asques contenant des ascospores colorées' }
];

const TABLES = { stages: 'tavelure_peritheces', counts: 'tavelure_comptages', settings: 'tavelure_parametres' };

const formatDate = value => (value ? new Date(`${value}T12:00:00`).toLocaleDateString('fr-FR') : '');
const formatDayLong = value => new Date(`${value}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const formatDayShort = value => { const [, m, d] = value.split('-'); return `${d}/${m}`; };
const formatDateTime = (date, time) => {
  if (!date) return '';
  const [year, month, day] = String(date).slice(0, 10).split('-');
  return `${day}/${month}/${year} à ${String(time || '00:00').slice(0, 5)}`;
};
const formatNumber = (value, digits = 1) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: digits }).format(value);
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
const hasValue = value => value !== null && value !== undefined && value !== '';

// Fond grisé des jours sans relevé + seuils de l'échelle sur l'axe des spores.
const tavelureBackground = {
  id: 'samTavelureBackground',
  beforeDatasetsDraw(chart, _args, options) {
    const { ctx, chartArea, scales } = chart;
    if (!chartArea || !options) return;
    const x = scales.x;
    const n = chart.data.labels.length;
    const step = n > 1 ? Math.abs(x.getPixelForValue(1) - x.getPixelForValue(0)) : chartArea.right - chartArea.left;
    ctx.save();
    ctx.fillStyle = COLORS.noData;
    (options.noData || []).forEach((empty, i) => {
      if (!empty || i < x.min || i > x.max) return;
      const center = x.getPixelForValue(i);
      ctx.fillRect(Math.max(chartArea.left, center - step / 2), chartArea.top, Math.min(step, chartArea.right - chartArea.left), chartArea.bottom - chartArea.top);
    });
    const y = scales.ySpores;
    if (y && options.thresholds) {
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 1;
      ctx.font = '600 11px Inter, system-ui, sans-serif';
      options.thresholds.forEach(t => {
        if (t.value > y.max) return;
        const py = y.getPixelForValue(t.value);
        ctx.strokeStyle = t.color;
        ctx.beginPath();
        ctx.moveTo(chartArea.left, py);
        ctx.lineTo(chartArea.right, py);
        ctx.stroke();
        ctx.fillStyle = t.color;
        ctx.textAlign = 'right';
        ctx.fillText(t.label, chartArea.right - 4, py - 4);
      });
    }
    ctx.restore();
  }
};

export async function mount(root, ctx) {
  root.innerHTML = TEMPLATE;
  const byId = id => root.querySelector(`#${id}`);
  const supabaseClient = ctx.supabase;
  let currentUser = ctx.isAdmin ? ctx.user : null;
  let stageDates = new Map();
  let records = [];
  let monitoring = { suivi_termine: false, date_fin: null };
  let scale = { ...DEFAULT_SCALE };
  let scaleStored = false;
  let chart = null;
  let showAllHistory = false;

  const getJ0 = () => stageDates.get(7) || null;

  ctx.filters({ location: false, period: true });
  ctx.period.configure({
    presets: [
      { id: 'season', label: 'Saison (depuis J0)', resolve: today => ({ start: getJ0() || `${today.slice(0, 4)}-01-01`, end: today }) },
      presets.lastDays(30),
      presets.lastDays(90)
    ],
    defaultPreset: 'season',
    min: '2000-01-01',
    max: () => todayISO(),
    hint: 'Les épisodes antérieurs au J0 (stade 7) ne sont jamais affichés.'
  });

  function showDatabaseWarning(message) {
    byId('databaseWarning').textContent = message;
    byId('databaseWarning').classList.remove('hidden');
  }
  function hideDatabaseWarning() { byId('databaseWarning').classList.add('hidden'); }

  // -------------------------------------------------------------------------
  // Échelle d'intensité (spores par relevé)
  // -------------------------------------------------------------------------
  function intensity(spores) {
    if (!hasValue(spores)) return null;
    const value = Number(spores);
    if (value >= scale.fort) return { key: 'forte', label: 'Forte' };
    if (value >= scale.moyen) return { key: 'moyenne', label: 'Moyenne' };
    return { key: 'faible', label: 'Faible' };
  }
  function intensityBadge(spores) {
    const level = intensity(spores);
    return level ? `<span class="tav-level is-${level.key}">${level.label}</span>` : '<span class="tav-level is-none">—</span>';
  }
  function renderScale() {
    byId('tavScale').innerHTML = `<span class="tav-scale-title">Intensité d’une projection (spores par relevé) :</span>
      <span class="tav-level is-faible">Faible · moins de ${formatNumber(scale.moyen, 0)}</span>
      <span class="tav-level is-moyenne">Moyenne · ${formatNumber(scale.moyen, 0)} à ${formatNumber(scale.fort - 1, 0)}</span>
      <span class="tav-level is-forte">Forte · ${formatNumber(scale.fort, 0)} et plus</span>`;
    if (currentUser) {
      byId('scaleMediumInput').value = scale.moyen;
      byId('scaleStrongInput').value = scale.fort;
    }
  }

  function renderAuth() {
    root.querySelectorAll('.admin-only').forEach(el => el.classList.toggle('hidden', !currentUser));
    renderStages();
    renderScale();
  }

  function renderStages() {
    byId('stageTableBody').innerHTML = STAGE_DEFINITIONS.map(stage => {
      const date = stageDates.get(stage.id) || '';
      const dateCell = currentUser
        ? `<input class="stage-date-input" type="date" data-stage-id="${stage.id}" value="${date}">`
        : `<span class="empty-date">${date ? formatDate(date) : ''}</span>`;
      return `<tr>
        <td data-label="Stade"><strong>Stade ${stage.id}</strong></td>
        <td data-label="Lecture simplifiée">${stage.simple}</td>
        <td data-label="Formulation technique">${stage.technical}</td>
        <td data-label="Date observée">${dateCell}</td>
      </tr>`;
    }).join('');
  }

  async function loadStages() {
    stageDates = new Map();
    const { data, error } = await supabaseClient.from(TABLES.stages).select('stade,date_obs').order('stade', { ascending: true });
    if (error) {
      console.error(error);
      showDatabaseWarning('Impossible de charger les dates des périthèces depuis Supabase.');
      renderStages();
      return false;
    }
    (data || []).forEach(row => { if (row.date_obs) stageDates.set(Number(row.stade), row.date_obs); });
    renderStages();
    return true;
  }

  async function saveStages() {
    if (!currentUser) return;
    const button = byId('saveStagesButton');
    const message = byId('stageMessage');
    button.disabled = true;
    message.textContent = 'Enregistrement…';
    const payload = [...root.querySelectorAll('.stage-date-input')].map(input => ({
      stade: Number(input.dataset.stageId),
      date_obs: input.value || null,
      updated_at: new Date().toISOString()
    }));
    const { error } = await supabaseClient.from(TABLES.stages).upsert(payload, { onConflict: 'stade' });
    button.disabled = false;
    if (error) {
      console.error(error);
      message.textContent = `Enregistrement impossible : ${error.message}`;
      return;
    }
    message.textContent = 'Dates enregistrées.';
    await loadStages();
    ctx.period.refresh();
    refreshDataViews();
  }

  async function loadRecords() {
    records = [];
    const { data, error } = await supabaseClient.from(TABLES.counts).select('*')
      .order('date_obs', { ascending: true }).order('heure_obs', { ascending: true });
    if (error) {
      console.error(error);
      showDatabaseWarning('Impossible de charger les épisodes de tavelure depuis Supabase.');
      refreshDataViews();
      return false;
    }
    records = data || [];
    refreshDataViews();
    return true;
  }

  async function loadSettings() {
    monitoring = { suivi_termine: false, date_fin: null };
    const { data, error } = await supabaseClient.from(TABLES.settings).select('*').eq('id', 1).maybeSingle();
    if (error) console.error(error);
    if (data) {
      monitoring = { suivi_termine: data.suivi_termine, date_fin: data.date_fin };
      scaleStored = 'seuil_moyen' in data;
      if (Number(data.seuil_moyen) > 0) scale.moyen = Number(data.seuil_moyen);
      if (Number(data.seuil_fort) > scale.moyen) scale.fort = Number(data.seuil_fort);
    }
    renderMonitoring();
    renderScale();
  }

  function renderMonitoring() {
    const badge = byId('monitoringStatusBadge');
    badge.textContent = monitoring.suivi_termine ? `Suivi terminé${monitoring.date_fin ? ` · ${formatDate(monitoring.date_fin)}` : ''}` : 'Suivi en cours';
    badge.classList.toggle('closed', Boolean(monitoring.suivi_termine));
    if (currentUser) {
      byId('monitoringClosedInput').checked = Boolean(monitoring.suivi_termine);
      byId('monitoringEndDateInput').value = monitoring.date_fin || '';
    }
  }

  async function saveMonitoring() {
    if (!currentUser) return;
    const message = byId('monitoringMessage');
    message.textContent = 'Enregistrement…';
    const payload = { id: 1, suivi_termine: byId('monitoringClosedInput').checked, date_fin: byId('monitoringEndDateInput').value || null, updated_at: new Date().toISOString() };
    const { error } = await supabaseClient.from(TABLES.settings).upsert(payload, { onConflict: 'id' });
    if (error) {
      console.error(error);
      message.textContent = `Enregistrement impossible : ${error.message}`;
      return;
    }
    message.textContent = 'État du suivi enregistré.';
    await loadSettings();
  }

  async function saveScale() {
    if (!currentUser) return;
    const message = byId('scaleMessage');
    const moyen = Math.round(Number(byId('scaleMediumInput').value));
    const fort = Math.round(Number(byId('scaleStrongInput').value));
    if (!(moyen > 0) || !(fort > moyen)) {
      message.textContent = 'Le seuil « forte » doit être supérieur au seuil « moyenne ».';
      return;
    }
    if (!scaleStored) {
      message.textContent = 'Échelle non enregistrable : lancez d’abord le fichier « connexion_comptes.sql » dans Supabase.';
      return;
    }
    message.textContent = 'Enregistrement…';
    const { error } = await supabaseClient.from(TABLES.settings).upsert({ id: 1, seuil_moyen: moyen, seuil_fort: fort, updated_at: new Date().toISOString() }, { onConflict: 'id' });
    if (error) {
      console.error(error);
      message.textContent = `Enregistrement impossible : ${error.message}`;
      return;
    }
    scale = { moyen, fort };
    message.textContent = 'Échelle enregistrée.';
    renderScale();
    refreshDataViews();
  }

  function filteredRecords() {
    const j0 = getJ0();
    const p = ctx.period.get();
    const start = p?.start || j0 || '';
    const end = p?.end || '';
    return records
      .filter(row => !j0 || row.date_obs >= j0)
      .filter(row => !start || row.date_obs >= start)
      .filter(row => !end || row.date_obs <= end)
      .sort((a, b) => `${a.date_obs}T${a.heure_obs || '00:00'}`.localeCompare(`${b.date_obs}T${b.heure_obs || '00:00'}`));
  }

  // -------------------------------------------------------------------------
  // Graphique : un jour par graduation, du premier au dernier relevé
  // -------------------------------------------------------------------------
  function dailySeries(rows) {
    if (!rows.length) return [];
    const byDay = new Map();
    rows.forEach(row => {
      const day = String(row.date_obs).slice(0, 10);
      const d = byDay.get(day) || { rain: null, spores: null, episodes: new Set(), count: 0 };
      if (hasValue(row.pluie_mm)) d.rain = (d.rain || 0) + Number(row.pluie_mm);
      if (hasValue(row.spores)) d.spores = (d.spores || 0) + Number(row.spores);
      if (row.episode) d.episodes.add(row.episode);
      d.count += 1;
      byDay.set(day, d);
    });
    const first = String(rows[0].date_obs).slice(0, 10);
    const last = String(rows[rows.length - 1].date_obs).slice(0, 10);
    const days = [];
    let cumul = 0;
    for (let day = first; day <= last; day = addDaysISO(day, 1)) {
      const d = byDay.get(day);
      if (d?.spores) cumul += d.spores;
      days.push({ day, rain: d ? d.rain : null, spores: d ? d.spores : null, episodes: d ? [...d.episodes] : [], recorded: Boolean(d), cumul });
    }
    return days;
  }

  function drawChart() {
    const j0 = getJ0();
    const rows = filteredRecords();
    const canvas = byId('sporeChart');
    const days = dailySeries(rows);
    const empty = !j0 || days.length === 0;
    byId('j0Warning').classList.toggle('hidden', Boolean(j0));
    byId('emptyGraphMessage').classList.toggle('hidden', !j0 || rows.length > 0);
    canvas.parentElement.classList.toggle('hidden', empty);
    byId('tavChartNote').classList.toggle('hidden', empty || !days.some(d => !d.recorded));
    if (chart) { chart.destroy(); chart = null; }
    if (empty) return;
    const narrow = window.innerWidth <= 720;
    chart = new window.Chart(canvas, {
      data: {
        labels: days.map(d => formatDayShort(d.day)),
        datasets: [
          { type: 'bar', label: 'Pluviométrie (mm)', data: days.map(d => d.rain), backgroundColor: COLORS.rain, borderRadius: 3, maxBarThickness: 22, yAxisID: 'yRain', order: 2 },
          { type: 'bar', label: 'Spores projetées', data: days.map(d => d.spores), backgroundColor: COLORS.spores, borderRadius: 3, maxBarThickness: 22, yAxisID: 'ySpores', order: 2 },
          { type: 'line', label: 'Cumul des spores projetées', data: days.map(d => d.cumul), borderColor: COLORS.cumul, backgroundColor: COLORS.cumul, borderWidth: 2.2, pointRadius: days.map(d => (d.spores ? (narrow ? 2 : 3) : 0)), pointHoverRadius: 4, tension: 0.15, stepped: false, yAxisID: 'yCumul', order: 1 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: 'index' },
        plugins: {
          legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 10, boxHeight: 9, padding: narrow ? 10 : 18, font: { size: narrow ? 11 : 13 }, sort: (a, b) => a.datasetIndex - b.datasetIndex } },
          tooltip: {
            padding: 10,
            cornerRadius: 8,
            filter: item => item.raw !== null && item.raw !== undefined,
            callbacks: {
              title: items => (items.length ? formatDayLong(days[items[0].dataIndex].day) : ''),
              afterTitle: items => { const d = items.length ? days[items[0].dataIndex] : null; return d?.episodes.length ? d.episodes.join(', ') : ''; },
              label: item => {
                if (item.dataset.yAxisID === 'yRain') return `Pluie : ${formatNumber(item.raw, 1)} mm`;
                if (item.dataset.yAxisID === 'ySpores') return `Spores : ${formatNumber(item.raw, 0)} · intensité ${intensity(item.raw)?.label.toLowerCase() || '—'}`;
                return `Cumul : ${formatNumber(item.raw, 0)} spores`;
              },
              footer: items => (days[items[0]?.dataIndex]?.recorded === false ? 'Pas de relevé ce jour' : '')
            }
          },
          samTavelureBackground: {
            noData: days.map(d => !d.recorded),
            thresholds: [
              { value: scale.moyen, label: `moyenne ≥ ${formatNumber(scale.moyen, 0)}`, color: 'rgba(176, 116, 0, .85)' },
              { value: scale.fort, label: `forte ≥ ${formatNumber(scale.fort, 0)}`, color: 'rgba(170, 24, 36, .85)' }
            ]
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: narrow ? 6 : 16, font: { size: narrow ? 10 : 12 } } },
          yRain: { beginAtZero: true, position: 'left', title: { display: true, text: 'Pluie (mm)', color: COLORS.rain, font: { weight: '600' } }, ticks: { color: COLORS.rain }, grid: { color: 'rgba(102, 113, 124, 0.13)' } },
          ySpores: { beginAtZero: true, position: 'right', title: { display: !narrow, text: 'Spores par jour', color: COLORS.spores, font: { weight: '600' } }, ticks: { color: COLORS.spores }, grid: { drawOnChartArea: false } },
          yCumul: { beginAtZero: true, position: 'right', title: { display: !narrow, text: 'Cumul des spores', color: COLORS.cumul, font: { weight: '600' } }, ticks: { color: COLORS.cumul, display: !narrow }, grid: { drawOnChartArea: false } }
        }
      },
      plugins: [tavelureBackground]
    });
  }

  // -------------------------------------------------------------------------
  // Historique : 10 derniers relevés + « Voir plus »
  // -------------------------------------------------------------------------
  function renderHistory() {
    const rows = [...filteredRecords()].reverse();
    const body = byId('historyTableBody');
    const more = byId('historyMoreButton');
    const columnCount = currentUser ? 6 : 5;
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="${columnCount}">Aucune donnée enregistrée sur la période.</td></tr>`;
      more.classList.add('hidden');
      return;
    }
    const shown = showAllHistory ? rows : rows.slice(0, HISTORY_LIMIT);
    body.innerHTML = shown.map(row => `
      <tr>
        <td data-label="Épisode"><strong>${escapeHtml(row.episode)}</strong></td>
        <td data-label="Date / heure">${formatDateTime(row.date_obs, row.heure_obs)}</td>
        <td data-label="Pluie">${formatNumber(Number(row.pluie_mm) || 0, 1)} mm</td>
        <td data-label="Spores">${hasValue(row.spores) ? formatNumber(Number(row.spores), 0) : ''}</td>
        <td data-label="Intensité">${intensityBadge(row.spores)}</td>
        ${currentUser ? `<td data-label="Action"><button class="delete-count-button" type="button" data-delete-count-id="${row.id}">Supprimer</button></td>` : ''}
      </tr>`).join('');
    const hidden = rows.length - HISTORY_LIMIT;
    more.classList.toggle('hidden', hidden <= 0);
    more.textContent = showAllHistory ? 'Voir moins' : `Voir plus (${hidden} autre${hidden > 1 ? 's' : ''})`;
  }

  function renderPeriodReminder() {
    const p = ctx.period.get();
    const j0 = getJ0();
    byId('periodReminder').innerHTML = `Période affichée : <strong>${p?.display || '—'}</strong>${j0 ? ` · J0 : ${formatDate(j0)}` : ''}`;
  }

  function refreshDataViews() {
    renderPeriodReminder();
    drawChart();
    renderHistory();
  }

  function exportCsv() {
    const rows = filteredRecords();
    if (!rows.length) return;
    const header = ['episode', 'date', 'heure', 'pluie_mm', 'spores', 'intensite'];
    const values = rows.map(row => [row.episode, row.date_obs, row.heure_obs, String(row.pluie_mm ?? '').replace('.', ','), row.spores ?? '', intensity(row.spores)?.label || '']);
    const csv = [header, ...values].map(line => line.map(cell => `"${String(cell).replaceAll('"', '""')}"`).join(';')).join('\n');
    const url = URL.createObjectURL(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'sam-tavelure-episodes.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function addEpisode(event) {
    event.preventDefault();
    if (!currentUser) return;
    const message = byId('episodeMessage');
    message.textContent = 'Enregistrement…';
    const sporesRaw = byId('entrySpores').value;
    const spores = sporesRaw === '' ? null : Number(sporesRaw);
    const payload = {
      episode: byId('entryEpisode').value.trim(),
      date_obs: byId('entryDate').value,
      heure_obs: byId('entryTime').value,
      pluie_mm: Number(byId('entryRain').value),
      spores,
      // Colonne historique conservée pour la base ; l'intensité est calculée à l'affichage.
      statut: spores ? 'Validé' : 'Pas de contamination',
      comptage_termine: true
    };
    const { error } = await supabaseClient.from(TABLES.counts).insert(payload);
    if (error) {
      console.error(error);
      message.textContent = `Enregistrement impossible : ${error.message}`;
      return;
    }
    message.textContent = 'Relevé enregistré.';
    byId('episodeForm').reset();
    await loadRecords();
  }

  async function deleteCount(id) {
    if (!currentUser || !id) return;
    const row = records.find(item => String(item.id) === String(id));
    const label = row ? `${row.episode} du ${formatDate(row.date_obs)}` : 'ce comptage';
    if (!window.confirm(`Supprimer ${label} ? Cette action est définitive.`)) return;
    const { error } = await supabaseClient.from(TABLES.counts).delete().eq('id', id);
    if (error) {
      console.error(error);
      window.alert(`Suppression impossible : ${error.message}`);
      return;
    }
    await loadRecords();
  }

  // Événements
  byId('saveStagesButton').addEventListener('click', saveStages);
  byId('episodeForm').addEventListener('submit', addEpisode);
  byId('saveMonitoringButton').addEventListener('click', saveMonitoring);
  byId('saveScaleButton').addEventListener('click', saveScale);
  byId('resetFiltersButton').addEventListener('click', () => { ctx.period.set({ preset: 'season' }); refreshDataViews(); });
  byId('exportGraphButton').addEventListener('click', exportCsv);
  byId('historyMoreButton').addEventListener('click', () => { showAllHistory = !showAllHistory; renderHistory(); });
  byId('historyTableBody').addEventListener('click', event => {
    const button = event.target.closest('[data-delete-count-id]');
    if (button) deleteCount(button.dataset.deleteCountId);
  });
  ctx.period.onChange(() => { showAllHistory = false; refreshDataViews(); });
  ctx.onAuthChange(() => {
    currentUser = ctx.isAdmin ? ctx.user : null;
    renderAuth();
    renderMonitoring();
    renderHistory();
  });

  renderAuth();
  if (!supabaseClient) {
    showDatabaseWarning('Connexion à la base indisponible : aucune donnée ne peut être affichée.');
    refreshDataViews();
    return { unmount() { if (chart) chart.destroy(); } };
  }
  const results = await Promise.all([loadStages(), loadRecords(), loadSettings()]);
  if (ctx.scope.disposed) return { unmount() {} };
  ctx.period.refresh();
  if (results[0] && results[1]) hideDatabaseWarning();
  refreshDataViews();

  return { unmount() { if (chart) chart.destroy(); } };
}
