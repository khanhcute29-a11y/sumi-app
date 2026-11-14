# Kiểm tra database Bán hàng tại quầy (không cần Supabase)

Chạy toàn bộ migration `202611141000_ban_hang_quay_that.sql` trên Postgres giả lập (PGlite) rồi
đi qua các luồng: bán, gửi trùng khi mất mạng, sửa giá, giảm giá vượt mức + duyệt, ghi nợ, thu nợ,
huỷ, chuyển khoản, xuất huỷ, kiểm kho, bếp giao/quầy nhận, kết ca, báo cáo, phân quyền đọc/ghi.

```bash
mkdir -p /tmp/pgtest && cd /tmp/pgtest && npm i @electric-sql/pglite@0.2.17
node <repo>/supabase/tests/ban_hang_quay/kich_ban.mjs <repo>/supabase/tests/ban_hang_quay/khung_gia_lap.sql <repo>/supabase/migrations/202611141000_ban_hang_quay_that.sql <repo>/supabase/migrations/202611141010_ban_hang_quay_mat_mang_va_thu_don.sql <repo>/supabase/migrations/202611141020_ban_hang_quay_giao_don_dat.sql
```

`khung_gia_lap.sql` chỉ dựng các bảng tối thiểu (profiles, products, finished_goods_stock…) để chạy thử — KHÔNG chạy trên database thật.

## Thử GIAO DIỆN chạy thật mà không đụng database thật

`thu_giao_dien.jsx` chạy màn Bán tại quầy ở chế độ thật trên PGlite (Postgres chạy ngay trong trình duyệt).
Mọi `supabase.rpc` / `supabase.from` bị chuyển vào PGlite; ghi thẳng bảng bị chặn; ảnh không tải lên thật.
Chỉ ĐỌC sản phẩm + khách thật (60 món, 50 khách) để có dữ liệu giống thật.

1. Tạo thư mục `.thu-that/` ở gốc repo (đừng commit), chép vào:
   - `node_modules/@electric-sql/pglite/dist` → `.thu-that/pglite`
   - `khung_gia_lap.sql` + `them_cho_giao_dien.sql` (nối lại) → `.thu-that/stub.sql`
   - `thu_giao_dien.jsx` → `.thu-that/harness.jsx`
2. `npm run dev`, đăng nhập, mở `/?mockup=ban-hang`.
3. Console trình duyệt:
   `const m = await import('/.thu-that/harness.jsx'); await m.chay({ vaiTro: 'sale' }); m.troGiup();`
   (`vaiTro`: `sale` = nhân viên, `admin` = quản lý, `owner` = giám đốc). `window.__q(sql)` đọc PGlite;
   `window.__la(uid, sql)` chạy 1 câu dưới tên người khác (VD quản lý `…0a2` bấm duyệt).
