---
name: deploy-checklist
description: Chạy checklist trước/sau khi push sumi-app lên main (auto-deploy Vercel) — vì không có bộ test tự động, đây là bước kiểm chứng thật duy nhất trước khi thay đổi lên production đang được tiệm bánh dùng hàng ngày.
disable-model-invocation: true
---

# Deploy Checklist — sumi-app

Repo này auto-deploy lên Vercel ngay khi push `main`, **không có CI/test nào chặn lại**.
Checklist này là lớp kiểm tra cuối trước và sau khi push, đúc kết từ các sự cố đã gặp
(xem `memory/push-and-version-check.md`, `memory/boss-dashboard-blast-radius.md`).

## Trước khi push

1. Chạy `git status` và `git diff` — liệt kê rõ những file/tính năng nào thay đổi.
2. Xác định diff có đụng vào các vùng "blast radius cao" không:
   - `BossOverviewV3` (màn mặc định của Giám đốc — sửa sai ở đây làm cả vai trò đó
     trắng màn hình, không test trước được, phải xác nhận ngay sau push).
   - `supabase/migrations/*` — nếu có file migration MỚI, xác nhận đã đặt tên/số thứ
     tự đúng thứ tự thời gian và CHƯA chạy tay trên Supabase trước khi commit (tránh
     lệch giữa git history và DB thật).
   - `lib/geo.js` hoặc luồng GPS — không được gộp `ShippingV2Screen` về pre-fetch 1
     lần, đó là cố ý vì vị trí đổi liên tục trên nhiều điểm dừng.
3. Nếu file `.sql` nào dùng để chạy tay trong Supabase SQL Editor
   (`CHAY_TRONG_SQL_EDITOR_*.sql` / `RUN_IN_SQL_EDITOR_*.sql`), gọi thêm skill
   `sql-patch-tracker` để chắc chắn không chạy trùng hoặc sai thứ tự.
4. Nếu diff đụng bảng/RLS trong `supabase/`, cân nhắc chạy agent
   `rls-security-reviewer` trước khi push.

## Sau khi push lên main

Hook trong `.claude/settings.json` sẽ tự nhắc khi phát hiện `git push` lên `main`, nhưng
vẫn tự tay xác nhận đủ các bước sau (agent không verify được vì không có quyền vào máy
thật/điện thoại người dùng):

1. **PWA cache**: đóng HẲN app/tab (không chỉ reload) rồi mở lại link production —
   service worker cache bản cũ khiến test nhầm bản chưa deploy xong.
2. **Đăng nhập đúng vai trò bị ảnh hưởng**: nếu diff đụng màn hình theo RBAC
   (RETAIL_POS / KITCHEN_HOT_COLD / STORE_ASSISTANT / DRIVER_LOGISTICS /
   OWNER_ACCOUNTING), test bằng đúng tài khoản vai trò đó — không chỉ test bằng
   Owner/Admin vì Owner luôn thấy full quyền, không phát hiện được lỗi RLS ẩn dữ liệu.
3. Xem log build trên Vercel dashboard nếu nghi ngờ build lỗi im lặng (build thành
   công nhưng runtime lỗi thì Vercel không báo).
4. Nếu có teammate khác đang test cùng lúc, báo trước trong nhóm chat để tránh nhầm
   lẫn giữa bug thật và bản cache cũ của họ.

## Việc KHÔNG làm

- Không tự ý push nếu đang sửa dở `BossOverviewV3` mà chưa test được luồng Giám đốc —
  đề xuất người dùng tự xác nhận qua điện thoại/máy thật trước.
- Không coi checklist này là thay thế cho việc đọc kỹ diff — đây là bước bổ sung, không
  phải bước duy nhất.
