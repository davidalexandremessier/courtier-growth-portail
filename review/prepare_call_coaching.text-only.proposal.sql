-- REVIEW ONLY — do not apply without approval. Additive text-only RPC; existing function/policies untouched.
CREATE OR REPLACE FUNCTION public.prepare_call_coaching_text(source_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare s public.call_sources; anchor public.call_sources; existing uuid; result uuid; combined text; recap text; replay text;
begin
 if not private.is_admin() then raise exception 'Accès administrateur requis'; end if;
 select * into s from public.call_sources where id=source_id for update;
 if s.id is null or s.client_id is null or s.match_status not in ('manual','auto') then raise exception 'Associez et validez le dossier avant de préparer le coaching'; end if;
 select * into anchor from public.call_sources where id=coalesce(s.linked_appointment_id,s.id) for update;
 if anchor.id is null or anchor.client_id is distinct from s.client_id then raise exception 'Dossier du rendez-vous incompatible'; end if;
 select id into existing from public.coachings where source_anchor_id=anchor.id;
 if existing is not null then return existing; end if;
 select string_agg('['||provider||']'||E'\n'||transcript,E'\n\n' order by provider,id) into combined from public.call_sources
 where (id=anchor.id or linked_appointment_id=anchor.id) and client_id=anchor.client_id and match_status in ('manual','auto') and transcript<>'';
 select string_agg('['||provider||']'||E'\n'||summary,E'\n\n' order by provider,id) into recap from public.call_sources
 where (id=anchor.id or linked_appointment_id=anchor.id) and client_id=anchor.client_id and match_status in ('manual','auto') and summary<>'';
 -- Provider links are never copied into client-publishable records.
 replay := null;
 if coalesce(combined,'')='' and coalesce(recap,'')='' and coalesce(replay,'')='' then raise exception 'Aucun contenu disponible pour préparer un compte rendu'; end if;
 insert into public.coachings(client_id,meeting_at,title,transcript,summary,replay_url,published,source_anchor_id)
 values(anchor.client_id,anchor.started_at,coalesce(nullif(anchor.title,''),'Coaching importé'),coalesce(combined,''),coalesce(recap,''),coalesce(replay,''),false,anchor.id) returning id into result;
 return result;
end; $function$;


revoke all on function public.prepare_call_coaching_text(uuid) from public,anon;
grant execute on function public.prepare_call_coaching_text(uuid) to authenticated;
