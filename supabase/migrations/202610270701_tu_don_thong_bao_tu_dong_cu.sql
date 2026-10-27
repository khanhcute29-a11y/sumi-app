-- KHẨN 27/10/2026 — database quá tải vì thông báo tự động tồn đọng.
--
-- Đo thật: ~245.000 thông báo CHƯA ĐỌC, gần hết là nhắc tự động lặp lại
-- (task_deadline_alert mỗi 10 phút/việc quá hạn, order_waiting mỗi 15 phút ×
-- 8 vai trò…), thêm ~6.000 dòng/ngày và không bao giờ được đánh dấu đã đọc.
-- Màn "Hôm nay" đếm thông báo chưa đọc (count exact, RLS từng dòng) -> mỗi lần
-- mở app database phải duyệt ~245k dòng; nhật ký Postgres đầy lệnh này bị huỷ
-- vì quá 8 giây, kéo theo lệnh nhận giao của shipper cũng bị huỷ.
--
-- SỬA: nhắc tự động cũ hơn 24 giờ mà chưa đọc -> đánh dấu ĐÃ ĐỌC (read_at).
-- KHÔNG xoá dòng nào (AGENTS §5.4), vẫn xem lại được trong Hộp thư "Tất cả".
--  - Chỉ 4 loại nhắc tự động lặp lại; KHÔNG đụng thông báo thật (đơn mới,
--    thông báo công ty, chat, việc được giao…).
--  - An toàn với chống trùng: các hàm nhắc chống trùng bằng event_key, KHÔNG
--    dựa vào read_at -> đánh dấu đã đọc không làm nhắc lại.
--  - Không làm điện thoại kêu: app chỉ nghe realtime INSERT của notifications
--    (App.jsx, InboxV2Screen.jsx), đây là UPDATE.
--  - Mỗi phút chỉ 5.000 dòng (pg_cron) để không dồn database đang yếu: ~245k
--    dòng tồn xong trong ~50 phút; sau đó mỗi phút chỉ dọn vài dòng mới quá 24h.
-- Gỡ: select cron.unschedule('sumi-don-thong-bao-tu-dong-cu-1-phut');
begin;
set local lock_timeout = '10s';
set local statement_timeout = '60s';

create or replace function public.sumi_don_thong_bao_tu_dong_cu(p_lo integer default 5000)
returns integer language plpgsql security definer set search_path = public as $fn$
declare v_so integer;
begin
  update public.notifications n
     set read_at = now()
   where n.id in (
     select x.id from public.notifications x
      where x.read_at is null
        and x.notification_type in ('task_deadline_alert', 'order_waiting', 'delivery_waiting', 'order_due_soon')
        and x.created_at < now() - interval '24 hours'
      limit greatest(coalesce(p_lo, 5000), 1)
      for update skip locked);
  get diagnostics v_so = row_count;
  return v_so;
end;
$fn$;

-- Chỉ máy chủ (pg_cron) gọi.
revoke all on function public.sumi_don_thong_bao_tu_dong_cu(integer) from public, anon, authenticated;

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'sumi-don-thong-bao-tu-dong-cu-1-phut') then
      perform cron.unschedule('sumi-don-thong-bao-tu-dong-cu-1-phut');
    end if;
    perform cron.schedule('sumi-don-thong-bao-tu-dong-cu-1-phut', '* * * * *',
      'select public.sumi_don_thong_bao_tu_dong_cu(5000)');
  end if;
end $$;

-- Đối chiếu: số nhắc tự động chưa đọc cũ hơn 24h sẽ được dọn dần.
select count(*) as so_nhac_ton_se_don
  from public.notifications
 where read_at is null
   and notification_type in ('task_deadline_alert', 'order_waiting', 'delivery_waiting', 'order_due_soon')
   and created_at < now() - interval '24 hours';

insert into public.migration_runs(migration_key, status, finished_at, notes)
values ('202610270701_tu_don_thong_bao_tu_dong_cu', 'completed', now(),
  'Shipper nhan giao bi statement timeout 26-27/10: notifications ~249k dong (~245k chua doc, nhac tu dong lap lai). sumi_don_thong_bao_tu_dong_cu + pg_cron 1 phut: danh dau DA DOC (khong xoa) task_deadline_alert/order_waiting/delivery_waiting/order_due_soon cu hon 24h, 5000 dong/phut. Kem 202610270700 chi muc notifications(entity_id, notification_type).')
on conflict (migration_key) do update set status = 'completed', finished_at = now(), notes = excluded.notes;

commit;
