// SAM Outils — outils communs aux graphiques.
// 1. Zoom au glisser sur l'axe des dates (souris ou doigt), double-clic / double-toucher :
//    retour au zoom précédent. Une fois zoomé : bouton « Tout afficher », barre de défilement
//    sous le graphique et, au doigt, glisser pour parcourir la période.
// 2. Graduations temporelles : petits traits au-dessus des dates (heures, jours, semaines, mois).

const SEL_FILL = 'rgba(197, 1, 26, .10)';
const SEL_STROKE = 'rgba(197, 1, 26, .55)';
const BAR_H = 6;                  // barre de défilement (px)
const PHONE = '(max-width: 760px)';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const isPhone = () => window.matchMedia(PHONE).matches;

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---------------------------------------------------------------------------
// Gestes communs (Chart.js ou graphique dessiné à la main)
// ---------------------------------------------------------------------------
// h = {
//   area(): { left, right, top, bottom } en px CSS dans le canvas, ou null
//   zoomed(): bool
//   select(x0, x1)          sélection terminée (px)
//   preview(sel | null)     dessin du rectangle pendant la sélection
//   back()                  retour au zoom précédent (renvoie true si quelque chose a changé)
//   pan?(dx, start)         glisser au doigt une fois zoomé (dx en px depuis le début du geste)
//   bar?(p)                 geste démarré sur la barre de défilement : renvoie { move(dx), end() } ou null
// }
export function bindZoomGestures(canvas, h) {
  if (canvas.$samGestures) { canvas.$samGestures.h = h; return; }
  const state = { h, drag: null, lastTap: 0, lastTouchBack: 0, suppressClick: false };
  canvas.$samGestures = state;
  canvas.style.touchAction = 'pan-y';
  const pos = event => {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const inArea = (p, a) => a && p.x >= a.left && p.x <= a.right && p.y >= a.top && p.y <= a.bottom;
  const tapped = () => {
    const now = Date.now();
    if (now - state.lastTap < 350) {
      state.lastTap = 0;
      if (state.h.back()) state.lastTouchBack = now;
    } else state.lastTap = now;
  };

  canvas.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const p = pos(event);
    const bar = state.h.bar?.(p);
    if (bar) {
      state.drag = { kind: 'bar', id: event.pointerId, x0: p.x, bar };
      try { canvas.setPointerCapture?.(event.pointerId); } catch (_) { /* pointeur déjà relâché */ }
      event.preventDefault();
      return;
    }
    const a = state.h.area();
    if (!inArea(p, a)) return;
    if (event.pointerType !== 'mouse' && state.h.zoomed() && state.h.pan) {
      state.drag = { kind: 'pan', id: event.pointerId, x0: p.x, moved: false, start: state.h.pan(0, true) };
      return;
    }
    state.drag = { kind: 'select', id: event.pointerId, x0: p.x, x1: p.x, mouse: event.pointerType === 'mouse', moved: false };
    if (event.pointerType === 'mouse') { try { canvas.setPointerCapture?.(event.pointerId); } catch (_) { /* idem */ } }
  });

  canvas.addEventListener('pointermove', event => {
    const d = state.drag;
    if (!d || event.pointerId !== d.id) {
      // Curseur : croix sur la zone du graphique (sélection), main sur la barre de défilement.
      if (event.pointerType === 'mouse' && !d) {
        const p = pos(event);
        const onBar = state.h.barHit?.(p);
        canvas.style.cursor = onBar ? 'grab' : inArea(p, state.h.area()) ? 'crosshair' : '';
      }
      return;
    }
    const p = pos(event);
    if (d.kind === 'bar') { d.bar.move(p.x - d.x0); return; }
    if (d.kind === 'pan') {
      if (Math.abs(p.x - d.x0) > 4) d.moved = true;
      if (d.moved) state.h.pan(p.x - d.x0, false, d.start);
      return;
    }
    const a = state.h.area();
    if (!a) return;
    d.x1 = clamp(p.x, a.left, a.right);
    if (Math.abs(d.x1 - d.x0) > 6) {
      d.moved = true;
      state.h.preview({ x0: Math.min(d.x0, d.x1), x1: Math.max(d.x0, d.x1) });
    }
  });

  const finish = (event, cancelled = false) => {
    const d = state.drag;
    if (!d || event.pointerId !== d.id) return;
    state.drag = null;
    if (d.kind === 'bar') { d.bar.end(); return; }
    if (d.kind === 'pan') {
      if (!d.moved && !cancelled) tapped();
      return;
    }
    state.h.preview(null);
    if (cancelled) return;
    if (d.moved && Math.abs(d.x1 - d.x0) > 12) {
      state.h.select(Math.min(d.x0, d.x1), Math.max(d.x0, d.x1));
      if (d.mouse) state.suppressClick = true;
      return;
    }
    if (!d.mouse) tapped();
  };
  canvas.addEventListener('pointerup', event => finish(event));
  canvas.addEventListener('pointercancel', event => finish(event, true));
  canvas.addEventListener('dblclick', event => {
    event.preventDefault();
    if (Date.now() - state.lastTouchBack < 700) return; // double-toucher déjà traité
    state.h.back();
  });
  // Le relâchement d'une sélection à la souris produit un « click » : on ne le transmet pas
  // au graphique (sinon un outil réagirait au clic, ex. détail d'un jour).
  canvas.addEventListener('click', event => {
    if (state.suppressClick) { state.suppressClick = false; event.stopImmediatePropagation(); }
  }, true);
}

// Bouton « Tout afficher » posé dans le coin du graphique (dans le parent du canvas).
export function zoomResetButton(canvas, onClick) {
  const host = canvas.parentElement;
  if (!host) return { show() {}, hide() {} };
  let button = host.querySelector(':scope > .sam-zoom-reset');
  if (!button) {
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    button = document.createElement('button');
    button.type = 'button';
    button.className = 'sam-zoom-reset';
    button.hidden = true;
    button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>Tout afficher';
    button.title = 'Revenir à la période complète (double-clic sur le graphique : zoom précédent)';
    host.appendChild(button);
  }
  button.onclick = onClick;
  return {
    show() { button.hidden = false; },
    hide() { button.hidden = true; }
  };
}

// ---------------------------------------------------------------------------
// Zoom des graphiques Chart.js (axe x de type « category »)
// ---------------------------------------------------------------------------
export function createZoomGroup(onChange = null) {
  return { range: null, stack: [], charts: new Set(), onChange };
}

const liveCharts = group => [...group.charts].filter(chart => {
  if (chart.canvas) return true;
  group.charts.delete(chart);
  return false;
});
const groupCount = group => liveCharts(group)[0]?.data.labels?.length || 0;

function applyRange(chart) {
  const z = chart.$samZoom;
  // Ne jamais réaffecter chart.options.scales : ce sont des objets internes de Chart.js.
  const x = chart.options?.scales?.x;
  if (!z || !chart.canvas || !x) return;
  const range = z.group.range;
  x.min = range ? range.min : z.base.min;
  x.max = range ? range.max : z.base.max;
}

// Arrête une éventuelle animation en cours (ouverture du graphique) : sinon elle
// continuerait à replacer les barres et courbes à leurs anciennes positions.
function redraw(chart) {
  chart.stop();
  chart.update('none');
}

function applyGroup(group) {
  liveCharts(group).forEach(chart => {
    applyRange(chart);
    redraw(chart);
    chart.$samZoom.sync();
  });
  group.onChange?.(group.range);
}

export function zoomGroupTo(group, min, max) {
  group.stack.push(group.range);
  group.range = { min, max };
  applyGroup(group);
}

export function zoomGroupBack(group) {
  if (!group.range) return false;
  group.range = group.stack.pop() || null;
  applyGroup(group);
  return true;
}

// apply: false quand les graphiques vont de toute façon être redessinés (nouvelle période…).
export function resetZoomGroup(group, { apply = true } = {}) {
  group.range = null;
  group.stack = [];
  if (apply) applyGroup(group);
}

function panGroup(group, min) {
  if (!group.range) return;
  const n = groupCount(group);
  const width = group.range.max - group.range.min;
  const next = clamp(Math.round(min), 0, Math.max(0, n - 1 - width));
  if (next === group.range.min) return;
  group.range = { min: next, max: next + width };
  applyGroup(group);
}

// Barre de défilement : piste sous la zone des données, curseur = partie affichée.
function scrollbar(chart) {
  const z = chart.$samZoom;
  const a = chart.chartArea;
  const range = z?.group.range;
  const n = chart.data.labels?.length || 0;
  if (!range || !a || n < 2) return null;
  const left = a.left + 4;
  const width = Math.max(20, a.right - a.left - 8);
  const top = a.bottom - BAR_H - 4;
  const thumbWidth = clamp(((range.max - range.min + 1) / n) * width, 28, width);
  const thumbLeft = left + clamp((range.min / Math.max(1, n - (range.max - range.min + 1))) * (width - thumbWidth), 0, width - thumbWidth);
  return { left, width, top, thumbLeft, thumbWidth, n, span: range.max - range.min + 1 };
}

const zoomPlugin = {
  id: 'samZoom',
  // Barre de défilement sous les données (elle ne masque ni barres ni courbes).
  beforeDatasetsDraw(chart) {
    const z = chart.$samZoom;
    const bar = z && chart.chartArea ? scrollbar(chart) : null;
    if (!bar) return;
    const { ctx } = chart;
    ctx.save();
    roundRect(ctx, bar.left, bar.top, bar.width, BAR_H, BAR_H / 2);
    ctx.fillStyle = 'rgba(17, 24, 39, .10)';
    ctx.fill();
    roundRect(ctx, bar.thumbLeft, bar.top, bar.thumbWidth, BAR_H, BAR_H / 2);
    ctx.fillStyle = z.barActive ? 'rgba(162, 1, 23, .85)' : 'rgba(162, 1, 23, .6)';
    ctx.fill();
    ctx.restore();
  },
  // Rectangle de sélection : après les données, avant l'infobulle (dessinée en dernier).
  afterDatasetsDraw(chart) {
    const z = chart.$samZoom;
    if (!z?.sel || !chart.chartArea) return;
    const { ctx, chartArea: a } = chart;
    ctx.save();
    ctx.fillStyle = SEL_FILL;
    ctx.strokeStyle = SEL_STROKE;
    ctx.lineWidth = 1;
    ctx.fillRect(z.sel.x0, a.top, z.sel.x1 - z.sel.x0, a.bottom - a.top);
    ctx.strokeRect(z.sel.x0 + 0.5, a.top + 0.5, z.sel.x1 - z.sel.x0 - 1, a.bottom - a.top - 1);
    ctx.restore();
  },
  afterDestroy(chart) {
    const z = chart.$samZoom;
    if (!z) return;
    z.group.charts.delete(chart);
    if (z.canvas.$samChart === chart) z.button.hide();
  }
};
if (window.Chart?.register) window.Chart.register(zoomPlugin);

// options :
//   group        groupe partagé (plusieurs graphiques zoomés ensemble, ex. Données)
//   resetButton  bouton « Tout afficher » dans le coin du graphique (par défaut oui)
//   phoneWindow  sur téléphone, n'afficher au départ que les derniers points :
//                { pxPerPoint: 12, min: 10 } → la période défile au doigt (graphique « étalé »)
export function enableChartZoom(chart, { group = null, resetButton = true, phoneWindow = null } = {}) {
  const canvas = chart.canvas;
  const g = group || createZoomGroup();
  const button = resetButton ? zoomResetButton(canvas, () => resetZoomGroup(g)) : { show() {}, hide() {} };
  const z = {
    group: g,
    canvas,
    button,
    base: { min: chart.options.scales?.x?.min, max: chart.options.scales?.x?.max },
    sel: null,
    barActive: false,
    sync() { if (g.range) button.show(); else button.hide(); }
  };
  chart.$samZoom = z;
  canvas.$samChart = chart;
  g.charts.add(chart);

  const current = () => (canvas.$samChart && canvas.$samChart.canvas ? canvas.$samChart : null);
  const zoomOf = () => current()?.$samZoom || null;
  const indexAt = (c, x) => clamp(Math.round(c.scales.x.getValueForPixel(x)), 0, (c.data.labels?.length || 1) - 1);
  bindZoomGestures(canvas, {
    area: () => current()?.chartArea || null,
    zoomed: () => Boolean(zoomOf()?.group.range),
    preview(sel) {
      const c = current();
      if (!c) return;
      c.$samZoom.sel = sel;
      c.draw();
    },
    select(x0, x1) {
      const c = current();
      if (!c) return;
      const from = indexAt(c, x0);
      const to = indexAt(c, x1);
      if (to > from) zoomGroupTo(c.$samZoom.group, from, to);
    },
    back: () => { const zz = zoomOf(); return zz ? zoomGroupBack(zz.group) : false; },
    pan(dx, starting, startMin) {
      const c = current();
      const zz = c?.$samZoom;
      if (!zz?.group.range) return null;
      if (starting) return zz.group.range.min;
      const a = c.chartArea;
      const perPx = (zz.group.range.max - zz.group.range.min + 1) / Math.max(1, a.right - a.left);
      panGroup(zz.group, startMin - dx * perPx);
      return null;
    },
    barHit(p) {
      const c = current();
      const bar = c && scrollbar(c);
      return Boolean(bar && p.y >= bar.top - 7 && p.y <= bar.top + BAR_H + 7 && p.x >= bar.left - 4 && p.x <= bar.left + bar.width + 4);
    },
    bar(p) {
      const c = current();
      const bar = c && scrollbar(c);
      if (!bar || !(p.y >= bar.top - 7 && p.y <= bar.top + BAR_H + 7 && p.x >= bar.left - 4 && p.x <= bar.left + bar.width + 4)) return null;
      const zz = c.$samZoom;
      const perPx = (bar.n - bar.span) / Math.max(1, bar.width - bar.thumbWidth);
      // Clic hors du curseur : on centre la partie affichée sur ce point.
      if (p.x < bar.thumbLeft || p.x > bar.thumbLeft + bar.thumbWidth) {
        panGroup(zz.group, (p.x - bar.left - bar.thumbWidth / 2) * perPx);
      }
      const startMin = zz.group.range.min;
      zz.barActive = true;
      c.draw();
      return {
        move(dx) { panGroup(zz.group, startMin + dx * perPx); },
        end() { zz.barActive = false; current()?.draw(); }
      };
    }
  });

  // Nouveau graphique d'un groupe déjà zoomé (ex. Données) : il prend le zoom en cours.
  if (!g.range && !g.stack.length && phoneWindow && isPhone()) {
    const n = chart.data.labels?.length || 0;
    const a = chart.chartArea;
    const size = clamp(Math.round((a ? a.right - a.left : 300) / (phoneWindow.pxPerPoint || 12)), phoneWindow.min || 10, n);
    if (size < n) {
      g.range = { min: n - size, max: n - 1 };
      g.stack = [null];
    }
  }
  if (g.range) {
    applyRange(chart);
    redraw(chart);
  }
  z.sync();
  return {
    group: g,
    reset: () => resetZoomGroup(g),
    back: () => zoomGroupBack(g)
  };
}

// ---------------------------------------------------------------------------
// Graduations temporelles (axe x « category » dont chaque point est une heure ou un jour)
// ---------------------------------------------------------------------------
// items : [{ day: 'AAAA-MM-JJ', hour: 'HH:MM' }] en horaire, [{ day }] en journalier.
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

function dayInfo(day) {
  const y = Number(day.slice(0, 4));
  const m = Number(day.slice(5, 7));
  const d = Number(day.slice(8, 10));
  const index = Math.round(Date.UTC(y, m - 1, d) / 86400000);
  return { y, m, d, index, dow: (index + 3) % 7 }; // dow : 0 = lundi
}

function itemInfo(item, hourly) {
  if (!item) return null;
  if (!item.$samInfo) {
    const info = dayInfo(item.day || '1970-01-01');
    info.h = hourly ? Number(String(item.hour || '00').slice(0, 2)) : 0;
    item.$samInfo = info;
  }
  return item.$samInfo;
}

// Pas des libellés (en heures pour l'horaire, en jours pour le journalier) et des traits.
function planFor(scale, spec) {
  const count = spec.items.length;
  const min = clamp(Math.ceil(scale.min ?? 0), 0, count - 1);
  const max = clamp(Math.floor(scale.max ?? count - 1), 0, count - 1);
  const width = Math.max(1, scale.width || 1);
  const key = `${spec.mode}|${min}|${max}|${Math.round(width)}`;
  if (scale.$samPlan?.key === key) return scale.$samPlan;
  const hourly = spec.mode === 'hourly';
  const unitPx = width / Math.max(1, max - min + 1);
  const size = s => (s === 'month' ? (hourly ? 720 : 30) : s);
  const majors = hourly ? [1, 2, 3, 6, 12, 24, 48, 168, 'month'] : [1, 2, 7, 14, 'month'];
  const major = majors.find(s => unitPx * size(s) >= (hourly && size(s) < 24 ? 42 : 54)) || 'month';
  const minors = (hourly ? [1, 3, 6, 12, 24, 168] : [1, 7]).filter(s => s < size(major) && unitPx * s >= 5);
  const minor = minors.length ? minors[0] : null;
  const mid = hourly
    ? (size(major) > 24 && unitPx * 24 >= 9 ? 24 : null)
    : (size(major) > 7 && unitPx * 7 >= 9 ? 7 : null);
  const plan = { key, hourly, major, minor, mid };
  scale.$samPlan = plan;
  return plan;
}

function matches(info, step, hourly) {
  if (!step) return false;
  if (hourly) {
    if (step === 'month') return info.h === 0 && info.d === 1;
    if (step === 168) return info.h === 0 && info.dow === 0;
    if (step === 48) return info.h === 0 && info.index % 2 === 0;
    if (step === 24) return info.h === 0;
    return info.h % step === 0;
  }
  if (step === 'month') return info.d === 1;
  if (step === 14) return info.dow === 0 && Math.floor((info.index + 3) / 7) % 2 === 0;
  if (step === 7) return info.dow === 0;
  if (step === 2) return info.index % 2 === 0;
  return true;
}

function tickKind(info, plan) {
  if (!info) return null;
  if (matches(info, plan.major, plan.hourly)) return 'major';
  if (matches(info, plan.mid, plan.hourly)) return 'mid';
  if (matches(info, plan.minor, plan.hourly)) return 'minor';
  return null;
}

const dayLabel = info => `${String(info.d).padStart(2, '0')}/${String(info.m).padStart(2, '0')}`;
const monthLabel = info => (info.m === 1 ? `${MONTHS[0]} ${info.y}` : MONTHS[info.m - 1]);

function tickLabel(scale, spec, value) {
  const plan = planFor(scale, spec);
  const info = itemInfo(spec.items[value], plan.hourly);
  if (!info || !matches(info, plan.major, plan.hourly)) return '';
  if (plan.major === 'month') return monthLabel(info);
  if (plan.hourly && info.h !== 0) return `${String(info.h).padStart(2, '0')}h`;
  return dayLabel(info);
}

const isDateLabel = label => typeof label === 'string' && label !== '' && !/h$/.test(label);

// Options de l'axe x (à fusionner dans scales.x) + options du plugin (plugins.samTimeTicks).
export function timeAxis(spec, { fontSize = 12 } = {}) {
  return {
    grid: { display: false, drawTicks: true, tickLength: 9 },
    border: { display: false },
    ticks: {
      autoSkip: false,
      maxRotation: 0,
      padding: 3,
      callback(value) { return tickLabel(this, spec, value); },
      font: c => ({ size: fontSize, weight: isDateLabel(c.tick?.label) ? '700' : '400' }),
      color: c => (isDateLabel(c.tick?.label) ? '#2b3038' : '#6b7280')
    }
  };
}

export const timeTicksPlugin = {
  id: 'samTimeTicks',
  afterDraw(chart, _args, spec) {
    const scale = chart.scales.x;
    if (!scale || !spec?.items?.length) return;
    const plan = planFor(scale, spec);
    const { ctx } = chart;
    const top = Math.round(scale.top) + 0.5;
    const min = clamp(Math.ceil(scale.min ?? 0), 0, spec.items.length - 1);
    const max = clamp(Math.floor(scale.max ?? spec.items.length - 1), 0, spec.items.length - 1);
    const paths = { major: [], mid: [], minor: [] };
    for (let i = min; i <= max; i += 1) {
      const kind = tickKind(itemInfo(spec.items[i], plan.hourly), plan);
      if (kind) paths[kind].push(Math.round(scale.getPixelForValue(i)) + 0.5);
    }
    ctx.save();
    // Ligne de base de l'axe des temps
    ctx.strokeStyle = '#c3c7cd';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(scale.left, top);
    ctx.lineTo(scale.right, top);
    ctx.stroke();
    [['minor', 4, '#b8bcc4', 1], ['mid', 6, '#8a9099', 1], ['major', 8, '#4b5058', 1.4]].forEach(([kind, length, color, width]) => {
      if (!paths[kind].length) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      paths[kind].forEach(x => { ctx.moveTo(x, top); ctx.lineTo(x, top + length); });
      ctx.stroke();
    });
    ctx.restore();
  }
};
