-- Run manually in Supabase SQL Editor. Safe to re-run (idempotent).

create table if not exists task_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  station text check (station in ('bakery','nong','lanh','xuong41','xuong42')),
  active boolean not null default true,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table task_templates enable row level security;

drop policy if exists "read task_templates" on task_templates;
create policy "read task_templates" on task_templates for select
  using (auth.role() = 'authenticated' and public.is_approved());

drop policy if exists "owner manage task_templates" on task_templates;
create policy "owner manage task_templates" on task_templates for all
  using (
    exists (
      select 1 from profiles
      where id = auth.uid()
        and (role in ('owner','admin') or extra_roles && array['owner','admin'])
    )
  )
  with check (
    auth.role() = 'authenticated' and public.is_approved()
    and exists (
      select 1 from profiles
      where id = auth.uid()
        and (role in ('owner','admin') or extra_roles && array['owner','admin'])
    )
  );

create table if not exists task_completions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references task_templates(id) on delete cascade,
  staff_id uuid not null references profiles(id) on delete cascade,
  date date not null default current_date,
  completed_at timestamptz,
  confirmed_by uuid references profiles(id) on delete set null,
  confirmed_at timestamptz,
  unique (template_id, staff_id, date)
);

alter table task_completions enable row level security;

drop policy if exists "read task_completions" on task_completions;
create policy "read task_completions" on task_completions for select
  using (
    staff_id = auth.uid()
    or exists (
      select 1 from profiles
      where id = auth.uid()
        and (role in ('owner','admin') or extra_roles && array['owner','admin'])
    )
  );

drop policy if exists "self insert task_completions" on task_completions;
create policy "self insert task_completions" on task_completions for insert
  with check (
    auth.role() = 'authenticated' and public.is_approved()
    and staff_id = auth.uid()
  );

drop policy if exists "self or owner update task_completions" on task_completions;
create policy "self or owner update task_completions" on task_completions for update
  using (
    staff_id = auth.uid()
    or exists (
      select 1 from profiles
      where id = auth.uid()
        and (role in ('owner','admin') or extra_roles && array['owner','admin'])
    )
  )
  with check (auth.role() = 'authenticated' and public.is_approved());

-- Chốt ở tầng cột: chỉ chủ/quản lý mới được ghi confirmed_by/confirmed_at
-- (xác nhận cuối ngày), và staff_id không bao giờ được đổi khi update.
create or replace function public.enforce_task_completion_update_rules()
returns trigger as $$
declare
  is_boss boolean;
begin
  if auth.uid() is null then
    return new; -- service role / SQL editor
  end if;

  if new.staff_id is distinct from old.staff_id then
    raise exception 'Không được đổi nhân viên của mục checklist đã tạo.';
  end if;

  select exists (
    select 1 from profiles
    where id = auth.uid()
      and (role in ('owner','admin') or extra_roles && array['owner','admin'])
  ) into is_boss;

  if not is_boss and (
       new.confirmed_by is distinct from old.confirmed_by
    or new.confirmed_at is distinct from old.confirmed_at
  ) then
    raise exception 'Chỉ chủ hoặc quản lý mới được xác nhận checklist cuối ngày.';
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_enforce_task_completion_update_rules on task_completions;
create trigger trg_enforce_task_completion_update_rules
  before update on task_completions
  for each row execute procedure public.enforce_task_completion_update_rules();

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('assigned','adhoc')),
  title text not null,
  description text,
  order_code text,
  assignee_id uuid not null references profiles(id) on delete cascade,
  deadline timestamptz,
  batch_id uuid,
  status text not null default 'open' check (status in ('open','done','exempted')),
  completed_at timestamptz,
  late boolean,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table tasks enable row level security;

drop policy if exists "read own or owner tasks" on tasks;
create policy "read own or owner tasks" on tasks for select
  using (
    assignee_id = auth.uid()
    or exists (
      select 1 from profiles
      where id = auth.uid()
        and (role in ('owner','admin') or extra_roles && array['owner','admin'])
    )
  );

drop policy if exists "insert tasks" on tasks;
create policy "insert tasks" on tasks for insert
  with check (
    auth.role() = 'authenticated' and public.is_approved()
    and (
      (category = 'adhoc' and assignee_id = auth.uid())
      or exists (
        select 1 from profiles
        where id = auth.uid()
          and (role in ('owner','admin') or extra_roles && array['owner','admin'])
      )
    )
  );

drop policy if exists "assignee or owner update tasks" on tasks;
create policy "assignee or owner update tasks" on tasks for update
  using (
    assignee_id = auth.uid()
    or exists (
      select 1 from profiles
      where id = auth.uid()
        and (role in ('owner','admin') or extra_roles && array['owner','admin'])
    )
  )
  with check (auth.role() = 'authenticated' and public.is_approved());

-- Chốt ở tầng cột: nhân viên được giao chỉ được tự hoàn thành việc của mình
-- (status -> 'done', kèm completed_at/late). Không được tự miễn trừ, không được
-- đổi người phụ trách hay hạn chót — những việc đó phải đi qua luồng duyệt.
create or replace function public.enforce_task_update_rules()
returns trigger as $$
declare
  is_boss boolean;
begin
  if auth.uid() is null then
    return new; -- service role / SQL editor
  end if;

  select exists (
    select 1 from profiles
    where id = auth.uid()
      and (role in ('owner','admin') or extra_roles && array['owner','admin'])
  ) into is_boss;

  if is_boss then
    return new;
  end if;

  if new.assignee_id is distinct from old.assignee_id then
    raise exception 'Chỉ chủ hoặc quản lý mới được đổi người phụ trách công việc.';
  end if;

  if new.deadline is distinct from old.deadline then
    raise exception 'Chỉ chủ hoặc quản lý mới được đổi hạn chót công việc.';
  end if;

  if new.status is distinct from old.status and new.status = 'exempted' then
    raise exception 'Miễn trừ công việc phải được chủ duyệt — không tự đặt được.';
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_enforce_task_update_rules on tasks;
create trigger trg_enforce_task_update_rules
  before update on tasks
  for each row execute procedure public.enforce_task_update_rules();

drop policy if exists "owner delete tasks" on tasks;
create policy "owner delete tasks" on tasks for delete
  using (
    exists (
      select 1 from profiles
      where id = auth.uid()
        and (role in ('owner','admin') or extra_roles && array['owner','admin'])
    )
  );

-- --- Nhận giao hộ (self-claim) trên màn Vận Chuyển ---
-- Policy "update orders" trong migrate_orders_security.sql chỉ cho các vai trò
-- vận hành đơn (và bỏ qua extra_roles), nên nhân viên kho/kế toán/bếp phụ...
-- không thể nhận giao hộ. Postgres OR các permissive policy lại với nhau, nên
-- thêm một policy hẹp riêng cho đúng thao tác nhận giao hộ.
drop policy if exists "self-claim delivery orders" on orders;
create policy "self-claim delivery orders" on orders for update
  using (
    auth.role() = 'authenticated' and public.is_approved()
    and (
      -- Nhận giao hộ: chỉ đơn Chờ giao CHƯA có người nhận
      (status = 'cho_giao' and (shipper_staff_name is null or shipper_staff_name = ''))
      -- Hoàn tất / chụp biên bản: chỉ đơn chính mình đang giao
      or (status = 'dang_giao' and shipper_staff_name = (select full_name from profiles where id = auth.uid()))
    )
  )
  with check (
    auth.role() = 'authenticated' and public.is_approved()
    and status in ('dang_giao', 'hoan_thanh')
    and shipper_staff_name = (select full_name from profiles where id = auth.uid())
  );

-- Trigger có sẵn enforce_order_update_permissions() chạy TRƯỚC trigger nhận giao hộ bên
-- dưới (Postgres gọi trigger theo thứ tự tên) và ném lỗi ngay với mọi vai trò ngoài danh
-- sách vận hành đơn — làm tính năng nhận giao hộ vô hiệu dù policy đã mở. Khai báo lại
-- hàm với đúng một ngoại lệ hẹp: chuỗi thao tác nhận giao hộ của chính người nhận.
create or replace function public.enforce_order_update_permissions()
returns trigger as $$
declare
  my_role text;
  my_name text;
  allowed_cols text[];
  changed_keys text[];
begin
  select role into my_role from profiles where id = auth.uid();

  if my_role in ('owner', 'cashier', 'admin', 'sale') then
    return new;
  end if;

  if my_role in ('kitchen', 'bakery', 'kitchen_lead', 'kitchen_deputy') then
    if not (old.status in ('moi', 'dang_lam') and new.status in ('moi', 'dang_lam', 'cho_giao')) then
      raise exception 'Bếp chỉ được thao tác đơn ở bước Mới / Đang làm / chuyển sang Chờ giao.';
    end if;
    allowed_cols := array['status', 'kitchen_staff_name', 'kitchen_photo_url'];
  elsif my_role = 'shipper' then
    if not (old.status in ('cho_giao', 'dang_giao') and new.status in ('cho_giao', 'dang_giao', 'hoan_thanh')) then
      raise exception 'Vận chuyển chỉ được thao tác đơn ở bước Chờ giao / Đang giao / Hoàn thành.';
    end if;
    allowed_cols := array['status', 'shipper_staff_name', 'pickup_photo_url', 'delivery_photo_url', 'signed_doc_photo_url',
      'pickup_lat', 'pickup_lng', 'delivery_lat', 'delivery_lng', 'completed_at', 'late_reason'];
  else
    select full_name into my_name from profiles where id = auth.uid();

    if old.status = 'cho_giao' and new.status = 'dang_giao'
       and my_name is not null and new.shipper_staff_name = my_name then
      allowed_cols := array['status', 'shipper_staff_name', 'pickup_photo_url', 'pickup_lat', 'pickup_lng'];
    elsif old.status = 'dang_giao' and new.status in ('dang_giao', 'hoan_thanh')
       and my_name is not null and old.shipper_staff_name = my_name then
      allowed_cols := array['status', 'shipper_staff_name', 'pickup_photo_url', 'pickup_lat', 'pickup_lng',
        'delivery_photo_url', 'delivery_lat', 'delivery_lng', 'completed_at', 'late_reason', 'signed_doc_photo_url'];
    else
      raise exception 'Bạn không có quyền sửa đơn hàng.';
    end if;
  end if;

  select array_agg(n.key) into changed_keys
  from jsonb_each(to_jsonb(new)) n
  join jsonb_each(to_jsonb(old)) o on n.key = o.key
  where n.value is distinct from o.value;

  if changed_keys is not null and exists (select 1 from unnest(changed_keys) k where k <> all (allowed_cols)) then
    raise exception 'Bạn không có quyền sửa các trường: %', array_to_string(changed_keys, ', ');
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- Policy trên chỉ chốt được ở tầng row; chốt thêm ở tầng cột để người nhận giao
-- hộ (không thuộc nhóm vai trò vận hành đơn) chỉ đụng được đúng các cột của
-- thao tác xuất bến.
create or replace function public.enforce_order_self_claim_columns()
returns trigger as $$
declare
  is_ops boolean;
  my_name text;
  allowed_cols text[];
  changed_keys text[];
begin
  if auth.uid() is null then
    return new; -- service role / SQL editor
  end if;

  select exists (
    select 1 from profiles
    where id = auth.uid()
      and (
        role in ('owner','admin','cashier','sale','kitchen','bakery','shipper')
        or extra_roles && array['owner','admin','cashier','sale','kitchen','bakery','shipper']
      )
  ) into is_ops;

  if is_ops then
    return new;
  end if;

  -- Người ngoài nhóm vận hành đơn: chỉ được đổi đúng các cột của thao tác nhận giao hộ
  -- (xuất bến) và của thao tác hoàn tất chính đơn mình đang giao.
  select full_name into my_name from profiles where id = auth.uid();

  if old.status = 'cho_giao' and new.status = 'dang_giao'
     and my_name is not null and new.shipper_staff_name = my_name then
    allowed_cols := array['status', 'shipper_staff_name', 'pickup_photo_url', 'pickup_lat', 'pickup_lng'];
  elsif old.status = 'dang_giao' and new.status in ('dang_giao', 'hoan_thanh')
     and my_name is not null and old.shipper_staff_name = my_name then
    allowed_cols := array['status', 'shipper_staff_name', 'pickup_photo_url', 'pickup_lat', 'pickup_lng',
      'delivery_photo_url', 'delivery_lat', 'delivery_lng', 'completed_at', 'late_reason', 'signed_doc_photo_url'];
  else
    raise exception 'Bạn chỉ được nhận giao hộ, hoặc hoàn tất đơn chính mình đang giao.';
  end if;

  select array_agg(n.key) into changed_keys
  from jsonb_each(to_jsonb(new)) n
  join jsonb_each(to_jsonb(old)) o on n.key = o.key
  where n.value is distinct from o.value;

  if changed_keys is not null and exists (select 1 from unnest(changed_keys) k where k <> all (allowed_cols)) then
    raise exception 'Bạn chỉ được nhận giao hộ đơn này, không được sửa thông tin khác của đơn.';
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_enforce_order_self_claim_columns on orders;
create trigger trg_enforce_order_self_claim_columns
  before update on orders
  for each row execute procedure public.enforce_order_self_claim_columns();

alter table approval_requests drop constraint if exists approval_requests_type_check;
alter table approval_requests add constraint approval_requests_type_check
  check (type in ('order_edit','order_cancel','order_delete','shift_recheck','leave_request','task_exemption'));

alter table approval_requests add column if not exists task_id uuid references tasks(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'task_templates'
  ) then
    alter publication supabase_realtime add table task_templates;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'task_completions'
  ) then
    alter publication supabase_realtime add table task_completions;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tasks'
  ) then
    alter publication supabase_realtime add table tasks;
  end if;
end $$;
