-- QUYỀN TỪ CHỐI VIỆC GIAO NGOÀI GIỜ LÀM QUY ĐỊNH (yêu cầu 04/09/2026).
--
-- Trước đây nhân sự CHỈ có đường "xin miễn trừ" (approval_requests loại
-- task_exemption) — phải chờ Quản lý rồi Giám đốc duyệt mới xong, không hợp
-- với việc bị giao đột xuất NGOÀI ca làm việc của chính mình. Tính năng này
-- là một QUYỀN, không phải một ĐỀ XUẤT: bấm là xong ngay, không chờ duyệt.
--
-- CỐ Ý KHÔNG đụng cột `assignee_id`/`status`: trigger enforce_task_update_rules
-- đang chặn CỨNG mọi thay đổi assignee_id từ người không phải chủ/quản lý (kể
-- cả khi update chạy trong hàm SECURITY DEFINER — auth.uid() vẫn là người gọi
-- thật, không phải chủ sở hữu hàm). Nếu set lại assignee_id=null ở đây sẽ vỡ
-- trigger đó ngay. Thay vào đó: việc VẪN đứng tên người đó, chỉ gắn thêm cờ
-- "đã từ chối + lý do" để Giám đốc/Quản lý nhìn thấy và tự quyết (gia hạn,
-- giao người khác qua EditTaskModal/GiaoViecModal đã có sẵn, hoặc xoá việc).
begin;
set local lock_timeout = '10s';
set local statement_timeout = '30s';

alter table public.tasks
  add column if not exists declined_at timestamptz,
  add column if not exists decline_reason text;

comment on column public.tasks.declined_at is
  'Mốc nhân sự bấm "Từ chối việc" (chỉ áp dụng việc Giám đốc/Quản lý giao ngoài giờ làm quy định của họ) — KHÔNG cần ai duyệt.';
comment on column public.tasks.decline_reason is
  'Lý do từ chối do chính nhân sự ghi — bắt buộc, hiện cho người giao xem.';

create or replace function public.sumi_tu_choi_viec(p_task_id uuid, p_ly_do text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_t   public.tasks%rowtype;
  v_ten text;
begin
  if v_uid is null then raise exception 'Chưa đăng nhập.'; end if;
  if nullif(btrim(coalesce(p_ly_do, '')), '') is null then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Bắt buộc ghi lý do từ chối để người giao việc hiểu.');
  end if;

  select * into v_t from public.tasks where id = p_task_id for update;
  if v_t.id is null then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Không tìm thấy công việc.');
  end if;
  if v_t.assignee_id is distinct from v_uid then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Việc này không giao cho bạn.');
  end if;
  if v_t.category <> 'assigned' then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Chỉ áp dụng cho việc Giám đốc/Quản lý giao tay — không áp dụng việc tự thêm hoặc việc thuộc đơn hàng.');
  end if;
  if v_t.accepted_at is not null or v_t.status <> 'open' then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Việc đã nhận hoặc đã xử lý rồi — không từ chối được nữa, hãy dùng "Xin miễn trừ" nếu cần.');
  end if;

  update public.tasks
  set declined_at = now(),
      decline_reason = btrim(p_ly_do)
  where id = p_task_id;

  select full_name into v_ten from public.profiles where id = v_uid;

  if v_t.created_by is not null then
    begin
      insert into public.notifications(event_key,recipient_profile_id,notification_type,severity,sound_key,title,body,entity_type,entity_id,deep_link)
      values('task_decline:'||p_task_id||':'||extract(epoch from now())::text,
        v_t.created_by,'task_progress','warning','task_progress',
        '🚫 '||coalesce(v_ten,'Nhân viên')||' đã từ chối việc — ngoài giờ làm việc',
        coalesce(v_t.title,'')||' · Lý do: '||btrim(p_ly_do),
        'task',p_task_id,'/tasks/'||p_task_id)
      on conflict(event_key) do nothing;
    exception when others then
      raise warning 'Ghi thông báo từ chối việc bỏ qua lỗi: %', SQLERRM;
    end;
  end if;

  return jsonb_build_object('thanh_cong', true,
    'thong_bao', 'Đã từ chối việc. Người giao sẽ thấy lý do và tự quyết định gia hạn hoặc giao người khác.');
end;
$function$;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609042200_tu_choi_viec_ngoai_gio', 'completed', now(),
  'Them cot tasks.declined_at/decline_reason (khong dung assignee_id/status de khong vo trigger enforce_task_update_rules) + RPC sumi_tu_choi_viec: nhan su tu choi ngay khong can duyet viec Giam doc/Quan ly giao (category=assigned, chua nhan), bao nguoi giao qua notifications (sound_key task_progress, da wire san o App.jsx/sound.js).')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
