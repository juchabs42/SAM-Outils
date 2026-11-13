// Icônes SVG en ligne (traits 1,8 px, couleur héritée sauf icônes d'outils).
const svg = (body, { size = 24, viewBox = '0 0 24 24', fill = 'none', stroke = 'currentColor', width = 1.8, cls = '' } = {}) =>
  `<svg class="sam-icon ${cls}" width="${size}" height="${size}" viewBox="${viewBox}" fill="${fill}" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;

export const icons = {
  search: svg('<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>', { size: 20 }),
  layers: svg('<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/>', { size: 20 }),
  star: svg('<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9L12 3.5Z"/>', { size: 22 }),
  starFilled: svg('<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9L12 3.5Z"/>', { size: 22, fill: 'currentColor' }),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="7.8" r=".6" fill="currentColor"/>', { size: 22 }),
  infoSmall: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="7.8" r=".6" fill="currentColor"/>', { size: 16 }),
  chevronLeft: svg('<path d="m14.5 6-6 6 6 6"/>', { size: 20, width: 2.4 }),
  chevronRight: svg('<path d="m9.5 6 6 6-6 6"/>', { size: 20, width: 2.4 }),
  chevronDown: svg('<path d="m6 9.5 6 6 6-6"/>', { size: 18, width: 2 }),
  arrowRight: svg('<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>', { size: 18 }),
  map: svg('<path d="m3 6.5 6-2.5 6 2.5 6-2.5v13.5l-6 2.5-6-2.5-6 2.5V6.5Z"/><path d="M9 4v13.5M15 6.5V20"/>', { size: 24 }),
  user: svg('<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5c1.2-4 4.1-6 7.5-6s6.3 2 7.5 6"/>', { size: 24 }),
  power: svg('<path d="M12 3v8"/><path d="M6.4 6.6a8 8 0 1 0 11.2 0"/>', { size: 24 }),
  login: svg('<path d="M10 17l5-5-5-5"/><path d="M15 12H3"/><path d="M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5"/>', { size: 24 }),
  pin: svg('<path d="M12 21s-6.5-6.2-6.5-11.2a6.5 6.5 0 0 1 13 0C18.5 14.8 12 21 12 21Z"/><circle cx="12" cy="9.8" r="2.3"/>', { size: 20 }),
  calendar: svg('<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01"/>', { size: 20 }),
  gps: svg('<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="7.5"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22"/>', { size: 18 }),
  close: svg('<path d="M6 6l12 12M18 6 6 18"/>', { size: 18, width: 2 }),
  menu: svg('<path d="M4 7h16M4 12h16M4 17h16"/>', { size: 24, width: 2 }),
  dots: svg('<circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none"/>', { size: 20 }),
  download: svg('<path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/>', { size: 18 }),
  install: svg('<rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M12 7v7"/><path d="m9 11 3 3 3-3"/>', { size: 20 }),
  lock: svg('<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>', { size: 16 }),
  edit: svg('<path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>', { size: 16 }),
  // Onglets de l'onglet Données (traits inspirés de Lucide, licence ISC)
  viewMeteo: svg('<path d="M12 2v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="M20 12h2"/><path d="m19.07 4.93-1.41 1.41"/><path d="M15.95 12.65a4 4 0 0 0-5.93-4.13"/><path d="M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z"/>', { size: 24 }),
  viewIrrigation: svg('<path d="M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z"/><path d="M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97"/>', { size: 24 }),
  viewSanitaire: svg('<path d="m8 2 1.88 1.88"/><path d="M14.12 3.88 16 2"/><path d="M9 7.13v-1a3 3 0 1 1 6 0v1"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6"/><path d="M12 20v-9"/><path d="M6.53 9C4.6 8.8 3 7.1 3 5"/><path d="M6 13H2"/><path d="M3 21c0-2.1 1.7-3.9 3.8-4"/><path d="M20.97 5c0 2.1-1.6 3.8-3.5 4"/><path d="M22 13h-4"/><path d="M17.2 17c2.1.1 3.8 1.9 3.8 4"/>', { size: 24 }),
  station: svg('<path d="M12 21V10.5"/><path d="M8.5 21h7"/><circle cx="12" cy="8" r="2.2"/><path d="M7.6 3.6a6.2 6.2 0 0 0 0 8.8M16.4 3.6a6.2 6.2 0 0 1 0 8.8"/>', { size: 20 }),
  logout: svg('<path d="M14 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2v-2"/><path d="M10 12h11"/><path d="m17.5 8.5 3.5 3.5-3.5 3.5"/>', { size: 22 }),
  // Administration (icônes Lucide, licence ISC)
  settings: svg('<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>', { size: 20 }),
  users: svg('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>', { size: 20 }),
  activity: svg('<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>', { size: 20 }),

  // Icônes des outils (couleurs de la maquette)
  toolIndicateurs: svg('<path d="M7.5 18.5h9.8a3.7 3.7 0 0 0 .4-7.4 5.2 5.2 0 0 0-9.9-1.2A4.3 4.3 0 0 0 7.5 18.5Z"/><path d="M5.6 7.2 4.4 6M9.6 4.6V3M2.6 10.7H1"/>', { size: 34, stroke: '#C5011A' }),
  toolIrrigation: svg('<path d="M12 3.5s-6 6.6-6 11a6 6 0 0 0 12 0c0-4.4-6-11-6-11Z"/>', { size: 34, stroke: '#2B79C2' }),
  toolBilan: svg('<path d="M12 3.2s-6.4 7-6.4 11.6a6.4 6.4 0 0 0 12.8 0C18.4 10.2 12 3.2 12 3.2Z" fill="#C5011A" stroke="#C5011A"/><path d="M9 15.2a3 3 0 0 0 2.6 2.8" stroke="#fff" stroke-width="1.6"/>', { size: 34, stroke: '#C5011A' }),
  toolPheno: svg('<path d="M12 21V11"/><path d="M12 13c-4.8.4-7.6-2.4-7.6-7.4 4.8-.3 7.6 2.5 7.6 7.4Z" fill="#E7F3E2"/><path d="M12 11c.2-4.6 3-7.3 8-7-.1 4.9-3 7.4-8 7Z" fill="#E7F3E2"/>', { size: 34, stroke: '#3E8E2E' }),
  toolTavelure: svg('<circle cx="12" cy="4.2" r="1.7"/><circle cx="17.5" cy="6.5" r="1.7"/><circle cx="19.8" cy="12" r="1.7"/><circle cx="17.5" cy="17.5" r="1.7"/><circle cx="12" cy="19.8" r="1.7"/><circle cx="6.5" cy="17.5" r="1.7"/><circle cx="4.2" cy="12" r="1.7"/><circle cx="6.5" cy="6.5" r="1.7"/><circle cx="12" cy="12" r="1.7"/>', { size: 34, stroke: 'none', fill: '#A93BD8' }),
  toolPiegeage: svg('<path d="M3 11.5 12 4l9 7.5" stroke="#F08A00" stroke-width="2.2"/><path d="M5.5 10.5V20h13v-9.5" fill="#F7A21B" stroke="#F08A00"/><path d="M5.5 15.5h13" stroke="#FFD48A" stroke-width="1.5"/>', { size: 34, stroke: '#F08A00' }),

  // Icônes des indicateurs
  kpiEt0: svg('<path d="M12 3.5s-6 6.6-6 11a6 6 0 0 0 12 0c0-4.4-6-11-6-11Z"/>', { size: 22, stroke: '#2B79C2' }),
  kpiRain: svg('<path d="M7.5 15h9.8a3.7 3.7 0 0 0 .4-7.4 5.2 5.2 0 0 0-9.9-1.2A4.3 4.3 0 0 0 7.5 15Z"/><path d="m8 18-1 2.5M12 18l-1 2.5M16 18l-1 2.5"/>', { size: 22, stroke: '#C5011A' }),
  kpiTemp: svg('<path d="M14 14.5V5a2 2 0 0 0-4 0v9.5a4 4 0 1 0 4 0Z"/><circle cx="12" cy="17.5" r="1.4" fill="#C5011A"/><path d="M12 16V9"/>', { size: 22, stroke: '#C5011A' }),
  kpiHumidity: svg('<path d="M12 3.5s-6 6.6-6 11a6 6 0 0 0 12 0c0-4.4-6-11-6-11Z"/><path d="M9.5 15.5a2.6 2.6 0 0 0 2.3 2.4"/>', { size: 22, stroke: '#2B79C2' }),
  kpiWind: svg('<path d="M3 8.5h10.5a2.5 2.5 0 1 0-2.4-3.1"/><path d="M3 12.5h15a2.5 2.5 0 1 1-2.4 3.1"/><path d="M3 16.5h7"/>', { size: 22, stroke: '#C5011A' })
};
