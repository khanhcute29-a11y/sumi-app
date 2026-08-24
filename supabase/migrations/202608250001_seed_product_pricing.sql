-- Seed product pricing from SUMI 2025-2026 price list
begin;

-- Delete old pricing data
delete from public.product_pricing;

-- Insert Mousse Dâu pricing (by size)
insert into public.product_pricing (product_id, size, weight_gram, price)
select id, size, null, price
from (
  select p.id, t.size, t.price
  from public.products p,
  lateral (values
    ('16cm', 280000),
    ('18cm', 320000),
    ('20cm', 360000),
    ('22cm', 450000),
    ('24cm', 550000),
    ('26cm', 700000),
    ('28cm', 850000),
    ('30cm', 1000000)
  ) t(size, price)
  where lower(p.name) like '%mousse%dâu%' or lower(p.name) like '%mousse%d%u%'
  limit 1
) data
on conflict(product_id, size, weight_gram) do update set price = excluded.price;

-- Insert Set Mousse Ly Tim (30k/lý)
insert into public.product_pricing (product_id, size, weight_gram, price)
select id, 'Ly Tim', null, 30000
from public.products
where lower(name) like '%mousse%tim%' or lower(name) like '%mousse%l%tim%'
on conflict(product_id, size, weight_gram) do update set price = excluded.price;

-- Insert Set Mousse Ly Trôn (45k/hũ)
insert into public.product_pricing (product_id, size, weight_gram, price)
select id, 'Ly Trôn', null, 45000
from public.products
where lower(name) like '%mousse%trôn%' or lower(name) like '%mousse%l%tr%n%'
on conflict(product_id, size, weight_gram) do update set price = excluded.price;

-- Insert Cupcake (25k/bánh)
insert into public.product_pricing (product_id, size, weight_gram, price)
select id, 'Bánh', null, 25000
from public.products
where lower(name) like '%cupcake%'
on conflict(product_id, size, weight_gram) do update set price = excluded.price;

-- Clear all orders (delete in cascade order due to FKs)
delete from public.delivery_stops where order_id in (select id from public.orders);
delete from public.work_package_items where work_package_id in (select id from public.order_work_packages);
delete from public.order_work_packages;
delete from public.order_items;
delete from public.order_attachments;
delete from public.orders;

insert into public.migration_runs(migration_key,status,finished_at,notes)
values('202608250001_seed_product_pricing','completed',now(),'Seed product pricing for Mousse Dâu sizes, Set Mousse Ly variants, Cupcake. Clear all orders.')
on conflict(migration_key) do update set status='completed',finished_at=now(),notes=excluded.notes;

commit;
