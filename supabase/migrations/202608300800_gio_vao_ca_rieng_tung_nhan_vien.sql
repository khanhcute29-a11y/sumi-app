-- SUMI APP M103 (30/08) — Giờ vào ca RIÊNG cho từng nhân viên cụ thể, ưu
-- tiên cao hơn giờ chuẩn theo bộ phận.
--
-- BỐI CẢNH: chủ tiệm (30/08/2026) cho danh sách giờ vào ca thật của từng
-- người, KHÁC NHAU dù cùng bộ phận (VD Xưởng 41: Nguyễn Thị Kim Cúc 7h30,
-- Đào Thị Bích Nga 7h — trong khi giờ chuẩn Xưởng 41 đang là 06:00 chung
-- cho cả xưởng). Bảng `sumi_quy_dinh_ca` (từ 202608260070) chỉ có giờ theo
-- BỘ PHẬN, không có chỗ cho ngoại lệ từng người.
--
-- CÁCH LÀM (không viết lại hàm tính đi muộn `sumi_doi_chieu_cham_cong`,
-- không đụng code phía app `chamCong.js`): mỗi người có giờ riêng được
-- thêm 1 dòng vào ĐÚNG bảng `sumi_quy_dinh_ca` sẵn có, dùng chính `id` của
-- họ làm giá trị `bo_phan` (duy nhất, không đụng bo_phan thật nào) — rồi
-- sửa `sumi_bo_phan_cham_cong()` để trả về "bộ phận" chính là id của họ
-- NẾU có khai báo riêng, ưu tiên trước khi suy theo station/role như cũ.
-- Nhờ vậy toàn bộ logic đối chiếu/tính đi muộn/hiển thị đang có tự động
-- hoạt động đúng mà không cần sửa thêm dòng code nào khác.
--
-- GIỚI HẠN ĐÃ BIẾT: nếu 2 người có giờ riêng TRÙNG NHAU (VD Thảo và Duy
-- cùng 06:30), màn "Chấm Công" tự xem của nhân viên (phía app, dùng lại
-- `boPhanCuaHoSo()` suy đoán bộ phận cũ để hiển thị TÊN ca) có thể hiện
-- nhầm tên/khung giờ của người kia — KHÔNG ảnh hưởng số phút đi muộn thật
-- (số đó luôn đúng, do database tính và lưu thẳng, không phụ thuộc suy
-- đoán phía app). Chỉ là hiển thị tên ca, chấp nhận được vì hiếm gặp.
begin;

-- ---------------------------------------------------------------------------
-- 1. Ưu tiên giờ riêng theo từng người (nếu có) trước khi suy theo bộ phận.
-- ---------------------------------------------------------------------------
create or replace function public.sumi_bo_phan_cham_cong(p_staff_id uuid)
returns text language plpgsql stable security definer set search_path = public as $fn$
declare
  v_st  text;
  v_role text;
  v_extra text[];
begin
  -- Có khai báo giờ riêng cho đúng người này? Dùng luôn id làm "bộ phận".
  if exists (select 1 from public.sumi_quy_dinh_ca where bo_phan = p_staff_id::text and active) then
    return p_staff_id::text;
  end if;

  select nullif(btrim(station), ''), role, coalesce(extra_roles, '{}') into v_st, v_role, v_extra
  from public.profiles where id = p_staff_id;

  if v_st in ('lanh', 'nong')            then return 'bakery';  end if;
  if v_st = 'xuong41'                    then return 'xuong41'; end if;
  if v_st = 'xuong42'                    then return 'xuong42'; end if;

  -- Chưa gán khâu -> suy từ chức danh
  if v_role = 'shipper'                  then return 'van_tai'; end if;
  if v_role in ('cashier', 'bakery', 'kitchen_lead') then return 'bakery'; end if;
  -- Nhân viên bán hàng thuộc Bakery (VD Lê Thị Hải Vân) — theo ca Bakery.
  if v_role = 'sale' and 'bakery' = any(v_extra) then return 'bakery'; end if;
  if v_role in ('kho_xuong42', 'deputy_director_x42') then return 'xuong42'; end if;
  if v_role = 'deputy_director_x41'      then return 'xuong41'; end if;

  -- Giám đốc, kế toán, bán hàng (không thuộc bakery), kho... không thuộc ca cố định.
  return null;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 2. Khai báo giờ vào ca riêng cho 11 người theo đúng danh sách chủ tiệm gửi
--    (30/08/2026). Kế thừa so_gio_chuan/phut_den_som_toi_thieu từ ca đầu
--    tiên của bộ phận thật của họ (giữ đúng quy định giờ làm/mốc đi sớm sẵn
--    có, chỉ đổi giờ BẮT ĐẦU).
-- ---------------------------------------------------------------------------
do $$
declare
  v_staff record;
  v_so_gio numeric;
  v_phut_som int;
  v_bp_that text;
begin
  for v_staff in
    select * from (values
      ('63c0e132-f14d-48ed-b0d3-6fcb2ee66b7c'::uuid, 'Nguyễn Tuấn Anh',       '06:00'::time),
      ('46a30cf1-043c-4e85-baf5-0df57cea1300'::uuid, 'Tô Hoàng Anh',          '06:00'::time),
      ('93ac07d0-f3f9-47ae-b848-0d6ea870d13e'::uuid, 'Phạm Thị Kim Tiến',     '06:00'::time),
      ('da418a82-aaa4-4e34-969c-9d3cb667fdaf'::uuid, 'Ngô Tống Thanh Vân',    '06:00'::time),
      ('153537de-1455-46bc-898f-8411ca770b8a'::uuid, 'Cô 8',                  '06:00'::time),
      ('b47e7bc4-b57e-415d-8fd7-e462fa9bfe9e'::uuid, 'Võ Quốc Cường',         '06:00'::time),
      ('e0aeb236-ef33-40ed-835f-a3521a290c32'::uuid, 'Nguyễn Thị Kim Cúc',    '07:30'::time),
      ('9971c1fc-2c3f-4021-9875-68beef9a9542'::uuid, 'Danh Thị Phương',       '07:00'::time),
      ('1ed96b3a-dbc6-4119-a285-54086d9d8662'::uuid, 'Trần Thanh Thảo',       '06:30'::time),
      ('129f5db5-fa91-4298-823b-8823d2138db8'::uuid, 'Nguyễn Quốc Duy',       '06:30'::time),
      ('f7bee6e3-d774-4b93-8b29-cbb2f3222a73'::uuid, 'Đào Thị Bích Nga',      '07:00'::time)
    ) as t(id, ten, gio_rieng)
  loop
    -- Bộ phận THẬT của người này — gọi lại ĐÚNG hàm vừa sửa ở bước 1 (không
    -- viết lại logic suy đoán bộ phận riêng ở đây, tránh 2 nơi lệch nhau).
    -- Lần đầu chạy: chưa có dòng giờ riêng nào -> hàm tự rơi xuống nhánh
    -- station/role như cũ, trả đúng bộ phận thật. Chạy lại lần sau (dòng đã
    -- tồn tại): hàm trả về chính id của họ -> vẫn kế thừa đúng từ dòng đã có.
    v_bp_that := public.sumi_bo_phan_cham_cong(v_staff.id);

    select so_gio_chuan, phut_den_som_toi_thieu into v_so_gio, v_phut_som
      from public.sumi_quy_dinh_ca where bo_phan = v_bp_that and active
      order by gio_bat_dau limit 1;

    insert into public.sumi_quy_dinh_ca(bo_phan, ma_ca, ten_ca, gio_bat_dau, so_gio_chuan, phut_den_som_toi_thieu)
    values (
      v_staff.id::text, 'sang', 'Ca riêng — ' || v_staff.ten, v_staff.gio_rieng,
      coalesce(v_so_gio, 9), coalesce(v_phut_som, 10)
    )
    on conflict (bo_phan, ma_ca) do update
      set gio_bat_dau = excluded.gio_bat_dau,
          so_gio_chuan = excluded.so_gio_chuan,
          phut_den_som_toi_thieu = excluded.phut_den_som_toi_thieu,
          ten_ca = excluded.ten_ca,
          active = true,
          updated_at = now();
  end loop;
end $$;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202608300800_gio_vao_ca_rieng_tung_nhan_vien', 'completed', now(),
  'Thêm cơ chế giờ vào ca RIÊNG theo từng nhân viên (ưu tiên hơn giờ chung theo bộ phận), tái dùng nguyên bảng sumi_quy_dinh_ca (dùng id nhân viên làm bo_phan) — không cần sửa hàm tính đi muộn hay code phía app. Đã khai báo cho 11 người theo yêu cầu chủ tiệm 30/08/2026: Nguyễn Tuấn Anh/Tô Hoàng Anh/Phạm Thị Kim Tiến/Ngô Tống Thanh Vân/Cô 8/Võ Quốc Cường = 06:00, Nguyễn Thị Kim Cúc = 07:30, Danh Thị Phương = 07:00, Trần Thanh Thảo/Nguyễn Quốc Duy = 06:30, Đào Thị Bích Nga = 07:00. Đồng thời map role sale + extra_roles chứa bakery vào bộ phận bakery (Lê Thị Hải Vân) theo đúng "Ca sáng 05:30-13:30 / Ca tối 13:30-21:30" chủ tiệm nêu. Không tìm thấy hồ sơ khớp tên "My", "Vy", "Yên" trong profiles đang duyệt/active — chưa khai báo được, cần chủ tiệm xác nhận lại tên tài khoản.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
