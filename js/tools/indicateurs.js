// SAM Indicateurs agroclimatiques — vue d'ensemble de la maquette + onglets
// historiques (prévisions, déficit climatique, DPV, indice de contrainte, méthodes).
import { icons } from '../core/icons.js';
import { presets } from '../core/period.js';
import { todayISO, addDaysISO, diffDaysISO, formatNumber, formatDateShort, formatDayMonth, escapeHtml, storage } from '../core/util.js';

const TEMPLATE = `
<div class="tool-main ind">
  <div class="ind-tabs" role="tablist" aria-label="Indicateurs">
    <button class="ind-tab is-active" type="button" role="tab" data-tab="overview" aria-selected="true">Vue d’ensemble</button>
    <button class="ind-tab" type="button" role="tab" data-tab="meteo" aria-selected="false">Prévisions météo</button>
    <button class="ind-tab" type="button" role="tab" data-tab="deficit" aria-selected="false">Déficit climatique</button>
    <button class="ind-tab" type="button" role="tab" data-tab="vpd" aria-selected="false">DPV</button>
    <button class="ind-tab" type="button" role="tab" data-tab="contrainte" aria-selected="false">Indice de contrainte</button>
    <button class="ind-tab" type="button" role="tab" data-tab="methodes" aria-selected="false">Méthodes</button>
  </div>

  <div class="ind-status" id="indStatus" aria-live="polite">
    <span id="indStatusText">Chargement des données météo…</span>
    <button class="ind-refresh" id="indRefresh" type="button">Actualiser</button>
  </div>

  <!-- VUE D'ENSEMBLE -->
  <section class="ind-panel is-active" data-panel="overview">
    <div class="ind-kpis">
      ${kpiCard('Et0', icons.kpiEt0, 'ET<sub>0</sub>', 'mm', 'Cumul période')}
      ${kpiCard('Rain', icons.kpiRain, 'Pluie', 'mm', 'Cumul période')}
      ${kpiCard('Temp', icons.kpiTemp, 'Température moyenne', '°C', 'Moyenne période')}
      ${kpiCard('Rh', icons.kpiHumidity, 'Humidité relative', '%', 'Moyenne période')}
      ${kpiCard('Wind', icons.kpiWind, 'Vent moyen', 'm/s', 'Moyenne période')}
    </div>
    <p class="ind-note" id="ovNote"></p>
    <div class="ind-charts">
      <article class="ind-card">
        <header class="ind-card-head">
          <h3>Déficit de pression de vapeur (DPV)<button class="ind-info" type="button" data-info="vpd" aria-label="Qu’est-ce que le DPV ?">${icons.infoSmall}</button></h3>
          ${segmented('ovVpd')}
          ${moreMenu('ovVpd')}
        </header>
        <div class="ind-legend"><span class="ind-legend-line"></span>DPV moyen (kPa)<span class="ind-legend-line is-dashed"></span>DPV max (kPa)</div>
        <div class="ind-chart"><canvas id="ovVpdChart" aria-label="DPV moyen journalier"></canvas></div>
      </article>
      <article class="ind-card">
        <header class="ind-card-head">
          <h3>Indicateurs agroclimatiques journaliers<button class="ind-info" type="button" data-info="daily" aria-label="À propos de ce graphique">${icons.infoSmall}</button></h3>
          ${segmented('ovDaily')}
          ${moreMenu('ovDaily')}
        </header>
        <div class="ind-legend"><span class="ind-legend-box is-rain"></span>Pluie (mm)<span class="ind-legend-box is-et0"></span>ET₀ (mm)<span class="ind-legend-agg" id="ovDailyAgg"></span></div>
        <div class="ind-chart"><canvas id="ovDailyChart" aria-label="Pluie et ET0 journalières"></canvas></div>
      </article>
    </div>
    <div class="ind-info-box hidden" id="ovInfoBox"></div>
  </section>

  <!-- PRÉVISIONS MÉTÉO -->
  <section class="ind-panel" data-panel="meteo">
    <div class="section-heading"><div><p class="eyebrow">Prévisions</p><h2>Prévisions météo</h2><p>Températures, pluie, humidité et vent prévus au lieu choisi, à partir d’aujourd’hui (indépendant de la période).</p></div></div>
    <div class="controls compact-controls">
      <label>Nombre de jours à afficher
        <select id="weatherDays"><option value="3">3 jours</option><option value="5">5 jours</option><option value="7" selected>7 jours</option></select>
      </label>
    </div>
    <div id="weatherCards" class="weather-forecast-grid"></div>
    <div class="weather-chart-grid">
      <article class="panel"><div class="panel-header"><div><h3>Température</h3></div></div><div class="chart-wrap"><canvas id="temperatureChart"></canvas></div></article>
      <article class="panel"><div class="panel-header"><div><h3>Pluie prévue</h3></div></div><div class="chart-wrap"><canvas id="rainForecastChart"></canvas></div></article>
      <article class="panel"><div class="panel-header"><div><h3>Humidité horaire</h3></div></div><div class="chart-wrap"><canvas id="humidityChart"></canvas></div></article>
      <article class="panel"><div class="panel-header"><div><h3>Vent horaire</h3></div></div><div class="chart-wrap"><canvas id="windChart"></canvas></div></article>
    </div>
  </section>

  <!-- DÉFICIT CLIMATIQUE -->
  <section class="ind-panel" data-panel="deficit">
    <div class="section-heading"><div><p class="eyebrow">Bilan climatique</p><h2>Déficit climatique cumulé</h2><p>ET₀ − pluie sur la période choisie (historique disponible depuis 1940).</p></div></div>
    <div class="metric-grid">
      <article class="metric-card"><p>ET₀ cumulée</p><strong id="et0Total">—</strong><span>Période sélectionnée</span></article>
      <article class="metric-card"><p>Pluie cumulée</p><strong id="rainTotal">—</strong><span>100 % prise en compte</span></article>
      <article class="metric-card"><p>Bilan cumulé</p><strong id="deficitTotal">—</strong><span>ET₀ − pluie</span></article>
      <article class="metric-card"><p>Variation sur les 7 derniers jours</p><strong id="deficitWeekChange">—</strong><span>Fin de période</span></article>
    </div>
    <p class="ind-note" id="deficitNote"></p>
    <article class="panel"><div class="chart-wrap large"><canvas id="deficitChart"></canvas></div></article>
  </section>

  <!-- DPV -->
  <section class="ind-panel" data-panel="vpd">
    <div class="section-heading"><div><p class="eyebrow">Demande atmosphérique</p><h2 id="vpdTitle">DPV horaire</h2><p>Calculé à partir de la température et de l’humidité relative horaires, sur la période choisie.</p></div></div>
    <p class="ind-note" id="vpdNote"></p>
    <article class="panel">
      <div class="chart-wrap large"><canvas id="vpdChart"></canvas></div>
      <div class="vpd-legend-inline" aria-label="Légende des bandes de DPV">
        <span class="vpd-legend-item"><span class="vpd-swatch swatch-blue"></span>0–0,8 kPa · Faible demande</span>
        <span class="vpd-legend-item"><span class="vpd-swatch swatch-green"></span>0,8–1,6 kPa · Conditions favorables</span>
        <span class="vpd-legend-item"><span class="vpd-swatch swatch-yellow"></span>1,6–2,5 kPa · Régulation stomatique</span>
        <span class="vpd-legend-item"><span class="vpd-swatch swatch-orange"></span>2,5–3,5 kPa · Contrainte élevée</span>
        <span class="vpd-legend-item"><span class="vpd-swatch swatch-red"></span>3,5–4,5 kPa · Stress sévère</span>
        <span class="vpd-legend-item"><span class="vpd-swatch swatch-purple"></span>&gt; 4,5 kPa · Stress extrême</span>
      </div>
    </article>
    <article class="panel"><h3>Heures cumulées au-dessus des seuils</h3><div class="chart-wrap"><canvas id="thresholdChart"></canvas></div></article>
  </section>

  <!-- INDICE DE CONTRAINTE -->
  <section class="ind-panel" data-panel="contrainte">
    <div class="section-heading"><div><p class="eyebrow">Synthèse</p><h2>Indice de contrainte journalier</h2><p>Score de 0 à 100 combinant l’intensité du DPV, la durée de forte demande atmosphérique, la durée de forte chaleur et l’ET₀.</p></div></div>
    <div class="score-legend">
      <span class="score-low">0–24 Faible</span><span class="score-moderate">25–49 Modérée</span><span class="score-high">50–74 Élevée</span><span class="score-severe">75–89 Sévère</span><span class="score-extreme">90–100 Extrême</span>
    </div>
    <p class="ind-note" id="scoreNote"></p>
    <article class="panel"><div class="chart-wrap large"><canvas id="scoreChart"></canvas></div></article>
    <div id="scoreCards" class="forecast-grid"></div>
  </section>

  <!-- MÉTHODES -->
  <section class="ind-panel" data-panel="methodes">
    <div class="section-heading"><div><h2>Méthodes</h2></div></div>
    <div class="method-grid">
      <article class="method-card"><h3>Vue d’ensemble</h3><p>Cumuls (ET₀, pluie) et moyennes (température, humidité relative, vent) calculés sur la période choisie, comparés à la période de même durée qui la précède immédiatement.</p></article>
      <article class="method-card"><h3>Prévisions météo</h3><p>Les prévisions de température, pluie, humidité et vent sont récupérées pour le lieu choisi. Les graphiques présentent leur évolution horaire, les cartes résument les valeurs quotidiennes.</p></article>
      <article class="method-card"><h3>Déficit climatique</h3><p>Calcul journalier ET₀ − pluie, cumulé sur la période sélectionnée. Le bilan peut devenir négatif lorsque les pluies cumulées dépassent l’ET₀.</p></article>
      <article class="method-card"><h3>DPV</h3><p>Calculé à partir de la température et de l’humidité relative horaires. La zone de conditions favorables est fixée entre 0,8 et 1,6 kPa.</p></article>
      <article class="method-card"><h3>Indice de contrainte</h3><p>40 % intensité du DPV (moyenne des 3 heures présentant les DPV les plus élevés), 30 % durée avec DPV &gt; 2,5 kPa, 20 % durée de forte chaleur avec température &gt; 35 °C et 10 % ET₀.</p></article>
      <article class="method-card"><h3>Sources</h3><p>Données Open-Meteo : prévisions et 92 derniers jours (modèles de prévision), historique au-delà (réanalyse ERA5, depuis 1940).</p></article>
    </div>
    <div class="warning-box method-warning"><strong>À savoir :</strong> l’indice de contrainte est un indicateur d’aide à l’interprétation. Il donne une idée synthétique des conditions climatiques, mais ne constitue pas un modèle scientifique validé.</div>
  </section>
</div>`;

function kpiCard(key, icon, label, unit, caption) {
  return `<article class="ind-kpi">
    <header class="ind-kpi-head">${icon}<span>${label}</span></header>
    <strong class="ind-kpi-value"><span id="kpi${key}">—</span><small>${unit}</small></strong>
    <span class="ind-kpi-caption">${caption}</span>
    <span class="ind-delta" id="kpi${key}Delta">—</span>
    <span class="ind-kpi-foot">vs période précédente</span>
  </article>`;
}

function segmented(id) {
  return `<div class="ind-seg" role="group" aria-label="Durée affichée" data-seg="${id}">
    <button type="button" data-days="7">7 jours</button><button type="button" data-days="30">30 jours</button><button type="button" data-days="90">90 jours</button>
  </div>`;
}

function moreMenu(id) {
  return `<div class="ind-more-wrap">
    <button class="ind-more" type="button" data-more="${id}" aria-label="Plus d’options" aria-expanded="false">${icons.dots}</button>
    <div class="ind-more-menu hidden" data-more-menu="${id}">
      <button type="button" data-export="csv" data-chart="${id}">${icons.download}Exporter les données (CSV)</button>
      <button type="button" data-export="png" data-chart="${id}">${icons.download}Enregistrer l’image (PNG)</button>
    </div>
  </div>`;
}

const INFO_TEXT = {
  vpd: 'Le déficit de pression de vapeur (DPV) mesure la « soif » de l’air : plus il est élevé, plus la demande d’évaporation est forte. La courbe pleine donne la moyenne journalière, la courbe en pointillés le maximum horaire du jour. Entre 0,8 et 1,6 kPa les conditions sont favorables ; au-delà de 2,5 kPa la contrainte devient forte.',
  daily: 'Pluie journalière et ET₀ (évapotranspiration de référence FAO, gazon bien alimenté) au lieu choisi. Sur les longues périodes, les valeurs sont regroupées par semaine ou par mois.'
};

// ---------------------------------------------------------------------------
// Calculs
// ---------------------------------------------------------------------------
function calcVpd(t, rh) {
  if (!Number.isFinite(t) || !Number.isFinite(rh)) return null;
  const es = 0.6108 * Math.exp((17.27 * t) / (t + 237.3));
  return Math.max(0, es * (1 - rh / 100));
}
function vpdLabel(v) {
  if (v < 0.8) return 'Faible demande atmosphérique';
  if (v < 1.6) return 'Conditions favorables';
  if (v < 2.5) return 'Début de régulation stomatique';
  if (v < 3.5) return 'Contrainte atmosphérique élevée';
  if (v < 4.5) return 'Stress sévère';
  return 'Stress extrême';
}
function average(values) {
  const valid = values.filter(Number.isFinite);
  return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
}
function sum(values) {
  const valid = values.filter(Number.isFinite);
  return valid.length ? valid.reduce((a, b) => a + b, 0) : null;
}
function heatDurationScore(hours35) {
  if (hours35 === 0) return 0;
  if (hours35 <= 2) return 25;
  if (hours35 <= 5) return 50;
  if (hours35 <= 8) return 75;
  return 100;
}
function scoreLabel(s) {
  if (s < 25) return 'Faible';
  if (s < 50) return 'Modérée';
  if (s < 75) return 'Élevée';
  if (s < 90) return 'Sévère';
  return 'Extrême';
}
function scoreColor(s) {
  if (s < 25) return 'rgba(72,149,239,.75)';
  if (s < 50) return 'rgba(82,183,136,.75)';
  if (s < 75) return 'rgba(248,196,62,.82)';
  if (s < 90) return 'rgba(244,140,54,.82)';
  return 'rgba(83,52,131,.82)';
}
function dayLabel(iso) {
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit' }).format(new Date(`${iso}T12:00:00`));
}
function hourLabel(time) {
  return `${time.slice(8, 10)}/${time.slice(5, 7)} ${time.slice(11, 13)} h`;
}

const vpdBandsPlugin = {
  id: 'samVpdBands',
  beforeDraw(chart, _args, options) {
    if (!options || options.enabled !== true || !chart.chartArea) return;
    const { ctx, chartArea, scales } = chart;
    const y = scales.y;
    if (!y) return;
    const bands = [
      { min: 0, max: 0.8, color: 'rgba(72,149,239,.22)' }, { min: 0.8, max: 1.6, color: 'rgba(82,183,136,.24)' },
      { min: 1.6, max: 2.5, color: 'rgba(248,196,62,.28)' }, { min: 2.5, max: 3.5, color: 'rgba(244,140,54,.28)' },
      { min: 3.5, max: 4.5, color: 'rgba(214,69,65,.26)' }, { min: 4.5, max: Math.max(6, y.max), color: 'rgba(83,52,131,.26)' }
    ];
    ctx.save();
    bands.forEach(band => {
      if (band.min > y.max) return;
      const top = y.getPixelForValue(Math.min(band.max, y.max));
      const bottom = y.getPixelForValue(Math.max(band.min, y.min));
      ctx.fillStyle = band.color;
      ctx.fillRect(chartArea.left, top, chartArea.right - chartArea.left, bottom - top);
    });
    ctx.restore();
  }
};

// ---------------------------------------------------------------------------
// Données Open-Meteo
// ---------------------------------------------------------------------------
const HOURLY_VARS = ['temperature_2m', 'relative_humidity_2m', 'precipitation', 'wind_speed_10m'];
const DAILY_VARS = ['precipitation_sum', 'et0_fao_evapotranspiration', 'temperature_2m_max', 'temperature_2m_min'];
const MAX_HOURLY_DAYS = 800;

async function fetchJson(url) {
  let response = await fetch(url, { cache: 'no-store' });
  if (response.status === 429 || response.status >= 500) {
    await new Promise(resolve => setTimeout(resolve, 1200));
    response = await fetch(url, { cache: 'no-store' });
  }
  if (!response.ok) {
    let detail = '';
    try { detail = (await response.json()).reason || ''; } catch { /* rien */ }
    throw new Error(`Open-Meteo (${response.status})${detail ? ` : ${detail}` : ''}`);
  }
  return response.json();
}

function parseHourly(h) {
  if (!h?.time) return [];
  return h.time.map((time, i) => {
    const temperature = h.temperature_2m?.[i];
    const humidity = h.relative_humidity_2m?.[i];
    return {
      time,
      date: time.slice(0, 10),
      temperature: temperature == null ? null : Number(temperature),
      humidity: humidity == null ? null : Number(humidity),
      rain: h.precipitation?.[i] == null ? null : Number(h.precipitation[i]),
      wind: h.wind_speed_10m?.[i] == null ? null : Number(h.wind_speed_10m[i]),
      vpd: temperature == null || humidity == null ? null : calcVpd(Number(temperature), Number(humidity))
    };
  });
}

function parseDaily(d) {
  if (!d?.time) return [];
  const value = (key, i) => (d[key]?.[i] == null ? null : Number(d[key][i]));
  return d.time.map((date, i) => ({
    date,
    rain: value('precipitation_sum', i),
    et0: value('et0_fao_evapotranspiration', i),
    tmax: value('temperature_2m_max', i),
    tmin: value('temperature_2m_min', i)
  }));
}

function createWeatherStore() {
  let key = null;
  let recent = null;
  const archiveDaily = new Map();
  const archiveHourly = new Map();
  const archiveHourlyDays = new Set();

  function reset(place) {
    key = `${place.latitude.toFixed(4)}_${place.longitude.toFixed(4)}`;
    recent = null;
    archiveDaily.clear();
    archiveHourly.clear();
    archiveHourlyDays.clear();
  }

  async function loadRecent(place, force = false) {
    const k = `${place.latitude.toFixed(4)}_${place.longitude.toFixed(4)}`;
    if (k !== key) reset(place);
    if (recent && !force && Date.now() - recent.loadedAt < 30 * 60 * 1000) return recent;
    const params = new URLSearchParams({
      latitude: place.latitude.toFixed(4),
      longitude: place.longitude.toFixed(4),
      hourly: HOURLY_VARS.join(','),
      daily: DAILY_VARS.join(','),
      timezone: 'auto',
      past_days: '92',
      forecast_days: '8'
    });
    const cacheKey = `indicateurs.weather.${k}`;
    try {
      const data = await fetchJson(`https://api.open-meteo.com/v1/forecast?${params}`);
      recent = {
        hourly: parseHourly(data.hourly),
        daily: parseDaily(data.daily),
        elevation: data.elevation,
        loadedAt: Date.now(),
        offline: false
      };
      storage.set(cacheKey, { savedAt: Date.now(), hourly: data.hourly, daily: data.daily, elevation: data.elevation });
    } catch (error) {
      const cached = storage.get(cacheKey, null);
      if (!cached) throw error;
      recent = {
        hourly: parseHourly(cached.hourly),
        daily: parseDaily(cached.daily),
        elevation: cached.elevation,
        loadedAt: Date.now(),
        offline: true,
        savedAt: cached.savedAt
      };
    }
    return recent;
  }

  async function loadArchive(place, start, end, withHourly) {
    if (start > end) return;
    let missingDaily = false;
    for (let d = start; d <= end; d = addDaysISO(d, 1)) {
      if (!archiveDaily.has(d)) { missingDaily = true; break; }
    }
    let missingHourly = false;
    if (withHourly) {
      for (let d = start; d <= end; d = addDaysISO(d, 1)) {
        if (!archiveHourlyDays.has(d)) { missingHourly = true; break; }
      }
    }
    if (!missingDaily && !missingHourly) return;
    const params = new URLSearchParams({
      latitude: place.latitude.toFixed(4),
      longitude: place.longitude.toFixed(4),
      start_date: start,
      end_date: end,
      daily: DAILY_VARS.join(','),
      timezone: 'auto'
    });
    if (missingHourly) params.set('hourly', HOURLY_VARS.join(','));
    const data = await fetchJson(`https://archive-api.open-meteo.com/v1/archive?${params}`);
    parseDaily(data.daily).forEach(row => archiveDaily.set(row.date, row));
    if (missingHourly) {
      parseHourly(data.hourly).forEach(row => archiveHourly.set(row.time, row));
      for (let d = start; d <= end; d = addDaysISO(d, 1)) archiveHourlyDays.add(d);
    }
  }

  /** Données journalières et horaires pour [start, end] (prévisions + historique). */
  async function range(place, start, end, { hourly = true } = {}) {
    const rec = await loadRecent(place);
    const recentStart = rec.daily[0]?.date || todayISO();
    const needHourly = hourly && diffDaysISO(start, end) + 1 <= MAX_HOURLY_DAYS;
    if (start < recentStart) {
      const archiveEnd = end < recentStart ? end : addDaysISO(recentStart, -1);
      await loadArchive(place, start, archiveEnd, needHourly);
    }
    const dailyMap = new Map();
    archiveDaily.forEach((row, date) => { if (date >= start && date <= end) dailyMap.set(date, row); });
    rec.daily.forEach(row => { if (row.date >= start && row.date <= end) dailyMap.set(row.date, row); });
    const daily = [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date));
    let hours = null;
    if (needHourly) {
      const hourMap = new Map();
      archiveHourly.forEach((row, time) => { if (row.date >= start && row.date <= end) hourMap.set(time, row); });
      rec.hourly.forEach(row => { if (row.date >= start && row.date <= end) hourMap.set(row.time, row); });
      hours = [...hourMap.values()].sort((a, b) => a.time.localeCompare(b.time));
    }
    return { daily, hourly: hours };
  }

  return { loadRecent, range, get recent() { return recent; } };
}

// ---------------------------------------------------------------------------
// Montage
// ---------------------------------------------------------------------------
export async function mount(root, ctx) {
  root.innerHTML = TEMPLATE;
  const $ = id => root.querySelector(`#${id}`);
  const Chart = window.Chart;
  const charts = {};
  const weather = createWeatherStore();
  let activeTab = storage.get('indicateurs.tab', 'overview');
  let renderToken = 0;
  let dataset = null; // { period, prev, cur: {daily, hourly}, previous: {daily, hourly} }

  ctx.filters({ location: true, period: true });
  ctx.period.configure({
    presets: [
      presets.lastDays(7),
      presets.lastDays(30),
      presets.lastDays(90),
      presets.nextDays(7, '7 prochains jours (prévisions)'),
      presets.sinceJanuary()
    ],
    defaultPreset: 'last7',
    min: '1940-01-01',
    max: () => addDaysISO(todayISO(), 7),
    hint: 'Historique disponible depuis 1940 · prévisions jusqu’à J+7.'
  });

  const chartBase = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { intersect: false, mode: 'index' },
    plugins: { legend: { display: false }, tooltip: { padding: 10, cornerRadius: 8 } },
    scales: {
      x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 9, color: '#4b5058' } },
      y: { beginAtZero: true, grid: { color: 'rgba(17,24,39,.07)' }, ticks: { color: '#4b5058' }, border: { display: false } }
    }
  };
  const legacyBase = {
    ...chartBase,
    plugins: { legend: { display: true, position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, padding: 18 } } }
  };

  function draw(name, canvasId, config) {
    if (charts[name]) charts[name].destroy();
    const canvas = $(canvasId);
    if (!canvas) return null;
    charts[name] = new Chart(canvas, config);
    return charts[name];
  }

  function setStatus(text, isError = false) {
    $('indStatusText').textContent = text;
    $('indStatus').classList.toggle('is-error', isError);
  }

  // --- Onglets ------------------------------------------------------------
  function selectTab(tab) {
    activeTab = tab;
    storage.set('indicateurs.tab', tab);
    root.querySelectorAll('.ind-tab').forEach(btn => {
      const on = btn.dataset.tab === tab;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-selected', String(on));
    });
    root.querySelectorAll('.ind-panel').forEach(panel => panel.classList.toggle('is-active', panel.dataset.panel === tab));
    renderActive();
  }

  // --- Vue d'ensemble -------------------------------------------------------
  function deltaBadge(id, current, previous, mode, unit = '', minBase = 0) {
    const el = $(id);
    el.className = 'ind-delta';
    if (!Number.isFinite(current) || !Number.isFinite(previous)) {
      el.textContent = '—';
      el.classList.add('is-neutral');
      return;
    }
    let text;
    let value;
    if (mode === 'absolute') {
      value = current - previous;
      text = `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatNumber(Math.abs(value), 1)} °C`;
    } else {
      const pct = previous === 0 ? Infinity : (current - previous) / Math.abs(previous) * 100;
      if (Math.abs(previous) < minBase || !Number.isFinite(pct) || Math.abs(pct) > 300) {
        // Base trop faible pour un pourcentage parlant : écart absolu.
        const diff = current - previous;
        const digits = Math.abs(diff) >= 10 ? 0 : 1;
        text = `${diff > 0 ? '+' : diff < 0 ? '−' : ''}${formatNumber(Math.abs(diff), digits)} ${unit}`.trim();
        el.textContent = text;
        el.title = `Période précédente : ${formatNumber(previous, 1)} ${unit}`.trim();
        el.classList.add(Math.abs(diff) < 0.05 ? 'is-neutral' : diff > 0 ? 'is-up' : 'is-down');
        return;
      }
      value = Math.round(pct);
      text = `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value)} %`;
    }
    el.title = mode === 'absolute' ? `Période précédente : ${formatNumber(previous, 1)} °C` : `Période précédente : ${formatNumber(previous, 1)} ${unit}`.trim();
    el.textContent = text;
    el.classList.add(Math.abs(value) < (mode === 'absolute' ? 0.05 : 0.5) ? 'is-neutral' : value > 0 ? 'is-up' : 'is-down');
  }

  function stats(data) {
    const daily = data.daily || [];
    const hourly = data.hourly;
    const et0 = sum(daily.map(d => d.et0));
    const rain = sum(daily.map(d => d.rain));
    let temp = hourly ? average(hourly.map(h => h.temperature)) : null;
    if (temp === null) temp = average(daily.map(d => (Number.isFinite(d.tmax) && Number.isFinite(d.tmin) ? (d.tmax + d.tmin) / 2 : null)));
    const rh = hourly ? average(hourly.map(h => h.humidity)) : null;
    const windKmh = hourly ? average(hourly.map(h => h.wind)) : null;
    return { et0, rain, temp, rh, wind: windKmh === null ? null : windKmh / 3.6, days: daily.length };
  }

  function aggregateDaily(daily) {
    const n = daily.length;
    if (n <= 100) return { unit: 'jour', rows: daily.map(d => ({ key: d.date, label: formatDayMonth(d.date), rain: d.rain, et0: d.et0, from: d.date, to: d.date })) };
    const byMonth = n > 730;
    const groups = new Map();
    daily.forEach(d => {
      let key;
      if (byMonth) key = d.date.slice(0, 7);
      else {
        const date = new Date(`${d.date}T12:00:00Z`);
        const day = (date.getUTCDay() + 6) % 7;
        key = addDaysISO(d.date, -day);
      }
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(d);
    });
    const rows = [...groups.entries()].map(([key, items]) => ({
      key,
      label: byMonth ? `${key.slice(5, 7)}/${key.slice(2, 4)}` : formatDayMonth(key),
      rain: sum(items.map(i => i.rain)),
      et0: sum(items.map(i => i.et0)),
      from: items[0].date,
      to: items[items.length - 1].date
    }));
    return { unit: byMonth ? 'mois' : 'semaine', rows };
  }

  function dailyVpd(hourly) {
    const byDay = new Map();
    (hourly || []).forEach(h => {
      if (!byDay.has(h.date)) byDay.set(h.date, []);
      if (Number.isFinite(h.vpd)) byDay.get(h.date).push(h.vpd);
    });
    return [...byDay.entries()].map(([date, values]) => ({
      date,
      mean: average(values),
      max: values.length ? Math.max(...values) : null
    })).filter(d => d.mean !== null);
  }

  function updateSegments() {
    const p = ctx.period.get();
    const today = todayISO();
    root.querySelectorAll('.ind-seg button').forEach(btn => {
      const days = Number(btn.dataset.days);
      const on = p && p.end && p.start && diffDaysISO(p.start, p.end) + 1 === days && p.end <= addDaysISO(today, 7);
      btn.classList.toggle('is-active', Boolean(on));
      btn.setAttribute('aria-pressed', String(Boolean(on)));
    });
  }

  function renderOverview() {
    if (!dataset) return;
    const cur = stats(dataset.cur);
    const prev = stats(dataset.previous);
    const setValue = (id, value, digits) => { $(id).textContent = formatNumber(value, digits); };
    setValue('kpiEt0', cur.et0, 1);
    setValue('kpiRain', cur.rain, 1);
    setValue('kpiTemp', cur.temp, 1);
    setValue('kpiRh', cur.rh, 0);
    setValue('kpiWind', cur.wind, 1);
    deltaBadge('kpiEt0Delta', cur.et0, prev.et0, 'relative', 'mm', 1);
    deltaBadge('kpiRainDelta', cur.rain, prev.rain, 'relative', 'mm', 2);
    deltaBadge('kpiTempDelta', cur.temp, prev.temp, 'absolute');
    deltaBadge('kpiRhDelta', cur.rh, prev.rh, 'relative', '%', 1);
    deltaBadge('kpiWindDelta', cur.wind, prev.wind, 'relative', 'm/s', 0.3);

    const today = todayISO();
    const forecastDays = dataset.cur.daily.filter(d => d.date > today).length;
    const notes = [];
    if (forecastDays) notes.push(`La période inclut ${forecastDays} jour${forecastDays > 1 ? 's' : ''} de prévision.`);
    if (!dataset.cur.hourly) notes.push('Période longue : humidité, vent et DPV ne sont calculés que sur des périodes de moins de deux ans.');
    if (dataset.prevMissing) notes.push('Comparaison indisponible : la période précédente sort de l’historique disponible.');
    $('ovNote').textContent = notes.join(' ');
    updateSegments();

    // DPV moyen / max journalier
    const vpdDays = dailyVpd(dataset.cur.hourly);
    draw('ovVpd', 'ovVpdChart', {
      type: 'line',
      data: {
        labels: vpdDays.map(d => formatDayMonth(d.date)),
        datasets: [
          { label: 'DPV moyen (kPa)', data: vpdDays.map(d => d.mean), borderColor: '#db0b1f', backgroundColor: '#db0b1f', borderWidth: 2.2, pointRadius: vpdDays.length > 45 ? 0 : 3.5, pointHoverRadius: 5, tension: 0.38 },
          { label: 'DPV max (kPa)', data: vpdDays.map(d => d.max), borderColor: 'rgba(219,11,31,.45)', borderDash: [5, 4], borderWidth: 1.6, pointRadius: 0, tension: 0.3 }
        ]
      },
      options: {
        ...chartBase,
        plugins: { ...chartBase.plugins, tooltip: { ...chartBase.plugins.tooltip, callbacks: { label: c => `${c.dataset.label} : ${formatNumber(c.parsed.y, 2)}` } } },
        scales: { ...chartBase.scales, y: { ...chartBase.scales.y, suggestedMax: 2, ticks: { ...chartBase.scales.y.ticks, callback: v => formatNumber(v, 1) } } }
      }
    });

    // Pluie / ET0
    const agg = aggregateDaily(dataset.cur.daily);
    $('ovDailyAgg').textContent = agg.unit === 'jour' ? '' : `· cumuls par ${agg.unit}`;
    draw('ovDaily', 'ovDailyChart', {
      type: 'bar',
      data: {
        labels: agg.rows.map(r => r.label),
        datasets: [
          { label: 'Pluie (mm)', data: agg.rows.map(r => r.rain), backgroundColor: '#c5011a', borderRadius: 3, maxBarThickness: 16, categoryPercentage: 0.62, barPercentage: 0.9 },
          { label: 'ET₀ (mm)', data: agg.rows.map(r => r.et0), backgroundColor: '#57a53d', borderRadius: 3, maxBarThickness: 16, categoryPercentage: 0.62, barPercentage: 0.9 }
        ]
      },
      options: {
        ...chartBase,
        plugins: {
          ...chartBase.plugins,
          tooltip: {
            ...chartBase.plugins.tooltip,
            callbacks: {
              title: items => {
                const row = agg.rows[items[0].dataIndex];
                return row.from === row.to ? formatDateShort(row.from, true) : `${formatDateShort(row.from)} → ${formatDateShort(row.to, true)}`;
              },
              label: c => `${c.dataset.label} : ${formatNumber(c.parsed.y, 1)}`
            }
          }
        },
        scales: { ...chartBase.scales, y: { ...chartBase.scales.y, title: { display: true, text: 'mm', color: '#4b5058', align: 'end' } } }
      }
    });
  }

  // --- Prévisions météo ---------------------------------------------------
  function dayOnlyXAxis(rows) {
    return {
      grid: { display: false },
      ticks: {
        maxRotation: 0, autoSkip: false,
        callback(_value, index) {
          const row = rows[index];
          if (!row) return '';
          const previous = index > 0 ? rows[index - 1].date : '';
          return index === 0 || row.date !== previous ? formatDayMonth(row.date) : '';
        }
      }
    };
  }

  let selectedWeatherDate = null;
  function renderWeather() {
    const rec = weather.recent;
    if (!rec) return;
    const today = todayISO();
    const n = Number($('weatherDays').value) || 7;
    const days = rec.daily.filter(d => d.date >= today).slice(0, n).map(day => {
      const h = rec.hourly.filter(x => x.date === day.date);
      const winds = h.map(x => x.wind).filter(Number.isFinite);
      return { ...day, humidityMean: average(h.map(x => x.humidity)), windMean: average(winds), windMax: winds.length ? Math.max(...winds) : null };
    });
    if (!days.length) return;
    if (selectedWeatherDate && !days.some(d => d.date === selectedWeatherDate)) selectedWeatherDate = null;
    $('weatherCards').innerHTML = days.map(d => {
      const selected = d.date === selectedWeatherDate;
      return `<button type="button" class="weather-card weather-card-button${selected ? ' selected' : ''}" data-weather-date="${d.date}" aria-pressed="${selected}">
        <span class="weather-day">${dayLabel(d.date)}</span>
        <strong>${formatNumber(d.tmin, 1)}–${formatNumber(d.tmax, 1)} °C</strong>
        <span class="weather-detail">Pluie : ${formatNumber(d.rain, 1)} mm</span>
        <span class="weather-detail">Humidité moy. : ${formatNumber(d.humidityMean, 0)} %</span>
        <span class="weather-detail">Vent moy. : ${formatNumber(d.windMean, 1)} km/h</span>
        <span class="weather-detail">Vent max : ${formatNumber(d.windMax, 1)} km/h</span>
      </button>`;
    }).join('');
    const selectedDay = selectedWeatherDate ? days.find(d => d.date === selectedWeatherDate) : null;
    const dates = new Set(days.map(d => d.date));
    const hours = selectedDay ? rec.hourly.filter(x => x.date === selectedDay.date) : rec.hourly.filter(x => dates.has(x.date));
    if (!hours.length) return;
    const labels = hours.map(x => hourLabel(x.time));
    const hourAxis = { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 9, callback(value) { const label = String(this.getLabelForValue(value)); return label.slice(-4); } } };
    const xAxis = selectedDay ? hourAxis : dayOnlyXAxis(hours);
    const lineCfg = (label, data, color, yTitle, extraY = {}) => ({
      type: 'line',
      data: { labels, datasets: [{ label, data, borderColor: color, backgroundColor: color, tension: 0.2, pointRadius: selectedDay ? 2 : 0, borderWidth: 2 }] },
      options: { ...legacyBase, scales: { x: xAxis, y: { beginAtZero: false, title: { display: true, text: yTitle }, grid: { color: 'rgba(101,114,126,.13)' }, ...extraY } } }
    });
    const suffix = selectedDay ? ` — ${formatDayMonth(selectedDay.date)}` : '';
    draw('temperature', 'temperatureChart', lineCfg(`Température${suffix}`, hours.map(x => x.temperature), '#e1064b', 'Température (°C)'));
    if (selectedDay) {
      draw('rainForecast', 'rainForecastChart', { type: 'bar', data: { labels, datasets: [{ label: `Pluie horaire${suffix}`, data: hours.map(x => x.rain), backgroundColor: 'rgba(72,149,239,.75)', borderRadius: 3 }] }, options: { ...legacyBase, scales: { x: hourAxis, y: { beginAtZero: true, title: { display: true, text: 'Pluie horaire (mm)' } } } } });
    } else {
      draw('rainForecast', 'rainForecastChart', { type: 'bar', data: { labels: days.map(d => formatDayMonth(d.date)), datasets: [{ label: 'Pluie', data: days.map(d => d.rain), backgroundColor: 'rgba(72,149,239,.75)', borderRadius: 5 }] }, options: { ...legacyBase, scales: { x: { grid: { display: false } }, y: { beginAtZero: true, title: { display: true, text: 'Pluie journalière (mm)' } } } } });
    }
    draw('humidity', 'humidityChart', lineCfg(`Humidité relative${suffix}`, hours.map(x => x.humidity), '#52b788', 'Humidité relative (%)', { beginAtZero: true, max: 100 }));
    draw('wind', 'windChart', lineCfg(`Vent${suffix}`, hours.map(x => x.wind), '#65727e', 'Vent (km/h)', { beginAtZero: true }));
  }

  // --- Déficit climatique ------------------------------------------------
  function renderDeficit() {
    if (!dataset) return;
    const days = dataset.cur.daily;
    let cumulative = 0;
    const rows = days.map(d => {
      const et0 = Number(d.et0) || 0;
      const rain = Number(d.rain) || 0;
      cumulative += et0 - rain;
      return { ...d, et0, rain, cumulative };
    });
    if (!rows.length) {
      $('deficitNote').textContent = 'Aucune donnée pour cette période.';
      return;
    }
    const et0 = rows.reduce((s, d) => s + d.et0, 0);
    const rain = rows.reduce((s, d) => s + d.rain, 0);
    const week = rows.slice(-7).reduce((s, d) => s + d.et0 - d.rain, 0);
    $('et0Total').textContent = `${formatNumber(et0, 1)} mm`;
    $('rainTotal').textContent = `${formatNumber(rain, 1)} mm`;
    $('deficitTotal').textContent = `${formatNumber(rows.at(-1).cumulative, 1)} mm`;
    $('deficitWeekChange').textContent = `${week >= 0 ? '+' : ''}${formatNumber(week, 1)} mm`;
    const agg = aggregateDaily(rows);
    const cumulByKey = new Map();
    agg.rows.forEach(r => cumulByKey.set(r.key, rows.filter(d => d.date <= r.to).at(-1)?.cumulative ?? null));
    $('deficitNote').textContent = agg.unit === 'jour' ? '' : `Barres regroupées par ${agg.unit} ; courbe du bilan cumulé en fin de ${agg.unit}.`;
    draw('deficit', 'deficitChart', {
      data: {
        labels: agg.rows.map(r => r.label),
        datasets: [
          { type: 'bar', label: 'ET₀', data: agg.rows.map(r => r.et0), backgroundColor: 'rgba(168,101,22,.62)', yAxisID: 'daily' },
          { type: 'bar', label: 'Pluie', data: agg.rows.map(r => r.rain), backgroundColor: 'rgba(63,111,147,.62)', yAxisID: 'daily' },
          { type: 'line', label: 'Bilan cumulé', data: agg.rows.map(r => cumulByKey.get(r.key)), borderColor: '#7f1d2d', backgroundColor: '#7f1d2d', yAxisID: 'cum', tension: 0.2, pointRadius: agg.rows.length > 60 ? 0 : 2 }
        ]
      },
      options: {
        ...legacyBase,
        scales: {
          x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 12 } },
          daily: { beginAtZero: true, position: 'left', title: { display: true, text: agg.unit === 'jour' ? 'mm / jour' : `mm / ${agg.unit}` } },
          cum: { position: 'right', beginAtZero: false, grid: { drawOnChartArea: false }, title: { display: true, text: 'Bilan cumulé (mm)' } }
        }
      }
    });
  }

  // --- DPV ----------------------------------------------------------------
  function renderVpd() {
    if (!dataset) return;
    const hours = dataset.cur.hourly;
    if (!hours || !hours.length) {
      $('vpdNote').textContent = 'Le DPV horaire n’est disponible que pour des périodes de moins de deux ans.';
      return;
    }
    const nDays = new Set(hours.map(h => h.date)).size;
    const hourlyView = nDays <= 21;
    $('vpdTitle').textContent = hourlyView ? 'DPV horaire' : 'DPV journalier (moyenne et maximum)';
    $('vpdNote').textContent = hourlyView ? '' : 'Période longue : affichage des moyennes et maximums journaliers.';
    if (hourlyView) {
      draw('vpd', 'vpdChart', {
        type: 'line',
        data: { labels: hours.map(h => hourLabel(h.time)), datasets: [{ label: 'DPV', data: hours.map(h => h.vpd), borderColor: '#7f1d2d', pointRadius: hours.length > 96 ? 0 : 1.5, tension: 0.2 }] },
        options: { ...legacyBase, plugins: { ...legacyBase.plugins, samVpdBands: { enabled: true } }, scales: { x: dayOnlyXAxis(hours), y: { beginAtZero: true, suggestedMax: 5.5, title: { display: true, text: 'DPV (kPa)' } } } },
        plugins: [vpdBandsPlugin]
      });
    } else {
      const days = dailyVpd(hours);
      draw('vpd', 'vpdChart', {
        type: 'line',
        data: {
          labels: days.map(d => formatDayMonth(d.date)),
          datasets: [
            { label: 'DPV moyen', data: days.map(d => d.mean), borderColor: '#7f1d2d', pointRadius: 0, tension: 0.2 },
            { label: 'DPV max', data: days.map(d => d.max), borderColor: '#c5011a', borderDash: [5, 4], pointRadius: 0, tension: 0.2 }
          ]
        },
        options: { ...legacyBase, plugins: { ...legacyBase.plugins, samVpdBands: { enabled: true } }, scales: { x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 12 } }, y: { beginAtZero: true, suggestedMax: 5.5, title: { display: true, text: 'DPV (kPa)' } } } },
        plugins: [vpdBandsPlugin]
      });
    }
    const thresholds = [1.5, 2.5, 3.5, 4.5];
    draw('threshold', 'thresholdChart', {
      type: 'bar',
      data: {
        labels: ['> 1,5 kPa — régulation', '> 2,5 kPa — contrainte', '> 3,5 kPa — stress sévère', '> 4,5 kPa — stress extrême'],
        datasets: [{ label: `Heures sur ${hours.length} h`, data: thresholds.map(t => hours.filter(h => h.vpd > t).length), backgroundColor: ['rgba(248,196,62,.8)', 'rgba(244,140,54,.8)', 'rgba(214,69,65,.8)', 'rgba(83,52,131,.8)'], borderRadius: 5 }]
      },
      options: { ...legacyBase, indexAxis: 'y', scales: { x: { beginAtZero: true, title: { display: true, text: 'Heures' } }, y: { grid: { display: false } } } }
    });
  }

  // --- Indice de contrainte ---------------------------------------------
  function scoreDays() {
    if (!dataset?.cur.hourly) return [];
    const byDay = new Map();
    dataset.cur.hourly.forEach(h => {
      if (!byDay.has(h.date)) byDay.set(h.date, []);
      byDay.get(h.date).push(h);
    });
    return dataset.cur.daily.filter(d => byDay.has(d.date)).map(day => {
      const h = byDay.get(day.date);
      const vpdValues = h.map(x => x.vpd).filter(Number.isFinite).sort((a, b) => b - a);
      const top3Vpd = average(vpdValues.slice(0, 3)) || 0;
      const maxVpd = vpdValues.length ? vpdValues[0] : 0;
      const hours25 = h.filter(x => x.vpd > 2.5).length;
      const hours35 = h.filter(x => x.temperature > 35).length;
      const et0 = Number(day.et0) || 0;
      const score = Math.round(0.4 * Math.min(100, top3Vpd / 4.5 * 100) + 0.3 * Math.min(100, hours25 / 10 * 100) + 0.2 * heatDurationScore(hours35) + 0.1 * Math.min(100, et0 / 8 * 100));
      return { ...day, et0, score, maxVpd, top3Vpd, hours25, hours35 };
    });
  }

  function renderScore() {
    if (!dataset) return;
    const days = scoreDays();
    if (!days.length) {
      $('scoreNote').textContent = 'L’indice de contrainte n’est disponible que pour des périodes de moins de deux ans.';
      $('scoreCards').innerHTML = '';
      return;
    }
    $('scoreNote').textContent = days.length > 14 ? 'Détail jour par jour affiché pour les périodes de 14 jours au plus.' : '';
    draw('score', 'scoreChart', {
      type: 'bar',
      data: { labels: days.map(d => formatDayMonth(d.date)), datasets: [{ label: 'Indice /100', data: days.map(d => d.score), backgroundColor: days.map(d => scoreColor(d.score)), borderRadius: days.length > 60 ? 1 : 6 }] },
      options: { ...legacyBase, scales: { x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 14 } }, y: { beginAtZero: true, max: 100 } } }
    });
    $('scoreCards').innerHTML = days.length > 14 ? '' : days.map(d => `<article class="forecast-card"><span>${dayLabel(d.date)}</span><strong>${d.score}/100</strong><span class="forecast-level">${scoreLabel(d.score)}</span><div class="forecast-metrics"><span>DPV moyen des 3 h les plus élevées : ${formatNumber(d.top3Vpd, 1)} kPa</span><span>DPV max : ${formatNumber(d.maxVpd, 1)} kPa · ${vpdLabel(d.maxVpd)}</span><span>Durée DPV &gt; 2,5 kPa : ${d.hours25} h</span><span>Durée &gt; 35 °C : ${d.hours35} h</span><span>ET₀ : ${formatNumber(d.et0, 1)} mm</span></div></article>`).join('');
  }

  function renderActive() {
    if (activeTab === 'overview') renderOverview();
    else if (activeTab === 'meteo') renderWeather();
    else if (activeTab === 'deficit') renderDeficit();
    else if (activeTab === 'vpd') renderVpd();
    else if (activeTab === 'contrainte') renderScore();
  }

  // --- Chargement ---------------------------------------------------------
  async function load({ force = false } = {}) {
    const token = ++renderToken;
    const place = ctx.location.get();
    const p = ctx.period.get();
    if (!place || !p?.start || !p?.end) return;
    const length = diffDaysISO(p.start, p.end) + 1;
    const prevEnd = addDaysISO(p.start, -1);
    const prevStart = addDaysISO(p.start, -length);
    setStatus(`Chargement des données météo pour ${place.name}…`);
    $('indRefresh').disabled = true;
    try {
      await weather.loadRecent(place, force);
      const wantHourly = length <= 400;
      const prevAvailable = prevStart >= '1940-01-01';
      const all = await weather.range(place, prevAvailable ? prevStart : p.start, p.end, { hourly: wantHourly });
      if (token !== renderToken || ctx.scope.disposed) return;
      const split = (rows, key, from, to) => rows ? rows.filter(r => r[key] >= from && r[key] <= to) : null;
      dataset = {
        cur: { daily: split(all.daily, 'date', p.start, p.end), hourly: split(all.hourly, 'date', p.start, p.end) },
        previous: prevAvailable ? { daily: split(all.daily, 'date', prevStart, prevEnd), hourly: split(all.hourly, 'date', prevStart, prevEnd) } : { daily: [], hourly: null },
        prevMissing: !prevAvailable
      };
      const rec = weather.recent;
      const when = rec.offline
        ? `hors connexion — données du ${new Date(rec.savedAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}`
        : `actualisé à ${new Date(rec.loadedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
      setStatus(`${place.name}${Number.isFinite(rec.elevation) ? ` · altitude ${Math.round(rec.elevation)} m` : ''} · Open-Meteo · ${when}`, rec.offline);
      renderActive();
    } catch (error) {
      if (token !== renderToken) return;
      console.error(error);
      setStatus(`Impossible de charger les données : ${error.message}`, true);
    } finally {
      if (token === renderToken) $('indRefresh').disabled = false;
    }
  }

  // --- Export ---------------------------------------------------------------
  function exportChart(chartId, format) {
    const chart = charts[chartId];
    if (!chart) return;
    const place = ctx.location.get();
    const p = ctx.period.get();
    const base = `SAM_${chartId === 'ovVpd' ? 'DPV' : 'Pluie_ET0'}_${(place?.name || 'lieu').replace(/[^a-z0-9]+/gi, '_')}_${p.start}_${p.end}`;
    const link = document.createElement('a');
    if (format === 'png') {
      link.href = chart.toBase64Image('image/png', 1);
      link.download = `${base}.png`;
    } else {
      const header = ['Date', ...chart.data.datasets.map(d => d.label)];
      const lines = chart.data.labels.map((label, i) => [label, ...chart.data.datasets.map(d => (d.data[i] == null ? '' : String(Math.round(d.data[i] * 100) / 100).replace('.', ',')))]);
      const csv = [header, ...lines].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';')).join('\r\n');
      link.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
      link.download = `${base}.csv`;
    }
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  // --- Événements -----------------------------------------------------------
  root.querySelectorAll('.ind-tab').forEach(btn => btn.addEventListener('click', () => selectTab(btn.dataset.tab)));
  $('indRefresh').addEventListener('click', () => load({ force: true }));
  $('weatherDays').addEventListener('change', () => { selectedWeatherDate = null; renderWeather(); });
  $('weatherCards').addEventListener('click', event => {
    const card = event.target.closest('[data-weather-date]');
    if (!card) return;
    selectedWeatherDate = selectedWeatherDate === card.dataset.weatherDate ? null : card.dataset.weatherDate;
    renderWeather();
  });
  root.querySelectorAll('.ind-seg button').forEach(btn => btn.addEventListener('click', () => {
    const p = ctx.period.get();
    const days = Number(btn.dataset.days);
    const end = p?.end && p.end <= addDaysISO(todayISO(), 7) ? p.end : todayISO();
    if (end === todayISO()) ctx.period.set({ preset: `last${days}` });
    else ctx.period.set({ start: addDaysISO(end, -(days - 1)), end });
  }));
  root.querySelectorAll('[data-more]').forEach(btn => btn.addEventListener('click', event => {
    event.stopPropagation();
    const menu = root.querySelector(`[data-more-menu="${btn.dataset.more}"]`);
    const open = menu.classList.contains('hidden');
    root.querySelectorAll('.ind-more-menu').forEach(m => m.classList.add('hidden'));
    menu.classList.toggle('hidden', !open);
    btn.setAttribute('aria-expanded', String(open));
  }));
  root.querySelectorAll('[data-export]').forEach(btn => btn.addEventListener('click', () => {
    exportChart(btn.dataset.chart, btn.dataset.export);
    root.querySelectorAll('.ind-more-menu').forEach(m => m.classList.add('hidden'));
  }));
  ctx.scope.on(document, 'click', () => root.querySelectorAll('.ind-more-menu').forEach(m => m.classList.add('hidden')));
  root.querySelectorAll('[data-info]').forEach(btn => btn.addEventListener('click', () => {
    const box = $('ovInfoBox');
    const text = INFO_TEXT[btn.dataset.info];
    const same = !box.classList.contains('hidden') && box.dataset.key === btn.dataset.info;
    box.dataset.key = btn.dataset.info;
    box.innerHTML = `<p>${escapeHtml(text)}</p>`;
    box.classList.toggle('hidden', same);
  }));

  ctx.location.onChange(() => load());
  ctx.period.onChange(() => load());

  selectTab(['overview', 'meteo', 'deficit', 'vpd', 'contrainte', 'methodes'].includes(activeTab) ? activeTab : 'overview');
  await load();

  return {
    unmount() {
      Object.values(charts).forEach(chart => chart.destroy());
    }
  };
}
