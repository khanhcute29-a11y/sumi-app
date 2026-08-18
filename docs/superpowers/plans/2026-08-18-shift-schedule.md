# Weekly Shift Schedule Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a forward-looking weekly work schedule per station (Bakery, Bếp Nóng, Bếp Lạnh, Xưởng 41, Xưởng 42) inside the existing Ca Làm Việc screen — owner edits it, staff see only their own station, cells show live green/red status.

**Architecture:** One new table (`shift_schedule`) holding planned assignments, reusing the existing `shift_configs` table for shift labels/times. A new `station` column on `profiles` scopes staff visibility. Leave requests tied to a scheduled day go through the existing generic `approval_requests` table (new `leave_request` type + a new `leave_date` column), reusing the existing Yêu Cầu Duyệt approval screen rather than building a new one. The whole feature lives inside `ShiftsScreen.jsx` as a new tab, plus a small addition to `StaffScreen.jsx` (station picker) and `ApprovalRequestsScreen.jsx` (render the new request type).

**Tech Stack:** React 18 (plain JSX, inline `style={{...}}` with `var(--...)` tokens), Supabase (Postgres + RLS), Vite. **No test runner exists** — verification is `npm run build` plus manual browser checks.

## Global Constraints

- The existing "xin nghỉ đột xuất" button/modal on the check-in tab (`ShiftsScreen.jsx`'s `LeaveModal`, calling `addLeaveRequest` directly into `shift_logs`) stays completely untouched — it's a same-day instant declaration, unrelated to this feature.
- Bakery station: at most 1 person per (date, shift). Every other station: multiple people allowed, no duplicates.
- Leave requests tied to the weekly schedule require owner approval via the existing `approval_requests`/Yêu Cầu Duyệt flow — they do NOT insert directly into `shift_logs`.
- Owner can freely add/remove any staff member to/from any schedule cell at any time — this is the only "shift swap / cover" mechanism in this version (no peer-to-peer swap-request workflow).
- No new sidebar nav item — this is a new `Tabs` entry inside the existing `ShiftsScreen.jsx`, matching the existing `branchFilter` `Tabs` pattern already in that file.
- Overtime reporting is explicitly out of scope for this plan (deferred to the KPI feature).

---

### Task 1: Database migration

**Files:**
- Create: `supabase/migrate_shift_schedule.sql`

**Interfaces:**
- Produces: `shift_schedule` table, `profiles.station` column, widened `approval_requests.type` check constraint, new `approval_requests.leave_date` column.

- [ ] **Step 1: Write the migration**

```sql
-- Run manually in Supabase SQL Editor. Safe to re-run (idempotent).

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

create unique index if not exists uniq_shift_schedule_bakery_single
  on shift_schedule (station, work_date, shift_config_id)
  where station = 'bakery';

create unique index if not exists uniq_shift_schedule_no_dup_staff
  on shift_schedule (station, work_date, shift_config_id, staff_id);

alter table shift_schedule enable row level security;

drop policy if exists "read shift_schedule" on shift_schedule;
create policy "read shift_schedule" on shift_schedule for select
  using (auth.role() = 'authenticated' and public.is_approved());

drop policy if exists "owner insert shift_schedule" on shift_schedule;
create policy "owner insert shift_schedule" on shift_schedule for insert
  with check (exists (select 1 from profiles where id = auth.uid() and role in ('owner','admin')));

drop policy if exists "owner delete shift_schedule" on shift_schedule;
create policy "owner delete shift_schedule" on shift_schedule for delete
  using (exists (select 1 from profiles where id = auth.uid() and role in ('owner','admin')));

alter table profiles add column if not exists station text
  check (station in ('bakery','nong','lanh','xuong41','xuong42'));

alter table approval_requests drop constraint if exists approval_requests_type_check;
alter table approval_requests add constraint approval_requests_type_check
  check (type in ('order_edit','order_cancel','order_delete','shift_recheck','leave_request'));

alter table approval_requests add column if not exists leave_date date;
```

- [ ] **Step 2: Manual verify**

This is a SQL-only file — re-read it after writing to confirm it matches exactly. No app code depends on it yet in this task.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrate_shift_schedule.sql
git commit -m "Add weekly shift schedule table, profiles.station, and leave_request approval type"
```

---

### Task 2: Query functions

**Files:**
- Modify: `src/lib/queries.js`

**Interfaces:**
- Produces:
  - `fetchShiftSchedule({ station, from, to })` → `Promise<Array<{id, station, work_date, shift_config_id, staff_id, staff_name, created_by, created_at}>>`
  - `addShiftScheduleEntry({ station, workDate, shiftConfigId, staffId, staffName, createdBy })` → `Promise<void>`, throws a friendly Vietnamese error on the unique-constraint violation (Postgres error code `23505`) instead of the raw Postgres message.
  - `removeShiftScheduleEntry(id)` → `Promise<void>`
  - `updateProfileStation(id, station)` → `Promise<void>`
  - `createApprovalRequest(...)` gains one new optional field, `leaveDate` — existing 3 call sites (`order_edit`/`order_cancel`/`order_delete`/`shift_recheck` flows) are unaffected since they simply don't pass it.

- [ ] **Step 1: Add the 4 new functions**

Insert these in `src/lib/queries.js` right after the `// ---- Ca làm việc (chấm công / trễ giờ / xin nghỉ đột xuất) ----` section ends (immediately after the existing `deleteShiftLog` function, before the `// ---- Yêu cầu duyệt hợp nhất` section comment):

```js
export async function fetchShiftSchedule({ station, from, to }) {
  const { data, error } = await supabase
    .from('shift_schedule').select('*')
    .eq('station', station).gte('work_date', from).lte('work_date', to)
    .order('work_date', { ascending: true });
  if (error) throw error;
  return data;
}

export async function addShiftScheduleEntry({ station, workDate, shiftConfigId, staffId, staffName, createdBy }) {
  const { error } = await supabase.from('shift_schedule').insert({
    station, work_date: workDate, shift_config_id: shiftConfigId,
    staff_id: staffId, staff_name: staffName, created_by: createdBy || null,
  });
  if (error) {
    if (error.code === '23505') {
      throw new Error(station === 'bakery' ? 'Bakery chỉ được 1 người/ca.' : 'Người này đã có trong ca này.');
    }
    throw error;
  }
}

export async function removeShiftScheduleEntry(id) {
  const { error } = await supabase.from('shift_schedule').delete().eq('id', id);
  if (error) throw error;
}

export async function updateProfileStation(id, station) {
  const { error } = await supabase.from('profiles').update({ station: station || null }).eq('id', id);
  if (error) throw error;
}
```

- [ ] **Step 2: Extend `createApprovalRequest` with `leaveDate`**

Find the current function (exact current body):
```js
export async function createApprovalRequest({ type, orderId, orderCode, shiftLogId, requesterId, requesterName, requesterRole, reason, photoUrl }) {
  const { error } = await supabase.from('approval_requests').insert({
    type, order_id: orderId || null, order_code: orderCode || null, shift_log_id: shiftLogId || null,
    requester_id: requesterId || null, requester_name: requesterName || null, requester_role: requesterRole || null,
    reason: reason || null, photo_url: photoUrl || null,
  });
  if (error) throw error;
  notifyBadgesChanged();
}
```
Replace with:
```js
export async function createApprovalRequest({ type, orderId, orderCode, shiftLogId, requesterId, requesterName, requesterRole, reason, photoUrl, leaveDate }) {
  const { error } = await supabase.from('approval_requests').insert({
    type, order_id: orderId || null, order_code: orderCode || null, shift_log_id: shiftLogId || null,
    requester_id: requesterId || null, requester_name: requesterName || null, requester_role: requesterRole || null,
    reason: reason || null, photo_url: photoUrl || null, leave_date: leaveDate || null,
  });
  if (error) throw error;
  notifyBadgesChanged();
}
```

- [ ] **Step 3: Manual verify**

Run: `npm run build` — must pass with no errors. These functions have no UI call site yet (later tasks wire them up).

- [ ] **Step 4: Commit**

```bash
git add src/lib/queries.js
git commit -m "Add shift-schedule query functions and leaveDate to createApprovalRequest"
```

---

### Task 3: Station picker on Staff screen

**Files:**
- Modify: `src/screens/StaffScreen.jsx`

**Interfaces:**
- Consumes: `updateProfileStation` (Task 2).
- Produces: nothing consumed by later tasks — this is how the owner sets `profiles.station` (Task 5's schedule visibility reads it), independently testable.

- [ ] **Step 1: Add a `STATION_OPTIONS` constant near the top of the file** (alongside other module-level constants, e.g. right after the imports):

```js
const STATION_OPTIONS = [
  { value: '', label: 'Chưa gán khâu' },
  { value: 'bakery', label: 'Bakery' },
  { value: 'nong', label: 'Bếp Nóng' },
  { value: 'lanh', label: 'Bếp Lạnh' },
  { value: 'xuong41', label: 'Xưởng 41' },
  { value: 'xuong42', label: 'Xưởng 42' },
];
```

- [ ] **Step 2: Add `updateProfileStation` to the queries import**

Old: `import { fetchMyProfile, fetchAllProfiles, updateProfileRole, updateProfileExtraRoles, approveStaff } from '../lib/queries';`
New: `import { fetchMyProfile, fetchAllProfiles, updateProfileRole, updateProfileExtraRoles, updateProfileStation, approveStaff } from '../lib/queries';`

- [ ] **Step 3: Add a station `<Select>` next to the existing role `<Select>` in `StaffRow`**

Read the current file to find the exact `StaffRow` component (the one rendering each already-approved staff member, containing the role `<Select value={s.role} onChange={(e) => onChangeRole(s.id, e.target.value)} options={ROLE_OPTIONS} style={{ width: 160 }} />` and the extra-roles checkbox block). Add a sibling `<Select>` right after that role select, in the same flex row:

```jsx
<Select
  value={s.station || ''}
  onChange={(e) => onChangeStation(s.id, e.target.value || null)}
  options={STATION_OPTIONS}
  style={{ width: 150 }}
/>
```

Add a `handleChangeStation` handler in the parent component (same place as the existing `handleChangeRole`/`handleChangeExtraRoles`):
```js
const handleChangeStation = async (id, station) => {
  await updateProfileStation(id, station);
  load();
};
```
Pass it down as a new prop `onChangeStation={handleChangeStation}` on `<StaffRow .../>`, and destructure `onChangeStation` in `StaffRow`'s props alongside the existing `onChangeRole`/`onChangeExtraRoles`.

- [ ] **Step 4: Manual verify**

Run: `npm run build` — must pass.
Run: `npm run dev`, log in as owner, go to Nhân Viên, confirm each staff row now shows a "Khâu" dropdown next to their role, changing it persists (reload the page, confirm the selection stuck).

- [ ] **Step 5: Commit**

```bash
git add src/screens/StaffScreen.jsx
git commit -m "Add station picker to Staff screen for schedule visibility scoping"
```

---

### Task 4: Render `leave_request` in the approval queue

**Files:**
- Modify: `src/screens/ApprovalRequestsScreen.jsx`

**Interfaces:**
- Consumes: `approval_requests` rows where `type === 'leave_request'` now have a populated `leave_date` column (Task 1).
- Produces: nothing consumed by later tasks — the existing generic approve/reject flow already works for any type; this task only adds the label and makes sure `leave_date` displays.

- [ ] **Step 1: Add the label**

Old:
```js
const TYPE_LABELS = {
  order_edit: 'Yêu cầu sửa đơn',
  order_cancel: 'Yêu cầu khách hủy đơn',
  order_delete: 'Yêu cầu xoá đơn',
  shift_recheck: 'Yêu cầu chấm công lại',
};
```
New:
```js
const TYPE_LABELS = {
  order_edit: 'Yêu cầu sửa đơn',
  order_cancel: 'Yêu cầu khách hủy đơn',
  order_delete: 'Yêu cầu xoá đơn',
  shift_recheck: 'Yêu cầu chấm công lại',
  leave_request: 'Yêu cầu xin nghỉ (lịch tuần)',
};
```

- [ ] **Step 2: Show the requested leave date**

Find the row-rendering JSX that currently shows `{TYPE_LABELS[req.type] || req.type}{req.order_code ? \` — ${req.order_code}\` : ''}`. Add the leave date right after it when present:
```jsx
{TYPE_LABELS[req.type] || req.type}{req.order_code ? ` — ${req.order_code}` : ''}{req.leave_date ? ` — nghỉ ngày ${req.leave_date}` : ''}
```

- [ ] **Step 3: Confirm `handleApprove` needs no new branch**

`leave_request` approval doesn't need any side-effect insert (unlike `order_cancel`/`order_delete`/`shift_recheck`) — approving it just flips `status` to `'approved'` via the existing generic `resolveApprovalRequest(req.id, { status: 'approved', resolvedBy })` call already at the end of `handleApprove`, which runs for every type. Task 5's schedule grid reads approved `leave_request` rows directly — no extra wiring needed here. Do not add an `else if (req.type === 'leave_request')` branch; there is nothing for it to do.

- [ ] **Step 4: Manual verify**

Run: `npm run build` — must pass. There's no leave-request row to display yet until Task 6 creates one; this task alone just needs to compile and not break the existing 4 types (spot-check by running `npm run dev`, opening Yêu Cầu Duyệt as owner, confirming existing pending requests of the other types still render their labels correctly).

- [ ] **Step 5: Commit**

```bash
git add src/screens/ApprovalRequestsScreen.jsx
git commit -m "Render leave_request approval type in the approval queue"
```

---

### Task 5: `WeeklyScheduleSection` component (view + owner edit)

**Files:**
- Create: `src/components/WeeklyScheduleSection.jsx`

**Interfaces:**
- Consumes: `fetchShiftSchedule`, `addShiftScheduleEntry`, `removeShiftScheduleEntry`, `fetchShiftConfigs`, `fetchShiftLogsRange`, `fetchApprovalRequests`, `fetchAllProfiles` (all from `src/lib/queries.js`; the shift-schedule ones from Task 2, the rest pre-existing); `hasAnyRole` from `src/lib/roles.js`; `localDateStr` from `src/lib/date.js`.
- Produces: `<WeeklyScheduleSection profile={profile} />` — a self-contained section. Task 6 renders it inside `ShiftsScreen.jsx` behind a new tab; it does not need any other prop.

- [ ] **Step 1: Write the component**

```jsx
import React, { useEffect, useMemo, useState } from 'react';
import { Button } from './forms/Button';
import { Select } from './forms/Select';
import {
  fetchShiftSchedule, addShiftScheduleEntry, removeShiftScheduleEntry,
  fetchShiftConfigs, fetchShiftLogsRange, fetchApprovalRequests, fetchAllProfiles,
} from '../lib/queries';
import { hasAnyRole } from '../lib/roles';
import { localDateStr } from '../lib/date';

const STATIONS = [
  { key: 'bakery', label: 'Bakery' },
  { key: 'nong', label: 'Bếp Nóng' },
  { key: 'lanh', label: 'Bếp Lạnh' },
  { key: 'xuong41', label: 'Xưởng 41' },
  { key: 'xuong42', label: 'Xưởng 42' },
];
const DOW_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

function mondayOf(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function weekDates(monday) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return d;
  });
}

export function WeeklyScheduleSection({ profile }) {
  const isOwner = hasAnyRole(profile, ['owner', 'admin']);
  const [weekMonday, setWeekMonday] = useState(() => mondayOf(new Date()));
  const [station, setStation] = useState(isOwner ? 'bakery' : (profile?.station || 'bakery'));
  const [schedule, setSchedule] = useState([]);
  const [shiftConfigs, setShiftConfigs] = useState([]);
  const [liveStaffIds, setLiveStaffIds] = useState(new Set());
  const [leaveByStaffDate, setLeaveByStaffDate] = useState(new Set());
  const [allProfiles, setAllProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [assignCell, setAssignCell] = useState(null);

  const days = useMemo(() => weekDates(weekMonday), [weekMonday]);
  const from = localDateStr(days[0]);
  const to = localDateStr(days[6]);
  const todayStr = localDateStr();

  useEffect(() => {
    setLoading(true);
    setError('');
    const loads = [
      fetchShiftSchedule({ station, from, to }),
      fetchShiftConfigs(),
      fetchShiftLogsRange(from, to),
      fetchApprovalRequests({}),
    ];
    if (isOwner) loads.push(fetchAllProfiles());
    Promise.all(loads)
      .then(([scheduleData, configsData, logsData, approvalsData, profilesData]) => {
        setSchedule(scheduleData);
        setShiftConfigs(configsData);
        const live = new Set(
          logsData.filter((l) => l.type === 'checkin' && !logsData.some((c) => c.type === 'checkout' && c.staff_id === l.staff_id && c.work_date === l.work_date))
            .map((l) => `${l.staff_id}_${l.work_date}`)
        );
        setLiveStaffIds(live);
        const approvedLeaves = new Set(
          approvalsData.filter((a) => a.type === 'leave_request' && a.status === 'approved' && a.leave_date)
            .map((a) => `${a.requester_id}_${a.leave_date}`)
        );
        setLeaveByStaffDate(approvedLeaves);
        if (profilesData) setAllProfiles(profilesData);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [station, from, to, isOwner]);

  const cellEntries = (shiftConfigId, date) => {
    const dateStr = localDateStr(date);
    return schedule.filter((s) => s.shift_config_id === shiftConfigId && s.work_date === dateStr);
  };

  const handleRemove = async (id) => {
    try {
      await removeShiftScheduleEntry(id);
      setSchedule((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      setError(err.message);
    }
  };

  const handleAssign = async (staffId, staffName) => {
    if (!assignCell) return;
    try {
      await addShiftScheduleEntry({
        station, workDate: localDateStr(assignCell.date), shiftConfigId: assignCell.shiftConfigId,
        staffId, staffName, createdBy: profile?.id,
      });
      setAssignCell(null);
      const refreshed = await fetchShiftSchedule({ station, from, to });
      setSchedule(refreshed);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {isOwner && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {STATIONS.map((s) => (
            <Button key={s.key} variant={station === s.key ? 'primary' : 'secondary'} size="sm" onClick={() => setStation(s.key)}>{s.label}</Button>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <Button variant="secondary" size="sm" onClick={() => setWeekMonday((d) => { const n = new Date(d); n.setDate(n.getDate() - 7); return n; })}>‹ Tuần trước</Button>
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>{localDateStr(days[0])} — {localDateStr(days[6])}</div>
        <Button variant="secondary" size="sm" onClick={() => setWeekMonday((d) => { const n = new Date(d); n.setDate(n.getDate() + 7); return n; })}>Tuần sau ›</Button>
      </div>
      {error && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)' }}>{error}</div>}
      {loading ? (
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Đang tải...</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 640 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', font: 'var(--text-caption)', color: 'var(--text-muted)', padding: 6 }}></th>
                {days.map((d, i) => (
                  <th key={i} style={{ font: 'var(--text-caption)', color: localDateStr(d) === todayStr ? 'var(--action-primary)' : 'var(--text-muted)', padding: 6 }}>
                    {DOW_LABELS[i]}<br />{localDateStr(d).slice(5)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shiftConfigs.map((sc) => (
                <tr key={sc.id}>
                  <td style={{ font: 'var(--text-caption)', color: 'var(--text-muted)', padding: 6, whiteSpace: 'nowrap' }}>{sc.label}</td>
                  {days.map((d, i) => {
                    const entries = cellEntries(sc.id, d);
                    const dateStr = localDateStr(d);
                    const canAddMore = station !== 'bakery' || entries.length === 0;
                    return (
                      <td key={i} style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: 6, verticalAlign: 'top', minWidth: 90 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {entries.map((e) => {
                            const isLive = liveStaffIds.has(`${e.staff_id}_${dateStr}`);
                            const isLeave = leaveByStaffDate.has(`${e.staff_id}_${dateStr}`);
                            const bg = isLeave ? 'var(--status-danger-soft)' : isLive ? 'var(--status-success-soft)' : 'var(--surface-sunken)';
                            const color = isLeave ? 'var(--status-danger)' : isLive ? 'var(--status-success)' : 'var(--text-primary)';
                            return (
                              <div key={e.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, background: bg, color, borderRadius: 'var(--radius-sm)', padding: '3px 6px', font: 'var(--text-caption)' }}>
                                <span>{e.staff_name}{isLeave ? ' (nghỉ)' : ''}</span>
                                {isOwner && <button onClick={() => handleRemove(e.id)} style={{ border: 'none', background: 'none', cursor: 'pointer', color, fontSize: 11 }}>✕</button>}
                              </div>
                            );
                          })}
                          {isOwner && canAddMore && (
                            <button onClick={() => setAssignCell({ date: d, shiftConfigId: sc.id })} style={{ border: '1px dashed var(--border-subtle)', background: 'none', borderRadius: 'var(--radius-sm)', padding: '3px 6px', font: 'var(--text-caption)', color: 'var(--text-muted)', cursor: 'pointer' }}>+ Thêm</button>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, font: 'var(--text-caption)', color: 'var(--text-secondary)' }}><i style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--status-success)', display: 'inline-block' }}></i>Đang làm (đã bắt đầu ca)</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, font: 'var(--text-caption)', color: 'var(--text-secondary)' }}><i style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--status-danger)', display: 'inline-block' }}></i>Đã duyệt nghỉ</span>
      </div>

      {assignCell && (
        <div style={{ position: 'fixed', inset: 0, background: 'var(--surface-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 16 }} onClick={() => setAssignCell(null)}>
          <div style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-lg)', width: 320, maxWidth: '100%', padding: 20, boxShadow: 'var(--shadow-lg)', display: 'flex', flexDirection: 'column', gap: 12 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ font: 'var(--text-title)', color: 'var(--text-primary)' }}>Thêm người vào ca</div>
            <Select
              value=""
              onChange={(e) => {
                const p = allProfiles.find((p) => p.id === e.target.value);
                if (p) handleAssign(p.id, p.full_name);
              }}
              options={allProfiles.map((p) => ({ value: p.id, label: p.full_name }))}
              placeholder="Chọn nhân viên..."
            />
            <Button variant="secondary" size="sm" onClick={() => setAssignCell(null)}>Đóng</Button>
          </div>
        </div>
      )}
    </div>
  );
}
```

Note on the `liveStaffIds` computation: a `checkin` row for a given `staff_id`+`work_date` is "live" only if there's no matching `checkout` row for that same `staff_id`+`work_date` in the fetched range — this mirrors how `shift_logs` already models one checkin + one checkout row per person per day (see the existing unique-index comments in `supabase/schema.sql` for `shift_logs`).

- [ ] **Step 2: Manual verify**

Run: `npm run build` — must pass with no errors. There's no screen wiring this in yet (Task 6 does that) — verify by temporarily rendering `<WeeklyScheduleSection profile={{ id: 'test', role: 'owner', full_name: 'Test' }} />` inside any existing screen's JSX, confirming the station buttons, week nav, and grid render without crashing, then remove the temporary render (don't commit it).

- [ ] **Step 3: Commit**

```bash
git add src/components/WeeklyScheduleSection.jsx
git commit -m "Add WeeklyScheduleSection component with owner edit and live status"
```

---

### Task 6: Leave-request modal + wire into `ShiftsScreen.jsx`

**Files:**
- Create: `src/components/LeaveScheduleRequestModal.jsx`
- Modify: `src/screens/ShiftsScreen.jsx`
- Modify: `src/components/WeeklyScheduleSection.jsx` (add the "Xin nghỉ" entry point for the viewer's own name)

**Interfaces:**
- Consumes: `WeeklyScheduleSection` (Task 5), `createApprovalRequest` with `leaveDate` (Task 2).
- Produces: nothing consumed elsewhere — this is the final integration point.

- [ ] **Step 1: Write `LeaveScheduleRequestModal.jsx`**

Modeled on the existing `IncidentReportModal`/`ProductionLogModal` shape, but for a specific future date:

```jsx
import React, { useState } from 'react';
import { Button } from './forms/Button';
import { Input } from './forms/Input';
import { PhotoField } from './PhotoField';
import { createApprovalRequest } from '../lib/queries';

export function LeaveScheduleRequestModal({ leaveDate, staffId, staffName, staffRole, onClose, onSent }) {
  const [reason, setReason] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSend = async () => {
    if (!reason.trim()) { setError('Nhập lý do xin nghỉ.'); return; }
    setSaving(true);
    setError('');
    try {
      await createApprovalRequest({
        type: 'leave_request', leaveDate, reason, photoUrl: photoUrl || null,
        requesterId: staffId, requesterName: staffName, requesterRole: staffRole,
      });
      onSent?.();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--surface-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 70, padding: 16 }} onClick={onClose}>
      <div style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-lg)', width: 380, maxWidth: '100%', padding: 20, boxShadow: 'var(--shadow-lg)', display: 'flex', flexDirection: 'column', gap: 12 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ font: 'var(--text-title)', color: 'var(--text-primary)' }}>Xin nghỉ ngày {leaveDate}</div>
        <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Cần sếp duyệt trước khi ô lịch chuyển đỏ.</div>
        <Input label="Lý do xin nghỉ" placeholder="VD: Việc gia đình, ốm..." value={reason} onChange={(e) => setReason(e.target.value)} />
        <PhotoField url={photoUrl} onChange={setPhotoUrl} label="Ảnh minh chứng (không bắt buộc)" prefix="leave-schedule" />
        {error && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)' }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>Huỷ</Button>
          <Button variant="danger" size="sm" onClick={handleSend} disabled={saving}>{saving ? 'Đang gửi...' : 'Gửi yêu cầu'}</Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add the "Xin nghỉ" entry point inside `WeeklyScheduleSection.jsx`**

Add state near the top of the component: `const [leaveRequestDate, setLeaveRequestDate] = useState(null);`
Add the import: `import { LeaveScheduleRequestModal } from './LeaveScheduleRequestModal';`

In the cell-rendering `entries.map((e) => ...)` block (Task 5's Step 1), show a small "Xin nghỉ" link only when the entry is the viewer's own name, the date is today or in the future, and there's no existing leave record for it:
```jsx
{e.staff_id === profile?.id && dateStr >= todayStr && !isLeave && (
  <button onClick={() => setLeaveRequestDate(dateStr)} style={{ border: 'none', background: 'none', color: 'var(--text-muted)', font: 'var(--text-caption)', textDecoration: 'underline', cursor: 'pointer', padding: 0 }}>Xin nghỉ</button>
)}
```
(Place this as an additional line inside the per-entry `<div>` that already renders `e.staff_name`, right after the existing name/remove-button row.)

At the end of the component's returned JSX, alongside the existing `{assignCell && (...)}` modal block, add:
```jsx
{leaveRequestDate && (
  <LeaveScheduleRequestModal
    leaveDate={leaveRequestDate}
    staffId={profile?.id}
    staffName={profile?.full_name}
    staffRole={profile?.role}
    onClose={() => setLeaveRequestDate(null)}
    onSent={() => setLeaveRequestDate(null)}
  />
)}
```

- [ ] **Step 3: Wire a new view-mode tab into `ShiftsScreen.jsx`**

Read the current file's outer return JSX (starts around the title block, per the explore notes: title → action-button row → the existing branch-filter `<Tabs>` → error banner → logs grid → `{isOwner && <ShiftConfigManager .../>}` → `{isOwner && <PayrollSection .../>}` → the 4 conditional modals). Add a new state near the other `useState` calls:
```js
const [viewMode, setViewMode] = useState('checkin');
```
Add the import: `import { WeeklyScheduleSection } from '../components/WeeklyScheduleSection';`

Immediately after the title block and before the existing action-button row, insert a new top-level `<Tabs>`:
```jsx
<Tabs tabs={[{ key: 'checkin', label: 'Chấm công' }, { key: 'schedule', label: 'Lịch tuần' }]} active={viewMode} onChange={setViewMode} />
```

Wrap everything from the existing action-button row through the `PayrollSection` block (i.e., everything that currently renders unconditionally for the check-in experience) in `{viewMode === 'checkin' && (<>...</>)}`. Immediately after that closing `)}`, add:
```jsx
{viewMode === 'schedule' && <WeeklyScheduleSection profile={profile} />}
```
Leave the 4 existing conditional modals (`showCheckin`/`showCheckout`/`showRecheck`/`showLeave`) exactly where they are, outside the `viewMode` conditional — they belong to the check-in flow and are only ever triggered by buttons that live inside the `checkin` view, so this doesn't change behavior either way, but don't nest them inside the `viewMode === 'checkin'` block if it complicates the edit — leaving them as unconditional siblings is simplest and correct since their own `showX` state already gates whether they render.

- [ ] **Step 4: Manual verify**

Run: `npm run build` — must pass with no errors.
Run: `npm run dev`. Log in as owner: go to Ca Làm Việc, confirm the new "Chấm công"/"Lịch tuần" tab bar appears above everything, "Chấm công" shows the exact same content as before this task, "Lịch tuần" shows the station buttons + week grid, adding/removing staff in a cell works, Bakery station refuses a second person with the friendly error message. Log in as a non-owner staff account with a `station` set (via Task 3): confirm "Lịch tuần" shows only their station (no station-switch buttons), their own name in a future cell has a "Xin nghỉ" link, submitting it creates a row visible in Yêu Cầu Duyệt (Task 4's label), approving it there turns the cell red on reload.

- [ ] **Step 5: Commit**

```bash
git add src/components/LeaveScheduleRequestModal.jsx src/components/WeeklyScheduleSection.jsx src/screens/ShiftsScreen.jsx
git commit -m "Wire weekly schedule tab and leave-request flow into Ca Làm Việc screen"
```

---

## Post-plan note for the user

After Task 1 lands, run `supabase/migrate_shift_schedule.sql` in the Supabase SQL Editor (safe to re-run) to activate the feature. Until then, the new "Lịch tuần" tab will show fetch errors from the missing table/column — expected, not a bug.
