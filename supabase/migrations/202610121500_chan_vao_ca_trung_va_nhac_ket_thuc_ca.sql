-- Chấm công — yêu cầu Giám đốc 12/10/2026, sau khi quét 541 lần vào ca từ 01/09:
--
-- 1) CHẶN VÀO CA LẦN 2 khi lần vào trước CÙNG NGÀY chưa kết thúc.
--    10 lần đã xảy ra: bấm lại sau 1–4 phút (mạng chập chờn -> lần đầu vào hàng
--    đợi offline, màn hình vẫn hiện "Bắt đầu ca" nên bấm lần nữa) hoặc vài tiếng
--    sau bấm nhầm "vào ca" thay vì "kết thúc ca". Lần vào đầu thành "quên chấm
--    ra", công tính sai. Chặn ở DATABASE (AGENTS Bẫy 3) nên mọi đường đều bị
--    chặn: màn chấm công, hàng đợi offline, link mở từ thông báo.
--    Không chặn: ca "[BỔ SUNG]" (form bổ sung đã tự kiểm tra trùng giờ — xem
--    src/lib/boSungCa.js), và lần vào ca của NGÀY KHÁC (quên chấm ra hôm qua
--    vẫn vào ca hôm nay được).
--
-- 2) NHẮC KẾT THÚC CA — CHỈ người còn ca mở trong ngày (lần chấm cuối cùng
--    hôm nay là "vào"). 45 lần quên chấm ra là vào ca rồi không chấm gì thêm.
--    Nhắc 2 lần, mỗi lần đúng 1 người 1 lần (event_key chống trùng):
--      lần 1: 1 tiếng sau giờ tan ca chuẩn của người đó (theo ca của lần vào
--             ĐẦU TIÊN trong ngày, có tính giờ làm riêng — sumi_doi_chieu_cham_cong;
--             không theo ca cố định thì lấy giờ vào đầu tiên + 9 tiếng);
--      lần 2: 21:30 (cuối ngày) nếu vẫn chưa kết thúc.
--    pg_cron riêng mỗi 10 phút — KHÔNG gộp vào process_task_reminders_and_deadlines
--    (hàm đó đã bị nhiều migration viết lại, gộp vào dễ làm mất phần của người khác).
--
-- Gỡ: drop trigger sumi_chan_vao_ca_trung_tg on public.shift_logs;
--     select cron.unschedule('sumi-nhac-ket-thuc-ca-10-phut');
begin;
set local lock_timeout = '10s';
set local statement_timeout = '30s';

-- ── 1. Chặn vào ca trùng ───────────────────────────────────────────────────
create or replace function public.sumi_chan_vao_ca_trung()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare
  v_cuoi record;
begin
  if NEW.type is distinct from 'checkin' then return NEW; end if;
  if NEW.staff_id is null or NEW.work_date is null then return NEW; end if;
  if coalesce(NEW.reason, '') like '[BỔ SUNG]%' then return NEW; end if;

  -- 2 lần bấm gần như cùng lúc: lần sau phải chờ lần trước ghi xong mới kiểm tra.
  perform pg_advisory_xact_lock(hashtextextended('sumi_vao_ca:' || NEW.staff_id::text, 0));

  -- Lần chấm cuối cùng TRƯỚC lần vào này — ghép cặp theo thời gian giống
  -- get_staff_attendance_detail (không chia theo work_date).
  select type, checkin_time, work_date into v_cuoi
    from public.shift_logs
   where staff_id = NEW.staff_id and type in ('checkin', 'checkout')
     and checkin_time is not null
     and checkin_time <= coalesce(NEW.checkin_time, now())
   order by checkin_time desc
   limit 1;

  if found and v_cuoi.type = 'checkin' and v_cuoi.work_date = NEW.work_date then
    raise exception 'Bạn đang trong ca từ % (chưa kết thúc). Đang làm tiếp thì không cần chấm lại; đã nghỉ thì bấm "Kết thúc ca" trước rồi mới chấm ca mới.',
      to_char(v_cuoi.checkin_time at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI')
      using errcode = 'P0001';
  end if;
  return NEW;
end;
$fn$;

drop trigger if exists sumi_chan_vao_ca_trung_tg on public.shift_logs;
create trigger sumi_chan_vao_ca_trung_tg
  before insert on public.shift_logs
  for each row execute function public.sumi_chan_vao_ca_trung();

-- ── 2. Nhắc kết thúc ca ────────────────────────────────────────────────────
create or replace function public.sumi_nhac_ket_thuc_ca()
returns integer language plpgsql security definer set search_path = public as $fn$
declare
  v_now    timestamptz := now();
  v_ngay   date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_cuoi_ngay timestamptz := (((now() at time zone 'Asia/Ho_Chi_Minh')::date) + time '21:30') at time zone 'Asia/Ho_Chi_Minh';
  r        record;
  v_dau    timestamptz;
  v_q      jsonb;
  v_het    timestamptz;
  v_vao    text;
  v_count  int := 0;
begin
  for r in
    select distinct on (sl.staff_id) sl.id, sl.staff_id, sl.type, sl.checkin_time
      from public.shift_logs sl
     where sl.work_date = v_ngay and sl.type in ('checkin', 'checkout')
       and sl.checkin_time is not null and sl.checkin_time <= v_now
     order by sl.staff_id, sl.checkin_time desc
  loop
    continue when r.type <> 'checkin'; -- đã kết thúc ca -> không nhắc

    select min(checkin_time) into v_dau
      from public.shift_logs
     where staff_id = r.staff_id and work_date = v_ngay and type = 'checkin';

    v_het := null;
    begin
      v_q := public.sumi_doi_chieu_cham_cong(r.staff_id, v_dau);
      if coalesce((v_q->>'co_ca')::boolean, false) and v_q->>'gio_ket_thuc' is not null then
        v_het := (v_ngay + (v_q->>'gio_ket_thuc')::time) at time zone 'Asia/Ho_Chi_Minh';
        if v_het <= v_dau then v_het := v_het + interval '1 day'; end if;
      end if;
    exception when others then
      v_het := null;
    end;
    if v_het is null then v_het := v_dau + interval '9 hours'; end if;

    v_vao := to_char(r.checkin_time at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI');

    -- Lần 1: 1 tiếng sau giờ tan ca chuẩn (và lần vào này đã được ít nhất 1 tiếng).
    if v_now >= v_het + interval '1 hour' and v_now >= r.checkin_time + interval '1 hour' then
      insert into public.notifications(
        event_key, recipient_profile_id, notification_type, severity, sound_key,
        title, body, entity_type, entity_id, deep_link)
      values (
        'nhac-ket-thuc-ca:' || r.id || ':1', r.staff_id, 'shift_checkout_reminder', 'warning', 'ting',
        '⏰ Bạn chưa kết thúc ca',
        'Bạn vào ca lúc ' || v_vao || ' và chưa bấm "Kết thúc ca". Nếu đã về, mở app bấm Kết thúc ca để không mất công.',
        'shift_log', r.id, '/shifts')
      on conflict (event_key) do nothing;
      if found then
        v_count := v_count + 1;
        perform public.notify_push('⏰ Bạn chưa kết thúc ca',
          'Vào ca lúc ' || v_vao || ', chưa bấm Kết thúc ca. Nếu đã về, mở app bấm Kết thúc ca nhé.',
          '/shifts', r.staff_id);
      end if;
    end if;

    -- Lần 2: cuối ngày 21:30, vẫn chưa kết thúc.
    if v_now >= v_cuoi_ngay and v_now >= v_het then
      insert into public.notifications(
        event_key, recipient_profile_id, notification_type, severity, sound_key,
        title, body, entity_type, entity_id, deep_link)
      values (
        'nhac-ket-thuc-ca:' || r.id || ':2', r.staff_id, 'shift_checkout_reminder', 'warning', 'ting',
        '⏰ Cuối ngày rồi — bạn chưa kết thúc ca',
        'Ca từ ' || v_vao || ' hôm nay vẫn chưa kết thúc. Nếu đã về, mở app bấm Kết thúc ca; quên giờ về thì dùng "Bổ sung ca".',
        'shift_log', r.id, '/shifts')
      on conflict (event_key) do nothing;
      if found then
        v_count := v_count + 1;
        perform public.notify_push('⏰ Cuối ngày — chưa kết thúc ca',
          'Ca từ ' || v_vao || ' vẫn chưa kết thúc. Mở app bấm Kết thúc ca nhé.',
          '/shifts', r.staff_id);
      end if;
    end if;
  end loop;

  return v_count;
end;
$fn$;

-- Chỉ máy chủ (pg_cron) gọi — nhân viên không tự gọi được để bắn chuông người khác.
revoke all on function public.sumi_nhac_ket_thuc_ca() from public, anon, authenticated;

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'sumi-nhac-ket-thuc-ca-10-phut') then
      perform cron.unschedule('sumi-nhac-ket-thuc-ca-10-phut');
    end if;
    perform cron.schedule('sumi-nhac-ket-thuc-ca-10-phut', '*/10 * * * *', 'select public.sumi_nhac_ket_thuc_ca()');
  end if;
end $$;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values ('202610121500_chan_vao_ca_trung_va_nhac_ket_thuc_ca', 'completed', now(),
  'Trigger sumi_chan_vao_ca_trung (BEFORE INSERT shift_logs): chan checkin moi khi lan cham cuoi cung truoc do la checkin CUNG work_date (tru [BO SUNG]); advisory lock theo staff chong bam 2 lan. Ham sumi_nhac_ket_thuc_ca + pg_cron sumi-nhac-ket-thuc-ca-10-phut: chi nguoi con ca mo hom nay, lan 1 = gio tan ca chuan (sumi_doi_chieu_cham_cong theo lan vao dau ngay, mac dinh +9h) + 1 tieng, lan 2 = 21:30; notifications recipient_profile_id + notify_push dich danh, event_key chong trung.')
on conflict (migration_key) do update set status = 'completed', finished_at = now(), notes = excluded.notes;

commit;
