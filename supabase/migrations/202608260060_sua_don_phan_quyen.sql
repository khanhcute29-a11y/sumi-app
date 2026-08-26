-- SỬA ĐƠN HÀNG: phân quyền + giới hạn 1 giờ + hoàn/trừ kho khi đổi món.
--
-- VÌ SAO PHẢI VIẾT LẠI — hiện trạng tìm thấy khi quét hệ thống ngày 26/08:
--
--  1. Giao diện gọi `edit_order_field` và `get_order_change_history` nhưng HAI
--     HÀM NÀY KHÔNG TỒN TẠI trong database. Bấm Lưu là ném lỗi.
--  2. Nút "Chỉnh sửa" bị gác bởi `status_v2 === 'pending'` — KHÔNG PHẢI giá trị
--     có thật (thực tế chỉ có awaiting_assignment / in_delivery / completed...),
--     nên nút chưa bao giờ hiện ra. Cả tính năng là code chết.
--  3. `canEditOrder` so `created_by_id` — cột đó KHÔNG CÓ (tên thật là
--     `created_by`) và cũng không nằm trong câu select. Người tạo đơn vĩnh viễn
--     không sửa được đơn của chính mình.
--  4. LỖ HỔNG BẢO MẬT: `approve_order_edit_request` nhận `p_director_id` DO
--     TRÌNH DUYỆT GỬI LÊN và không kiểm tra người gọi có phải giám đốc không.
--     Hàm lại là SECURITY DEFINER (chạy vượt mọi hàng rào RLS). Nghĩa là BẤT KỲ
--     nhân viên nào cũng có thể tự duyệt yêu cầu sửa đơn của chính mình.
--     `request_order_edit_approval` nhận danh tính từ client y hệt.
--
-- Nguyên tắc bản này: DANH TÍNH LUÔN LẤY TỪ `auth.uid()`, không bao giờ tin
-- tham số do trình duyệt gửi lên. Mọi quyền quyết ở database; giao diện hỏi lại
-- ĐÚNG hàm đó để ẩn/hiện nút — không có đường vòng qua client.
begin;

-- ---------------------------------------------------------------------------
-- 1. Nhật ký sửa đơn + đánh dấu lượt duyệt đã dùng
-- ---------------------------------------------------------------------------
create table if not exists public.order_edit_log(
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  editor_id uuid,
  editor_name text,
  ly_do_duoc_sua text,
  truoc jsonb,
  sau jsonb,
  created_at timestamptz not null default now()
);
create index if not exists order_edit_log_order_idx
  on public.order_edit_log(order_id, created_at desc);
alter table public.order_edit_log enable row level security;

drop policy if exists "doc nhat ky sua don" on public.order_edit_log;
create policy "doc nhat ky sua don" on public.order_edit_log
  for select to authenticated using (public.is_approved());

-- Ba hàm cũ trả kiểu `json`, bản mới dùng `jsonb` nên PostgreSQL bắt buộc phải
-- xoá trước khi tạo lại. Chỗ gọi ở giao diện không đổi (tên và tham số giữ nguyên).
drop function if exists public.request_order_edit_approval(uuid, uuid, text, text);
drop function if exists public.approve_order_edit_request(uuid, uuid, text, boolean);
drop function if exists public.check_order_edit_lock(uuid);

-- Một lượt duyệt của Giám đốc chỉ dùng được cho MỘT lần sửa.
alter table public.order_edit_requests add column if not exists used_at timestamptz;

-- ---------------------------------------------------------------------------
-- 2. NGUỒN SỰ THẬT DUY NHẤT: ai được sửa đơn này, còn bao lâu?
--    Backend gọi để CHẶN. Frontend gọi để ẩn/hiện nút. Cùng một hàm, nên không
--    thể có chuyện giao diện cho bấm mà server từ chối, hoặc ngược lại.
-- ---------------------------------------------------------------------------
create or replace function public.sumi_quyen_sua_don(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_uid    uuid := auth.uid();
  v_pro    public.profiles%rowtype;
  v_ord    public.orders%rowtype;
  v_vai    text[];
  v_gd     boolean;
  v_tao    boolean;
  v_bep    boolean;
  v_conlai numeric;
  v_duyet  uuid;
  v_cho    boolean;
  v_nen    jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('duoc_sua', false, 'ly_do', 'chua_dang_nhap',
      'thong_bao', 'Chưa đăng nhập.');
  end if;

  select * into v_pro from public.profiles where id = v_uid;
  if v_pro.id is null or not coalesce(v_pro.approved, false)
     or coalesce(v_pro.active, true) = false then
    return jsonb_build_object('duoc_sua', false, 'ly_do', 'tai_khoan_khoa',
      'thong_bao', 'Tài khoản chưa được kích hoạt hoặc đã bị khoá.');
  end if;

  select * into v_ord from public.orders where id = p_order_id;
  if v_ord.id is null then
    return jsonb_build_object('duoc_sua', false, 'ly_do', 'khong_thay_don',
      'thong_bao', 'Không tìm thấy đơn hàng.');
  end if;

  v_vai := array_remove(array[v_pro.role]::text[] || coalesce(v_pro.extra_roles, '{}')::text[], null);
  v_gd  := v_vai && array['owner', 'admin'];
  v_tao := (v_ord.created_by = v_uid);
  -- "Bếp trưởng ĐƯỢC PHÂN LUỒNG": phải là người được giao hoặc đã nhận gói việc
  -- của CHÍNH đơn này. Không phải cứ mang chức bếp trưởng là sửa được mọi đơn.
  v_bep := exists(
    select 1 from public.order_work_packages w
    where w.order_id = p_order_id
      and (w.assigned_to_staff_id = v_uid or w.accepted_by = v_uid)
  );

  v_conlai := greatest(0, 3600 - extract(epoch from (now() - v_ord.created_at)));

  select r.id into v_duyet from public.order_edit_requests r
  where r.order_id = p_order_id and r.status = 'approved' and r.used_at is null
  order by r.approved_at desc nulls last limit 1;

  v_cho := exists(select 1 from public.order_edit_requests r
                  where r.order_id = p_order_id and r.status = 'pending');

  v_nen := jsonb_build_object(
    'la_nguoi_tao', v_tao,
    'la_bep_truong_phu_trach', v_bep,
    'la_giam_doc', v_gd,
    'con_lai_giay', floor(v_conlai)::int,
    'qua_han', v_conlai <= 0,
    'dang_cho_duyet', v_cho,
    'da_duoc_duyet', v_duyet is not null,
    'ma_don', coalesce(v_ord.order_code, ''),
    'nguoi_tao_ten', coalesce(v_ord.created_by_name, '')
  );

  if not (v_gd or v_tao or v_bep) then
    return v_nen || jsonb_build_object('duoc_sua', false, 'ly_do', 'khong_du_quyen',
      'thong_bao', 'Bạn không có quyền sửa đơn này. Chỉ người tạo đơn, bếp trưởng được phân công đơn này, hoặc Giám đốc mới sửa được.');
  end if;

  -- Đơn đã đóng sổ thì không sửa. Sửa món của đơn đã xong sẽ làm sai cả tồn kho
  -- lẫn doanh thu đã chốt — muốn thay đổi thì huỷ và lập đơn mới.
  if v_ord.status_v2 in ('cancelled', 'completed') or v_ord.cancelled_at is not null then
    return v_nen || jsonb_build_object('duoc_sua', false, 'ly_do', 'don_da_dong',
      'thong_bao', 'Đơn đã hoàn thành hoặc đã huỷ nên không sửa được nữa. Cần thay đổi thì lập đơn mới.');
  end if;

  -- Giám đốc là người đi duyệt cho người khác, nên không tự bắt mình xin phép
  -- chính mình — nếu chặn theo giờ thì luồng duyệt sẽ quay vòng vô nghĩa.
  if v_gd then
    return v_nen || jsonb_build_object('duoc_sua', true, 'ly_do', 'giam_doc',
      'thong_bao', 'Giám đốc sửa được bất cứ lúc nào.');
  end if;

  if v_conlai > 0 then
    return v_nen || jsonb_build_object('duoc_sua', true, 'ly_do', 'trong_gio',
      'thong_bao', 'Còn ' || greatest(1, ceil(v_conlai / 60))::text || ' phút để sửa trực tiếp.');
  end if;

  if v_duyet is not null then
    return v_nen || jsonb_build_object('duoc_sua', true, 'ly_do', 'da_duoc_duyet',
      'ma_duyet', v_duyet,
      'thong_bao', 'Giám đốc đã duyệt. Lượt duyệt này dùng được cho MỘT lần sửa.');
  end if;

  return v_nen || jsonb_build_object('duoc_sua', false, 'ly_do', 'qua_han',
    'thong_bao', case when v_cho
      then 'Đã quá 1 giờ. Yêu cầu chỉnh sửa của bạn đang chờ Giám đốc duyệt.'
      else 'Đã quá 1 giờ kể từ lúc tạo đơn. Hãy gửi yêu cầu chỉnh sửa để Giám đốc duyệt.' end);
end;
$fn$;

grant execute on function public.sumi_quyen_sua_don to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Kho nào giữ sản phẩm này? (macaron -> X41, teabreak -> X42, còn lại Bakery)
--    Khớp đúng branchForCategory() bên giao diện.
-- ---------------------------------------------------------------------------
create or replace function public.sumi_kho_cua_san_pham(p_product_id uuid, p_size text)
returns text language plpgsql security definer set search_path = public as $fn$
declare v_br text;
begin
  select f.branch into v_br from public.finished_goods_stock f
  where f.product_id = p_product_id
    and (p_size is null or f.size is not distinct from p_size)
  order by f.qty desc limit 1;
  if v_br is not null then return v_br; end if;

  select case when p.category = 'macaron' then 'xuong41'
              when p.category = 'teabreak' then 'xuong42'
              else 'bakery' end
  into v_br from public.products p where p.id = p_product_id;
  return coalesce(v_br, 'bakery');
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 4. SỬA ĐƠN. Một giao dịch duy nhất: sai ở bất cứ bước nào là quay lui sạch,
--    không có chuyện trừ kho xong rồi mới báo lỗi.
-- ---------------------------------------------------------------------------
create or replace function public.update_order_v2(
  p_order_id        uuid,
  p_expected_version int,
  p_patch           jsonb default '{}'::jsonb,
  p_items           jsonb default null
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

grant execute on function public.update_order_v2 to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Gửi yêu cầu chỉnh sửa khi đã quá 1 giờ.
--    Giữ nguyên tên tham số cũ để không làm vỡ chỗ gọi, NHƯNG p_user_id và
--    p_user_name BỊ BỎ QUA — danh tính lấy từ auth.uid().
-- ---------------------------------------------------------------------------
create or replace function public.request_order_edit_approval(
  p_order_id uuid, p_user_id uuid, p_user_name text, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_uid uuid := auth.uid();
  v_ten text;
  v_q   jsonb;
  v_id  uuid;
begin
  if v_uid is null then raise exception 'Chưa đăng nhập.'; end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Phải ghi rõ lý do cần sửa để Giám đốc biết mà duyệt.';
  end if;

  v_q := public.sumi_quyen_sua_don(p_order_id);
  -- Chỉ ba nhóm được sửa mới được phép xin sửa. Người ngoài không mở được cửa.
  if not ((v_q->>'la_nguoi_tao')::boolean or (v_q->>'la_bep_truong_phu_trach')::boolean
          or (v_q->>'la_giam_doc')::boolean) then
    raise exception 'Bạn không có quyền yêu cầu sửa đơn này.';
  end if;
  if v_q->>'ly_do' = 'don_da_dong' then
    raise exception '%', v_q->>'thong_bao';
  end if;
  if exists(select 1 from public.order_edit_requests
            where order_id = p_order_id and status = 'pending') then
    raise exception 'Đơn này đã có một yêu cầu chỉnh sửa đang chờ Giám đốc duyệt.';
  end if;

  select full_name into v_ten from public.profiles where id = v_uid;

  insert into public.order_edit_requests(order_id, requested_by_id, requested_by_name, reason, status)
  values (p_order_id, v_uid, coalesce(v_ten, '?'), btrim(p_reason), 'pending')
  returning id into v_id;

  begin
    insert into public.kpi_logs(order_id, staff_id, staff_name, event_type, notes)
    values (p_order_id, v_uid, coalesce(v_ten,'?'), 'edit_approval_requested',
            'Xin sửa đơn: ' || btrim(p_reason));
  exception when others then
    raise warning 'Ghi KPI bỏ qua lỗi: %', SQLERRM;
  end;

  return jsonb_build_object('thanh_cong', true, 'success', true, 'request_id', v_id,
    'thong_bao', 'Đã gửi yêu cầu. Giám đốc sẽ duyệt và bạn sẽ mở khoá sửa được đơn này.');
end;
$fn$;

grant execute on function public.request_order_edit_approval to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Giám đốc duyệt / từ chối.
--    p_director_id, p_director_name BỊ BỎ QUA — đây chính là lỗ hổng cũ.
-- ---------------------------------------------------------------------------
create or replace function public.approve_order_edit_request(
  p_request_id uuid, p_director_id uuid, p_director_name text, p_approved boolean)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_uid uuid := auth.uid();
  v_pro public.profiles%rowtype;
  v_vai text[];
  v_ord uuid;
begin
  if v_uid is null then raise exception 'Chưa đăng nhập.'; end if;

  select * into v_pro from public.profiles where id = v_uid;
  if v_pro.id is null or not coalesce(v_pro.approved, false)
     or coalesce(v_pro.active, true) = false then
    raise exception 'Tài khoản chưa được kích hoạt hoặc đã bị khoá.';
  end if;

  v_vai := array_remove(array[v_pro.role]::text[] || coalesce(v_pro.extra_roles,'{}')::text[], null);
  if not (v_vai && array['owner','admin']) then
    raise exception 'Chỉ Giám đốc mới được duyệt yêu cầu chỉnh sửa đơn hàng.';
  end if;

  update public.order_edit_requests
  set status = case when p_approved then 'approved' else 'rejected' end,
      approved_by_id = v_uid,
      approved_by_name = coalesce(v_pro.full_name, '?'),
      approved_at = now()
  where id = p_request_id and status = 'pending'
  returning order_id into v_ord;

  if v_ord is null then
    raise exception 'Không tìm thấy yêu cầu đang chờ duyệt (có thể đã được xử lý rồi).';
  end if;

  begin
    insert into public.kpi_logs(order_id, staff_id, staff_name, event_type, notes)
    values (v_ord, v_uid, coalesce(v_pro.full_name,'?'), 'edit_approval_processed',
            case when p_approved then 'Giám đốc ĐÃ DUYỆT cho sửa đơn'
                 else 'Giám đốc TỪ CHỐI yêu cầu sửa đơn' end);
  exception when others then
    raise warning 'Ghi KPI bỏ qua lỗi: %', SQLERRM;
  end;

  return jsonb_build_object('thanh_cong', true, 'success', true,
    'order_id', v_ord, 'da_duyet', p_approved,
    'thong_bao', case when p_approved then 'Đã duyệt cho sửa đơn.' else 'Đã từ chối yêu cầu.' end);
end;
$fn$;

grant execute on function public.approve_order_edit_request to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Lịch sử sửa đơn (giao diện đang gọi hàm này nhưng nó chưa hề tồn tại)
-- ---------------------------------------------------------------------------
create or replace function public.get_order_change_history(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $fn$
begin
  if auth.uid() is null then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', l.id, 'nguoi_sua', l.editor_name, 'luc', l.created_at,
      'ly_do_duoc_sua', l.ly_do_duoc_sua,
      'truoc', l.truoc, 'sau', l.sau) order by l.created_at desc)
    from public.order_edit_log l where l.order_id = p_order_id), '[]'::jsonb);
end;
$fn$;

grant execute on function public.get_order_change_history to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Hàm cũ 30 phút: giữ tên để không vỡ chỗ gọi, nhưng trả về theo luật MỚI
--    (1 giờ + phân quyền) bằng cách hỏi lại đúng nguồn sự thật ở mục 2.
-- ---------------------------------------------------------------------------
create or replace function public.check_order_edit_lock(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare v_q jsonb;
begin
  v_q := public.sumi_quyen_sua_don(p_order_id);
  return v_q || jsonb_build_object(
    'success', true,
    'can_edit', (v_q->>'duoc_sua')::boolean,
    'minutes_remaining', floor(coalesce((v_q->>'con_lai_giay')::numeric, 0) / 60)
  );
end;
$fn$;

grant execute on function public.check_order_edit_lock to authenticated;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202608260060_sua_don_phan_quyen', 'completed', now(),
  'Order editing: RBAC (creator / assigned kitchen lead / director) enforced server-side from auth.uid(); 1-hour direct-edit window then director approval; finished-goods stock reconciliation on item changes; optimistic locking; audit log. Closes privilege-escalation hole where approve_order_edit_request and request_order_edit_approval trusted client-supplied identity. Adds update_order_v2 and get_order_change_history which the frontend already called but never existed.')
on conflict(migration_key) do update
  set status = 'completed', finished_at = now(), notes = excluded.notes;

commit;
