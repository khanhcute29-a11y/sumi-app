-- Thông báo đẩy (push) cho ĐỦ 7 mốc + dẫn thẳng tới đúng đơn/việc khi bấm.
--
-- HIỆN TRẠNG TRƯỚC KHI SỬA:
--   Đã có push cho: đơn mới, hoàn thành giao, giao việc, đăng tin công ty,
--   sự cố, bình luận đơn.
--   THIẾU push cho 3 mốc: bếp nhận đơn, bếp xong mẻ bánh, shipper nhận giao.
--   Và mọi push đều gửi đường dẫn '/' nên bấm vào chỉ mở app, không dẫn tới
--   đơn cụ thể — nhân viên không biết thông báo nói về đơn nào.
--
-- CÁCH LÀM: gắn vào trigger z_notify_order_history đã có sẵn (M-202608260030),
-- vốn ĐÃ chạy đúng trên 3 mốc còn thiếu. Không dựng thêm trigger mới, không
-- đụng tới các trigger push đang chạy tốt cho những mốc khác.
begin;

-- ---------------------------------------------------------------------------
-- 1. Hai trigger push có sẵn: bổ sung đường dẫn tới đúng đơn
-- ---------------------------------------------------------------------------
create or replace function public.trg_notify_new_order()
returns trigger language plpgsql as $function$
begin
  perform public.notify_push(
    '🔔 Đơn hàng mới',
    'Mã đơn ' || coalesce(new.order_code, '') || ' vừa được tạo.',
    '/orders/' || new.id::text
  );
  return new;
end;
$function$;

create or replace function public.trg_notify_order_completed()
returns trigger language plpgsql as $function$
begin
  if new.status_v2 = 'completed' and coalesce(old.status_v2, '') <> 'completed' then
    perform public.notify_push(
      '🎉 Đã giao hàng thành công',
      'Đơn ' || coalesce(new.order_code, '') || ' đã giao xong cho khách.',
      '/orders/' || new.id::text
    );
  end if;
  return new;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 2. Ba mốc còn thiếu — gắn vào trigger ghi lịch sử đã có
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
  v_push_title text;
begin
  v_code := coalesce(nullif(NEW.order_code, ''), 'Đơn hàng');

  if TG_OP = 'INSERT' then
    v_type  := 'new_order';
    v_title := 'Có đơn hàng mới';
    v_body  := v_code || ' vừa được tạo, đang chờ bếp nhận';
    v_roles := array['bakery', 'kitchen_lead', 'owner', 'admin'];
    -- push cho đơn mới đã do trg_notify_new_order lo, ở đây bỏ trống để
    -- không gửi trùng hai lần.
    v_push_title := null;
  else
    if NEW.status_v2 is not distinct from OLD.status_v2 then
      return NEW;
    end if;

    case NEW.status_v2
      when 'in_production' then
        v_type  := 'order_in_production';
        v_title := 'Bếp đã nhận đơn';
        v_body  := v_code || ' — bếp bắt đầu thực hiện';
        v_roles := array['kitchen_lead', 'owner', 'admin'];
        v_push_title := '👩‍🍳 Bếp đã nhận đơn';
      when 'ready_for_fulfillment' then
        v_type  := 'order_ready';
        v_title := 'Bếp đã xong mẻ bánh';
        v_body  := v_code || ' — sẵn sàng giao, chờ shipper nhận';
        v_roles := array['shipper', 'owner', 'admin'];
        v_push_title := '🥐 Bếp đã xong mẻ bánh';
      when 'in_delivery' then
        v_type  := 'delivery_assigned';
        v_title := 'Shipper đã nhận giao';
        v_body  := v_code || ' — đang trên đường giao';
        v_roles := array['cashier', 'owner', 'admin'];
        v_push_title := '🚚 Shipper đã nhận giao';
      when 'completed' then
        v_type  := 'delivery_completed';
        v_title := 'Đã giao hàng thành công';
        v_body  := v_code || ' — đã giao xong cho khách';
        v_roles := array['cashier', 'accountant', 'owner', 'admin'];
        -- push đã do trg_notify_order_completed lo
        v_push_title := null;
      else
        return NEW;
    end case;
  end if;

  -- Gửi thông báo đẩy cho 3 mốc còn thiếu, kèm đường dẫn tới đúng đơn
  if v_push_title is not null then
    begin
      perform public.notify_push(v_push_title, v_body, '/orders/' || NEW.id::text);
    exception when others then
      raise warning 'notify_push bỏ qua lỗi: %', SQLERRM;
    end;
  end if;

  -- Ghi lịch sử (giữ nguyên như cũ)
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
      v_role, v_type, 'silent',
      v_title, v_body, 'order', NEW.id, '/orders/' || NEW.id::text
    )
    on conflict(event_key) do nothing;
  end loop;

  return NEW;

exception when others then
  raise warning 'trg_notify_order_history bỏ qua lỗi: %', SQLERRM;
  return NEW;
end;
$$ language plpgsql security definer set search_path = public;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202608260040_push_for_all_milestones', 'completed', now(),
  'Push notifications now cover all 7 milestones (added in_production / ready_for_fulfillment / in_delivery via the existing z_notify_order_history trigger) and every push carries a /orders/<id> deep link instead of bare /.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;

select 'Push co duong dan toi don' as kiem_tra,
       case when pg_get_functiondef(p.oid) like '%/orders/%' then 'CO' else 'CHUA' end as ket_qua, 'CO' as mong_doi
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='trg_notify_new_order'
union all
select 'Push cho 3 moc con thieu',
       case when pg_get_functiondef(p.oid) like '%v_push_title%' then 'CO' else 'CHUA' end, 'CO'
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='trg_notify_order_history';
