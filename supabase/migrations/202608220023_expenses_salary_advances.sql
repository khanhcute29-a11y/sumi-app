-- SUMI APP M23 — báo khoản chi và xin tạm ứng lương có kiểm soát.

begin;

create table if not exists public.expense_claims (
  id uuid primary key default gen_random_uuid(),
  claimant_id uuid not null references public.profiles(id) on delete restrict,
  claimant_name text not null,
  amount numeric(14,0) not null check(amount > 0),
  description text not null,
  note text,
  related_order_code text,
  receipt_attachments jsonb,
  occurred_at timestamptz not null,
  submitted_at timestamptz not null default now(),
  submitted_next_day boolean not null default false,
  submitted_outside_shift boolean not null default false,
  requires_director_approval boolean not null default false,
  approval_reason text,
  status text not null check(status in ('pending_director','pending_accounting','recorded','rejected')),
  director_id uuid references public.profiles(id) on delete set null,
  director_at timestamptz,
  director_note text,
  accountant_id uuid references public.profiles(id) on delete set null,
  accounted_at timestamptz,
  cashbook_entry_id uuid references public.cashbook_entries(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.salary_advance_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete restrict,
  employee_name text not null,
  amount numeric(14,0) not null check(amount > 0),
  reason text not null,
  needed_on date not null,
  payment_method text not null check(payment_method in ('cash','bank_transfer')),
  status text not null default 'pending_director' check(status in ('pending_director','pending_accounting','paid','rejected','cancelled')),
  director_id uuid references public.profiles(id) on delete set null,
  director_at timestamptz,
  director_note text,
  accountant_id uuid references public.profiles(id) on delete set null,
  paid_at timestamptz,
  cashbook_entry_id uuid references public.cashbook_entries(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_expense_claims_status_created on public.expense_claims(status,created_at desc);
create index if not exists idx_salary_advances_employee_created on public.salary_advance_requests(employee_id,created_at desc);

alter table public.expense_claims enable row level security;
alter table public.salary_advance_requests enable row level security;

create or replace function public.is_finance_operator()
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.profiles p where p.id=auth.uid() and p.approved=true and p.active is distinct from false
  and (p.role in ('owner','admin','accountant','cashier') or p.extra_roles && array['owner','admin','accountant','cashier']::text[]));
$$;

create or replace function public.submit_expense_claim(
 p_amount numeric,p_description text,p_note text,p_related_order_code text,p_receipt_attachments jsonb,p_occurred_at timestamptz
) returns public.expense_claims language plpgsql security definer set search_path=public as $$
declare v_profile public.profiles%rowtype;v_row public.expense_claims%rowtype;v_next boolean;v_outside boolean;v_need boolean;
begin
 select * into v_profile from public.profiles where id=auth.uid() and approved=true and active is distinct from false;
 if not found then raise exception 'Tài khoản chưa được phép báo chi'; end if;
 if p_amount<=0 or trim(coalesce(p_description,''))='' then raise exception 'Cần nhập nội dung và số tiền'; end if;
 v_next := (p_occurred_at at time zone 'Asia/Ho_Chi_Minh')::date < (now() at time zone 'Asia/Ho_Chi_Minh')::date;
 v_outside := not exists(
  select 1 from public.shift_logs ci where ci.staff_id=auth.uid() and ci.type='checkin'
   and ci.work_date=(p_occurred_at at time zone 'Asia/Ho_Chi_Minh')::date and ci.checkin_time<=p_occurred_at
   and not exists(select 1 from public.shift_logs co where co.staff_id=auth.uid() and co.type='checkout' and co.work_date=ci.work_date and co.checkin_time<p_occurred_at)
 );
 v_need := p_amount>=500000 or v_next or v_outside;
 insert into public.expense_claims(claimant_id,claimant_name,amount,description,note,related_order_code,receipt_attachments,occurred_at,submitted_next_day,submitted_outside_shift,requires_director_approval,approval_reason,status)
 values(auth.uid(),v_profile.full_name,p_amount,trim(p_description),nullif(trim(coalesce(p_note,'')),''),nullif(trim(coalesce(p_related_order_code,'')),''),p_receipt_attachments,p_occurred_at,v_next,v_outside,v_need,
  concat_ws(' · ',case when p_amount>=500000 then 'Từ 500.000đ' end,case when v_next then 'Báo bổ sung ngày sau' end,case when v_outside then 'Ngoài ca làm' end),
  case when v_need then 'pending_director' else 'pending_accounting' end) returning * into v_row;
 insert into public.notifications(event_key,recipient_role,notification_type,severity,sound_key,title,body,entity_type,entity_id,deep_link)
 values('expense:'||v_row.id,case when v_need then 'owner' else 'accountant' end,'expense_claim',case when v_need then 'warning' else 'info' end,'ting',
  case when v_need then 'Khoản chi cần xác nhận' else 'Khoản chi cần ghi sổ' end,v_profile.full_name||' · '||to_char(p_amount,'FM999G999G999')||'đ','expense_claim',v_row.id,'/finance-requests/'||v_row.id);
 return v_row;
end $$;

create or replace function public.review_expense_claim(p_id uuid,p_approve boolean,p_note text default null)
returns public.expense_claims language plpgsql security definer set search_path=public as $$
declare v public.expense_claims%rowtype;
begin
 if not public.is_business_director() then raise exception 'Chỉ Giám đốc được xác nhận khoản này'; end if;
 update public.expense_claims set status=case when p_approve then 'pending_accounting' else 'rejected' end,director_id=auth.uid(),director_at=now(),director_note=nullif(trim(coalesce(p_note,'')),'')
 where id=p_id and status='pending_director' returning * into v;
 if not found then raise exception 'Khoản chi không còn chờ xác nhận'; end if;
 return v;
end $$;

create or replace function public.record_expense_claim(p_id uuid)
returns public.expense_claims language plpgsql security definer set search_path=public as $$
declare v public.expense_claims%rowtype;v_cash uuid;
begin
 if not public.is_finance_operator() then raise exception 'Chỉ Kế toán, Thu ngân hoặc Giám đốc được ghi sổ'; end if;
 select * into v from public.expense_claims where id=p_id and status='pending_accounting' for update;
 if not found then raise exception 'Khoản chi chưa đủ điều kiện ghi sổ'; end if;
 insert into public.cashbook_entries(type,label,amount,occurred_at) values('chi',v.description||' — '||v.claimant_name,v.amount,v.occurred_at) returning id into v_cash;
 update public.expense_claims set status='recorded',accountant_id=auth.uid(),accounted_at=now(),cashbook_entry_id=v_cash where id=p_id returning * into v;
 return v;
end $$;

create or replace function public.submit_salary_advance(p_amount numeric,p_reason text,p_needed_on date,p_payment_method text)
returns public.salary_advance_requests language plpgsql security definer set search_path=public as $$
declare v_profile public.profiles%rowtype;v public.salary_advance_requests%rowtype;
begin
 select * into v_profile from public.profiles where id=auth.uid() and approved=true and active is distinct from false;
 if not found then raise exception 'Tài khoản chưa được phép gửi yêu cầu'; end if;
 insert into public.salary_advance_requests(employee_id,employee_name,amount,reason,needed_on,payment_method)
 values(auth.uid(),v_profile.full_name,p_amount,trim(p_reason),p_needed_on,p_payment_method) returning * into v;
 insert into public.notifications(event_key,recipient_role,notification_type,severity,sound_key,title,body,entity_type,entity_id,deep_link)
 values('salary-advance:'||v.id,'owner','salary_advance','warning','ting','Yêu cầu tạm ứng lương',v_profile.full_name||' · '||to_char(p_amount,'FM999G999G999')||'đ','salary_advance',v.id,'/finance-requests/'||v.id);
 return v;
end $$;

create or replace function public.review_salary_advance(p_id uuid,p_approve boolean,p_note text default null)
returns public.salary_advance_requests language plpgsql security definer set search_path=public as $$
declare v public.salary_advance_requests%rowtype;
begin
 if not public.is_business_director() then raise exception 'Chỉ Giám đốc được duyệt tạm ứng'; end if;
 update public.salary_advance_requests set status=case when p_approve then 'pending_accounting' else 'rejected' end,director_id=auth.uid(),director_at=now(),director_note=nullif(trim(coalesce(p_note,'')),'')
 where id=p_id and status='pending_director' returning * into v;
 if not found then raise exception 'Yêu cầu không còn chờ duyệt'; end if; return v;
end $$;

create or replace function public.pay_salary_advance(p_id uuid)
returns public.salary_advance_requests language plpgsql security definer set search_path=public as $$
declare v public.salary_advance_requests%rowtype;v_cash uuid;
begin
 if not public.is_finance_operator() then raise exception 'Chỉ Kế toán hoặc Giám đốc được xác nhận đã chi'; end if;
 select * into v from public.salary_advance_requests where id=p_id and status='pending_accounting' for update;
 if not found then raise exception 'Tạm ứng chưa được Giám đốc duyệt'; end if;
 insert into public.cashbook_entries(type,label,amount) values('chi','Tạm ứng lương — '||v.employee_name,v.amount) returning id into v_cash;
 update public.salary_advance_requests set status='paid',accountant_id=auth.uid(),paid_at=now(),cashbook_entry_id=v_cash where id=p_id returning * into v;
 update public.payroll_entries pe set advance_amount=(select coalesce(sum(sa.amount),0) from public.salary_advance_requests sa where sa.employee_id=v.employee_id and sa.status='paid' and date_trunc('month',sa.paid_at)=pp.period_month),updated_at=now()
 from public.payroll_periods pp where pe.period_id=pp.id and pe.employee_id=v.employee_id and pp.period_month=date_trunc('month',v.paid_at)::date and pp.status<>'locked';
 return v;
end $$;

-- Nếu bảng lương được lập sau ngày chi tạm ứng, tự lấy tổng tạm ứng đã trả trong tháng.
create or replace function public.seed_paid_advances_into_payroll()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_month date;
begin
 select period_month into v_month from public.payroll_periods where id=new.period_id;
 new.advance_amount := coalesce((select sum(sa.amount) from public.salary_advance_requests sa
  where sa.employee_id=new.employee_id and sa.status='paid' and date_trunc('month',sa.paid_at)::date=v_month),0);
 return new;
end $$;
drop trigger if exists trg_seed_paid_advances_into_payroll on public.payroll_entries;
create trigger trg_seed_paid_advances_into_payroll before insert on public.payroll_entries
for each row execute function public.seed_paid_advances_into_payroll();

create or replace function public.notify_finance_request_status()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_person uuid;v_title text;v_kind text;
begin
 if new.status is not distinct from old.status then return new; end if;
 if tg_table_name='expense_claims' then v_person:=new.claimant_id;v_kind:='expense_claim';v_title:='Khoản chi: '||case new.status when 'pending_accounting' then 'đã xác nhận' when 'recorded' then 'đã ghi sổ' else 'đã từ chối' end;
 else v_person:=new.employee_id;v_kind:='salary_advance';v_title:='Tạm ứng lương: '||case new.status when 'pending_accounting' then 'đã được duyệt' when 'paid' then 'đã chi' else 'đã từ chối' end; end if;
 insert into public.notifications(event_key,recipient_profile_id,notification_type,severity,sound_key,title,body,entity_type,entity_id,deep_link)
 values(v_kind||':'||new.id||':'||new.status,v_person,v_kind,'info','ting',v_title,'Bấm để xem chi tiết',v_kind,new.id,'/finance-requests/'||new.id)
 on conflict(event_key) do nothing;
 if new.status='pending_accounting' then
  insert into public.notifications(event_key,recipient_role,notification_type,severity,sound_key,title,body,entity_type,entity_id,deep_link)
  values(v_kind||':'||new.id||':accounting','accountant',v_kind,'info','ting','Có khoản cần Kế toán xác nhận',v_title,v_kind,new.id,'/finance-requests/'||new.id)
  on conflict(event_key) do nothing;
 end if;
 return new;
end $$;
drop trigger if exists trg_expense_status_notification on public.expense_claims;
create trigger trg_expense_status_notification after update of status on public.expense_claims for each row execute function public.notify_finance_request_status();
drop trigger if exists trg_advance_status_notification on public.salary_advance_requests;
create trigger trg_advance_status_notification after update of status on public.salary_advance_requests for each row execute function public.notify_finance_request_status();

drop policy if exists "read own or finance expenses" on public.expense_claims;
create policy "read own or finance expenses" on public.expense_claims for select using(claimant_id=auth.uid() or public.is_finance_operator());
drop policy if exists "read own or payroll salary advances" on public.salary_advance_requests;
create policy "read own or payroll salary advances" on public.salary_advance_requests for select using(employee_id=auth.uid() or public.is_payroll_manager());

revoke all on public.expense_claims,public.salary_advance_requests from anon,authenticated;
grant select on public.expense_claims,public.salary_advance_requests to authenticated;
revoke all on function public.is_finance_operator() from public,anon,authenticated;
revoke all on function public.submit_expense_claim(numeric,text,text,text,jsonb,timestamptz),public.review_expense_claim(uuid,boolean,text),public.record_expense_claim(uuid),public.submit_salary_advance(numeric,text,date,text),public.review_salary_advance(uuid,boolean,text),public.pay_salary_advance(uuid) from public,anon,authenticated;
revoke all on function public.seed_paid_advances_into_payroll(),public.notify_finance_request_status() from public,anon,authenticated;
grant execute on function public.is_finance_operator() to authenticated;
grant execute on function public.submit_expense_claim(numeric,text,text,text,jsonb,timestamptz),public.review_expense_claim(uuid,boolean,text),public.record_expense_claim(uuid),public.submit_salary_advance(numeric,text,date,text),public.review_salary_advance(uuid,boolean,text),public.pay_salary_advance(uuid) to authenticated;

insert into public.migration_runs(migration_key,status,finished_at,notes) values('202608220023_expenses_salary_advances','completed',now(),'Controlled expense reporting and director-approved salary advances linked to cashbook and payroll.')
on conflict(migration_key) do update set status='completed',finished_at=now(),notes=excluded.notes;
commit;
