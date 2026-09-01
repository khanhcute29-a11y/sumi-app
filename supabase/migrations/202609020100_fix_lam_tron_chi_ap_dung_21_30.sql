-- SỬA LỖI: làm tròn +30 phút đang áp dụng cho MỌI trường hợp trễ >20 phút,
-- kể cả trễ 45 phút, 60 phút... cũng bị ép về đúng +30 — sai, vì như vậy lại
-- "có lợi" cho người trễ rất nặng (ghi nhận ít hơn thực tế).
--
-- QUY ĐỊNH ĐÚNG (bổ sung 01/09/2026): làm tròn +30 phút CHỈ áp dụng cho
-- khung trễ 21–30 phút. Từ phút 31 trở đi, ghi nhận ĐÚNG giờ bấm thật —
-- không làm tròn nữa, để không che bớt mức độ trễ thật sự nặng.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '120s';

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
    -- So với GIỜ GỐC (gio_bat_dau, KHÁC mốc đi-muộn):
    --   ≤20 phút      -> giữ nguyên giờ thật, tính lỗi bình thường.
    --   21..30 phút   -> làm tròn checkin_time thành giờ gốc + 30 phút.
    --   ≥31 phút      -> giữ nguyên giờ thật (KHÔNG làm tròn nữa — trễ nặng
    --                    phải ghi đúng thực tế, không được "làm tròn có lợi").
    v_gio_goc := (v_q->>'gio_bat_dau')::time;
    v_phut_bam := extract(hour from (v_luc at time zone 'Asia/Ho_Chi_Minh'))::int * 60
                + extract(minute from (v_luc at time zone 'Asia/Ho_Chi_Minh'))::int;
    v_phut_goc := extract(hour from v_gio_goc)::int * 60 + extract(minute from v_gio_goc)::int;
    v_lech_goc := v_phut_bam - v_phut_goc;
    if v_lech_goc > 720 then v_lech_goc := v_lech_goc - 1440; end if;
    if v_lech_goc < -720 then v_lech_goc := v_lech_goc + 1440; end if;

    if v_lech_goc > 20 and v_lech_goc <= 30 then
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

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609020100_fix_lam_tron_chi_ap_dung_21_30', 'completed', now(),
  'Fix: làm tròn +30 phút (migration 202609020000) đang áp dụng sai cho MỌI mức trễ >20 phút, kể cả trễ rất nặng (45p, 60p...) cũng bị ép về +30 — có lợi bất hợp lý cho người trễ nặng. Sửa lại: chỉ làm tròn khi trễ đúng khung 21..30 phút; từ phút 31 trở đi ghi nhận đúng giờ bấm thật, không làm tròn.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
