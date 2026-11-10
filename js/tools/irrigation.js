// SAM Programmation irrigation — calculatrice de programmation sur une période.
// Reprise de l'appli « SAM Irrigation » : le lieu et la période viennent des filtres communs.
import { presets } from '../core/period.js';
import { todayISO, addDaysISO, diffDaysISO, storage } from '../core/util.js';

const TEMPLATE = `
<div class="tool-main">
  <section class="card">
    <p class="eyebrow">Paramètres de la parcelle</p>
    <h2>Caractéristiques de la parcelle et de l’irrigation</h2>

    <h3 class="subheading">Système d’irrigation</h3>
    <div class="form-grid">
      <label>Système d'irrigation
        <select id="systemType">
          <option value="drip">Goutte-à-goutte</option>
          <option value="micro">Micro-aspersion</option>
          <option value="sprinkler">Aspersion</option>
        </select>
      </label>
      <label>Calcul de la pluviométrie
        <select id="rateMode">
          <option value="known">Pluviométrie connue</option>
          <option value="calculated">Calcul à partir des émetteurs</option>
        </select>
      </label>
      <label id="knownRateLabel">Pluviométrie (mm/h)<input id="knownRate" type="number" min="0.01" step="0.01"></label>
      <label id="emitterFlowLabel">Débit de l'émetteur (L/h)<input id="emitterFlow" type="number" min="0.01" step="0.01"></label>
      <label id="emitterSpacingLabel">Espacement entre émetteurs (m)<input id="emitterSpacing" type="number" min="0.01" step="0.01"></label>
      <label id="rowSpacingLabel">Inter-rang (m)<input id="rowSpacing" type="number" min="0.01" step="0.01"></label>
    </div>

    <h3 class="subheading">Paramètres de calcul</h3>
    <div class="form-grid">
      <label>Kc (laisser vide = automatique)<input id="kcValue" type="number" min="0" max="2" step="0.05" placeholder="Automatique"></label>
      <label>Part de pluie prise en compte (%)<input id="rainEfficiency" type="number" min="0" max="100" step="5"></label>
      <label>État de l'inter-rang
        <select id="interRowCover">
          <option value="bare">Sol nu</option>
          <option value="vegetated">Inter-rang végétalisé</option>
        </select>
      </label>
      <label>Surface de la parcelle (ha)<input id="surfaceHa" type="number" min="0.01" step="0.01"></label>
    </div>
    <p id="kcInfo" class="muted"></p>
    <details class="info-box">
      <summary>ⓘ Comprendre la part de pluie prise en compte</summary>
      <p>Cette valeur correspond à la part de la pluie retenue dans le calcul du besoin d’irrigation, en fonction de la zone racinaire généralement alimentée par le système choisi.</p>
      <p id="rainRecommendationInfo"><strong>Valeur conseillée : —</strong></p>
    </details>
  </section>

  <section class="card">
    <p class="eyebrow">Période de programmation</p>
    <h2>Dates et fréquence d’irrigation</h2>
    <div id="periodPreview" class="period-preview"></div>
    <div class="form-grid">
      <label>Dernier arrosage<input id="lastIrrigation" type="date"></label>
      <label>Fréquence d'irrigation
        <select id="frequency">
          <option value="daily">Tous les jours</option>
          <option value="every2">Tous les 2 jours</option>
          <option value="twiceWeekly">2 fois par semaine</option>
          <option value="weekly">1 fois par semaine</option>
        </select>
      </label>
    </div>
    <div class="forecast-notice">
      <strong>Recommandation basée sur les prévisions météo</strong>
      <p>Cette programmation est une estimation calculée avec les prévisions disponibles au moment du calcul. Elles peuvent évoluer, en particulier pour la pluie. Une pluie prévue à plusieurs jours peut être décalée, plus faible ou ne pas se produire. Vérifiez régulièrement les prévisions et ajustez la programmation si nécessaire.</p>
    </div>
    <div class="button-row">
      <button id="calculateButton" class="primary-button" type="button">Calculer la programmation</button>
    </div>
  </section>

  <p id="errorMessage" class="error" hidden></p>

  <section class="card result-card">
    <p class="eyebrow">Programmation recommandée pour la période choisie</p>
    <p id="resultPeriod" class="result-period">—</p>
    <div class="main-result"><strong id="totalNeed">— mm</strong><span>à programmer sur la période</span></div>
    <div class="result-grid">
      <article><span>Nombre d'apports</span><strong id="applicationCount">—</strong></article>
      <article><span>Dose par apport</span><strong id="dosePerApplication">— mm</strong></article>
      <article><span>Volume par apport</span><strong id="volumePerApplication">— m³</strong></article>
      <article><span>Durée par apport</span><strong id="durationPerApplication">—</strong></article>
    </div>
  </section>

  <section class="card">
    <p class="eyebrow">Composition du besoin</p>
    <div class="result-grid">
      <article><span>Déficit avant la période</span><strong id="pastDeficit">— mm</strong></article>
      <article><span>Besoin brut de la période</span><strong id="periodGrossNeed">— mm</strong></article>
      <article><span>Pluie sur la période</span><strong id="periodRain">— mm</strong></article>
      <article><span>Pluie efficace sur la période</span><strong id="periodEffectiveRain">— mm</strong></article>
      <article><span>Besoin net de la période</span><strong id="periodNetNeed">— mm</strong></article>
    </div>
  </section>

  <section class="card">
    <p class="eyebrow">Météo</p>
    <h2>Période de calcul et jours précédents</h2>
    <div class="irr-legend">
      <span><i class="irr-swatch is-et0"></i>ET₀ (mm)</span>
      <span><i class="irr-swatch is-rain"></i>Pluie (mm)</span>
      <span><i class="irr-swatch is-before"></i>Teinte pâle : 7 jours avant la période</span>
      <span><i class="irr-swatch is-forecast"></i>Début des prévisions</span>
    </div>
    <div class="irr-chart"><canvas id="weatherChart" aria-label="ET0 et pluie journalières"></canvas></div>
    <p class="muted irr-chart-hint">Survolez (ou touchez) le graphique pour lire les valeurs du jour.</p>
  </section>
  <p id="updatedAt" class="muted center"></p>
  <p class="attribution">Données météo : Open-Meteo. Prototype SudExpé.</p>
</div>`;

const KC_TABLE = {
  bare: {
    drip: { spring: 0.50, june: 0.65, summer: 0.80, postHarvest: 0.50 },
    sprinkler: { spring: 0.60, june: 0.75, summer: 0.90, postHarvest: 0.60 }
  },
  vegetated: {
    drip: { spring: 0.60, june: 0.75, summer: 0.90, postHarvest: 0.60 },
    sprinkler: { spring: 0.70, june: 0.85, summer: 1.00, postHarvest: 0.70 }
  }
};

const DEFAULTS = {
  surfaceHa: 1,
  lastIrrigation: null,
  frequency: 'daily',
  rainEfficiency: 25,
  rainAutoSystem: null,
  kcOverride: null,
  systemType: 'drip',
  interRowCover: 'bare',
  rateMode: 'known',
  knownRate: 3,
  emitterFlow: 1.6,
  emitterSpacing: 0.5,
  rowSpacing: 4
};

// Même clé que l'ancienne appli : les réglages déjà saisis sont repris.
const LEGACY_STORAGE_KEY = 'samIrrigationPeriodV1';

function num(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }

// L'API de prévision annonce 92 jours passés, mais les plus anciens arrivent vides (null) :
// on ne garde que les jours où ET0 et pluie sont réellement fournis.
function availableRows(daily) {
  const rows = (daily?.time || []).map((date, index) => ({
    date,
    etp: daily.et0_fao_evapotranspiration?.[index],
    rain: daily.precipitation_sum?.[index]
  }));
  const first = rows.findIndex(row => row.etp != null && row.rain != null);
  if (first < 0) return [];
  let last = rows.length - 1;
  while (last > first && (rows[last].etp == null || rows[last].rain == null)) last--;
  return rows.slice(first, last + 1).map(row => ({ date: row.date, etp: num(row.etp), rain: num(row.rain) }));
}
function round(value, decimals = 2) { const f = 10 ** decimals; return Math.round((num(value) + Number.EPSILON) * f) / f; }
function fr(value, decimals = 2) { return round(value, decimals).toLocaleString('fr-FR', { maximumFractionDigits: decimals }); }
function sum(values) { return values.reduce((total, value) => total + num(value), 0); }
function formatLongDate(iso) { return new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
function formatShortDate(iso) { return new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }); }
function formatDuration(hours) {
  if (!Number.isFinite(hours) || hours <= 0) return '0 h 00';
  const totalMinutes = Math.round(hours * 60);
  return `${Math.floor(totalMinutes / 60)} h ${String(totalMinutes % 60).padStart(2, '0')}`;
}

export async function mount(root, ctx) {
  root.innerHTML = TEMPLATE;
  const q = selector => root.querySelector(selector);
  const val = id => q(`#${id}`).value;
  let weatherRows = [];
  let weatherMeta = null;

  ctx.filters({ location: true, period: true, hint: 'La période choisie est la période de programmation (jusqu’à 16 jours).' });
  ctx.period.configure({
    presets: [
      presets.nextDays(7),
      presets.nextDays(3),
      presets.nextDays(10),
      presets.nextDays(14),
      presets.lastDays(7, '7 derniers jours (a posteriori)')
    ],
    defaultPreset: 'next7',
    min: () => addDaysISO(todayISO(), -55),
    max: () => addDaysISO(todayISO(), 15),
    maxDays: 16,
    hint: 'Données disponibles : deux derniers mois environ et 16 jours de prévisions.'
  });

  function settings() {
    try {
      const raw = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) || '{}');
      return { ...DEFAULTS, ...raw };
    } catch {
      return { ...DEFAULTS };
    }
  }
  function persist(value) {
    try { localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(value)); } catch { /* stockage indisponible */ }
  }

  function programPeriod() {
    const p = ctx.period.get();
    const start = p?.start || todayISO();
    const end = p?.end || addDaysISO(start, 6);
    return { start, end, days: diffDaysISO(start, end) + 1 };
  }

  function rainEfficiencyCoefficient(s) {
    const stored = num(s.rainEfficiency, 80);
    return stored > 1 ? stored / 100 : stored;
  }
  function kcPeriodForDate(iso) {
    const month = new Date(`${iso}T12:00:00`).getMonth() + 1;
    if (month === 4 || month === 5) return 'spring';
    if (month === 6) return 'june';
    if (month >= 7 && month <= 9) return 'summer';
    if (month === 10) return 'postHarvest';
    return null;
  }
  function kcSystemFamily(systemType) { return systemType === 'drip' ? 'drip' : 'sprinkler'; }
  function automaticKc(iso, s) {
    const period = kcPeriodForDate(iso);
    if (!period) return 0;
    const cover = s.interRowCover === 'vegetated' ? 'vegetated' : 'bare';
    return KC_TABLE[cover][kcSystemFamily(s.systemType)][period];
  }
  function kcForDate(iso, s) {
    if (s.kcOverride !== null && s.kcOverride !== '') return num(s.kcOverride);
    return automaticKc(iso, s);
  }
  function rainRecommendationForSystem(systemType) {
    if (systemType === 'micro') return { percent: 60, label: 'micro-aspersion' };
    if (systemType === 'sprinkler') return { percent: 90, label: 'aspersion' };
    return { percent: 25, label: 'goutte-à-goutte' };
  }
  function updateRainRecommendation(applyValue = false) {
    const recommendation = rainRecommendationForSystem(val('systemType') || 'drip');
    if (applyValue) q('#rainEfficiency').value = recommendation.percent;
    q('#rainRecommendationInfo').innerHTML = `<strong>Valeur conseillée pour ${recommendation.label} : ${recommendation.percent} %.</strong>`;
  }

  function updateKcInfo() {
    const currentKc = val('kcValue');
    if (currentKc !== '') {
      q('#kcInfo').textContent = `Kc personnalisé appliqué à toute la période : ${num(currentKc).toFixed(2).replace('.', ',')}.`;
      return;
    }
    const currentSystem = val('systemType') || 'drip';
    const cover = val('interRowCover') === 'vegetated' ? 'vegetated' : 'bare';
    const values = KC_TABLE[cover][kcSystemFamily(currentSystem)];
    const coverLabel = cover === 'vegetated' ? 'inter-rang végétalisé' : 'sol nu';
    const systemLabel = currentSystem === 'micro' ? 'micro-aspersion' : currentSystem === 'sprinkler' ? 'aspersion' : 'goutte-à-goutte';
    const f = v => v.toFixed(2).replace('.', ',');
    let text = `Kc automatiques — ${coverLabel} + ${systemLabel} : avril–mai ${f(values.spring)} · juin ${f(values.june)} · juillet–septembre ${f(values.summer)} · octobre (après récolte) ${f(values.postHarvest)}.`;
    if (currentSystem === 'micro') text += ' Valeurs issues de la grille aspersion.';
    q('#kcInfo').textContent = text;
  }

  function toggleRateFields() {
    const calculated = val('rateMode') === 'calculated';
    q('#knownRateLabel').hidden = calculated;
    q('#emitterFlowLabel').hidden = !calculated;
    q('#emitterSpacingLabel').hidden = !calculated;
    q('#rowSpacingLabel').hidden = !calculated;
  }

  function defaultLastIrrigation() {
    return addDaysISO(programPeriod().start, -1);
  }

  function loadForm() {
    const s = settings();
    ['surfaceHa', 'frequency', 'systemType', 'interRowCover', 'rateMode', 'knownRate', 'emitterFlow', 'emitterSpacing', 'rowSpacing']
      .forEach(id => { q(`#${id}`).value = s[id]; });
    q('#lastIrrigation').value = s.lastIrrigation || defaultLastIrrigation();
    const rainPercent = num(s.rainEfficiency, 80) <= 1 ? num(s.rainEfficiency, 0.8) * 100 : num(s.rainEfficiency, 80);
    if (s.rainAutoSystem === null) {
      const recommendation = rainRecommendationForSystem(s.systemType);
      s.rainEfficiency = recommendation.percent;
      s.rainAutoSystem = s.systemType;
      persist(s);
      q('#rainEfficiency').value = recommendation.percent;
    } else {
      q('#rainEfficiency').value = round(rainPercent, 0);
    }
    q('#kcValue').value = s.kcOverride === null ? '' : s.kcOverride;
    updateKcInfo();
    updateRainRecommendation(false);
    toggleRateFields();
  }

  function saveForm() {
    const s = settings();
    s.surfaceHa = num(val('surfaceHa'), 1);
    s.lastIrrigation = val('lastIrrigation') || null;
    s.frequency = val('frequency');
    s.rainEfficiency = num(val('rainEfficiency'), 80);
    s.kcOverride = val('kcValue') === '' ? null : num(val('kcValue'));
    s.systemType = val('systemType');
    s.interRowCover = val('interRowCover');
    s.rainAutoSystem = s.systemType;
    s.rateMode = val('rateMode');
    s.knownRate = num(val('knownRate'), 3);
    s.emitterFlow = num(val('emitterFlow'), 1.6);
    s.emitterSpacing = num(val('emitterSpacing'), 0.5);
    s.rowSpacing = num(val('rowSpacing'), 4);
    persist(s);
    return s;
  }

  function updatePeriodPreview() {
    const { start, end, days } = programPeriod();
    const place = ctx.location.get();
    const past = end < todayISO();
    q('#periodPreview').innerHTML = `<strong>Période calculée :</strong> du ${formatLongDate(start)} au ${formatLongDate(end)} inclus (${days} jour${days > 1 ? 's' : ''}) · <strong>Lieu :</strong> ${place?.name || '—'}`
      + (past ? '<br><span class="muted">Cette période est entièrement passée : le calcul sert de bilan a posteriori. Choisissez « 7 prochains jours » pour programmer les prochains apports.</span>' : '');
  }

  function showError(message) { q('#errorMessage').hidden = false; q('#errorMessage').textContent = message; }
  function hideError() { q('#errorMessage').hidden = true; }
  function setLoading(loading) {
    q('#calculateButton').disabled = loading;
    root.querySelector('.tool-main')?.setAttribute('aria-busy', String(loading));
  }

  function updateDateLimits() {
    if (!weatherRows.length) return;
    const input = q('#lastIrrigation');
    input.min = weatherRows[0].date;
    input.max = addDaysISO(programPeriod().start, -1);
  }

  async function refreshWeather() {
    const place = ctx.location.get();
    if (!place) return;
    setLoading(true);
    hideError();
    const cacheKey = `irrigation.weather.${place.latitude.toFixed(4)}_${place.longitude.toFixed(4)}`;
    try {
      const url = new URL('https://api.open-meteo.com/v1/forecast');
      url.search = new URLSearchParams({
        latitude: place.latitude.toFixed(4),
        longitude: place.longitude.toFixed(4),
        daily: 'et0_fao_evapotranspiration,precipitation_sum',
        timezone: 'Europe/Paris',
        past_days: '92',
        forecast_days: '16'
      }).toString();
      let response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        response = await fetch(url, { cache: 'no-store' });
      }
      if (!response.ok) throw new Error(`Open-Meteo répond ${response.status}.`);
      const data = await response.json();
      if (ctx.scope.disposed) return;
      weatherRows = availableRows(data.daily);
      weatherMeta = { place: place.name, savedAt: null };
      storage.set(cacheKey, { savedAt: new Date().toISOString(), rows: weatherRows });
      updateDateLimits();
      render();
    } catch (error) {
      const cached = storage.get(cacheKey, null);
      if (cached?.rows?.length) {
        weatherRows = cached.rows;
        weatherMeta = { place: place.name, savedAt: cached.savedAt };
        updateDateLimits();
        render();
        showError('Données hors connexion : dernière météo enregistrée utilisée.');
      } else {
        showError(`Impossible de récupérer la météo. ${error.message}`);
      }
    } finally {
      if (!ctx.scope.disposed) setLoading(false);
    }
  }

  function systemRate(s) {
    if (s.rateMode === 'calculated') {
      const denominator = num(s.emitterSpacing) * num(s.rowSpacing);
      return denominator > 0 ? num(s.emitterFlow) / denominator : 0;
    }
    return num(s.knownRate);
  }
  function numberOfApplications(frequency, days) {
    switch (frequency) {
      case 'every2': return Math.ceil(days / 2);
      case 'twiceWeekly': return Math.max(1, Math.ceil(days * 2 / 7));
      case 'weekly': return Math.max(1, Math.ceil(days / 7));
      default: return days;
    }
  }
  function rowsBetween(start, end) { return weatherRows.filter(row => row.date >= start && row.date <= end); }

  function render() {
    updatePeriodPreview();
    if (!weatherRows.length) return;
    const s = settings();
    const { start, end, days } = programPeriod();
    const dayBeforeStart = addDaysISO(start, -1);
    let lastIrrigation = val('lastIrrigation') || s.lastIrrigation || dayBeforeStart;
    q('#lastIrrigation').max = dayBeforeStart;

    if (lastIrrigation > dayBeforeStart) {
      showError('Le dernier arrosage doit être antérieur à la date de début de programmation.');
      return;
    }
    const availableStart = weatherRows[0].date;
    const availableEnd = weatherRows[weatherRows.length - 1].date;
    if (lastIrrigation < availableStart || end > availableEnd) {
      showError(`La période choisie dépasse les données disponibles (${formatLongDate(availableStart)} au ${formatLongDate(availableEnd)}).`);
      return;
    }
    hideError();

    const deficitRows = rowsBetween(addDaysISO(lastIrrigation, 1), dayBeforeStart);
    const periodRows = rowsBetween(start, end);
    if (periodRows.length !== days) {
      showError('Toutes les journées de la période choisie ne sont pas disponibles.');
      return;
    }
    const pastEtc = sum(deficitRows.map(row => row.etp * kcForDate(row.date, s)));
    const pastEffectiveRain = sum(deficitRows.map(row => row.rain)) * rainEfficiencyCoefficient(s);
    const pastDeficit = Math.max(0, pastEtc - pastEffectiveRain);
    const periodGross = sum(periodRows.map(row => row.etp * kcForDate(row.date, s)));
    const periodRain = sum(periodRows.map(row => row.rain));
    const periodEffectiveRain = periodRain * rainEfficiencyCoefficient(s);
    const periodNet = Math.max(0, periodGross - periodEffectiveRain);
    const totalNeed = pastDeficit + periodNet;
    const count = numberOfApplications(s.frequency, days);
    const dose = totalNeed / count;
    const volume = dose * num(s.surfaceHa) * 10;
    const rate = systemRate(s);
    const duration = rate > 0 ? dose / rate : 0;

    q('#resultPeriod').textContent = `Du ${formatLongDate(start)} au ${formatLongDate(end)} inclus · ${ctx.location.get()?.name || ''}`;
    q('#totalNeed').textContent = `${fr(totalNeed, 1)} mm`;
    q('#applicationCount').textContent = String(count);
    q('#dosePerApplication').textContent = `${fr(dose, 1)} mm`;
    q('#volumePerApplication').textContent = `${fr(volume, 1)} m³`;
    q('#durationPerApplication').textContent = formatDuration(duration);
    q('#pastDeficit').textContent = `${fr(pastDeficit, 1)} mm`;
    q('#periodGrossNeed').textContent = `${fr(periodGross, 1)} mm`;
    q('#periodRain').textContent = `${fr(periodRain, 1)} mm`;
    q('#periodEffectiveRain').textContent = `${fr(periodEffectiveRain, 1)} mm`;
    q('#periodNetNeed').textContent = `${fr(periodNet, 1)} mm`;
    q('#updatedAt').textContent = weatherMeta?.savedAt
      ? `Données enregistrées le ${new Date(weatherMeta.savedAt).toLocaleString('fr-FR')}`
      : `Météo actualisée à ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
    renderChart();
  }

  const ET0_COLOR = '#f0892c';
  const ET0_COLOR_LIGHT = 'rgba(240,137,44,.42)';
  const RAIN_COLOR = '#3b8ad9';
  const RAIN_COLOR_LIGHT = 'rgba(59,138,217,.42)';
  let weatherChart = null;

  // Trait pointillé rouge entre aujourd'hui et le premier jour de prévision.
  const forecastLinePlugin = {
    id: 'irrForecastLine',
    afterDatasetsDraw(chart, _args, options) {
      const index = options?.index;
      if (!Number.isInteger(index) || index <= 0) return;
      const { ctx: c, chartArea, scales } = chart;
      const x = (scales.x.getPixelForValue(index - 1) + scales.x.getPixelForValue(index)) / 2;
      c.save();
      c.strokeStyle = '#D30D43';
      c.lineWidth = 1.5;
      c.setLineDash([5, 4]);
      c.beginPath();
      c.moveTo(x, chartArea.top);
      c.lineTo(x, chartArea.bottom);
      c.stroke();
      c.restore();
    }
  };

  function renderChart() {
    const canvas = q('#weatherChart');
    const Chart = window.Chart;
    if (!canvas || !Chart || !weatherRows.length) return;
    const { start, end } = programPeriod();
    const rows = weatherRows.filter(row => row.date >= addDaysISO(start, -7) && row.date <= end);
    if (weatherChart) { weatherChart.destroy(); weatherChart = null; }
    if (!rows.length) return;
    const today = todayISO();
    const forecastIndex = rows.findIndex(row => row.date > today);
    const dayName = iso => new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    weatherChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: rows.map(row => formatShortDate(row.date)),
        datasets: [
          { label: 'ET₀', data: rows.map(row => round(row.etp, 1)), backgroundColor: rows.map(row => (row.date < start ? ET0_COLOR_LIGHT : ET0_COLOR)), borderRadius: 3, maxBarThickness: 18, categoryPercentage: 0.7, barPercentage: 0.9 },
          { label: 'Pluie', data: rows.map(row => round(row.rain, 1)), backgroundColor: rows.map(row => (row.date < start ? RAIN_COLOR_LIGHT : RAIN_COLOR)), borderRadius: 3, maxBarThickness: 18, categoryPercentage: 0.7, barPercentage: 0.9 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          irrForecastLine: { index: forecastIndex },
          tooltip: {
            padding: 10,
            cornerRadius: 8,
            callbacks: {
              title: items => {
                const row = rows[items[0].dataIndex];
                const tag = row.date > today ? ' · prévision' : row.date < start ? ' · avant la période' : '';
                return `${dayName(row.date)}${tag}`;
              },
              label: item => ` ${item.dataset.label} : ${fr(item.parsed.y, 1)} mm`
            }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, color: item => (rows[item.index]?.date > today ? '#D30D43' : '#57494d') } },
          y: { beginAtZero: true, grid: { color: '#efe7e9' }, border: { display: false }, title: { display: true, text: 'mm / jour', color: '#75686c' }, ticks: { color: '#75686c' } }
        }
      },
      plugins: [forecastLinePlugin]
    });
  }

  // Événements
  q('#calculateButton').addEventListener('click', () => { saveForm(); render(); });
  q('#rateMode').addEventListener('change', toggleRateFields);
  q('#systemType').addEventListener('change', () => { updateRainRecommendation(true); updateKcInfo(); });
  q('#interRowCover').addEventListener('change', updateKcInfo);
  q('#kcValue').addEventListener('input', updateKcInfo);
  q('#kcValue').addEventListener('change', () => { saveForm(); updateKcInfo(); render(); });
  q('#lastIrrigation').addEventListener('change', () => { saveForm(); render(); });
  ctx.location.onChange(() => refreshWeather());
  ctx.period.onChange(() => {
    const s = settings();
    const last = val('lastIrrigation');
    if (!last || last >= programPeriod().start) {
      q('#lastIrrigation').value = defaultLastIrrigation();
      s.lastIrrigation = q('#lastIrrigation').value;
      persist(s);
    }
    updateDateLimits();
    render();
  });

  loadForm();
  if (q('#lastIrrigation').value >= programPeriod().start) q('#lastIrrigation').value = defaultLastIrrigation();
  updatePeriodPreview();
  await refreshWeather();

  return {
    unmount() {
      if (weatherChart) weatherChart.destroy();
    }
  };
}
