-- Kho Macaron X41 — cho phép TRỘN MÀU ghi lại Ngày SX/HSD cho khay MIX vừa
-- tạo ra (yêu cầu chủ tiệm 06/09/2026, tiếp nối 202609043000/202609043200
-- đã làm cho NHẬP/XUẤT màu đơn):
--
-- "Trộn 12 màu không trùng ngày SX của 12 màu đơn nên không lấy NSX của đơn
-- áp qua được. Nếu áp thì chỉ áp được 1 màu nào đó có NSX thấp nhất" — tức
-- khay mix vừa trộn ra nên mang NSX/HSD = màu có NSX SỚM NHẤT trong số các
-- màu đã dùng để trộn (không để hạn dùng của khay mix "lạc quan" hơn thực
-- tế khi có màu cũ hơn trong đó). Việc TÍNH ra ngày nào là sớm nhất nằm ở
-- CLIENT (KhoMacaronX41.jsx TabTronMau — dò lô của từng màu đã dùng qua
-- fetchLoNhapMacaron, đã có sẵn, lấy ngày nhỏ nhất) — RPC này chỉ NHẬN và
-- LƯU giá trị đã tính đó, không tự suy luận trong SQL.
--
-- sumi_macaron_mix (202609042000) chưa nhận Ngày SX/HSD — thêm 2 tham số
-- CUỐI. Theo đúng bài học đã ghi ở 202609043200: CREATE OR REPLACE khi
-- THÊM tham số mới tạo ra hàm CHỒNG (chữ ký khác) chứ không thay hẳn hàm
-- cũ — nên DROP chữ ký cũ trước khi tạo chữ ký mới.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '30s';

drop function if exists public.sumi_macaron_mix(text, numeric, text, jsonb, text, text);

create or replace function public.sumi_macaron_mix(
  p_ma_mix text, p_so_khay numeric, p_kieu text, p_chi_tiet jsonb,
  p_order_code text default null, p_ghi_chu text default null,
  p_ngay_sx date default null, p_han_su_dung date default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_batch_id  uuid;
  v_dong      jsonb;
  v_ma        text;
  v_cap       numeric;
  v_hao       numeric;
  v_tong_dung numeric := 0;
  v_tong_hao  numeric := 0;
  v_ten       text;
  v_loai_mix  text;
begin
  if not public.sumi_macaron_duoc_thao_tac() then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Chỉ nhân sự Xưởng 41 hoặc quản lý mới trộn màu được.');
  end if;
  if p_kieu not in ('ton_kho', 'theo_don') then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Kiểu trộn không hợp lệ.');
  end if;
  if p_so_khay is null or p_so_khay <= 0 then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Số khay trộn phải lớn hơn 0.');
  end if;
  if p_ngay_sx is not null and p_han_su_dung is not null and p_han_su_dung < p_ngay_sx then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Hạn sử dụng không được sớm hơn Ngày sản xuất.');
  end if;
  select loai into v_loai_mix from public.macaron_catalog where ma = p_ma_mix and active;
  if v_loai_mix is distinct from 'mix' then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Loại mix không hợp lệ.');
  end if;
  if p_chi_tiet is null or jsonb_typeof(p_chi_tiet) <> 'array' or jsonb_array_length(p_chi_tiet) = 0 then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Chưa nhập số cặp từng màu.');
  end if;

  select full_name into v_ten from public.profiles where id = auth.uid();

  insert into public.macaron_mix_batches(ma_mix, so_khay, kieu, order_code, chi_tiet, ghi_chu, staff_id, staff_name)
  values (p_ma_mix, p_so_khay, p_kieu, p_order_code, p_chi_tiet, p_ghi_chu, auth.uid(), v_ten)
  returning id into v_batch_id;

  for v_dong in select * from jsonb_array_elements(p_chi_tiet)
  loop
    v_ma  := v_dong->>'ma';
    v_cap := coalesce((v_dong->>'cap')::numeric, 0);
    v_hao := coalesce((v_dong->>'hao_hut')::numeric, 0);
    if v_cap < 0 or v_hao < 0 then
      raise exception 'Số cặp/hao hụt của màu "%" không được âm.', v_ma;
    end if;
    if v_cap + v_hao <= 0 then continue; end if;

    -- Trừ phần ĐƯA VÀO KHAY và phần HAO HỤT thành 2 dòng sổ riêng để về sau
    -- thống kê được màu nào hay vỡ, tỷ lệ hao hụt bao nhiêu.
    if v_cap > 0 then
      perform public.sumi_macaron_ghi_so(v_ma, 'mix_tru', -v_cap, v_batch_id, p_order_code, p_ghi_chu);
    end if;
    if v_hao > 0 then
      perform public.sumi_macaron_ghi_so(v_ma, 'hao_hut', -v_hao, v_batch_id, p_order_code,
        coalesce(p_ghi_chu, '') || ' (hao hụt khi trộn)');
    end if;
    v_tong_dung := v_tong_dung + v_cap;
    v_tong_hao  := v_tong_hao + v_hao;
  end loop;

  if p_kieu = 'ton_kho' then
    perform public.sumi_macaron_ghi_so(p_ma_mix, 'mix_nhap', p_so_khay * 36, v_batch_id, null, p_ghi_chu,
      p_ngay_sx, p_han_su_dung);
  end if;

  update public.macaron_mix_batches
  set tong_cap_dung = v_tong_dung, tong_hao_hut = v_tong_hao
  where id = v_batch_id;

  return jsonb_build_object('thanh_cong', true, 'batch_id', v_batch_id,
    'tong_cap_dung', v_tong_dung, 'tong_hao_hut', v_tong_hao,
    'thong_bao', 'Đã trộn ' || p_so_khay || ' khay · dùng ' || v_tong_dung ||
                 ' cặp · hao hụt ' || v_tong_hao || ' cặp.');
end;
$function$;

grant execute on function public.sumi_macaron_mix(text, numeric, text, jsonb, text, text, date, date) to authenticated;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609060310_kho_macaron_mix_ngay_sx_hsd', 'completed', now(),
  'Kho Macaron X41: sumi_macaron_mix nhan them p_ngay_sx/p_han_su_dung, ap dung cho dong mix_nhap (khay mix vua tron ra) khi p_kieu=ton_kho. Client tinh NSX = min NSX cac mau da dung de tron (dua theo lo som nhat cua tung mau qua fetchLoNhapMacaron). Da DROP chu ky cu truoc khi tao chu ky moi (bai hoc tu 202609043200).')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
