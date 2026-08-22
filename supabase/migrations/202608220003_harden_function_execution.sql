-- SUMI APP M03 — restrict internal SECURITY DEFINER functions.
-- Trigger functions must not be callable through the Data API.

begin;

alter function public.handle_new_user() set search_path = public;

revoke all on function public.enforce_order_self_claim_columns() from public, anon, authenticated;
revoke all on function public.enforce_order_update_permissions() from public, anon, authenticated;
revoke all on function public.enforce_order_update_rules() from public, anon, authenticated;
revoke all on function public.enforce_task_completion_update_rules() from public, anon, authenticated;
revoke all on function public.enforce_task_update_rules() from public, anon, authenticated;
revoke all on function public.fn_audit_log() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.prevent_self_role_change() from public, anon, authenticated;
revoke all on function public.recompute_customer_trust_score() from public, anon, authenticated;
revoke all on function public.restrict_admin_profile_updates() from public, anon, authenticated;

revoke all on function public.is_approved() from public, anon;
grant execute on function public.is_approved() to authenticated;

revoke all on function public.profile_has_legacy_role(text[]) from public, anon;
revoke all on function public.has_active_permission(text, text, uuid) from public, anon;
revoke all on function public.is_business_director() from public, anon;

grant execute on function public.profile_has_legacy_role(text[]) to authenticated;
grant execute on function public.has_active_permission(text, text, uuid) to authenticated;
grant execute on function public.is_business_director() to authenticated;

insert into public.migration_runs (migration_key, status, finished_at, notes)
values (
  '202608220003_harden_function_execution',
  'completed',
  now(),
  'Revoked Data API execution of internal trigger functions and fixed handle_new_user search_path.'
)
on conflict (migration_key) do update
set status = 'completed',
    finished_at = coalesce(public.migration_runs.finished_at, excluded.finished_at),
    notes = excluded.notes;

commit;
