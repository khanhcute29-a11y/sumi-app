-- sếp: mọi khoản chi (Sổ Quỹ > Chi & tạm ứng) đều phải qua Giám đốc duyệt,
-- bỏ ngưỡng tự động bỏ qua duyệt cho khoản dưới 500.000đ.
begin;

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
  concat_ws(' · ','Mọi khoản chi cần Giám đốc duyệt',case when v_next then 'Báo bổ sung ngày sau' end,case when v_outside then 'Ngoài ca làm' end),
  'pending_director') returning * into v_row;
 insert into public.notifications(event_key,recipient_role,notification_type,severity,sound_key,title,body,entity_type,entity_id,deep_link)
 values('expense:'||v_row.id,'owner','expense_claim','warning','ting','Khoản chi cần xác nhận',v_profile.full_name||' · '||to_char(p_amount,'FM999G999G999')||'đ','expense_claim',v_row.id,'/finance-requests/'||v_row.id);
 return v_row;
end $$;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202608260007_all_expense_claims_require_director_approval', 'completed', now(),
  'submit_expense_claim now always routes to pending_director regardless of amount — removed the 500.000đ auto-skip-approval threshold.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
