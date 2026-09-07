-- Sếp báo mấy ngày nay không còn nhận thông báo "báo xong việc" (chuông +
-- toast) dù nhân viên vẫn báo xong bình thường. Xác minh trực tiếp trên DB
-- thật (pg_publication_tables) phát hiện: bảng public.notifications KHÔNG
-- nằm trong publication "supabase_realtime" — trong khi App.jsx (channel
-- 'notifications-toast-global') lắng nghe postgres_changes INSERT ngay trên
-- bảng này để phát chuông/toast cho task_progress/expense_claim/
-- salary_advance/chat_mention/task_deadline_alert/star_reward/star_penalty/
-- company_announcement. Không migration nào trong repo từng thêm bảng này
-- vào publication — cột notifications vẫn được ghi đúng (sumi_bao_xong_viec
-- vẫn insert), chỉ là Postgres chưa bao giờ phát sự kiện này ra ngoài qua
-- Realtime nên client không nhận được, im lặng không báo lỗi ở đâu cả.
--
-- RLS trên notifications đã đúng phạm vi (chỉ recipient_profile_id=auth.uid()
-- hoặc cùng đơn vị/vai trò mới đọc được — đã xác minh qua pg_policies), nên
-- bật Realtime an toàn, không lộ thông báo của người khác.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '30s';

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609071400_bat_realtime_notifications', 'completed', now(),
  'Them public.notifications vao publication supabase_realtime - bang nay chua tung duoc bat Realtime trong bat ky migration nao, lam channel notifications-toast-global o App.jsx (chuong/toast bao xong viec, chi tieu, tam ung, mention, sao thuong/phat...) khong bao gio nhan duoc su kien du du lieu van ghi dung vao bang.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
