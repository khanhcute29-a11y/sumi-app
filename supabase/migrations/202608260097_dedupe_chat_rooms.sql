-- Dọn dẹp phòng chat nhóm bị trùng lặp — nguyên nhân: migration seed trước so
-- khớp phòng đã tồn tại bằng cột `name` (chứa tiếng Việt có dấu), nhưng chuỗi
-- copy/paste qua nhiều lần chạy có thể lệch dạng chuẩn hoá Unicode (NFC/NFD)
-- dù hiển thị giống hệt nhau bằng mắt thường — nên so sánh bằng `=` luôn ra
-- khác nhau, mỗi lần chạy lại tạo thêm 1 bộ phòng mới (quan sát thực tế: 120
-- phòng thay vì 4, khớp đúng số lần migration bị chạy lại × 4 loại phòng).
--
-- Fix: thêm cột `code` (mã ổn định, thuần ASCII, không dính vấn đề Unicode)
-- + unique index trên code, gộp toàn bộ tin nhắn/thành viên của các phòng
-- trùng về đúng 1 phòng gốc rồi xoá phòng thừa.
begin;

alter table public.chat_rooms add column if not exists code text;

do $$
declare
  v_map jsonb := '{"🥐":"c_general","👨‍🍳":"c_kitchen","🚚":"c_delivery","🏭":"c_factory41"}'::jsonb;
  v_emoji text;
  v_code text;
  v_canonical uuid;
  v_dup record;
begin
  for v_emoji, v_code in select key, value from jsonb_each_text(v_map) loop
    select id into v_canonical from public.chat_rooms
    where room_type = 'group' and avatar_emoji = v_emoji
    order by created_at asc
    limit 1;

    if v_canonical is null then
      continue;
    end if;

    update public.chat_rooms set code = v_code where id = v_canonical;

    for v_dup in
      select id from public.chat_rooms
      where room_type = 'group' and avatar_emoji = v_emoji and id <> v_canonical
    loop
      update public.chat_messages set room_id = v_canonical where room_id = v_dup.id;

      insert into public.chat_participants(room_id, profile_id)
      select v_canonical, profile_id from public.chat_participants where room_id = v_dup.id
      on conflict (room_id, profile_id) do nothing;

      delete from public.chat_participants where room_id = v_dup.id;
      delete from public.chat_rooms where id = v_dup.id;
    end loop;
  end loop;
end $$;

create unique index if not exists idx_chat_rooms_code on public.chat_rooms(code) where code is not null;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202608260097_dedupe_chat_rooms', 'completed', now(),
  'Deduplicated chat_rooms (root cause: name-based idempotency check broke on Unicode-normalization drift across repeated migration runs, creating ~120 duplicate group rooms instead of 4). Consolidated messages/participants onto one canonical room per avatar_emoji, added a stable ASCII `code` column with a unique index to prevent recurrence.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
