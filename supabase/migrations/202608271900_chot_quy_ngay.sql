-- "Chốt quỹ ngày" (phiên bản tối giản, chuẩn bị Test Run 1/9): Kế toán nhập
-- số tiền mặt thực tế kiểm đếm tại quầy, hệ thống tự tính số dư lý thuyết từ
-- Sổ Quỹ (cashbook_entries) và lưu lại chênh lệch.
--
-- LƯU Ý QUAN TRỌNG (đã kiểm tra thật trong DB trước khi viết): bảng
-- cashbook_entries hiện CHỈ có dòng type='chi' (chi tiền), CHƯA có dòng
-- type='thu' nào — doanh thu bán hàng hiện không được ghi vào Sổ Quỹ (tính
-- riêng qua bảng orders). Vì vậy "số dư lý thuyết" tính ra ở đây chỉ phản ánh
-- tổng đã CHI RA từ khi có dữ liệu, KHÔNG phải số tiền mặt thực sự phải có
-- trong quầy. Đây là giới hạn có thật của bản tối giản này, không phải lỗi —
-- Kế toán cần hiểu rõ trước khi dùng số "lệch quỹ" để đối chiếu.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '60s';

create table if not exists public.daily_cash_closes (
  id uuid primary key default gen_random_uuid(),
  closing_date date not null default current_date,
  expected_amount numeric not null,
  actual_amount numeric not null,
  discrepancy numeric not null,
  closed_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.daily_cash_closes enable row level security;

drop policy if exists "finance read cash closes" on public.daily_cash_closes;
create policy "finance read cash closes" on public.daily_cash_closes
  for select using (public.is_finance_operator() or public.is_business_director());

revoke all on public.daily_cash_closes from public, anon, authenticated;
grant select on public.daily_cash_closes to authenticated;

-- Chỉ ghi qua RPC (security definer) — expected_amount do server tự tính,
-- không nhận từ client, tránh Kế toán/ai đó gửi sai số dư lý thuyết.
create or replace function public.close_daily_cash(p_actual_amount numeric)
returns public.daily_cash_closes
language plpgsql security definer set search_path = public as $$
declare
  v_expected numeric;
  v_row public.daily_cash_closes%rowtype;
begin
  if not public.is_finance_operator() then
    raise exception 'Chỉ Kế toán, Thu ngân hoặc Giám đốc được chốt quỹ';
  end if;
  if p_actual_amount is null then
    raise exception 'Bắt buộc nhập số tiền mặt thực tế kiểm đếm.';
  end if;

  select coalesce(sum(case when type = 'thu' then amount else -amount end), 0)
  into v_expected
  from public.cashbook_entries;

  insert into public.daily_cash_closes (closing_date, expected_amount, actual_amount, discrepancy, closed_by)
  values (current_date, v_expected, p_actual_amount, p_actual_amount - v_expected, auth.uid())
  returning * into v_row;

  return v_row;
end $$;

revoke all on function public.close_daily_cash(numeric) from public, anon;
grant execute on function public.close_daily_cash(numeric) to authenticated;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values (
  '202608271900_chot_quy_ngay',
  'completed',
  now(),
  'Bảng daily_cash_closes + RPC close_daily_cash (bản tối giản chuẩn bị Test Run 1/9). expected_amount tính từ SUM(thu)-SUM(chi) trong cashbook_entries — hiện chỉ có dòng chi, chưa có dòng thu (doanh thu bán hàng tính riêng qua orders), nên số lệch quỹ hiện tại chỉ phản ánh phần đã chi, cần bổ sung ghi nhận thu tiền mặt vào cashbook_entries nếu muốn đối chiếu quỹ chính xác.'
)
on conflict (migration_key) do update
  set status = 'completed', finished_at = now(), notes = excluded.notes;

commit;
