// Migration des données de l'ancienne appli SAM Piégeage vers SAM Outils.
// La copie se fait dans le navigateur de l'administrateur : lecture dans l'ancienne
// base Supabase, écriture dans la nouvelle (identifiants conservés, relançable sans doublon).
import { fetchAllRows, escapeHtml } from '../core/util.js';

const OLD = {
  url: 'https://qdzbxpjlbaazdymthefm.supabase.co',
  key: 'sb_publishable_5jK2FVA9utM5HiHFGnzgmA_F3TevQex'
};

const TABLES = [
  { name: 'piegeage_species', label: 'Espèces' },
  { name: 'piegeage_campaigns', label: 'Campagnes' },
  { name: 'piegeage_parcels', label: 'Parcelles' },
  { name: 'piegeage_campaign_species', label: 'Espèces suivies par campagne' },
  { name: 'piegeage_campaign_parcels', label: 'Parcelles par campagne' },
  { name: 'piegeage_traps', label: 'Pièges' },
  { name: 'piegeage_trap_events', label: 'Événements de piège' },
  { name: 'piegeage_observations_v2', label: 'Relevés' },
  { name: 'piegeage_observation_details', label: 'Identifications' },
  { name: 'piegeage_interventions', label: 'Interventions' },
  { name: 'piegeage_intervention_parcels', label: 'Parcelles des interventions' }
];

const TEMPLATE = `
<div class="tool-main mig">
  <section class="mig-card">
    <p class="mig-kicker">Étape 1</p>
    <h2>Se connecter à l’ancienne base SAM Piégeage</h2>
    <p class="mig-text">Utilise le compte de l’ancienne appli SAM Piégeage (adresse et mot de passe habituels). La connexion sert uniquement à lire les données, archives comprises ; rien n’est modifié dans l’ancienne base. Le mot de passe n’est pas enregistré.</p>
    <form class="mig-login" id="migLogin" autocomplete="off">
      <label>Adresse mail<input id="migEmail" type="email" autocomplete="username" required></label>
      <label>Mot de passe<input id="migPassword" type="password" autocomplete="current-password" required></label>
      <button class="mig-button is-primary" type="submit" id="migLoginBtn">Se connecter et analyser</button>
    </form>
    <button class="mig-link" type="button" id="migPublic">Continuer sans connexion (données publiques uniquement, sans les archives)</button>
    <p class="mig-message" id="migLoginMessage" role="status"></p>
  </section>

  <section class="mig-card" id="migAnalysis" hidden>
    <p class="mig-kicker">Étape 2</p>
    <h2>Données trouvées</h2>
    <div class="mig-table-wrap">
      <table class="mig-table">
        <thead><tr><th>Table</th><th>Ancienne base</th><th>Copiées</th><th>Erreurs</th><th>Nouvelle base</th></tr></thead>
        <tbody id="migRows"></tbody>
      </table>
    </div>
    <div class="mig-actions">
      <button class="mig-button is-primary" type="button" id="migCopy">Copier dans SAM Outils</button>
      <button class="mig-button" type="button" id="migVerify">Vérifier la nouvelle base</button>
    </div>
    <p class="mig-message" id="migCopyMessage" role="status"></p>
    <ul class="mig-log" id="migLog"></ul>
  </section>
</div>`;

export async function mount(root, ctx) {
  ctx.filters({ location: false, period: false });
  const $ = id => root.querySelector(`#${id}`);
  const state = { oldClient: null, data: null, copied: {}, errors: {}, newCounts: {} };

  function renderGate() {
    if (ctx.isAdmin) return false;
    root.innerHTML = `<div class="tool-main mig"><section class="mig-card">
      <h2>Réservé aux administrateurs</h2>
      <p class="mig-text">Connecte-toi avec un compte administrateur SAM (bouton « Connexion » en haut à droite) pour copier les données de l’ancienne appli SAM Piégeage.</p>
      <button class="mig-button is-primary" type="button" id="migOpenLogin">Connexion</button>
    </section></div>`;
    root.querySelector('#migOpenLogin').addEventListener('click', () => ctx.ui.openLogin());
    return true;
  }

  ctx.onAuthChange(() => {
    if (!renderGate()) build();
  });

  function log(text, kind = '') {
    const li = document.createElement('li');
    li.className = kind;
    li.textContent = text;
    $('migLog').appendChild(li);
  }

  function renderRows() {
    $('migRows').innerHTML = TABLES.map(t => {
      const rows = state.data?.[t.name];
      const read = rows ? rows.length : '—';
      const copied = state.copied[t.name] ?? '—';
      const errors = state.errors[t.name]?.length || 0;
      const fresh = state.newCounts[t.name] ?? '—';
      return `<tr>
        <td>${escapeHtml(t.label)}<small>${t.name}</small></td>
        <td>${read}</td>
        <td>${copied}</td>
        <td class="${errors ? 'is-error' : ''}">${errors || (copied === '—' ? '—' : 0)}</td>
        <td>${fresh}</td>
      </tr>`;
    }).join('');
  }

  async function analyze(client, withAccount) {
    $('migLoginMessage').textContent = 'Lecture de l’ancienne base…';
    const data = {};
    for (const table of TABLES) {
      const { data: rows, error } = await fetchAllRows(() => client.from(table.name).select('*').order('id'));
      if (error) {
        data[table.name] = [];
        log(`${table.label} : lecture impossible (${error.message}).`, 'is-error');
      } else {
        data[table.name] = rows;
      }
    }
    state.data = data;
    const total = Object.values(data).reduce((s, rows) => s + rows.length, 0);
    $('migLoginMessage').textContent = `${total} lignes lues${withAccount ? ' (archives comprises)' : ' (données publiques, sans archives)'}.`;
    $('migAnalysis').hidden = false;
    renderRows();
    await verify();
  }

  async function connectAndAnalyze(event) {
    event.preventDefault();
    const button = $('migLoginBtn');
    button.disabled = true;
    $('migLoginMessage').textContent = 'Connexion à l’ancienne base…';
    try {
      const client = window.supabase.createClient(OLD.url, OLD.key, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'samOutils-old-piegeage' }
      });
      const { error } = await client.auth.signInWithPassword({ email: $('migEmail').value.trim(), password: $('migPassword').value });
      $('migPassword').value = '';
      if (error) throw error;
      state.oldClient = client;
      await analyze(client, true);
    } catch (error) {
      $('migLoginMessage').textContent = /invalid/i.test(error.message || '') ? 'Adresse mail ou mot de passe incorrect pour l’ancienne base.' : `Connexion impossible : ${error.message}`;
    } finally {
      button.disabled = false;
    }
  }

  async function analyzePublic() {
    const client = window.supabase.createClient(OLD.url, OLD.key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'samOutils-old-piegeage-public' }
    });
    state.oldClient = client;
    await analyze(client, false);
  }

  // Écriture tolérante : colonne inconnue → retirée ; valeur vide refusée → valeur par défaut.
  async function upsertRows(table, rows) {
    const dropped = new Set();
    let pending = rows.map(row => ({ ...row }));
    for (let attempt = 0; attempt < 12; attempt++) {
      const { error } = await ctx.supabase.from(table).upsert(pending, { onConflict: 'id', defaultToNull: false });
      if (!error) return { ok: pending.length, failed: [], dropped };
      const unknown = /Could not find the '([^']+)' column/i.exec(error.message || '');
      if (unknown) {
        dropped.add(unknown[1]);
        pending = pending.map(row => { const copy = { ...row }; delete copy[unknown[1]]; return copy; });
        continue;
      }
      const notNull = /null value in column "([^"]+)"/i.exec(error.message || '');
      if (notNull) {
        const column = notNull[1];
        let changed = false;
        pending = pending.map(row => {
          if (row[column] === null) { changed = true; const copy = { ...row }; delete copy[column]; return copy; }
          return row;
        });
        if (changed) continue;
      }
      if (pending.length === 1) return { ok: 0, failed: [{ row: pending[0], error }], dropped };
      // Erreur sur un lot : on reprend ligne par ligne pour isoler les lignes en cause.
      let ok = 0;
      const failed = [];
      for (const row of pending) {
        const result = await upsertRows(table, [row]);
        ok += result.ok;
        failed.push(...result.failed);
        result.dropped.forEach(col => dropped.add(col));
      }
      return { ok, failed, dropped };
    }
    return { ok: 0, failed: pending.map(row => ({ row, error: { message: 'Trop de tentatives.' } })), dropped };
  }

  async function copyAll() {
    if (!state.data) return;
    const button = $('migCopy');
    button.disabled = true;
    $('migLog').innerHTML = '';
    let totalOk = 0;
    let totalFailed = 0;
    for (const table of TABLES) {
      const rows = state.data[table.name] || [];
      state.copied[table.name] = 0;
      state.errors[table.name] = [];
      $('migCopyMessage').textContent = `Copie : ${table.label}…`;
      for (let i = 0; i < rows.length; i += 200) {
        const batch = rows.slice(i, i + 200);
        const result = await upsertRows(table.name, batch);
        state.copied[table.name] += result.ok;
        state.errors[table.name].push(...result.failed);
        if (result.dropped.size) log(`${table.label} : colonnes absentes de la nouvelle base, ignorées : ${[...result.dropped].join(', ')}.`, 'is-warning');
        renderRows();
      }
      totalOk += state.copied[table.name];
      totalFailed += state.errors[table.name].length;
      state.errors[table.name].slice(0, 5).forEach(item => log(`${table.label} : ligne ${item.row.id} non copiée — ${item.error.message}`, 'is-error'));
      if (state.errors[table.name].length > 5) log(`${table.label} : ${state.errors[table.name].length - 5} autres lignes en erreur.`, 'is-error');
    }
    $('migCopyMessage').textContent = totalFailed
      ? `${totalOk} lignes copiées, ${totalFailed} en erreur (détail ci-dessous). Tu peux relancer la copie : elle ne crée pas de doublons.`
      : `Copie terminée : ${totalOk} lignes copiées. Ouvre SAM Piégeage pour vérifier.`;
    if (!totalFailed) log('Migration terminée sans erreur.', 'is-ok');
    await verify();
    button.disabled = false;
  }

  async function verify() {
    for (const table of TABLES) {
      const { count, error } = await ctx.supabase.from(table.name).select('id', { count: 'exact', head: true });
      state.newCounts[table.name] = error ? '?' : count;
    }
    renderRows();
  }

  function build() {
    root.innerHTML = TEMPLATE;
    $('migLogin').addEventListener('submit', connectAndAnalyze);
    $('migPublic').addEventListener('click', analyzePublic);
    $('migCopy').addEventListener('click', copyAll);
    $('migVerify').addEventListener('click', verify);
    renderRows();
  }

  if (!renderGate()) build();
  return { unmount() { state.oldClient = null; } };
}
