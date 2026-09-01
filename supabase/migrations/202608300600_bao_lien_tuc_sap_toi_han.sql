-- Báo liên tục khi sắp/đã tới hạn việc — vá đúng 2 vấn đề đã xác minh:
--
-- 1. BUG THẬT: process_task_reminders() (migration 202608230027) đang insert
--    tiêu đề thông báo bị LỖI ENCODING ("Äáº¿n giá» lÃ m viá»‡c" thay vì
--    "Đến giờ làm việc", "Checklist cáº§n lÃ m" thay vì "Checklist cần làm")
--    — sửa lại đúng chữ, KHÔNG đổi logic gì khác của hàm này.
--
-- 2. THIẾU HẲN: "reminder_at" (nhắc 1 lần đúng giờ đã hẹn) và
--    sumi_nhac_nho_viec (Giám đốc bấm tay 1 lần) đã có sẵn, nhưng KHÔNG có
--    cơ chế tự động BÁO LẶP LẠI khi 1 việc sắp/đã tới hạn chót (`deadline`)
--    mà thợ chưa xử lý xong. Thêm hàm mới process_task_deadline_alerts(),
--    chạy CHUNG job pg_cron mỗi phút đã có sẵn (không tạo job mới) — báo cho
--    THỢ (người cần xử lý) mỗi 10 phút, từ 30 phút trước hạn cho tới khi
--    việc được đánh dấu xong/miễn trừ. Không giới hạn quá hạn bao lâu thì
--    dừng — đúng yêu cầu "báo liên tục", thợ chỉ cần bấm xong việc là hết.

begin;

-- notifications.sound_key CHECK — thêm 'task_deadline' cho giai điệu riêng,
-- khẩn hơn task_progress để phân biệt bằng tai.
alter table public.notifications drop constraint if exists notifications_sound_key_check;
alter table public.notifications add constraint notifications_sound_key_check
  check (sound_key = any (array['new_order_voice','cash_complete','ting','silent','task_progress','task_deadline']));

-- Sửa lỗi encoding tiêu đề — KHÔNG đổi logic, chỉ đổi 2 chuỗi tiếng Việt.
create or replace function public.process_task_reminders()
returns integer language plpgsql security definer set search_path=public as $$
declare v_count integer:=0;v_added integer:=0;v_today date:=(now() at time zone 'Asia/Bangkok')::date;v_dow integer:=extract(dow from (now() at time zone 'Asia/Bangkok'));
begin
 insert into public.notifications(event_key,recipient_profile_id,notification_type,sound_key,title,body,entity_type,entity_id,deep_link)
 select 'task-reminder:'||t.id,t.assignee_id,'task_reminder','ting','Đến giờ làm việc',t.title,'task',t.id,'/tasks/'||t.id
 from public.tasks t where t.status='open' and t.reminder_at is not null and t.reminder_at<=now()
 on conflict(event_key) do nothing;
 get diagnostics v_count=row_count;
 insert into public.notifications(event_key,recipient_profile_id,notification_type,sound_key,title,body,entity_type,entity_id,deep_link)
 select 'todo-reminder:'||tt.id||':'||p.id||':'||v_today,p.id,'task_reminder','ting','Checklist cần làm',tt.title,'task_template',tt.id,'/tasks'
 from public.task_templates tt join public.profiles p on p.approved and p.active
  and (tt.assignee_id=p.id or (tt.assignee_id is null and (tt.station is null or tt.station=p.station)))
 where tt.active and tt.scheduled_time is not null
  and ((v_today+tt.scheduled_time) at time zone 'Asia/Bangkok')-make_interval(mins=>tt.remind_minutes)<=now()
  and (tt.recurrence='daily' or (tt.recurrence='weekly' and v_dow::smallint=any(tt.weekdays)) or (tt.recurrence='monthly' and tt.day_of_month=extract(day from v_today)))
  and not exists(select 1 from public.task_completions tc where tc.template_id=tt.id and tc.staff_id=p.id and tc.date=v_today and tc.completed_at is not null)
 on conflict(event_key) do nothing;
 get diagnostics v_added=row_count;
 v_count:=v_count+v_added;
 return v_count;
end $$;

-- MỚI: báo liên tục (mỗi 10 phút) cho THỢ khi việc sắp/đã tới hạn mà chưa
-- xong. event_key có bucket 10-phút (epoch/600) nên tự lặp lại theo chu kỳ,
-- không phải chỉ 1 lần như reminder_at. Dừng hẳn khi status chuyển
-- done/exempted (điều kiện WHERE không còn khớp nữa).
create or replace function public.process_task_deadline_alerts()
returns integer language plpgsql security definer set search_path=public as $$
declare v_count integer:=0; v_bucket bigint := floor(extract(epoch from now())/600)::bigint;
begin
 insert into public.notifications(event_key,recipient_profile_id,notification_type,severity,sound_key,title,body,entity_type,entity_id,deep_link)
 select 'task-deadline:'||t.id||':'||v_bucket, t.assignee_id, 'task_deadline_alert',
   case when t.deadline<now() then 'urgent' else 'warning' end,
   'task_deadline',
   case when t.deadline<now() then '🚨 Việc đã QUÁ HẠN' else '⏰ Việc sắp tới hạn' end,
   t.title, 'task', t.id, '/tasks/'||t.id
 from public.tasks t
 where t.status not in ('done','exempted')
   and t.deleted_at is null
   and t.deadline is not null
   and t.deadline <= now() + interval '30 minutes'
   and t.assignee_id is not null
 on conflict(event_key) do nothing;
 get diagnostics v_count=row_count;
 return v_count;
end $$;

-- Chạy CHUNG job pg_cron mỗi phút đã có (không tạo cron job mới).
create or replace function public.process_task_reminders_and_deadlines()
returns integer language plpgsql security definer set search_path=public as $$
declare v1 integer; v2 integer;
begin
 v1 := public.process_task_reminders();
 v2 := public.process_task_deadline_alerts();
 return coalesce(v1,0) + coalesce(v2,0);
end $$;

do $$ begin
 if exists(select 1 from cron.job where jobname='sumi-task-reminders-every-minute') then
  perform cron.unschedule('sumi-task-reminders-every-minute');
 end if;
 perform cron.schedule('sumi-task-reminders-every-minute','* * * * *','select public.process_task_reminders_and_deadlines()');
end $$;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202608300600_bao_lien_tuc_sap_toi_han', 'completed', now(),
  'Sửa lỗi encoding tiêu đề nhắc việc. Thêm process_task_deadline_alerts() báo lặp lại mỗi 10 phút cho thợ khi việc sắp (30p)/đã quá hạn mà chưa xong, chạy chung cron job phút hiện có.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
