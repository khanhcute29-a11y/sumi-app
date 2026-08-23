-- SUMI APP M30 — visual onboarding guides by employee role.
begin;

with actor as (
  select id from public.profiles
  where approved=true and active=true and (role in ('owner','admin') or extra_roles && array['owner','admin']::text[])
  order by created_at limit 1
), guides(title,summary,category,audience_roles,image_path,instruction) as (values
 ('Nhân viên — Việc của tôi','Mở việc, bắt đầu, làm theo checklist và hoàn thành đúng thao tác.','tasks','{}'::text[],'/visual-guides/employee-tasks.png','Xem lần lượt bốn bước để công việc và KPI được ghi nhận chính xác.'),
 ('Bếp trưởng — Nhận đơn và chia việc','Nhận phần đơn, giao nhân viên và duyệt khi tất cả công đoạn hoàn thành.','hot',array['kitchen_lead','kitchen_deputy']::text[],'/visual-guides/kitchen-lead-orders.png','Kiểm tra sản phẩm, ảnh mẫu và thời hạn trước khi nhận phần đơn.'),
 ('Nhân viên kho — Nhập xuất đúng','Chọn đúng kho, đúng loại hàng và lưu đủ chứng từ.','warehouse',array['warehouse','kho_bakery','kho_xuong41','kho_xuong42']::text[],'/visual-guides/warehouse-stock.png','Mọi lần nhập xuất phải đúng kho, đúng đơn vị tính và đúng số lượng.'),
 ('Vận tải — Giao đơn đúng cách','Nhận chuyến, bắt đầu giao, chụp ảnh và xác nhận người nhận.','delivery',array['shipper','transport_lead']::text[],'/visual-guides/delivery-flow.png','Bấm đúng thời điểm để hệ thống tính thời gian và lưu vị trí giao.'),
 ('Thu ngân — Tạo đơn đầy đủ','Tạo đơn nhiều loại bánh, nhập đủ quy cách, giờ giao và ảnh mẫu.','orders',array['cashier','sale','kitchen_lead']::text[],'/visual-guides/cashier-create-order.png','Kiểm tra toàn bộ thông tin trước khi tạo; không tự chọn bếp thực hiện.'),
 ('Kế toán — Chi, lương và xác nhận','Kiểm tra chứng từ, khoản cần duyệt, tạm ứng và tổng kết lương.','accounting',array['accountant']::text[],'/visual-guides/accounting-finance.png','Đối chiếu dữ liệu và minh chứng trước khi xác nhận hoặc ghi sổ.'),
 ('Giám đốc — Điều hành trên SUMI App','Xem tổng quan, xử lý ngoại lệ, đơn chậm, nhân sự và KPI.','management',array['owner','admin']::text[],'/visual-guides/director-dashboard.png','Bấm vào từng đơn hoặc nhân viên để xem trách nhiệm và thời gian chi tiết.')
)
insert into public.visual_work_guides(title,summary,category,audience_roles,cover_storage_path,created_by,updated_by)
select g.title,g.summary,g.category,g.audience_roles,g.image_path,a.id,a.id
from guides g cross join actor a
where not exists(select 1 from public.visual_work_guides existing where existing.title=g.title and existing.deleted_at is null);

with guides(title,image_path,instruction) as (values
 ('Nhân viên — Việc của tôi','/visual-guides/employee-tasks.png','Xem lần lượt bốn bước để công việc và KPI được ghi nhận chính xác.'),
 ('Bếp trưởng — Nhận đơn và chia việc','/visual-guides/kitchen-lead-orders.png','Kiểm tra sản phẩm, ảnh mẫu và thời hạn trước khi nhận phần đơn.'),
 ('Nhân viên kho — Nhập xuất đúng','/visual-guides/warehouse-stock.png','Mọi lần nhập xuất phải đúng kho, đúng đơn vị tính và đúng số lượng.'),
 ('Vận tải — Giao đơn đúng cách','/visual-guides/delivery-flow.png','Bấm đúng thời điểm để hệ thống tính thời gian và lưu vị trí giao.'),
 ('Thu ngân — Tạo đơn đầy đủ','/visual-guides/cashier-create-order.png','Kiểm tra toàn bộ thông tin trước khi tạo; không tự chọn bếp thực hiện.'),
 ('Kế toán — Chi, lương và xác nhận','/visual-guides/accounting-finance.png','Đối chiếu dữ liệu và minh chứng trước khi xác nhận hoặc ghi sổ.'),
 ('Giám đốc — Điều hành trên SUMI App','/visual-guides/director-dashboard.png','Bấm vào từng đơn hoặc nhân viên để xem trách nhiệm và thời gian chi tiết.')
)
insert into public.visual_work_guide_steps(guide_id,step_order,title,instruction,image_storage_path)
select vg.id,1,g.title,g.instruction,g.image_path
from guides g join public.visual_work_guides vg on vg.title=g.title and vg.deleted_at is null
where not exists(select 1 from public.visual_work_guide_steps s where s.guide_id=vg.id and s.step_order=1);

insert into public.migration_runs(migration_key,status,finished_at,notes)
values('202608230030_seed_role_visual_guides','completed',now(),'Added seven role-based visual onboarding guides.')
on conflict(migration_key) do update set status='completed',finished_at=now(),notes=excluded.notes;
commit;
