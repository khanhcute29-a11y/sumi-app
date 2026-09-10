-- Nạp dữ liệu thật cho 2 chỉ số KPI còn thiếu (tỷ lệ bánh lỗi, khiếu nại
-- khách) — đã xác nhận trước đó KHÔNG có bảng nào ghi nhận việc này, nên
-- compute_kpi_score chưa tính được, chỉ mới seed "chuyên cần".
--
-- Theo đúng tinh thần P6.3 (đảo chiều động cơ): TỰ KHAI phải tách biệt rõ
-- với BỊ NGƯỜI KHÁC PHÁT HIỆN — cột `tu_khai` ghi lại đúng việc này, để sau
-- này công thức tính điểm có thể cộng cho tự khai, chỉ trừ khi bị phát hiện.
-- CHƯA nối vào compute_kpi_score ở đây — cần vài tuần dữ liệu thật để sếp tự
-- chốt target/floor hợp lý (đúng như bài học "không bịa số" của đợt trước).
begin;
set local lock_timeout = '10s';
set local statement_timeout = '30s';

create table if not exists public.product_defect_logs (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.profiles(id) on delete cascade,
  reported_by uuid not null references public.profiles(id),
  tu_khai boolean not null default false,
  product_name text not null,
  quantity numeric not null default 1 check (quantity > 0),
  reason text,
  photo_url text,
  created_at timestamptz not null default now()
);

create index if not exists idx_product_defect_logs_staff on public.product_defect_logs(staff_id, created_at);

alter table public.product_defect_logs enable row level security;

drop policy if exists "staff insert defect logs" on public.product_defect_logs;
create policy "staff insert defect logs" on public.product_defect_logs
  for insert with check (
    auth.role() = 'authenticated'
    and reported_by = auth.uid()
    and tu_khai = (staff_id = auth.uid())
  );

drop policy if exists "read defect logs" on public.product_defect_logs;
create policy "read defect logs" on public.product_defect_logs
  for select using (staff_id = auth.uid() or reported_by = auth.uid() or public.is_business_director());

drop policy if exists "director delete defect logs" on public.product_defect_logs;
create policy "director delete defect logs" on public.product_defect_logs
  for delete using (public.is_business_director());

revoke all on public.product_defect_logs from anon;
grant select, insert on public.product_defect_logs to authenticated;
grant delete on public.product_defect_logs to authenticated;

create table if not exists public.customer_complaints (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete set null,
  order_code text,
  staff_id uuid references public.profiles(id) on delete set null,
  category text not null check (category in ('giao_tre','sai_don','chat_luong','thai_do','khac')),
  description text not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_customer_complaints_staff on public.customer_complaints(staff_id, created_at);

alter table public.customer_complaints enable row level security;

drop policy if exists "staff insert complaints" on public.customer_complaints;
create policy "staff insert complaints" on public.customer_complaints
  for insert with check (auth.role() = 'authenticated' and created_by = auth.uid());

drop policy if exists "read complaints" on public.customer_complaints;
create policy "read complaints" on public.customer_complaints
  for select using (staff_id = auth.uid() or created_by = auth.uid() or public.is_business_director());

drop policy if exists "director delete complaints" on public.customer_complaints;
create policy "director delete complaints" on public.customer_complaints
  for delete using (public.is_business_director());

revoke all on public.customer_complaints from anon;
grant select, insert on public.customer_complaints to authenticated;
grant delete on public.customer_complaints to authenticated;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609101200_product_defect_and_complaint_logs', 'completed', now(),
  'Bang moi product_defect_logs + customer_complaints de bat dau ghi nhan du lieu that cho 2 chi so KPI con thieu (ty le banh loi, khieu nai khach). Cot tu_khai tach biet ro tu khai vs bi nguoi khac phat hien theo dung tinh than dao chieu dong co (P6.3). CHUA noi vao compute_kpi_score - can du lieu that vai tuan de chot target/floor, tranh bia so.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
