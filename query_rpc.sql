select 
  p.proname as function_name,
  pg_get_functiondef(p.oid) as function_def
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' 
  and p.proname = 'accept_delivery_assignment_flexible'
limit 1;
