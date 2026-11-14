# Kiểm tra database Bán hàng tại quầy (không cần Supabase)

Chạy toàn bộ migration `202611141000_ban_hang_quay_that.sql` trên Postgres giả lập (PGlite) rồi
đi qua các luồng: bán, gửi trùng khi mất mạng, sửa giá, giảm giá vượt mức + duyệt, ghi nợ, thu nợ,
huỷ, chuyển khoản, xuất huỷ, kiểm kho, bếp giao/quầy nhận, kết ca, báo cáo, phân quyền đọc/ghi.

```bash
mkdir -p /tmp/pgtest && cd /tmp/pgtest && npm i @electric-sql/pglite@0.2.17
node <repo>/supabase/tests/ban_hang_quay/kich_ban.mjs <repo>/supabase/tests/ban_hang_quay/khung_gia_lap.sql <repo>/supabase/migrations/202611141000_ban_hang_quay_that.sql
```

`khung_gia_lap.sql` chỉ dựng các bảng tối thiểu (profiles, products, finished_goods_stock…) để chạy thử — KHÔNG chạy trên database thật.
