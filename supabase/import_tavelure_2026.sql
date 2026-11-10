-- SAM Outils · Tavelure : projections 2026 du capteur Marchi (fichier « Suivi du Marchi 2026 »).
-- Une ligne par jour de projection : spores du jour (colonne « Nombre de spores projetées Marchi »),
-- heure des premières spores du jour, pluie du jour (station CEHM, feuille RIMpro).
-- Relançable sans doublon. À coller dans Supabase > SQL Editor > New query, puis Run.
insert into public.tavelure_comptages (episode, date_obs, heure_obs, pluie_mm, spores, statut, comptage_termine)
select v.episode, v.date_obs, v.heure_obs, v.pluie_mm, v.spores, v.statut, true
from (values
  ('Session 1', date '2026-02-12', time '12:30', 0.2, 116, 'Pas de contamination'),
  ('Session 2', date '2026-03-02', time '13:30', 0.2, 118, 'Pas de contamination'),
  ('Session 3', date '2026-03-06', time '11:00', 4.2, 334, 'Validé'),
  ('Session 3', date '2026-03-07', time '01:00', 8.0, 4306, 'Validé'),
  ('Session 3', date '2026-03-08', time '13:00', 30.6, 1225, 'Validé'),
  ('Session 3', date '2026-03-09', time '11:00', 54.4, 3570, 'Validé'),
  ('Session 3', date '2026-03-10', time '11:00', 1.4, 122, 'Validé'),
  ('Session 4', date '2026-03-11', time '17:00', 0.8, 268, 'Validé'),
  ('Session 4', date '2026-03-14', time '19:00', 12.8, 129, 'Validé'),
  ('Session 4', date '2026-03-15', time '09:00', 0.0, 600, 'Validé'),
  ('Session 5', date '2026-03-22', time '09:00', 15.4, 1307, 'Validé'),
  ('Session 6', date '2026-04-12', time '16:30', 2.6, 1033, 'Validé'),
  ('Session 6', date '2026-04-13', time '09:30', 8.4, 2962, 'Validé'),
  ('Session 7', date '2026-04-22', time '11:00', 0.8, 607, 'Validé'),
  ('Session 8', date '2026-05-04', time '00:50', 105.2, 23, 'Validé')
) as v(episode, date_obs, heure_obs, pluie_mm, spores, statut)
where not exists (
  select 1 from public.tavelure_comptages c where c.episode = v.episode and c.date_obs = v.date_obs
);

select count(*) as jours_de_projection, sum(spores) as spores_total
from public.tavelure_comptages where date_obs between '2026-01-01' and '2026-12-31';
