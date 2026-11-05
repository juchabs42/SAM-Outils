# SAM Outils — Sud Agro Météo (prototype)

Application unique qui regroupe les six outils SAM :

| Outil | Données | Accès |
|---|---|---|
| Indicateurs agroclimatiques | Open-Meteo | libre |
| Programmation irrigation | Open-Meteo | libre |
| Bilan hydrique | Open-Meteo + parcelles | libre ; parcelles sur l'appareil, ou dans Supabase si connecté |
| Suivi phénologique | Supabase + Open-Meteo | lecture libre, saisie administrateur |
| Tavelure | Supabase | lecture libre, saisie administrateur |
| Piégeage | Supabase | lecture libre, saisie administrateur |

Site statique (HTML, CSS, JavaScript sans compilation), publié avec GitHub Pages.

## Mise en route Supabase (une seule fois)

1. **SQL Editor** : coller et exécuter `supabase/schema.sql`.
2. **Authentication → Sign In / Providers** : désactiver *Allow new users to sign up*.
3. **Authentication → Users → Add user → Create new user** : créer chaque compte avec *Auto Confirm User* coché.
4. Ajouter chaque collègue administrateur :
   `insert into public.sam_admins (email) values ('prenom.nom@sudexpe.net');`

La clé utilisée dans `config.js` est la clé *publishable* : elle est faite pour être publique.
Ne jamais y mettre la clé *secret* / *service_role*.

## Organisation

```
index.html            cadre (barre latérale, barre du haut, cartes outils, filtres)
config.js             URL et clé publique Supabase
css/app.css           styles du cadre
css/tools/*.css       styles de chaque outil (limités à leur conteneur)
js/core/*.js          connexion, lieux, période, navigation
js/tools/*.js         un module par outil
supabase/schema.sql   tables, droits et règles d'accès
service-worker.js     fonctionnement hors connexion
```

## Mise à jour

Les fichiers sont servis tels quels : une modification poussée sur `main` est en ligne
après le redéploiement GitHub Pages (1 à 2 minutes). Le service worker recharge
automatiquement la dernière version quand l'appareil est connecté.
