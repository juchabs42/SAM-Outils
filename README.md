# SAM Outils — Sud Agro Météo (prototype)

Application unique qui regroupe les six outils SAM et les données des stations du réseau.
**La connexion est obligatoire** : les comptes sont créés dans Supabase par SudExpé.

| Outil | Données | Accès (compte connecté) |
|---|---|---|
| Données (stations du réseau) | Supabase (collecte Comsag) + RIMpro | lecture ; fiche station administrateur |
| Cartographie (stations du réseau) | Supabase + fonds IGN Géoplateforme | lecture ; un clic ouvre les données de la station |
| Indicateurs agroclimatiques | Open-Meteo | lecture |
| Programmation irrigation | Open-Meteo | lecture |
| Bilan hydrique | Open-Meteo + parcelles | parcelles du compte (privées) |
| Suivi phénologique | Supabase + Open-Meteo | lecture, saisie administrateur |
| Tavelure | Supabase | lecture, saisie administrateur |
| Piégeage | Supabase | lecture, saisie administrateur |

Site statique (HTML, CSS, JavaScript sans compilation), publié avec GitHub Pages.

## Mise en route Supabase (une seule fois)

1. **SQL Editor** : coller et exécuter `supabase/schema.sql`, `supabase/stations.sql`
   puis `supabase/connexion_comptes.sql` (lecture réservée aux comptes, profils, RIMpro).
2. **Authentication → Sign In / Providers** : désactiver *Allow new users to sign up*.
3. **Authentication → URL Configuration** : *Site URL* = adresse du site
   (`https://juchabs42.github.io/SAM-Outils/`), ajoutée aussi aux *Redirect URLs*
   (liens « mot de passe oublié » et invitations).
4. **Authentication → Users → Add user** : *Send invitation* (la personne choisit son
   mot de passe) ou *Create new user* avec *Auto Confirm User* coché.
5. Administrateurs (saisie) : ajouter l'adresse dans la table `sam_admins`
   (`insert into public.sam_admins (email) values ('prenom.nom@sudexpe.net');`).

La clé utilisée dans `config.js` est la clé *publishable* : elle est faite pour être publique.
Ne jamais y mettre la clé *secret* / *service_role*.

## Organisation

```
index.html            cadre (écran de connexion, bandeau des stations, barre du haut, cartes outils, filtres)
config.js             URL et clé publique Supabase
css/app.css           styles du cadre
css/tools/*.css       styles de chaque outil (limités à leur conteneur)
js/core/*.js          connexion, profil, stations, lieux, période, navigation
js/tools/*.js         un module par outil
supabase/*.sql        tables, droits et règles d'accès, collecte des stations, imports
service-worker.js     fonctionnement hors connexion
```

## Mise à jour

Les fichiers sont servis tels quels : une modification poussée sur `main` est en ligne
après le redéploiement GitHub Pages (1 à 2 minutes). Le service worker recharge
automatiquement la dernière version quand l'appareil est connecté.
