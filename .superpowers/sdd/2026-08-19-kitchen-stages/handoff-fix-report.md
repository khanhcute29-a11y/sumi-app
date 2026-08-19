# Fix: order_stages UPDATE `with check` regression (Nhường lại cho...)

## File changed
`supabase/migrate_order_stages.sql` (not yet run in production — edited in place, no separate migration file needed)

## Bug
A prior review round added a `with check` clause to the `order_stages` UPDATE RLS
policy ("assignee or lead update order_stages"), copied verbatim from the `using`
clause:

```sql
with check (
  assignee_id = auth.uid()
  or exists (select 1 from profiles where id = auth.uid() and (role in ('kitchen_lead','owner','admin') or extra_roles && array['kitchen_lead','owner','admin']))
)
```

`with check` in Postgres RLS evaluates against the NEW row, not the OLD row. For
the "Nhường lại cho..." (hand-off) flow, a regular (non-lead) staff member who is
the current assignee reassigns their own in-progress stage to a colleague. In that
UPDATE, the NEW row's `assignee_id` is the colleague's id, not the actor's — so
`assignee_id = auth.uid()` fails in `with check`, and since the actor isn't
kitchen_lead/owner/admin either, the second branch also fails. The UPDATE is
rejected with an RLS violation, breaking hand-off for the exact people it's meant
for (regular staff can no longer hand off; only leads/owner/admin can).

## Fix
Changed the `with check` clause to a simple authenticated + approved check,
since `using` already gates which rows a regular staffer can touch (only rows
where they are the current assignee, or where they're a lead/owner/admin) —
by the time a row passes `using`, the actor is already proven legitimate for
that row. Row/column-level restriction on `with check` was explicitly called
out as out of scope for this fix round.

```sql
using (
  assignee_id = auth.uid()
  or exists (select 1 from profiles where id = auth.uid() and (role in ('kitchen_lead','owner','admin') or extra_roles && array['kitchen_lead','owner','admin']))
)
with check (auth.role() = 'authenticated' and public.is_approved());
```

The `using` clause was left completely unchanged — it is the real authorization
gate and was already correct.

## Verification
- `npm run build` succeeded (SQL-only change; build unaffected as expected).
- `git status` confirmed only `supabase/migrate_order_stages.sql` was touched.
