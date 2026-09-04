-- Kho Macaron X41 — XUẤT KHO theo đúng yêu cầu cô Kim Cúc: "làm xuất giống
-- nhập luôn, cột Ngày SX/HSD để cô xổ tất cả các ngày có trong kho để cô
-- chọn ngày thấp nhất xuất, phần này không dùng trí nhớ được".
--
-- sumi_macaron_xuat (202609042000) chưa có tham số Ngày SX/HSD nào — thêm 2
-- tham số mới giống hệt cách 202609043000 đã làm cho sumi_macaron_nhap, để
-- mỗi lần xuất cũng ghi lại xuất từ lô ngày nào (phục vụ hiển thị + đối
-- chiếu sau này). LƯU Ý QUAN TRỌNG (ghi rõ để không ai tưởng nhầm là bug):
-- tồn kho vẫn là 1 số CẶP GỘP theo màu (không tách theo từng lô), nên chọn
-- "lô ngày nào" ở đây chỉ để GHI DẤU VẾT xuất từ lô nào (đối chiếu/tra cứu),
-- KHÔNG tự động trừ đúng vào đúng lô đó — đúng như macaron_stock đã thiết
-- kế từ đầu (xem ghi chú migration gốc 202609042000).
--
-- Học đúng bài học từ 202609043100: dùng "create or replace function" khi
-- THÊM tham số mới sẽ tạo hàm CHỒNG (chữ ký khác), không thay hẳn hàm cũ —
-- nên DROP hàm 4-tham-số cũ trước khi tạo hàm 6-tham-số mới.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '30s';

drop function if exists public.sumi_macaron_xuat(text, numeric, text, text);

create or replace function public.sumi_macaron_xuat(
  p_ma text, p_so_cap numeric, p_order_code text default null, p_ghi_chu text default null,
  p_ngay_sx date default null, p_han_su_dung date default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.sumi_macaron_duoc_thao_tac() then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Chỉ nhân sự Xưởng 41 hoặc quản lý mới xuất kho được.');
  end if;
  if p_so_cap is null or p_so_cap <= 0 then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Số cặp xuất phải lớn hơn 0.');
  end if;

  perform public.sumi_macaron_ghi_so(p_ma, 'xuat', -p_so_cap, null, p_order_code, p_ghi_chu, p_ngay_sx, p_han_su_dung);
  return jsonb_build_object('thanh_cong', true, 'thong_bao', 'Đã xuất ' || p_so_cap || ' cặp.');
end;
$function$;

grant execute on function public.sumi_macaron_xuat(text, numeric, text, text, date, date) to authenticated;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609043200_kho_macaron_xuat_theo_lo_ngay', 'completed', now(),
  'Kho Macaron X41: sumi_macaron_xuat nhan them p_ngay_sx/p_han_su_dung (giong sumi_macaron_nhap) de ghi lai xuat tu lo ngay nao, phuc vu form Xuat kho hien danh sach cac lo dang co trong kho (theo macaron_stock_log) cho thu kho chon lo cu nhat, khong phai tu go/nho ngay. Da DROP ban 4-tham-so cu truoc khi tao ban moi, tranh loi ham trung chu ky nhu 202609043100.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
