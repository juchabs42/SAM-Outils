-- =============================================================================
-- SAM Outils · Stations du réseau SAM (Comsag / TCSD)
-- -----------------------------------------------------------------------------
-- À coller dans Supabase > SQL Editor > New query, puis Run (relançable).
--
-- AVANT, une seule fois : enregistrer les identifiants Comsag dans le coffre
-- (Vault) de Supabase, jamais dans le code ni sur GitHub :
--
--   select vault.create_secret('1326', 'comsag_id', 'Identifiant API Comsag');
--   select vault.create_secret('LE_TOKEN_DE_REGIS', 'comsag_token', 'Jeton API Comsag');
--
-- Fonctionnement :
--   • toutes les 30 minutes, la base demande à Comsag les nouvelles mesures de
--     chaque station active (extension pg_net, planifiée avec pg_cron) ;
--   • toutes les 5 minutes, les réponses reçues sont rangées dans
--     public.station_mesures (une ligne par mesure horaire) ;
--   • le site lit les tables en direct ; le jeton Comsag ne quitte jamais la base.
-- =============================================================================

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

create schema if not exists sam_private;
revoke all on schema sam_private from public;
revoke all on schema sam_private from anon, authenticated;

-- -----------------------------------------------------------------------------
-- 1. Stations
-- -----------------------------------------------------------------------------
create table if not exists public.stations (
  id text primary key,                        -- identifiant Comsag (device_id), ex. TCSD_5881
  nom text not null,
  reseau text not null default 'SAM',
  commune text,
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  altitude double precision,
  active boolean not null default true,       -- collecte automatique
  publique boolean not null default true,     -- visible sans compte
  commentaire text,
  capteurs text[] not null default '{}',      -- capteurs vus dans les mesures
  premiere_mesure timestamptz,
  derniere_mesure timestamptz,
  derniere_synchro timestamptz,
  derniere_erreur text,
  updated_at timestamptz not null default now()
);

insert into public.stations (id, nom) values
  ('TCSD_5880', 'Mas Carthagène'),
  ('TCSD_5881', 'Marsillargues Nord 1'),
  ('TCSD_5882', 'Pont-Saint-Esprit'),
  ('TCSD_5883', 'Saint-Just Hauteur'),
  ('TCSD_5884', 'Candillargues Cevelous'),
  ('TCSD_5885', 'Mornas'),
  ('TCSD_5886', 'Mondragon'),
  ('TCSD_5887', 'Mas de la Vierge'),
  ('TCSD_5888', 'Mas de la Plaine'),
  ('TCSD_5889', 'Aubord'),
  ('TCSD_5890', 'Le Loup'),
  ('TCSD_5891', 'Beauvezet'),
  ('TCSD_5892', 'Mas de Pétrusse'),
  ('TCSD_5893', 'Saint-Nazaire-de-Pézan'),
  ('TCSD_5894', 'Venejean'),
  ('TCSD_5895', 'Fauvette'),
  ('TCSD_5896', 'P13 Carthagène'),
  ('TCSD_5897', 'P16 Carthagène'),
  ('TCSD_5898', 'P3 Carthagène'),
  ('TCSD_5899', 'P5 Carthagène'),
  ('TCSD_5900', 'P8 Carthagène'),
  ('TCSD_5901', 'Marsillargues Nord 3')
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- 2. Mesures horaires
-- -----------------------------------------------------------------------------
create table if not exists public.station_mesures (
  station_id text not null references public.stations(id) on delete cascade,
  mesure_le timestamptz not null,
  t_air real,                                  -- t1   : température de l'air (°C)
  hr real,                                     -- hyg1 : humidité relative de l'air (%)
  pluie real,                                  -- pluv : pluie depuis la mesure précédente (mm)
  autres jsonb not null default '{}'::jsonb,   -- autres capteurs (ts1, ts2, hum, decagon1, decagon2, bat…)
  primary key (station_id, mesure_le)
);
create index if not exists station_mesures_mesure_le_idx on public.station_mesures (mesure_le);

-- Libellés des capteurs (affichage dans l'onglet Données)
create table if not exists public.station_capteurs (
  code text primary key,
  libelle text not null,
  unite text,
  ordre smallint not null default 100
);
insert into public.station_capteurs (code, libelle, unite, ordre) values
  ('t1', 'Température de l''air', '°C', 1),
  ('hyg1', 'Humidité relative', '%', 2),
  ('pluv', 'Pluie', 'mm', 3),
  ('ts1', 'Capteur ts1 (à préciser)', null, 10),
  ('ts2', 'Capteur ts2 (à préciser)', null, 11),
  ('hum', 'Capteur hum (à préciser)', null, 12),
  ('decagon1', 'Sonde Decagon 1 (à préciser)', null, 13),
  ('decagon2', 'Sonde Decagon 2 (à préciser)', null, 14),
  ('bat', 'Batterie', 'V', 90)
on conflict (code) do nothing;

-- Résumé journalier (jour civil, heure de Paris)
create or replace view public.station_journalier
with (security_invoker = true) as
select
  m.station_id,
  (m.mesure_le at time zone 'Europe/Paris')::date as jour,
  min(m.t_air) as t_min,
  max(m.t_air) as t_max,
  round(avg(m.t_air)::numeric, 2) as t_moy,
  min(m.hr) as hr_min,
  max(m.hr) as hr_max,
  round(avg(m.hr)::numeric, 1) as hr_moy,
  round(sum(coalesce(m.pluie, 0))::numeric, 1) as pluie,
  count(*)::integer as nb_mesures
from public.station_mesures m
group by m.station_id, (m.mesure_le at time zone 'Europe/Paris')::date;

-- -----------------------------------------------------------------------------
-- 3. Droits : lecture publique des stations publiques, gestion par les admins SAM
-- -----------------------------------------------------------------------------
alter table public.stations enable row level security;
alter table public.station_mesures enable row level security;
alter table public.station_capteurs enable row level security;

drop policy if exists stations_lecture on public.stations;
create policy stations_lecture on public.stations
  for select using (publique or public.is_sam_admin());
drop policy if exists stations_admin_maj on public.stations;
create policy stations_admin_maj on public.stations
  for update to authenticated using (public.is_sam_admin()) with check (public.is_sam_admin());
drop policy if exists stations_admin_ajout on public.stations;
create policy stations_admin_ajout on public.stations
  for insert to authenticated with check (public.is_sam_admin());
drop policy if exists stations_admin_suppr on public.stations;
create policy stations_admin_suppr on public.stations
  for delete to authenticated using (public.is_sam_admin());

drop policy if exists station_mesures_lecture on public.station_mesures;
create policy station_mesures_lecture on public.station_mesures
  for select using (
    exists (select 1 from public.stations s where s.id = station_id and (s.publique or public.is_sam_admin()))
  );

drop policy if exists station_capteurs_lecture on public.station_capteurs;
create policy station_capteurs_lecture on public.station_capteurs for select using (true);
drop policy if exists station_capteurs_admin on public.station_capteurs;
create policy station_capteurs_admin on public.station_capteurs
  for all to authenticated using (public.is_sam_admin()) with check (public.is_sam_admin());

grant select on public.stations, public.station_mesures, public.station_capteurs, public.station_journalier to anon, authenticated;
grant insert, update, delete on public.stations, public.station_capteurs to authenticated;
-- Les mesures ne s'écrivent que par la collecte automatique (fonctions ci-dessous).
revoke insert, update, delete on public.station_mesures from anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4. Collecte Comsag
-- -----------------------------------------------------------------------------
create table if not exists sam_private.comsag_requetes (
  request_id bigint primary key,
  station_id text not null references public.stations(id) on delete cascade,
  demande_le timestamptz not null default now(),
  debut timestamptz not null,
  fin timestamptz not null
);

create or replace function sam_private.nombre(valeur text)
returns real language plpgsql immutable as $$
begin
  return valeur::real;
exception when others then
  return null;
end $$;

create or replace function sam_private.horodatage(valeur text)
returns timestamptz language plpgsql stable as $$
begin
  return valeur::timestamptz;
exception when others then
  return null;
end $$;

-- Demande les mesures à Comsag (toutes les stations actives, ou une seule).
-- p_debut : début forcé (rattrapage d'historique) ; sinon reprise 6 h avant la dernière mesure.
create or replace function sam_private.comsag_demander(p_station text default null, p_debut timestamptz default null)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_id text;
  v_jeton text;
  v_fin timestamptz := now();
  v_debut timestamptz;
  v_requete bigint;
  v_nb integer := 0;
  s record;
begin
  select decrypted_secret into v_id from vault.decrypted_secrets where name = 'comsag_id';
  select decrypted_secret into v_jeton from vault.decrypted_secrets where name = 'comsag_token';
  if v_id is null or v_jeton is null then
    raise exception 'Identifiants Comsag absents du coffre Supabase (vault : comsag_id, comsag_token).';
  end if;
  for s in
    select st.id, st.derniere_mesure from public.stations st
    where (p_station is null and st.active) or st.id = p_station
    order by st.id
  loop
    v_debut := coalesce(p_debut, s.derniere_mesure - interval '6 hours', now() - interval '120 days');
    select net.http_get(
      url := 'https://webcomsag.fr/plugins/ws/',
      params := jsonb_build_object(
        'id', v_id,
        'token', v_jeton,
        'device_id', s.id,
        'date_start', to_char(v_debut at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'date_end', to_char(v_fin at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      ),
      timeout_milliseconds := 30000
    ) into v_requete;
    insert into sam_private.comsag_requetes (request_id, station_id, debut, fin)
    values (v_requete, s.id, v_debut, v_fin);
    v_nb := v_nb + 1;
  end loop;
  return v_nb;
end $$;

-- Range les réponses reçues dans station_mesures ; renvoie le nombre de mesures écrites.
create or replace function sam_private.comsag_integrer()
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_json jsonb;
  v_lignes integer;
  v_total integer := 0;
  v_capteurs text[];
  v_erreur text;
begin
  for r in
    select q.request_id, q.station_id, q.demande_le,
           resp.status_code, resp.content, resp.timed_out, resp.error_msg,
           (resp.id is not null) as recue
    from sam_private.comsag_requetes q
    left join net._http_response resp on resp.id = q.request_id
    order by q.request_id
  loop
    if not r.recue then
      -- Pas encore de réponse : on attend, puis on abandonne au bout de 2 heures.
      if r.demande_le < now() - interval '2 hours' then
        update public.stations set derniere_synchro = now(), derniere_erreur = 'Pas de réponse de Comsag'
        where id = r.station_id;
        delete from sam_private.comsag_requetes where request_id = r.request_id;
      end if;
      continue;
    end if;

    v_json := null;
    v_erreur := null;
    if coalesce(r.timed_out, false) then
      v_erreur := 'Délai de réponse dépassé';
    elsif r.error_msg is not null then
      v_erreur := 'Erreur réseau vers Comsag';
    elsif r.status_code <> 200 then
      v_erreur := 'Comsag répond ' || r.status_code;
    else
      begin
        v_json := r.content::jsonb;
      exception when others then
        v_erreur := 'Réponse Comsag illisible';
      end;
      if v_json ? 'error' then
        v_erreur := 'Comsag : ' || coalesce(v_json #>> '{error,message}', 'erreur') || coalesce(' (' || (v_json #>> '{error,code}') || ')', '');
        v_json := null;
      end if;
    end if;

    if v_erreur is not null then
      update public.stations set derniere_synchro = now(), derniere_erreur = v_erreur where id = r.station_id;
    else
      insert into public.station_mesures (station_id, mesure_le, t_air, hr, pluie, autres)
      select r.station_id,
             sam_private.horodatage(d ->> 'timestamp'),
             sam_private.nombre(d ->> 't1'),
             sam_private.nombre(d ->> 'hyg1'),
             sam_private.nombre(d ->> 'pluv'),
             d - 'timestamp' - 't1' - 'hyg1' - 'pluv'
      from jsonb_array_elements(coalesce(v_json -> 'datas', '[]'::jsonb)) as d
      where jsonb_typeof(d) = 'object' and sam_private.horodatage(d ->> 'timestamp') is not null
      on conflict (station_id, mesure_le) do update
        set t_air = excluded.t_air, hr = excluded.hr, pluie = excluded.pluie, autres = excluded.autres;
      get diagnostics v_lignes = row_count;
      v_total := v_total + v_lignes;

      select coalesce(array_agg(distinct k order by k), '{}') into v_capteurs
      from jsonb_array_elements(coalesce(v_json -> 'datas', '[]'::jsonb)) as d,
           lateral jsonb_object_keys(case when jsonb_typeof(d) = 'object' then d else '{}'::jsonb end) as k
      where k <> 'timestamp';

      update public.stations st set
        derniere_synchro = now(),
        derniere_erreur = null,
        capteurs = array(select distinct c from unnest(st.capteurs || v_capteurs) as c order by c),
        premiere_mesure = (select min(m.mesure_le) from public.station_mesures m where m.station_id = st.id),
        derniere_mesure = (select max(m.mesure_le) from public.station_mesures m where m.station_id = st.id)
      where st.id = r.station_id;
    end if;
    delete from sam_private.comsag_requetes where request_id = r.request_id;
  end loop;
  return v_total;
end $$;

revoke all on function sam_private.comsag_demander(text, timestamptz) from public, anon, authenticated;
revoke all on function sam_private.comsag_integrer() from public, anon, authenticated;

-- Boutons « Synchroniser » de l'onglet Données (administrateurs SAM uniquement)
create or replace function public.stations_synchroniser(p_station text default null)
returns integer
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_sam_admin() then
    raise exception 'Réservé aux administrateurs SAM.';
  end if;
  return sam_private.comsag_demander(p_station, null);
end $$;

create or replace function public.stations_integrer()
returns integer
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_sam_admin() then
    raise exception 'Réservé aux administrateurs SAM.';
  end if;
  return sam_private.comsag_integrer();
end $$;

revoke all on function public.stations_synchroniser(text) from public, anon;
revoke all on function public.stations_integrer() from public, anon;
grant execute on function public.stations_synchroniser(text) to authenticated;
grant execute on function public.stations_integrer() to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Planification (pg_cron)
-- -----------------------------------------------------------------------------
select cron.unschedule(jobid) from cron.job where jobname in ('sam-comsag-demande', 'sam-comsag-integration');
select cron.schedule('sam-comsag-demande', '7,37 * * * *', $$select sam_private.comsag_demander()$$);
select cron.schedule('sam-comsag-integration', '*/5 * * * *', $$select sam_private.comsag_integrer()$$);

-- -----------------------------------------------------------------------------
-- 6. Premier chargement : tout l'historique disponible chez Comsag (depuis le 1er septembre 2026)
-- -----------------------------------------------------------------------------
select sam_private.comsag_demander(null, '2026-09-01T00:00:00+02:00'::timestamptz) as stations_demandees;
-- Les mesures apparaissent dans les 5 minutes (tâche « sam-comsag-integration »).
-- Contrôle : select id, nom, derniere_mesure, derniere_erreur from public.stations order by id;
