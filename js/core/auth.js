// Client Supabase partagé + état de connexion (utilisateur, droits administrateur).
import { createEmitter } from './util.js';

const emitter = createEmitter();

export const auth = {
  client: null,
  user: null,
  isAdmin: false,
  ready: false,
  configured: false,
  onChange: fn => emitter.on(fn)
};

function createClient() {
  const cfg = window.SAM_CONFIG || {};
  if (!cfg.supabaseUrl || !cfg.supabaseKey || !window.supabase?.createClient) return null;
  return window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
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
  await auth.client.auth.signOut();
  await applySession(null);
}
