---
name: sql-patch-tracker
description: Theo dõi các file SQL rời (CHAY_TRONG_SQL_EDITOR_*.sql / RUN_IN_SQL_EDITOR_*.sql) ở gốc repo sumi-app — file nào đã chạy trên Supabase, file nào nên gộp thành migration chính thức trong supabase/migrations/.
disable-model-invocation: true
---

# SQL Patch Tracker — sumi-app

Repo này có **hai hệ thống song song** để thay đổi schema Supabase:

1. `supabase/migrations/` — migration chính thức, có trong git.
2. File rời `CHAY_TRONG_SQL_EDITOR_*.sql` / `RUN_IN_SQL_EDITOR_*.sql` ở gốc repo —
   đây là quy ước **cố ý** của dự án (đã bị `.gitignore` loại trừ, xem dòng
   `CHAY_TRONG_SQL_EDITOR_*.sql` trong `.gitignore` kèm chú thích "File tạm để dán vào
   SQL Editor, không cần lưu vào kho mã"). Không coi đây là lỗi hay dọn dẹp — đây là
   quy trình làm việc thật: viết SQL, dán tay vào Supabase SQL Editor, chạy, xong.

Vấn đề thật: vì các file này không nằm trong git, không ai (kể cả Claude ở phiên sau)
biết được file nào **đã chạy rồi** và file nào **còn đang chờ** — dễ dẫn tới chạy nhầm
2 lần, hoặc tưởng đã áp dụng một thay đổi schema nhưng thực ra chưa.

## Khi được gọi

1. Liệt kê toàn bộ file `CHAY_TRONG_SQL_EDITOR_*.sql` / `RUN_IN_SQL_EDITOR_*.sql` ở gốc
   `sumi-app/`, sắp theo thời gian sửa đổi.
2. Với mỗi file, xác định trạng thái nhiều nhất có thể **từ bằng chứng gián tiếp** (vì
   không có bảng nào ghi log việc này):
   - Đối chiếu tên bảng/cột nó tạo ra với schema thật (dùng Supabase MCP nếu có, hoặc
     hỏi người dùng chạy một câu `SELECT` kiểm tra) — nếu cột/bảng đã tồn tại, khả năng
     cao file đã được chạy.
   - Đối chiếu với ghi chú trong CLAUDE.md/memory (ví dụ mục "Đã hoàn thành") xem tính
     năng liên quan có được xác nhận đang chạy không.
3. Với file **chưa chắc đã chạy**: hỏi thẳng người dùng thay vì đoán, vì chạy nhầm thứ
   tự trên Supabase thật có thể phá dữ liệu production.
4. Nếu người dùng xác nhận một file đã chạy và đại diện cho một thay đổi schema lâu dài
   (không phải one-off dọn dữ liệu), đề xuất tạo thêm bản sao có đánh số trong
   `supabase/migrations/` để migration đó không bị mất khi file gốc bị xoá/gitignore.

## Việc KHÔNG làm

- Không tự động xoá file `CHAY_TRONG_SQL_EDITOR_*.sql` cũ — người dùng có thể còn cần
  đối chiếu lại.
- Không tự chạy SQL trực tiếp lên Supabase production thay người dùng trừ khi được yêu
  cầu rõ ràng và đã xác nhận đây không phải lần chạy trùng.
