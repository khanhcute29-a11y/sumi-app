# SUMI APP — Kế hoạch migration hệ thống

**Phiên bản:** 1.0  
**Ngày:** 22/08/2026  
**Nguồn yêu cầu:** `docs/SUMI_BUSINESS_AND_DATA_SPEC_V1.md`  
**Mục tiêu:** Chuyển hệ thống React/Vite + Supabase hiện tại sang mô hình một đơn nhiều bộ phận, giao dịch kho nguyên khối, phân quyền theo phạm vi và bảo mật đơn Trường học mà không làm mất dữ liệu đang vận hành.

**Trạng thái triển khai:** M01–M03 đã được viết và diễn tập thành công hai lần trên project staging độc lập `sumi-migration-staging` ngày 22/08/2026. Staging không chứa dữ liệu khách hàng thật; production chưa bị thay đổi. M03 đóng quyền gọi Data API đối với các hàm trigger nội bộ bị Supabase Security Advisor cảnh báo.

---

## 1. Kết luận triển khai

Migration phải theo hướng **mở rộng tương thích ngược → backfill → chạy song song → chuyển đọc/ghi → dọn cũ**. Không thay schema trực tiếp trong một lần và không restore bản backup cũ đè lên production.

Các nguyên tắc bắt buộc:

1. Mỗi migration có thể chạy lại an toàn hoặc có kiểm tra trạng thái rõ ràng.
2. Không xoá cột/bảng cũ trước khi qua ít nhất một chu kỳ vận hành ổn định.
3. Backfill dùng `legacy_import_key`/`idempotency_key` để không tạo bản ghi trùng.
4. Quyền mới deny-by-default; kiểm thử bằng tài khoản thật của từng vai trò.
5. Mọi thay đổi kho và hoàn thành sản xuất chạy trong transaction phía PostgreSQL.
6. Giá và đơn Trường học không được lộ trong view, Realtime, notification hoặc cache.
7. Cutover có cửa sổ read-only, đối soát và tiêu chí go/no-go.

## 2. Hiện trạng cần xử lý

### Bảng có thể kế thừa

- `profiles`, `customers`, `orders`, `order_items`, `products`, `product_variants`.
- `tasks`, `task_completions`, `order_stages`, `production_logs`.
- `warehouse_stock`, `finished_goods_stock` và các bảng log kho.
- `approval_requests`, `incident_reports`, `order_notes`, `audit_log`.
- `push_subscriptions`, `shift_configs`, `shift_logs`, `shift_schedule`.

### Khoảng cách với mô hình đích

- `orders.status` chỉ có sáu trạng thái tổng quát; chưa có state machine nhiều phần.
- Giá nằm trực tiếp trong `orders`, `order_items`, `products` và một số log.
- `order_stages` gắn tuần tự theo đơn, chưa đại diện phần đơn theo bếp/xưởng.
- `tasks` chưa liên kết chặt với work package/batch và chưa lưu vai trò kiêm nhiệm.
- Kho đang cập nhật qua bảng tồn + log rời, chưa có document/ledger nguyên khối.
- `profiles.role/extra_roles/station` chưa diễn đạt cơ sở, bộ phận, phạm vi và thời hạn.
- RLS của một số bảng đang cho mọi tài khoản đã duyệt đọc, không đủ cho đơn mật.
- Ảnh đang nằm ở nhiều cột URL, chưa có attachment lifecycle/backup state.
- Thông báo chưa có inbox chuẩn và nguy cơ phát trùng từ nhiều client.

## 3. Chiến lược nhánh và môi trường

### Môi trường

- **Production:** dữ liệu thật; chỉ migration đã diễn tập mới được chạy.
- **Staging:** clone schema + bản sao dữ liệu production gần nhất; thay thế/ẩn PII nếu chia sẻ ngoài nhóm được phép.
- **Local:** dữ liệu mẫu, không dùng credential production.

### Nhánh code

- Tạo nhánh triển khai riêng từ commit production đã chốt.
- Mọi migration mới đặt trong `supabase/migrations/` với tên timestamp tăng dần.
- Không sửa ngược các file migration cũ đã có khả năng được chạy ở production.
- Lưu bảng `schema_migrations`/lịch sử Supabase CLI để biết migration nào đã áp dụng.

## 4. Kiểm kê trước migration

Chạy read-only và lưu kết quả làm baseline:

- Tổng số bản ghi từng bảng.
- Đơn theo trạng thái, channel, ngày tạo và đơn không có `order_code`.
- `order_code` trùng.
- Đơn không có khách hoặc item.
- Item có `qty <= 0`, giá âm hoặc category không hợp lệ.
- Profile thiếu role/station, role ngoài danh sách và `extra_roles` bất thường.
- Tồn kho âm, dòng tồn trùng `(sản phẩm, size, branch)`.
- Log kho không tìm được stock/order/source.
- Nhiệm vụ hoặc stage không tìm được đơn/người dùng.
- Ảnh URL hỏng hoặc trỏ bucket public.
- Đơn Trường học có dữ liệu giá trong các bảng/ghi chú/notification.

Lưu báo cáo tại `migration_audit/preflight_<timestamp>` hoặc file CSV chỉ người có quyền truy cập.

## 5. Chuỗi migration đề xuất

Tên dưới đây là thứ tự logic; timestamp thật được tạo khi triển khai.

### M01 — `001_migration_infrastructure.sql`

Tạo:

- `migration_runs`
- `migration_anomalies`
- `backfill_checkpoints`
- Hàm helper `current_profile_id()`, `has_active_permission(...)`, `is_director()`, `is_assigned_kitchen_lead(...)`.
- Enum/check helper dùng chung nhưng chưa thay constraint cũ.

Tiêu chí:

- Chạy lại không lỗi.
- Không thay đổi dữ liệu nghiệp vụ.

### M02 — `002_organization_and_scoped_permissions.sql`

Tạo:

- `organization_units`
- `profile_assignments`
- `permission_grants`

Seed đơn vị:

- SUMI.
- Bakery → Bếp nóng, Bếp lạnh, Kho Bakery, cửa hàng Vĩnh Phú 42, Đại Lộ Bình Dương.
- Xưởng 41 → Bếp Macaron, Kho NVL, Kho thành phẩm Macaron.
- Xưởng 42 → Bếp Trường học, Kho NVL trung tâm, Kho mù.
- Vận tải, Kế toán.

Backfill:

- Ánh xạ `profiles.role`, `extra_roles`, `station` sang assignment.
- Bản ghi không xác định → `unmapped` và ghi anomaly; không tự đoán.
- Giữ cột cũ để frontend cũ vẫn chạy.

### M03 — `003_orders_v2_compat_columns.sql`

Thêm vào `orders`:

- `order_type`, `created_by`, `required_at`, `fulfillment_method_v2`.
- `confidentiality`, `version`.
- `allow_partial_fulfillment`, người/thời gian duyệt giao phần.
- `cancelled_at`, `cancelled_by`.
- `legacy_status`, `legacy_import_key`.

Backfill ánh xạ:

| Cũ | Mới |
|---|---|
| `moi` | `awaiting_assignment` hoặc `awaiting_acceptance` nếu có dấu vết bếp |
| `dang_lam` | `in_production` |
| `cho_giao` | `ready_for_fulfillment` |
| `dang_giao` | `in_delivery` |
| `hoan_thanh` | `completed` |
| `huy` | `cancelled` |

Trong giai đoạn tương thích, chưa thay check constraint cũ. Tạo cột `status_v2`; code mới đọc `status_v2`, code cũ tiếp tục đọc `status`.

### M04 — `004_order_specs_attachments_financials.sql`

Tạo:

- `order_attachments`
- `order_financials`
- `order_change_requests`

Mở rộng `order_items`:

- `quantity numeric`, `unit`, `specification jsonb`, `name_snapshot`, `display_order`.

Backfill:

- `qty → quantity`.
- `size/cot/vi/content/candle/category → specification` theo loại đơn.
- Các cột ảnh cũ → `order_attachments`, dùng URL hiện có làm `legacy_storage_url`.
- `orders.total/deposit/paid_amount/payment_method/ship_fee → order_financials` đối với đơn thường.
- Đơn Trường học: không backfill sang `order_financials`; ghi anomaly nếu phát hiện giá để Giám đốc xử lý thủ công và sau đó purge có kiểm soát.

Tuyệt đối chưa xoá cột giá cũ ở giai đoạn này.

### M05 — `005_order_work_packages_batches_tasks.sql`

Tạo:

- `order_work_packages`
- `work_package_items`
- `production_batches`
- `task_proofs`

Mở rộng `tasks`:

- `work_package_id`, `production_batch_id`, `performed_as_role`.
- `required_proof_types`, `started_at`, `version`.
- `exclusion_reason_code`, `exclusion_approved_by`.

Backfill:

- Đơn có `order_stages`: tạo một package legacy theo station/bếp nếu ánh xạ chắc chắn.
- Mỗi stage → task tương ứng; giữ `legacy_order_stage_id`.
- Đơn nhiều stage nhưng không biết bếp → package `legacy_unassigned`, Giám đốc phân thủ công.
- Không xoá `order_stages`; chuyển sang read-only sau cutover.

### M06 — `006_inventory_documents_ledger.sql`

Tạo:

- `warehouses`
- `inventory_items`
- `inventory_documents`
- `inventory_document_lines`
- `inventory_ledger`

Seed kho mặc định:

- `BAKERY_FG` — Bếp nóng/lạnh và hàng trưng bày hai cửa hàng.
- `X41_INGREDIENT`, `X41_MACARON_FG`.
- `X42_INGREDIENT_CENTRAL`, `X42_BLIND_DISPATCH`.

Quy tắc route:

- Bếp nóng/lạnh → `BAKERY_FG`.
- Macaron → `X41_MACARON_FG`.
- Trường học → `X42_BLIND_DISPATCH`, không tạo tồn khả dụng thông thường.
- Trung Thu/bánh pía từ Xưởng 42 → `BAKERY_FG` khi Giám đốc phê duyệt phân bổ.

Backfill:

- `warehouse_stock` → opening balance documents theo branch.
- `finished_goods_stock` → opening finished-goods balance.
- Các log in/out → legacy inventory documents theo thứ tự thời gian.
- Nếu không thể tái dựng balance chính xác, tạo opening adjustment đã ghi rõ nguồn và anomaly; không tự bịa lot/order.

Sau backfill, tổng ledger theo kho/item phải bằng tồn baseline hoặc có biên bản chênh lệch được duyệt.

### M07 — `007_delivery_runs_stops_delegations.sql`

Tạo:

- `delivery_runs`
- `delivery_stops`
- `delivery_delegations`

Backfill:

- Đơn `dang_giao/hoan_thanh` có shipper → run/stop legacy.
- `pickup_lat/lng`, `delivery_lat/lng`, ảnh giao → stop/attachment.
- Khoảng cách kế hoạch Trường học tính từ tọa độ Xưởng 42 đến địa chỉ đã geocode.
- Nếu thiếu toạ độ địa chỉ, đánh dấu `geocoding_required`; không tự gán km 0.

### M08 — `008_domain_events_notifications_incidents.sql`

Tạo:

- `domain_events`
- `notifications`
- Bổ sung entity polymorphic, cause/resolution cho `incident_reports` hoặc tạo `incidents_v2` rồi migrate.

Backfill tối thiểu:

- `order_created`, trạng thái hiện tại, completed/cancelled.
- Stage/task timestamps.
- Log kho và giao hàng có dữ kiện.

Không dựng timeline giả cho thời điểm không có dữ liệu.

### M09 — `009_transactional_rpcs.sql`

Tạo RPC `security definer` có `search_path` cố định, revoke execute mặc định và grant đúng role:

- Tạo đơn.
- Giám đốc phân package.
- Bếp trưởng nhận/yêu cầu phân lại.
- Giao và hoàn thành task.
- Bếp trưởng duyệt sản xuất + nhập kho nguyên khối.
- Yêu cầu/duyệt/xuất/nhận chuyển kho.
- Giám đốc duyệt giao một phần.
- Phân/nhận/hoàn thành chuyến giao.
- Sửa trong 30 phút; yêu cầu sửa sau 30 phút.
- Huỷ và xoá hẳn có điều kiện.

Mỗi RPC:

- Khoá hàng liên quan (`FOR UPDATE`).
- Kiểm tra quyền và scope.
- Kiểm tra `version`.
- Dùng `idempotency_key` duy nhất.
- Ghi domain event/audit trong cùng transaction.
- Không trả financial fields cho caller vận hành.

### M10 — `010_rls_and_private_views.sql`

Thực hiện sau khi RPC đã có và đã test:

- Bật RLS trên mọi bảng mới.
- Tạo view/RPC riêng cho danh sách vận hành, quản lý và tài chính.
- Thu hồi quyền ghi trực tiếp của authenticated vào bảng trạng thái/kho.
- Thay policy rộng kiểu “mọi approved user được đọc” trên `order_stages` và các bảng liên quan.
- Đơn `school_restricted`: chỉ Giám đốc hoặc Bếp trưởng Xưởng 42 có package hợp lệ.
- Nhân viên Xưởng 42 chỉ đọc task tối giản qua view/RPC, không select order gốc.
- `order_financials`: không có policy cho Bếp/Kho/Vận tải.
- Realtime chỉ publish view/bảng an toàn; payload không có giá hoặc dữ liệu mật.

### M11 — `011_storage_backup_lifecycle.sql`

Tạo metadata:

- `hot_storage_expires_at = created_at + 7 days`.
- `backup_status`, `drive_file_id`, checksum, thời gian backup/xoá.

Triển khai Edge Function/job:

1. Lấy attachment sắp hết hạn.
2. Tải file bằng service context.
3. Upload Google Drive theo `năm/tháng/ngày/mã đơn`.
4. So checksum/kích thước.
5. Đánh dấu `verified`.
6. Job dọn riêng chỉ xoá file nóng đã verified.

Backup thất bại → giữ file, tạo incident/notification cho quản trị. Folder đơn Trường học có quyền Drive riêng.

### M12 — `012_compatibility_views_and_cutover_flags.sql`

Tạo:

- Feature flags: `orders_v2_read`, `orders_v2_write`, `inventory_ledger_write`, `notifications_v2`, `school_lockdown`.
- Compatibility views để báo cáo cũ tiếp tục chạy trong giai đoạn chuyển tiếp.
- Trigger/adapter tạm thời chỉ khi bắt buộc; ưu tiên dual-write tại service/RPC thay vì trigger phức tạp.

## 6. Backfill và đối soát

### Cách chạy

- Chia batch 500–2.000 bản ghi.
- Commit theo batch, ghi checkpoint.
- Dùng `legacy_import_key = '<table>:<id>'` unique.
- Ghi lỗi vào `migration_anomalies`, không bỏ qua thầm lặng.
- Có thể resume từ checkpoint.

### Báo cáo đối soát bắt buộc

| Nhóm | Điều kiện đạt |
|---|---|
| Đơn | Tổng đơn mới = tổng đơn cũ; mọi đơn có mapping hoặc anomaly |
| Item | Tổng quantity theo đơn khớp qty cũ |
| Tài chính | Tổng tiền/cọc/đã trả đơn thường khớp; đơn Trường học không có financial record |
| Sản xuất | Stage/task cũ có liên kết legacy; không nhân đôi |
| Kho NVL | Ledger cuối kỳ khớp tồn baseline theo kho/item |
| Kho TP | Ledger khớp `finished_goods_stock` theo sản phẩm/size/kho |
| Vận tải | Đơn đang giao/hoàn thành có stop hoặc anomaly |
| Ảnh | Mọi URL cũ có attachment metadata hoặc anomaly |
| Quyền | 100% profile active có assignment chính hoặc anomaly |

## 7. Chuyển đổi frontend theo feature flag

### F1 — Đăng nhập và shell theo vai trò

- Đọc organization assignment và permission grants.
- Ẩn/hiện chức năng theo capability từ server.
- Không thay auth hiện tại trong cùng đợt với migration đơn.

### F2 — Danh sách và tạo đơn V2

- Danh sách gọn năm trạng thái.
- Form bốn loại đơn.
- Người tạo không phân bếp.
- Giá chỉ tải ở view Giám đốc; Trường học không có giá.
- Sao chép bản gửi khách qua server-generated safe summary.

### F3 — Work package, Bếp trưởng và nhiệm vụ

- Giám đốc phân nhiều bếp.
- Bếp trưởng nhận/yêu cầu phân lại.
- Giao task theo người; ảnh/giọng nói.

### F4 — Kho V2

- Phiếu xin duyệt, xuất, đang chuyển, nhận và chênh lệch.
- Không gọi hàm cộng/trừ tồn cũ từ màn mới.

### F5 — Vận tải V2

- Đơn chỉ xuất hiện khi đủ hàng hoặc có duyệt giao phần.
- Chuyến, GPS, thời gian/km, ảnh ký.

### F6 — Inbox, KPI và báo cáo

- Notification deep link.
- KPI từ event/task/shift.
- Lý do loại trừ phải có approval.

## 8. Dual-write và dual-read

### Giai đoạn A — Shadow write

- Frontend production vẫn đọc V1.
- RPC V2 ghi bảng mới; adapter ghi các cột V1 cần thiết.
- Job so sánh V1/V2 mỗi 15 phút.
- Chỉ nhóm thử nghiệm dùng UI V2.

### Giai đoạn B — V2 read, V1 fallback

- Nhóm pilot đọc V2.
- Nếu entity chưa backfill, hiển thị `legacy_unassigned` cho quản lý; không suy luận phía client.
- Không fallback cho financial/school security vì có thể làm rò dữ liệu.

### Giai đoạn C — V2 primary

- Toàn bộ người dùng đọc/ghi V2.
- V1 chỉ phục vụ đối chiếu read-only.
- Tắt các mutation cũ sau khi không còn client V1.

## 9. Kế hoạch staging

1. Clone production gần nhất.
2. Chạy preflight và lưu baseline.
3. Chạy M01–M08.
4. Chạy backfill; xử lý anomaly mức blocker.
5. Chạy M09 RPC và test transaction/idempotency.
6. Chạy M10 RLS và kiểm thử truy cập chéo vai trò.
7. Chạy M11 backup thử với folder Drive staging.
8. Deploy frontend V2 bằng feature flags tắt mặc định.
9. Bật cho bộ tài khoản test đại diện.
10. Chạy bộ nghiệm thu nghiệp vụ.
11. Diễn tập cutover và rollback ít nhất một lần.

### Bộ tài khoản test tối thiểu

- Giám đốc.
- Thu ngân/bán hàng.
- Bếp trưởng Xưởng 42, Bếp trưởng Xưởng 41, Bếp trưởng Bakery.
- Bếp phó/thợ bánh.
- Trưởng kho từng kho.
- Đội trưởng và nhân viên vận tải.
- Kế toán.
- Tài khoản kiêm nhiệm có hiệu lực, hết hạn và bị thu hồi.

## 10. Cutover production

### Chuẩn bị T-24h

- Xác nhận backup database + storage hoàn tất và thử restore trên môi trường tách biệt.
- Chốt commit/app build/migration checksum.
- Dừng thay đổi schema khác.
- Thông báo cửa sổ bảo trì.
- Xác định người quyết định go/no-go và kênh liên lạc.

### Trong cửa sổ bảo trì

1. Bật read-only thật ở API/UI; không chỉ thông báo miệng.
2. Chờ offline queue của thiết bị đang hoạt động gửi hết hoặc ghi danh sách queue chưa gửi.
3. Chụp baseline cuối.
4. Chạy migration additive còn thiếu.
5. Chạy incremental backfill từ checkpoint.
6. Chạy đối soát đơn, kho, tài chính thường, profile và ảnh.
7. Bật `school_lockdown` trước.
8. Bật V2 read/write theo thứ tự: tổ chức → đơn → task → kho → vận tải → notification.
9. Chạy smoke test bằng đơn test được đánh dấu riêng.
10. Go-live và tắt read-only.

### Go/no-go

Chỉ go-live khi:

- Không có migration lỗi/chưa hoàn tất.
- Không có tồn kho chênh lệch chưa giải thích.
- Không có financial record của đơn Trường học.
- RLS negative tests đều bị từ chối đúng.
- Hoàn thành sản xuất thử chỉ nhập kho một lần.
- Vận tải chỉ thấy đơn đủ điều kiện.
- Có thể tạo, sửa trong 30 phút và gửi yêu cầu sau 30 phút.

## 11. Rollback và phục hồi

### Rollback ứng dụng

- Tắt feature flags V2 và deploy lại build V1 đã chốt.
- V1 đọc compatibility columns/views.
- Không xoá dữ liệu V2 đã ghi.

### Rollback dữ liệu

- Migration additive không rollback bằng `DROP TABLE` trong sự cố production.
- Dừng mutation V2, giữ read-only, điều tra và sửa bằng forward migration.
- Chỉ restore database khi có mất mát/corruption nghiêm trọng và được người quyết định phê duyệt.
- Nếu restore, phải replay các giao dịch hợp lệ phát sinh sau backup từ audit/domain events nếu có.

### Rollback Drive

- Không xoá file hot nếu backup chưa verified.
- Nếu Drive lỗi, tắt cleanup job; ứng dụng tiếp tục giữ ảnh và cảnh báo dung lượng.

## 12. Quan sát sau go-live

Theo dõi ít nhất:

- RPC error rate và latency.
- Idempotency conflicts.
- Đơn kẹt trạng thái quá SLA.
- Work package chưa nhận/phân lại.
- Inventory documents pending/disputed.
- Chênh ledger so với balance projection.
- Notification phát trùng/thất bại.
- Backup Drive pending/failed và ảnh sắp hết hạn.
- Truy cập bị từ chối vào đơn Trường học/financials.
- Offline queue tồn quá lâu.

Thiết lập cảnh báo P0 cho rò dữ liệu mật, nhập kho trùng, tồn kho âm hoặc mất ảnh chưa backup.

## 13. Hạng mục code theo thứ tự

| Epic | Đầu ra | Phụ thuộc |
|---|---|---|
| E01 Organization/RBAC | Unit, assignment, grant, permission resolver | M01–M02 |
| E02 Orders V2 | Form bốn loại, list, detail, state machine | M03–M05 |
| E03 Confidentiality | Financial split, school RLS, private attachments | M04, M10 |
| E04 Production | Package, batch, task, approval RPC | M05, M09 |
| E05 Inventory | Warehouse, document, ledger, approval | M06, M09 |
| E06 Delivery | Run, stop, delegation, GPS/km | M07, M09 |
| E07 Events/Inbox | Domain events, notifications, sounds/deep links | M08 |
| E08 Media lifecycle | Upload, checksum, Drive backup, cleanup | M04, M11 |
| E09 KPI/Reports | KPI from verified events | E04–E07 |
| E10 Migration/Cutover | Backfill, reconciliation, flags, runbook | Tất cả |

## 14. Definition of Done cho mỗi migration

- Có forward SQL và precondition.
- Đã chạy hai lần trên staging mà không nhân đôi dữ liệu.
- Có query verify và expected result.
- Có test quyền positive/negative.
- Có đánh giá lock/downtime.
- Có log/checkpoint backfill.
- Có cách dừng/resume.
- Không chứa secret/service key.
- Có cập nhật đặc tả và changelog nếu schema khác baseline.

## 15. Bước triển khai kế tiếp

1. Chụp schema production thực tế bằng read-only để so với `supabase/schema.sql` và toàn bộ file migration.
2. Tạo `supabase/migrations/` và viết M01–M02 trước.
3. Dựng staging từ backup mới nhất.
4. Viết bộ preflight/reconciliation queries.
5. Chạy M01–M02, backfill organization và xử lý profile `unmapped`.
6. Chỉ sau khi E01 đạt mới bắt đầu Orders V2/M03–M05.

---

Kế hoạch này không tự cấp quyền chạy trên production. Mỗi đợt migration production phải có backup đã kiểm tra restore, log kết quả, người duyệt và tiêu chí go/no-go cụ thể.
