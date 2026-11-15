alter table public.feature_flags add column if not exists rollout_percentage int default 0, add column if not exists allowed_profile_ids uuid[] default '{}';
alter table public.products add column if not exists unit text, add column if not exists photo_url text;
alter table public.customers add column if not exists channel text, add column if not exists created_at timestamptz default now();
create or replace function public.create_order_v2(p_idempotency_key text, p_order_code text, p_order_type text, p_customer_id uuid, p_required_at timestamptz,
  p_fulfillment_method text, p_address text, p_note text, p_confidentiality text, p_items jsonb, p_ship_fee numeric, p_deposit numeric,
  p_payment_method text, p_total numeric, p_discount_amount numeric, p_promotion_note text, p_tax_code text, p_vat_amount numeric)
returns uuid language plpgsql as $$
declare v uuid; i jsonb;
begin
  insert into public.orders(order_code, customer_id, required_at, status_v2, total, deposit, created_by) values (p_order_code, p_customer_id, p_required_at, 'new', p_total, p_deposit, auth.uid()) returning id into v;
  for i in select value from jsonb_array_elements(p_items) loop
    insert into public.order_items(order_id, name, qty, size) values (v, i->>'name', (i->>'quantity')::int, i->'specification'->>'size');
  end loop;
  return v;
end $$;
