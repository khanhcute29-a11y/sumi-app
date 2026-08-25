-- =====================================================================
-- BƯỚC 2/2 — DỌN CÁC ĐƠN ĐANG BỊ KẸT (làm tab "Bếp đang làm" hết trống)
-- Chạy SAU khi bước 1 đã chạy xong.
-- =====================================================================
--
-- Bước 1 chỉ sửa cho các lần nhận đơn TỪ NAY VỀ SAU. Những đơn mà bếp đã
-- nhận TRƯỚC ĐÓ vẫn đang kẹt ở trạng thái "chờ làm", nên tab "Bếp đang làm"
-- vẫn trống với các đơn cũ. File này dọn đúng nhóm đó.
--
-- LƯU Ý TRƯỚC KHI CHẠY:
-- Việc cập nhật đơn sẽ khiến các máy đang mở app phát chuông "nhận đơn"
-- (đã có cơ chế chặn kêu chồng nên chỉ kêu 1 lần, không kêu liên hồi).
-- Nếu muốn hoàn toàn yên tĩnh thì chạy lúc ít người online.
-- =====================================================================


-- ---------------------------------------------------------------------
-- PHẦN A — XEM TRƯỚC (chỉ đọc, KHÔNG thay đổi gì)
-- Chạy riêng phần này trước để biết sẽ có bao nhiêu đơn bị ảnh hưởng.
-- Nếu kết quả là 0 thì không cần chạy phần B.
-- ---------------------------------------------------------------------
select
  o.id,
  o.order_code,
  o.status_v2      as trang_thai_hien_tai,
  'in_production'  as se_doi_thanh,
  wp.assigned_to_staff_name as bep_dang_lam,
  wp.accepted_at   as bep_nhan_luc
from public.orders o
join public.order_work_packages wp on wp.order_id = o.id
where o.status_v2 in ('pending', 'awaiting_assignment', 'awaiting_acceptance')
  and wp.status = 'in_progress'
order by wp.accepted_at desc;


-- ---------------------------------------------------------------------
-- PHẦN B — CẬP NHẬT THẬT
-- Chỉ chạy phần này sau khi đã xem danh sách ở phần A và thấy hợp lý.
-- Bôi đen từ chữ "begin;" tới hết rồi bấm Run.
-- ---------------------------------------------------------------------
begin;

-- Sao lưu danh sách đơn sắp đổi, để có thể hoàn tác chính xác
create table if not exists public.order_status_backups (
  id            bigserial primary key,
  backed_up_at  timestamptz not null default now(),
  label         text        not null,
  order_id      uuid        not null,
  old_status_v2 text,
  old_version   integer
);

insert into public.order_status_backups (label, order_id, old_status_v2, old_version)
select '202608260020_backfill', o.id, o.status_v2, o.version
from public.orders o
where o.status_v2 in ('pending', 'awaiting_assignment', 'awaiting_acceptance')
  and exists (
    select 1 from public.order_work_packages wp
    where wp.order_id = o.id and wp.status = 'in_progress'
  );

-- Cập nhật: chỉ những đơn mà bếp THỰC SỰ đang làm dở
update public.orders o
set status_v2 = 'in_production',
    version   = version + 1
where o.status_v2 in ('pending', 'awaiting_assignment', 'awaiting_acceptance')
  and exists (
    select 1 from public.order_work_packages wp
    where wp.order_id = o.id and wp.status = 'in_progress'
  );

commit;


-- ---------------------------------------------------------------------
-- KIỂM TRA SAU KHI CHẠY
-- ---------------------------------------------------------------------
select
  'Số đơn đã dọn'        as kiem_tra,
  count(*)::text         as ket_qua
from public.order_status_backups
where label = '202608260020_backfill'

union all

select
  'Còn đơn nào kẹt không (mong đợi: 0)',
  count(*)::text
from public.orders o
where o.status_v2 in ('pending', 'awaiting_assignment', 'awaiting_acceptance')
  and exists (
    select 1 from public.order_work_packages wp
    where wp.order_id = o.id and wp.status = 'in_progress'
  );
