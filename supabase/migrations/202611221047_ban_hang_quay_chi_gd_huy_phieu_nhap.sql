-- Bán tại quầy: phiếu nhập hàng (PN, bep_giao) chỉ Giám đốc huỷ được.
-- Chỉ thay thân hàm pos_huy_phieu (giữ nguyên chữ ký), bản gốc ở 202611221000.
begin;
set local lock_timeout = '10s';

create or replace function public.pos_huy_phieu(p_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_cap text := public.pos_cap_do(); v_d public.pos_stock_docs; v_l jsonb; v_delta numeric; v_nc public.pos_stock_docs;
begin
  if v_cap is null then raise exception 'Tài khoản chưa được duyệt'; end if;
  select * into v_d from public.pos_stock_docs where id = p_id for update;
  if v_d.id is null then raise exception 'Không tìm thấy phiếu'; end if;
  if v_d.status = 'huy' then return to_jsonb(v_d); end if;
  if v_d.doc_type = 'nhan_chuyen' then
    raise exception 'Phiếu nhận chuyển không huỷ riêng — bên gửi huỷ phiếu xuất % (khi bạn chưa bấm Nhận hàng)',
      coalesce((select code from public.pos_stock_docs where id = v_d.ref_doc), 'gốc');
  end if;
  -- Phiếu nhập hàng (PN) đã gửi / đã nhập: chỉ Giám đốc huỷ (chủ tiệm yêu cầu 22/11). Phiếu tạm giữ luật cũ.
  if v_d.doc_type = 'bep_giao' and v_d.status <> 'tam' and v_cap <> 'gd' then
    raise exception 'Chỉ Giám đốc huỷ được phiếu nhập hàng — nhắn Giám đốc huỷ giúp phiếu %', v_d.code;
  end if;
  if v_cap = 'nv' and not (v_d.created_by = auth.uid() and v_d.shift_id is not distinct from public.pos__ca_mo(v_d.store_location)) then
    raise exception 'Chỉ người lập phiếu (trong ca) hoặc Quản lý / Giám đốc huỷ được';
  end if;
  if v_d.doc_type = 'noi_bo' and v_d.ref_doc is not null then
    select * into v_nc from public.pos_stock_docs where id = v_d.ref_doc for update;
    if v_nc.status = 'xong' then
      raise exception '% đã nhận bánh (phiếu %) — không huỷ được nữa. Sai số thì kiểm kho ở 2 cửa hàng', v_nc.store_location, v_nc.code;
    end if;
    if v_nc.id is not null and v_nc.status <> 'huy' then
      update public.pos_stock_docs set status = 'huy', cancelled_by_name = public.pos_ten_toi(), cancelled_at = now(),
        cancel_reason = 'Bên gửi huỷ ' || v_d.code || coalesce(': ' || nullif(trim(p_reason), ''), '') where id = v_nc.id;
    end if;
  end if;
  if v_d.status = 'xong' then
    for v_l in select value from jsonb_array_elements(v_d.lines) loop
      if v_d.doc_type = 'bep_giao' then
        v_delta := coalesce((v_l->>'qty_received')::numeric, 0);
        if v_delta <> 0 then perform public.pos__ton_cong(v_d.store_location, (v_l->>'product_id')::uuid, v_l->>'size', v_l->>'name', -v_delta, 'huy_phieu', v_d.code); end if;
        perform public.pos__ton_cong(null, (v_l->>'product_id')::uuid, v_l->>'size', v_l->>'name', coalesce((v_l->>'qty')::numeric, 0), 'huy_phieu', v_d.code);
      else
        v_delta := coalesce((v_l->>'delta')::numeric, 0);
        if v_delta <> 0 then perform public.pos__ton_cong(v_d.store_location, (v_l->>'product_id')::uuid, v_l->>'size', v_l->>'name', -v_delta, 'huy_phieu', v_d.code); end if;
      end if;
    end loop;
  end if;
  update public.pos_stock_docs set status = 'huy', cancelled_by_name = public.pos_ten_toi(), cancelled_at = now(),
    cancel_reason = nullif(trim(p_reason), '') where id = p_id returning * into v_d;
  perform public.pos__ghi_nhat_ky(v_d.store_location, 'huy_phieu', v_d.code, jsonb_build_object('ly_do', p_reason));
  return to_jsonb(v_d);
end $$;

revoke all on function public.pos_huy_phieu(uuid, text) from public, anon;
grant execute on function public.pos_huy_phieu(uuid, text) to authenticated;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values ('202611221047_ban_hang_quay_chi_gd_huy_phieu_nhap', 'completed', now(),
  'Bán tại quầy: phiếu nhập hàng đã gửi / đã nhập chỉ Giám đốc huỷ được; phiếu tạm giữ luật cũ.')
on conflict (migration_key) do update set status = 'completed', finished_at = now(), notes = excluded.notes;

commit;
