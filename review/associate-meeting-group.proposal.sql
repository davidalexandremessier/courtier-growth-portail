-- REVIEW ONLY. Administrative manual association; no automatic publication.
create function public.associate_meeting_group(p_sources uuid[],p_client uuid,p_method text default 'manual') returns uuid
language plpgsql security invoker set search_path='' as $$
declare anchor_id uuid; linked_ids uuid[]; actual_count integer;
begin
 if not private.is_admin() then raise exception 'Accès administrateur requis';end if;
 if p_method not in ('manual','auto') then raise exception 'Méthode invalide';end if;
 if cardinality(p_sources) not between 1 and 2 or (select count(distinct x) from unnest(p_sources) x)<>cardinality(p_sources) then raise exception 'Sources invalides';end if;
 perform 1 from public.clients where id=p_client;if not found then raise exception 'Dossier introuvable';end if;
 perform 1 from public.call_sources where id=any(p_sources) order by id for update;
 select count(*) into actual_count from public.call_sources where id=any(p_sources) and source_kind='meeting' and provider in ('zoom','wispr');
 if (select count(distinct provider) from public.call_sources where id=any(p_sources))<>cardinality(p_sources) then raise exception 'Une source par fournisseur';end if;
 if actual_count<>cardinality(p_sources) then raise exception 'Sources invalides';end if;
 if exists(select 1 from public.call_sources where id=any(p_sources) and client_id is not null and client_id<>p_client) then raise exception 'Dossier existant différent';end if;
 if p_method='auto' and not exists(select 1 from public.call_sources where id=any(p_sources) and client_id=p_client and match_status in ('manual','auto')) then raise exception 'Client non confirmé';end if;
 select array_agg(distinct linked_appointment_id) filter(where linked_appointment_id is not null) into linked_ids from public.call_sources where id=any(p_sources);
 if coalesce(cardinality(linked_ids),0)>1 then raise exception 'Plusieurs rencontres existantes';end if;
 anchor_id:=coalesce(linked_ids[1],(select id from public.call_sources where id=any(p_sources) order by id limit 1));
 if anchor_id<>all(p_sources) then
  perform 1 from public.call_sources where id=anchor_id and client_id=p_client and match_status in ('auto','manual') for update;
  if not found then raise exception 'Ancre incompatible';end if;
 end if;
 if exists(select 1 from public.coachings where source_anchor_id=anchor_id or source_anchor_id=any(p_sources)) then raise exception 'Une fiche existe déjà : réviser la fiche existante';end if;
 update public.call_sources set client_id=p_client,linked_appointment_id=case when id=anchor_id then null else anchor_id end,match_status=p_method,match_reason=case when p_method='manual' then 'Association confirmée par administration' else 'Correspondance Zoom/Wispr unique, client déjà confirmé' end where id=any(p_sources);
 return anchor_id;
end; $$;
revoke all on function public.associate_meeting_group(uuid[],uuid,text) from public,anon;
grant execute on function public.associate_meeting_group(uuid[],uuid,text) to authenticated;
