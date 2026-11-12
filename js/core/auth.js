// Client Supabase partagé + état de connexion (utilisateur, droits administrateur).
// La connexion est obligatoire : sans session, l'application affiche l'écran de connexion.
import { createEmitter } from './util.js';

const emitter = createEmitter();

export const auth = {
  client: null,
  user: null,
  isAdmin: false,
  ready: false,
  configured: false,
  /** Lien reçu par mail : 'recovery' (mot de passe oublié), 'invite' (invitation), etc. */
  linkType: null,
  /** Erreur transmise par un lien expiré ou déjà utilisé. */
  linkError: null,
  onChange: fn => emitter.on(fn)
};

// Paramètres d'un lien Supabase (#access_token=…&type=recovery ou #error=…),
// lus avant que le client ne nettoie l'adresse.
function readAuthLink() {
  const hash = window.location.hash.replace(/^#/, '');
  if (!/(^|&)(access_token|error|error_description|error_code)=/.test(hash)) return;
  const params = new URLSearchParams(hash);
  auth.linkType = params.get('type') || null;
  const error = params.get('error_description') || params.get('error');
  if (error) {
    auth.linkError = params.get('error_code') === 'otp_expired' || /expired|invalid/i.test(error)
      ? 'Ce lien n’est plus valable (il a expiré ou a déjà servi). Demandez-en un nouveau avec « Mot de passe oublié ? ».'
      : `Lien refusé : ${error}`;
    // Le client ne traite pas ces erreurs : on nettoie l'adresse nous-mêmes.
    history.replaceState(history.state, '', `${location.pathname}${location.search}`);
  }
}

function createClient() {
  const cfg = window.SAM_CONFIG || {};
  if (!cfg.supabaseUrl || !cfg.supabaseKey || !window.supabase?.createClient) return null;
  return window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'implicit',
      storageKey: 'samOutils-auth'
    }
  });
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Délai dépassé')), ms))
  ]);
}

async function checkAdmin() {
  if (!auth.client || !auth.user) return false;
  try {
    const { data, error } = await withTimeout(auth.client.rpc('is_sam_admin'), 8000);
    if (error) {
      console.warn('Vérification administrateur impossible', error);
      return false;
    }
    return data === true;
  } catch (error) {
    console.warn('Vérification administrateur impossible', error);
    return false;
  }
}

async function applySession(session) {
  const previousId = auth.user?.id || null;
  const previousAdmin = auth.isAdmin;
  auth.user = session?.user || null;
  auth.isAdmin = auth.user ? await checkAdmin() : false;
  auth.ready = true;
  if (previousId !== (auth.user?.id || null) || previousAdmin !== auth.isAdmin) {
    emitter.emit(auth);
  }
}

export async function initAuth() {
  readAuthLink();
  auth.client = createClient();
  auth.configured = Boolean(auth.client);
  if (!auth.client) {
    auth.ready = true;
    return auth;
  }
  try {
    const { data } = await auth.client.auth.getSession();
    await applySession(data?.session || null);
  } catch (error) {
    console.warn('Session Supabase illisible', error);
    auth.ready = true;
  }
  auth.client.auth.onAuthStateChange((event, session) => {
    // On sort de la callback avant tout appel Supabase (recommandation supabase-js).
    if (event === 'INITIAL_SESSION') return;
    if (event === 'PASSWORD_RECOVERY') auth.linkType = 'recovery';
    setTimeout(() => applySession(session), 0);
  });
  return auth;
}

export async function signIn(email, password) {
  if (!auth.client) throw new Error('Connexion indisponible : Supabase n’est pas configuré.');
  const { data, error } = await auth.client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  await applySession(data.session);
  return auth;
}

export async function signOut() {
  if (!auth.client) return;
  try {
    await auth.client.auth.signOut();
  } finally {
    await applySession(null);
  }
}

/** Envoie le mail « mot de passe oublié » ; le lien ramène sur cette page. */
export async function sendPasswordReset(email) {
  if (!auth.client) throw new Error('Connexion indisponible : Supabase n’est pas configuré.');
  const redirectTo = `${window.location.origin}${window.location.pathname}`;
  const { error } = await auth.client.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw error;
}

/** Nouveau mot de passe pour le compte connecté (lien reçu par mail ou page profil). */
export async function updatePassword(password) {
  if (!auth.client) throw new Error('Connexion indisponible : Supabase n’est pas configuré.');
  const { error } = await auth.client.auth.updateUser({ password });
  if (error) throw error;
  auth.linkType = null;
}

/** Message lisible pour les erreurs de connexion Supabase. */
export function authErrorMessage(error) {
  const text = error?.message || String(error || '');
  if (/invalid login|invalid credentials/i.test(text)) return 'Adresse mail ou mot de passe incorrect.';
  if (/email not confirmed/i.test(text)) return 'Ce compte n’est pas encore confirmé : contactez SudExpé.';
  if (/rate limit|too many/i.test(text)) return 'Trop de tentatives : réessayez dans quelques minutes.';
  if (/should be different|same.*password/i.test(text)) return 'Choisissez un mot de passe différent de l’ancien.';
  if (/password.*(at least|characters|weak|short)/i.test(text)) return 'Mot de passe trop court ou trop simple (8 caractères au moins).';
  if (/failed to fetch|network/i.test(text)) return 'Pas de connexion internet.';
  return text;
}
