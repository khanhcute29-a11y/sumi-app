-- QUẢN LÝ CÔNG VIỆC V2 — luồng nhận việc / báo xong / duyệt nghiệm thu + KPI.
--
-- HIỆN TRẠNG TRƯỚC KHI SỬA (đã quét ngày 26/08):
--   • Bảng `tasks` đã có: assignee_id, created_by, deadline, started_at,
--     completed_at, status ('open' | 'done' | 'exempted'), category
--     ('assigned' | 'adhoc' | 'order_work'), order_code, work_package_id.
--   • CHƯA có: accepted_at, approved_at, station_id, project_id, các bước con,
--     và không có bước DUYỆT NGHIỆM THU nào cả — thợ bấm xong là đóng luôn.
--   • Bảng `task_progress_reports` có note + percent nhưng KHÔNG có ảnh.
--
-- HAI THỨ TUYỆT ĐỐI KHÔNG ĐỘNG TỚI:
--   1. Trigger `notify_task_assigned` — nó chỉ chạy AFTER INSERT nên mọi thay
--      đổi trạng thái ở đây KHÔNG làm nó bắn lại. Giữ nguyên 100%.
--   2. Việc thuộc ĐƠN HÀNG (`category = 'order_work'`) đang lái luồng Bếp.
--      Luồng duyệt nghiệm thu ở đây CHỈ áp cho việc giao tay và việc phát sinh.
--      Đụng vào order_work là làm hỏng KDS và luồng bếp đang chạy tốt.
--
-- LUỒNG MỚI (chỉ cho 'assigned' và 'adhoc'):
--   open ──[thợ bấm Nhận việc]──> accepted ──[thợ bấm Xong]──> pending_approval
--        ──[quản lý Duyệt]──> done        (hoặc trả lại thành accepted)
begin;

-- ---------------------------------------------------------------------------
-- 1. Bổ sung cột cho bảng tasks
-- ---------------------------------------------------------------------------
alter table public.tasks add column if not exists accepted_at  timestamptz;
alter table public.tasks add column if not exists approved_at  timestamptz;
alter table public.tasks add column if not exists approved_by  uuid;
alter table public.tasks add column if not exists station_id   text;
alter table public.tasks add column if not exists project_id   uuid;
alter table public.tasks add column if not exists sub_steps    jsonb not null default '[]'::jsonb;
alter table public.tasks add column if not exists nhan_viec_tre boolean not null default false;
alter table public.tasks add column if not exists uu_tien      text;   -- cao | thuong | thap

create index if not exists tasks_station_idx  on public.tasks(station_id);
create index if not exists tasks_project_idx  on public.tasks(project_id);
create index if not exists tasks_status_idx   on public.tasks(status, deadline);

-- Ảnh trong luồng báo cáo tiến độ (mockup có ảnh đính kèm trong hội thoại).
alter table public.task_progress_reports add column if not exists image_url text;
alter table public.task_progress_reports add column if not exists author_role text;

-- Quản lý cũng phải trả lời được trong luồng báo cáo, không chỉ thợ.
drop policy if exists "ai doc duoc viec thi gop y duoc" on public.task_progress_reports;
create policy "ai doc duoc viec thi gop y duoc" on public.task_progress_reports
  for insert to authenticated
  with check (
    exists (select 1 from public.tasks t where t.id = task_id)
    and staff_id = auth.uid()
  );

-- ---------------------------------------------------------------------------
-- 2. Dự án (dành cho Giám đốc)
-- ---------------------------------------------------------------------------
create table if not exists public.projects(
  id          uuid primary key default gen_random_uuid(),
  ten         text not null,
  mo_ta       text,
  nhan        text,                       -- R&D, Sự kiện, Marketing...
  cac_khau    text[] not null default '{}',
  deadline    timestamptz,
  status      text not null default 'dang_chay',   -- dang_chay | hoan_thanh | huy
  created_by  uuid,
  created_at  timestamptz not null default now()
);
alter table public.projects enable row level security;

drop policy if exists "nhan vien duyet doc duoc du an" on public.projects;
create policy "nhan vien duyet doc duoc du an" on public.projects
  for select to authenticated using (public.is_approved());

drop policy if exists "giam doc tao du an" on public.projects;
create policy "giam doc tao du an" on public.projects
  for insert to authenticated
  with check (exists(select 1 from public.profiles p
    where p.id = auth.uid()
      and (p.role in ('owner','admin') or p.extra_roles && array['owner','admin'])));

drop policy if exists "giam doc sua du an" on public.projects;
create policy "giam doc sua du an" on public.projects
  for update to authenticated
  using (exists(select 1 from public.profiles p
    where p.id = auth.uid()
      and (p.role in ('owner','admin') or p.extra_roles && array['owner','admin'])));

-- ---------------------------------------------------------------------------
-- 3. Sổ KPI công việc — cuối tháng kế toán xuất bảng này là ra thưởng/phạt
-- ---------------------------------------------------------------------------
create table if not exists public.task_kpi_logs(
  id           uuid primary key default gen_random_uuid(),
  task_id      uuid references public.tasks(id) on delete cascade,
  staff_id     uuid,
  staff_name   text,
  su_kien      text not null,        -- nhan_viec | hoan_thanh
  diem         int  not null default 0,
  phut_lech    int,                  -- âm = sớm, dương = trễ
  ly_do        text,
  approved_by  uuid,
  created_at   timestamptz not null default now()
);
create index if not exists task_kpi_logs_staff_idx on public.task_kpi_logs(staff_id, created_at desc);
alter table public.task_kpi_logs enable row level security;

drop policy if exists "doc so kpi cong viec" on public.task_kpi_logs;
create policy "doc so kpi cong viec" on public.task_kpi_logs
  for select to authenticated using (public.is_approved());

-- ---------------------------------------------------------------------------
-- 4. Tự điền khâu cho việc mới, lấy từ hồ sơ người được giao
--    (BEFORE INSERT — không đụng gì tới trigger báo tin AFTER INSERT)
-- ---------------------------------------------------------------------------
create or replace function public.sumi_tu_dien_khau_viec()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if NEW.station_id is null and NEW.assignee_id is not null then
    select nullif(btrim(station), '') into NEW.station_id
    from public.profiles where id = NEW.assignee_id;
  end if;
  return NEW;
end;
$fn$;

drop trigger if exists sumi_tu_dien_khau_viec_tg on public.tasks;
create trigger sumi_tu_dien_khau_viec_tg
  before insert on public.tasks
  for each row execute function public.sumi_tu_dien_khau_viec();

-- ---------------------------------------------------------------------------
-- 5. Ai được duyệt nghiệm thu việc này?
--    Người giao việc · Bếp trưởng cùng khâu · Giám đốc/Quản lý.
-- ---------------------------------------------------------------------------
create or replace function public.sumi_duoc_duyet_viec(p_task_id uuid)
returns boolean language plpgsql stable security definer set search_path = public as $fn$
declare
  v_uid uuid := auth.uid();
  v_t   public.tasks%rowtype;
  v_p   public.profiles%rowtype;
  v_vai text[];
begin
  if v_uid is null then return false; end if;
  select * into v_t from public.tasks where id = p_task_id;
  if v_t.id is null then return false; end if;
  select * into v_p from public.profiles where id = v_uid;
  if v_p.id is null or not coalesce(v_p.approved, false) then return false; end if;

  v_vai := array_remove(array[v_p.role]::text[] || coalesce(v_p.extra_roles, '{}')::text[], null);
  if v_vai && array['owner', 'admin'] then return true; end if;
  if v_t.created_by = v_uid then return true; end if;
  if v_vai && array['kitchen_lead'] and v_t.station_id is not null
     and nullif(btrim(v_p.station), '') = v_t.station_id then return true; end if;

  return false;
end;
$fn$;

grant execute on function public.sumi_duoc_duyet_viec to authenticated;

-- ---------------------------------------------------------------------------
-- 6. THỢ: xác nhận nhận việc
-- ---------------------------------------------------------------------------
create or replace function public.sumi_nhan_viec(p_task_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_uid  uuid := auth.uid();
  v_t    public.tasks%rowtype;
  v_ten  text;
  v_phut int;
  v_tre  boolean;
begin
  if v_uid is null then raise exception 'Chưa đăng nhập.'; end if;

  select * into v_t from public.tasks where id = p_task_id for update;
  if v_t.id is null then raise exception 'Không tìm thấy công việc.'; end if;
  if v_t.assignee_id is distinct from v_uid then
    raise exception 'Việc này không giao cho bạn.';
  end if;
  if v_t.accepted_at is not null then
    return jsonb_build_object('thanh_cong', true, 'da_nhan_tu_truoc', true,
      'thong_bao', 'Bạn đã nhận việc này rồi.');
  end if;
  if v_t.status in ('done', 'exempted') then
    raise exception 'Việc đã đóng, không nhận được nữa.';
  end if;

  -- Nhận việc chậm quá 15 phút kể từ lúc được giao thì ghi nhận để trừ điểm.
  v_phut := floor(extract(epoch from (now() - v_t.created_at)) / 60)::int;
  v_tre  := v_phut > 15;

  update public.tasks
  set accepted_at   = now(),
      started_at    = coalesce(started_at, now()),   -- giữ tương thích màn hình cũ
      nhan_viec_tre = v_tre,
      -- Việc trong ĐƠN HÀNG giữ nguyên trạng thái để không đụng luồng Bếp.
      status        = case when category = 'order_work' then status else 'accepted' end,
      version       = version + 1
  where id = p_task_id;

  select full_name into v_ten from public.profiles where id = v_uid;
  begin
    insert into public.task_kpi_logs(task_id, staff_id, staff_name, su_kien, diem, phut_lech, ly_do)
    values (p_task_id, v_uid, coalesce(v_ten, '?'), 'nhan_viec',
            case when v_tre then -2 else 0 end, v_phut,
            case when v_tre then 'Nhận việc chậm ' || v_phut || ' phút'
                 else 'Nhận việc trong ' || v_phut || ' phút' end);
  exception when others then
    raise warning 'Ghi sổ KPI nhận việc bỏ qua lỗi: %', SQLERRM;
  end;

  return jsonb_build_object('thanh_cong', true, 'phut_nhan', v_phut, 'nhan_tre', v_tre,
    'thong_bao', case when v_tre then 'Đã nhận việc (chậm ' || v_phut || ' phút).'
                      else 'Đã nhận việc.' end);
end;
$fn$;

grant execute on function public.sumi_nhan_viec to authenticated;

-- ---------------------------------------------------------------------------
-- 7. THỢ: báo xong — CHƯA đóng việc, chuyển sang chờ quản lý duyệt
-- ---------------------------------------------------------------------------
create or replace function public.sumi_bao_xong_viec(
  p_task_id uuid, p_photo_url text default null, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_uid uuid := auth.uid();
  v_t   public.tasks%rowtype;
  v_ten text;
begin
  if v_uid is null then raise exception 'Chưa đăng nhập.'; end if;

  select * into v_t from public.tasks where id = p_task_id for update;
  if v_t.id is null then raise exception 'Không tìm thấy công việc.'; end if;
  if v_t.assignee_id is distinct from v_uid then
    raise exception 'Việc này không giao cho bạn.';
  end if;
  if v_t.category = 'order_work' then
    raise exception 'Việc thuộc đơn hàng phải hoàn thành ở màn hình Bếp, không đi qua luồng này.';
  end if;
  if v_t.status = 'done' then
    raise exception 'Việc đã được duyệt xong rồi.';
  end if;
  if v_t.accepted_at is null then
    raise exception 'Hãy bấm "Xác nhận nhận việc" trước khi báo xong.';
  end if;

  update public.tasks
  set completed_at = now(),
      status       = 'pending_approval',
      photo_url    = coalesce(nullif(p_photo_url, ''), photo_url),
      late         = (deadline is not null and now() > deadline),
      version      = version + 1
  where id = p_task_id;

  if coalesce(btrim(p_note), '') <> '' or coalesce(btrim(p_photo_url), '') <> '' then
    select full_name into v_ten from public.profiles where id = v_uid;
    begin
      insert into public.task_progress_reports(task_id, staff_id, note, percent, image_url, author_role)
      values (p_task_id, v_uid, nullif(btrim(p_note), ''), 100,
              nullif(btrim(p_photo_url), ''), 'tho');
    exception when others then
      raise warning 'Ghi báo cáo tiến độ bỏ qua lỗi: %', SQLERRM;
    end;
  end if;

  return jsonb_build_object('thanh_cong', true,
    'thong_bao', 'Đã báo xong. Đang chờ quản lý duyệt nghiệm thu.');
end;
$fn$;

grant execute on function public.sumi_bao_xong_viec to authenticated;

-- ---------------------------------------------------------------------------
-- 8. QUẢN LÝ: duyệt nghiệm thu — đây là chỗ chốt điểm KPI
-- ---------------------------------------------------------------------------
create or replace function public.sumi_duyet_viec(
  p_task_id uuid, p_dong_y boolean default true, p_ghi_chu text default null)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_uid   uuid := auth.uid();
  v_t     public.tasks%rowtype;
  v_ten   text;
  v_tho   text;
  v_phut  int;
  v_diem  int;
  v_ly_do text;
begin
  if v_uid is null then raise exception 'Chưa đăng nhập.'; end if;
  if not public.sumi_duoc_duyet_viec(p_task_id) then
    raise exception 'Bạn không có quyền duyệt việc này. Chỉ người giao việc, bếp trưởng cùng khâu, hoặc Giám đốc mới duyệt được.';
  end if;

  select * into v_t from public.tasks where id = p_task_id for update;
  if v_t.status <> 'pending_approval' then
    raise exception 'Việc này chưa ở trạng thái chờ duyệt.';
  end if;

  select full_name into v_ten from public.profiles where id = v_uid;
  select full_name into v_tho from public.profiles where id = v_t.assignee_id;

  if not p_dong_y then
    -- Trả lại cho thợ làm tiếp. Không chấm điểm, không đóng việc.
    update public.tasks
    set status = 'accepted', completed_at = null, version = version + 1
    where id = p_task_id;

    if coalesce(btrim(p_ghi_chu), '') <> '' then
      begin
        insert into public.task_progress_reports(task_id, staff_id, note, image_url, author_role)
        values (p_task_id, v_uid, 'Trả lại: ' || btrim(p_ghi_chu), null, 'quan_ly');
      exception when others then
        raise warning 'Ghi ghi chú trả lại bỏ qua lỗi: %', SQLERRM;
      end;
    end if;

    return jsonb_build_object('thanh_cong', true, 'da_duyet', false,
      'thong_bao', 'Đã trả lại việc cho thợ làm tiếp.');
  end if;

  -- Chấm điểm: so giờ báo xong với hạn chót.
  if v_t.deadline is not null and v_t.completed_at is not null then
    v_phut := floor(extract(epoch from (v_t.completed_at - v_t.deadline)) / 60)::int;
    if v_phut > 0 then
      v_diem := -5; v_ly_do := 'Xong trễ ' || v_phut || ' phút so với hạn';
    else
      v_diem := 10; v_ly_do := 'Xong sớm ' || abs(v_phut) || ' phút trước hạn';
    end if;
  else
    v_phut := null; v_diem := 0; v_ly_do := 'Việc không đặt hạn chót nên không chấm điểm';
  end if;

  -- Nhận việc chậm thì trừ thêm.
  if v_t.nhan_viec_tre then
    v_diem  := v_diem - 2;
    v_ly_do := v_ly_do || ' · nhận việc chậm';
  end if;

  update public.tasks
  set status      = 'done',
      approved_at = now(),
      approved_by = v_uid,
      version     = version + 1
  where id = p_task_id;

  begin
    insert into public.task_kpi_logs(task_id, staff_id, staff_name, su_kien, diem, phut_lech, ly_do, approved_by)
    values (p_task_id, v_t.assignee_id, coalesce(v_tho, '?'), 'hoan_thanh',
            v_diem, v_phut, v_ly_do, v_uid);
  exception when others then
    raise warning 'Ghi sổ KPI hoàn thành bỏ qua lỗi: %', SQLERRM;
  end;

  if coalesce(btrim(p_ghi_chu), '') <> '' then
    begin
      insert into public.task_progress_reports(task_id, staff_id, note, image_url, author_role)
      values (p_task_id, v_uid, btrim(p_ghi_chu), null, 'quan_ly');
    exception when others then
      raise warning 'Ghi ghi chú duyệt bỏ qua lỗi: %', SQLERRM;
    end;
  end if;

  return jsonb_build_object('thanh_cong', true, 'da_duyet', true,
    'diem', v_diem, 'phut_lech', v_phut, 'ly_do', v_ly_do,
    'thong_bao', 'Đã duyệt xong. ' || v_ly_do || ' (' ||
      case when v_diem >= 0 then '+' else '' end || v_diem || ' điểm).');
end;
$fn$;

grant execute on function public.sumi_duyet_viec to authenticated;

-- ---------------------------------------------------------------------------
-- 9. THỢ: cập nhật các bước con
-- ---------------------------------------------------------------------------
create or replace function public.sumi_luu_buoc_con(p_task_id uuid, p_buoc jsonb)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_uid uuid := auth.uid();
  v_t   public.tasks%rowtype;
begin
  if v_uid is null then raise exception 'Chưa đăng nhập.'; end if;
  select * into v_t from public.tasks where id = p_task_id;
  if v_t.id is null then raise exception 'Không tìm thấy công việc.'; end if;
  if v_t.assignee_id is distinct from v_uid and not public.sumi_duoc_duyet_viec(p_task_id) then
    raise exception 'Chỉ người làm việc này hoặc quản lý mới sửa được các bước.';
  end if;
  if jsonb_typeof(coalesce(p_buoc, '[]'::jsonb)) <> 'array' then
    raise exception 'Danh sách bước con phải là một mảng.';
  end if;

  update public.tasks set sub_steps = coalesce(p_buoc, '[]'::jsonb), version = version + 1
  where id = p_task_id;

  return jsonb_build_object('thanh_cong', true);
end;
$fn$;

grant execute on function public.sumi_luu_buoc_con to authenticated;

-- ---------------------------------------------------------------------------
-- 10. Bảng tổng hợp cho Giám đốc (tránh kéo cả bảng tasks về máy)
-- ---------------------------------------------------------------------------
create or replace function public.sumi_tong_hop_cong_viec(p_khau text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare v_r jsonb;
begin
  if auth.uid() is null then
    return jsonb_build_object('dang_lam', 0, 'qua_han', 0, 'cho_duyet', 0, 'hoan_thanh', 0);
  end if;
  select jsonb_build_object(
    'dang_lam',   count(*) filter (where status in ('open','accepted')),
    'qua_han',    count(*) filter (where status not in ('done','exempted')
                                     and deadline is not null and deadline < now()),
    'cho_duyet',  count(*) filter (where status = 'pending_approval'),
    'hoan_thanh', count(*) filter (where status = 'done')
  ) into v_r
  from public.tasks
  where category in ('assigned', 'adhoc')
    and (p_khau is null or station_id = p_khau);
  return coalesce(v_r, jsonb_build_object('dang_lam',0,'qua_han',0,'cho_duyet',0,'hoan_thanh',0));
end;
$fn$;

grant execute on function public.sumi_tong_hop_cong_viec to authenticated;

-- ---------------------------------------------------------------------------
-- 11. GIÁM ĐỐC: nhắc quản lý về một việc quá hạn
--     Dùng lại đúng `notify_push` mà hệ thống đang dùng — KHÔNG sửa hàm đó.
-- ---------------------------------------------------------------------------
create or replace function public.sumi_nhac_nho_viec(p_task_id uuid, p_loi_nhan text default null)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_uid  uuid := auth.uid();
  v_p    public.profiles%rowtype;
  v_vai  text[];
  v_t    public.tasks%rowtype;
  v_ai   uuid;
  v_ten  text;
begin
  if v_uid is null then raise exception 'Chưa đăng nhập.'; end if;
  select * into v_p from public.profiles where id = v_uid;
  v_vai := array_remove(array[v_p.role]::text[] || coalesce(v_p.extra_roles,'{}')::text[], null);
  if not (v_vai && array['owner','admin']) then
    raise exception 'Chỉ Giám đốc mới gửi lời nhắc này.';
  end if;

  select * into v_t from public.tasks where id = p_task_id;
  if v_t.id is null then raise exception 'Không tìm thấy công việc.'; end if;

  -- Nhắc NGƯỜI GIAO VIỆC trước; không có thì nhắc bếp trưởng của khâu đó.
  v_ai := v_t.created_by;
  if v_ai is null and v_t.station_id is not null then
    select id into v_ai from public.profiles
    where nullif(btrim(station),'') = v_t.station_id
      and (role = 'kitchen_lead' or extra_roles && array['kitchen_lead'])
      and approved limit 1;
  end if;
  if v_ai is null then
    raise exception 'Việc này chưa có ai phụ trách để nhắc.';
  end if;

  select full_name into v_ten from public.profiles where id = v_uid;

  perform public.notify_push(
    '🚨 Giám đốc nhắc việc quá hạn',
    coalesce(v_t.title, 'Có việc quá hạn cần xử lý'),
    '/tasks/' || p_task_id::text,
    v_ai);

  begin
    insert into public.task_progress_reports(task_id, staff_id, note, author_role)
    values (p_task_id, v_uid,
            '🚨 ' || coalesce(v_ten,'Giám đốc') || ' nhắc: ' ||
            coalesce(nullif(btrim(p_loi_nhan),''), 'việc này đã quá hạn, cần xử lý ngay.'),
            'quan_ly');
  exception when others then
    raise warning 'Ghi lời nhắc vào luồng báo cáo bỏ qua lỗi: %', SQLERRM;
  end;

  return jsonb_build_object('thanh_cong', true, 'nhac_ai', v_ai,
    'thong_bao', 'Đã gửi lời nhắc tới người phụ trách.');
end;
$fn$;

grant execute on function public.sumi_nhac_nho_viec to authenticated;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202608260100_quan_ly_cong_viec_v2', 'completed', now(),
  'Task management V2: adds accepted_at/approved_at/station_id/project_id/sub_steps to tasks, images and author role to task_progress_reports, a projects table, a task_kpi_logs ledger, and RPCs for accept / submit-for-approval / approve-or-reject / save sub-steps / director summary. The approval step is deliberately scoped to assigned and adhoc tasks - order_work tasks keep driving the kitchen flow untouched. The AFTER INSERT notify_task_assigned trigger is left completely alone, so push and sound for new assignments are unaffected.')
on conflict(migration_key) do update
  set status = 'completed', finished_at = now(), notes = excluded.notes;

commit;
