// Écran de connexion (obligatoire) : connexion, mot de passe oublié,
// choix du mot de passe après un lien d'invitation ou de réinitialisation.
import { auth, signIn, sendPasswordReset, updatePassword, authErrorMessage } from './auth.js';

const $ = id => document.getElementById(id);

function setMessage(id, text = '', isError = false) {
  const el = $(id);
  el.textContent = text;
  el.classList.toggle('is-error', Boolean(isError));
}

function showView(name) {
  ['login', 'reset', 'password'].forEach(view => { $(`sam-gate-${view}-view`).hidden = view !== name; });
  const focus = { login: 'sam-gate-email', reset: 'sam-gate-reset-email', password: 'sam-gate-new' }[name];
  setTimeout(() => {
    const field = $(focus);
    if (name === 'login' && field.value) $('sam-gate-password').focus();
    else field.focus();
  }, 30);
}

const isEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

/**
 * Affiche l'écran de connexion et résout quand un compte est connecté
 * (et que son mot de passe est choisi, après un lien reçu par mail).
 */
export function runGate({ mode = 'login', message = '' } = {}) {
  const gate = $('sam-gate');
  const app = $('sam-app');
  gate.hidden = false;
  app.hidden = true;
  document.body.classList.add('is-gated');

  return new Promise(resolve => {
    const done = () => {
      gate.hidden = true;
      app.hidden = false;
      document.body.classList.remove('is-gated');
      resolve(auth);
    };

    if (mode === 'password') {
      const invite = auth.linkType === 'invite' || auth.linkType === 'signup';
      $('sam-gate-password-title').textContent = invite ? 'Bienvenue sur SAM Outils' : 'Nouveau mot de passe';
      $('sam-gate-password-text').textContent = invite
        ? `Choisissez le mot de passe de votre compte ${auth.user?.email || ''}. Il vous servira à chaque connexion.`
        : `Choisissez un nouveau mot de passe pour ${auth.user?.email || 'votre compte'}.`;
      showView('password');
    } else {
      showView('login');
      if (message) setMessage('sam-gate-login-message', message, true);
    }

    $('sam-gate-login').onsubmit = async event => {
      event.preventDefault();
      const email = $('sam-gate-email').value.trim();
      const password = $('sam-gate-password').value;
      if (!isEmail(email)) return setMessage('sam-gate-login-message', 'Indiquez une adresse mail valide.', true);
      if (!password) return setMessage('sam-gate-login-message', 'Indiquez votre mot de passe.', true);
      const submit = $('sam-gate-login-submit');
      submit.disabled = true;
      setMessage('sam-gate-login-message', 'Connexion…');
      try {
        await signIn(email, password);
        $('sam-gate-password').value = '';
        setMessage('sam-gate-login-message', '');
        done();
      } catch (error) {
        setMessage('sam-gate-login-message', authErrorMessage(error), true);
      } finally {
        submit.disabled = false;
      }
    };

    $('sam-gate-forgot').onclick = () => {
      $('sam-gate-reset-email').value = $('sam-gate-email').value.trim();
      setMessage('sam-gate-reset-message', '');
      showView('reset');
    };
    $('sam-gate-back').onclick = () => {
      setMessage('sam-gate-login-message', '');
      showView('login');
    };

    $('sam-gate-reset').onsubmit = async event => {
      event.preventDefault();
      const email = $('sam-gate-reset-email').value.trim();
      if (!isEmail(email)) return setMessage('sam-gate-reset-message', 'Indiquez une adresse mail valide.', true);
      const submit = $('sam-gate-reset-submit');
      submit.disabled = true;
      setMessage('sam-gate-reset-message', 'Envoi…');
      try {
        await sendPasswordReset(email);
        setMessage('sam-gate-reset-message', 'C’est envoyé. Si un compte existe pour cette adresse, un mail arrive dans quelques minutes (pensez aux indésirables).');
      } catch (error) {
        setMessage('sam-gate-reset-message', authErrorMessage(error), true);
      } finally {
        submit.disabled = false;
      }
    };

    $('sam-gate-new-password').onsubmit = async event => {
      event.preventDefault();
      const password = $('sam-gate-new').value;
      const confirm = $('sam-gate-confirm').value;
      if (password.length < 8) return setMessage('sam-gate-password-message', 'Le mot de passe doit faire 8 caractères au moins.', true);
      if (password !== confirm) return setMessage('sam-gate-password-message', 'Les deux mots de passe ne sont pas identiques.', true);
      const submit = $('sam-gate-password-submit');
      submit.disabled = true;
      setMessage('sam-gate-password-message', 'Enregistrement…');
      try {
        await updatePassword(password);
        $('sam-gate-new').value = '';
        $('sam-gate-confirm').value = '';
        done();
      } catch (error) {
        setMessage('sam-gate-password-message', authErrorMessage(error), true);
      } finally {
        submit.disabled = false;
      }
    };
  });
}
