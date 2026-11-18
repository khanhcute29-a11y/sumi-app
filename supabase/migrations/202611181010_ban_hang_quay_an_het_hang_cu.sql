-- Bán tại quầy: "xoá hết mặt hàng để tạo lại cho đúng thực tế" — Giám đốc duyệt 18/11/2026, áp dụng cả 3 quầy.
--  • ẨN mọi món đang có khỏi màn Bán tại quầy (products.pos_an = true). KHÔNG xoá dòng nào:
--    màn Tạo đơn / bếp / KPI vẫn thấy sản phẩm app như cũ; hoá đơn cũ, thẻ kho giữ nguyên.
--  • Món nhân viên đã tạo ở quầy bằng nút "Thêm hàng hoá" (có trong nhật ký them_hang) KHÔNG bị ẩn.
--  • Tồn của các món bị ẩn ở mọi quầy đưa về 0 bằng phiếu KIỂM KHO (mỗi quầy 1 phiếu KK…), thẻ kho ghi lại số cũ.
--    Không đụng kho bếp (store_location NULL).
-- Chạy SAU 202611181000. Chạy lại lần 2 không làm gì thêm (món đã ẩn, tồn đã 0).
begin;
set local lock_timeout = '10s';

do $$
declare s record; r record; v_code text; v_id uuid; v_lines jsonb;
begin
  -- 1) Tồn các món sắp ẩn → 0, mỗi quầy 1 phiếu kiểm kho.
  for s in select distinct f.store_location from public.finished_goods_stock f
    join public.products p on p.id = f.product_id
    where f.store_location is not null and f.is_semi_finished = false and coalesce(f.qty, 0) <> 0
      and not p.pos_an
      and not exists (select 1 from public.pos_audit_log a where a.action = 'them_hang' and a.detail->>'id' = p.id::text)
      and exists (select 1 from public.pos_settings ps where ps.store_location = f.store_location)
  loop
    v_code := 'KK' || lpad(nextval('public.pos_doc_seq')::text, 6, '0');
    v_id := gen_random_uuid(); v_lines := '[]';
    for r in
      select f.id, f.product_id, f.size, f.qty, coalesce(p.name, 'Hàng') as name
      from public.finished_goods_stock f join public.products p on p.id = f.product_id
      where f.store_location = s.store_location and f.is_semi_finished = false and coalesce(f.qty, 0) <> 0
        and not p.pos_an
        and not exists (select 1 from public.pos_audit_log a where a.action = 'them_hang' and a.detail->>'id' = p.id::text)
      for update of f
    loop
      update public.finished_goods_stock set qty = 0, updated_at = now() where id = r.id;
      insert into public.pos_stock_ledger(store_location, product_id, size, name, delta, balance_after, ref_type, ref_code, actor_name)
      values (s.store_location, r.product_id, r.size, r.name, -r.qty, 0, 'kiem_kho', v_code, 'Giám đốc');
      v_lines := v_lines || jsonb_build_array(jsonb_build_object('product_id', r.product_id, 'size', r.size, 'name', r.name,
        'qty', 0, 'system_qty', r.qty, 'delta', -r.qty));
    end loop;
    insert into public.pos_stock_lot_moves(lot_id, delta, ref_type, ref_code)
      select l.id, -l.qty, 'kiem_kho', v_code from public.pos_stock_lots l join public.products p on p.id = l.product_id
      where l.store_location = s.store_location and l.qty > 0 and not p.pos_an
        and not exists (select 1 from public.pos_audit_log a where a.action = 'them_hang' and a.detail->>'id' = p.id::text);
    update public.pos_stock_lots l set qty = 0 from public.products p
      where p.id = l.product_id and l.store_location = s.store_location and l.qty > 0 and not p.pos_an
        and not exists (select 1 from public.pos_audit_log a where a.action = 'them_hang' and a.detail->>'id' = p.id::text);
    insert into public.pos_stock_docs(id, code, doc_type, store_location, status, lines, note, created_by_name, done_by_name, done_at)
    values (v_id, v_code, 'kiem_kho', s.store_location, 'xong', v_lines,
      'Xoá hết mặt hàng cũ ở quầy để tạo lại theo thực tế: tồn món cũ về 0', 'Giám đốc', 'Giám đốc', now());
  end loop;

  -- 2) Ẩn khỏi quầy.
  update public.products p set pos_an = true
    where not p.pos_an
      and not exists (select 1 from public.pos_audit_log a where a.action = 'them_hang' and a.detail->>'id' = p.id::text);
end $$;

-- Đối chiếu: con_hien = số món quầy còn thấy (chỉ món mới tạo ở quầy), ton_mon_an_khac_0 phải = 0.
select
  (select count(*) from public.products where active and not pos_an) as con_hien,
  (select count(*) from public.products where pos_an) as da_an,
  (select count(*) from public.finished_goods_stock f join public.products p on p.id = f.product_id
     where p.pos_an and f.store_location is not null and f.is_semi_finished = false and coalesce(f.qty, 0) <> 0) as ton_mon_an_khac_0;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values ('202611181010_ban_hang_quay_an_het_hang_cu', 'completed', now(),
  'Bán tại quầy: ẩn mọi món cũ khỏi quầy (cả 3 quầy), tồn món cũ về 0 bằng phiếu kiểm kho; app chính không đổi.')
on conflict (migration_key) do update set status = 'completed', finished_at = now(), notes = excluded.notes;

commit;
