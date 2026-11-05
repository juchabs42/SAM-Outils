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
    <div class="button-row"><button id="resetKcButton" class="secondary-button" type="button">Revenir aux Kc automatiques</button></div>
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
      <button id="refreshButton" class="secondary-button" type="button">Actualiser la météo</button>
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
    <canvas id="weatherChart" height="270"></canvas>
    <p class="legend">Orange : ETP · Bleu : pluie · Trait rouge : début des prévisions</p>
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
    min: () => addDaysISO(todayISO(), -90),
    max: () => addDaysISO(todayISO(), 15),
    maxDays: 16,
    hint: 'Données disponibles : 92 jours passés et 16 jours de prévisions.'
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
    q('#refreshButton').disabled = loading;
    q('#refreshButton').textContent = loading ? 'Actualisation…' : 'Actualiser la météo';
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
      weatherRows = data.daily.time.map((date, index) => ({
        date,
        etp: num(data.daily.et0_fao_evapotranspiration[index]),
        rain: num(data.daily.precipitation_sum[index])
      }));
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

  function renderChart() {
    const canvas = q('#weatherChart');
    if (!canvas || !weatherRows.length) return;
    const context = canvas.getContext('2d');
    const ratio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth || 800;
    const height = 270;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    const { start, end } = programPeriod();
    const rows = weatherRows.filter(row => row.date >= addDaysISO(start, -7) && row.date <= end);
    if (!rows.length) return;
    const padding = { left: 48, right: 12, top: 20, bottom: 42 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    const maximum = Math.ceil(Math.max(1, ...rows.flatMap(row => [row.etp, row.rain])));
    const groupWidth = chartWidth / rows.length;
    const barWidth = Math.min(13, groupWidth * 0.25);
    context.font = '10px Inter, system-ui';
    context.textBaseline = 'middle';
    for (let index = 0; index <= 4; index++) {
      const y = padding.top + chartHeight * index / 4;
      const value = maximum * (1 - index / 4);
      context.strokeStyle = '#e7dfe1';
      context.beginPath(); context.moveTo(padding.left, y); context.lineTo(width - padding.right, y); context.stroke();
      context.fillStyle = '#75686c';
      context.textAlign = 'right';
      context.fillText(`${fr(value, 1)} mm`, padding.left - 6, y);
    }
    context.strokeStyle = '#8f8185';
    context.beginPath();
    context.moveTo(padding.left, padding.top);
    context.lineTo(padding.left, padding.top + chartHeight);
    context.lineTo(width - padding.right, padding.top + chartHeight);
    context.stroke();
    const labelStep = width < 500 ? Math.max(1, Math.ceil(rows.length / 7)) : width < 700 ? Math.max(1, Math.ceil(rows.length / 10)) : 1;
    const today = todayISO();
    rows.forEach((row, index) => {
      const x = padding.left + index * groupWidth + groupWidth / 2;
      const drawBar = (barX, value, color) => {
        const barHeight = value / maximum * chartHeight;
        context.fillStyle = color;
        context.fillRect(barX, padding.top + chartHeight - barHeight, barWidth, barHeight);
      };
      drawBar(x - barWidth - 2, row.etp, row.date < start ? '#e9b98a' : '#d98d3d');
      drawBar(x + 2, row.rain, row.date < start ? '#9cc6df' : '#4b98c7');
      if (index % labelStep === 0) {
        context.fillStyle = row.date <= today ? '#57494d' : '#D30D43';
        context.font = width < 500 ? '8px Inter, system-ui' : '9px Inter, system-ui';
        context.textAlign = 'center';
        context.textBaseline = 'alphabetic';
        context.fillText(formatShortDate(row.date), x, height - 14);
      }
    });
    const forecastIndex = rows.findIndex(row => row.date > today);
    if (forecastIndex > 0) {
      const x = padding.left + forecastIndex * groupWidth;
      context.strokeStyle = '#D30D43';
      context.setLineDash([5, 4]);
      context.beginPath(); context.moveTo(x, padding.top); context.lineTo(x, padding.top + chartHeight); context.stroke();
      context.setLineDash([]);
    }
  }

  // Événements
  q('#refreshButton').addEventListener('click', refreshWeather);
  q('#calculateButton').addEventListener('click', () => { saveForm(); render(); });
  q('#resetKcButton').addEventListener('click', () => {
    q('#kcValue').value = '';
    saveForm();
    updateKcInfo();
    render();
  });
  q('#rateMode').addEventListener('change', toggleRateFields);
  q('#systemType').addEventListener('change', () => { updateRainRecommendation(true); updateKcInfo(); });
  q('#interRowCover').addEventListener('change', updateKcInfo);
  q('#kcValue').addEventListener('input', updateKcInfo);
  q('#lastIrrigation').addEventListener('change', () => { saveForm(); render(); });
  ctx.scope.on(window, 'resize', () => { if (weatherRows.length) renderChart(); });
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
}
