-- PROPOSITION POUR REVUE UNIQUEMENT — NON APPLIQUÉE.
-- Aucun GRANT, politique RLS, compte ou secret ajouté.
-- Autorise uniquement le rôle serveur existant à ajouter des notes de stats
-- bornées à un compte du dossier; les autres chemins restent inchangés.
begin;
do $review$
declare
 original text:=pg_get_functiondef('private.growth_validate()'::regprocedure);
 needle text:=$needle$ if auth.uid() is null or not private.can_access_client(new.client_id) then raise exception 'Dossier inaccessible';end if;$needle$;
 addition text:=$guard$
 -- COURTIER_SOURCE_STATS_SERVICE_V1
 if auth.uid() is null and current_user='service_role' and tg_table_name='growth_activities' then
  declare payload jsonb;fact jsonb;provider text;account text;prior_stats jsonb;
  begin
   if new.kind<>'note' or new.source<>'import' or new.quantity is not null
    or new.external_ref !~ '^stats:(fact|run|done|error):[a-f0-9]{64}(:[a-f0-9]{64})?$'
    or left(new.body,19)<>E'CG_SOURCE_STATS_V1\n'
    or not exists(select 1 from public.app_admins where user_id=new.created_by)
   then raise exception 'Écriture de statistiques serveur refusée';end if;
   payload:=substring(new.body from 20)::jsonb;
   if payload->>'type'='fact' then
    fact:=payload->'record';provider:=fact->>'provider';account:=fact->>'account_id';
    if payload->>'origin' is distinct from provider||'_api'
     or fact->>'client_id' is distinct from new.client_id::text
     or fact->>'date' is distinct from new.activity_date::text
     or jsonb_typeof(fact->'value') is distinct from 'number'
     or (fact->>'value')::numeric<0
     or (fact->>'metric'<>'spend' and mod((fact->>'value')::numeric,1)<>0)
     or coalesce(fact->>'currency','') not in ('CAD','USD')
     or not exists(select 1 from pg_catalog.pg_timezone_names where name=fact->>'timezone')
     or length(coalesce(fact->>'object_id','')) not between 1 and 200
     or coalesce(fact->>'cohort','')<>'activity_period'
     or not coalesce(payload->>'run_id','') ~ '^[a-f0-9]{64}$'
     or ((provider='meta' and fact->>'metric'=any(array['spend','impressions','clicks','meta_leads']))
        or (provider='ghl' and fact->>'metric'=any(array['ghl_leads','appointments_due','attended']))) is not true
    then raise exception 'Fait source invalide';end if;
   elsif payload->>'type'='status' then
    provider:=payload->>'provider';account:=payload->>'account_id';
    if new.replaces_id is not null or not coalesce(payload->>'phase','')=any(array['pending','success','error']) then raise exception 'État source invalide';end if;
   else raise exception 'Type de statistique invalide';end if;
   if not exists(select 1 from public.clients where id=new.client_id and
    ((provider='meta' and meta_ad_account_id=account) or (provider='ghl' and ghl_location_id=account)))
   then raise exception 'Compte source hors dossier';end if;
   if new.replaces_id is not null then
    select substring(body from 20)::jsonb->'record' into prior_stats from public.growth_activities
     where id=new.replaces_id and client_id=new.client_id and external_ref like 'stats:fact:%' and left(body,19)=E'CG_SOURCE_STATS_V1\n';
    if prior_stats is null or (prior_stats-'value') is distinct from (fact-'value') then raise exception 'Correction source hors identité';end if;
   end if;
   perform pg_advisory_xact_lock(hashtext('growth:'||new.client_id::text));
   new.created_at=clock_timestamp();return new;
  end;
 end if;
$guard$;
begin
 if md5(original)<>'33efeb266a3dc50fbdb38e20d8814984' then raise exception 'Garde anti-dérive : relire la fonction active avant application';end if;
 if (length(original)-length(replace(original,needle,'')))/length(needle)<>1 then raise exception 'Point d’insertion absent ou ambigu';end if;
 execute replace(original,needle,addition||needle);
end;
$review$;
commit;
