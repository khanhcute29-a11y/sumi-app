-- BẬT LẠI quy tắc bắt buộc ảnh thành phẩm khi bếp hoàn thành mẻ bánh.
update public.feature_flags set enabled = true, updated_at = now() where key = 'production_photo_required';
select key, enabled from public.feature_flags where key = 'production_photo_required';
