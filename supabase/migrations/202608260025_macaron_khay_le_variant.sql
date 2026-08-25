-- Thêm mức giá bán lẻ theo khay (không nguyên thùng) cho Macaron Mix Màu,
-- theo yêu cầu chủ shop — khách mua lẻ 48.000đ/khay.
begin;

insert into public.product_variants (product_id, label, price)
select p.id, '1 khay lẻ (48.000đ/khay)', 48000
from public.products p
where p.name = 'Macaron Mix Màu - Khay 36 cặp (4cm)' and p.category = 'macaron'
  and not exists (
    select 1 from public.product_variants pv
    where pv.product_id = p.id and pv.label = '1 khay lẻ (48.000đ/khay)'
  );

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202608260025_macaron_khay_le_variant', 'completed', now(),
  'Added retail per-khay price variant (48.000đ/khay) to Macaron Mix Màu, alongside existing thùng-based pricing.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
