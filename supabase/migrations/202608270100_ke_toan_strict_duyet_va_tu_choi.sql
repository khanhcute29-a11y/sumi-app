-- SUMI APP M100 — Kế toán K1: bắt buộc 100% khoản chi qua Giám đốc duyệt (bỏ ngưỡng tự động < 500k),
-- và cho phép Kế toán trả lại / từ chối khoản đã duyệt trước khi thực chi.

begin;

-- 1) submit_expense_claim: loại bỏ nhánh tự động bỏ qua Giám đốc cho khoản < 500.000đ.
-- Mọi khoản chi, không phân biệt số tiền, luôn khởi tạo ở trạng thái 'pending_director'.
create or replace function public.submit_expense_claim(
 p_amount numeric,p_description text,p_note text,p_related_order_code text,p_receipt_attachments jsonb,p_occurred_at timestamptz
) returns public.expense_claims language plpgsql security definer set search_path=public as $$
declare v_profile public.profiles%rowtype;v_row public.expense_claims%rowtype;v_next boolean;v_outside boolean;
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
 insert into public.expense_claims(claimant_id,claimant_name,amount,description,note,related_order_code,receipt_attachments,occurred_at,submitted_next_day,submitted_outside_shift,requires_director_approval,approval_reason,status)
 values(auth.uid(),v_profile.full_name,p_amount,trim(p_description),nullif(trim(coalesce(p_note,'')),''),nullif(trim(coalesce(p_related_order_code,'')),''),p_receipt_attachments,p_occurred_at,v_next,v_outside,true,
  concat_ws(' · ','Mọi khoản chi đều cần Giám đốc duyệt',case when p_amount>=500000 then 'Từ 500.000đ' end,case when v_next then 'Báo bổ sung ngày sau' end,case when v_outside then 'Ngoài ca làm' end),
  'pending_director') returning * into v_row;
 insert into public.notifications(event_key,recipient_role,notification_type,severity,sound_key,title,body,entity_type,entity_id,deep_link)
 values('expense:'||v_row.id,'owner','expense_claim','warning','ting','Khoản chi cần xác nhận',v_profile.full_name||' · '||to_char(p_amount,'FM999G999G999')||'đ','expense_claim',v_row.id,'/finance-requests/'||v_row.id);
 return v_row;
end $$;

-- 2) Kế toán trả lại / từ chối một khoản chi ĐÃ được Giám đốc duyệt (status='pending_accounting'),
-- trước khi thực chi tiền — ví dụ chứng từ không hợp lệ, thiếu hóa đơn...
alter table public.expense_claims add column if not exists accountant_note text;
alter table public.salary_advance_requests add column if not exists accountant_note text;

create or replace function public.reject_expense_claim_by_accountant(p_id uuid,p_note text default null)
returns public.expense_claims language plpgsql security definer set search_path=public as $$
declare v public.expense_claims%rowtype;
begin
 if not public.is_finance_operator() then raise exception 'Chỉ Kế toán, Thu ngân hoặc Giám đốc được trả lại khoản chi'; end if;
 update public.expense_claims set status='rejected',accountant_id=auth.uid(),accounted_at=now(),accountant_note=nullif(trim(coalesce(p_note,'')),'')
 where id=p_id and status='pending_accounting' returning * into v;
 if not found then raise exception 'Khoản chi không còn chờ kế toán chi'; end if;
 return v;
end $$;

create or replace function public.reject_salary_advance_by_accountant(p_id uuid,p_note text default null)
returns public.salary_advance_requests language plpgsql security definer set search_path=public as $$
declare v public.salary_advance_requests%rowtype;
begin
 if not public.is_finance_operator() then raise exception 'Chỉ Kế toán hoặc Giám đốc được trả lại yêu cầu tạm ứng'; end if;
 update public.salary_advance_requests set status='rejected',accountant_id=auth.uid(),accountant_note=nullif(trim(coalesce(p_note,'')),'')
 where id=p_id and status='pending_accounting' returning * into v;
 if not found then raise exception 'Yêu cầu tạm ứng không còn chờ kế toán chi'; end if;
 return v;
end $$;

revoke all on function public.reject_expense_claim_by_accountant(uuid,text),public.reject_salary_advance_by_accountant(uuid,text) from public,anon,authenticated;
grant execute on function public.reject_expense_claim_by_accountant(uuid,text),public.reject_salary_advance_by_accountant(uuid,text) to authenticated;

insert into public.migration_runs(migration_key,status,finished_at,notes) values('202608270100_ke_toan_strict_duyet_va_tu_choi','completed',now(),'Bỏ ngưỡng tự động duyệt <500k: 100% khoản chi qua Giám đốc. Thêm RPC cho Kế toán trả lại/từ chối khoản đã duyệt trước khi chi.')
on conflict(migration_key) do update set status='completed',finished_at=now(),notes=excluded.notes;
commit;
