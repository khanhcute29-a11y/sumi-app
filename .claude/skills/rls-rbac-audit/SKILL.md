---
name: rls-rbac-audit
description: Soát RLS policy + hàm Postgres của một bảng/tính năng trong Sumi Bakery, đối chiếu với ma trận RBAC trong CLAUDE.md, để bắt lỗi phân quyền lệch giữa client và database.
disable-model-invocation: false
---

# RLS/RBAC Audit — Sumi Bakery

Dự án này **không có middleware phân quyền phía app**. Toàn bộ RBAC được thực thi bằng
Postgres RLS policy + các hàm `is_finance_operator()`, `is_business_director()`,
`is_payroll_manager()` (xem CLAUDE.md, mục "RBAC" và "Tech stack thật đang chạy").
Vì vậy một gate phân quyền chỉ tồn tại đúng khi **cả 3 lớp sau đều khớp nhau**:

1. UI/client (ẩn nút, ẩn số liệu theo `profiles.role`)
2. RLS policy trên bảng liên quan (`CREATE POLICY ... USING (...)`)
3. Hàm/RPC được gọi (đặc biệt các hàm `SECURITY DEFINER` — chúng bỏ qua RLS của caller
   và tự làm luật riêng bên trong)

Bug đã từng xảy ra đúng kiểu này: sửa xong ở client nhưng quên trigger/hàm DB vẫn chặn,
hoặc ngược lại (xem memory `staff-permission-gate-bug-pattern.md`). Skill này tồn tại để
việc soát 3 lớp đó thành một bước có checklist, thay vì chỉ đọc code UI rồi kết luận "đã sửa".

## Ma trận RBAC tham chiếu (từ CLAUDE.md)

| Vai trò | Được thấy | Phải ẩn 100% |
|---|---|---|
| `RETAIL_POS` | Giá bán lẻ | COGS |
| `KITCHEN_HOT_COLD` | BOM T1/T2, Timer | Tổng doanh thu & COGS |
| `STORE_ASSISTANT` | SOP checklist | Mọi giá trị tiền |
| `DRIVER_LOGISTICS` | Địa chỉ giao, số kiện, nút Photo Proof | COGS & Gross Profit |
| `OWNER_ACCOUNTING` | Toàn quyền tài chính, Audit Log, PIN Sếp | — |

Lưu ý: vai trò thật trong DB được suy từ `profiles.role` + `profiles.station`
(xem checkpoint `checkpoint_20260903.md` trong memory), không phải khớp chuỗi y hệt
tên trong bảng trên — khi audit phải tra cách map thật trong code, không đoán.

## Quy trình khi được gọi cho một bảng/tính năng

1. **Xác định bảng/RPC liên quan.** Grep `supabase/` (bao gồm `supabase/functions/`,
   `supabase/migrations/`, và các file `CHAY_TRONG_SQL_EDITOR_*.sql`/`RUN_IN_SQL_EDITOR_*.sql`
   chưa được dọn vào `migrations/`) để tìm mọi `CREATE POLICY`, `CREATE FUNCTION`,
   `GRANT` chạm vào bảng đó.
2. **Liệt kê vai trò nào được phép làm gì** theo RLS/hàm tìm thấy — viết thành bảng
   thực tế (role → hành động → được/không).
3. **Đối chiếu với ma trận ở trên.** Với mỗi ô lệch (ví dụ hàm không lọc theo role,
   hoặc SECURITY DEFINER trả về cột tiền cho role không nên thấy), ghi rõ:
   file, tên policy/hàm, vai trò bị lộ, dữ liệu bị lộ.
4. **Kiểm tra phía client tương ứng** (`src/screens/`, `src/components/`) — component
   có đang ẩn đúng cột/nút theo `profiles.role` không. Một gate chỉ "sửa xong" khi cả
   RLS/hàm DB và client đều khớp; nếu chỉ một bên đúng thì đây chính là dạng bug đã lặp lại.
5. **Báo cáo dạng danh sách phát hiện**, không tự động sửa trừ khi được yêu cầu — đây
   là dự án đang chạy production (Vercel), thay đổi RLS sai có thể khoá quyền truy cập
   thật của nhân viên đang dùng app.

## Việc KHÔNG làm

- Không tự ý chạy migration hay sửa RLS trên Supabase thật khi chưa được xác nhận.
- Không giả định tên vai trò trong code khớp y hệt tên trong CLAUDE.md — luôn tra hàm
  map thật (`is_business_director()` v.v.) trước khi kết luận.
