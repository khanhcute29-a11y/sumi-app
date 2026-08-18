# Luồng 1 — Thời khoá biểu & Ca làm việc theo tuần

Date: 2026-08-18

## Goal

A weekly, forward-looking work schedule per station (Bakery, Bếp Nóng, Bếp Lạnh,
Xưởng 41, Xưởng 42) — who works morning/afternoon on which day. Owner-editable;
staff see only their own station. A cell lights up green when that person has
actually checked in today, red if their leave for that date was approved.
This is new — today's `shift_logs`/`shift_configs` only support reactive
same-day check-in/out, with no forward-looking roster.

## 1. Data model

### New table: `shift_schedule`

One row = one person assigned to one station, on one date, for one shift.

```sql
create table if not exists shift_schedule (
  id uuid primary key default gen_random_uuid(),
  station text not null check (station in ('bakery','nong','lanh','xuong41','xuong42')),
  work_date date not null,
  shift_config_id uuid not null references shift_configs(id) on delete cascade,
  staff_id uuid not null references profiles(id) on delete cascade,
  staff_name text not null,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Bakery: at most 1 person per station+date+shift.
create unique index if not exists uniq_shift_schedule_bakery_single
  on shift_schedule (station, work_date, shift_config_id)
  where station = 'bakery';

-- Every other station: multiple people allowed, but not the same person twice.
create unique index if not exists uniq_shift_schedule_no_dup_staff
  on shift_schedule (station, work_date, shift_config_id, staff_id);
```

Reuses `shift_configs` (existing table, owner-editable shift labels/start times —
"Ca sáng"/"Ca chiều") instead of inventing a new slot enum, so the schedule and
the existing check-in flow always agree on what a "ca" is.

### New column: `profiles.station`

```sql
alter table profiles add column if not exists station text
  check (station in ('bakery','nong','lanh','xuong41','xuong42'));
```

The station a staff member belongs to for schedule-*visibility* purposes
(distinct from role — a `kitchen` or `bakery` role doesn't imply a station
today). Owner sets this in the existing Nhân Viên (Staff) screen, next to the
role picker. Nullable — owner/admin/other roles (shipper, accountant, sale,
warehouse) don't need one and never see this screen.

### `approval_requests` changes (new leave-request type)

```sql
alter table approval_requests drop constraint if exists approval_requests_type_check;
alter table approval_requests add constraint approval_requests_type_check
  check (type in ('order_edit','order_cancel','order_delete','shift_recheck','leave_request'));

alter table approval_requests add column if not exists leave_date date;
```

A schedule-linked leave request is a new `approval_requests` row with
`type = 'leave_request'`, `leave_date` = the day being requested off,
`requester_id`/`requester_name` = the staff member, `reason`/`photo_url`
reused as-is (same fields incident/order-edit requests already use).

**This is separate from the existing "xin nghỉ đột xuất" button on the
Ca Làm Việc check-in screen** (`ShiftsScreen.jsx`'s `addLeaveRequest`,
which instantly logs a `shift_logs` row with no approval — that's a
same-day, already-happening declaration and stays untouched). The new
approval-gated leave request is specifically for marking a future
*scheduled* day red on the weekly grid, and requires the owner to approve
it first — per your requirement that schedule-linked leave needs sign-off.

## 2. Screens

### New tab inside the existing `ShiftsScreen.jsx`

The mockup's "Lịch Làm Việc" and this repo's existing "Ca Làm Việc" nav
item are the same concept, so this is a new `Tabs` entry inside
`ShiftsScreen.jsx` ("Chấm công" | "Lịch tuần") rather than a second,
confusingly-similar sidebar item — it reuses the screen's existing role
gating and imports.

**Staff view** (no station selector shown): a single week grid for their
own `profiles.station`. Each cell: person's name; green background +
border if they have an open (no-checkout) `shift_logs` checkin row for
that date; red if an *approved* `approval_requests` (type='leave_request',
leave_date=that date, requester_id=that person) exists; otherwise neutral.
Read-only — staff cannot edit the grid.

**Owner/admin view**: station-selector chips (5 stations) above the same
grid. Click an empty or filled cell to open a small picker: search/select
staff (any approved profile, not filtered by role — owner's judgment),
add them to that station+date+shift. Bakery station's picker enforces
"already 1 person assigned" by disabling further adds once one exists
(mirrors the DB constraint, with a friendly message rather than a raw
insert error). Click an assigned name to remove them from that slot —
this is how the owner covers a sudden absence or reassigns a shift; no
separate "shift swap" approval workflow in v1 (see Out of scope).

### Leave request (staff-facing)

A "Xin nghỉ ngày này" button on a future date's cell (only shown for the
viewer's own name, only for dates that don't already have a pending/approved
request) opens a small form: reason (text) + optional photo, matching the
existing `IncidentReportModal`/`ProductionLogModal` shape. Submits via
`createApprovalRequest({ type: 'leave_request', leaveDate, reason, photoUrl,
requesterId, requesterName, requesterRole })`. Cell shows a neutral
"pending" indicator (not yet red) until the owner approves it in the
existing **Yêu Cầu Duyệt** screen — reusing that screen's existing
approve/reject UI, just adding a new case for how a `leave_request` row
renders there (staff name + date + reason/photo, same layout style as the
other three existing request types).

## 3. Query functions (`src/lib/queries.js`)

- `fetchShiftSchedule({ station, from, to })` → rows from `shift_schedule` in
  range, joined with `shift_configs` for label/start_time.
- `addShiftScheduleEntry({ station, workDate, shiftConfigId, staffId, staffName, createdBy })`
  → insert one row; surfaces the unique-index violation as a friendly
  "Bakery chỉ được 1 người/ca" error rather than a raw Postgres message.
- `removeShiftScheduleEntry(id)` → delete one row.
- `createApprovalRequest(...)` — already generic, just called with
  `type: 'leave_request'` and the new `leaveDate` field threaded through
  (small signature addition, backward-compatible for the other 3 types
  which simply don't pass it).

Live/red status for a cell is computed client-side from three existing/new
fetches already needed for the week in view: `shift_schedule`,
`fetchShiftLogsRange` (existing, for "checked in, no checkout yet"), and
`fetchApprovalRequests({ status: 'approved' })` filtered to `type ===
'leave_request'` client-side — no new aggregate query needed.

## Out of scope (v1)

- **Formal staff-to-staff shift-swap request.** The owner reassigning a
  cell directly already covers "move someone else into a slot after a
  sudden leave" — a peer-initiated swap-and-approve workflow is a
  meaningfully bigger feature (needs a second approval type, a "propose
  swap to a specific colleague" UI, and handling the colleague declining)
  and isn't required for the core need you described. Can be added later
  as its own small addition if the owner-reassign path proves too slow
  in practice.
- **Overtime reporting.** The original notes say overtime is "báo cáo qua
  KPI" — that's luồng 3's job, not this one. This schedule just makes the
  planned-vs-actual data available for luồng 3 to compute against later.
- **Recurring/template weeks** (copy last week's schedule forward). Not
  requested; the owner re-fills each week from a blank grid in v1.
- Changing the existing instant, no-approval "xin nghỉ đột xuất" button on
  the check-in screen — untouched, stays exactly as it is today.
