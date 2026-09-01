-- Âm Thanh Thông Báo Toàn Cục — vá đúng 2 lỗ hổng đã xác minh, KHÔNG xây lại
-- hệ thống chuông (đã có sẵn, hoạt động tốt: playOnce chống kêu chồng, xử lý
-- autoplay bị chặn — xem src/lib/sound.js, src/lib/alarmSound.js).
--
-- 1. "Báo cáo cập nhật tiến độ việc đang tham gia" — CHƯA có thông báo nào cả
--    (không chuông, không cả toast). sumi_bao_xong_viec()/sumi_duyet_viec()
--    (từ migration 202608260100_quan_ly_cong_viec_v2.sql) chỉ ghi
--    task_progress_reports, không insert vào notifications. Vá bằng cách
--    thêm insert notifications ở CẢ 2 chiều: thợ báo xong -> báo người giao
--    việc; quản lý duyệt/trả lại -> báo lại thợ. Tái dùng đúng bảng
--    `tasks.created_by`/`assignee_id` có sẵn — KHÔNG tạo khái niệm "nhiều
--    người tham gia 1 việc" mới (ngoài phạm vi yêu cầu, đổi cả kiến trúc).
--
-- 2. Chuông báo kết quả Duyệt/Từ chối (expense_claim/salary_advance) đã có
--    sẵn ở phía dữ liệu (trigger notify_finance_request_status ghi
--    notifications kèm sound_key) nhưng KHÔNG toàn cục — chỉ kêu khi đang mở
--    đúng màn Hộp thư (InboxV2Screen). Phần vá này nằm ở frontend
--    (App.jsx/toast.js), không cần đổi gì ở DB — xem <updated_code> phần JS.

begin;

-- notifications.sound_key có CHECK constraint chỉ cho 4 giá trị cũ
-- ('new_order_voice','cash_complete','ting','silent') — mở rộng thêm
-- 'task_progress' để có giai điệu riêng, phân biệt được bằng tai với
-- 'ting' (đang dùng cho giao việc/duyệt chi) như quy ước cũ của app.
alter table public.notifications drop constraint if exists notifications_sound_key_check;
alter table public.notifications add constraint notifications_sound_key_check
  check (sound_key = any (array['new_order_voice','cash_complete','ting','silent','task_progress']));

create or replace function public.sumi_bao_xong_viec(
  p_task_id uuid, p_photo_url text default null, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_uid uuid := auth.uid();
  v_t   public.tasks%rowtype;
  v_ten text;
begin
  if v_uid is null then raise exception 'Chưa đăng nhập.'; end if;

  select * into v_t from public.tasks where id = p_task_id for update;
  if v_t.id is null then raise exception 'Không tìm thấy công việc.'; end if;
  if v_t.assignee_id is distinct from v_uid then
    raise exception 'Việc này không giao cho bạn.';
  end if;
  if v_t.category = 'order_work' then
    raise exception 'Việc thuộc đơn hàng phải hoàn thành ở màn hình Bếp, không đi qua luồng này.';
  end if;
  if v_t.status = 'done' then
    raise exception 'Việc đã được duyệt xong rồi.';
  end if;
  if v_t.accepted_at is null then
    raise exception 'Hãy bấm "Xác nhận nhận việc" trước khi báo xong.';
  end if;

  update public.tasks
  set completed_at = now(),
      status       = 'pending_approval',
      photo_url    = coalesce(nullif(p_photo_url, ''), photo_url),
      late         = (deadline is not null and now() > deadline),
      version      = version + 1
  where id = p_task_id;

  select full_name into v_ten from public.profiles where id = v_uid;

  if coalesce(btrim(p_note), '') <> '' or coalesce(btrim(p_photo_url), '') <> '' then
    begin
      insert into public.task_progress_reports(task_id, staff_id, note, percent, image_url, author_role)
      values (p_task_id, v_uid, nullif(btrim(p_note), ''), 100,
              nullif(btrim(p_photo_url), ''), 'tho');
    exception when others then
      raise warning 'Ghi báo cáo tiến độ bỏ qua lỗi: %', SQLERRM;
    end;
  end if;

  -- Báo cho người GIAO việc biết thợ vừa báo xong — chờ họ duyệt. Bỏ qua nếu
  -- người giao chính là người nhận (tự giao việc cho mình).
  if v_t.created_by is not null and v_t.created_by is distinct from v_uid then
    insert into public.notifications(event_key,recipient_profile_id,notification_type,severity,sound_key,title,body,entity_type,entity_id,deep_link)
    values('task_progress:'||p_task_id||':report:'||extract(epoch from now())::text,
      v_t.created_by,'task_progress','info','task_progress',
      coalesce(v_ten,'Nhân viên')||' đã báo xong việc',v_t.title,'task',p_task_id,'/tasks/'||p_task_id)
    on conflict(event_key) do nothing;
  end if;

  return jsonb_build_object('thanh_cong', true,
    'thong_bao', 'Đã báo xong. Đang chờ quản lý duyệt nghiệm thu.');
end;
$fn$;

grant execute on function public.sumi_bao_xong_viec to authenticated;

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
    -- Trả lại cho thợ làm tiếp. Không chấm điểm, không đóng việc.
    update public.tasks
    set status = 'accepted', completed_at = null, version = version + 1
    where id = p_task_id;

    if coalesce(btrim(p_ghi_chu), '') <> '' then
      begin
        insert into public.task_progress_reports(task_id, staff_id, note, percent, image_url, author_role)
        values (p_task_id, v_uid, 'Trả lại: ' || btrim(p_ghi_chu), null, null, 'quan_ly');
      exception when others then
        -- KHÔNG nuốt lỗi. Lý do trả lại mà không tới được tay thợ thì phải nói
        -- cho quản lý biết ngay, chứ không im lặng nuốt mất.
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

  -- Chấm điểm: so giờ báo xong với hạn chót.
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

  -- Nhận việc chậm thì trừ thêm.
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
values('202608300400_am_thanh_thong_bao_toan_cuc', 'completed', now(),
  'Thêm insert notifications (notification_type=task_progress) vào sumi_bao_xong_viec (báo người giao việc) và sumi_duyet_viec (báo lại thợ khi duyệt/trả lại) — trước đây 2 RPC này không thông báo gì cả.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
