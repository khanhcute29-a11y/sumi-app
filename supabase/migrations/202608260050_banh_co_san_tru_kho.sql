-- Đơn "Bánh có sẵn": đi thẳng tới Shipper, có kiểm tra và trừ kho thành phẩm.
--
-- LỖI GỐC: hàm mark_order_ready_from_stock được viết ở M-202608230038 nhưng
-- CHƯA BAO GIỜ CHẠY ĐƯỢC vì file đó có hai lỗi cú pháp: dấu BOM ở đầu file,
-- và bọc thân hàm bằng '$' đơn thay vì '$$'.
-- Hệ quả: app gọi một RPC không tồn tại -> ném lỗi -> màn hình tạo đơn đứng
-- nguyên, mà đơn thì ĐÃ được tạo và nằm ở hàng chờ của Bếp.
-- Đúng cả hai triệu chứng người dùng báo.
--
-- Bản này viết lại đúng cú pháp và BỔ SUNG phần còn thiếu: kiểm tra tồn kho,
-- trừ kho, ghi nhật ký xuất kho.
begin;

-- ---------------------------------------------------------------------------
-- 1. Kiểm tra tồn kho TRƯỚC khi tạo đơn (chặn sớm, không để lại đơn mồ côi)
-- ---------------------------------------------------------------------------
-- p_items: [{"product_id":"...","size":"...","qty":2,"name":"..."}]
-- Trả về danh sách mặt hàng KHÔNG đủ. Rỗng nghĩa là đủ hết.
create or replace function public.check_finished_goods_stock(p_items jsonb)
returns table(product_id uuid, ten text, size text, can_co numeric, ton_kho numeric)
language plpgsql security definer set search_path = public as $fn$
begin
  return query
  with yeu_cau as (
    select (it->>'product_id')::uuid                as pid,
           coalesce(it->>'name', 'Sản phẩm')        as ten,
           nullif(it->>'size', '')                  as sz,
           coalesce((it->>'qty')::numeric, 0)       as can
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as it
    where it->>'product_id' is not null
      and coalesce((it->>'qty')::numeric, 0) > 0
  )
  select y.pid, y.ten, y.sz, y.can,
         coalesce((
           select sum(f.qty) from public.finished_goods_stock f
           where f.product_id = y.pid
             and (y.sz is null or f.size is not distinct from y.sz)
         ), 0)
  from yeu_cau y
  where coalesce((
          select sum(f.qty) from public.finished_goods_stock f
          where f.product_id = y.pid
            and (y.sz is null or f.size is not distinct from y.sz)
        ), 0) < y.can;
end;
$fn$;

grant execute on function public.check_finished_goods_stock to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Chuyển đơn sang "chờ giao" + trừ kho thành phẩm
-- ---------------------------------------------------------------------------
create or replace function public.mark_order_ready_from_stock(p_order_id uuid)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare
  v_actor  uuid := auth.uid();
  v_order  public.orders%rowtype;
  v_wh     uuid;
  v_item   record;
  v_row    record;
  v_con    numeric;
  v_can    numeric;
  v_thieu  text := '';
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then
    raise exception 'Không tìm thấy đơn hàng';
  end if;

  -- (a) KIỂM TRA đủ hàng trước khi động vào bất cứ thứ gì.
  -- Dòng hàng không có mã sản phẩm (bánh đặt riêng, ghi tay) thì bỏ qua —
  -- loại đó không theo dõi tồn kho được.
  for v_item in
    select oi.product_id                                as pid,
           coalesce(oi.name_snapshot, oi.name, 'Sản phẩm')       as ten,
           nullif(oi.size, '')                          as sz,
           coalesce(oi.quantity, oi.qty, 0)             as can
    from public.order_items oi
    where oi.order_id = p_order_id
      and oi.product_id is not null
      and coalesce(oi.quantity, oi.qty, 0) > 0
  loop
    select coalesce(sum(f.qty), 0) into v_con
    from public.finished_goods_stock f
    where f.product_id = v_item.pid
      and (v_item.sz is null or f.size is not distinct from v_item.sz);

    if v_con < v_item.can then
      v_thieu := v_thieu || v_item.ten
                 || coalesce(' (' || v_item.sz || ')', '')
                 || ': cần ' || v_item.can || ', kho còn ' || v_con || '; ';
    end if;
  end loop;

  if v_thieu <> '' then
    raise exception 'Kho thành phẩm không đủ hàng — %', rtrim(v_thieu, '; ');
  end if;

  -- (b) TRỪ KHO. Tới đây chắc chắn đủ. Dòng kho được khoá (for update) nên
  -- hai người cùng bán một chiếc bánh sẽ không trừ đè lên nhau.
  for v_item in
    select oi.product_id                                as pid,
           coalesce(oi.name_snapshot, oi.name, 'Sản phẩm')       as ten,
           nullif(oi.size, '')                          as sz,
           coalesce(oi.quantity, oi.qty, 0)             as can
    from public.order_items oi
    where oi.order_id = p_order_id
      and oi.product_id is not null
      and coalesce(oi.quantity, oi.qty, 0) > 0
  loop
    v_can := v_item.can;

    for v_row in
      select f.id, f.qty
      from public.finished_goods_stock f
      where f.product_id = v_item.pid
        and (v_item.sz is null or f.size is not distinct from v_item.sz)
        and f.qty > 0
      order by f.qty desc
      for update
    loop
      exit when v_can <= 0;
      if v_row.qty >= v_can then
        update public.finished_goods_stock
        set qty = qty - v_can, updated_at = now()
        where id = v_row.id;
        v_can := 0;
      else
        update public.finished_goods_stock
        set qty = 0, updated_at = now()
        where id = v_row.id;
        v_can := v_can - v_row.qty;
      end if;
    end loop;

    -- Nhật ký xuất kho để đối soát. Ghi hỏng thì bỏ qua, không được làm
    -- đổ cả việc bán hàng.
    begin
      insert into public.finished_goods_stock_out_log(product_id, product_name, size, branch, qty, order_id, order_code)
      values (v_item.pid, v_item.ten, v_item.sz,
              coalesce((select f2.branch from public.finished_goods_stock f2
                        where f2.product_id = v_item.pid limit 1), 'bakery'),
              v_item.can, p_order_id, v_order.order_code);
    exception when others then
      raise warning 'Ghi nhật ký xuất kho bỏ qua lỗi: %', SQLERRM;
    end;
  end loop;

  -- (c) Chứng từ kho (giữ như thiết kế cũ, không bắt buộc)
  v_wh := (select id from public.warehouses where code = case
            when v_order.order_type = 'macaron' then 'X41_MACARON_FG'
            when v_order.order_type = 'school'  then 'X42_BLIND_DISPATCH'
            else 'BAKERY_FG' end limit 1);

  if v_wh is not null then
    begin
      insert into public.inventory_documents(document_code, document_type, destination_warehouse_id, order_id, status,
        created_by, approved_by, approval_status, received_at, reason, idempotency_key)
      values('STOCK-' || upper(substr(md5(p_order_id::text || now()::text), 1, 12)),
             'stock_dispatch', v_wh, p_order_id, 'completed',
             v_actor, v_actor, 'approved', now(),
             'Hàng có sẵn từ kho thành phẩm xuất giao', p_order_id::text || ':stock');
    exception when others then
      raise warning 'Ghi chứng từ kho bỏ qua lỗi: %', SQLERRM;
    end;
  end if;

  -- (d) Đóng hết gói việc của bếp — bếp KHÔNG phải làm lại chiếc bánh đã có
  update public.order_work_packages
  set status = 'completed', completed_at = now(),
      approved_by = v_actor, approved_at = now(), version = version + 1
  where order_id = p_order_id and status not in ('completed', 'cancelled');

  -- (e) Đưa đơn thẳng sang "chờ giao" cho Shipper nhận
  update public.orders
  -- Luu y: bang orders KHONG co cot production_completed_at (no thuoc mot
  -- khung nhin tinh toan). File cu M-202608230038 co dong nay - them mot ly do
  -- nua khien no khong the chay duoc.
  set status = 'cho_giao',
      status_v2 = 'ready_for_fulfillment',
      version = version + 1
  where id = p_order_id;

  return p_order_id;
end;
$fn$;

grant execute on function public.mark_order_ready_from_stock to authenticated;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202608260050_banh_co_san_tru_kho', 'completed', now(),
  'Rewrote mark_order_ready_from_stock (M-202608230038 never ran: UTF-8 BOM + single-dollar quoting). Added finished-goods stock check that blocks when short, atomic deduction with row locks, and stock-out logging. Added check_finished_goods_stock for a pre-flight check before the order is created.')
on conflict(migration_key) do update
  set status = 'completed', finished_at = now(), notes = excluded.notes;

commit;

select 'Ham chuyen sang cho giao' as kiem_tra,
       case when count(*) = 1 then 'CO' else 'CHUA' end as ket_qua,
       'CO' as mong_doi
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'mark_order_ready_from_stock'
union all
select 'Ham kiem tra ton kho truoc',
       case when count(*) = 1 then 'CO' else 'CHUA' end,
       'CO'
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'check_finished_goods_stock';
