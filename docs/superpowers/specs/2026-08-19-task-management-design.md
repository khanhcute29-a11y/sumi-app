# Quản lý công việc (Task Management) — Design Spec

Date: 2026-08-19
Status: Approved by owner, ready for implementation planning

## Context

Third of four planned flows (see `docs/superpowers/specs/2026-08-18-shift-schedule-design.md`
and `2026-08-19-kitchen-stages-design.md` for the first two, already shipped).
Source: owner's Google Doc "Sumi Bakery - Master UI/UX & Complete Operational
Workflows V5".

Three categories of work, per the owner's doc:
1. **Công việc hằng ngày** (default/recurring) — owner-defined daily checklist.
2. **Công việc được giao** (assigned) — owner assigns to one or more staff, open-ended.
3. **Công việc phát sinh** (ad-hoc / self-initiated) — staff self-reports extra
   work via an order code (e.g. a bakery worker helping deliver when the
   shipper is overwhelmed).

Explicitly separate from the already-shipped kitchen multi-stage coordination
feature (`order_stages`) — that is the sequential, locked, kitchen-lead-run
production pipeline; this feature is generic assigned/default/self-initiated
work tracking, unrelated to order production stages.

No decline flow anywhere in this feature — assigned tasks can only be
exempted (reason + optional photo), routed through the existing approval
queue. Owner explicitly rejected building a reject/decline button.

## Data model

Two new tables plus one extension, chosen over a single mega-table (too many
nullable category-specific columns) or three fully separate one-off/adhoc
tables (assigned and adhoc share ~80% of their shape — duplicating tables
would duplicate query/screen/realtime code for no benefit). Daily/recurring
tasks get their own tables because their lifecycle (reset every day,
completion tracked per staff per date) is fundamentally different from a
one-off task with a deadline.

### `task_templates` (recurring daily checklist definitions)

```sql
create table task_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  station text check (station in ('bakery','nong','lanh','xuong41','xuong42')), -- null = applies to everyone
  active boolean not null default true,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
```

- Owner/admin create and edit templates (per-station or global — owner
  confirmed "both" when asked whether templates are per-station or shared).
- No deadline/late tracking on daily tasks — they reset every day; owner
  confirmed the only owner-side action is end-of-day confirmation, not a
  late flag.

### `task_completions` (daily instances, one row per template × staff × date)

```sql
create table task_completions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references task_templates(id) on delete cascade,
  staff_id uuid not null references profiles(id),
  date date not null default current_date,
  completed_at timestamptz,
  confirmed_by uuid references profiles(id),
  confirmed_at timestamptz,
  unique(template_id, staff_id, date)
);
```

- Row created (or upserted) lazily when a staff member first ticks a template
  on a given date, OR pre-generated — implementation plan should pick
  whichever is simpler given the query layer; either way the UI reads
  "today's" rows joined against active templates matching the staff's
  station (or global templates) to render the checklist, showing untouched
  templates as not-yet-completed even with no row yet.
- Owner confirms at end of day by setting `confirmed_by`/`confirmed_at` —
  confirmation is informational/audit only, does not block or unblock
  anything else in this feature.

### `tasks` (assigned + ad-hoc one-off work items)

```sql
create table tasks (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('assigned','adhoc')),
  title text not null,
  description text,
  order_code text,                    -- mainly for 'adhoc', optional for 'assigned'
  assignee_id uuid not null references profiles(id),
  deadline timestamptz,               -- meaningful for 'assigned'; null for 'adhoc'
  batch_id uuid,                      -- groups rows created together for one multi-assign action
  status text not null default 'open' check (status in ('open','done','exempted')),
  completed_at timestamptz,
  late boolean,                       -- computed once, at completion time, vs deadline
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
```

- **Assigned, multi-person**: owner picks N staff → N rows inserted sharing
  one `batch_id`; each staff completes their own row independently (owner
  confirmed "mỗi người được giao riêng, ai xong phần nấy" — not a
  shared-completion model).
- **Late flag**: computed once when a row transitions to `done` — compares
  `completed_at` to `deadline` at that moment and stores the boolean. An
  incomplete overdue task is not retroactively flagged; "trễ" only exists
  once the staff member checks it done late (owner's explicit choice).
- **Ad-hoc**: staff self-inserts their own row (`assignee_id` = self,
  `category = 'adhoc'`) with an order code and description. Recorded
  immediately, no approval gate — owner reviews/edits/deletes after the fact
  if something looks wrong (owner explicitly declined a pre-approval gate
  here).
- **Exemption** (assigned only): staff cannot decline; they can request
  exemption via a new `approval_requests` row, see below. On approval the
  task's `status` becomes `exempted`, excluding it from late/KPI counts.

### `approval_requests` extension

Add `'task_exemption'` to the existing `type` check constraint and a
nullable `task_id uuid references tasks(id)` column, reusing the existing
`reason`/`photo_url`/approve-reject flow and `ApprovalRequestsScreen.jsx` —
no new approval UI. On `resolveApprovalRequest(..., 'approved')` for a
`task_exemption` row, also set the linked `tasks.status = 'exempted'`.

## Trang Vận Chuyển (self-claim delivery) extension

`src/screens/ShippingScreen.jsx` already exists, gated to
`hasAnyRole(profile, ['shipper','owner','admin'])`. Extend rather than
rebuild:

- Any approved staff member can now see `cho_giao` orders in this screen.
- A non-shipper who wants to claim a delivery must first enter the last 4
  digits of the customer's phone number (`customers.phone`) to confirm
  they're looking at the right order, before the "Nhận giao" action becomes
  available — a lightweight verification step, not authentication.
- On claim: same effect as today (`status → 'dang_giao'`,
  `shipper_staff_name = <self>`), plus one `tasks` row is inserted
  (`category = 'adhoc'`, `order_code`, `assignee_id = self`) so the
  self-initiated delivery help shows up in this staff member's ad-hoc work
  history and feeds the future KPI "làm cùng nhau" / extra-work metrics.
- Existing shipper-role flow (already-assigned shipper acting on their own
  orders) is unchanged; the phone-verification step only applies to staff
  claiming an order that isn't already theirs.

## Screens & navigation

- New `src/screens/TasksScreen.jsx` ("Quản Lý Công Việc"), registered in
  `App.jsx` (import + tab map) and `Sidebar.jsx` (nav item), following the
  existing flat-screen-file convention.
  - **Staff view**: 3 sub-tabs (Hằng ngày / Được giao / Phát sinh), scoped to
    self only; a "Báo việc phát sinh" action (order code + description,
    inserts immediately); exemption request action on each assigned task.
  - **Owner/admin view**: per-staff tabs (reusing the Sidebar submenu
    pattern already used for KDS stations / warehouse branches), with
    filters by station / staff name / order code; a "Giao việc" creation
    flow supporting multi-select assignees; an end-of-day daily-checklist
    confirmation action; visibility into ad-hoc reports with edit/delete.
- Realtime: dedicated channels for `tasks` and `task_completions` following
  the existing `.channel().on('postgres_changes', ...)` pattern (see
  `order_stages` in `KdsScreen.jsx`), both tables added to the
  `supabase_realtime` publication in the migration file.

## Out of scope (explicitly deferred)

- KPI computation ("tổng việc được giao", "làm cùng nhau", etc.) — flow #4,
  comes after this ships, per the owner's stated ordering.
- Any reject/decline action on assigned tasks — intentionally not built.
- Pre-approval gate on ad-hoc reports — intentionally not built.
- Peer-to-peer task handoff/reassignment — not requested; owner can always
  edit `assignee_id` directly if needed later.

## Testing

- RLS: staff cannot mark another staff's task/completion done; staff cannot
  self-approve their own exemption request; ad-hoc self-insert only allows
  `assignee_id = auth.uid()`.
- Late-flag correctness: completing before vs after deadline sets `late`
  correctly; completing a task with no deadline never sets `late`.
- Multi-assign: N staff picked → N independent rows, one `batch_id`; one
  staff completing their row doesn't affect the others.
- Exemption approval flips `tasks.status` to `exempted` and excludes it from
  the staff's open/late task counts.
- Shipping self-claim: wrong last-4-digits blocks the claim action; correct
  digits unlock it and create the linked `adhoc` task row; existing
  shipper-role flow on their own orders is unaffected.
