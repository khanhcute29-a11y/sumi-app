-- Chat trong 1 công việc cụ thể (2 chiều) & @mention thật.
--
-- 1. CHAT TRONG VIỆC: bảng `task_progress_reports` đã là 1 luồng chat-per-task
--    thật (UI: TheViecNhanVien.jsx, kênh realtime riêng `bao-cao-<task_id>`)
--    — CHỈ THIẾU 2 điều: (a) quản lý/người giao việc KHÔNG có ô nhắn (chỉ thợ
--    có, vì UI gate theo `laCuaToi`), và (b) tin nhắn tự do (guiTinNhan) ghi
--    thẳng vào bảng bằng insert client, không thông báo cho ai cả — khác hẳn
--    2 RPC sumi_bao_xong_viec/sumi_duyet_viec (migration 202608300400) đã có
--    thông báo. RPC mới dưới đây cho CẢ hai chiều nhắn + luôn thông báo cho
--    phía còn lại, dùng lại đúng notification_type='task_progress' + giai
--    điệu playTaskProgressSound() đã có.
--
-- 2. @MENTION: hạ tầng nhận diện + thông báo ĐÃ CÓ cho comment đơn hàng
--    (add_order_comment nhận p_mentioned_profile_ids) nhưng KHÔNG UI nào gọi.
--    Không cần migration DB cho phần này — chỉ cần build UI ở
--    CommentSection.jsx (đọc lại <updated_code> phần JS). Chat Messenger nội
--    bộ (chat_messages) thì CHƯA có đường thông báo nào cho mention cả (chỉ
--    toast, không notifications) — RPC mới bên dưới thêm đường đó.

begin;

-- ---------------------------------------------------------------------------
-- 1. Nhắn tin 2 chiều trong 1 công việc (thợ <-> người giao việc/Giám đốc)
-- ---------------------------------------------------------------------------
create or replace function public.sumi_gui_tin_nhan_viec(p_task_id uuid, p_noi_dung text)
returns public.task_progress_reports language plpgsql security definer set search_path = public as $fn$
declare
  v_uid   uuid := auth.uid();
  v_t     public.tasks%rowtype;
  v_ten   text;
  v_role  text;
  v_row   public.task_progress_reports%rowtype;
  v_nhan  uuid;
begin
  if v_uid is null then raise exception 'Chưa đăng nhập.'; end if;
  if coalesce(btrim(p_noi_dung), '') = '' then raise exception 'Nhập nội dung tin nhắn.'; end if;

  select * into v_t from public.tasks where id = p_task_id;
  if v_t.id is null then raise exception 'Không tìm thấy công việc.'; end if;

  if v_uid is distinct from v_t.assignee_id
     and v_uid is distinct from v_t.created_by
     and not public.is_business_director() then
    raise exception 'Bạn không có quyền nhắn trong việc này.';
  end if;

  v_role := case when v_uid = v_t.assignee_id then 'tho' when public.is_business_director() then 'giam_doc' else 'quan_ly' end;
  select full_name into v_ten from public.profiles where id = v_uid;

  insert into public.task_progress_reports(task_id, staff_id, note, percent, image_url, author_role)
  values (p_task_id, v_uid, btrim(p_noi_dung), null, null, v_role)
  returning * into v_row;

  -- Báo cho phía CÒN LẠI: thợ nhắn -> báo người giao việc; người giao
  -- việc/Giám đốc nhắn -> báo thợ.
  v_nhan := case when v_uid = v_t.assignee_id then v_t.created_by else v_t.assignee_id end;
  if v_nhan is not null and v_nhan is distinct from v_uid then
    insert into public.notifications(event_key,recipient_profile_id,notification_type,severity,sound_key,title,body,entity_type,entity_id,deep_link)
    values('task_progress:'||p_task_id||':chat:'||v_row.id,
      v_nhan,'task_progress','info','task_progress',
      coalesce(v_ten,'Nhân viên')||' nhắn trong việc "'||v_t.title||'"',
      left(btrim(p_noi_dung),160),'task',p_task_id,'/tasks/'||p_task_id)
    on conflict(event_key) do nothing;
  end if;

  return v_row;
end;
$fn$;

grant execute on function public.sumi_gui_tin_nhan_viec(uuid,text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. @mention trong Chat Messenger nội bộ — chat_messages hiện không có
--    đường thông báo bền (chỉ toast tạm thời qua broadcast). RPC mới CHỈ lo
--    phần thông báo mention, KHÔNG thay thế luồng gửi tin nhắn hiện có
--    (sendChatMessage trong lib/chat.js vẫn insert trực tiếp như cũ — không
--    đụng). Frontend gọi RPC này SONG SONG ngay sau khi gửi tin thành công,
--    chỉ khi có người bị tag.
-- ---------------------------------------------------------------------------
create or replace function public.notify_chat_mentions(
  p_room_id uuid, p_message_id uuid, p_mentioned_profile_ids uuid[], p_preview text)
returns void language plpgsql security definer set search_path = public as $fn$
declare
  v_uid uuid := auth.uid();
  v_ten text;
  v_id  uuid;
begin
  if v_uid is null then return; end if;
  -- Chỉ người thật sự đang có mặt trong phòng mới được gắn thông báo qua
  -- đường này — chặn giả mạo p_room_id để spam người không liên quan.
  if not exists(select 1 from public.chat_participants where room_id = p_room_id and profile_id = v_uid) then
    raise exception 'Bạn không ở trong phòng chat này.';
  end if;
  select full_name into v_ten from public.profiles where id = v_uid;

  foreach v_id in array coalesce(p_mentioned_profile_ids, '{}') loop
    -- Chỉ báo người THẬT SỰ ở trong phòng, và không tự báo cho chính mình.
    if v_id is distinct from v_uid
       and exists(select 1 from public.chat_participants where room_id = p_room_id and profile_id = v_id) then
      insert into public.notifications(event_key,recipient_profile_id,notification_type,severity,sound_key,title,body,entity_type,entity_id,deep_link)
      values('chat_mention:'||p_message_id||':'||v_id,
        v_id,'chat_mention','info','ting',
        coalesce(v_ten,'Ai đó')||' đã nhắc đến bạn',left(coalesce(p_preview,''),160),
        'chat_room',p_room_id,'/messenger/'||p_room_id)
      on conflict(event_key) do nothing;
    end if;
  end loop;
end;
$fn$;

grant execute on function public.notify_chat_mentions(uuid,uuid,uuid[],text) to authenticated;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202608300500_chat_trong_viec_va_mention', 'completed', now(),
  'RPC sumi_gui_tin_nhan_viec (chat 2 chiều trong 1 việc, thợ<->quản lý/giám đốc, tự thông báo phía còn lại). RPC notify_chat_mentions (thông báo @mention thật cho tin nhắn Messenger nội bộ, chỉ báo người thật sự trong phòng).')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
