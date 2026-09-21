-- TẮT TẠM quy tắc bắt buộc ảnh thành phẩm (bếp hoàn thành không cần ảnh).
-- Cần đã chạy migration 202609201500_cong_tat_bat_buoc_anh_thanh_pham.sql.
-- Bật lại: chạy RUN_IN_SQL_EDITOR_BAT_ANH_THANH_PHAM.sql
update public.feature_flags set enabled = false, updated_at = now() where key = 'production_photo_required';
select key, enabled from public.feature_flags where key = 'production_photo_required';
