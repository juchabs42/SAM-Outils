// SAM Tavelure — périthèces, projections de spores et pluie associée.
// Lecture libre ; saisie réservée aux administrateurs SAM.
import { presets } from '../core/period.js';
import { todayISO } from '../core/util.js';

const TEMPLATE = `
<div class="tool-main">
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
      <div><p class="panel-kicker">Spores + pluie</p><h3>Projections observées par épisode</h3></div>
      <span id="monitoringStatusBadge" class="status-pill">Suivi en cours</span>
    </div>
    <div class="controls">
      <p class="period-reminder" id="periodReminder"></p>
      <div class="actions">
        <button id="resetFiltersButton" class="secondary-button" type="button">Toute la saison</button>
        <button id="exportGraphButton" class="primary-button" type="button">Exporter en CSV</button>
      </div>
    </div>
    <div id="j0Warning" class="warning-box hidden">Le graphique démarrera dès qu’une date sera renseignée pour le stade 7.</div>
    <div id="emptyGraphMessage" class="empty-state hidden">Aucun épisode enregistré sur la période sélectionnée.</div>
    <div class="chart-wrap"><canvas id="sporeChart" aria-label="Graphique des spores observées et de la pluviométrie"></canvas></div>
  </section>

  <section id="episodeEntryPanel" class="panel admin-only hidden">
    <div class="panel-header"><div><p class="panel-kicker">Saisie</p><h3>Ajouter un épisode de tavelure</h3></div></div>
    <form id="episodeForm" class="form-grid episode-form">
      <label>Épisode<input id="entryEpisode" type="text" placeholder="Ex. Épisode 1" required></label>
      <div class="form-row">
        <label>Date<input id="entryDate" type="date" required></label>
        <label>Heure<input id="entryTime" type="time" required></label>
      </div>
      <div class="form-row">
        <label>Pluie (mm)<input id="entryRain" type="number" min="0" step="0.1" required></label>
        <label>Nombre de spores<input id="entrySpores" type="number" min="0" step="1"></label>
      </div>
      <label>Statut
        <select id="entryStatus" required>
          <option value="Validé">Validé</option>
          <option value="Pas de contamination">Pas de contamination</option>
        </select>
      </label>
      <button class="primary-button" type="submit">Ajouter l’épisode</button>
    </form>
    <div id="episodeMessage" class="form-message" role="status"></div>
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
        <thead><tr><th>Épisode</th><th>Date / heure</th><th>Pluie</th><th>Spores</th><th>Statut</th><th class="admin-only hidden">Action</th></tr></thead>
        <tbody id="historyTableBody"></tbody>
      </table>
    </div>
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
const formatDateTime = (date, time) => {
  if (!date) return '';
  const [year, month, day] = String(date).slice(0, 10).split('-');
  return `${day}/${month}/${year} à ${String(time || '00:00').slice(0, 5)}`;
};
const formatNumber = value => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(value);
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));

export async function mount(root, ctx) {
  root.innerHTML = TEMPLATE;
  const byId = id => root.querySelector(`#${id}`);
  const supabaseClient = ctx.supabase;
  let currentUser = ctx.isAdmin ? ctx.user : null;
  let stageDates = new Map();
  let records = [];
  let monitoring = { suivi_termine: false, date_fin: null };
  let chart = null;

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

  function statusBadge(status) {
    if (status === 'Validé') return '<span class="badge badge-valid">Validé</span>';
    return '<span class="badge badge-none">Pas de contamination</span>';
  }

  function renderAuth() {
    root.querySelectorAll('.admin-only').forEach(el => el.classList.toggle('hidden', !currentUser));
    renderStages();
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

  async function loadMonitoring() {
    monitoring = { suivi_termine: false, date_fin: null };
    const { data, error } = await supabaseClient.from(TABLES.settings).select('suivi_termine,date_fin').eq('id', 1).maybeSingle();
    if (error) console.error(error);
    if (data) monitoring = data;
    renderMonitoring();
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
    await loadMonitoring();
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

  function drawChart() {
    const j0 = getJ0();
    const rows = filteredRecords();
    const canvas = byId('sporeChart');
    byId('j0Warning').classList.toggle('hidden', Boolean(j0));
    byId('emptyGraphMessage').classList.toggle('hidden', !j0 || rows.length > 0);
    canvas.classList.toggle('hidden', !j0 || rows.length === 0);
    canvas.parentElement.classList.toggle('hidden', !j0 || rows.length === 0);
    if (chart) { chart.destroy(); chart = null; }
    if (!j0 || !rows.length) return;
    const narrow = window.innerWidth <= 720;
    chart = new window.Chart(canvas, {
      data: {
        labels: rows.map(row => `${row.episode} · ${formatDate(row.date_obs)}`),
        datasets: [
          { type: 'bar', label: 'Pluviométrie (mm)', data: rows.map(row => Number(row.pluie_mm) || 0), backgroundColor: 'rgba(43, 121, 194, 0.75)', borderColor: '#2b79c2', borderWidth: 1, borderRadius: 4, yAxisID: 'yRain' },
          { type: 'line', label: 'Spores observées', data: rows.map(row => (row.spores === null || row.spores === undefined ? null : Number(row.spores))), borderColor: '#cf1e2e', backgroundColor: '#cf1e2e', tension: 0.25, pointRadius: narrow ? 3 : 4, spanGaps: false, yAxisID: 'ySpores' }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, padding: narrow ? 10 : 18, font: { size: narrow ? 10 : 12 } } },
          tooltip: { intersect: false, mode: 'index' }
        },
        scales: {
          x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: narrow ? 5 : 12, font: { size: narrow ? 10 : 12 } } },
          yRain: { beginAtZero: true, position: 'left', title: { display: true, text: 'Pluie (mm)' }, grid: { color: 'rgba(102, 113, 124, 0.13)' } },
          ySpores: { beginAtZero: true, position: 'right', title: { display: true, text: 'Nombre de spores' }, grid: { drawOnChartArea: false } }
        }
      }
    });
  }

  function renderHistory() {
    const rows = filteredRecords();
    const body = byId('historyTableBody');
    const columnCount = currentUser ? 6 : 5;
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="${columnCount}">Aucune donnée enregistrée sur la période.</td></tr>`;
      return;
    }
    body.innerHTML = rows.map(row => `
      <tr>
        <td data-label="Épisode"><strong>${escapeHtml(row.episode)}</strong></td>
        <td data-label="Date / heure">${formatDateTime(row.date_obs, row.heure_obs)}</td>
        <td data-label="Pluie">${formatNumber(Number(row.pluie_mm) || 0)} mm</td>
        <td data-label="Spores">${row.spores === null || row.spores === undefined ? '' : formatNumber(Number(row.spores))}</td>
        <td data-label="Statut">${statusBadge(row.statut)}</td>
        ${currentUser ? `<td data-label="Action"><button class="delete-count-button" type="button" data-delete-count-id="${row.id}">Supprimer</button></td>` : ''}
      </tr>`).join('');
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
    const header = ['episode', 'date', 'heure', 'pluie_mm', 'spores', 'statut'];
    const values = rows.map(row => [row.episode, row.date_obs, row.heure_obs, String(row.pluie_mm ?? '').replace('.', ','), row.spores ?? '', row.statut]);
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
    const payload = {
      episode: byId('entryEpisode').value.trim(),
      date_obs: byId('entryDate').value,
      heure_obs: byId('entryTime').value,
      pluie_mm: Number(byId('entryRain').value),
      spores: sporesRaw === '' ? null : Number(sporesRaw),
      statut: byId('entryStatus').value,
      comptage_termine: true
    };
    const { error } = await supabaseClient.from(TABLES.counts).insert(payload);
    if (error) {
      console.error(error);
      message.textContent = `Enregistrement impossible : ${error.message}`;
      return;
    }
    message.textContent = 'Épisode enregistré.';
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
  byId('resetFiltersButton').addEventListener('click', () => { ctx.period.set({ preset: 'season' }); refreshDataViews(); });
  byId('exportGraphButton').addEventListener('click', exportCsv);
  byId('historyTableBody').addEventListener('click', event => {
    const button = event.target.closest('[data-delete-count-id]');
    if (button) deleteCount(button.dataset.deleteCountId);
  });
  ctx.period.onChange(() => refreshDataViews());
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
  const results = await Promise.all([loadStages(), loadRecords(), loadMonitoring()]);
  if (ctx.scope.disposed) return { unmount() {} };
  ctx.period.refresh();
  if (results[0] && results[1]) hideDatabaseWarning();
  refreshDataViews();

  return { unmount() { if (chart) chart.destroy(); } };
}
