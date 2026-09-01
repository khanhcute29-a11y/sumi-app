-- Logic Xử lý Đi Trễ & Làm Tròn + Audio Push nhắc vào vị trí.
--
-- QUY ĐỊNH ĐÃ CÓ SẴN (không cần thêm gì): "phải tới sớm 10 phút trước giờ vào
-- ca" đã tồn tại từ migration 202608260070 — cột
-- `sumi_quy_dinh_ca.phut_den_som_toi_thieu` (mặc định 10), dùng để tính mốc
-- "không muộn" (gio_bat_dau − 10 phút). Không đụng lại phần này.
--
-- MỚI Ở MIGRATION NÀY — 2 việc:
--
-- 1) LÀM TRÒN +30 PHÚT khi bấm "Bắt đầu ca" trễ hơn 20 phút so với GIỜ GỐC
--    (gio_bat_dau, KHÁC với mốc đi-muộn ở trên). Ví dụ ca 6h00: bấm lúc 6h25
--    (đã trễ 25 phút so với giờ gốc, quá 20) -> hệ thống ghi nhận check-in là
--    6h30 thay vì 6h25 thật. Trễ ≤20 phút thì vẫn ghi đúng giờ bấm thật, tính
--    lỗi bình thường như cũ (không đổi gì nhánh này).
--    Sửa NGAY TRONG trigger `sumi_tu_tinh_di_muon` (không tạo trigger chồng
--    trigger — dễ loạn thứ tự chạy) bằng CREATE OR REPLACE, giữ nguyên toàn bộ
--    phần logic cũ (bỏ qua ca BỔ SUNG, ngoài khung ca...), chỉ chèn thêm bước
--    làm tròn TRƯỚC khi gọi sumi_doi_chieu_cham_cong lần cuối.
--
-- 2) AUDIO PUSH nhắc "vào vị trí" khi đã quá 20 phút mà CHƯA bấm Bắt đầu ca.
--    Đây là nhắc TRƯỚC khi họ bấm (khác với việc làm tròn ở trên xảy ra SAU
--    khi họ bấm) nên không thể nằm trong trigger insert — phải quét định kỳ.
--    Dùng lại ĐÚNG cron job mỗi phút đã có (sumi-task-reminders-every-minute),
--    không tạo job mới — gộp vào process_task_reminders_and_deadlines().
--    Dùng notify_push() có sẵn (Web Push thật qua VAPID, đánh thức được máy
--    tắt màn hình) — CHỨ KHÔNG chỉ insert bảng notifications (cách đó chỉ kêu
--    khi app đang mở, không đánh thức được điện thoại khoá màn hình).
begin;
set local lock_timeout = '10s';
set local statement_timeout = '120s';

-- ---------------------------------------------------------------------------
-- 1. Làm tròn +30 phút khi bấm Bắt đầu ca trễ hơn 20 phút so với giờ gốc.
-- ---------------------------------------------------------------------------
create or replace function public.sumi_tu_tinh_di_muon()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare
  v_q          jsonb;
  v_luc        timestamptz;
  v_phut_bam   int;
  v_phut_goc   int;
  v_lech_goc   int;
  v_gio_goc    time;
begin
  if NEW.type is distinct from 'checkin' then return NEW; end if;
  if NEW.staff_id is null then return NEW; end if;

  -- Ca BỔ SUNG (quên chấm, quản lý nhập bù): giữ nguyên như người nhập đã ghi,
  -- không làm tròn (đây là giờ quản lý gõ tay, không phải giờ bấm thật).
  if NEW.reason like '[BỔ SUNG]%' then return NEW; end if;

  v_luc := coalesce(NEW.checkin_time, now());
  v_q := public.sumi_doi_chieu_cham_cong(NEW.staff_id, v_luc);

  if (v_q->>'co_ca')::boolean then
    -- Trễ hơn 20 phút so với GIỜ GỐC (gio_bat_dau) -> làm tròn checkin_time
    -- thành đúng giờ gốc + 30 phút, RỒI đối chiếu lại từ con số đã làm tròn đó
    -- (late_minutes vẫn tính đúng theo mốc như bình thường, chỉ đổi thời điểm
    -- checkin_time làm gốc tính). Trễ ≤20 phút: giữ nguyên checkin_time thật.
    v_gio_goc := (v_q->>'gio_bat_dau')::time;
    v_phut_bam := extract(hour from (v_luc at time zone 'Asia/Ho_Chi_Minh'))::int * 60
                + extract(minute from (v_luc at time zone 'Asia/Ho_Chi_Minh'))::int;
    v_phut_goc := extract(hour from v_gio_goc)::int * 60 + extract(minute from v_gio_goc)::int;
    v_lech_goc := v_phut_bam - v_phut_goc;
    if v_lech_goc > 720 then v_lech_goc := v_lech_goc - 1440; end if;
    if v_lech_goc < -720 then v_lech_goc := v_lech_goc + 1440; end if;

    if v_lech_goc > 20 then
      NEW.checkin_time := ((NEW.work_date::text || ' ' || to_char(v_gio_goc, 'HH24:MI') || ':00')::timestamp
                           at time zone 'Asia/Ho_Chi_Minh') + interval '30 minutes';
      v_q := public.sumi_doi_chieu_cham_cong(NEW.staff_id, NEW.checkin_time);
    end if;
  end if;

  if (v_q->>'co_ca')::boolean then
    NEW.expected_start := (v_q->>'gio_bat_dau')::time;
    NEW.late_minutes   := (v_q->>'phut_muon')::int;
  else
    NEW.expected_start := null;
    NEW.late_minutes   := 0;
  end if;
  return NEW;
end;
$fn$;

-- Trigger đã tồn tại, CREATE OR REPLACE function ở trên là đủ — không cần tạo
-- lại trigger (vẫn trỏ đúng function này).

-- ---------------------------------------------------------------------------
-- 2. Quét mỗi phút: ai chưa bấm Bắt đầu ca mà đã quá 20 phút so với giờ gốc
--    của ca gần nhất -> đẩy Audio Push thật (đánh thức màn hình khoá).
--    Chỉ bắn 1 lần/người/ca/ngày nhờ unique event_key trên notifications.
-- ---------------------------------------------------------------------------
create or replace function public.process_late_checkin_alerts()
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_now      timestamptz := now();
  v_ngay     date := (v_now at time zone 'Asia/Ho_Chi_Minh')::date;
  v_count    integer := 0;
  r          record;
  v_ca       record;
  v_min_d    int;
  v_ma_ca    text;
  v_ten_ca   text;
  v_phut_now int;
  v_phut_goc int;
  v_d        int;
  v_lech     int;
begin
  v_phut_now := extract(hour from (v_now at time zone 'Asia/Ho_Chi_Minh'))::int * 60
              + extract(minute from (v_now at time zone 'Asia/Ho_Chi_Minh'))::int;

  for r in
    select p.id as staff_id, p.full_name, public.sumi_bo_phan_cham_cong(p.id) as bo_phan
    from public.profiles p
    where p.approved = true and p.active is distinct from false
  loop
    if r.bo_phan is null then continue; end if;

    if exists (
      select 1 from public.shift_logs sl
      where sl.staff_id = r.staff_id and sl.type = 'checkin' and sl.work_date = v_ngay
    ) then continue; end if;

    if exists (
      select 1 from public.shift_logs sl
      where sl.staff_id = r.staff_id and sl.type = 'leave_request' and sl.work_date = v_ngay
    ) then continue; end if;

    -- Ca GẦN GIỜ HIỆN TẠI NHẤT của bộ phận này (giống cách sumi_doi_chieu_cham_cong
    -- chọn ca, nhưng so theo GIỜ GỐC chứ không phải mốc, vì đây là nhắc "vào vị
    -- trí" đúng giờ ca bắt đầu, không phải tính lỗi đi muộn).
    v_min_d := 2147483647; v_ma_ca := null; v_ten_ca := null; v_lech := null;
    for v_ca in select * from public.sumi_quy_dinh_ca where bo_phan = r.bo_phan and active loop
      v_phut_goc := extract(hour from v_ca.gio_bat_dau)::int * 60 + extract(minute from v_ca.gio_bat_dau)::int;
      v_d := abs(v_phut_now - v_phut_goc);
      if v_d > 720 then v_d := 1440 - v_d; end if;
      if v_d < v_min_d then
        v_min_d := v_d; v_ma_ca := v_ca.ma_ca; v_ten_ca := v_ca.ten_ca;
        v_lech := v_phut_now - v_phut_goc;
        if v_lech > 720 then v_lech := v_lech - 1440; end if;
        if v_lech < -720 then v_lech := v_lech + 1440; end if;
      end if;
    end loop;

    -- Cửa sổ 21..90 phút SAU giờ gốc: đủ trễ để đáng nhắc, nhưng không nhắc
    -- tràn lan cả ngày nếu hôm đó họ không làm ca này.
    if v_ma_ca is not null and v_lech between 21 and 90 then
      insert into public.notifications(
        event_key, recipient_profile_id, notification_type, severity, sound_key,
        title, body, entity_type, entity_id, deep_link)
      values(
        'late_checkin_alert:' || r.staff_id || ':' || v_ngay || ':' || v_ma_ca,
        r.staff_id, 'late_checkin_alert', 'urgent', 'silent',
        '⏰ Vào vị trí ngay — đã trễ ca hơn 20 phút',
        'Ca "' || v_ten_ca || '" đã bắt đầu — bấm "Bắt đầu ca" ngay để chấm công.',
        'shift_reminder', r.staff_id, '/shifts')
      on conflict(event_key) do nothing;

      if found then
        v_count := v_count + 1;
        perform public.notify_push(
          '⏰ Vào vị trí ngay',
          'Ca "' || v_ten_ca || '" đã bắt đầu hơn 20 phút — bấm "Bắt đầu ca" để chấm công.',
          '/shifts', r.staff_id);
      end if;
    end if;
  end loop;

  return v_count;
end;
$fn$;

revoke all on function public.process_late_checkin_alerts() from public, anon;
grant execute on function public.process_late_checkin_alerts() to authenticated;

-- Gộp vào ĐÚNG hàm cron mỗi phút đã có — không tạo cron job mới.
create or replace function public.process_task_reminders_and_deadlines()
returns integer language plpgsql security definer set search_path=public as $$
declare v1 integer; v2 integer; v3 integer;
begin
 v1 := public.process_task_reminders();
 v2 := public.process_task_deadline_alerts();
 v3 := public.process_late_checkin_alerts();
 return coalesce(v1,0) + coalesce(v2,0) + coalesce(v3,0);
end $$;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609020000_lam_tron_di_tre_va_nhac_audio', 'completed', now(),
  'Time Penalty Logic: sumi_tu_tinh_di_muon giờ làm tròn checkin_time thành giờ gốc ca (gio_bat_dau) +30 phút khi bấm Bắt đầu ca trễ hơn 20 phút so với giờ gốc (trễ ≤20 phút vẫn ghi đúng giờ thật, không đổi). Thêm process_late_checkin_alerts() quét mỗi phút (gộp vào cron sumi-task-reminders-every-minute có sẵn, không tạo job mới) — ai quá 20 phút chưa bấm Bắt đầu ca thì nhận Audio Push thật qua notify_push() (Web Push/VAPID, đánh thức được màn hình khoá), dedup 1 lần/người/ca/ngày qua event_key. Quy định tới sớm 10 phút đã có sẵn từ 202608260070 (phut_den_som_toi_thieu), không cần thêm.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
