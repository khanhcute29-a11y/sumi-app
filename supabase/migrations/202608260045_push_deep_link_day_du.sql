-- Push cho GIAO VIỆC và ĐĂNG TIN CÔNG TY: gửi đường dẫn tới đúng đối tượng.
--
-- HIỆN TRẠNG SAI:
--   trg_notify_new_feed_post  gửi '/feed'  -> không có mã bài đăng, và app
--     KHÔNG hiểu đường '/feed' (deepLink.js chỉ nhận '/company-feed/<id>')
--     nên bấm vào chỉ mở app rồi đứng im.
--   trg_notify_task_assigned  gửi '/tasks' -> không có mã đầu việc.
--
-- Ngoài ra: đầu việc loại 'order_work' (giao trong đơn hàng) KHÔNG hiển thị ở
-- trang Công việc — tab "Việc được giao" chỉ nạp category='assigned'. Nơi thợ
-- bếp thật sự thấy nó là bảng phân công BÊN TRONG chi tiết đơn. Nên với loại
-- này phải trỏ về '/orders/<id>', giống cách đã làm cho lịch sử thông báo
-- (migration 202608260035).
begin;

create or replace function public.trg_notify_new_feed_post()
returns trigger language plpgsql as $function$
begin
  if new.post_type = 'announcement' then
    perform public.notify_push(
      '📢 ' || coalesce(new.title, 'Thông báo mới'),
      left(coalesce(new.body, ''), 120),
      '/company-feed/' || new.id::text
    );
  end if;
  return new;
end;
$function$;

create or replace function public.trg_notify_task_assigned()
returns trigger language plpgsql as $function$
declare
  v_order uuid;
  v_url   text;
begin
  -- Việc giao TRONG ĐƠN: dẫn về chi tiết đơn, vì đầu việc loại này không
  -- hiện ở trang Công việc.
  if new.work_package_id is not null then
    select order_id into v_order
    from public.order_work_packages
    where id = new.work_package_id;
  end if;

  v_url := case when v_order is not null
                then '/orders/' || v_order::text
                else '/tasks/' || new.id::text
           end;

  perform public.notify_push(
    '✅ Việc mới được giao',
    coalesce(new.title, 'Bạn có việc mới cần làm'),
    v_url,
    new.assignee_id
  );
  return new;
end;
$function$;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202608260045_push_deep_link_day_du', 'completed', now(),
  'Task and feed push notifications now carry a real deep link (/tasks/<id> or /orders/<id> for order_work tasks, /company-feed/<id> for announcements) instead of the bare /tasks and /feed which the client could not resolve.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;

select 'Tin cong ty co ma bai' as kiem_tra,
       case when prosrc like '%/company-feed/%' then 'CO' else 'CHUA' end as ket_qua, 'CO' as mong_doi
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and proname='trg_notify_new_feed_post'
union all
select 'Giao viec co ma viec/don',
       case when prosrc like '%/orders/%' and prosrc like '%/tasks/%' then 'CO' else 'CHUA' end, 'CO'
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and proname='trg_notify_task_assigned';
