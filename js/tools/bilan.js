// SAM Bilan hydrique — suivi et projection du stock hydrique des parcelles (pommier).
// Reprise de l'appli « SAM Bilan Hydrique » : les parcelles sont enregistrées dans le
// compte (connexion obligatoire). Des parcelles gardées sur l'appareil par l'ancienne
// version peuvent être importées dans le compte.
// Nappe (Hub'Eau) et remontées capillaires retirées de cette version.
import { storage } from '../core/util.js';
import { enableChartZoom } from '../core/charts.js';

const TEMPLATE = `    <div class="tool-main" id="appArea">
      <section id="storageBanner" class="card storage-banner hidden"></section>
      <section class="toolbar card">
        <div class="parcel-select-wrap">
          <label for="parcelSelect">Parcelle</label>
          <select id="parcelSelect"></select>
        </div>
        <button id="newParcelBtn" class="btn primary" type="button">+ Nouvelle parcelle</button>
      </section>

      <nav class="tabs" aria-label="Navigation principale">
        <button class="tab active" data-tab="dashboard" type="button">Bilan</button>
        <button class="tab" data-tab="irrigation" type="button">Irrigations</button>
        <button class="tab" data-tab="parcel" type="button">Parcelle</button>
      </nav>

      <section id="tab-dashboard" class="tab-panel active">
        <div id="noParcelDashboard" class="card empty-state hidden">
          <h2>Créer une parcelle</h2>
          <p>Commencez par renseigner le sol, la profondeur d'enracinement et la localisation.</p>
          <button class="btn primary" type="button" data-open-parcel>Créer ma première parcelle</button>
        </div>

        <div id="dashboardContent" class="hidden">
          <div class="kpi-grid">
            <article class="kpi"><span>Stock actuel</span><strong id="kpiStock">—</strong><small id="kpiStockSub">—</small></article>
            <article class="kpi"><span>Stock</span><strong id="kpiPercent">—</strong><small>de la RU</small></article>
            <article class="kpi"><span>Marge avant RFU</span><strong id="kpiMargin">—</strong><small id="kpiRfuSub">—</small></article>
            <article class="kpi"><span>Besoin du jour</span><strong id="kpiNeed">—</strong><small>ET₀ × Kc</small></article>
          </div>

          <section id="adviceCard" class="card advice hidden">
            <h2>Repère irrigation</h2>
            <p id="adviceText"></p>
          </section>

          <section class="card chart-card">
            <div class="row-between wrap gap">
              <div>
                <h2>Bilan hydrique</h2>
                <p id="chartSubtitle" class="muted small"></p>
              </div>
              <div class="inline-controls">
                <button id="refreshBtn" class="btn secondary" type="button">Actualiser</button>
              </div>
            </div>
            <div id="bilanFilters" class="bilan-filters"></div>
            <p class="chart-axes-note">Stock en mm à gauche · apports du jour (pluie, irrigation) en mm à droite.<span id="chartSwipeHint" class="hidden"> Glissez le graphique pour parcourir la période.</span></p>
            <div class="chart-wrap"><canvas id="waterChart"></canvas></div>
          </section>

          <section class="summary-grid">
            <article class="card compact-card"><span>RU</span><strong id="summaryRu">—</strong></article>
            <article class="card compact-card"><span>RFU / seuil</span><strong id="summaryRfu">—</strong></article>
            <article class="card compact-card"><span>Drainage sur la période</span><strong id="summaryDrainage">—</strong></article>
            <article class="card compact-card"><span>Kc du jour</span><strong id="summaryKc">—</strong></article>
          </section>

          <section class="card">
            <div class="row-between wrap gap">
              <div>
                <h2>Corriger une pluie</h2>
                <p class="muted small">La valeur saisie remplace complètement la pluie Open‑Meteo. Les épisodes pluvieux inférieurs à 5 mm ne rechargent pas le stock.</p>
              </div>
            </div>
            <div class="form-grid">
              <label>Date<input id="rainCorrectionDate" type="date" /></label>
              <label>Pluie mesurée (mm)<input id="rainCorrectionAmount" type="number" min="0" step="0.1" inputmode="decimal" /></label>
            </div>
            <div id="rainOriginalInfo" class="muted small">Choisissez une date pour afficher la valeur Open‑Meteo.</div>
            <div class="actions">
              <button id="saveRainCorrectionBtn" class="btn primary" type="button">Enregistrer le remplacement</button>
              <button id="deleteRainCorrectionBtn" class="btn secondary" type="button">Utiliser Open‑Meteo</button>
            </div>
            <p id="rainCorrectionMessage" class="form-message"></p>
          </section>

          <section class="card export-card">
            <div>
              <h2>Exporter les données</h2>
              <p class="muted small">L'export contient date, ET₀, Kc, ETc, pluie Open‑Meteo, pluie corrigée, pluie efficace, irrigation, stock et drainage, depuis le 1er janvier jusqu'à la fin de la période choisie.</p>
            </div>
            <div class="actions">
              <button id="exportCsvBtn" class="sam-csv-button" type="button" title="Télécharger les données du bilan (CSV)">CSV</button>
            </div>
          </section>
        </div>
      </section>

      <section id="tab-irrigation" class="tab-panel">
        <div id="noParcelIrrigation" class="card empty-state hidden">Créez d'abord une parcelle.</div>
        <div id="irrigationContent" class="hidden">
          <section class="card">
            <h2>Ajouter une irrigation</h2>
            <div class="form-grid">
              <label>Date<input id="irrigationDate" type="date" /></label>
              <label>Quantité (mm)<input id="irrigationAmount" type="number" min="0" step="0.1" inputmode="decimal" /><small id="irrigationConversion" class="muted">—</small></label>
              <label class="check-label"><input id="repeatIrrigation" type="checkbox" /> Répéter cette irrigation</label>
            </div>
            <div id="repeatOptions" class="repeat-box hidden">
              <div class="form-grid">
                <label>Fréquence
                  <select id="repeatInterval">
                    <option value="1">Tous les jours</option>
                    <option value="2">Tous les 2 jours</option>
                    <option value="3">Tous les 3 jours</option>
                    <option value="7">Toutes les semaines</option>
                  </select>
                </label>
                <label>Date de fin<input id="repeatEndDate" type="date" /></label>
              </div>
            </div>
            <div class="actions"><button id="saveIrrigationBtn" class="btn primary" type="button">Enregistrer</button></div>
            <p id="irrigationMessage" class="form-message"></p>
          </section>

          <section class="card import-card">
            <div class="row-between wrap gap">
              <div>
                <h2>Importer des irrigations</h2>
                <p class="muted small">Fichier Excel (.xlsx ou .xls) avec deux colonnes : <strong>Date</strong> et <strong>Apport</strong> (mm). Les dates peuvent être à n'importe quel moment de l'année.</p>
              </div>
            </div>
            <label class="file-label">Fichier Excel<input id="irrigationImportFile" type="file" accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" /></label>
            <div id="irrigationImportPreview" class="import-preview hidden">
              <div id="irrigationImportDetails"></div>
              <div class="actions">
                <button id="importIrrigationsBtn" class="btn primary" type="button">Importer ces irrigations</button>
                <button id="cancelIrrigationImportBtn" class="btn secondary" type="button">Annuler</button>
              </div>
            </div>
            <p id="irrigationImportMessage" class="form-message"></p>
          </section>

          <section class="card">
            <div class="row-between wrap gap">
              <h2>Historique des irrigations</h2>
              <div class="bulk-actions">
                <label class="check-inline"><input id="selectAllIrrigation" type="checkbox" /> Tout sélectionner</label>
                <button id="deleteSelectedIrrigationBtn" class="btn danger" type="button" disabled>Supprimer la sélection</button>
              </div>
            </div>
            <div id="selectedIrrigationCount" class="muted small list-helper hidden"></div>
            <div id="irrigationList" class="item-list"></div>
            <button id="irrigationMoreBtn" class="btn secondary list-more hidden" type="button"></button>
          </section>
        </div>
      </section>

      <section id="tab-parcel" class="tab-panel">
        <section class="card">
          <div class="row-between wrap gap">
            <div><h2 id="parcelFormTitle">Nouvelle parcelle</h2></div>
            <button id="deleteParcelBtn" class="btn danger hidden" type="button">Supprimer</button>
          </div>

          <div class="section-title">Informations générales</div>
          <div class="form-grid">
            <label>Nom de la parcelle<input id="parcelName" type="text" /></label>
            <label>Surface (ha)<input id="parcelArea" type="number" min="0" step="0.01" inputmode="decimal" /></label>
          </div>

          <div class="section-title">Localisation</div>
          <div class="location-actions">
            <div class="search-wrap">
              <input id="locationSearch" type="text" placeholder="Chercher un lieu" />
              <button id="searchLocationBtn" class="btn secondary" type="button">Rechercher</button>
            </div>
            <button id="geolocateBtn" class="btn secondary" type="button">Trouver ma position</button>
          </div>
          <div id="locationResults" class="location-results"></div>
          <div class="location-selected">Position : <strong id="selectedLocation">Non définie</strong></div>

          <div class="section-title">Sol</div>
          <div class="form-grid three">
            <label>Argile (%)<input id="clayPct" type="number" min="0" max="100" step="0.1" inputmode="decimal" /></label>
            <label>Limon (%)<input id="siltPct" type="number" min="0" max="100" step="0.1" inputmode="decimal" /></label>
            <label>Sable (%)<input id="sandPct" type="number" min="0" max="100" step="0.1" inputmode="decimal" /></label>
          </div>
          <div class="soil-result">
            <div><span>Classe</span><strong id="soilClassResult">—</strong></div>
            <div><span>RUM</span><strong id="rumResult">—</strong></div>
          </div>
          <div class="form-grid">
            <label>Profondeur d'enracinement (cm)<input id="rootDepth" type="number" min="1" max="300" step="1" inputmode="numeric" /></label>
          </div>
          <div class="soil-result three">
            <div><span>RU</span><strong id="ruResult">—</strong></div>
            <div><span>RFU (FAO)</span><strong id="rfuResult">—</strong></div>
            <div><span>Seuil d'alerte</span><strong id="thresholdResult">—</strong></div>
          </div>

          <div class="section-title">Culture — Pommier</div>
          <div class="form-grid three">
            <label>Système d'irrigation
              <select id="irrigationSystem">
                <option value="drip">Goutte-à-goutte</option>
                <option value="sprinkler">Aspersion</option>
              </select>
            </label>
            <label>Inter-rang
              <select id="groundCoverType">
                <option value="bare">Sol nu</option>
                <option value="vegetated">Inter-rang végétalisé</option>
              </select>
            </label>
            <label>Date de récolte<input id="harvestDate" type="date" /></label>
          </div>
          <label class="check-label"><input id="customKc" type="checkbox" /> Personnaliser les Kc</label>
          <div id="kcFields" class="form-grid four hidden">
            <label>Kc avril<input id="kcInitial" type="number" min="0" max="2" step="0.01" /></label>
            <label>Kc juin<input id="kcMid" type="number" min="0" max="2" step="0.01" /></label>
            <label>Kc juillet → récolte<input id="kcPeak" type="number" min="0" max="2" step="0.01" /></label>
            <label>Kc après récolte<input id="kcEnd" type="number" min="0" max="2" step="0.01" /></label>
          </div>
          <div class="kc-calendar">
            <strong>Calendrier Kc</strong>
            <p id="kcCalendarText">Avril : Kc bas · Mai : transition progressive · Juin : Kc intermédiaire · Juillet à récolte : Kc maximum · Après récolte : Kc réduit.</p>
            <p>Le bilan démarre le 1er avril avec la RU pleine.</p>
          </div>

          <div class="actions"><button id="saveParcelBtn" class="btn primary" type="button">Enregistrer la parcelle</button></div>
          <p id="parcelMessage" class="form-message"></p>
        </section>
      </section>
    </div>

  <div id="modalBackdrop" class="modal-backdrop hidden">
    <div class="modal card" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
      <h2 id="modalTitle">Modifier l'irrigation</h2>
      <label>Quantité (mm)<input id="editIrrigationAmount" type="number" min="0" step="0.1" /></label>
      <div id="editSeriesOptions" class="radio-list hidden">
        <label><input type="radio" name="seriesScope" value="one" checked /> Seulement cette irrigation</label>
        <label><input type="radio" name="seriesScope" value="following" /> Celle-ci et les suivantes</label>
        <label><input type="radio" name="seriesScope" value="all" /> Toute la série</label>
      </div>
      <div class="actions">
        <button id="cancelModalBtn" class="btn secondary" type="button">Annuler</button>
        <button id="saveEditIrrigationBtn" class="btn primary" type="button">Enregistrer</button>
      </div>
    </div>
  </div>`;

export async function mount(root, ctx) {
  root.innerHTML = TEMPLATE;


const SOIL_CLASSES = [
  { name: 'Sable', clayMin: 0, clayMax: 10, siltMin: 0, siltMax: 10, rum: 0.70 },
  { name: 'Sable limoneux', clayMin: 0, clayMax: 15, siltMin: 10, siltMax: 30, rum: 1.00 },
  { name: 'Sable argileux', clayMin: 10, clayMax: 25, siltMin: 0, siltMax: 20, rum: 1.35 },
  { name: 'Argilo-sableux', clayMin: 25, clayMax: 45, siltMin: 0, siltMax: 30, rum: 1.70 },
  { name: 'Argile', clayMin: 30, clayMax: 45, siltMin: 30, siltMax: 50, rum: 1.75 },
  { name: 'Argilo-limoneux', clayMin: 30, clayMax: 45, siltMin: 50, siltMax: 70, rum: 1.80 },
  { name: 'Argile lourde', clayMin: 45, clayMax: 100.01, siltMin: 0, siltMax: 60, rum: 1.65 },
  { name: 'Limon sableux', clayMin: 10, clayMax: 25, siltMin: 30, siltMax: 50, rum: 1.45 },
  { name: 'Limon sableux argileux', clayMin: 20, clayMax: 35, siltMin: 30, siltMax: 50, rum: 1.65 },
  { name: 'Limon argilo-sableux', clayMin: 20, clayMax: 35, siltMin: 50, siltMax: 70, rum: 1.75 },
  { name: 'Limon moyen sableux', clayMin: 10, clayMax: 25, siltMin: 50, siltMax: 80, rum: 1.60 },
  { name: 'Limon moyen', clayMin: 10, clayMax: 25, siltMin: 70, siltMax: 90, rum: 1.75 },
  { name: 'Limon fin sableux', clayMin: 0, clayMax: 15, siltMin: 50, siltMax: 70, rum: 1.20 },
  { name: 'Limon fin', clayMin: 0, clayMax: 15, siltMin: 70, siltMax: 100.01, rum: 1.30 },
  { name: 'Limon argileux', clayMin: 20, clayMax: 35, siltMin: 70, siltMax: 90, rum: 1.95 }
];

// Grille validée pour le pommier.
const KC_GRID = {
  'drip|bare':       { april: 0.50, june: 0.65, peak: 0.80, end: 0.50 },
  'sprinkler|bare':  { april: 0.60, june: 0.75, peak: 0.90, end: 0.60 },
  'drip|vegetated':  { april: 0.60, june: 0.75, peak: 0.90, end: 0.60 },
  'sprinkler|vegetated': { april: 0.70, june: 0.85, peak: 1.00, end: 0.70 }
};

const RAIN_EPISODE_THRESHOLD_MM = 5;
const DEFAULT_HARVEST_MD = '09-15';



const state = {
  store: null,
  user: null,
  parcels: [],
  activeParcel: null,
  irrigations: [],
  rainCorrections: [],
  weather: [],
  balance: [],
  chart: null,
  selectedLocation: null,
  editingIrrigation: null,
  selectedIrrigationIds: new Set(),
  irrigationImportRows: [],
  showAllIrrigations: false
};

const $ = id => root.querySelector(`#${id}`);
const qsa = selector => [...root.querySelectorAll(selector)];

function localToday() { return new Date(); }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function round(v, d = 2) { const f = 10 ** d; return Math.round((Number(v) + Number.EPSILON) * f) / f; }

function toISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseISO(value) {
  const [y, m, d] = String(value).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function daysBetween(a, b) {
  return Math.round((parseISO(b) - parseISO(a)) / 86400000);
}

function fmtDate(iso) {
  if (!iso) return '—';
  return parseISO(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtShort(iso) {
  return parseISO(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
}

function num(value, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return Number(value).toLocaleString('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function escapeHTML(value = '') {
  return String(value).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
}

function safeFilename(value) {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
}

function setMessage(id, text = '', type = '') {
  const el = $(id);
  if (!el) return;
  el.textContent = text;
  el.className = `form-message ${type}`.trim();
}

function toast(text) {
  ctx.ui.toast(text, 3200);
}

function getCurrentSeasonYear(date = localToday()) {
  // Saison avril-octobre. Entre janvier et mars, la dernière saison est l'année précédente.
  return date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
}

function seasonStartISO(year) { return `${year}-04-01`; }
function seasonEndISO(year) { return `${year}-10-31`; }

// Plage de calcul du bilan : en continu depuis le 1er janvier de l'année du début de la
// période choisie, jusqu'à la fin de cette période (au plus aujourd'hui + 7 jours de prévision).
// Hors saison (novembre → mars) les arbres sont au repos (Kc = 0) : le sol se recharge avec
// la pluie ; il est donc plein au 1er avril comme avant, et la saison est inchangée.
function balanceRange() {
  const p = ctx.period.get();
  const today = localToday();
  const maxEnd = toISO(addDays(today, 7));
  const start = `${(p?.start ? parseISO(p.start) : today).getFullYear()}-01-01`;
  let end = p?.end || maxEnd;
  if (end > maxEnd) end = maxEnd;
  if (end < start) end = start;
  return { start, end, key: `${start}|${end}` };
}

function rangeYearsLabel(range = balanceRange()) {
  const a = range.start.slice(0, 4);
  const b = range.end.slice(0, 4);
  return a === b ? a : `${a}–${b}`;
}

function findSoilClass(clay, silt) {
  return SOIL_CLASSES.find(row => clay >= row.clayMin && clay < row.clayMax && silt >= row.siltMin && silt < row.siltMax) || null;
}

function interpolation(a, b, t) { return a + (b - a) * clamp(t, 0, 1); }

function getAutomaticKcSet(irrigationSystem, coverType) {
  return KC_GRID[`${irrigationSystem}|${coverType}`] || KC_GRID['drip|bare'];
}

function getHarvestDateForYear(parcel, year) {
  const raw = parcel.harvest_date;
  let md = DEFAULT_HARVEST_MD;
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) md = raw.slice(5);
  return `${year}-${md}`;
}

function kcForDate(iso, parcel) {
  const d = parseISO(iso);
  const y = d.getFullYear();
  const md = (m, day) => new Date(y, m - 1, day, 12);

  const automatic = getAutomaticKcSet(parcel.irrigation_system || 'drip', parcel.ground_cover ? 'vegetated' : 'bare');
  const custom = !!parcel.use_custom_kc;
  const april = custom ? Number(parcel.kc_initial) : automatic.april;
  const june = custom ? Number(parcel.kc_mid) : automatic.june;
  const peak = custom ? Number(parcel.kc_peak ?? parcel.kc_mid) : automatic.peak;
  const end = custom ? Number(parcel.kc_end) : automatic.end;
  const harvest = parseISO(getHarvestDateForYear(parcel, y));

  if (d < md(4, 1) || d > md(10, 31)) return 0;
  if (d <= md(4, 30)) return april;
  if (d <= md(5, 31)) {
    const t = (d - md(5, 1)) / (md(5, 31) - md(5, 1));
    return interpolation(april, june, t);
  }
  if (d <= md(6, 30)) return june;
  if (d <= harvest) return peak;
  return end;
}

function updateKcDefaults() {
  if (!$('irrigationSystem') || !$('groundCoverType')) return;
  if ($('customKc')?.checked) return;
  const set = getAutomaticKcSet($('irrigationSystem').value, $('groundCoverType').value);
  $('kcInitial').value = set.april;
  $('kcMid').value = set.june;
  $('kcPeak').value = set.peak;
  $('kcEnd').value = set.end;
  updateKcCalendarText();
}

function updateKcCalendarText() {
  const el = $('kcCalendarText');
  if (!el) return;
  const a = Number($('kcInitial')?.value);
  const j = Number($('kcMid')?.value);
  const p = Number($('kcPeak')?.value);
  const e = Number($('kcEnd')?.value);
  el.textContent = `Avril : ${num(a,2)} · Mai : transition ${num(a,2)} → ${num(j,2)} · Juin : ${num(j,2)} · Juillet à récolte : ${num(p,2)} · Après récolte : ${num(e,2)}.`;
}

function bindEvents() {
  qsa('.tab').forEach(btn => btn.addEventListener('click', () => openTab(btn.dataset.tab)));
  qsa('[data-open-parcel]').forEach(btn => btn.addEventListener('click', openNewParcel));
  $('newParcelBtn')?.addEventListener('click', openNewParcel);
  $('parcelSelect')?.addEventListener('change', () => activateParcel($('parcelSelect').value));

  $('searchLocationBtn')?.addEventListener('click', searchLocation);
  $('locationSearch')?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); searchLocation(); } });
  $('geolocateBtn')?.addEventListener('click', geolocate);

  ['clayPct', 'siltPct', 'sandPct', 'rootDepth'].forEach(id => $(id)?.addEventListener('input', updateSoilPreview));
  $('irrigationSystem')?.addEventListener('change', updateKcDefaults);
  $('groundCoverType')?.addEventListener('change', updateKcDefaults);
  $('harvestDate')?.addEventListener('change', updateKcCalendarText);
  $('customKc')?.addEventListener('change', () => {
    $('kcFields')?.classList.toggle('hidden', !$('customKc').checked);
    if (!$('customKc').checked) updateKcDefaults();
    else updateKcCalendarText();
  });
  ['kcInitial','kcMid','kcPeak','kcEnd'].forEach(id => $(id)?.addEventListener('input', updateKcCalendarText));
  $('saveParcelBtn')?.addEventListener('click', saveParcel);
  $('deleteParcelBtn')?.addEventListener('click', deleteParcel);

  $('repeatIrrigation')?.addEventListener('change', () => $('repeatOptions')?.classList.toggle('hidden', !$('repeatIrrigation').checked));
  $('irrigationAmount')?.addEventListener('input', updateIrrigationConversion);
  $('saveIrrigationBtn')?.addEventListener('click', saveIrrigation);

  $('irrigationImportFile')?.addEventListener('change', readIrrigationImportFile);
  $('importIrrigationsBtn')?.addEventListener('click', importIrrigations);
  $('cancelIrrigationImportBtn')?.addEventListener('click', clearIrrigationImport);
  $('selectAllIrrigation')?.addEventListener('change', toggleSelectAllIrrigations);
  $('deleteSelectedIrrigationBtn')?.addEventListener('click', deleteSelectedIrrigations);
  $('irrigationMoreBtn')?.addEventListener('click', () => { state.showAllIrrigations = !state.showAllIrrigations; renderIrrigationList(); });

  $('cancelModalBtn')?.addEventListener('click', closeIrrigationModal);
  $('modalBackdrop')?.addEventListener('click', e => { if (e.target === $('modalBackdrop')) closeIrrigationModal(); });
  $('saveEditIrrigationBtn')?.addEventListener('click', saveEditedIrrigation);

  $('refreshBtn')?.addEventListener('click', () => refreshBalance(true));
  $('exportCsvBtn')?.addEventListener('click', exportCsv);

  $('rainCorrectionDate')?.addEventListener('change', updateRainCorrectionInfo);
  $('saveRainCorrectionBtn')?.addEventListener('click', saveRainCorrection);
  $('deleteRainCorrectionBtn')?.addEventListener('click', deleteRainCorrection);
}

function openTab(name) {
  qsa('.tab').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === name));
  qsa('.tab-panel').forEach(panel => panel.classList.toggle('active', panel.id === `tab-${name}`));
}

async function init() {
  bindEvents();
  const today = toISO(localToday());
  if ($('irrigationDate')) { $('irrigationDate').value = today; $('irrigationDate').max = today; }
  if ($('repeatEndDate')) { $('repeatEndDate').value = today; $('repeatEndDate').max = today; }
  if ($('rainCorrectionDate')) { $('rainCorrectionDate').value = today; $('rainCorrectionDate').max = today; }
  setupStore();
  await loadParcels();
}

async function loadParcels() {
  const { data, error } = await state.store.listParcels();
  if (error) return toast(`Erreur d’enregistrement : ${error.message}`);
  state.parcels = data || [];
  renderParcelSelector();
  const stored = storage.get(activeParcelKey(), null);
  const target = state.parcels.find(p => p.id === stored) || state.parcels[0] || null;
  if (target) await activateParcel(target.id);
  else showNoParcel();
}

function renderParcelSelector() {
  const select = $('parcelSelect');
  if (!select) return;
  select.innerHTML = '';
  if (!state.parcels.length) {
    const opt = document.createElement('option');
    opt.textContent = 'Aucune parcelle';
    opt.value = '';
    select.appendChild(opt);
    select.disabled = true;
    return;
  }
  select.disabled = false;
  state.parcels.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    select.appendChild(opt);
  });
}

function showNoParcel() {
  state.activeParcel = null;
  $('noParcelDashboard')?.classList.remove('hidden');
  $('dashboardContent')?.classList.add('hidden');
  $('noParcelIrrigation')?.classList.remove('hidden');
  $('irrigationContent')?.classList.add('hidden');
  resetParcelForm();
}

async function activateParcel(id) {
  const parcel = state.parcels.find(p => p.id === id);
  if (!parcel) return showNoParcel();
  state.activeParcel = parcel;
  state.weather = [];
  state.balance = [];
  state.selectedIrrigationIds.clear();
  state.showAllIrrigations = false;
  storage.set(activeParcelKey(), id);
  $('parcelSelect').value = id;
  $('noParcelDashboard')?.classList.add('hidden');
  $('dashboardContent')?.classList.remove('hidden');
  $('noParcelIrrigation')?.classList.add('hidden');
  $('irrigationContent')?.classList.remove('hidden');
  fillParcelForm(parcel);
  await Promise.all([loadIrrigations(), loadRainCorrections()]);
  renderIrrigationList();
  updateIrrigationConversion();
  await refreshBalance(true);
}

function openNewParcel() {
  resetParcelForm();
  openTab('parcel');
}

function resetParcelForm() {
  // Le lieu de la parcelle se choisit ici (recherche ou position), pas dans un filtre commun.
  state.selectedLocation = null;
  $('parcelFormTitle').textContent = 'Nouvelle parcelle';
  $('deleteParcelBtn')?.classList.add('hidden');
  ['parcelName','parcelArea','locationSearch','clayPct','siltPct','sandPct','rootDepth'].forEach(id => { if ($(id)) $(id).value = ''; });
  $('selectedLocation').textContent = state.selectedLocation ? `${state.selectedLocation.name} (${Number(state.selectedLocation.latitude).toFixed(4)}, ${Number(state.selectedLocation.longitude).toFixed(4)})` : 'Non définie';
  $('locationResults').innerHTML = '';
  $('irrigationSystem').value = 'drip';
  $('groundCoverType').value = 'bare';
  $('harvestDate').value = `${getCurrentSeasonYear()}-${DEFAULT_HARVEST_MD}`;
  $('customKc').checked = false;
  $('kcFields').classList.add('hidden');
  updateKcDefaults();
  $('soilClassResult').textContent = '—';
  $('rumResult').textContent = '—';
  $('ruResult').textContent = '—';
  $('rfuResult').textContent = '—';
  $('thresholdResult').textContent = '—';
  $('saveParcelBtn').dataset.editingId = '';
  setMessage('parcelMessage', '');
}

function fillParcelForm(parcel) {
  $('parcelFormTitle').textContent = `Parcelle — ${parcel.name}`;
  $('deleteParcelBtn')?.classList.remove('hidden');
  $('saveParcelBtn').dataset.editingId = parcel.id;
  $('parcelName').value = parcel.name;
  $('parcelArea').value = parcel.area_ha;
  state.selectedLocation = { name: parcel.location_name, latitude: Number(parcel.latitude), longitude: Number(parcel.longitude) };
  $('selectedLocation').textContent = `${parcel.location_name} (${Number(parcel.latitude).toFixed(4)}, ${Number(parcel.longitude).toFixed(4)})`;
  $('clayPct').value = parcel.clay_pct;
  $('siltPct').value = parcel.silt_pct;
  $('sandPct').value = parcel.sand_pct;
  $('rootDepth').value = parcel.root_depth_cm;
  $('irrigationSystem').value = parcel.irrigation_system || 'drip';
  $('groundCoverType').value = parcel.ground_cover ? 'vegetated' : 'bare';
  $('harvestDate').value = parcel.harvest_date || `${getCurrentSeasonYear()}-${DEFAULT_HARVEST_MD}`;
  $('customKc').checked = !!parcel.use_custom_kc;
  $('kcFields').classList.toggle('hidden', !parcel.use_custom_kc);

  const auto = getAutomaticKcSet(parcel.irrigation_system || 'drip', parcel.ground_cover ? 'vegetated' : 'bare');
  $('kcInitial').value = parcel.use_custom_kc ? parcel.kc_initial : auto.april;
  $('kcMid').value = parcel.use_custom_kc ? parcel.kc_mid : auto.june;
  $('kcPeak').value = parcel.use_custom_kc ? (parcel.kc_peak ?? parcel.kc_mid) : auto.peak;
  $('kcEnd').value = parcel.use_custom_kc ? parcel.kc_end : auto.end;
  updateKcCalendarText();
  updateSoilPreview();
}

async function searchLocation() {
  const name = $('locationSearch').value.trim();
  if (name.length < 2) return toast('Saisissez au moins 2 caractères.');
  $('locationResults').innerHTML = '<div class="muted small">Recherche…</div>';
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=8&language=fr&format=json&countryCode=FR`;
    const data = await fetchJson(url);
    const results = data.results || [];
    if (!results.length) return $('locationResults').innerHTML = '<div class="muted small">Aucun lieu trouvé.</div>';
    $('locationResults').innerHTML = results.map((r, idx) => {
      const label = [r.name, r.admin2, r.admin1].filter(Boolean).join(', ');
      return `<div class="location-result"><span>${escapeHTML(label)}</span><button class="btn secondary" type="button" data-location-index="${idx}">Choisir</button></div>`;
    }).join('');
    qsa('[data-location-index]').forEach(btn => btn.addEventListener('click', () => {
      const r = results[Number(btn.dataset.locationIndex)];
      const label = [r.name, r.admin2, r.admin1].filter(Boolean).join(', ');
      state.selectedLocation = { name: label, latitude: r.latitude, longitude: r.longitude };
      $('selectedLocation').textContent = `${label} (${Number(r.latitude).toFixed(4)}, ${Number(r.longitude).toFixed(4)})`;
      $('locationResults').innerHTML = '';
    }));
  } catch (err) {
    $('locationResults').innerHTML = `<div class="form-message error">${escapeHTML(err.message)}</div>`;
  }
}

function geolocate() {
  if (!navigator.geolocation) return toast('La géolocalisation n’est pas disponible sur ce navigateur.');
  navigator.geolocation.getCurrentPosition(pos => {
    const latitude = pos.coords.latitude;
    const longitude = pos.coords.longitude;
    const name = `Position GPS ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
    state.selectedLocation = { name, latitude, longitude };
    $('selectedLocation').textContent = name;
  }, err => toast(`Géolocalisation impossible : ${err.message}`), { enableHighAccuracy: true, timeout: 10000 });
}

function updateSoilPreview() {
  const clay = Number($('clayPct').value);
  const silt = Number($('siltPct').value);
  const sand = Number($('sandPct').value);
  const depth = Number($('rootDepth').value);
  if (![clay, silt, sand].every(Number.isFinite)) return;
  const total = clay + silt + sand;
  if (Math.abs(total - 100) > 0.1) {
    $('soilClassResult').textContent = `Total = ${num(total,1)} %`;
    $('rumResult').textContent = '—';
    $('ruResult').textContent = '—';
    $('rfuResult').textContent = '—';
    $('thresholdResult').textContent = '—';
    return;
  }
  const soil = findSoilClass(clay, silt);
  if (!soil) {
    $('soilClassResult').textContent = 'Classe non déterminée';
    $('rumResult').textContent = '—';
    return;
  }
  $('soilClassResult').textContent = soil.name;
  $('rumResult').textContent = `${num(soil.rum,2)} mm/cm`;
  if (depth > 0) {
    const ru = soil.rum * depth;
    const rfu = ru * 0.50;
    $('ruResult').textContent = `${num(ru,1)} mm`;
    $('rfuResult').textContent = `${num(rfu,1)} mm`;
    $('thresholdResult').textContent = `${num(rfu,1)} mm`;
  }
}

async function saveParcel() {
  setMessage('parcelMessage', '');
  const clay = Number($('clayPct').value);
  const silt = Number($('siltPct').value);
  const sand = Number($('sandPct').value);
  const depth = Number($('rootDepth').value);
  const area = Number($('parcelArea').value);
  const name = $('parcelName').value.trim();
  const total = clay + silt + sand;

  if (!name) return setMessage('parcelMessage', 'Donnez un nom à la parcelle.', 'error');
  if (!state.selectedLocation) return setMessage('parcelMessage', 'Choisissez une localisation.', 'error');
  if (!(area > 0)) return setMessage('parcelMessage', 'La surface doit être supérieure à 0.', 'error');
  if (![clay, silt, sand].every(v => Number.isFinite(v) && v >= 0 && v <= 100)) return setMessage('parcelMessage', 'Renseignez correctement sable, limon et argile.', 'error');
  if (Math.abs(total - 100) > 0.1) return setMessage('parcelMessage', `Sable + limon + argile doivent totaliser 100 % (actuellement ${num(total,1)} %).`, 'error');
  if (!(depth > 0)) return setMessage('parcelMessage', 'Renseignez la profondeur d’enracinement.', 'error');
  if (!$('harvestDate').value) return setMessage('parcelMessage', 'Renseignez une date de récolte.', 'error');

  const soil = findSoilClass(clay, silt);
  if (!soil) return setMessage('parcelMessage', 'Cette combinaison argile/limon ne correspond à aucune classe du référentiel.', 'error');

  const custom = $('customKc').checked;
  if (!custom) updateKcDefaults();
  const kcInitial = Number($('kcInitial').value);
  const kcMid = Number($('kcMid').value);
  const kcPeak = Number($('kcPeak').value);
  const kcEnd = Number($('kcEnd').value);
  if (![kcInitial, kcMid, kcPeak, kcEnd].every(v => Number.isFinite(v) && v >= 0 && v <= 2)) return setMessage('parcelMessage', 'Vérifiez les valeurs de Kc.', 'error');

  const ru = soil.rum * depth;
  const rfu = ru * 0.50;
  const payload = {
    name,
    location_name: state.selectedLocation.name,
    latitude: state.selectedLocation.latitude,
    longitude: state.selectedLocation.longitude,
    area_ha: area,
    clay_pct: clay,
    silt_pct: silt,
    sand_pct: sand,
    soil_class: soil.name,
    rum_mm_cm: soil.rum,
    root_depth_cm: depth,
    ru_mm: ru,
    p_factor: 0.50,
    rfu_mm: rfu,
    irrigation_system: $('irrigationSystem').value,
    ground_cover: $('groundCoverType').value === 'vegetated',
    harvest_date: $('harvestDate').value,
    use_custom_kc: custom,
    kc_initial: kcInitial,
    kc_mid: kcMid,
    kc_peak: kcPeak,
    kc_end: kcEnd,
    updated_at: new Date().toISOString()
  };

  const editingId = $('saveParcelBtn').dataset.editingId;
  const result = editingId
    ? await state.store.updateParcel(editingId, payload)
    : await state.store.insertParcel(payload);

  if (result.error) return setMessage('parcelMessage', result.error.message, 'error');
  setMessage('parcelMessage', 'Parcelle enregistrée.', 'success');
  await loadParcels();
  if (result.data?.id) await activateParcel(result.data.id);
  openTab('dashboard');
}

async function deleteParcel() {
  if (!state.activeParcel) return;
  if (!confirm(`Supprimer définitivement la parcelle « ${state.activeParcel.name} » et ses irrigations ?`)) return;
  const { error } = await state.store.deleteParcel(state.activeParcel.id);
  if (error) return toast(error.message);
  storage.remove(activeParcelKey());
  await loadParcels();
  openTab('dashboard');
}

async function loadIrrigations() {
  if (!state.activeParcel) return;
  const { data, error } = await state.store.listIrrigations(state.activeParcel.id);
  if (error) return toast(error.message);
  state.irrigations = data || [];
}

async function loadRainCorrections() {
  if (!state.activeParcel) return;
  const { data, error } = await state.store.listRainCorrections(state.activeParcel.id);
  if (error) return toast(error.message);
  state.rainCorrections = data || [];
}

function updateIrrigationConversion() {
  const amount = Number($('irrigationAmount')?.value);
  const area = Number(state.activeParcel?.area_ha || 0);
  if (!(amount >= 0) || !area) return $('irrigationConversion').textContent = '—';
  const m3parcel = amount * 10 * area;
  $('irrigationConversion').textContent = `${num(m3parcel,1)} m³ sur la parcelle`;
}

async function saveIrrigation() {
  setMessage('irrigationMessage', '');
  if (!state.activeParcel) return;
  const date = $('irrigationDate').value;
  const amount = Number($('irrigationAmount').value);
  const today = toISO(localToday());
  if (!date || date > today) return setMessage('irrigationMessage', 'La date doit être aujourd’hui ou dans le passé.', 'error');
  if (!(amount >= 0)) return setMessage('irrigationMessage', 'Renseignez une quantité en mm.', 'error');

  const rows = [];
  if ($('repeatIrrigation').checked) {
    const interval = Number($('repeatInterval').value);
    let end = $('repeatEndDate').value;
    if (!end || end > today) end = today;
    if (end < date) return setMessage('irrigationMessage', 'La date de fin doit être après la première irrigation.', 'error');
    const seriesId = crypto.randomUUID ? crypto.randomUUID() : null;
    let d = parseISO(date);
    while (toISO(d) <= end) {
      rows.push({ parcel_id: state.activeParcel.id, irrigation_date: toISO(d), amount_mm: amount, series_id: seriesId, repeat_interval_days: interval, series_start_date: date, series_end_date: end });
      d = addDays(d, interval);
    }
  } else {
    rows.push({ parcel_id: state.activeParcel.id, irrigation_date: date, amount_mm: amount });
  }

  const { error } = await state.store.insertIrrigations(rows);
  if (error) return setMessage('irrigationMessage', error.message, 'error');
  setMessage('irrigationMessage', `${rows.length} irrigation${rows.length > 1 ? 's' : ''} enregistrée${rows.length > 1 ? 's' : ''}.`, 'success');
  await loadIrrigations();
  renderIrrigationList();
  await refreshBalance();
}

function irrigationRowsForSelectedSeason() {
  const { start, end } = balanceRange();
  return state.irrigations.filter(i => i.irrigation_date >= start && i.irrigation_date <= end);
}

function renderIrrigationList() {
  const list = $('irrigationList');
  if (!list) return;
  const rows = [...irrigationRowsForSelectedSeason()].sort((a, b) => String(b.irrigation_date).localeCompare(String(a.irrigation_date)));
  const more = $('irrigationMoreBtn');
  if (!rows.length) {
    list.innerHTML = `<div class="muted small">Aucune irrigation enregistrée en ${rangeYearsLabel()}.</div>`;
    more?.classList.add('hidden');
    updateBulkIrrigationUI();
    return;
  }
  // Les 10 dernières irrigations ; « Voir plus » affiche toute la période calculée.
  const LIMIT = 10;
  const shown = state.showAllIrrigations ? rows : rows.slice(0, LIMIT);
  if (more) {
    more.classList.toggle('hidden', rows.length <= LIMIT);
    more.textContent = state.showAllIrrigations ? 'Voir moins' : `Voir plus (${rows.length - LIMIT} autre${rows.length - LIMIT > 1 ? 's' : ''})`;
  }
  list.innerHTML = shown.map(i => `
    <div class="list-item">
      <div class="list-item-main">
        <input class="irrigation-select" type="checkbox" data-select-irrigation="${i.id}" ${state.selectedIrrigationIds.has(i.id) ? 'checked' : ''} aria-label="Sélectionner l'irrigation du ${fmtDate(i.irrigation_date)}" />
        <div><strong>${fmtDate(i.irrigation_date)} — ${num(i.amount_mm,1)} mm</strong><div class="meta">${num(Number(i.amount_mm) * 10 * Number(state.activeParcel.area_ha),1)} m³ sur la parcelle${i.series_id ? ' · série' : ''}</div></div>
      </div>
      <div class="list-actions"><button type="button" data-edit-irrigation="${i.id}">Modifier</button><button type="button" data-delete-irrigation="${i.id}">Supprimer</button></div>
    </div>`).join('');

  qsa('[data-select-irrigation]').forEach(cb => cb.addEventListener('change', () => {
    if (cb.checked) state.selectedIrrigationIds.add(cb.dataset.selectIrrigation);
    else state.selectedIrrigationIds.delete(cb.dataset.selectIrrigation);
    updateBulkIrrigationUI();
  }));
  qsa('[data-edit-irrigation]').forEach(btn => btn.addEventListener('click', () => openIrrigationModal(btn.dataset.editIrrigation)));
  qsa('[data-delete-irrigation]').forEach(btn => btn.addEventListener('click', () => deleteIrrigation(btn.dataset.deleteIrrigation)));
  updateBulkIrrigationUI();
}

function updateBulkIrrigationUI() {
  const rows = irrigationRowsForSelectedSeason();
  const selectedInSeason = rows.filter(r => state.selectedIrrigationIds.has(r.id));
  const all = rows.length > 0 && selectedInSeason.length === rows.length;
  if ($('selectAllIrrigation')) $('selectAllIrrigation').checked = all;
  if ($('deleteSelectedIrrigationBtn')) $('deleteSelectedIrrigationBtn').disabled = selectedInSeason.length === 0;
  if ($('selectedIrrigationCount')) {
    $('selectedIrrigationCount').classList.toggle('hidden', selectedInSeason.length === 0);
    $('selectedIrrigationCount').textContent = `${selectedInSeason.length} irrigation${selectedInSeason.length > 1 ? 's' : ''} sélectionnée${selectedInSeason.length > 1 ? 's' : ''}`;
  }
}

function toggleSelectAllIrrigations() {
  const rows = irrigationRowsForSelectedSeason();
  if ($('selectAllIrrigation').checked) rows.forEach(r => state.selectedIrrigationIds.add(r.id));
  else rows.forEach(r => state.selectedIrrigationIds.delete(r.id));
  renderIrrigationList();
}

async function deleteSelectedIrrigations() {
  const ids = [...state.selectedIrrigationIds];
  if (!ids.length) return;
  if (!confirm(`Supprimer ${ids.length} irrigation${ids.length > 1 ? 's' : ''} sélectionnée${ids.length > 1 ? 's' : ''} ?`)) return;
  const { error } = await state.store.deleteIrrigations(ids);
  if (error) return toast(error.message);
  state.selectedIrrigationIds.clear();
  await loadIrrigations();
  renderIrrigationList();
  await refreshBalance();
}

function openIrrigationModal(id) {
  const item = state.irrigations.find(i => i.id === id);
  if (!item) return;
  state.editingIrrigation = item;
  $('editIrrigationAmount').value = item.amount_mm;
  $('editSeriesOptions').classList.toggle('hidden', !item.series_id);
  $('modalBackdrop').classList.remove('hidden');
}

function closeIrrigationModal() {
  $('modalBackdrop')?.classList.add('hidden');
  state.editingIrrigation = null;
}

async function saveEditedIrrigation() {
  const item = state.editingIrrigation;
  if (!item) return;
  const amount = Number($('editIrrigationAmount').value);
  if (!(amount >= 0)) return toast('Quantité invalide.');
  let filter = { id: item.id };
  if (item.series_id) {
    const scope = root.querySelector('input[name="seriesScope"]:checked')?.value || 'one';
    if (scope === 'following') filter = { series_id: item.series_id, fromDate: item.irrigation_date };
    if (scope === 'all') filter = { series_id: item.series_id };
  }
  const { error } = await state.store.updateIrrigations(filter, { amount_mm: amount });
  if (error) return toast(error.message);
  closeIrrigationModal();
  await loadIrrigations();
  renderIrrigationList();
  await refreshBalance();
}

async function deleteIrrigation(id) {
  const item = state.irrigations.find(i => i.id === id);
  if (!item || !confirm(`Supprimer l’irrigation du ${fmtDate(item.irrigation_date)} ?`)) return;
  const { error } = await state.store.deleteIrrigations([id]);
  if (error) return toast(error.message);
  state.selectedIrrigationIds.delete(id);
  await loadIrrigations();
  renderIrrigationList();
  await refreshBalance();
}

function excelDateToISO(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return toISO(value);
  if (typeof value === 'number' && window.XLSX?.SSF?.parse_date_code) {
    const d = XLSX.SSF.parse_date_code(value);
    if (d) return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
  }
  const text = String(value ?? '').trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const m = text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
  if (m) return `${m[3]}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : toISO(parsed);
}

async function readIrrigationImportFile(event) {
  clearIrrigationImport(false);
  const file = event.target.files?.[0];
  if (!file) return;
  try { await ctx.vendor.xlsx(); } catch { /* message ci-dessous */ }
  if (!window.XLSX) return setMessage('irrigationImportMessage', 'Le module Excel n’a pas pu être chargé.', 'error');
  try {
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json(ws, { defval: null, raw: true });
    if (!raw.length) throw new Error('Le fichier ne contient aucune ligne.');
    const headers = Object.keys(raw[0]);
    const normalize = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
    const dateKey = headers.find(h => ['date','dateirrigation','jour'].includes(normalize(h)));
    const amountKey = headers.find(h => ['apport','apportmm','irrigation','irrigationmm','quantite','quantitemm','mm'].includes(normalize(h)));
    if (!dateKey || !amountKey) throw new Error('Le fichier doit contenir une colonne « Date » et une colonne « Apport ».');

    const valid = [];
    const errors = [];
    raw.forEach((row, idx) => {
      const date = excelDateToISO(row[dateKey]);
      const amount = Number(String(row[amountKey] ?? '').replace(',', '.'));
      if (!date && (row[dateKey] === null || row[amountKey] === null)) return;
      if (!date) return errors.push(`Ligne ${idx + 2} : date illisible.`);
      if (!(amount >= 0)) return errors.push(`Ligne ${idx + 2} : apport invalide.`);
      valid.push({ irrigation_date: date, amount_mm: amount });
    });
    if (!valid.length) throw new Error(errors[0] || 'Aucune irrigation valide à importer.');
    state.irrigationImportRows = valid;
    const total = valid.reduce((s,r) => s + r.amount_mm, 0);
    const dates = valid.map(r => r.irrigation_date).sort();
    $('irrigationImportDetails').innerHTML = `<strong>${valid.length} irrigation${valid.length > 1 ? 's' : ''} détectée${valid.length > 1 ? 's' : ''}</strong><div class="muted small">Du ${fmtDate(dates[0])} au ${fmtDate(dates[dates.length - 1])} · Total : ${num(total,1)} mm</div>${errors.length ? `<div class="import-warning">${errors.length} ligne${errors.length > 1 ? 's' : ''} ignorée${errors.length > 1 ? 's' : ''}. ${escapeHTML(errors.slice(0,3).join(' '))}</div>` : ''}`;
    $('irrigationImportPreview').classList.remove('hidden');
    setMessage('irrigationImportMessage', 'Vérifiez l’aperçu avant de valider.', '');
  } catch (err) {
    state.irrigationImportRows = [];
    setMessage('irrigationImportMessage', err.message, 'error');
  }
}

async function importIrrigations() {
  if (!state.activeParcel || !state.irrigationImportRows.length) return;
  const rows = state.irrigationImportRows.map(r => ({ parcel_id: state.activeParcel.id, irrigation_date: r.irrigation_date, amount_mm: r.amount_mm }));
  const { error } = await state.store.insertIrrigations(rows);
  if (error) return setMessage('irrigationImportMessage', error.message, 'error');
  const count = rows.length;
  clearIrrigationImport();
  setMessage('irrigationImportMessage', `${count} irrigation${count > 1 ? 's' : ''} importée${count > 1 ? 's' : ''}.`, 'success');
  await loadIrrigations();
  renderIrrigationList();
  await refreshBalance();
}

function clearIrrigationImport(clearFile = true) {
  state.irrigationImportRows = [];
  $('irrigationImportPreview')?.classList.add('hidden');
  if ($('irrigationImportDetails')) $('irrigationImportDetails').innerHTML = '';
  if (clearFile && $('irrigationImportFile')) $('irrigationImportFile').value = '';
  if (clearFile) setMessage('irrigationImportMessage', '');
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Erreur HTTP ${response.status}`);
  const json = await response.json();
  if (json.error) throw new Error(json.reason || json.message || 'Erreur de données');
  return json;
}

async function fetchWeather(parcel, range) {
  const { start: startIso, end: endIso } = range;
  const today = localToday();
  const todayIso = toISO(today);
  const commonDaily = 'precipitation_sum,et0_fao_evapotranspiration';
  const weatherMap = new Map();
  // Archives jusqu'à J-8, puis l'API de prévision (7 jours passés + 7 à venir).
  const archiveEndIso = toISO(addDays(today, -8));
  const archiveTo = endIso < archiveEndIso ? endIso : archiveEndIso;
  if (startIso <= archiveTo) {
    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${parcel.latitude}&longitude=${parcel.longitude}&start_date=${startIso}&end_date=${archiveTo}&daily=${commonDaily}&timezone=auto`;
    const archive = await fetchJson(url);
    ingestDailyWeather(weatherMap, archive.daily, todayIso);
  }
  if (endIso > archiveEndIso) {
    const forecastUrl = `https://api.open-meteo.com/v1/forecast?latitude=${parcel.latitude}&longitude=${parcel.longitude}&daily=${commonDaily}&timezone=auto&past_days=7&forecast_days=8`;
    const forecast = await fetchJson(forecastUrl);
    ingestDailyWeather(weatherMap, forecast.daily, todayIso);
  }
  return [...weatherMap.values()]
    .filter(r => r.date >= startIso && r.date <= endIso)
    .sort((a,b) => a.date.localeCompare(b.date));
}

function ingestDailyWeather(map, daily, todayIso) {
  if (!daily?.time) return;
  daily.time.forEach((date, i) => {
    map.set(date, {
      date,
      precipitation: Number(daily.precipitation_sum?.[i] ?? 0),
      et0: Number(daily.et0_fao_evapotranspiration?.[i] ?? 0),
      forecast: date > todayIso
    });
  });
}

function irrigationMap() {
  const map = new Map();
  state.irrigations.forEach(i => map.set(i.irrigation_date, (map.get(i.irrigation_date) || 0) + Number(i.amount_mm || 0)));
  return map;
}

function correctionMap() {
  return new Map(state.rainCorrections.map(c => [c.rain_date, Number(c.amount_mm)]));
}

function buildRainRows(weather) {
  const corrections = correctionMap();
  return weather.map(w => ({
    ...w,
    corrected: corrections.has(w.date),
    rainUsed: corrections.has(w.date) ? corrections.get(w.date) : Number(w.precipitation || 0)
  }));
}

function effectiveRainMap(weather) {
  const rows = buildRainRows(weather);
  const effective = new Map(rows.map(r => [r.date, 0]));
  let start = 0;
  while (start < rows.length) {
    if (!(rows[start].rainUsed > 0)) { start++; continue; }
    const forecastFlag = rows[start].forecast;
    let end = start;
    let sum = 0;
    while (end < rows.length && rows[end].rainUsed > 0 && rows[end].forecast === forecastFlag) {
      sum += rows[end].rainUsed;
      end++;
    }
    if (sum >= RAIN_EPISODE_THRESHOLD_MM) {
      for (let i = start; i < end; i++) effective.set(rows[i].date, rows[i].rainUsed);
    }
    start = end;
  }
  return { rows, effective };
}

function computeBalance(weather, parcel) {
  const ru = Number(parcel.ru_mm);
  const rfu = Number(parcel.rfu_mm);
  const irrig = irrigationMap();
  const { rows: rainRows, effective } = effectiveRainMap(weather);
  const rainByDate = new Map(rainRows.map(r => [r.date, r]));
  let stock = ru;

  return weather.map(w => {
    const rainRow = rainByDate.get(w.date);
    const kc = kcForDate(w.date, parcel);
    const etc = Math.max(0, Number(w.et0 || 0) * kc);
    const rainUsed = rainRow?.rainUsed || 0;
    const rainEffective = effective.get(w.date) || 0;
    const irrigation = Number(irrig.get(w.date) || 0);
    const raw = stock - etc + rainEffective + irrigation;
    const drainage = Math.max(0, raw - ru);
    stock = clamp(raw, 0, ru);
    return {
      date: w.date,
      forecast: w.forecast,
      et0: Number(w.et0 || 0),
      kc,
      etc,
      rainOriginal: Number(w.precipitation || 0),
      rainUsed,
      rainEffective,
      rainCorrected: !!rainRow?.corrected,
      irrigation,
      stock,
      drainage,
      status: stock <= rfu ? 'Sous RFU' : 'Confort'
    };
  });
}

async function refreshBalance(force = false) {
  if (!state.activeParcel) return;
  $('refreshBtn').disabled = true;
  $('refreshBtn').textContent = 'Actualisation…';
  const range = balanceRange();
  try {
    if (force || !state.weather.length || state.weatherKey !== range.key) {
      state.weather = await fetchWeather(state.activeParcel, range);
      state.weatherKey = range.key;
    }
    if (ctx.scope.disposed) return;
    state.balance = computeBalance(state.weather, state.activeParcel);
    renderDashboard();
    renderIrrigationList();
    updateRainCorrectionInfo();
  } catch (err) {
    toast(`Météo : ${err.message}`);
  } finally {
    $('refreshBtn').disabled = false;
    $('refreshBtn').textContent = 'Actualiser';
  }
}

function currentBalanceRow() {
  const today = toISO(localToday());
  return state.balance.find(r => r.date === today) || [...state.balance].reverse().find(r => r.date <= today) || null;
}

function getDisplayedBalance() {
  const p = ctx.period.get();
  if (!p?.start || !p?.end) return state.balance;
  return state.balance.filter(r => r.date >= p.start && r.date <= p.end);
}

function renderDashboard() {
  if (!state.activeParcel || !state.balance.length) return;
  const p = state.activeParcel;
  const current = currentBalanceRow();
  if (!current) return;
  const ru = Number(p.ru_mm);
  const rfu = Number(p.rfu_mm);
  const pct = ru ? current.stock / ru * 100 : 0;
  const margin = current.stock - rfu;
  $('kpiStock').textContent = `${num(current.stock,1)} mm`;
  $('kpiStockSub').textContent = `sur ${num(ru,1)} mm`;
  $('kpiPercent').textContent = `${num(pct,0)} %`;
  $('kpiMargin').textContent = `${margin >= 0 ? '+' : ''}${num(margin,1)} mm`;
  $('kpiRfuSub').textContent = `RFU : ${num(rfu,1)} mm`;
  $('kpiNeed').textContent = `${num(current.etc,1)} mm`;
  $('summaryRu').textContent = `${num(ru,1)} mm`;
  $('summaryRfu').textContent = `${num(rfu,1)} mm`;
  $('summaryKc').textContent = num(current.kc,2);

  const shown = getDisplayedBalance();
  $('summaryDrainage').textContent = `${num(shown.reduce((s,r) => s + r.drainage, 0),1)} mm`;
  $('chartSubtitle').textContent = `${p.name} · ${p.location_name} · Bilan calculé depuis le ${fmtDate(balanceRange().start)} · RU ${num(ru,1)} mm · RFU ${num(rfu,1)} mm`;
  renderAdvice(current);
  renderChart(shown);
}

function renderAdvice(current) {
  const card = $('adviceCard');
  const p = state.activeParcel;
  const rfu = Number(p.rfu_mm);
  // Hors saison (novembre → mars) : arbres au repos, pas de conseil d'irrigation.
  if (current.stock > rfu || !(current.kc > 0)) {
    card.classList.add('hidden');
    return;
  }
  card.classList.remove('hidden');
  const today = toISO(localToday());
  const future = state.balance.filter(r => r.date > today).slice(0,2);
  const rain48 = future.reduce((s,r) => s + r.rainEffective, 0);
  const targetRow = future[future.length - 1] || current;
  const requiredToRfu = Math.max(0, rfu - targetRow.stock);
  const volume = requiredToRfu * 10 * Number(p.area_ha);

  if (requiredToRfu <= 0.1) {
    $('adviceText').textContent = `Le stock est sous le seuil RFU aujourd’hui, mais les apports prévus sur 48 h (${num(rain48,1)} mm de pluie efficace) devraient le ramener au-dessus du seuil.`;
  } else {
    $('adviceText').textContent = `Le stock est sous le seuil RFU. Après prise en compte des apports prévus sur 48 h, il manquerait environ ${num(requiredToRfu,1)} mm pour revenir au niveau RFU, soit ${num(volume,0)} m³ sur cette parcelle.`;
  }
}

const backgroundZonesPlugin = {
  id: 'backgroundZones',
  beforeDatasetsDraw(chart) {
    const y = chart.scales.yStock;
    if (!y) return;
    const ru = Number(state.activeParcel?.ru_mm || 0);
    const rfu = Number(state.activeParcel?.rfu_mm || 0);
    const { ctx, chartArea } = chart;
    const yRu = y.getPixelForValue(ru);
    const yRfu = y.getPixelForValue(rfu);
    const yZero = y.getPixelForValue(0);
    ctx.save();
    ctx.fillStyle = 'rgba(65, 170, 95, 0.10)';
    ctx.fillRect(chartArea.left, yRu, chartArea.right - chartArea.left, yRfu - yRu);
    ctx.fillStyle = 'rgba(232, 148, 52, 0.10)';
    ctx.fillRect(chartArea.left, yRfu, chartArea.right - chartArea.left, yZero - yRfu);
    ctx.restore();
  }
};

const todayLinePlugin = {
  id: 'todayLine',
  afterDraw(chart) {
    const labels = chart.data.labels || [];
    const todayLabel = fmtShort(toISO(localToday()));
    const idx = labels.indexOf(todayLabel);
    if (idx < 0) return;
    const x = chart.scales.x.getPixelForValue(idx);
    const { ctx, chartArea } = chart;
    if (x < chartArea.left - 1 || x > chartArea.right + 1) return; // hors de la partie zoomée
    ctx.save();
    ctx.beginPath();
    ctx.setLineDash([5,5]);
    ctx.strokeStyle = '#d7002f';
    ctx.lineWidth = 1.3;
    ctx.moveTo(x, chartArea.top);
    ctx.lineTo(x, chartArea.bottom);
    ctx.stroke();
    ctx.restore();
  }
};

function renderChart(rows) {
  const labels = rows.map(r => fmtShort(r.date));
  const firstForecast = rows.findIndex(r => r.forecast);
  const observed = rows.map(r => r.forecast ? null : r.stock);
  const forecastStock = rows.map((r,i) => (r.forecast || (firstForecast > 0 && i === firstForecast - 1)) ? r.stock : null);
  const ru = Number(state.activeParcel.ru_mm);
  const rfu = Number(state.activeParcel.rfu_mm);
  const maxFlux = Math.max(5, ...rows.flatMap(r => [r.rainEffective, r.irrigation]));
  // Téléphone : titres des axes verticaux remplacés par une ligne au-dessus du graphique,
  // pour laisser toute la largeur aux courbes.
  const narrow = window.innerWidth < 600;

  const datasets = [
    { type:'line', label: 'Stock observé', data: observed, yAxisID:'yStock', borderColor:'#22272b', backgroundColor:'#22272b', borderWidth:3, pointRadius:1.2, tension:.22, spanGaps:false },
    { type:'line', label: 'Stock prévisionnel', data: forecastStock, yAxisID:'yStock', borderColor:'#555c63', backgroundColor:'#555c63', borderWidth:3, borderDash:[7,5], pointRadius:1.2, tension:.22, spanGaps:true }
  ];
  datasets.push(
    { type:'line', label:'RU', data:rows.map(() => ru), yAxisID:'yStock', borderColor:'#3f8c55', backgroundColor:'#3f8c55', borderWidth:1.5, borderDash:[4,4], pointRadius:0 },
    { type:'line', label:'RFU', data:rows.map(() => rfu), yAxisID:'yStock', borderColor:'#c86b20', backgroundColor:'#c86b20', borderWidth:1.8, borderDash:[6,4], pointRadius:0 },
    { type:'bar', label:'Pluie efficace', data:rows.map(r => r.rainEffective), yAxisID:'yFlux', backgroundColor:'rgba(0, 96, 190, .86)', borderWidth:0, borderSkipped:false },
    { type:'bar', label:'Irrigation', data:rows.map(r => r.irrigation), yAxisID:'yFlux', backgroundColor:'rgba(0, 155, 92, .90)', borderWidth:0, borderSkipped:false }
  );

  const config = {
    type:'line',
    data:{ labels, datasets },
    plugins:[backgroundZonesPlugin, todayLinePlugin],
    options:{
      responsive:true,
      maintainAspectRatio:false,
      interaction:{ mode:'index', intersect:false },
      plugins:{
        legend:{ position:'bottom', labels:{ usePointStyle:false, boxWidth:narrow ? 18 : 28, boxHeight:3, padding:narrow ? 10 : 16, font:{ size:narrow ? 11 : 12 } } },
        tooltip:{
          backgroundColor:'rgba(255,255,255,.97)',
          titleColor:'#1f2328',
          bodyColor:'#343a40',
          borderWidth:0,
          displayColors:true,
          padding:11,
          cornerRadius:9,
          boxPadding:5,
          callbacks:{
            labelColor(context) {
              const ds = context.dataset;
              const bg = typeof ds.backgroundColor === 'string' ? ds.backgroundColor : (ds.borderColor || '#777');
              return { borderColor:'rgba(0,0,0,0)', backgroundColor:bg, borderWidth:0, borderRadius:0 };
            },
            afterBody(items) {
              const idx = items[0]?.dataIndex;
              const row = rows[idx];
              if (!row) return '';
              const lines = [
                `ET₀ : ${num(row.et0,1)} mm`,
                `Kc : ${num(row.kc,2)}`,
                `ETc : ${num(row.etc,1)} mm`,
                `Pluie mesurée : ${num(row.rainUsed,1)} mm`,
                `Pluie efficace : ${num(row.rainEffective,1)} mm`
              ];
              if (row.rainCorrected) lines.push(`Pluie Open-Meteo initiale : ${num(row.rainOriginal,1)} mm`);
              return lines;
            }
          }
        }
      },
      scales:{
        x:{ stacked:false, ticks:{ maxRotation:0, autoSkip:true, maxTicksLimit:narrow ? 6 : window.innerWidth < 700 ? 8 : 18, font:{ size:narrow ? 11 : 12 } }, grid:{ display:false } },
        yStock:{ position:'left', min:0, suggestedMax:ru * 1.08, title:{ display:!narrow, text:'Stock (mm)' }, ticks:{ font:{ size:narrow ? 11 : 12 } } },
        yFlux:{ position:'right', min:0, max:maxFlux * 1.15, reverse:true, title:{ display:!narrow, text:'Apports journaliers (mm)' }, ticks:{ font:{ size:narrow ? 11 : 12 } }, grid:{ drawOnChartArea:false } }
      }
    }
  };

  if (state.chart) state.chart.destroy();
  state.chart = new window.Chart($('waterChart'), config);
  // Zoom au glisser, double-clic = retour ; sur téléphone, le graphique s'ouvre sur les
  // dernières semaines (jours plus larges) et se parcourt au doigt.
  const zoom = enableChartZoom(state.chart, { phoneWindow: { pxPerPoint: 12, min: 14 } });
  const syncSwipeHint = range => $('chartSwipeHint')?.classList.toggle('hidden', !range);
  zoom.group.onChange = syncSwipeHint;
  syncSwipeHint(zoom.group.range);
}

function updateRainCorrectionInfo() {
  if (!state.activeParcel) return;
  const date = $('rainCorrectionDate').value;
  if (!date) return;
  const row = state.balance.find(r => r.date === date);
  const corr = state.rainCorrections.find(c => c.rain_date === date);
  if (!row) {
    $('rainOriginalInfo').textContent = 'Pas de donnée Open‑Meteo disponible pour cette date.';
    return;
  }
  $('rainOriginalInfo').textContent = `Open‑Meteo : ${num(row.rainOriginal,1)} mm${corr ? ` · remplacement : ${num(corr.amount_mm,1)} mm` : ''} · pluie efficace retenue : ${num(row.rainEffective,1)} mm`;
  $('rainCorrectionAmount').value = corr ? corr.amount_mm : '';
}

async function saveRainCorrection() {
  setMessage('rainCorrectionMessage', '');
  if (!state.activeParcel) return;
  const date = $('rainCorrectionDate').value;
  const amount = Number($('rainCorrectionAmount').value);
  if (!date || date > toISO(localToday())) return setMessage('rainCorrectionMessage', 'Choisissez une date passée ou aujourd’hui.', 'error');
  if (!(amount >= 0)) return setMessage('rainCorrectionMessage', 'Renseignez la pluie mesurée en mm.', 'error');
  const payload = { parcel_id:state.activeParcel.id, rain_date:date, amount_mm:amount, updated_at:new Date().toISOString() };
  const { error } = await state.store.upsertRainCorrection(payload);
  if (error) return setMessage('rainCorrectionMessage', error.message, 'error');
  setMessage('rainCorrectionMessage', 'Pluie remplacée pour cette date.', 'success');
  await loadRainCorrections();
  state.balance = computeBalance(state.weather, state.activeParcel);
  renderDashboard();
  updateRainCorrectionInfo();
}

async function deleteRainCorrection() {
  setMessage('rainCorrectionMessage', '');
  if (!state.activeParcel) return;
  const date = $('rainCorrectionDate').value;
  const { error } = await state.store.deleteRainCorrection(state.activeParcel.id, date);
  if (error) return setMessage('rainCorrectionMessage', error.message, 'error');
  setMessage('rainCorrectionMessage', 'La valeur Open‑Meteo est de nouveau utilisée.', 'success');
  $('rainCorrectionAmount').value = '';
  await loadRainCorrections();
  state.balance = computeBalance(state.weather, state.activeParcel);
  renderDashboard();
  updateRainCorrectionInfo();
}

function exportRows() {
  return state.balance.map(r => ({
    Date:r.date,
    Type:r.forecast ? 'Prévision' : 'Historique',
    'ET0 (mm)':round(r.et0,2),
    Kc:round(r.kc,3),
    'ETc / besoin (mm)':round(r.etc,2),
    'Pluie Open-Meteo (mm)':round(r.rainOriginal,2),
    'Pluie mesurée/corrigée (mm)':round(r.rainUsed,2),
    'Pluie efficace (mm)':round(r.rainEffective,2),
    'Pluie corrigée':r.rainCorrected ? 'Oui' : 'Non',
    'Irrigation (mm)':round(r.irrigation,2),
    'Irrigation parcelle (m3)':round(r.irrigation * 10 * Number(state.activeParcel.area_ha),1),
    'Stock bilan (mm)':round(r.stock,2),
    'Drainage/perte (mm)':round(r.drainage,2),
    Statut:r.status
  }));
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url),1000);
}

function exportCsv() {
  if (!state.activeParcel || !state.balance.length) return;
  const rows = exportRows();
  const headers = Object.keys(rows[0]);
  const escapeCell = value => {
    if (typeof value === 'number') return String(value).replace('.', ',');
    const s = String(value ?? '').replace(/"/g, '""');
    return `"${s}"`;
  };
  const csv = [headers.map(escapeCell).join(';'), ...rows.map(row => headers.map(h => escapeCell(row[h])).join(';'))].join('\n');
  downloadBlob(new Blob(['\ufeff' + csv], { type:'text/csv;charset=utf-8' }), `SAM_Bilan_${safeFilename(state.activeParcel.name)}_${rangeYearsLabel()}.csv`);
}




  // ------------------------------------------------------------------
  // Enregistrement des parcelles : sur l'appareil sans compte,
  // dans Supabase (parcelles privées du compte) une fois connecté.
  // ------------------------------------------------------------------
  function newId() {
    return crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
  }

  function localStore() {
    const KEY = 'bilan.local';
    const empty = () => ({ parcels: [], irrigations: [], rain: [] });
    const load = () => {
      const db = storage.get(KEY, null);
      return db && Array.isArray(db.parcels) ? { parcels: db.parcels, irrigations: db.irrigations || [], rain: db.rain || [] } : empty();
    };
    const save = db => (storage.set(KEY, db) ? null : new Error('Enregistrement impossible sur cet appareil (navigation privée ou stockage plein).'));
    const now = () => new Date().toISOString();
    const ok = data => ({ data, error: null });
    return {
      mode: 'local',
      async listParcels() { return ok(load().parcels.slice().sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))); },
      async insertParcel(payload) {
        const db = load();
        const row = { id: newId(), created_at: now(), ...payload };
        db.parcels.push(row);
        const error = save(db);
        return { data: error ? null : row, error };
      },
      async updateParcel(id, payload) {
        const db = load();
        const index = db.parcels.findIndex(p => p.id === id);
        if (index < 0) return { data: null, error: new Error('Parcelle introuvable.') };
        db.parcels[index] = { ...db.parcels[index], ...payload };
        const error = save(db);
        return { data: error ? null : db.parcels[index], error };
      },
      async deleteParcel(id) {
        const db = load();
        db.parcels = db.parcels.filter(p => p.id !== id);
        db.irrigations = db.irrigations.filter(i => i.parcel_id !== id);
        db.rain = db.rain.filter(r => r.parcel_id !== id);
        return { data: null, error: save(db) };
      },
      async listIrrigations(parcelId) {
        return ok(load().irrigations.filter(i => i.parcel_id === parcelId).sort((a, b) => b.irrigation_date.localeCompare(a.irrigation_date)));
      },
      async insertIrrigations(rows) {
        const db = load();
        rows.forEach(row => db.irrigations.push({ id: newId(), created_at: now(), series_id: null, ...row }));
        return { data: null, error: save(db) };
      },
      async updateIrrigations(filter, patch) {
        const db = load();
        db.irrigations.forEach(i => {
          const match = filter.id ? i.id === filter.id : i.series_id === filter.series_id && (!filter.fromDate || i.irrigation_date >= filter.fromDate);
          if (match) Object.assign(i, patch);
        });
        return { data: null, error: save(db) };
      },
      async deleteIrrigations(ids) {
        const db = load();
        db.irrigations = db.irrigations.filter(i => !ids.includes(i.id));
        return { data: null, error: save(db) };
      },
      async listRainCorrections(parcelId) {
        return ok(load().rain.filter(r => r.parcel_id === parcelId).sort((a, b) => a.rain_date.localeCompare(b.rain_date)));
      },
      async upsertRainCorrection(payload) {
        const db = load();
        const existing = db.rain.find(r => r.parcel_id === payload.parcel_id && r.rain_date === payload.rain_date);
        if (existing) Object.assign(existing, payload);
        else db.rain.push({ id: newId(), created_at: now(), ...payload });
        return { data: null, error: save(db) };
      },
      async deleteRainCorrection(parcelId, date) {
        const db = load();
        db.rain = db.rain.filter(r => !(r.parcel_id === parcelId && r.rain_date === date));
        return { data: null, error: save(db) };
      },
      exportAll: () => load(),
      importAll(data) {
        const db = load();
        const ids = new Set(db.parcels.map(p => p.id));
        let added = 0;
        (data.parcels || []).forEach(p => { if (p?.id && !ids.has(p.id)) { db.parcels.push(p); ids.add(p.id); added++; } });
        const irrIds = new Set(db.irrigations.map(i => i.id));
        (data.irrigations || []).forEach(i => { if (i?.id && !irrIds.has(i.id) && ids.has(i.parcel_id)) db.irrigations.push(i); });
        const rainKeys = new Set(db.rain.map(r => `${r.parcel_id}|${r.rain_date}`));
        (data.rain || []).forEach(r => { if (r?.parcel_id && !rainKeys.has(`${r.parcel_id}|${r.rain_date}`) && ids.has(r.parcel_id)) db.rain.push(r); });
        const error = save(db);
        if (error) throw error;
        return added;
      }
    };
  }

  function cloudStore(client) {
    return {
      mode: 'cloud',
      listParcels: () => client.from('bilan_parcels').select('*').order('created_at', { ascending: true }),
      insertParcel: payload => client.from('bilan_parcels').insert(payload).select().single(),
      updateParcel: (id, payload) => client.from('bilan_parcels').update(payload).eq('id', id).select().single(),
      deleteParcel: id => client.from('bilan_parcels').delete().eq('id', id),
      listIrrigations: parcelId => client.from('bilan_irrigations').select('*').eq('parcel_id', parcelId).order('irrigation_date', { ascending: false }),
      insertIrrigations: rows => client.from('bilan_irrigations').insert(rows),
      updateIrrigations(filter, patch) {
        let query = client.from('bilan_irrigations').update(patch);
        if (filter.id) query = query.eq('id', filter.id);
        else {
          query = query.eq('series_id', filter.series_id);
          if (filter.fromDate) query = query.gte('irrigation_date', filter.fromDate);
        }
        return query;
      },
      deleteIrrigations: ids => client.from('bilan_irrigations').delete().in('id', ids),
      listRainCorrections: parcelId => client.from('bilan_rain_corrections').select('*').eq('parcel_id', parcelId).order('rain_date', { ascending: true }),
      upsertRainCorrection: payload => client.from('bilan_rain_corrections').upsert(payload, { onConflict: 'parcel_id,rain_date' }),
      deleteRainCorrection: (parcelId, date) => client.from('bilan_rain_corrections').delete().eq('parcel_id', parcelId).eq('rain_date', date)
    };
  }

  function activeParcelKey() {
    return `bilan.activeParcel.${state.store?.mode || 'local'}`;
  }

  function setupStore() {
    state.user = ctx.user || null;
    state.store = state.user && ctx.supabase ? cloudStore(ctx.supabase) : localStore();
    renderStorageBanner();
  }

  // Parcelles gardées sur l'appareil par l'ancienne version (sans compte) : import proposé.
  function renderStorageBanner() {
    const banner = $('storageBanner');
    if (!banner) return;
    const local = state.store.mode === 'cloud' ? localStore().exportAll() : null;
    const count = local?.parcels?.length || 0;
    banner.classList.toggle('hidden', !count);
    if (!count) { banner.innerHTML = ''; return; }
    banner.innerHTML = `<div><strong>${count} parcelle${count > 1 ? 's' : ''} enregistrée${count > 1 ? 's' : ''} sur cet appareil</strong><p class="muted small">Créée${count > 1 ? 's' : ''} avant la connexion obligatoire. Importez-${count > 1 ? 'les' : 'la'} dans votre compte pour ${count > 1 ? 'les' : 'la'} retrouver partout.</p></div>
      <div class="actions"><button id="importLocalBtn" class="btn primary" type="button">Importer dans mon compte</button></div>`;
    $('importLocalBtn').addEventListener('click', importLocalParcels);
  }

  async function importLocalParcels() {
    const button = $('importLocalBtn');
    const local = localStore();
    const data = local.exportAll();
    if (button) button.disabled = true;
    try {
      let added = 0;
      for (const parcel of data.parcels) {
        const { id, created_at: _created, user_id: _user, ...fields } = parcel;
        const { data: row, error } = await state.store.insertParcel(fields);
        if (error) throw error;
        const irrigations = data.irrigations.filter(i => i.parcel_id === id).map(({ id: _i, created_at: _c, user_id: _u, ...i }) => ({ ...i, parcel_id: row.id }));
        if (irrigations.length) {
          const { error: e2 } = await state.store.insertIrrigations(irrigations);
          if (e2) throw e2;
        }
        for (const rain of data.rain.filter(r => r.parcel_id === id)) {
          const { id: _r, created_at: _c, user_id: _u, ...fields2 } = rain;
          const { error: e3 } = await state.store.upsertRainCorrection({ ...fields2, parcel_id: row.id });
          if (e3) throw e3;
        }
        await local.deleteParcel(id);
        added += 1;
      }
      toast(`${added} parcelle${added > 1 ? 's' : ''} importée${added > 1 ? 's' : ''} dans votre compte.`);
      renderStorageBanner();
      await loadParcels();
    } catch (error) {
      toast(`Import impossible : ${error.message || error}`);
      if (button) button.disabled = false;
    }
  }

  // ------------------------------------------------------------------
  // Intégration SAM Outils : filtres, période, connexion
  // ------------------------------------------------------------------
  ctx.filters({ location: false, period: true, mountIn: $('bilanFilters') });
  ctx.period.configure({
    presets: [
      { id: 'w30', label: '30 jours (dont 7 de prévision)', resolve: today => ({ start: toISO(addDays(parseISO(today), -22)), end: toISO(addDays(parseISO(today), 7)) }) },
      { id: 'w14', label: '14 jours (dont 7 de prévision)', resolve: today => ({ start: toISO(addDays(parseISO(today), -6)), end: toISO(addDays(parseISO(today), 7)) }) },
      { id: 'w60', label: '60 jours (dont 7 de prévision)', resolve: today => ({ start: toISO(addDays(parseISO(today), -52)), end: toISO(addDays(parseISO(today), 7)) }) },
      { id: 'season', label: 'Saison en cours (avril → octobre)', resolve: today => { const y = getCurrentSeasonYear(parseISO(today)); return { start: seasonStartISO(y), end: seasonEndISO(y) }; } },
      { id: 'seasonPrev', label: 'Saison précédente', resolve: today => { const y = getCurrentSeasonYear(parseISO(today)) - 1; return { start: seasonStartISO(y), end: seasonEndISO(y) }; } },
      { id: 'year', label: 'Depuis le 1er janvier', resolve: today => ({ start: `${parseISO(today).getFullYear()}-01-01`, end: toISO(addDays(parseISO(today), 7)) }) }
    ],
    defaultPreset: 'w30',
    min: '2000-01-01',
    max: () => toISO(addDays(localToday(), 7)),
    hint: 'Le bilan est calculé en continu depuis le 1er janvier. De novembre à mars, les arbres sont au repos : la consommation est nulle et le sol se recharge avec la pluie.'
  });

  ctx.period.onChange(async () => {
    state.selectedIrrigationIds.clear();
    state.showAllIrrigations = false;
    renderIrrigationList();
    if (!state.activeParcel) return;
    if (state.weatherKey !== balanceRange().key) await refreshBalance(true);
    else renderDashboard();
  });

  ctx.onAuthChange(async () => {
    const previousMode = state.store?.mode;
    setupStore();
    if (state.store.mode !== previousMode) {
      state.activeParcel = null;
      state.weather = [];
      state.balance = [];
      await loadParcels();
    }
  });

  await init();
  return { unmount() { if (state.chart) state.chart.destroy(); } };

}
