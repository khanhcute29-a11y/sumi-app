-- Chấm công — Giám đốc chốt luồng 12/10/2026 (tiếp theo 202610121500):
--
-- 1) Chuông nhắc chỉ là NHẮC, không bắt buộc bấm. Nhắc cuối ngày đổi từ 21:30
--    thành 2 lần 20:30 và 21:00 (chỉ ai còn ca mở hôm nay, đã quá giờ tan ca).
-- 2) Nhân viên CHỈ tự bổ sung được trong NGÀY HÔM NAY. Qua ngày mới thì ca quên
--    của hôm trước để nguyên, Giám đốc xử lý (chặn luôn kiểu tự khai trước
--    07:30–16:30 hay khai bù ngày cũ). Giám đốc (owner/admin) không bị chặn.
--    Áp cho mọi dòng vào/ra mà nhân viên tự ghi: giờ phải nằm trong hôm nay và
--    không được ở tương lai (quá 5 phút). Hàng đợi offline đồng bộ trễ vẫn qua
--    vì dòng đó lấy giờ lúc đồng bộ.
-- 3) Giám đốc sửa cho nhân viên NGAY TRONG APP qua sumi_gd_bo_sung_cham_cong
--    (SECURITY DEFINER, chỉ is_business_director()) — không phụ thuộc RLS ghi
--    của shift_logs. Database tự kiểm tra: lần vào phải còn mở, giờ ra trước
--    lần chấm kế tiếp, ca thêm mới không chồng lên ca đã có.
-- 4) Câu báo khi bấm vào ca lần 2 (sumi_chan_vao_ca_trung): nói rõ cứ làm tiếp,
--    nghỉ trưa 11:30–12:30 tự trừ — không cần chấm lại.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '30s';

-- ── 4. Câu báo chặn vào ca lần 2 ──────────────────────────────────────────
create or replace function public.sumi_chan_vao_ca_trung()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare
  v_cuoi record;
begin
  if NEW.type is distinct from 'checkin' then return NEW; end if;
  if NEW.staff_id is null or NEW.work_date is null then return NEW; end if;
  if coalesce(NEW.reason, '') like '[BỔ SUNG]%' then return NEW; end if;

  perform pg_advisory_xact_lock(hashtextextended('sumi_vao_ca:' || NEW.staff_id::text, 0));

  select type, checkin_time, work_date into v_cuoi
    from public.shift_logs
   where staff_id = NEW.staff_id and type in ('checkin', 'checkout')
     and checkin_time is not null
     and checkin_time <= coalesce(NEW.checkin_time, now())
   order by checkin_time desc
   limit 1;

  if found and v_cuoi.type = 'checkin' and v_cuoi.work_date = NEW.work_date then
    raise exception 'Bạn vẫn đang trong ca từ % — không cần chấm lại, cứ làm tiếp, cuối ngày bấm "Kết thúc ca". Giờ nghỉ trưa 11:30–12:30 được tự trừ.',
      to_char(v_cuoi.checkin_time at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI')
      using errcode = 'P0001';
  end if;
  return NEW;
end;
$fn$;

-- ── 2. Nhân viên chỉ ghi vào/ra trong hôm nay ─────────────────────────────
create or replace function public.sumi_chan_cham_cong_ngay_cu()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare
  v_dau_ngay timestamptz := (((now() at time zone 'Asia/Ho_Chi_Minh')::date)::timestamp) at time zone 'Asia/Ho_Chi_Minh';
  v_homnay   date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_luc      timestamptz := coalesce(NEW.checkin_time, now());
begin
  if NEW.type not in ('checkin', 'checkout') then return NEW; end if;
  -- Chạy từ SQL Editor / pg_cron (không có người đăng nhập) hoặc Giám đốc -> không chặn.
  if auth.uid() is null or public.is_business_director() then return NEW; end if;

  if v_luc > now() + interval '5 minutes' then
    raise exception 'Giờ chấm công chưa tới. Chỉ ghi được giờ đã qua.' using errcode = 'P0001';
  end if;
  if v_luc < v_dau_ngay
     or (coalesce(NEW.reason, '') like '[BỔ SUNG]%' and NEW.work_date is distinct from v_homnay) then
    raise exception 'Ca của ngày đã qua chỉ Giám đốc mới bổ sung/sửa được. Bạn báo Giám đốc để xử lý nhé.'
      using errcode = 'P0001';
  end if;
  return NEW;
end;
$fn$;

drop trigger if exists sumi_chan_cham_cong_ngay_cu_tg on public.shift_logs;
create trigger sumi_chan_cham_cong_ngay_cu_tg
  before insert on public.shift_logs
  for each row execute function public.sumi_chan_cham_cong_ngay_cu();

-- ── 3. Giám đốc bổ sung/sửa chấm công cho nhân viên ───────────────────────
-- p_lan_vao_id có giá trị  -> chỉ THÊM GIỜ RA cho lần vào đó (đang còn mở).
-- p_lan_vao_id = null       -> thêm 1 CA MỚI p_gio_vao -> p_gio_ra.
create or replace function public.sumi_gd_bo_sung_cham_cong(
  p_staff_id uuid, p_lan_vao_id uuid, p_gio_vao timestamptz, p_gio_ra timestamptz, p_ghi_chu text default null
) returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_ten     text;
  v_vao     public.shift_logs%rowtype;
  v_sau     record;
  v_ngay    date;
  v_ca      text;
  v_nhanh   text;
  v_ghi     text := nullif(btrim(coalesce(p_ghi_chu, '')), '');
  v_trung   record;
begin
  if not public.is_business_director() then
    raise exception 'Chỉ Giám đốc mới sửa được chấm công của nhân viên.' using errcode = 'P0001';
  end if;
  if p_staff_id is null or p_gio_ra is null then
    raise exception 'Thiếu nhân viên hoặc giờ ra.' using errcode = 'P0001';
  end if;
  if p_gio_ra > now() + interval '5 minutes' then
    raise exception 'Giờ ra chưa tới.' using errcode = 'P0001';
  end if;
  select full_name into v_ten from public.profiles where id = p_staff_id;
  if v_ten is null then raise exception 'Không tìm thấy nhân viên.' using errcode = 'P0001'; end if;

  perform pg_advisory_xact_lock(hashtextextended('sumi_vao_ca:' || p_staff_id::text, 0));

  if p_lan_vao_id is not null then
    select * into v_vao from public.shift_logs
     where id = p_lan_vao_id and staff_id = p_staff_id and type = 'checkin';
    if v_vao.id is null then raise exception 'Không tìm thấy lần vào ca này.' using errcode = 'P0001'; end if;
    if p_gio_ra <= v_vao.checkin_time then
      raise exception 'Giờ ra phải sau giờ vào.' using errcode = 'P0001';
    end if;
    select type, checkin_time into v_sau from public.shift_logs
     where staff_id = p_staff_id and type in ('checkin', 'checkout') and checkin_time is not null
       and checkin_time > v_vao.checkin_time
     order by checkin_time limit 1;
    if found and v_sau.type = 'checkout' then
      raise exception 'Lần vào ca này đã có giờ ra rồi.' using errcode = 'P0001';
    end if;
    if found and p_gio_ra >= v_sau.checkin_time then
      raise exception 'Giờ ra phải trước lần chấm công kế tiếp (%).',
        to_char(v_sau.checkin_time at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM') using errcode = 'P0001';
    end if;

    insert into public.shift_logs(staff_id, staff_name, work_date, shift_label, branch, type, checkin_time, reason)
    values (p_staff_id, v_ten, v_vao.work_date, v_vao.shift_label, v_vao.branch, 'checkout', p_gio_ra,
            '[BỔ SUNG][Giám đốc] Thêm giờ ra' || coalesce(' — ' || v_ghi, ''));
    return jsonb_build_object('thanh_cong', true, 'loai', 'them_gio_ra');
  end if;

  -- Ca mới
  if p_gio_vao is null or p_gio_ra <= p_gio_vao then
    raise exception 'Giờ ra phải sau giờ vào.' using errcode = 'P0001';
  end if;
  -- Không chồng lên ca đã có (kể cả ca đang mở / quên chấm ra) — ghép cặp theo thời gian.
  for v_trung in
    select e.checkin_time as bat_dau,
           coalesce(lead(e.checkin_time) over (order by e.checkin_time), now()) as ket_thuc,
           e.type
      from public.shift_logs e
     where e.staff_id = p_staff_id and e.type in ('checkin', 'checkout') and e.checkin_time is not null
  loop
    if v_trung.type = 'checkin' and p_gio_vao < v_trung.ket_thuc and p_gio_ra > v_trung.bat_dau then
      raise exception 'Trùng với ca bắt đầu lúc % — chọn lần vào đó để thêm giờ ra thay vì tạo ca mới.',
        to_char(v_trung.bat_dau at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM') using errcode = 'P0001';
    end if;
  end loop;

  v_ngay := (p_gio_vao at time zone 'Asia/Ho_Chi_Minh')::date;
  select shift_label, branch into v_ca, v_nhanh from public.shift_logs
   where staff_id = p_staff_id and type = 'checkin' and shift_label is not null
   order by checkin_time desc limit 1;

  insert into public.shift_logs(staff_id, staff_name, work_date, shift_label, branch, type, checkin_time, reason, late_minutes)
  values (p_staff_id, v_ten, v_ngay, coalesce(v_ca, 'Ca làm việc'), v_nhanh, 'checkin', p_gio_vao,
          '[BỔ SUNG][Giám đốc] Thêm ca' || coalesce(' — ' || v_ghi, ''), 0);
  insert into public.shift_logs(staff_id, staff_name, work_date, shift_label, branch, type, checkin_time, reason)
  values (p_staff_id, v_ten, v_ngay, coalesce(v_ca, 'Ca làm việc'), v_nhanh, 'checkout', p_gio_ra,
          '[BỔ SUNG][Giám đốc] Thêm ca' || coalesce(' — ' || v_ghi, ''));
  return jsonb_build_object('thanh_cong', true, 'loai', 'them_ca');
end;
$fn$;

revoke all on function public.sumi_gd_bo_sung_cham_cong(uuid, uuid, timestamptz, timestamptz, text) from public, anon;
grant execute on function public.sumi_gd_bo_sung_cham_cong(uuid, uuid, timestamptz, timestamptz, text) to authenticated;

-- ── 1. Nhắc kết thúc ca: lần 1 giữ nguyên, cuối ngày 20:30 + 21:00 ─────────
create or replace function public.sumi_nhac_ket_thuc_ca()
returns integer language plpgsql security definer set search_path = public as $fn$
declare
  v_now    timestamptz := now();
  v_ngay   date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_mocs   time[] := array[time '20:30', time '21:00'];
  v_moc    timestamptz;
  i        int;
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

    -- Lần 1: 1 tiếng sau giờ tan ca chuẩn.
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

    -- Cuối ngày: 20:30 và 21:00 (mốc 2 và 3), chỉ khi đã quá giờ tan ca.
    for i in 1 .. array_length(v_mocs, 1) loop
      v_moc := (v_ngay + v_mocs[i]) at time zone 'Asia/Ho_Chi_Minh';
      if v_now >= v_moc and v_now >= v_het then
        insert into public.notifications(
          event_key, recipient_profile_id, notification_type, severity, sound_key,
          title, body, entity_type, entity_id, deep_link)
        values (
          'nhac-ket-thuc-ca:' || r.id || ':' || (i + 1), r.staff_id, 'shift_checkout_reminder', 'warning', 'ting',
          '⏰ Cuối ngày rồi — bạn chưa kết thúc ca',
          'Ca từ ' || v_vao || ' hôm nay vẫn chưa kết thúc. Nếu đã về, mở app bấm Kết thúc ca (qua ngày mai chỉ Giám đốc sửa được).',
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
  end loop;

  return v_count;
end;
$fn$;

revoke all on function public.sumi_nhac_ket_thuc_ca() from public, anon, authenticated;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values ('202610121630_bo_sung_ca_trong_ngay_va_giam_doc_sua', 'completed', now(),
  'Nhac cuoi ngay 20:30 + 21:00 (thay 21:30). Trigger sumi_chan_cham_cong_ngay_cu: nhan vien (khong phai Giam doc, co auth.uid) chi ghi vao/ra trong hom nay, khong tuong lai >5 phut, [BO SUNG] phai work_date hom nay. RPC sumi_gd_bo_sung_cham_cong (chi is_business_director): them gio ra cho lan vao con mo hoac them ca moi khong chong gio. Doi cau bao sumi_chan_vao_ca_trung.')
on conflict (migration_key) do update set status = 'completed', finished_at = now(), notes = excluded.notes;

commit;
