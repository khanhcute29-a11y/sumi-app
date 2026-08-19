# KPI mở rộng (Extended KPI) — Design Spec

Date: 2026-08-19
Status: Approved by owner, ready for implementation planning

## Context

Last of four planned flows (see `2026-08-18-shift-schedule-design.md`,
`2026-08-19-kitchen-stages-design.md`, `2026-08-19-task-management-design.md`
for the first three, already shipped). Source: owner's Google Doc "Sumi
Bakery - Master UI/UX & Complete Operational Workflows V5". Deliberately
last because two of its six metrics ("tổng việc được giao", "làm cùng
nhau") depend on data that only exists now that task management and
kitchen multi-stage coordination have shipped.

A basic KPI screen already exists (`src/screens/KpiScreen.jsx`,
`src/lib/kpi.js`) showing role-specific metrics: shippers see order count +
total km; kitchen roles see order count + products from orders + products
produced. This spec adds six new metrics that apply to **every** staff
member, on top of (not replacing) the existing role-specific cards.

## Time-period picker

Replace the current preset tabs (Hôm nay / 7 ngày / 30 ngày / Tùy chỉnh)
with three fixed-period tabs — **Ngày / Tuần / Tháng** — each with
prev/next arrows to navigate to the adjacent period. Applies to the whole
screen (existing role-specific cards and the six new metrics both use the
same selected period). Week = Monday–Sunday (matching the existing shift
schedule's week convention). Month = calendar month.

## The six metrics

All computed client-side from data already fetched for the selected
period, following the existing pattern in `src/lib/kpi.js` (no new
database views — plain range-filtered queries + JS aggregation).

1. **Tổng giờ làm** (total hours worked) — pair `checkin`/`checkout` rows
   in `shift_logs` by `(staff_id, work_date)` within the period, sum
   `checkout.checkin_time - checkin.checkin_time` (the column is named
   `checkin_time` but is reused for both event types, per the existing
   schema). A day with only a checkin (no matching checkout yet) is
   excluded from the sum for that day.

2. **Giờ tăng ca** (overtime hours) — for each paired day, look up the
   `shift_configs` row matching that day's `shift_label` (+ `branch`),
   compute expected duration `end_time - start_time`. Overtime for that
   day = `max(0, actual_hours - expected_hours)`, summed over the period.
   If the matching `shift_configs` row has no `end_time` set (owner hasn't
   backfilled it yet), that day is excluded from the overtime sum and the
   UI notes "một số ca chưa cấu hình giờ kết thúc" rather than showing a
   wrong number.

3. **Tổng việc được giao** (total assigned tasks) — count `tasks` rows
   where `category = 'assigned'`, `assignee_id` = the staff member, and
   `created_at` falls within the period — regardless of `status` (open,
   done, or exempted all count, per the owner's explicit choice: this
   metric reflects assigned workload, not completion rate).

4. **Tổng ngày nghỉ** (total leave days) — count distinct `leave_date`
   values from `approval_requests` where `type = 'leave_request'`,
   `status = 'approved'`, `requester_id` = the staff member, and
   `leave_date` falls within the period.

5. **Tổng giờ trễ** (total late-clock-in hours) — sum `shift_logs`'s
   `late_minutes` column (present only on `checkin`-type rows) within the
   period, converted to hours. This is check-in lateness only — task
   deadline lateness (`tasks.late`) is a separate concept and is not
   folded into this metric (owner's explicit choice, to keep "giờ trễ"
   meaning literally "late to a shift").

6. **Làm cùng nhau** (coworking time) — for every order with two or more
   `order_stages` rows assigned to *different* staff members within the
   period, compute the overlap between this staff member's stage
   interval(s) `[started_at, ended_at]` and every other assignee's
   interval(s) on the same order. Sum the overlapping duration across all
   such orders. A stage with a null `started_at` or `ended_at` (not yet
   started, or still in progress) contributes no overlap. Each
   overlapping pair contributes to both staff members' totals
   independently.

## Schema change

```sql
alter table shift_configs add column if not exists end_time time;
```

Nullable — existing configs start with no `end_time`; the owner backfills
them via the UI change below. No RLS change needed (existing
`shift_configs` policies already gate writes to owner/admin).

## UI changes

- `ShiftConfigManager` (inside `src/screens/ShiftsScreen.jsx`) currently
  only supports add + delete. Add:
  - An "Giờ kết thúc" time input alongside the existing "Giờ bắt đầu"
    input in the add-new-config form.
  - An edit-in-place action on each existing config row (currently plain
    rows with only a delete "✕") so the owner can backfill `end_time` on
    configs created before this change — a small inline time-input +
    save, not a full modal.
  - New query function `updateShiftConfig(id, fields)` in
    `src/lib/queries.js`, following the existing `addShiftConfig`/
    `deleteShiftConfig` pattern.
- `KpiScreen.jsx`: replace the current period-picker tabs with
  Ngày/Tuần/Tháng + prev/next, and add a new "6 chỉ số" card section
  (self-view: one set of 6 cards; owner/admin view: 6 values per staff
  member in the existing per-staff card grid) above the existing
  role-specific cards, which are otherwise unchanged.
- `src/lib/kpi.js`: add the six computation functions described above,
  taking already-fetched raw rows (shift_logs, tasks, approval_requests,
  order_stages) plus the period bounds and shift_configs list, returning
  the six numbers — mirroring the existing `computeShipperKpi`/
  `computeKitchenKpi`-style functions already in that file.
- `src/lib/queries.js`: add `fetchOrderStagesRange(fromDate, toDate)` (new
  — `order_stages` currently has no standalone range fetcher, only
  embedded per-order fetches) and extend `fetchTasks` with optional
  `createdFrom`/`createdTo` params (currently only filters by
  `assigneeId`/`category`/`status`).

## Out of scope

- No new database views or server-side aggregation — everything is
  client-computed from range-fetched rows, matching the existing
  `kpi.js` pattern and this app's overall client-heavy architecture.
- No historical backfill/recompute tooling for `end_time` — the owner
  fills it in manually per shift config, at their own pace; overtime is
  simply excluded for shifts without it until then.
- No export/print of KPI data — out of scope, not requested.

## Testing

- Hours-worked pairing: a day with checkin+checkout computes correctly; a
  day with only checkin is excluded, not treated as zero or as an error.
- Overtime: a shift config without `end_time` is excluded from the sum,
  not treated as zero overtime.
- Assigned-task count includes open, done, and exempted tasks created in
  the period; excludes tasks created outside the period even if still
  open.
- Leave-day count: distinct dates only (an approved multi-day leave
  request represented as separate `leave_date` rows, if that's how it's
  stored, is not double-counted per date — verify against how
  `leave_request` rows are actually created in practice).
- Coworking overlap: two stages on the same order assigned to different
  staff with overlapping `[started_at, ended_at]` sum correctly; stages
  assigned to the *same* staff member don't count against themselves;
  stages with a null `started_at`/`ended_at` are excluded.
- Period navigation: Tuần correctly spans Monday–Sunday; Tháng correctly
  spans a full calendar month regardless of which day within it is
  "today" when first opened.
