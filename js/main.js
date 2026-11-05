// Point d'entrée de SAM Outils.
import { initAuth } from './core/auth.js';
import { startShell } from './core/shell.js';

async function boot() {
  // La session est lue avant le premier affichage pour que les outils
  // démarrent directement dans le bon mode (consultation / administrateur).
  try {
    await initAuth();
  } catch (error) {
    console.warn('Initialisation de la connexion impossible', error);
  }
  startShell();
}

boot();
