-- Cho phép sửa Tên khách hàng / SĐT trong màn "Sửa đơn" (EditOrderModal.jsx).
--
-- LÝ DO: `orders` table có RLS "orders_update_disabled" (migration
-- 202608260014) — client KHÔNG thể tự set `orders.customer_id` hay đụng bảng
-- `customers` cho những đơn CHƯA có customer_id (đơn nhập nhanh, thiếu tên/SĐT
-- lúc tạo). Trước đó `update_order_v2` không có cách nào nhận tên/SĐT khách,
-- nên màn Sửa đơn không có ô nhập — dẫn tới đơn bị kẹt mãi ở bước "Hoàn thành
-- giao" vì validation đòi customers.name/customers.phone (xem
-- OrderV2DetailModal.jsx dòng ~555, ~1310) mà không có chỗ nào bổ sung được.
--
-- Thêm tham số p_customer_patch (jsonb {name, phone}, optional). Nếu đơn đã có
-- customer_id thì UPDATE khách hàng đó; nếu chưa có (customer_id null) thì tạo
-- mới rồi gắn vào đơn — tất cả trong cùng SECURITY DEFINER nên không cần mở
-- RLS trực tiếp cho client.
begin;

create or replace function public.update_order_v2(
  p_order_id        uuid,
  p_expected_version int,
  p_patch           jsonb default '{}'::jsonb,
  p_items           jsonb default null,
  p_customer_patch  jsonb default null
) returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_uid    uuid := auth.uid();
  v_ten    text;
  v_q      jsonb;
  v_ord    public.orders%rowtype;
  v_truoc  jsonb;
  v_sau    jsonb;
  v_da_tru boolean;
  v_r      record;
  v_row    record;
  v_can    numeric;
  v_con    numeric;
  v_br     text;
  v_it     jsonb;
  v_cust_id uuid;
begin
  v_q := public.sumi_quyen_sua_don(p_order_id);
  if not (v_q->>'duoc_sua')::boolean then
    raise exception '%', coalesce(v_q->>'thong_bao', 'Không được phép sửa đơn này.');
  end if;

  select full_name into v_ten from public.profiles where id = v_uid;

  select * into v_ord from public.orders where id = p_order_id for update;

  -- Khoá lạc quan: hai người mở cùng một đơn thì người lưu sau bị chặn, chứ
  -- không âm thầm đè mất thay đổi của người lưu trước.
  if p_expected_version is not null and v_ord.version is distinct from p_expected_version then
    raise exception 'Đơn vừa được người khác sửa. Hãy đóng và mở lại đơn để xem bản mới nhất rồi sửa tiếp.';
  end if;

  -- Ảnh chụp TRƯỚC khi sửa, để đối soát về sau.
  v_truoc := jsonb_build_object(
    'don', to_jsonb(v_ord) - 'version',
    'mon', coalesce((select jsonb_agg(to_jsonb(oi) order by oi.display_order)
                     from public.order_items oi where oi.order_id = p_order_id), '[]'::jsonb));

  -- ---- 4a-0. Tên/SĐT khách — có thể chưa có customer_id (đơn nhập nhanh) ----
  if p_customer_patch is not null then
    if v_ord.customer_id is not null then
      update public.customers set
        name  = case when jsonb_exists(p_customer_patch,'name')
                     then coalesce(nullif(p_customer_patch->>'name',''), name) else name end,
        phone = case when jsonb_exists(p_customer_patch,'phone')
                     then nullif(p_customer_patch->>'phone','') else phone end
      where id = v_ord.customer_id;
      v_cust_id := v_ord.customer_id;
    else
      insert into public.customers(name, phone)
      values (nullif(p_customer_patch->>'name',''), nullif(p_customer_patch->>'phone',''))
      returning id into v_cust_id;
    end if;
  end if;

  -- ---- 4a. Sửa các trường của đơn (danh sách trắng — client không tự đặt được
  --          cột nào khác, ví dụ không thể tự sửa status hay created_by) ----
  update public.orders set
    address = case when jsonb_exists(p_patch,'address')
                   then nullif(p_patch->>'address','') else address end,
    note = case when jsonb_exists(p_patch,'note')
                then nullif(p_patch->>'note','') else note end,
    required_at = case when jsonb_exists(p_patch,'required_at')
                       then nullif(p_patch->>'required_at','')::timestamptz else required_at end,
    fulfillment_method_v2 = case when jsonb_exists(p_patch,'fulfillment_method_v2')
                                 then nullif(p_patch->>'fulfillment_method_v2','') else fulfillment_method_v2 end,
    delivery_date = case when jsonb_exists(p_patch,'delivery_date')
                         then nullif(p_patch->>'delivery_date','') else delivery_date end,
    delivery_time = case when jsonb_exists(p_patch,'delivery_time')
                         then nullif(p_patch->>'delivery_time','') else delivery_time end,
    ship_fee = case when jsonb_exists(p_patch,'ship_fee')
                    then coalesce(nullif(p_patch->>'ship_fee','')::numeric, 0) else ship_fee end,
    deposit = case when jsonb_exists(p_patch,'deposit')
                   then coalesce(nullif(p_patch->>'deposit','')::numeric, 0) else deposit end,
    payment_method = case when jsonb_exists(p_patch,'payment_method')
                          then nullif(p_patch->>'payment_method','') else payment_method end,
    total = case when jsonb_exists(p_patch,'total')
                 then coalesce(nullif(p_patch->>'total','')::numeric, 0) else total end,
    customer_id = coalesce(v_cust_id, customer_id),
    version = version + 1
  where id = p_order_id;

  -- ---- 4b. Sửa danh sách món + đối soát kho thành phẩm ----
  if p_items is not null then
    -- Chỉ đơn NÀO ĐÃ TỪNG trừ kho mới phải hoàn/trừ lại. Đơn thường (bếp làm)
    -- không đụng tới kho thành phẩm, sửa món không được tự ý trừ kho của ai.
    v_da_tru := exists(select 1 from public.finished_goods_stock_out_log
                       where order_id = p_order_id);

    if v_da_tru then
      for v_r in
        with da as (
          select l.product_id as pid, nullif(l.size,'') as sz,
                 sum(l.qty) as q, min(l.branch) as br, min(l.product_name) as ten
          from public.finished_goods_stock_out_log l
          where l.order_id = p_order_id group by 1, 2
        ),
        hoan as (
          -- những lần sửa trước đã trả lại kho bao nhiêu
          select l.product_id as pid, nullif(l.size,'') as sz, sum(l.qty) as q
          from public.finished_goods_stock_in_log l
          where l.source = 'hoan_sua_don' and l.source_id = p_order_id group by 1, 2
        ),
        cu as (
          select da.pid, da.sz, da.q - coalesce(hoan.q, 0) as q, da.br, da.ten
          from da left join hoan on hoan.pid = da.pid and hoan.sz is not distinct from da.sz
        ),
        moi as (
          select (it->>'product_id')::uuid as pid,
                 nullif(it->'specification'->>'size','') as sz,
                 sum(coalesce((it->>'quantity')::numeric, 0)) as q,
                 max(coalesce(it->>'name','Sản phẩm')) as ten
          from jsonb_array_elements(p_items) it
          where coalesce(it->>'product_id','') <> ''
          group by 1, 2
        )
        select coalesce(cu.pid, moi.pid) as pid,
               coalesce(cu.sz, moi.sz) as sz,
               coalesce(moi.q, 0) - coalesce(cu.q, 0) as delta,
               coalesce(moi.ten, cu.ten, 'Sản phẩm') as ten,
               cu.br as br
        from cu full outer join moi
          on moi.pid = cu.pid and moi.sz is not distinct from cu.sz
        where coalesce(moi.q, 0) - coalesce(cu.q, 0) <> 0
      loop
        v_br := coalesce(v_r.br, public.sumi_kho_cua_san_pham(v_r.pid, v_r.sz));

        if v_r.delta > 0 then
          -- Cần thêm bánh: kiểm đủ rồi mới trừ. Thiếu là ném lỗi -> cả giao dịch
          -- quay lui, đơn giữ nguyên như cũ.
          select coalesce(sum(f.qty), 0) into v_con
          from public.finished_goods_stock f
          where f.product_id = v_r.pid
            and (v_r.sz is null or f.size is not distinct from v_r.sz);

          if v_con < v_r.delta then
            raise exception 'Kho thành phẩm không đủ để tăng số lượng — %: cần thêm %, kho còn %',
              v_r.ten || coalesce(' (' || v_r.sz || ')', ''), v_r.delta, v_con;
          end if;

          v_can := v_r.delta;
          for v_row in
            select f.id, f.qty from public.finished_goods_stock f
            where f.product_id = v_r.pid
              and (v_r.sz is null or f.size is not distinct from v_r.sz)
              and f.qty > 0
            order by f.qty desc for update
          loop
            exit when v_can <= 0;
            if v_row.qty >= v_can then
              update public.finished_goods_stock set qty = qty - v_can, updated_at = now()
              where id = v_row.id;
              v_can := 0;
            else
              update public.finished_goods_stock set qty = 0, updated_at = now()
              where id = v_row.id;
              v_can := v_can - v_row.qty;
            end if;
          end loop;

          insert into public.finished_goods_stock_out_log(
            product_id, product_name, size, branch, qty, order_id, order_code, source, staff_name, note)
          values (v_r.pid, v_r.ten, v_r.sz, v_br, v_r.delta, p_order_id, v_ord.order_code,
                  'sua_don', v_ten, 'Sửa đơn: tăng số lượng');

        else
          -- Bớt bánh: TRẢ LẠI kho đúng phần thừa.
          update public.finished_goods_stock
          set qty = qty + (-v_r.delta), updated_at = now()
          where id = (
            select f.id from public.finished_goods_stock f
            where f.product_id = v_r.pid
              and f.branch = v_br
              and (v_r.sz is null or f.size is not distinct from v_r.sz)
            order by f.updated_at desc limit 1
          );
          if not found then
            insert into public.finished_goods_stock(product_id, size, branch, qty)
            values (v_r.pid, v_r.sz, v_br, -v_r.delta);
          end if;

          insert into public.finished_goods_stock_in_log(
            product_id, product_name, size, branch, qty, source, source_id, staff_name, note)
          values (v_r.pid, v_r.ten, v_r.sz, v_br, -v_r.delta,
                  'hoan_sua_don', p_order_id, v_ten, 'Sửa đơn: trả lại kho phần bớt đi');
        end if;
      end loop;
    end if;

    -- Ghi lại danh sách món mới (đúng các cột create_order_v2 vẫn dùng).
    delete from public.order_items where order_id = p_order_id;
    for v_it in select * from jsonb_array_elements(p_items) loop
      insert into public.order_items(
        order_id, product_id, name, qty, quantity, unit, name_snapshot,
        specification, display_order, category, size, unit_price)
      values (
        p_order_id,
        case when coalesce(v_it->>'product_id','') <> '' then (v_it->>'product_id')::uuid else null end,
        coalesce(v_it->>'name', 'Sản phẩm'),
        greatest(1, ceil(coalesce((v_it->>'quantity')::numeric, 1))::int),
        coalesce((v_it->>'quantity')::numeric, 1),
        coalesce(v_it->>'unit', 'cái'),
        coalesce(v_it->>'name', 'Sản phẩm'),
        coalesce(v_it->'specification', '{}'::jsonb),
        coalesce((v_it->>'display_order')::int, 0),
        coalesce(nullif(v_it->'specification'->>'catalog_category',''),
                 nullif(v_it->'specification'->>'product_flow','')),
        nullif(v_it->'specification'->>'size',''),
        nullif(v_it->>'unit_price','')::numeric
      );
    end loop;
  end if;

  -- ---- 4c. Dùng hết lượt duyệt (một lần duyệt = một lần sửa) ----
  if v_q->>'ly_do' = 'da_duoc_duyet' then
    update public.order_edit_requests
    set used_at = now(), status = 'used'
    where id = (v_q->>'ma_duyet')::uuid and used_at is null;
  end if;

  -- ---- 4d. Nhật ký đối soát ----
  select * into v_ord from public.orders where id = p_order_id;
  v_sau := jsonb_build_object(
    'don', to_jsonb(v_ord) - 'version',
    'mon', coalesce((select jsonb_agg(to_jsonb(oi) order by oi.display_order)
                     from public.order_items oi where oi.order_id = p_order_id), '[]'::jsonb));

  insert into public.order_edit_log(order_id, editor_id, editor_name, ly_do_duoc_sua, truoc, sau)
  values (p_order_id, v_uid, coalesce(v_ten,'?'), v_q->>'ly_do', v_truoc, v_sau);

  -- Ghi sự kiện. Hỏng chỗ này thì bỏ qua, không được làm đổ cả lần sửa.
  begin
    insert into public.domain_events(event_type, entity_type, entity_id, actor_id,
      occurred_at, payload, idempotency_key, confidentiality)
    values ('order_updated', 'order', p_order_id, v_uid, now(),
            jsonb_build_object('ly_do', v_q->>'ly_do', 'version', v_ord.version),
            p_order_id::text || ':update:' || v_ord.version::text,
            coalesce(v_ord.confidentiality, 'normal'));
  exception when others then
    raise warning 'Ghi sự kiện sửa đơn bỏ qua lỗi: %', SQLERRM;
  end;

  return jsonb_build_object('thanh_cong', true, 'order_id', p_order_id,
    'version', v_ord.version, 'ly_do', v_q->>'ly_do');
end;
$fn$;

grant execute on function public.update_order_v2(uuid, int, jsonb, jsonb, jsonb) to authenticated;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202608270070_sua_don_them_ten_sdt_khach', 'completed', now(),
  'update_order_v2 gets a new optional p_customer_patch (jsonb {name, phone}) param, letting EditOrderModal.jsx write customer name/phone through the same permission-checked RPC instead of a disallowed direct client write to orders/customers. Handles both an existing customer_id (update in place) and a null customer_id (create a customers row and link it), since orders.customer_id cannot be set directly by the client under the orders_update_disabled RLS policy from 202608260014.')
on conflict(migration_key) do update
  set status = 'completed', finished_at = now(), notes = excluded.notes;

commit;
