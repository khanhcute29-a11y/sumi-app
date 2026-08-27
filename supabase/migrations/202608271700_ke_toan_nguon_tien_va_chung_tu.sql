-- Bổ sung "bắt buộc chọn Nguồn tiền chi ra + ảnh chứng từ khi Kế toán chi
-- tiền" vào ĐÚNG hệ thống Thu-Chi thật đang chạy (expense_claims,
-- salary_advance_requests, RPC record_expense_claim/pay_salary_advance).
--
-- KHÔNG tạo bảng mới (finance_requests/general_ledger_transactions/
-- daily_cash_counts) — đã xác minh hệ thống thật khác hẳn tên bảng trong file
-- đặc tả nhưng ĐẦY ĐỦ và tinh vi hơn (đã có cashbook_entries, payroll_entries
-- tự động trừ tạm ứng qua trigger, thông báo realtime qua
-- notify_finance_request_status). Tạo bảng mới sẽ sinh ra 2 hệ thống kế toán
-- song song không liên kết nhau — rủi ro thất thoát dữ liệu tiền thật.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '60s';

-- expense_claims chưa có cột nguồn tiền (salary_advance_requests đã có sẵn
-- payment_method từ lúc TẠO yêu cầu — nhưng đó là nguồn nhân viên ĐỀ XUẤT,
-- không phải nguồn Kế toán THỰC CHI, nên vẫn cần ghi riêng lúc chi thật).
alter table public.expense_claims
  add column if not exists disbursed_payment_method text,
  add column if not exists disbursed_receipt_url text;

alter table public.salary_advance_requests
  add column if not exists disbursed_payment_method text,
  add column if not exists disbursed_receipt_url text;

-- Xoá 2 chữ ký cũ (record_expense_claim(uuid), pay_salary_advance(uuid)) rồi
-- tạo lại có thêm tham số — CREATE OR REPLACE với tham số mới KHÔNG thay thế
-- hàm cũ mà tạo overload song song (bài học từ lần sinh trùng hàm
-- update_order_v2 trước đó), nên phải DROP tay trước.
drop function if exists public.record_expense_claim(uuid);
drop function if exists public.pay_salary_advance(uuid);

create or replace function public.record_expense_claim(
  p_id uuid, p_payment_method text, p_receipt_url text
) returns public.expense_claims language plpgsql security definer set search_path=public as $$
declare v public.expense_claims%rowtype; v_cash uuid;
begin
  if not public.is_finance_operator() then raise exception 'Chỉ Kế toán, Thu ngân hoặc Giám đốc được ghi sổ'; end if;
  if coalesce(trim(p_payment_method),'') = '' then raise exception 'Bắt buộc chọn nguồn tiền chi ra trước khi ghi sổ.'; end if;
  if coalesce(trim(p_receipt_url),'') = '' then raise exception 'Bắt buộc có ảnh chứng từ chi tiền trước khi ghi sổ.'; end if;
  select * into v from public.expense_claims where id=p_id and status='pending_accounting' for update;
  if not found then raise exception 'Khoản chi chưa đủ điều kiện ghi sổ'; end if;
  insert into public.cashbook_entries(type,label,amount,occurred_at) values('chi',v.description||' — '||v.claimant_name,v.amount,v.occurred_at) returning id into v_cash;
  update public.expense_claims
  set status='recorded', accountant_id=auth.uid(), accounted_at=now(), cashbook_entry_id=v_cash,
      disbursed_payment_method=p_payment_method, disbursed_receipt_url=p_receipt_url
  where id=p_id returning * into v;
  return v;
end $$;
revoke all on function public.record_expense_claim(uuid,text,text) from public, anon;
grant execute on function public.record_expense_claim(uuid,text,text) to authenticated;

create or replace function public.pay_salary_advance(
  p_id uuid, p_payment_method text, p_receipt_url text
) returns public.salary_advance_requests language plpgsql security definer set search_path=public as $$
declare v public.salary_advance_requests%rowtype; v_cash uuid;
begin
  if not public.is_finance_operator() then raise exception 'Chỉ Kế toán hoặc Giám đốc được xác nhận đã chi'; end if;
  if coalesce(trim(p_payment_method),'') = '' then raise exception 'Bắt buộc chọn nguồn tiền chi ra trước khi xác nhận.'; end if;
  if coalesce(trim(p_receipt_url),'') = '' then raise exception 'Bắt buộc có ảnh chứng từ chi tiền trước khi xác nhận.'; end if;
  select * into v from public.salary_advance_requests where id=p_id and status='pending_accounting' for update;
  if not found then raise exception 'Tạm ứng chưa được Giám đốc duyệt'; end if;
  insert into public.cashbook_entries(type,label,amount) values('chi','Tạm ứng lương — '||v.employee_name,v.amount) returning id into v_cash;
  update public.salary_advance_requests
  set status='paid', accountant_id=auth.uid(), paid_at=now(), cashbook_entry_id=v_cash,
      disbursed_payment_method=p_payment_method, disbursed_receipt_url=p_receipt_url
  where id=p_id returning * into v;
  update public.payroll_entries pe set advance_amount=(select coalesce(sum(sa.amount),0) from public.salary_advance_requests sa where sa.employee_id=v.employee_id and sa.status='paid' and date_trunc('month',sa.paid_at)=pp.period_month),updated_at=now()
  from public.payroll_periods pp where pe.period_id=pp.id and pe.employee_id=v.employee_id and pp.period_month=date_trunc('month',v.paid_at)::date and pp.status<>'locked';
  return v;
end $$;
revoke all on function public.pay_salary_advance(uuid,text,text) from public, anon;
grant execute on function public.pay_salary_advance(uuid,text,text) to authenticated;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202608271700_ke_toan_nguon_tien_va_chung_tu', 'completed', now(),
  'Adds disbursed_payment_method/disbursed_receipt_url to expense_claims and salary_advance_requests (already-live tables, NOT the finance_requests/general_ledger_transactions proposed in an unreviewed spec doc that turned out to duplicate this real system). Requires both fields (server-side NOT NULL check inside the function body) before record_expense_claim/pay_salary_advance succeed, matching the "must choose fund source + receipt before disbursing" requirement. Drops and recreates both functions with a 3-arg signature since CREATE OR REPLACE with new params creates a parallel overload rather than replacing - learned from a prior incident with update_order_v2.')
on conflict(migration_key) do update
  set status = 'completed', finished_at = now(), notes = excluded.notes;

commit;
