-- SUMI APP M22 — trao đổi xuyên suốt ngay trên đơn hàng.

begin;

alter table public.order_notes add column if not exists attachments jsonb;
alter table public.order_notes add column if not exists note_type text not null default 'normal';
alter table public.order_notes add column if not exists mentioned_profile_ids uuid[] not null default '{}';
alter table public.order_notes add column if not exists deleted_at timestamptz;
alter table public.order_notes add column if not exists deleted_by uuid references public.profiles(id) on delete set null;

do $$ begin
  alter table public.order_notes add constraint order_notes_note_type_check
    check(note_type in ('normal','customer_update','urgent'));
exception when duplicate_object then null; end $$;

create index if not exists idx_order_notes_order_time on public.order_notes(order_id,created_at,id);

create or replace function public.add_order_comment(
  p_order_id uuid,
  p_message text default '',
  p_attachments jsonb default null,
  p_note_type text default 'normal',
  p_mentioned_profile_ids uuid[] default '{}'
) returns public.order_notes
language plpgsql security definer set search_path=public as $$
declare
  v_profile public.profiles%rowtype;
  v_order public.orders%rowtype;
  v_note public.order_notes%rowtype;
  v_rec record;
begin
  select * into v_profile from public.profiles where id=auth.uid() and approved=true and active=true;
  if not found then raise exception 'Tài khoản chưa được phép trao đổi'; end if;
  select * into v_order from public.orders where id=p_order_id;
  if not found then raise exception 'Không tìm thấy đơn hàng'; end if;
  if coalesce(trim(p_message),'')='' and (p_attachments is null or p_attachments='[]'::jsonb) then
    raise exception 'Hãy nhập nội dung hoặc thêm ảnh';
  end if;
  if p_note_type not in ('normal','customer_update','urgent') then raise exception 'Loại bình luận không hợp lệ'; end if;

  insert into public.order_notes(order_id,order_code,author_id,author_name,author_role,message,attachments,note_type,mentioned_profile_ids)
  values(p_order_id,v_order.order_code,auth.uid(),v_profile.full_name,v_profile.role,coalesce(p_message,''),p_attachments,p_note_type,coalesce(p_mentioned_profile_ids,'{}'))
  returning * into v_note;

  insert into public.domain_events(event_type,entity_type,entity_id,actor_id,actor_role,payload,idempotency_key,confidentiality)
  values('order_comment_added','order',p_order_id,auth.uid(),v_profile.role,
    jsonb_build_object('comment_id',v_note.id,'note_type',p_note_type),
    'order-comment:'||v_note.id,v_order.confidentiality)
  on conflict(idempotency_key) do nothing;

  -- Báo cho người tạo đơn, người được nhắc và các đơn vị đang thực hiện; không tự báo người gửi.
  for v_rec in
    select distinct recipient_profile_id,recipient_unit_id from (
      select v_order.created_by as recipient_profile_id,null::uuid as recipient_unit_id
      union all select unnest(coalesce(p_mentioned_profile_ids,'{}'::uuid[])),null::uuid
      union all select null::uuid,wp.unit_id from public.order_work_packages wp where wp.order_id=p_order_id
    ) r where coalesce(recipient_profile_id,recipient_unit_id) is not null and recipient_profile_id is distinct from auth.uid()
  loop
    insert into public.notifications(event_key,recipient_profile_id,recipient_unit_id,notification_type,severity,sound_key,title,body,entity_type,entity_id,deep_link)
    values('order-comment:'||v_note.id||':'||coalesce(v_rec.recipient_profile_id::text,v_rec.recipient_unit_id::text),
      v_rec.recipient_profile_id,v_rec.recipient_unit_id,'order_comment',
      case when p_note_type='urgent' then 'urgent' else 'info' end,'ting',
      case when p_note_type='urgent' then 'Trao đổi gấp · ' else 'Có trao đổi mới · ' end||v_order.order_code,
      v_profile.full_name||': '||left(coalesce(nullif(trim(p_message),''),'Đã gửi ảnh'),110),
      'order',p_order_id,'/orders/'||p_order_id)
    on conflict(event_key) do nothing;
  end loop;
  return v_note;
end $$;

create or replace function public.soft_delete_order_comment(p_comment_id uuid)
returns public.order_notes
language plpgsql security definer set search_path=public as $$
declare v_note public.order_notes%rowtype;
begin
  select * into v_note from public.order_notes where id=p_comment_id for update;
  if not found then raise exception 'Không tìm thấy bình luận'; end if;
  if v_note.deleted_at is not null then return v_note; end if;
  if v_note.author_id is distinct from auth.uid() and not public.is_business_director() then
    raise exception 'Chỉ người gửi hoặc Giám đốc được xóa bình luận';
  end if;
  update public.order_notes set deleted_at=now(),deleted_by=auth.uid(),message='',attachments=null
  where id=p_comment_id returning * into v_note;
  return v_note;
end $$;

revoke insert,update,delete on public.order_notes from authenticated;
grant select on public.order_notes to authenticated;
revoke all on function public.add_order_comment(uuid,text,jsonb,text,uuid[]) from public,anon;
revoke all on function public.soft_delete_order_comment(uuid) from public,anon;
grant execute on function public.add_order_comment(uuid,text,jsonb,text,uuid[]) to authenticated;
grant execute on function public.soft_delete_order_comment(uuid) to authenticated;

insert into public.migration_runs(migration_key,status,finished_at,notes)
values('202608220022_order_comments','completed',now(),'Added typed order comments, mentions, soft deletion, timeline events and linked notifications.')
on conflict(migration_key) do update set status='completed',finished_at=now(),notes=excluded.notes;

commit;
