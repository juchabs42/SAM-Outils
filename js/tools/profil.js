// Mon profil : informations personnelles du compte, mot de passe, déconnexion.
import { updatePassword, authErrorMessage } from '../core/auth.js';

const FIELDS = [
  { id: 'prenom', label: 'Prénom', type: 'text', autocomplete: 'given-name', max: 60 },
  { id: 'nom', label: 'Nom', type: 'text', autocomplete: 'family-name', max: 60 },
  { id: 'structure', label: 'Structure / exploitation', type: 'text', autocomplete: 'organization', max: 120 },
  { id: 'fonction', label: 'Fonction', type: 'text', autocomplete: 'organization-title', max: 80 },
  { id: 'telephone', label: 'Téléphone', type: 'tel', autocomplete: 'tel', max: 30 },
  { id: 'commune', label: 'Commune', type: 'text', autocomplete: 'address-level2', max: 80 }
];

const TEMPLATE = `
<div class="pro-main">
  <section class="pro-card pro-account">
    <div class="pro-avatar" id="proAvatar" aria-hidden="true"></div>
    <div class="pro-account-text">
      <h2 id="proName">Mon compte</h2>
      <p id="proEmail"></p>
      <span class="pro-badge" id="proRole"></span>
    </div>
    <button class="sam-button pro-logout" type="button" id="proLogout">Se déconnecter</button>
  </section>

  <section class="pro-card">
    <header class="pro-card-head">
      <h2>Mes informations</h2>
      <p>Elles permettent à l’équipe SudExpé de savoir qui utilise SAM Outils. Seuls vous et les administrateurs SAM les voient.</p>
    </header>
    <form class="pro-form" id="proForm" novalidate>
      <div class="pro-grid">
        ${FIELDS.map(f => `<label class="sam-field">${f.label}<input id="pro-${f.id}" name="${f.id}" type="${f.type}" autocomplete="${f.autocomplete}" maxlength="${f.max}"></label>`).join('')}
      </div>
      <div class="pro-actions">
        <button class="sam-button sam-button-primary" type="submit" id="proSave">Enregistrer</button>
        <p class="sam-form-message" id="proMessage" role="status"></p>
      </div>
    </form>
  </section>

  <section class="pro-card">
    <header class="pro-card-head">
      <h2>Mot de passe</h2>
      <p>8 caractères au moins. Vous resterez connecté sur cet appareil.</p>
    </header>
    <form class="pro-form" id="proPasswordForm" novalidate>
      <div class="pro-grid">
        <label class="sam-field">Nouveau mot de passe<input id="proPassword" type="password" autocomplete="new-password" minlength="8"></label>
        <label class="sam-field">Confirmer<input id="proPasswordConfirm" type="password" autocomplete="new-password" minlength="8"></label>
      </div>
      <div class="pro-actions">
        <button class="sam-button" type="submit" id="proPasswordSave">Changer le mot de passe</button>
        <p class="sam-form-message" id="proPasswordMessage" role="status"></p>
      </div>
    </form>
  </section>
</div>`;

export async function mount(root, ctx) {
  root.innerHTML = TEMPLATE;
  const $ = id => root.querySelector(`#${id}`);
  const user = ctx.user;

  function setMessage(id, text, isError = false) {
    $(id).textContent = text;
    $(id).classList.toggle('is-error', Boolean(isError));
  }

  function renderHeader(data) {
    const name = [data?.prenom, data?.nom].filter(Boolean).join(' ').trim();
    $('proName').textContent = name || 'Mon compte';
    $('proEmail').textContent = user?.email || '';
    const initials = name
      ? name.split(/\s+/).map(part => part[0]).join('').slice(0, 2)
      : (user?.email || '?')[0];
    $('proAvatar').textContent = initials.toUpperCase();
    $('proRole').textContent = ctx.isAdmin ? 'Administrateur SAM — saisie et modification' : 'Consultation (lecture seule)';
    $('proRole').classList.toggle('is-admin', Boolean(ctx.isAdmin));
  }

  function fillForm(data) {
    FIELDS.forEach(f => { $(`pro-${f.id}`).value = data?.[f.id] || ''; });
  }

  const data = await ctx.profile.load(true).catch(() => null);
  if (ctx.scope.disposed) return {};
  fillForm(data);
  renderHeader(data);

  $('proForm').addEventListener('submit', async event => {
    event.preventDefault();
    const patch = Object.fromEntries(FIELDS.map(f => [f.id, $(`pro-${f.id}`).value.trim()]));
    $('proSave').disabled = true;
    setMessage('proMessage', 'Enregistrement…');
    const { error } = await ctx.profile.save(patch);
    $('proSave').disabled = false;
    if (error) {
      const missing = /relation|does not exist|schema cache|profils/i.test(error.message || '');
      setMessage('proMessage', missing
        ? 'Enregistré sur cet appareil seulement : la table des profils n’est pas encore créée dans Supabase.'
        : `Enregistrement impossible : ${error.message || String(error)}`, true);
      return;
    }
    setMessage('proMessage', 'Informations enregistrées.');
    renderHeader(ctx.profile.data);
  });

  $('proPasswordForm').addEventListener('submit', async event => {
    event.preventDefault();
    const password = $('proPassword').value;
    const confirm = $('proPasswordConfirm').value;
    if (password.length < 8) return setMessage('proPasswordMessage', 'Le mot de passe doit faire 8 caractères au moins.', true);
    if (password !== confirm) return setMessage('proPasswordMessage', 'Les deux mots de passe ne sont pas identiques.', true);
    $('proPasswordSave').disabled = true;
    setMessage('proPasswordMessage', 'Enregistrement…');
    try {
      await updatePassword(password);
      $('proPassword').value = '';
      $('proPasswordConfirm').value = '';
      setMessage('proPasswordMessage', 'Mot de passe changé.');
    } catch (error) {
      setMessage('proPasswordMessage', authErrorMessage(error), true);
    } finally {
      $('proPasswordSave').disabled = false;
    }
  });

  $('proLogout').addEventListener('click', () => ctx.ui.logout());
  ctx.onAuthChange(() => renderHeader(ctx.profile.data));

  return {};
}
