// =============================================================================
// SAM Outils · Fonction Supabase « sam-admin » : gestion des comptes
// -----------------------------------------------------------------------------
// Utilisée par l'onglet « Administration » du site (administrateurs SAM uniquement) :
// liste des comptes, invitation, droits administrateur, suspension, suppression.
//
// Déploiement (une seule fois) : Supabase > Edge Functions > Deploy a new function >
// Via Editor, nom « sam-admin », coller ce fichier, Deploy. Puis, dans les réglages de
// la fonction, désactiver « Verify JWT » : la fonction vérifie elle-même le compte
// appelant (connexion + présence dans public.sam_admins).
//
// La clé d'administration (service_role / secret) est fournie automatiquement par
// Supabase à la fonction : elle n'apparaît ni dans le site, ni sur GitHub.
// =============================================================================
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

class Refus extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// Clé d'administration : clé « service_role » historique, ou nouvelle clé secrète.
function adminKey(): string {
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (legacy) return legacy;
  try {
    const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}');
    const first = Object.values(keys)[0];
    if (typeof first === 'string') return first;
  } catch { /* ignoré */ }
  throw new Refus('Clé d\'administration Supabase introuvable pour la fonction.', 500);
}

const text = (value: unknown, max = 160) =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    if (req.method !== 'POST') throw new Refus('Méthode non autorisée.', 405);
    const url = Deno.env.get('SUPABASE_URL');
    if (!url) throw new Refus('Adresse Supabase introuvable.', 500);
    const admin = createClient(url, adminKey(), { auth: { persistSession: false, autoRefreshToken: false } });

    // 1. Compte appelant : connecté, adresse confirmée, inscrit dans sam_admins.
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: who, error: whoError } = await admin.auth.getUser(jwt);
    const me = who?.user;
    if (whoError || !me?.email || !me.email_confirmed_at) throw new Refus('Connexion requise.', 401);
    const myEmail = me.email.toLowerCase();
    const { data: isAdmin, error: adminError } = await admin.from('sam_admins').select('email').eq('email', myEmail).maybeSingle();
    if (adminError) throw adminError;
    if (!isAdmin) throw new Refus('Réservé aux administrateurs SAM.', 403);

    // 2. Action demandée
    const body = await req.json().catch(() => ({}));
    switch (body?.action) {
      case 'list': return reply({ accounts: await listAccounts(admin) });
      case 'invite': return reply(await invite(admin, body));
      case 'reinvite': return reply(await reinvite(admin, body));
      case 'setAdmin': return reply(await setAdmin(admin, body, myEmail));
      case 'suspend': return reply(await suspend(admin, body, me.id));
      case 'delete': return reply(await remove(admin, body, me.id));
      default: throw new Refus('Action inconnue.');
    }
  } catch (error) {
    const status = error instanceof Refus ? error.status : 400;
    const message = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error);
    return reply({ error: message }, status);
  }
});

// deno-lint-ignore no-explicit-any
type Admin = any;

async function allUsers(admin: Admin) {
  const users = [];
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 1000) break;
  }
  return users;
}

async function listAccounts(admin: Admin) {
  const [users, admins, profiles] = await Promise.all([
    allUsers(admin),
    admin.from('sam_admins').select('email'),
    admin.from('profils').select('id,prenom,nom,structure,fonction,telephone,commune')
  ]);
  if (admins.error) throw admins.error;
  const adminSet = new Set((admins.data ?? []).map((a: { email: string }) => a.email));
  // La table des profils peut ne pas encore exister : les comptes restent listés.
  const byId = new Map((profiles.error ? [] : profiles.data ?? []).map((p: { id: string }) => [p.id, p]));
  const now = Date.now();
  return users.map((u: Admin) => {
    const p: Admin = byId.get(u.id) ?? {};
    const meta = u.user_metadata ?? {};
    return {
      id: u.id,
      email: u.email ?? '',
      created_at: u.created_at ?? null,
      invited_at: u.invited_at ?? null,
      last_sign_in_at: u.last_sign_in_at ?? null,
      confirmed: Boolean(u.email_confirmed_at),
      banned: Boolean(u.banned_until && new Date(u.banned_until).getTime() > now),
      admin: adminSet.has(String(u.email ?? '').toLowerCase()),
      prenom: p.prenom ?? meta.prenom ?? null,
      nom: p.nom ?? meta.nom ?? null,
      structure: p.structure ?? meta.structure ?? null,
      fonction: p.fonction ?? meta.fonction ?? null,
      telephone: p.telephone ?? meta.telephone ?? null,
      commune: p.commune ?? null
    };
  }).sort((a: Admin, b: Admin) => a.email.localeCompare(b.email));
}

async function invite(admin: Admin, body: Admin) {
  const email = String(body.email ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Refus('Adresse mail invalide.');
  const profile = {
    prenom: text(body.prenom), nom: text(body.nom), structure: text(body.structure),
    fonction: text(body.fonction), telephone: text(body.telephone, 40)
  };
  const redirectTo = typeof body.redirectTo === 'string' && /^https:\/\//.test(body.redirectTo) ? body.redirectTo : undefined;
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo, data: profile });
  if (error) {
    if (/already|exist|registered/i.test(error.message)) throw new Refus('Un compte existe déjà avec cette adresse.');
    throw error;
  }
  const id = data.user.id;
  await admin.from('profils').upsert({ id, ...profile, updated_at: new Date().toISOString() });
  if (body.admin === true) {
    const { error: e2 } = await admin.from('sam_admins').upsert({ email });
    if (e2) throw e2;
  }
  return { ok: true, id };
}

// Nouvel envoi du mail d'invitation (compte pas encore activé).
async function reinvite(admin: Admin, body: Admin) {
  const email = String(body.email ?? '').trim().toLowerCase();
  if (!email) throw new Refus('Adresse manquante.');
  const redirectTo = typeof body.redirectTo === 'string' && /^https:\/\//.test(body.redirectTo) ? body.redirectTo : undefined;
  const { error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
  if (error) throw error;
  return { ok: true };
}

async function setAdmin(admin: Admin, body: Admin, myEmail: string) {
  const email = String(body.email ?? '').trim().toLowerCase();
  if (!email) throw new Refus('Adresse manquante.');
  if (body.admin === true) {
    const { error } = await admin.from('sam_admins').upsert({ email });
    if (error) throw error;
  } else {
    if (email === myEmail) throw new Refus('Vous ne pouvez pas retirer vos propres droits d\'administrateur.');
    const { error } = await admin.from('sam_admins').delete().eq('email', email);
    if (error) throw error;
  }
  return { ok: true };
}

async function suspend(admin: Admin, body: Admin, myId: string) {
  if (!body.id) throw new Refus('Compte manquant.');
  if (body.id === myId) throw new Refus('Vous ne pouvez pas suspendre votre propre compte.');
  const { error } = await admin.auth.admin.updateUserById(body.id, { ban_duration: body.suspended ? '876000h' : 'none' });
  if (error) throw error;
  return { ok: true };
}

async function remove(admin: Admin, body: Admin, myId: string) {
  if (!body.id) throw new Refus('Compte manquant.');
  if (body.id === myId) throw new Refus('Vous ne pouvez pas supprimer votre propre compte.');
  const { data } = await admin.auth.admin.getUserById(body.id);
  const { error } = await admin.auth.admin.deleteUser(body.id);
  if (error) throw error;
  const email = String(data?.user?.email ?? '').toLowerCase();
  if (email) await admin.from('sam_admins').delete().eq('email', email);
  return { ok: true };
}
