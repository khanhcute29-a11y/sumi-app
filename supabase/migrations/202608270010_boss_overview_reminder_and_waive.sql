-- Boss Overview V3 (src/components/mockups/BossDashboardV3/BossOverviewV3.tsx)
-- cần 2 hành động thật: "Nhắc Nhở" nhân viên đi trễ, và "Bỏ Qua Lý Do Chính Đáng"
-- để miễn phạt trễ. `notifications` đã revoke insert trực tiếp từ authenticated
-- (chỉ ghi được qua RPC security definer), nên không thể insert thẳng từ client.
begin;

create or replace function public.remind_staff(p_staff_id uuid, p_message text)
returns void language plpgsql security definer set search_path = public as $$
declare v_staff_name text;
begin
  if not public.is_business_director() then
    raise exception 'Chỉ Giám đốc mới được nhắc nhở nhân viên';
  end if;
  select full_name into v_staff_name from public.profiles where id = p_staff_id;
  if v_staff_name is null then
    raise exception 'Không tìm thấy nhân viên';
  end if;
  insert into public.notifications(
    event_key, recipient_profile_id, notification_type, severity, sound_key,
    title, body, entity_type, entity_id, deep_link
  ) values (
    'boss-reminder:' || p_staff_id || ':' || extract(epoch from now())::text,
    p_staff_id, 'boss_reminder', 'warning', 'ting',
    'Nhắc nhở từ Sếp', coalesce(nullif(trim(p_message), ''), 'Sếp nhắc bạn chú ý giờ giấc đi làm.'),
    'profile', p_staff_id, '/shifts'
  );
end $$;

create or replace function public.waive_late_penalty(p_shift_log_id uuid)
returns public.shift_logs language plpgsql security definer set search_path = public as $$
declare v public.shift_logs%rowtype;
begin
  if not public.is_business_director() then
    raise exception 'Chỉ Giám đốc mới được bỏ qua phạt trễ';
  end if;
  update public.shift_logs set late_minutes = 0
  where id = p_shift_log_id and type = 'checkin'
  returning * into v;
  if not found then
    raise exception 'Không tìm thấy bản ghi chấm công này';
  end if;
  return v;
end $$;

revoke all on function public.remind_staff(uuid, text), public.waive_late_penalty(uuid) from public, anon, authenticated;
grant execute on function public.remind_staff(uuid, text), public.waive_late_penalty(uuid) to authenticated;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202608270010_boss_overview_reminder_and_waive', 'completed', now(),
  'Added remind_staff() and waive_late_penalty() RPCs (director-only via existing is_business_director()) — backing the "Nhắc Nhở" / "Bỏ Qua Lý Do Chính Đáng" buttons in BossOverviewV3, since notifications inserts and shift_logs writes need a trusted server-side path.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
