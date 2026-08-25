-- Lịch sử thông báo cho 5 mốc vận hành đơn hàng + vá lỗ hổng "đánh dấu đã đọc".
--
-- VẤN ĐỀ 1 — không đánh dấu được "đã xem":
--   Chính sách SELECT (M-202608220008) cho phép đọc tin theo BA cách:
--   đích danh, theo bộ phận, và theo CHỨC VỤ (recipient_role).
--   Nhưng chính sách UPDATE chỉ có HAI cách đầu — thiếu nhánh chức vụ.
--   Hệ quả: tin gửi theo chức vụ (owner/accountant/...) thì nhìn thấy được
--   nhưng lệnh cập nhật read_at bị RLS chặn im lặng, nên tin mãi "chưa đọc".
--   Đó là lý do bảng notifications đang có hàng nghìn tin chưa đọc.
--
-- VẤN ĐỀ 2 — lịch sử thiếu 5 sự kiện đơn hàng:
--   Chuông kêu qua realtime/broadcast nhưng không có gì ghi lại vào bảng
--   notifications, nên trang Lịch sử chỉ thấy tin công ty và giao việc.
--
-- Cách xử lý: dùng MỘT trigger trên bảng orders thay vì sửa từng RPC —
-- không đụng vào bất kỳ hàm nào đang chạy tốt, và bắt được mọi đường đi
-- (RPC nào đổi status_v2 cũng được ghi nhận).
begin;

-- ---------------------------------------------------------------------------
-- 1. Vá chính sách UPDATE: bổ sung nhánh chức vụ cho khớp với chính sách đọc
-- ---------------------------------------------------------------------------
drop policy if exists "recipients acknowledge notifications" on public.notifications;
create policy "recipients acknowledge notifications" on public.notifications
for update to authenticated
using (
  recipient_profile_id = auth.uid()
  or exists (
    select 1 from public.profile_assignments pa
    where pa.profile_id = auth.uid() and pa.unit_id = recipient_unit_id and pa.valid_to is null
  )
  or exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and (p.role = recipient_role or recipient_role = any(p.extra_roles))
  )
)
with check (
  recipient_profile_id = auth.uid()
  or exists (
    select 1 from public.profile_assignments pa
    where pa.profile_id = auth.uid() and pa.unit_id = recipient_unit_id and pa.valid_to is null
  )
  or exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and (p.role = recipient_role or recipient_role = any(p.extra_roles))
  )
);

-- ---------------------------------------------------------------------------
-- 2. Trigger ghi lịch sử cho 5 mốc đơn hàng
-- ---------------------------------------------------------------------------
create or replace function public.trg_notify_order_history()
returns trigger as $$
declare
  v_type  text;
  v_title text;
  v_body  text;
  v_roles text[];
  v_role  text;
  v_code  text;
begin
  v_code := coalesce(nullif(NEW.order_code, ''), 'Đơn hàng');

  if TG_OP = 'INSERT' then
    v_type  := 'new_order';
    v_title := 'Có đơn hàng mới';
    v_body  := v_code || ' vừa được tạo, đang chờ bếp nhận';
    v_roles := array['bakery', 'kitchen_lead', 'owner', 'admin'];
  else
    -- Chỉ ghi khi trạng thái THỰC SỰ chuyển sang giá trị mới
    if NEW.status_v2 is not distinct from OLD.status_v2 then
      return NEW;
    end if;

    case NEW.status_v2
      when 'in_production' then
        v_type  := 'order_in_production';
        v_title := 'Bếp đã nhận đơn';
        v_body  := v_code || ' — bếp bắt đầu thực hiện';
        v_roles := array['kitchen_lead', 'owner', 'admin'];
      when 'ready_for_fulfillment' then
        v_type  := 'order_ready';
        v_title := 'Bếp đã xong mẻ bánh';
        v_body  := v_code || ' — sẵn sàng giao, chờ shipper nhận';
        v_roles := array['shipper', 'owner', 'admin'];
      when 'in_delivery' then
        v_type  := 'delivery_assigned';
        v_title := 'Shipper đã nhận giao';
        v_body  := v_code || ' — đang trên đường giao';
        v_roles := array['cashier', 'owner', 'admin'];
      when 'completed' then
        v_type  := 'delivery_completed';
        v_title := 'Đã giao hàng thành công';
        v_body  := v_code || ' — đã giao xong cho khách';
        v_roles := array['cashier', 'accountant', 'owner', 'admin'];
      else
        return NEW;
    end case;
  end if;

  -- Chống trùng: vài RPC cũ đã tự ghi 'order_ready' / 'delivery_assigned'.
  -- Nếu đơn này đã có tin cùng loại rồi thì không ghi thêm bản thứ hai.
  if exists (
    select 1 from public.notifications
    where entity_id = NEW.id and notification_type = v_type
  ) then
    return NEW;
  end if;

  foreach v_role in array v_roles loop
    insert into public.notifications(
      event_key, recipient_role, notification_type, sound_key,
      title, body, entity_type, entity_id, deep_link
    ) values (
      'ordhist:' || NEW.id::text || ':' || v_type || ':' || v_role,
      v_role, v_type,
      -- 'silent' là CỐ Ý: chuông đã do hệ thống âm thanh hiện tại lo. Trang
      -- Lịch sử có bộ nghe tự phát chuông mỗi khi có tin mới — nếu đặt
      -- sound_key khác thì ai đang mở trang đó sẽ nghe kêu chồng 2 lần.
      'silent',
      v_title, v_body, 'order', NEW.id, '/orders/' || NEW.id::text
    )
    on conflict(event_key) do nothing;
  end loop;

  return NEW;

exception when others then
  -- Ghi lịch sử hỏng TUYỆT ĐỐI không được làm đổ việc cập nhật đơn hàng.
  raise warning 'trg_notify_order_history bỏ qua lỗi: %', SQLERRM;
  return NEW;
end;
$$ language plpgsql security definer set search_path = public;

-- Tên bắt đầu bằng 'z' để chạy SAU các trigger kiểm tra quyền/ràng buộc
-- (trigger chạy theo thứ tự bảng chữ cái).
drop trigger if exists z_notify_order_history on public.orders;
create trigger z_notify_order_history
  after insert or update on public.orders
  for each row execute function public.trg_notify_order_history();

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202608260030_order_notification_history', 'completed', now(),
  'Fixed notifications UPDATE RLS to include the recipient_role branch (role-targeted notifications could be read but never marked read). Added z_notify_order_history trigger recording the 5 order lifecycle events into notifications with sound_key=silent and deep_link to the order.')
on conflict(migration_key) do update
  set status = 'completed', finished_at = now(), notes = excluded.notes;

commit;

-- ---------------------------------------------------------------------------
-- KIỂM TRA SAU KHI CHẠY
-- ---------------------------------------------------------------------------
select 'Trigger đã tạo' as kiem_tra,
       count(*)::text   as ket_qua,
       '1'              as mong_doi
from pg_trigger where tgname = 'z_notify_order_history' and not tgisinternal
union all
select 'Chính sách UPDATE đã có nhánh chức vụ',
       case when pg_get_expr(polqual, polrelid) like '%recipient_role%' then 'CÓ' else 'CHƯA' end,
       'CÓ'
from pg_policy
where polname = 'recipients acknowledge notifications'
  and polrelid = 'public.notifications'::regclass;
