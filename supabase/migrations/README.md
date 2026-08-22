# SUMI Supabase migrations

Thư mục này chứa migration V2 theo kế hoạch tại `docs/SUMI_MIGRATION_PLAN_V1.md`.

## Trạng thái

- `202608220001_migration_infrastructure.sql` — đã viết, chưa chạy production.
- `202608220002_organization_and_scoped_permissions.sql` — đã viết, chưa chạy production.
- `202608220003_harden_function_execution.sql` — đã viết, chưa chạy production.
- `202608220004_orders_v2_and_details.sql` — đã viết, chưa chạy production.
- `202608220005_work_packages_batches_tasks.sql` — đã viết, chưa chạy production.
- `202608220006_inventory_documents_ledger.sql` — đã viết, chưa chạy production.
- `202608220007_delivery_runs_stops_delegations.sql` — đã viết, chưa chạy production.
- `202608220008_events_notifications_incidents.sql` — đã viết, chưa chạy production.
- `202608220009_transactional_rpcs.sql` — đã viết, chưa chạy production.
- `202608220010_operational_completion_rpcs.sql` — đã viết, chưa chạy production.
- `202608220011_rls_and_safe_views.sql` — đã viết, chưa chạy production.
- `202608220012_attachment_backup_lifecycle.sql` — đã viết, chưa chạy production.
- `202608220013_feature_flags_compatibility.sql` — đã viết, chưa chạy production.
- `202608220014_hide_legacy_financial_columns.sql` — đã viết, chưa chạy production.
- `202608220015_task_assignment_start_rpcs.sql` — đã viết, chưa chạy production.
- `202608220016_delivery_assignment_rpcs.sql` — đã viết, chưa chạy production.
- `202608220017_kpi_v2_rpc.sql` — đã viết, chưa chạy production.
- `202608220018_secure_user_bootstrap.sql` — đã viết, chưa chạy production.
- `202608220019_sync_legacy_order_status.sql` — đã viết, chưa chạy production.
- `202608220020_recognize_kitchen_lead_v2.sql` — đã viết, chưa chạy production.
- `202608220021_mobile_attendance_overtime_payroll.sql` — đã viết, chưa chạy production.
- `verify_202608220001_002.sql` — truy vấn kiểm tra read-only sau M01–M02.

## Thứ tự chạy trên staging

1. Xác nhận backup staging có thể restore.
2. Chạy toàn bộ migration cũ của dự án nếu staging chưa có schema hiện hành.
3. Chạy `202608220001_migration_infrastructure.sql`.
4. Chạy `202608220002_organization_and_scoped_permissions.sql`.
5. Chạy `202608220003_harden_function_execution.sql`.
6. Chạy `verify_202608220001_002.sql`.
7. Xử lý tất cả anomaly `PROFILE_UNIT_UNMAPPED` mức `blocker`.
8. Chạy lại M01–M03 để xác minh tính idempotent.
9. Chạy lại verify; yêu cầu không có profile active thiếu primary assignment.

## Không được làm

- Không chạy trực tiếp production trước khi diễn tập staging.
- Không sửa các file migration sau khi đã áp dụng; tạo forward migration mới.
- Không xoá `profiles.role`, `profiles.extra_roles` hoặc `profiles.station` ở giai đoạn này.
- Không tự gán bộ phận cho anomaly chưa xác định.

## Kết quả đạt

- Có đầy đủ cây đơn vị SUMI.
- Mỗi profile active có tối đa một primary assignment đang hiệu lực.
- Các profile ánh xạ được có assignment lặp lại an toàn qua `legacy_source_key`.
- Tài khoản thường chỉ đọc assignment/grant của chính mình.
- Owner/Admin hoặc `business_director` quản lý organization assignment và scoped grants.
- `202608220022_order_comments.sql` — trao đổi theo đơn: phân loại, ảnh/giọng nói, xóa mềm, lịch sử và chuông liên kết.
- `202608220023_expenses_salary_advances.sql` — báo khoản chi theo ngưỡng/ngày/ca và tạm ứng lương bắt buộc Giám đốc duyệt.
- `202608220024_company_feed.sql` — thông báo công ty có xác nhận và Nhật ký SUMI có ảnh/Vlog, bình luận, thả tim.
