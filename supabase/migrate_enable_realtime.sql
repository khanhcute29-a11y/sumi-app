-- Bật Realtime cho các bảng mới (chấm đỏ thông báo cần biết ngay khi có thay đổi từ
-- thiết bị/tab khác, không chỉ tab đang thao tác — tab đang thao tác đã tự cập nhật
-- ngay qua sự kiện nội bộ, không phụ thuộc cái này).
do $$
begin
  begin
    alter publication supabase_realtime add table approval_requests;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table incident_reports;
  exception when duplicate_object then null;
  end;
end $$;
