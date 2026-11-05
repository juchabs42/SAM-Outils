-- =============================================================================
-- SAM Outils — schéma Supabase unifié (prototype)
-- -----------------------------------------------------------------------------
-- À exécuter UNE FOIS dans Supabase > SQL Editor > New query > Run.
-- Le script peut être relancé sans risque : il ne supprime aucune donnée.
--
-- Principe des accès
--   • Lecture publique (sans compte) : phénologie, tavelure, piégeage.
--   • Écriture : uniquement les comptes listés dans public.sam_admins
--     (un seul rôle administrateur pour les trois outils, qui peut aussi
--     modifier les saisies des autres administrateurs).
--   • Bilan hydrique : sans compte, les parcelles restent sur l'appareil ;
--     avec un compte, elles sont enregistrées ici et visibles par leur seul
--     propriétaire.
--
-- Après exécution
--   1. Authentication > Sign In / Providers : désactiver « Allow new users to
--      sign up » (les comptes sont créés uniquement par toi).
--   2. Authentication > Users > Add user > Create new user : créer chaque
--      compte avec « Auto Confirm User » coché.
--   3. Ajouter l'adresse de chaque collègue administrateur dans sam_admins
--      (voir la fin de ce fichier).
-- =============================================================================

create extension if not exists pgcrypto;

-- =============================================================================
-- 1. Administrateurs
-- =============================================================================
create table if not exists public.sam_admins (
  email text primary key check (email = lower(email)),
  added_at timestamptz not null default now()
);

alter table public.sam_admins enable row level security;
-- Aucune politique : la liste n'est ni lisible ni modifiable depuis le site.
-- Elle se gère uniquement ici (SQL Editor) ou dans Table Editor.

create or replace function public.is_sam_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from auth.users u
    join public.sam_admins a on a.email = lower(u.email)
    where u.id = auth.uid()
      and u.email_confirmed_at is not null
  );
$$;

revoke all on function public.is_sam_admin() from public;
grant execute on function public.is_sam_admin() to anon, authenticated;

insert into public.sam_admins (email)
values ('jchabat@sudexpe.net')
on conflict (email) do nothing;

-- =============================================================================
-- 2. Bilan hydrique — parcelles privées par compte
--    (nappe Hub'Eau et remontées capillaires retirées)
-- =============================================================================
create table if not exists public.bilan_parcels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  location_name text not null,
  latitude double precision not null,
  longitude double precision not null,
  area_ha numeric not null check (area_ha > 0),
  clay_pct numeric not null check (clay_pct >= 0 and clay_pct <= 100),
  silt_pct numeric not null check (silt_pct >= 0 and silt_pct <= 100),
  sand_pct numeric not null check (sand_pct >= 0 and sand_pct <= 100),
  soil_class text not null,
  rum_mm_cm numeric not null check (rum_mm_cm > 0),
  root_depth_cm numeric not null check (root_depth_cm > 0),
  ru_mm numeric not null check (ru_mm > 0),
  p_factor numeric not null default 0.5 check (p_factor > 0 and p_factor < 1),
  rfu_mm numeric not null check (rfu_mm > 0),
  irrigation_system text not null default 'drip',
  ground_cover boolean not null default false,
  harvest_date date,
  use_custom_kc boolean not null default false,
  kc_initial numeric not null,
  kc_mid numeric not null,
  kc_peak numeric not null default 0.80,
  kc_end numeric not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bilan_irrigations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  parcel_id uuid not null references public.bilan_parcels(id) on delete cascade,
  irrigation_date date not null,
  amount_mm numeric not null check (amount_mm >= 0),
  series_id uuid,
  repeat_interval_days integer,
  series_start_date date,
  series_end_date date,
  created_at timestamptz not null default now()
);

create table if not exists public.bilan_rain_corrections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  parcel_id uuid not null references public.bilan_parcels(id) on delete cascade,
  rain_date date not null,
  amount_mm numeric not null check (amount_mm >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (parcel_id, rain_date)
);

create index if not exists bilan_parcels_user_idx on public.bilan_parcels (user_id);
create index if not exists bilan_irrigations_parcel_date_idx on public.bilan_irrigations (parcel_id, irrigation_date);
create index if not exists bilan_rain_parcel_date_idx on public.bilan_rain_corrections (parcel_id, rain_date);

alter table public.bilan_parcels enable row level security;
alter table public.bilan_irrigations enable row level security;
alter table public.bilan_rain_corrections enable row level security;

grant select, insert, update, delete on public.bilan_parcels, public.bilan_irrigations, public.bilan_rain_corrections to authenticated;

do $$
declare t text;
begin
  foreach t in array array['bilan_parcels', 'bilan_irrigations', 'bilan_rain_corrections'] loop
    execute format('drop policy if exists "%1$s propriétaire" on public.%1$I', t);
    execute format(
      'create policy "%1$s propriétaire" on public.%1$I for all to authenticated
         using ((select auth.uid()) = user_id)
         with check ((select auth.uid()) = user_id)', t);
  end loop;
end $$;

-- =============================================================================
-- 3. Phénologie
-- =============================================================================
create table if not exists public.pheno_parcels (
  id text primary key,
  exploitation text not null,
  name text not null,
  variety text not null,
  custom_variety_name text,
  stage_c_date date,
  base_temp double precision not null default 5,
  weather_location_name text not null default 'Marsillargues',
  weather_admin1 text,
  weather_country text default 'France',
  latitude double precision not null default 43.6343,
  longitude double precision not null default 4.1706,
  elevation double precision,
  timezone text default 'Europe/Paris',
  updated_at timestamptz not null default now()
);

create table if not exists public.pheno_observations (
  id bigint generated by default as identity primary key,
  parcel_id text not null references public.pheno_parcels(id) on delete cascade,
  obs_date date not null,
  stage text not null,
  bud_percentage integer not null default 50 check (bud_percentage in (25, 50, 75)),
  updated_at timestamptz not null default now(),
  unique (parcel_id, obs_date, stage, bud_percentage)
);

-- =============================================================================
-- 4. Tavelure
-- =============================================================================
create table if not exists public.tavelure_peritheces (
  stade smallint primary key check (stade between 1 and 7),
  date_obs date null,
  updated_at timestamptz not null default now()
);

insert into public.tavelure_peritheces (stade, date_obs)
select s, null from generate_series(1, 7) as s
on conflict (stade) do nothing;

create table if not exists public.tavelure_comptages (
  id bigint generated by default as identity primary key,
  episode text not null,
  date_obs date not null,
  heure_obs time not null,
  pluie_mm numeric(8, 2) not null default 0,
  spores integer null,
  statut text not null check (statut in ('En cours', 'Validé', 'Pas de contamination')),
  comptage_termine boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.tavelure_parametres (
  id smallint primary key default 1 check (id = 1),
  suivi_termine boolean not null default false,
  date_fin date null,
  updated_at timestamptz not null default now()
);

insert into public.tavelure_parametres (id, suivi_termine, date_fin)
values (1, false, null)
on conflict (id) do nothing;

-- =============================================================================
-- 5. Piégeage (structure identique à l'ancienne base « V2 », pour la migration)
-- =============================================================================
create table if not exists public.piegeage_species (
  id uuid primary key default gen_random_uuid(),
  code text,
  scientific_name text not null,
  common_name text,
  active boolean not null default true,
  archived_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.piegeage_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  year integer not null,
  pest_label text not null default '',
  protocol_type text not null default 'simple',
  start_date date,
  end_date date,
  legacy_key text,
  archived_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.piegeage_campaign_species (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.piegeage_campaigns(id) on delete cascade,
  species_id uuid not null references public.piegeage_species(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.piegeage_parcels (
  id uuid primary key default gen_random_uuid(),
  exploitation text not null default '',
  name text not null,
  variety text,
  area_ha numeric,
  archived_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.piegeage_campaign_parcels (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.piegeage_campaigns(id) on delete cascade,
  parcel_id uuid not null references public.piegeage_parcels(id) on delete cascade,
  modality text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.piegeage_traps (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.piegeage_campaigns(id) on delete cascade,
  parcel_id uuid not null references public.piegeage_parcels(id) on delete cascade,
  code text not null,
  trap_type text,
  row_ref text,
  position text,
  installed_on date,
  removed_on date,
  attractant text,
  comment text,
  latitude double precision,
  longitude double precision,
  archived_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.piegeage_trap_events (
  id uuid primary key default gen_random_uuid(),
  trap_id uuid not null references public.piegeage_traps(id) on delete cascade,
  event_date date not null,
  event_type text not null,
  label text,
  comment text,
  archived_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.piegeage_observations_v2 (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.piegeage_campaigns(id) on delete cascade,
  trap_id uuid not null references public.piegeage_traps(id) on delete restrict,
  observed_on date not null,
  total_captured integer not null default 0 check (total_captured >= 0),
  identification_status text,
  comment text,
  legacy_source_id text,
  archived_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.piegeage_observation_details (
  id uuid primary key default gen_random_uuid(),
  observation_id uuid not null references public.piegeage_observations_v2(id) on delete cascade,
  species_id uuid not null references public.piegeage_species(id) on delete cascade,
  males integer not null default 0,
  females integer not null default 0,
  undetermined integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.piegeage_interventions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.piegeage_campaigns(id) on delete cascade,
  intervention_date date not null,
  intervention_time time,
  intervention_type text not null,
  product text,
  dose text,
  target text,
  comment text,
  archived_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.piegeage_intervention_parcels (
  id uuid primary key default gen_random_uuid(),
  intervention_id uuid not null references public.piegeage_interventions(id) on delete cascade,
  parcel_id uuid not null references public.piegeage_parcels(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists piegeage_traps_campaign_idx on public.piegeage_traps (campaign_id, parcel_id);
create index if not exists piegeage_obs_campaign_idx on public.piegeage_observations_v2 (campaign_id, trap_id, observed_on);
create index if not exists piegeage_details_obs_idx on public.piegeage_observation_details (observation_id);
create index if not exists piegeage_events_trap_idx on public.piegeage_trap_events (trap_id);

-- Suppression définitive d'un élément déjà archivé (réservée aux administrateurs).
create or replace function public.sam_piegeage_delete_archived(p_entity text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_archived timestamptz;
begin
  if not public.is_sam_admin() then
    raise exception 'Connexion administrateur requise.';
  end if;

  case p_entity
    when 'observation' then
      select archived_at into v_archived from public.piegeage_observations_v2 where id = p_id;
      if v_archived is null then raise exception 'Le relevé doit être archivé avant sa suppression définitive.'; end if;
      delete from public.piegeage_observations_v2 where id = p_id;

    when 'intervention' then
      select archived_at into v_archived from public.piegeage_interventions where id = p_id;
      if v_archived is null then raise exception 'L''intervention doit être archivée avant sa suppression définitive.'; end if;
      delete from public.piegeage_interventions where id = p_id;

    when 'trap_event' then
      select archived_at into v_archived from public.piegeage_trap_events where id = p_id;
      if v_archived is null then raise exception 'L''événement doit être archivé avant sa suppression définitive.'; end if;
      delete from public.piegeage_trap_events where id = p_id;

    when 'trap' then
      select archived_at into v_archived from public.piegeage_traps where id = p_id;
      if v_archived is null then raise exception 'Le piège doit être archivé avant sa suppression définitive.'; end if;
      delete from public.piegeage_observations_v2 where trap_id = p_id;
      delete from public.piegeage_traps where id = p_id;

    when 'parcel' then
      select archived_at into v_archived from public.piegeage_parcels where id = p_id;
      if v_archived is null then raise exception 'La parcelle doit être archivée avant sa suppression définitive.'; end if;
      delete from public.piegeage_observations_v2
        where trap_id in (select id from public.piegeage_traps where parcel_id = p_id);
      delete from public.piegeage_traps where parcel_id = p_id;
      delete from public.piegeage_parcels where id = p_id;

    when 'campaign' then
      select archived_at into v_archived from public.piegeage_campaigns where id = p_id;
      if v_archived is null then raise exception 'La campagne doit être archivée avant sa suppression définitive.'; end if;
      delete from public.piegeage_observations_v2 where campaign_id = p_id;
      delete from public.piegeage_traps where campaign_id = p_id;
      delete from public.piegeage_campaigns where id = p_id;

    when 'species' then
      select archived_at into v_archived from public.piegeage_species where id = p_id;
      if v_archived is null then raise exception 'L''espèce doit être archivée avant sa suppression définitive.'; end if;
      delete from public.piegeage_observation_details where species_id = p_id;
      delete from public.piegeage_campaign_species where species_id = p_id;
      delete from public.piegeage_species where id = p_id;

    else
      raise exception 'Type d''archive non reconnu : %', p_entity;
  end case;
end;
$$;

revoke all on function public.sam_piegeage_delete_archived(text, uuid) from public, anon;
grant execute on function public.sam_piegeage_delete_archived(text, uuid) to authenticated;

-- =============================================================================
-- 6. Droits et politiques : lecture publique, écriture administrateurs
-- =============================================================================
do $$
declare
  t text;
  public_tables text[] := array[
    'pheno_parcels', 'pheno_observations',
    'tavelure_peritheces', 'tavelure_comptages', 'tavelure_parametres',
    'piegeage_species', 'piegeage_campaigns', 'piegeage_campaign_species',
    'piegeage_parcels', 'piegeage_campaign_parcels', 'piegeage_traps',
    'piegeage_trap_events', 'piegeage_observations_v2', 'piegeage_observation_details',
    'piegeage_interventions', 'piegeage_intervention_parcels'
  ];
  -- Tables dont les lignes archivées sont masquées au public.
  archived_tables text[] := array[
    'piegeage_campaigns', 'piegeage_parcels', 'piegeage_traps',
    'piegeage_trap_events', 'piegeage_observations_v2', 'piegeage_interventions'
  ];
  read_rule text;
begin
  foreach t in array public_tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select on public.%I to anon, authenticated', t);
    execute format('grant insert, update, delete on public.%I to authenticated', t);

    if t = 'piegeage_species' then
      read_rule := '(active and archived_at is null) or (select public.is_sam_admin())';
    elsif t = any (archived_tables) then
      read_rule := 'archived_at is null or (select public.is_sam_admin())';
    else
      read_rule := 'true';
    end if;

    execute format('drop policy if exists "%1$s lecture publique" on public.%1$I', t);
    execute format('create policy "%1$s lecture publique" on public.%1$I for select to anon, authenticated using (%2$s)', t, read_rule);

    execute format('drop policy if exists "%1$s écriture admin" on public.%1$I', t);
    execute format('create policy "%1$s écriture admin" on public.%1$I for insert to authenticated with check ((select public.is_sam_admin()))', t);

    execute format('drop policy if exists "%1$s modification admin" on public.%1$I', t);
    execute format('create policy "%1$s modification admin" on public.%1$I for update to authenticated using ((select public.is_sam_admin())) with check ((select public.is_sam_admin()))', t);

    execute format('drop policy if exists "%1$s suppression admin" on public.%1$I', t);
    execute format('create policy "%1$s suppression admin" on public.%1$I for delete to authenticated using ((select public.is_sam_admin()))', t);
  end loop;
end $$;

grant usage, select on all sequences in schema public to authenticated;

notify pgrst, 'reload schema';

-- =============================================================================
-- Ajouter un collègue administrateur (adresse en minuscules) :
--   insert into public.sam_admins (email) values ('prenom.nom@sudexpe.net');
-- Retirer un administrateur :
--   delete from public.sam_admins where email = 'prenom.nom@sudexpe.net';
-- =============================================================================
