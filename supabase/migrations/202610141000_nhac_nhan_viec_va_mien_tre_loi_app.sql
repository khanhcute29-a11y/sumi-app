-- Công việc — yêu cầu Giám đốc 14/10/2026 ("không thấy báo thì không nhận được
-- việc, mà nhận thì nó quá trời trễ"):
--
-- 1) MIỄN TRỪ ĐIỂM "nhận việc chậm" cho việc giao từ 21/09/2026: từ ngày đó tới
--    14/10 nút "Tôi đã hiểu & nhận việc" trên popup Gen LUÔN báo lỗi
--    "permission denied for table tasks" (đã sửa ở 8fdebfb) — nhân viên bấm nhận
--    mà việc không được nhận, rồi bị tính trễ. KHÔNG xoá dòng nào:
--      - tasks.nhan_viec_tre_mien = true (cột mới) để thẻ việc ghi "đã miễn trừ";
--      - tasks.nhan_viec_tre = false để việc chưa duyệt không bị trừ 2 điểm nữa;
--      - task_kpi_logs 'nhan_viec' -2 -> 0, 'hoan_thanh' đã trừ 2 vì nhận chậm -> cộng lại 2
--        (KPI cộng điểm từ dòng 'hoan_thanh'), ghi rõ lý do miễn.
-- 2) NHẮC VIỆC CHƯA NHẬN: giao xong mà 15 phút / 1 tiếng chưa nhận thì chuông
--    nhắc ĐÚNG người được giao (popup có nút "Nhận việc" — notification_type
--    task_assigned + entity task). Chỉ việc giao trong 24 giờ qua (không bắn
--    chuông cho việc tồn cũ), không nhắc việc trong đơn hàng, việc đã từ chối/đóng.
-- Gỡ: select cron.unschedule('sumi-nhac-nhan-viec-5-phut');
begin;
set local lock_timeout = '10s';
set local statement_timeout = '60s';

alter table public.tasks add column if not exists nhan_viec_tre_mien boolean not null default false;

-- ── 1. Miễn trừ điểm nhận chậm (việc giao từ 21/09, nhận tới hết 14/10) ─────
create temporary table _mien on commit drop as
  select id from public.tasks
   where nhan_viec_tre = true
     and created_at >= timestamptz '2026-09-21 00:00:00+07'
     and accepted_at < timestamptz '2026-10-15 00:00:00+07';

update public.task_kpi_logs
   set diem = 0,
       ly_do = coalesce(ly_do, '') || ' — miễn trừ (nút nhận việc lỗi 21/09–14/10/2026)'
 where su_kien = 'nhan_viec' and diem < 0
   and task_id in (select id from _mien);

update public.task_kpi_logs
   set diem = diem + 2,
       ly_do = ly_do || ' — miễn trừ nhận việc chậm (lỗi app 21/09–14/10/2026)'
 where su_kien = 'hoan_thanh'
   and task_id in (select id from _mien)
   and ly_do like '%nhận việc chậm%'
   and ly_do not like '%miễn trừ nhận việc chậm%';

update public.tasks
   set nhan_viec_tre = false, nhan_viec_tre_mien = true
 where id in (select id from _mien);

-- ── 2. Nhắc việc chưa nhận ────────────────────────────────────────────────
create or replace function public.sumi_nhac_nhan_viec()
returns integer language plpgsql security definer set search_path = public as $fn$
declare
  r       record;
  v_moc   int;
  v_count int := 0;
begin
  for r in
    select t.id, t.assignee_id, t.title, t.created_at
      from public.tasks t
     where t.assignee_id is not null
       and t.accepted_at is null
       and t.declined_at is null
       and t.created_by is distinct from t.assignee_id   -- tự giao cho mình thì không nhắc
       and coalesce(t.category, '') <> 'order_work'
       and t.status not in ('done', 'exempted', 'pending_approval')
       and t.created_at > now() - interval '24 hours'
       and t.created_at <= now() - interval '15 minutes'
  loop
    foreach v_moc in array array[15, 60] loop
      continue when now() < r.created_at + make_interval(mins => v_moc);
      insert into public.notifications(
        event_key, recipient_profile_id, notification_type, severity, sound_key,
        title, body, entity_type, entity_id, deep_link)
      values (
        'nhac-nhan-viec:' || r.id || ':' || v_moc, r.assignee_id, 'task_assigned', 'warning', 'ting',
        '⏰ Bạn chưa nhận việc',
        r.title, 'task', r.id, '/tasks/' || r.id)
      on conflict (event_key) do nothing;
      if found then
        v_count := v_count + 1;
        perform public.notify_push('⏰ Bạn chưa nhận việc',
          'Việc "' || left(coalesce(r.title, ''), 80) || '" đang chờ bạn bấm Nhận việc.',
          '/tasks/' || r.id, r.assignee_id);
      end if;
    end loop;
  end loop;
  return v_count;
end;
$fn$;

revoke all on function public.sumi_nhac_nhan_viec() from public, anon, authenticated;

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'sumi-nhac-nhan-viec-5-phut') then
      perform cron.unschedule('sumi-nhac-nhan-viec-5-phut');
    end if;
    perform cron.schedule('sumi-nhac-nhan-viec-5-phut', '*/5 * * * *', 'select public.sumi_nhac_nhan_viec()');
  end if;
end $$;

-- Đối chiếu (chạy thử bằng rollback để xem trước): số việc được miễn trừ.
select count(*) as so_viec_duoc_mien_tru from public.tasks where nhan_viec_tre_mien;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values ('202610141000_nhac_nhan_viec_va_mien_tre_loi_app', 'completed', now(),
  'Cot tasks.nhan_viec_tre_mien; mien tru diem nhan viec cham cho viec giao tu 21/09 nhan toi het 14/10 (nut nhan viec popup Gen loi permission denied): nhan_viec -2 -> 0, hoan_thanh +2, nhan_viec_tre=false. sumi_nhac_nhan_viec + cron 5 phut: nhac nguoi duoc giao sau 15 phut va 1 tieng chua nhan (viec giao trong 24h, khong order_work).')
on conflict (migration_key) do update set status = 'completed', finished_at = now(), notes = excluded.notes;

commit;
