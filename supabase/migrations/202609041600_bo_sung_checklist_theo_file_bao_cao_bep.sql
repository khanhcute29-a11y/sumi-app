-- Bổ sung các mục checklist còn THIẾU so với file "bao-cao-tung-bep 2026.xlsx"
-- (mẫu Báo cáo sản xuất từng bếp mà tiệm đang dùng bản giấy).
--
-- Đối chiếu thật ngày 04/09/2026 giữa file và bảng task_templates:
--   • Bếp kem (station 'lanh')      : có 12/13 mục — thiếu 1 (phần A6).
--   • Bếp bánh nóng (station 'nong'): có  8/14 mục — thiếu 6 (toàn bộ phần F
--     vệ sinh cuối ca, trừ 2 mục rửa dụng cụ/rửa mâm đã có).
--   • Bếp macaron (station 'xuong41'): có 0/10 mục — CHƯA khai báo dòng nào.
--
-- Giữ nguyên khuôn mẫu của các mục đang chạy: recurrence 'daily', source
-- 'manager', locked, kpi_diem 1, remind_minutes 15. Mục ĐẦU ca có
-- scheduled_time (để nhắc chuông đúng giờ), mục CUỐI ca để trống giống hệt
-- các mục vệ sinh đã có — không tự bịa giờ tan ca cho từng bếp.
--
-- Idempotent: chạy lại nhiều lần không tạo trùng (lọc bằng not exists theo
-- cặp station + title).
begin;
set local lock_timeout = '10s';
set local statement_timeout = '30s';

with nguoi_tao as (
  select coalesce(
    (select created_by from public.task_templates where created_by is not null limit 1),
    (select id from public.profiles where role = 'owner' and approved order by created_at limit 1)
  ) as id
),
can_them(station, title, scheduled_time) as (
  values
    -- ── Bếp kem (A6) ────────────────────────────────────────────────────────
    ('lanh',    'Vệ sinh bàn decor trước làm',            time '06:50'),

    -- ── Bếp bánh nóng (F30–F35) ─────────────────────────────────────────────
    ('nong',    'Vệ sinh máy trộn + máy cán',             null::time),
    ('nong',    'Vệ sinh lò nướng',                       null::time),
    ('nong',    'Vệ sinh máy đóng gói',                   null::time),
    ('nong',    'Vệ sinh bàn thao tác + sàn',             null::time),
    ('nong',    'Đổ rác + sắp NVL FIFO',                  null::time),
    ('nong',    'Tắt máy + ngắt gas/điện',                null::time),

    -- ── Bếp macaron — phần A chuẩn bị ───────────────────────────────────────
    ('xuong41', 'Chấm công đúng giờ',                     time '05:50'),
    ('xuong41', 'Đồng phục đầy đủ',                       time '06:00'),
    ('xuong41', 'Rửa tay 6 bước',                         time '06:10'),
    ('xuong41', 'Kiểm tra lò / nhiệt độ / độ ẩm',         time '06:30'),
    ('xuong41', 'Chuẩn bị NVL (bột hạnh nhân, đường xay...)', time '06:30'),

    -- ── Bếp macaron — phần E vệ sinh ────────────────────────────────────────
    ('xuong41', 'Rửa dụng cụ (bắt bột, spatula, bowl)',   null::time),
    ('xuong41', 'Vệ sinh máy đánh trứng',                 null::time),
    ('xuong41', 'Vệ sinh lò nướng',                       null::time),
    ('xuong41', 'Vệ sinh bàn + sàn',                      null::time),
    ('xuong41', 'Sắp NVL / FIFO / đậy nắp',               null::time)
)
insert into public.task_templates
  (title, station, active, created_by, assignee_id, recurrence, weekdays,
   scheduled_time, remind_minutes, source, locked, kpi_diem)
select c.title, c.station, true, n.id, null, 'daily', array[]::smallint[],
       c.scheduled_time, 15, 'manager', true, 1
from can_them c cross join nguoi_tao n
where not exists (
  select 1 from public.task_templates t
  where t.station = c.station and t.title = c.title and t.active
);

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609041600_bo_sung_checklist_theo_file_bao_cao_bep', 'completed', now(),
  'Bổ sung 17 mục checklist thiếu so với file bao-cao-tung-bep 2026.xlsx: lanh 1 mục, nong 6 mục, xuong41 (macaron) 10 mục — trước đó macaron chưa có mục nào.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
