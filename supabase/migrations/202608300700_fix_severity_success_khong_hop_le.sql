-- Fix bug: sumi_duyet_viec() (migration 202608300400) dùng severity='success'
-- khi ghi thông báo "Việc của bạn đã được duyệt" — nhưng notifications.severity
-- chỉ cho phép 'info'/'warning'/'urgent' (notifications_severity_check).
-- Bấm "Duyệt ngay" bị lỗi "violates check constraint notifications_severity_check"
-- và KHÔNG duyệt được việc. Đổi sang 'info', không đổi gì khác trong hàm.

begin;

create or replace function public.sumi_duyet_viec(
  p_task_id uuid, p_dong_y boolean default true, p_ghi_chu text default null)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_uid   uuid := auth.uid();
  v_t     public.tasks%rowtype;
  v_ten   text;
  v_tho   text;
  v_phut  int;
  v_diem  int;
  v_ly_do text;
  v_loi_ghi text;
begin
  if v_uid is null then raise exception 'Chưa đăng nhập.'; end if;
  if not public.sumi_duoc_duyet_viec(p_task_id) then
    raise exception 'Bạn không có quyền duyệt việc này. Chỉ người giao việc, bếp trưởng cùng khâu, hoặc Giám đốc mới duyệt được.';
  end if;

  select * into v_t from public.tasks where id = p_task_id for update;
  if v_t.status <> 'pending_approval' then
    raise exception 'Việc này chưa ở trạng thái chờ duyệt.';
  end if;

  select full_name into v_ten from public.profiles where id = v_uid;
  select full_name into v_tho from public.profiles where id = v_t.assignee_id;

  if not p_dong_y then
    update public.tasks
    set status = 'accepted', completed_at = null, version = version + 1
    where id = p_task_id;

    if coalesce(btrim(p_ghi_chu), '') <> '' then
      begin
        insert into public.task_progress_reports(task_id, staff_id, note, percent, image_url, author_role)
        values (p_task_id, v_uid, 'Trả lại: ' || btrim(p_ghi_chu), null, null, 'quan_ly');
      exception when others then
        v_loi_ghi := SQLERRM;
      end;
    end if;

    if v_t.assignee_id is not null and v_t.assignee_id is distinct from v_uid then
      insert into public.notifications(event_key,recipient_profile_id,notification_type,severity,sound_key,title,body,entity_type,entity_id,deep_link)
      values('task_progress:'||p_task_id||':returned:'||extract(epoch from now())::text,
        v_t.assignee_id,'task_progress','warning','task_progress',
        coalesce(v_ten,'Quản lý')||' trả lại việc cho bạn',v_t.title,'task',p_task_id,'/tasks/'||p_task_id)
      on conflict(event_key) do nothing;
    end if;

    return jsonb_build_object('thanh_cong', true, 'da_duyet', false,
      'ghi_chu_da_luu', v_loi_ghi is null,
      'ly_do_khong_luu', v_loi_ghi,
      'thong_bao', case when v_loi_ghi is null
        then 'Đã trả lại việc cho thợ làm tiếp.'
        else 'Đã trả lại việc, NHƯNG chưa lưu được lý do — hãy nhắn trực tiếp cho thợ. (' || v_loi_ghi || ')' end);
  end if;

  if v_t.deadline is not null and v_t.completed_at is not null then
    v_phut := floor(extract(epoch from (v_t.completed_at - v_t.deadline)) / 60)::int;
    if v_phut > 0 then
      v_diem := -5; v_ly_do := 'Xong trễ ' || v_phut || ' phút so với hạn';
    else
      v_diem := 10; v_ly_do := 'Xong sớm ' || abs(v_phut) || ' phút trước hạn';
    end if;
  else
    v_phut := null; v_diem := 0; v_ly_do := 'Việc không đặt hạn chót nên không chấm điểm';
  end if;

  if v_t.nhan_viec_tre then
    v_diem  := v_diem - 2;
    v_ly_do := v_ly_do || ' · nhận việc chậm';
  end if;

  update public.tasks
  set status      = 'done',
      approved_at = now(),
      approved_by = v_uid,
      version     = version + 1
  where id = p_task_id;

  begin
    insert into public.task_kpi_logs(task_id, staff_id, staff_name, su_kien, diem, phut_lech, ly_do, approved_by)
    values (p_task_id, v_t.assignee_id, coalesce(v_tho, '?'), 'hoan_thanh',
            v_diem, v_phut, v_ly_do, v_uid);
  exception when others then
    raise warning 'Ghi sổ KPI hoàn thành bỏ qua lỗi: %', SQLERRM;
  end;

  if coalesce(btrim(p_ghi_chu), '') <> '' then
    begin
      insert into public.task_progress_reports(task_id, staff_id, note, percent, image_url, author_role)
      values (p_task_id, v_uid, btrim(p_ghi_chu), null, null, 'quan_ly');
    exception when others then
      v_loi_ghi := SQLERRM;
    end;
  end if;

  if v_t.assignee_id is not null and v_t.assignee_id is distinct from v_uid then
    insert into public.notifications(event_key,recipient_profile_id,notification_type,severity,sound_key,title,body,entity_type,entity_id,deep_link)
    values('task_progress:'||p_task_id||':approved:'||extract(epoch from now())::text,
      v_t.assignee_id,'task_progress','info','task_progress',
      'Việc của bạn đã được duyệt',v_t.title||' · '||v_ly_do,'task',p_task_id,'/tasks/'||p_task_id)
    on conflict(event_key) do nothing;
  end if;

  return jsonb_build_object('thanh_cong', true, 'da_duyet', true,
    'diem', v_diem, 'phut_lech', v_phut, 'ly_do', v_ly_do,
    'ghi_chu_da_luu', v_loi_ghi is null, 'ly_do_khong_luu', v_loi_ghi,
    'thong_bao', 'Đã duyệt xong. ' || v_ly_do || ' (' ||
      case when v_diem >= 0 then '+' else '' end || v_diem || ' điểm).');
end;
$fn$;

grant execute on function public.sumi_duyet_viec to authenticated;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202608300700_fix_severity_success_khong_hop_le', 'completed', now(),
  'Fix bug: sumi_duyet_viec dùng severity=success (không có trong CHECK constraint) khi duyệt việc, khiến "Duyệt ngay" luôn lỗi. Đổi sang info.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
