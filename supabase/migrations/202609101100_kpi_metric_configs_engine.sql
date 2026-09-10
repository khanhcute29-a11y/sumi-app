-- SUMI KPI — mô hình tính điểm theo trọng số (đánh giá bên ngoài lần 3).
-- Thay "10 ô số rời không nói lên điều gì" bằng 1 điểm tổng hợp 0-100 theo
-- vị trí, có thể giải trình từng phần đóng góp.
--
-- QUAN TRỌNG (đã kiểm tra dữ liệu thật trước khi seed config):
--   - "chuyen_can" (chuyên cần): CÓ dữ liệu thật (shift_logs.late_minutes),
--     seed cho cả 4 vị trí.
--   - "tỷ lệ bánh lỗi", "hao hụt NL", "khiếu nại khách", "sự cố gây ra":
--     production_batches có đúng cột (waste_quantity/actual_quantity) NHƯNG
--     0 dòng dữ liệu gần đây (module này chưa ai dùng thật) — incident_reports
--     chỉ ghi "ai BÁO CÁO" chứ không ghi "ai GÂY RA". KHÔNG seed các chỉ số
--     này để tránh bịa số — min_sample sẽ tự loại chúng khỏi công thức nếu
--     sau này có seed mà chưa đủ dữ liệu, đúng tinh thần "thiếu dữ liệu thì
--     chia lại trọng số, không cho 0 điểm".
--   - Vai trò dùng ĐÚNG giá trị thật trong profiles.role (bakery, shipper,
--     sale, kitchen_lead, kitchen_deputy) — không dùng tên ví dụ trong tài
--     liệu gốc (tho_banh/ban_hang/bep) vì không khớp dữ liệu thật.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '30s';

create table if not exists public.kpi_metric_configs (
  id uuid primary key default gen_random_uuid(),
  role text not null,
  metric_code text not null,
  label text not null,
  weight int not null check (weight > 0 and weight <= 30),
  direction text not null check (direction in ('cao_tot','thap_tot')),
  target numeric not null,
  floor_value numeric not null,
  min_sample int not null default 5,
  effective_from date not null default current_date,
  effective_to date,
  created_at timestamptz not null default now(),
  unique (role, metric_code, effective_from)
);

alter table public.kpi_metric_configs enable row level security;

drop policy if exists "director manage kpi configs" on public.kpi_metric_configs;
create policy "director manage kpi configs" on public.kpi_metric_configs
  for all using (public.is_business_director()) with check (public.is_business_director());

drop policy if exists "staff read kpi configs" on public.kpi_metric_configs;
create policy "staff read kpi configs" on public.kpi_metric_configs
  for select using (auth.role() = 'authenticated');

revoke all on public.kpi_metric_configs from anon;
grant select on public.kpi_metric_configs to authenticated;
grant insert, update, delete on public.kpi_metric_configs to authenticated;

-- Chỉ seed "chuyên cần" — chỉ số DUY NHẤT hiện có dữ liệu thật đầy đủ cho cả
-- 4 vị trí. target=0 lần trễ, floor=8 lần trễ trong kỳ (mốc ví dụ trong tài
-- liệu) — sếp nên chỉnh lại target/floor cho khớp thực tế tiệm qua UI sau.
insert into public.kpi_metric_configs (role, metric_code, label, weight, direction, target, floor_value, min_sample, effective_from)
select role, 'chuyen_can', 'Chuyên cần (số lần đi trễ)', 20, 'thap_tot', 0, 8, 3, current_date
from unnest(array['bakery','shipper','sale','kitchen_lead','kitchen_deputy','cashier','warehouse']) as role
on conflict (role, metric_code, effective_from) do nothing;

-- ---------------------------------------------------------------------------
-- Hàm tính điểm — port đúng thuật toán chuanHoa()/tinhDiemKPI() trong tài
-- liệu sang SQL: chỉ số nào không đủ min_sample bị loại KHỎI công thức và
-- chia lại trọng số cho các chỉ số còn lại, KHÔNG cho 0 điểm. Nếu không còn
-- chỉ số nào đủ dữ liệu -> trả score=null, nhãn "Chưa đủ dữ liệu".
-- ---------------------------------------------------------------------------
create or replace function public.compute_kpi_score(p_staff_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_actor uuid := auth.uid();
  v_role  text;
  v_cfg   record;
  v_gia_tri numeric;
  v_sample  int;
  v_diem    numeric;
  v_chi_tiet jsonb := '[]'::jsonb;
  v_tong_trong_so numeric := 0;
  v_tong_dong_gop numeric := 0;
  v_so_dung int := 0;
  v_tong_chi_so int := 0;
begin
  if v_actor is null or (v_actor <> p_staff_id and not public.is_business_director()) then
    raise exception 'KPI access denied';
  end if;
  if p_to < p_from or p_to - p_from > 366 then
    raise exception 'invalid KPI date range';
  end if;

  select role into v_role from public.profiles where id = p_staff_id;
  if v_role is null then
    return jsonb_build_object('score', null, 'label', 'Không tìm thấy nhân sự', 'chi_tiet', '[]'::jsonb);
  end if;

  -- Vòng 1: tính giá trị thô + sample_size cho từng chỉ số đang áp dụng cho
  -- vai trò này, xem đủ min_sample không.
  for v_cfg in
    select * from public.kpi_metric_configs
    where role = v_role and effective_from <= p_to and (effective_to is null or effective_to >= p_from)
  loop
    v_gia_tri := null; v_sample := 0;

    if v_cfg.metric_code = 'chuyen_can' then
      select count(*) filter (where late_minutes > 0), count(*)
        into v_gia_tri, v_sample
      from public.shift_logs
      where staff_id = p_staff_id and type = 'checkin' and work_date between p_from and p_to;
    end if;
    -- Các metric_code khác (san_luong_gio, ty_le_loi, hao_hut, khieu_nai...)
    -- chưa có nguồn dữ liệu thật kiểm chứng được — cố tình CHƯA cài nhánh
    -- tính, để nếu sau này ai seed config mới mà quên nối dữ liệu thì hàm
    -- trả sample_size=0 (bị loại đúng theo thiết kế) thay vì âm thầm bịa số 0.

    v_tong_chi_so := v_tong_chi_so + 1;

    if v_gia_tri is not null and v_sample >= v_cfg.min_sample then
      v_so_dung := v_so_dung + 1;
      v_tong_trong_so := v_tong_trong_so + v_cfg.weight;
      if v_cfg.direction = 'cao_tot' then
        v_diem := (v_gia_tri - v_cfg.floor_value) / nullif(v_cfg.target - v_cfg.floor_value, 0) * 100;
      else
        v_diem := (v_cfg.floor_value - v_gia_tri) / nullif(v_cfg.floor_value - v_cfg.target, 0) * 100;
      end if;
      v_diem := greatest(0, least(100, round(v_diem)));

      v_chi_tiet := v_chi_tiet || jsonb_build_object(
        'code', v_cfg.metric_code, 'label', v_cfg.label, 'gia_tri', v_gia_tri,
        'diem', v_diem, 'trong_so', v_cfg.weight
      );
    end if;
  end loop;

  if v_so_dung = 0 or v_tong_trong_so = 0 then
    return jsonb_build_object('score', null, 'label', 'Chưa đủ dữ liệu', 'so_chi_so_dung', v_so_dung, 'tong_chi_so', v_tong_chi_so, 'chi_tiet', '[]'::jsonb);
  end if;

  -- Vòng 2: chia lại trọng số thực theo tổng trọng số của các chỉ số đủ dữ
  -- liệu, rồi cộng dồn đóng góp.
  select jsonb_agg(x.item), sum((x.item->>'dong_gop')::numeric)
    into v_chi_tiet, v_tong_dong_gop
  from (
    select jsonb_build_object(
      'code', item->>'code', 'label', item->>'label', 'gia_tri', (item->>'gia_tri')::numeric,
      'diem', (item->>'diem')::numeric,
      'trong_so_thuc', round((item->>'trong_so')::numeric / v_tong_trong_so * 100),
      'dong_gop', (item->>'diem')::numeric * (item->>'trong_so')::numeric / v_tong_trong_so
    ) as item
    from jsonb_array_elements(v_chi_tiet) as item
  ) x;

  return jsonb_build_object(
    'score', round(v_tong_dong_gop),
    'label', case
      when round(v_tong_dong_gop) >= 85 then 'Xuất sắc'
      when round(v_tong_dong_gop) >= 70 then 'Tốt'
      when round(v_tong_dong_gop) >= 55 then 'Đạt'
      when round(v_tong_dong_gop) >= 40 then 'Cần cải thiện'
      else 'Không đạt'
    end,
    'mau', case
      when round(v_tong_dong_gop) >= 85 then 'xanh_la'
      when round(v_tong_dong_gop) >= 70 then 'xanh_duong'
      when round(v_tong_dong_gop) >= 55 then 'vang'
      when round(v_tong_dong_gop) >= 40 then 'cam'
      else 'do'
    end,
    'so_chi_so_dung', v_so_dung, 'tong_chi_so', v_tong_chi_so, 'chi_tiet', v_chi_tiet
  );
end;
$fn$;

revoke all on function public.compute_kpi_score(uuid, date, date) from public, anon;
grant execute on function public.compute_kpi_score(uuid, date, date) to authenticated;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609101100_kpi_metric_configs_engine', 'completed', now(),
  'Bang kpi_metric_configs + ham compute_kpi_score: tinh diem KPI tong hop 0-100 theo vi tro, chuan hoa/kep tran-san/chia lai trong so khi thieu du lieu (khong cho 0 diem). Chi seed "chuyen_can" (du lieu that) - cac chi so khac (san luong, ty le loi, khieu nai) chua co nguon du lieu that duoc xac minh nen chua seed, tranh bia so.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
