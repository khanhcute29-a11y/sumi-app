-- ĐƠN TỪ / ĐỀ XUẤT: khoá đường duyệt lại và bắt đi qua ĐÚNG HAI CẤP.
--
-- ═══ VÌ SAO PHẢI LÀM ═══
--
-- Hiện tại màn hình Duyệt gọi thẳng `update approval_requests set status=...`.
-- Nghĩa là ai đã đăng nhập, mở F12 lên, cũng có thể tự bấm duyệt đơn xin nghỉ
-- CỦA CHÍNH MÌNH. Giao diện có ẩn nút, nhưng ẩn nút không phải là chặn.
--
-- Đã đo bằng khoá công khai của trang web (26/08/2026):
--   • Người CHƯA đăng nhập: bị chặn sạch — `permission denied for is_approved`.
--     Hàng rào chống người ngoài Internet đang tốt, không cần đụng.
--   • Người ĐÃ đăng nhập: chưa xác minh được từ mã nguồn, vì bảng
--     `approval_requests` không nằm trong migration nào — nó được tạo tay
--     ngoài hệ thống nên không có tệp nào ghi lại chính sách của nó.
--
-- Thay vì đoán, bản này đóng hẳn đường ghi thẳng và mở đúng một cổng có kiểm
-- soát. Dù chính sách cũ có lỏng tới đâu thì sau bản này cũng không ai đổi được
-- trạng thái đơn ngoài cổng đó.
--
-- ═══ LUỒNG DUYỆT HAI CẤP ═══
--
--   Nhân viên gửi  ->  CẤP 1: Quản lý cùng đơn vị  ->  CẤP 2: Giám đốc  -> xong
--
-- Từ chối ở bất kỳ cấp nào là dừng. Mọi bước đều ghi rõ AI duyệt, LÚC NÀO, để
-- cả ba cấp nhìn cùng một dòng thông tin — không ai phải hỏi lại nhau.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '120s';

-- ---------------------------------------------------------------------------
-- 1. Thêm chỗ ghi dấu vết hai cấp. CHỈ THÊM CỘT, không sửa gì có sẵn,
--    nên màn hình Duyệt cũ vẫn chạy bình thường trong lúc chuyển tiếp.
-- ---------------------------------------------------------------------------
alter table public.approval_requests add column if not exists cap1_status text;
alter table public.approval_requests add column if not exists cap1_by      uuid;
alter table public.approval_requests add column if not exists cap1_name    text;
alter table public.approval_requests add column if not exists cap1_at      timestamptz;
alter table public.approval_requests add column if not exists cap1_note    text;

alter table public.approval_requests add column if not exists cap2_status  text;
alter table public.approval_requests add column if not exists cap2_by      uuid;
alter table public.approval_requests add column if not exists cap2_name    text;
alter table public.approval_requests add column if not exists cap2_at      timestamptz;
alter table public.approval_requests add column if not exists cap2_note    text;

-- Chi tiết đơn xin nghỉ, theo đúng cách tiệm đang nói với nhau:
-- "cả ngày", "nửa ca đầu", "nửa ca sau".
alter table public.approval_requests add column if not exists leave_scope   text;
alter table public.approval_requests add column if not exists leave_to_date date;
alter table public.approval_requests add column if not exists leave_kind    text;

comment on column public.approval_requests.cap1_status is
  'Cấp 1 = Quản lý cùng đơn vị. pending / approved / rejected.';
comment on column public.approval_requests.cap2_status is
  'Cấp 2 = Giám đốc. Chỉ mở sau khi cấp 1 đã đồng ý.';

-- Đơn cũ đã chốt trước khi có luồng hai cấp: điền bù cho khỏi trống trơn
-- trên màn hình, ghi rõ là chốt một cấp theo cách cũ.
update public.approval_requests
set cap1_status = status,
    cap1_name   = coalesce(resolved_by, 'Hệ thống cũ'),
    cap1_at     = coalesce(resolved_at, created_at),
    cap1_note   = 'Duyệt theo quy trình một cấp trước ngày 26/08/2026',
    cap2_status = status,
    cap2_name   = coalesce(resolved_by, 'Hệ thống cũ'),
    cap2_at     = coalesce(resolved_at, created_at)
where status in ('approved', 'rejected')
  and cap1_status is null;

update public.approval_requests
set cap1_status = 'pending'
where status = 'pending' and cap1_status is null;

-- ---------------------------------------------------------------------------
-- 2. Ai đứng cấp nào
-- ---------------------------------------------------------------------------

-- Giám đốc = cấp 2. Dùng lại đúng hàm hệ thống vẫn dùng, không đẻ khái niệm mới.
create or replace function public.sumi_la_cap2(p_ai uuid default null)
returns boolean language sql stable security definer set search_path = public as $fn$
  select exists (
    select 1 from public.profiles p
    where p.id = coalesce(p_ai, auth.uid())
      and p.approved = true
      and p.active is distinct from false
      and (p.role in ('owner', 'admin')
           or p.extra_roles && array['owner', 'admin']::text[])
  );
$fn$;

-- Cấp 1 = quản lý CÙNG ĐƠN VỊ với người gửi đơn.
-- Dùng lại `sumi_cung_don_vi_voi_toi` đã dựng cho phân hệ Việc — nó đã bọc
-- SECURITY DEFINER sẵn để vượt qua hàng rào riêng của `profile_assignments`.
create or replace function public.sumi_la_cap1_cua(p_nguoi_gui uuid)
returns boolean language sql stable security definer set search_path = public as $fn$
  select public.sumi_cung_don_vi_voi_toi(p_nguoi_gui)
      or public.is_payroll_manager();
$fn$;

grant execute on function public.sumi_la_cap2(uuid) to authenticated;
grant execute on function public.sumi_la_cap1_cua(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. CỔNG GỬI ĐƠN — người gửi luôn là chính người đang đăng nhập
--
--    Không nhận `requester_id` từ trình duyệt. Nhận vào là mở đường cho người
--    ta gửi đơn dưới tên đồng nghiệp.
-- ---------------------------------------------------------------------------
create or replace function public.sumi_gui_de_xuat(
  p_type        text,
  p_reason      text,
  p_leave_date  date default null,
  p_leave_to    date default null,
  p_leave_scope text default null,
  p_leave_kind  text default null,
  p_order_code  text default null,
  p_photo_url   text default null
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_toi  uuid := auth.uid();
  v_ten  text;
  v_vai  text;
  v_id   uuid;
begin
  if v_toi is null then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Chưa đăng nhập.');
  end if;

  if p_type is null or btrim(p_type) = '' then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Chưa chọn loại đề xuất.');
  end if;

  if p_reason is null or btrim(p_reason) = '' then
    return jsonb_build_object('thanh_cong', false,
      'thong_bao', 'Hãy ghi lý do để quản lý hiểu và duyệt nhanh hơn.');
  end if;

  if p_leave_to is not null and p_leave_date is not null and p_leave_to < p_leave_date then
    return jsonb_build_object('thanh_cong', false,
      'thong_bao', 'Ngày kết thúc phải sau ngày bắt đầu.');
  end if;

  select full_name, role into v_ten, v_vai from public.profiles where id = v_toi;

  insert into public.approval_requests(
    type, requester_id, requester_name, requester_role,
    reason, leave_date, leave_to_date, leave_scope, leave_kind,
    order_code, photo_url, status, cap1_status)
  values (
    p_type, v_toi, v_ten, v_vai,
    btrim(p_reason), p_leave_date, p_leave_to, p_leave_scope, p_leave_kind,
    nullif(btrim(coalesce(p_order_code, '')), ''), p_photo_url,
    'pending', 'pending')
  returning id into v_id;

  return jsonb_build_object('thanh_cong', true, 'id', v_id,
    'thong_bao', 'Đã gửi đề xuất. Quản lý sẽ duyệt trước, sau đó tới Giám đốc.');
end;
$fn$;

grant execute on function public.sumi_gui_de_xuat(text, text, date, date, text, text, text, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 4. CỔNG DUYỆT — tự biết người bấm đang đứng cấp nào
-- ---------------------------------------------------------------------------
create or replace function public.sumi_duyet_de_xuat(
  p_id      uuid,
  p_dong_y  boolean,
  p_ghi_chu text default null
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_toi   uuid := auth.uid();
  v_ten   text;
  v_don   public.approval_requests%rowtype;
  v_cap2  boolean;
  v_cap1  boolean;
  v_ghi   text := nullif(btrim(coalesce(p_ghi_chu, '')), '');
begin
  if v_toi is null then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Chưa đăng nhập.');
  end if;

  select * into v_don from public.approval_requests where id = p_id;
  if v_don.id is null then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Không tìm thấy đề xuất.');
  end if;

  if v_don.status <> 'pending' then
    return jsonb_build_object('thanh_cong', false,
      'thong_bao', 'Đề xuất này đã được xử lý rồi.');
  end if;

  -- Không ai tự duyệt đơn của chính mình. Kể cả Giám đốc — đơn của Giám đốc
  -- phải do một người có quyền khác duyệt, để dấu vết luôn có hai cái tên.
  if v_don.requester_id = v_toi then
    return jsonb_build_object('thanh_cong', false,
      'thong_bao', 'Không thể tự duyệt đề xuất của chính mình.');
  end if;

  select full_name into v_ten from public.profiles where id = v_toi;
  v_cap2 := public.sumi_la_cap2();
  v_cap1 := public.sumi_la_cap1_cua(v_don.requester_id);

  if not (v_cap1 or v_cap2) then
    return jsonb_build_object('thanh_cong', false,
      'thong_bao', 'Bạn không phụ trách nhân sự này nên không duyệt được đề xuất.');
  end if;

  -- ── TỪ CHỐI: dừng luôn ở cấp đang đứng ──
  if not p_dong_y then
    if coalesce(v_don.cap1_status, 'pending') = 'pending' then
      update public.approval_requests set
        cap1_status = 'rejected', cap1_by = v_toi, cap1_name = v_ten,
        cap1_at = now(), cap1_note = v_ghi,
        status = 'rejected', resolved_by = v_ten, resolved_at = now()
      where id = p_id;
      return jsonb_build_object('thanh_cong', true, 'cap', 1,
        'thong_bao', 'Đã từ chối ở cấp Quản lý.');
    end if;

    if not v_cap2 then
      return jsonb_build_object('thanh_cong', false,
        'thong_bao', 'Cấp 1 đã duyệt. Chỉ Giám đốc mới quyết được ở bước này.');
    end if;

    update public.approval_requests set
      cap2_status = 'rejected', cap2_by = v_toi, cap2_name = v_ten,
      cap2_at = now(), cap2_note = v_ghi,
      status = 'rejected', resolved_by = v_ten, resolved_at = now()
    where id = p_id;
    return jsonb_build_object('thanh_cong', true, 'cap', 2,
      'thong_bao', 'Đã từ chối ở cấp Giám đốc.');
  end if;

  -- ── ĐỒNG Ý CẤP 1 ──
  if coalesce(v_don.cap1_status, 'pending') = 'pending' then
    update public.approval_requests set
      cap1_status = 'approved', cap1_by = v_toi, cap1_name = v_ten,
      cap1_at = now(),
      -- Giám đốc bấm khi cấp 1 còn treo thì ghi rõ là duyệt thay, không giấu.
      cap1_note = coalesce(v_ghi, case when v_cap2 and not v_cap1
                                       then 'Giám đốc duyệt thay cấp Quản lý'
                                       else null end),
      cap2_status = 'pending'
    where id = p_id;

    -- Giám đốc thì đi luôn cấp 2, đỡ phải bấm hai lần.
    if v_cap2 then
      update public.approval_requests set
        cap2_status = 'approved', cap2_by = v_toi, cap2_name = v_ten,
        cap2_at = now(),
        status = 'approved', resolved_by = v_ten, resolved_at = now()
      where id = p_id;
      return jsonb_build_object('thanh_cong', true, 'cap', 2, 'xong', true,
        'thong_bao', 'Đã duyệt xong cả hai cấp.');
    end if;

    return jsonb_build_object('thanh_cong', true, 'cap', 1, 'xong', false,
      'thong_bao', 'Đã duyệt cấp Quản lý. Đang chuyển lên Giám đốc.');
  end if;

  -- ── ĐỒNG Ý CẤP 2 ──
  if not v_cap2 then
    return jsonb_build_object('thanh_cong', false,
      'thong_bao', 'Cấp Quản lý đã duyệt. Bước cuối thuộc về Giám đốc.');
  end if;

  update public.approval_requests set
    cap2_status = 'approved', cap2_by = v_toi, cap2_name = v_ten,
    cap2_at = now(), cap2_note = v_ghi,
    status = 'approved', resolved_by = v_ten, resolved_at = now()
  where id = p_id;

  return jsonb_build_object('thanh_cong', true, 'cap', 2, 'xong', true,
    'thong_bao', 'Đã duyệt xong. Đề xuất có hiệu lực.');
end;
$fn$;

grant execute on function public.sumi_duyet_de_xuat(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. ĐÓNG ĐƯỜNG GHI THẲNG
--
--    Sau bước này, trạng thái đơn CHỈ đổi được qua `sumi_duyet_de_xuat`.
--    Dù chính sách RLS cũ có lỏng tới đâu cũng không còn đường vòng, vì
--    quyền UPDATE đã bị rút khỏi vai trò `authenticated`.
--
--    ⚠️ Kèm theo bản này, `resolveApprovalRequest` trong src/lib/queries.js đã
--    được chuyển sang gọi RPC. Chạy migration mà quên đẩy mã nguồn thì màn
--    hình Duyệt cũ sẽ báo lỗi quyền — hai thứ phải đi cùng nhau.
-- ---------------------------------------------------------------------------
revoke update, delete, truncate on public.approval_requests from authenticated;
revoke all on public.approval_requests from anon;

alter table public.approval_requests enable row level security;

-- Đọc: của mình, hoặc của người mình phụ trách, hoặc là Giám đốc.
drop policy if exists "doc de xuat cua minh hoac cap duoi" on public.approval_requests;
create policy "doc de xuat cua minh hoac cap duoi" on public.approval_requests
  for select to authenticated
  using (
    requester_id = auth.uid()
    or public.sumi_la_cap2()
    or public.sumi_la_cap1_cua(requester_id)
  );

-- Gửi đơn: chỉ gửi được dưới tên chính mình. Cổng RPC vẫn là đường chính,
-- chính sách này là lớp chặn thứ hai phòng khi có mã cũ còn insert thẳng.
drop policy if exists "chi gui de xuat duoi ten minh" on public.approval_requests;
create policy "chi gui de xuat duoi ten minh" on public.approval_requests
  for insert to authenticated
  with check (requester_id = auth.uid() and public.is_approved());

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202608262340_de_xuat_hai_cap_duyet', 'completed', now(),
  'Locks down approval_requests and introduces the two-step approval ladder the owner asked for (staff -> unit manager -> director). Context: the table was created outside migrations so no file recorded its policies, and the Duyet screen changed status via a direct client UPDATE, meaning any logged-in user could approve their own leave request through the API regardless of what the UI showed. A black-box probe with the site public key confirmed anonymous access is already blocked by is_approved(), but authenticated write access could not be verified from source, so rather than guessing this revokes UPDATE/DELETE from authenticated entirely and routes every decision through sumi_duyet_de_xuat, a SECURITY DEFINER gate that resolves the caller level (unit manager via sumi_cung_don_vi_voi_toi, director via role), forbids self-approval for everyone including the director, stops the chain on rejection, and records who decided at each level with timestamps. sumi_gui_de_xuat takes the requester from auth.uid() so nobody can file under a colleague name. Adds cap1_*/cap2_* audit columns plus leave_scope/leave_to_date/leave_kind, backfills historical rows as single-step legacy approvals, and keeps every existing column untouched. MUST ship together with the queries.js change that points resolveApprovalRequest at the RPC.')
on conflict(migration_key) do update
  set status = 'completed', finished_at = now(), notes = excluded.notes;

commit;
