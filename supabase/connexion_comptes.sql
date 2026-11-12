-- =============================================================================
-- SAM Outils — connexion obligatoire, profils, stations favorites, RIMpro,
-- échelle d'intensité des projections de tavelure.
-- -----------------------------------------------------------------------------
-- À coller dans Supabase > SQL Editor > New query, puis Run.
-- Relançable sans risque : rien n'est supprimé.
--
-- Effet
--   • Plus aucune lecture sans compte : tout le site demande une connexion.
--   • Tous les comptes lisent ; seuls les comptes de public.sam_admins écrivent.
--   • Chaque compte a une fiche « profil » (nom, structure…) et ses stations
--     favorites, visibles par lui seul (et par les administrateurs).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Lecture réservée aux comptes connectés
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
  tables text[] := array[
    'pheno_parcels', 'pheno_observations',
    'tavelure_peritheces', 'tavelure_comptages', 'tavelure_parametres',
    'piegeage_species', 'piegeage_campaigns', 'piegeage_campaign_species',
    'piegeage_parcels', 'piegeage_campaign_parcels', 'piegeage_traps',
    'piegeage_trap_events', 'piegeage_observations_v2', 'piegeage_observation_details',
    'piegeage_interventions', 'piegeage_intervention_parcels'
  ];
  archived_tables text[] := array[
    'piegeage_campaigns', 'piegeage_parcels', 'piegeage_traps',
    'piegeage_trap_events', 'piegeage_observations_v2', 'piegeage_interventions'
  ];
  read_rule text;
begin
  foreach t in array tables loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    if t = 'piegeage_species' then
      read_rule := '(active and archived_at is null) or (select public.is_sam_admin())';
    elsif t = any (archived_tables) then
      read_rule := 'archived_at is null or (select public.is_sam_admin())';
    else
      read_rule := 'true';
    end if;
    execute format('drop policy if exists "%1$s lecture publique" on public.%1$I', t);
    execute format('drop policy if exists "%1$s lecture comptes" on public.%1$I', t);
    execute format('create policy "%1$s lecture comptes" on public.%1$I for select to authenticated using (%2$s)', t, read_rule);
    execute format('revoke select on public.%I from anon', t);
  end loop;
end $$;

-- Stations du réseau SAM
do $$
begin
  if to_regclass('public.stations') is not null then
    drop policy if exists stations_lecture on public.stations;
    create policy stations_lecture on public.stations
      for select to authenticated using (publique or (select public.is_sam_admin()));

    drop policy if exists station_mesures_lecture on public.station_mesures;
    create policy station_mesures_lecture on public.station_mesures
      for select to authenticated using (
        exists (select 1 from public.stations s where s.id = station_id and (s.publique or (select public.is_sam_admin())))
      );

    drop policy if exists station_capteurs_lecture on public.station_capteurs;
    create policy station_capteurs_lecture on public.station_capteurs
      for select to authenticated using (true);

    revoke select on public.stations, public.station_mesures, public.station_capteurs from anon;
    if to_regclass('public.station_journalier') is not null then
      revoke select on public.station_journalier from anon;
    end if;
  end if;
end $$;

revoke execute on function public.is_sam_admin() from anon;

-- -----------------------------------------------------------------------------
-- 2. Profils (informations personnelles et stations favorites)
-- -----------------------------------------------------------------------------
create table if not exists public.profils (
  id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  prenom text,
  nom text,
  structure text,
  fonction text,
  telephone text,
  commune text,
  stations_favorites text[] not null default '{}',
  updated_at timestamptz not null default now()
);

alter table public.profils enable row level security;
revoke all on public.profils from anon;
grant select, insert, update on public.profils to authenticated;

drop policy if exists profils_lecture on public.profils;
create policy profils_lecture on public.profils
  for select to authenticated using (id = (select auth.uid()) or (select public.is_sam_admin()));
drop policy if exists profils_ajout on public.profils;
create policy profils_ajout on public.profils
  for insert to authenticated with check (id = (select auth.uid()));
drop policy if exists profils_maj on public.profils;
create policy profils_maj on public.profils
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- 3. RIMpro : identifiant de la station chez RIMpro (onglet Maladies / ravageurs)
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.stations') is not null then
    alter table public.stations add column if not exists rimpro_id text;
    update public.stations s set rimpro_id = v.rimpro
    from (values
      ('TCSD_5880', 'yyNR4nw'),  -- Mas de Carthagène
      ('TCSD_5881', 'KFNYMs6'),  -- Marsillargues Marseillais Nord 1
      ('TCSD_5882', 'Fbe2NVT'),  -- Pont-Saint-Esprit
      ('TCSD_5883', 'fN2WPhc'),  -- Saint-Just Hauteur
      ('TCSD_5884', 'DkXfTA6'),  -- Candillargues Cevelous
      ('TCSD_5885', 'OAiC7Tr'),  -- Mornas
      ('TCSD_5886', 'aViDx1q'),  -- Mondragon
      ('TCSD_5887', 'jUVJZ8w'),  -- Mas de la Vierge
      ('TCSD_5888', 'Cko9GGn'),  -- Mas de la Plaine
      ('TCSD_5890', 'gEPodp1')   -- Le Loup
    ) as v(id, rimpro)
    where s.id = v.id and s.rimpro_id is null;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 4. Tavelure : échelle d'intensité des projections (spores par relevé)
-- -----------------------------------------------------------------------------
alter table public.tavelure_parametres add column if not exists seuil_moyen integer not null default 500;
alter table public.tavelure_parametres add column if not exists seuil_fort integer not null default 2000;
alter table public.tavelure_comptages alter column statut set default 'Validé';

notify pgrst, 'reload schema';

-- Contrôle : aucune ligne ne doit être lisible sans compte.
select
  (select count(*) from pg_policies where schemaname = 'public' and 'anon' = any (roles)) as politiques_sans_compte,
  (select count(*) from public.stations where rimpro_id is not null) as stations_rimpro,
  (select count(*) from public.profils) as profils;
