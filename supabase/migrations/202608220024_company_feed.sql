-- SUMI APP M24 — Bảng tin công ty và Nhật ký SUMI.
begin;
create table if not exists public.company_feed_posts(
 id uuid primary key default gen_random_uuid(),author_id uuid not null references public.profiles(id),author_name text not null,
 post_type text not null check(post_type in ('announcement','daily')),title text,body text not null,media jsonb,
 severity text not null default 'normal' check(severity in ('normal','important','urgent')),pinned boolean not null default false,
 starts_at timestamptz not null default now(),expires_at timestamptz,safe_for_company boolean not null default true,
 deleted_at timestamptz,created_at timestamptz not null default now()
);
create table if not exists public.company_feed_comments(id uuid primary key default gen_random_uuid(),post_id uuid not null references public.company_feed_posts(id) on delete cascade,author_id uuid not null references public.profiles(id),author_name text not null,body text not null,media jsonb,deleted_at timestamptz,created_at timestamptz not null default now());
create table if not exists public.company_feed_reactions(post_id uuid not null references public.company_feed_posts(id) on delete cascade,profile_id uuid not null references public.profiles(id) on delete cascade,reaction text not null default 'heart',created_at timestamptz not null default now(),primary key(post_id,profile_id));
create table if not exists public.company_announcement_acks(post_id uuid not null references public.company_feed_posts(id) on delete cascade,profile_id uuid not null references public.profiles(id) on delete cascade,acknowledged_at timestamptz not null default now(),primary key(post_id,profile_id));
alter table public.company_feed_posts enable row level security;alter table public.company_feed_comments enable row level security;alter table public.company_feed_reactions enable row level security;alter table public.company_announcement_acks enable row level security;
create policy "staff read feed" on public.company_feed_posts for select using(public.is_approved());
create policy "staff post daily director announcement" on public.company_feed_posts for insert with check(author_id=auth.uid() and public.is_approved() and (post_type='daily' or public.is_business_director()));
create policy "author or director update feed" on public.company_feed_posts for update using(author_id=auth.uid() or public.is_business_director()) with check(author_id=auth.uid() or public.is_business_director());
create policy "staff read feed comments" on public.company_feed_comments for select using(public.is_approved());
create policy "staff add feed comments" on public.company_feed_comments for insert with check(author_id=auth.uid() and public.is_approved());
create policy "author or director update comments" on public.company_feed_comments for update using(author_id=auth.uid() or public.is_business_director()) with check(author_id=auth.uid() or public.is_business_director());
create policy "staff read reactions" on public.company_feed_reactions for select using(public.is_approved());
create policy "staff react" on public.company_feed_reactions for insert with check(profile_id=auth.uid() and public.is_approved());
create policy "staff remove own reaction" on public.company_feed_reactions for delete using(profile_id=auth.uid());
create policy "staff read announcement acks" on public.company_announcement_acks for select using(profile_id=auth.uid() or public.is_business_director());
create policy "staff acknowledge" on public.company_announcement_acks for insert with check(profile_id=auth.uid() and public.is_approved());
grant select,insert,update on public.company_feed_posts,public.company_feed_comments to authenticated;grant select,insert,delete on public.company_feed_reactions to authenticated;grant select,insert on public.company_announcement_acks to authenticated;
create or replace function public.broadcast_company_announcement() returns trigger language plpgsql security definer set search_path=public as $$ begin
 if new.post_type='announcement' then insert into public.notifications(event_key,recipient_profile_id,notification_type,severity,sound_key,title,body,entity_type,entity_id,deep_link)
 select 'company-feed:'||new.id||':'||p.id,p.id,'company_announcement',case when new.severity='urgent' then 'urgent' else 'info' end,'ting',coalesce(new.title,'Thông báo công ty'),left(new.body,120),'company_feed',new.id,'/company-feed/'||new.id from public.profiles p where p.approved=true and p.active is distinct from false and p.id<>new.author_id on conflict(event_key) do nothing;end if;return new;end $$;
revoke all on function public.broadcast_company_announcement() from public,anon,authenticated;
drop trigger if exists trg_broadcast_company_announcement on public.company_feed_posts;create trigger trg_broadcast_company_announcement after insert on public.company_feed_posts for each row execute function public.broadcast_company_announcement();
insert into public.migration_runs(migration_key,status,finished_at,notes) values('202608220024_company_feed','completed',now(),'Company announcements with acknowledgement and social daily feed.') on conflict(migration_key) do update set status='completed',finished_at=now(),notes=excluded.notes;
commit;
