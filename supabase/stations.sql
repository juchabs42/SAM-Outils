-- =============================================================================
-- SAM Outils · Stations du réseau SAM (Comsag / TCSD)
-- -----------------------------------------------------------------------------
-- À coller dans Supabase > SQL Editor > New query, puis Run (relançable).
--
-- Les identifiants Comsag sont rangés dans le coffre (Vault) de Supabase,
-- jamais dans le code ni sur GitHub (secrets « comsag_id » et « comsag_token »).
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
  installee boolean not null default true,    -- station posée sur le terrain
  commentaire text,
  capteurs text[] not null default '{}',      -- capteurs vus dans les mesures
  premiere_mesure timestamptz,
  derniere_mesure timestamptz,
  derniere_synchro timestamptz,
  derniere_erreur text,
  updated_at timestamptz not null default now()
);

alter table public.stations add column if not exists installee boolean not null default true;

-- Noms, communes et coordonnées : fichier « Config réseaux - utilisateur - SudExpé » (10/11/2026).
-- Altitude estimée à partir du modèle de terrain (Open-Meteo). Les valeurs déjà saisies ne sont pas écrasées.
insert into public.stations (id, nom, commune, latitude, longitude, altitude) values
  ('TCSD_5880', 'Mas de Carthagène', 'Marsillargues (34)', 43.628333, 4.151306, 2),
  ('TCSD_5881', 'Marsillargues Marseillais Nord 1', 'Marsillargues (34)', 43.677222, 4.163389, 7),
  ('TCSD_5882', 'Pont-Saint-Esprit', 'Pont-Saint-Esprit (30)', 44.245528, 4.652833, 41),
  ('TCSD_5883', 'Saint-Just Hauteur', 'Saint-Just (34)', 43.654056, 4.102417, 5),
  ('TCSD_5884', 'Candillargues Cevelous', 'Candillargues (34)', 43.624306, 4.070500, 3),
  ('TCSD_5885', 'Mornas', 'Mornas (84)', 44.180250, 4.738111, 33),
  ('TCSD_5886', 'Mondragon', 'Mondragon (84)', 44.248750, 4.679444, 40),
  ('TCSD_5887', 'Mas de la Vierge', 'Mauguio (34)', 43.608056, 3.968722, 12),
  ('TCSD_5888', 'Mas de la Plaine', 'Mudaison (34)', 43.631250, 4.031528, 10),
  ('TCSD_5889', 'Aubord', 'Bernis (30)', 43.752194, 4.297722, 17),
  ('TCSD_5890', 'Le Loup', 'Aigues-Vives (11)', 43.232361, 2.552528, 53),
  ('TCSD_5891', 'Beauvezet', 'Mondragon (84)', 44.249639, 4.666833, 41),
  ('TCSD_5892', 'Mas de Pétrusse', 'Mauguio (34)', 43.612028, 4.038444, 2),
  ('TCSD_5893', 'Saint-Nazaire-de-Pézan', 'Saint-Nazaire-de-Pézan (34)', 43.640639, 4.111806, 3),
  ('TCSD_5894', 'Venejean', null, null, null, null),
  ('TCSD_5895', 'Fauvette', null, null, null, null),
  ('TCSD_5896', 'Carthagène P13', 'Marsillargues (34)', 43.645028, 4.168389, 2),
  ('TCSD_5897', 'Carthagène P16', 'Marsillargues (34)', 43.656472, 4.173806, 4),
  ('TCSD_5898', 'Carthagène P3', 'Marsillargues (34)', 43.627472, 4.150444, 0),
  ('TCSD_5899', 'Carthagène P5', 'Marsillargues (34)', 43.626556, 4.152028, 1),
  ('TCSD_5900', 'Carthagène P8', 'Marsillargues (34)', 43.634056, 4.150000, 0),
  ('TCSD_5901', 'Marsillargues Marseillais Nord 3', 'Marsillargues (34)', 43.678222, 4.166056, 6)
on conflict (id) do update set
  commune = coalesce(public.stations.commune, excluded.commune),
  latitude = coalesce(public.stations.latitude, excluded.latitude),
  longitude = coalesce(public.stations.longitude, excluded.longitude),
  altitude = coalesce(public.stations.altitude, excluded.altitude);

-- Noms de la première version remplacés par ceux du fichier de configuration (sauf s'ils ont été modifiés depuis)
update public.stations s set nom = v.nouveau
from (values
  ('TCSD_5880', 'Mas Carthagène', 'Mas de Carthagène'),
  ('TCSD_5881', 'Marsillargues Nord 1', 'Marsillargues Marseillais Nord 1'),
  ('TCSD_5896', 'P13 Carthagène', 'Carthagène P13'),
  ('TCSD_5897', 'P16 Carthagène', 'Carthagène P16'),
  ('TCSD_5898', 'P3 Carthagène', 'Carthagène P3'),
  ('TCSD_5899', 'P5 Carthagène', 'Carthagène P5'),
  ('TCSD_5900', 'P8 Carthagène', 'Carthagène P8'),
  ('TCSD_5901', 'Marsillargues Nord 3', 'Marsillargues Marseillais Nord 3')
) as v(id, ancien, nouveau)
where s.id = v.id and s.nom = v.ancien;

-- Stations pas encore posées (novembre 2026) : elles basculent seules en « installée »
-- dès qu'elles transmettent (voir comsag_integrer).
update public.stations set installee = false
where id in ('TCSD_5882', 'TCSD_5883', 'TCSD_5884', 'TCSD_5885', 'TCSD_5886', 'TCSD_5887', 'TCSD_5888', 'TCSD_5889',
             'TCSD_5891', 'TCSD_5892', 'TCSD_5893', 'TCSD_5894', 'TCSD_5895', 'TCSD_5900', 'TCSD_5901')
  and (derniere_mesure is null or derniere_mesure < now() - interval '2 days');

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
-- Dictionnaire des capteurs Comsag du réseau SAM (profondeurs des tensiomètres : fichier Config réseaux)
insert into public.station_capteurs (code, libelle, unite, ordre) values
  ('t1', 'Température de l''air', '°C', 1),
  ('hyg1', 'Hygrométrie de l''air', '%', 2),
  ('pluv', 'Pluviométrie', 'mm', 3),
  ('hum', 'Humectation du feuillage', '%', 10),
  ('ts1', 'Tensiomètre 1 (30 cm)', 'cb', 20),
  ('ts2', 'Tensiomètre 2 (30 cm)', 'cb', 21),
  ('ts4', 'Tensiomètre 4 (60 cm)', 'cb', 23),
  ('ts5', 'Tensiomètre 5 (60 cm)', 'cb', 24),
  ('decagon1', 'Humidité du sol 1', '%', 30),
  ('decagon2', 'Humidité du sol 2', '%', 31),
  ('bat', 'Batterie', 'V', 90)
on conflict (code) do update set libelle = excluded.libelle, unite = excluded.unite, ordre = excluded.ordre;

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
      -- Une station « pas encore installée » qui transmet devient installée.
      update public.stations set installee = true
      where id = r.station_id and not installee and derniere_mesure > now() - interval '2 days';
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
