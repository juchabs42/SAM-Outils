// Point d'entrée de SAM Outils : connexion obligatoire, puis l'application.
import { auth, initAuth } from './core/auth.js';
import { runGate } from './core/gate.js';
import { startShell } from './core/shell.js';

async function boot() {
  try {
    await initAuth();
  } catch (error) {
    console.warn('Initialisation de la connexion impossible', error);
  }

  if (!auth.configured) {
    await runGate({ message: 'Connexion indisponible : configuration Supabase absente.' });
  } else if (auth.user && ['recovery', 'invite', 'signup'].includes(auth.linkType)) {
    // Lien reçu par mail (invitation ou mot de passe oublié) : choisir son mot de passe.
    await runGate({ mode: 'password' });
  } else if (!auth.user) {
    await runGate({ message: auth.linkError || '' });
  }

  startShell();

  // Session terminée (déconnexion, compte supprimé…) : retour à l'écran de connexion.
  auth.onChange(() => {
    if (!auth.user) window.location.reload();
  });
}

boot();
