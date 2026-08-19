# Extended KPI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add six universal staff metrics (hours worked, overtime, assigned-task count, leave days, late-clock-in hours, coworking time) plus a Ngày/Tuần/Tháng period picker to the existing `KpiScreen.jsx`, without disturbing the already-shipped shipper/kitchen-specific cards.

**Architecture:** Everything is computed client-side from range-fetched raw rows (`shift_logs`, `tasks`, `approval_requests`, `order_stages`), mirroring the existing `computeShipperKpi`/`computeKitchenKpi` pattern in `src/lib/kpi.js`. One schema change (`shift_configs.end_time`) supplies the missing piece needed for overtime math. No new database views, no server-side aggregation.

**Tech Stack:** React (function components, hooks), Supabase (Postgres + supabase-js), existing `src/components/forms/*` and `src/components/data/Card.jsx` primitives.

## Global Constraints

- No test runner exists in this repo (no jest/vitest) — verification is `npm run build` plus manual reasoning/reading, matching every prior shipped feature.
- Migrations are plain idempotent `.sql` files run manually by the owner in the Supabase SQL Editor — no migration runner.
- Vietnamese UI copy throughout, matching existing screens' tone.
- Week = Monday–Sunday. Month = calendar month.
- A shift config without `end_time` is excluded from the overtime sum for that shift (never treated as zero).
- "Tổng giờ trễ" is check-in lateness only (`shift_logs.late_minutes`) — task-deadline lateness (`tasks.late`) is a separate, unrelated concept and must not be folded in.
- "Tổng việc được giao" counts all `category='assigned'` tasks created in the period regardless of status (open/done/exempted all count).

---

### Task 1: Database migration — `shift_configs.end_time`

**Files:**
- Create: `supabase/migrate_extended_kpi.sql`

**Interfaces:**
- Produces: `shift_configs.end_time` column (nullable `time`), consumed by Task 4 (UI) and Task 5 (`computeShiftHours`).

- [ ] **Step 1: Write the migration file**

```sql
-- Run manually in Supabase SQL Editor. Safe to re-run (idempotent).

alter table shift_configs add column if not exists end_time time;
```

- [ ] **Step 2: Verify syntax**

Run: `cat supabase/migrate_extended_kpi.sql`
Expected: file contains exactly the one `alter table` statement above, no typos.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrate_extended_kpi.sql
git commit -m "Add end_time column to shift_configs for overtime calculation"
```

---

### Task 2: Hoist week-date helpers into `src/lib/date.js`

**Files:**
- Modify: `src/lib/date.js`
- Modify: `src/components/WeeklyScheduleSection.jsx:1-27` (remove the local `mondayOf`/`weekDates` definitions, import from `../lib/date` instead)

**Interfaces:**
- Consumes: nothing new.
- Produces: `mondayOf(date)`, `weekDates(monday)`, `startOfMonth(date)`, `endOfMonth(date)` — all exported from `src/lib/date.js`, consumed by Task 6 (`KpiScreen.jsx`).

- [ ] **Step 1: Add the four functions to `src/lib/date.js`**

Append to the end of the file (after the existing `formatDeliveryDateTime`):

```js
// Thứ Hai của tuần chứa `date` (getDay(): 0=CN...6=T7, nên Chủ Nhật lùi 6 ngày,
// các ngày khác lùi về đúng thứ Hai của tuần đó).
export function mondayOf(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

// Mảng 7 ngày (Date objects) từ thứ Hai truyền vào đến Chủ Nhật.
export function weekDates(monday) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return d;
  });
}

export function startOfMonth(date) {
  const d = new Date(date);
  d.setDate(1);
  return d;
}

export function endOfMonth(date) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + 1, 0);
  return d;
}
```

- [ ] **Step 2: Update `WeeklyScheduleSection.jsx` to use the shared exports**

In `src/components/WeeklyScheduleSection.jsx`, the import block starts:
```jsx
import { fetchShiftSchedule, addShiftScheduleEntry, removeShiftScheduleEntry,
  fetchShiftConfigs, fetchShiftLogsRange, fetchApprovalRequests, fetchAllProfiles,
} from '../lib/queries';
import { hasAnyRole } from '../lib/roles';
import { localDateStr } from '../lib/date';
```

Change the `localDateStr` import line to also pull in `mondayOf`/`weekDates`:
```jsx
import { localDateStr, mondayOf, weekDates } from '../lib/date';
```

Then delete the local definitions of `mondayOf` and `weekDates` (the two functions currently defined right after the `DOW_LABELS` constant, immediately before `export function WeeklyScheduleSection`):

```jsx
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
```

Remove that whole block — the component now uses the imported versions, which are byte-identical in behavior.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: succeeds, no errors (confirms `WeeklyScheduleSection.jsx` still resolves `mondayOf`/`weekDates` correctly after the import change).

- [ ] **Step 4: Commit**

```bash
git add src/lib/date.js src/components/WeeklyScheduleSection.jsx
git commit -m "Share week/month date helpers between shift schedule and KPI screens"
```

---

### Task 3: Query-layer additions

**Files:**
- Modify: `src/lib/queries.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `updateShiftConfig(id, fields)`, `fetchOrderStagesRange(fromDate, toDate)`, and an extended `fetchTasks({assigneeId, category, status, createdFrom, createdTo})` — consumed by Task 4 (`updateShiftConfig`) and Task 6 (`fetchOrderStagesRange`, `fetchTasks`).

- [ ] **Step 1: Add `updateShiftConfig`, right after the existing `deleteShiftConfig` (around line 504)**

```js
export async function updateShiftConfig(id, { label, branch, startTime, endTime, wagePerShift } = {}) {
  const fields = {};
  if (label !== undefined) fields.label = label;
  if (branch !== undefined) fields.branch = branch || null;
  if (startTime !== undefined) fields.start_time = startTime;
  if (endTime !== undefined) fields.end_time = endTime || null;
  if (wagePerShift !== undefined) fields.wage_per_shift = wagePerShift;
  const { error } = await supabase.from('shift_configs').update(fields).eq('id', id);
  if (error) throw error;
}
```

- [ ] **Step 2: Extend `fetchTasks` (currently at line 828) with `createdFrom`/`createdTo`**

Replace the existing function:
```js
export async function fetchTasks({ assigneeId, category, status } = {}) {
  let q = supabase.from('tasks').select('*').order('created_at', { ascending: false });
  if (assigneeId) q = q.eq('assignee_id', assigneeId);
  if (category) q = q.eq('category', category);
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}
```
with:
```js
export async function fetchTasks({ assigneeId, category, status, createdFrom, createdTo } = {}) {
  let q = supabase.from('tasks').select('*').order('created_at', { ascending: false });
  if (assigneeId) q = q.eq('assignee_id', assigneeId);
  if (category) q = q.eq('category', category);
  if (status) q = q.eq('status', status);
  if (createdFrom) q = q.gte('created_at', `${createdFrom}T00:00:00+07:00`);
  if (createdTo) q = q.lte('created_at', `${createdTo}T23:59:59.999+07:00`);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}
```

This is backward compatible — every existing call site (`AssignedTasksTab.jsx`, `AdhocTasksTab.jsx`, `DailyChecklistTab.jsx` if applicable) omits the two new params and is unaffected.

- [ ] **Step 3: Add `fetchOrderStagesRange`, anywhere near the other `order_stages` query functions (search for `createOrderStages` and add it as a neighbor)**

```js
export async function fetchOrderStagesRange(fromDate, toDate) {
  const { data, error } = await supabase
    .from('order_stages')
    .select('*')
    .gte('started_at', `${fromDate}T00:00:00+07:00`)
    .lte('started_at', `${toDate}T23:59:59.999+07:00`);
  if (error) throw error;
  return data;
}
```

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: succeeds, no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/queries.js
git commit -m "Add query functions for extended KPI: shift config updates, task date range, order stage range"
```

---

### Task 4: `ShiftConfigManager` — end-time input + edit-in-place

**Files:**
- Modify: `src/screens/ShiftsScreen.jsx:256-301` (the `ShiftConfigManager` component)

**Interfaces:**
- Consumes: `updateShiftConfig(id, fields)` from Task 3.
- Produces: nothing consumed by later tasks — this is a leaf UI change.

- [ ] **Step 1: Replace the entire `ShiftConfigManager` component**

Find this block (currently lines 256-301):
```jsx
function ShiftConfigManager({ shiftConfigs, onChanged }) {
  const [label, setLabel] = useState('');
  const [branch, setBranch] = useState(BRANCHES[0]);
  const [startTime, setStartTime] = useState('07:00');
  const [wagePerShift, setWagePerShift] = useState('');
  const [saving, setSaving] = useState(false);

  const add = async () => {
    if (!label.trim()) return;
    setSaving(true);
    try {
      await addShiftConfig({ label, branch, startTime, wagePerShift: Number(wagePerShift) || 0 });
      setLabel(''); setWagePerShift('');
      onChanged();
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    await deleteShiftConfig(id);
    onChanged();
  };

  return (
    <div style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ font: 'var(--text-label)', color: 'var(--text-primary)' }}>Quản lý ca làm việc (Chủ sở hữu)</div>
      {shiftConfigs.map((s) => (
        <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
            {s.label}{s.branch ? ` — ${s.branch}` : ''} — {s.start_time.slice(0, 5)}{s.wage_per_shift ? ` — ${Number(s.wage_per_shift).toLocaleString('vi-VN')}đ/ca` : ''}
          </div>
          <Button variant="ghost" size="sm" onClick={() => remove(s.id)}>✕</Button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <Input label="Tên ca" placeholder="VD: Ca tối" value={label} onChange={(e) => setLabel(e.target.value)} style={{ flex: '2 1 140px' }} />
        <Select label="Chi nhánh" value={branch} onChange={(e) => setBranch(e.target.value)}
          options={BRANCHES.map((b) => ({ value: b, label: b }))} style={{ flex: '2 1 160px' }} />
        <Input label="Giờ bắt đầu" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} style={{ flex: '1 1 100px' }} />
        <Input label="Lương/ca" type="number" placeholder="VD: 200000" value={wagePerShift} onChange={(e) => setWagePerShift(e.target.value)} style={{ flex: '1 1 120px' }} />
        <Button variant="secondary" size="sm" onClick={add} disabled={saving}>+ Thêm ca</Button>
      </div>
    </div>
  );
}
```

Replace it entirely with:
```jsx
function ShiftConfigRow({ config, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [endTime, setEndTime] = useState(config.end_time ? config.end_time.slice(0, 5) : '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await updateShiftConfig(config.id, { endTime: endTime || null });
      setEditing(false);
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
        {config.label}{config.branch ? ` — ${config.branch}` : ''} — {config.start_time.slice(0, 5)}
        {config.end_time ? `–${config.end_time.slice(0, 5)}` : ' (chưa có giờ kết thúc)'}
        {config.wage_per_shift ? ` — ${Number(config.wage_per_shift).toLocaleString('vi-VN')}đ/ca` : ''}
      </div>
      {editing ? (
        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
          <Input label="Giờ kết thúc" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} style={{ width: 110 }} />
          <Button variant="secondary" size="sm" onClick={save} disabled={saving}>Lưu</Button>
          <Button variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={saving}>Huỷ</Button>
        </div>
      ) : (
        <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>Sửa giờ kết thúc</Button>
      )}
    </div>
  );
}

function ShiftConfigManager({ shiftConfigs, onChanged }) {
  const [label, setLabel] = useState('');
  const [branch, setBranch] = useState(BRANCHES[0]);
  const [startTime, setStartTime] = useState('07:00');
  const [endTime, setEndTime] = useState('');
  const [wagePerShift, setWagePerShift] = useState('');
  const [saving, setSaving] = useState(false);

  const add = async () => {
    if (!label.trim()) return;
    setSaving(true);
    try {
      await addShiftConfig({ label, branch, startTime, wagePerShift: Number(wagePerShift) || 0 });
      setLabel(''); setEndTime(''); setWagePerShift('');
      onChanged();
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    await deleteShiftConfig(id);
    onChanged();
  };

  return (
    <div style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ font: 'var(--text-label)', color: 'var(--text-primary)' }}>Quản lý ca làm việc (Chủ sở hữu)</div>
      {shiftConfigs.map((s) => (
        <div key={s.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <ShiftConfigRow config={s} onSaved={onChanged} />
            <Button variant="ghost" size="sm" onClick={() => remove(s.id)}>✕</Button>
          </div>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <Input label="Tên ca" placeholder="VD: Ca tối" value={label} onChange={(e) => setLabel(e.target.value)} style={{ flex: '2 1 140px' }} />
        <Select label="Chi nhánh" value={branch} onChange={(e) => setBranch(e.target.value)}
          options={BRANCHES.map((b) => ({ value: b, label: b }))} style={{ flex: '2 1 160px' }} />
        <Input label="Giờ bắt đầu" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} style={{ flex: '1 1 100px' }} />
        <Input label="Giờ kết thúc" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} style={{ flex: '1 1 100px' }} />
        <Input label="Lương/ca" type="number" placeholder="VD: 200000" value={wagePerShift} onChange={(e) => setWagePerShift(e.target.value)} style={{ flex: '1 1 120px' }} />
        <Button variant="secondary" size="sm" onClick={add} disabled={saving}>+ Thêm ca</Button>
      </div>
    </div>
  );
}
```

Note: the add-form's `endTime` isn't sent to `addShiftConfig` (that function's signature isn't being changed in this plan — it doesn't accept an `endTime` param). This is intentional: after adding, the owner uses the same "Sửa giờ kết thúc" inline action every other row uses, keeping one code path for setting `end_time` instead of two. Reset `endTime` to `''` after add for a clean next entry, but its value isn't used yet.

Actually — fix that inconsistency now, it's a one-line change and free while we're already in this function. In `addShiftConfig`'s call inside `add()`, this task does NOT modify `addShiftConfig` itself (Task 3 didn't add an `endTime` param there, on purpose — keep `addShiftConfig`'s signature exactly as-is, no scope creep). Leave the add-form's `endTime` input as build-then-edit: type the end time when adding, then immediately click "Sửa giờ kết thúc" on the newly created row to save it via `updateShiftConfig`. This is a minor extra click, acceptable per the spec's "owner backfills at their own pace" framing — do not add an `endTime` param to `addShiftConfig` in this task.

- [ ] **Step 2: Add the `updateShiftConfig` import**

At the top of `src/screens/ShiftsScreen.jsx`, find:
```jsx
import {
  fetchShiftConfigs, addShiftConfig, deleteShiftConfig,
  fetchShiftLogs, fetchShiftLogsRange, addShiftCheckin, addShiftCheckout, addLeaveRequest,
  createApprovalRequest,
} from '../lib/queries';
```
Change to:
```jsx
import {
  fetchShiftConfigs, addShiftConfig, updateShiftConfig, deleteShiftConfig,
  fetchShiftLogs, fetchShiftLogsRange, addShiftCheckin, addShiftCheckout, addLeaveRequest,
  createApprovalRequest,
} from '../lib/queries';
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: succeeds, no errors.

- [ ] **Step 4: Commit**

```bash
git add src/screens/ShiftsScreen.jsx
git commit -m "Let owner set and edit each shift config's end time"
```

---

### Task 5: KPI pure-computation functions

**Files:**
- Modify: `src/lib/kpi.js`

**Interfaces:**
- Consumes: nothing new (pure functions over plain data).
- Produces: `computeShiftHours(shiftLogs, shiftConfigs, staffId)`, `computeAssignedTaskCount(tasks, staffId)`, `computeLeaveDayCount(approvalRequests, staffId, from, to)`, `computeCoworkingHours(orderStages, staffId)` — all consumed by Task 6 (`KpiScreen.jsx`).

- [ ] **Step 1: Append the four functions to `src/lib/kpi.js`**

Add after the existing `computeKitchenKpi`:

```js
const MS_PER_HOUR = 3600000;

function timeStrToMinutes(t) {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

// Ghép cặp checkin/checkout theo work_date để tính giờ làm, giờ tăng ca (so với
// shift_configs.end_time nếu đã cấu hình), và giờ trễ (late_minutes trên dòng checkin).
export function computeShiftHours(shiftLogs, shiftConfigs, staffId) {
  const mine = shiftLogs.filter((l) => l.staff_id === staffId);
  const byDate = {};
  for (const log of mine) {
    if (!byDate[log.work_date]) byDate[log.work_date] = {};
    if (log.type === 'checkin') byDate[log.work_date].checkin = log;
    if (log.type === 'checkout') byDate[log.work_date].checkout = log;
  }
  let hoursWorked = 0;
  let overtimeHours = 0;
  let lateHours = 0;
  let hasUnconfiguredShift = false;
  for (const workDate of Object.keys(byDate)) {
    const { checkin, checkout } = byDate[workDate];
    if (checkin) lateHours += (checkin.late_minutes || 0) / 60;
    if (!checkin || !checkout) continue;
    const actualHours = (new Date(checkout.checkin_time) - new Date(checkin.checkin_time)) / MS_PER_HOUR;
    if (actualHours <= 0) continue;
    hoursWorked += actualHours;
    const config = shiftConfigs.find((c) => c.label === checkin.shift_label && (c.branch || null) === (checkin.branch || null));
    if (!config || !config.end_time) { hasUnconfiguredShift = true; continue; }
    const startMin = timeStrToMinutes(config.start_time);
    let endMin = timeStrToMinutes(config.end_time);
    if (endMin <= startMin) endMin += 24 * 60; // ca qua đêm
    const expectedHours = (endMin - startMin) / 60;
    overtimeHours += Math.max(0, actualHours - expectedHours);
  }
  return {
    hoursWorked: Math.round(hoursWorked * 10) / 10,
    overtimeHours: Math.round(overtimeHours * 10) / 10,
    lateHours: Math.round(lateHours * 10) / 10,
    hasUnconfiguredShift,
  };
}

export function computeAssignedTaskCount(tasks, staffId) {
  return tasks.filter((t) => t.category === 'assigned' && t.assignee_id === staffId).length;
}

export function computeLeaveDayCount(approvalRequests, staffId, from, to) {
  const dates = new Set();
  for (const r of approvalRequests) {
    if (r.type !== 'leave_request' || r.status !== 'approved') continue;
    if (r.requester_id !== staffId) continue;
    if (!r.leave_date) continue;
    if (from && r.leave_date < from) continue;
    if (to && r.leave_date > to) continue;
    dates.add(r.leave_date);
  }
  return dates.size;
}

// Tổng thời gian trùng giờ [started_at, ended_at] giữa các công đoạn cùng đơn
// nhưng khác người phụ trách — phản ánh thời gian "làm cùng nhau" trong bếp.
export function computeCoworkingHours(orderStages, staffId) {
  const byOrder = {};
  for (const s of orderStages) {
    if (!s.started_at || !s.ended_at) continue;
    if (!byOrder[s.order_id]) byOrder[s.order_id] = [];
    byOrder[s.order_id].push(s);
  }
  let overlapMs = 0;
  for (const orderId of Object.keys(byOrder)) {
    const stages = byOrder[orderId];
    const mine = stages.filter((s) => s.assignee_id === staffId);
    const others = stages.filter((s) => s.assignee_id && s.assignee_id !== staffId);
    for (const m of mine) {
      const mStart = new Date(m.started_at).getTime();
      const mEnd = new Date(m.ended_at).getTime();
      for (const o of others) {
        const oStart = new Date(o.started_at).getTime();
        const oEnd = new Date(o.ended_at).getTime();
        const overlap = Math.min(mEnd, oEnd) - Math.max(mStart, oStart);
        if (overlap > 0) overlapMs += overlap;
      }
    }
  }
  return Math.round((overlapMs / MS_PER_HOUR) * 10) / 10;
}
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: succeeds, no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/kpi.js
git commit -m "Add pure computation functions for the six extended KPI metrics"
```

---

### Task 6: `KpiScreen.jsx` — period picker + six-metric section

**Files:**
- Modify: `src/screens/KpiScreen.jsx` (full-file rewrite)

**Interfaces:**
- Consumes: `mondayOf`, `weekDates`, `startOfMonth`, `endOfMonth` (Task 2); `fetchShiftLogsRange`, `fetchTasks`, `fetchApprovalRequests`, `fetchOrderStagesRange`, `fetchShiftConfigs` (Task 3, plus pre-existing `fetchOrders`/`fetchProductionLogs`/`fetchAllProfiles`); `computeShiftHours`, `computeAssignedTaskCount`, `computeLeaveDayCount`, `computeCoworkingHours` (Task 5, plus pre-existing `computeShipperKpi`/`computeKitchenKpi`).
- Produces: nothing consumed by later tasks — this is the final leaf UI task.

- [ ] **Step 1: Replace the entire contents of `src/screens/KpiScreen.jsx`**

```jsx
import React, { useEffect, useMemo, useState } from 'react';
import { Tabs } from '../components/navigation/Tabs';
import { Card } from '../components/data/Card';
import { Button } from '../components/forms/Button';
import { IconClipboard } from '../components/icons/FrogIcons';
import {
  fetchOrders, fetchProductionLogs, fetchAllProfiles,
  fetchShiftLogsRange, fetchTasks, fetchApprovalRequests, fetchOrderStagesRange, fetchShiftConfigs,
} from '../lib/queries';
import { computeShipperKpi, computeKitchenKpi, computeShiftHours, computeAssignedTaskCount, computeLeaveDayCount, computeCoworkingHours } from '../lib/kpi';
import { hasAnyRole, hasRole } from '../lib/roles';
import { useAuth } from '../lib/AuthContext';
import { localDateStr, mondayOf, weekDates, startOfMonth, endOfMonth } from '../lib/date';

const KITCHEN_ROLES = ['kitchen', 'bakery', 'kitchen_lead', 'kitchen_deputy'];

function periodRangeFor(unit, anchor) {
  if (unit === 'day') {
    const s = localDateStr(anchor);
    return { from: s, to: s };
  }
  if (unit === 'week') {
    const days = weekDates(mondayOf(anchor));
    return { from: localDateStr(days[0]), to: localDateStr(days[6]) };
  }
  return { from: localDateStr(startOfMonth(anchor)), to: localDateStr(endOfMonth(anchor)) };
}

function periodLabelFor(unit, anchor) {
  if (unit === 'day') return anchor.toLocaleDateString('vi-VN');
  if (unit === 'week') {
    const days = weekDates(mondayOf(anchor));
    return `${days[0].toLocaleDateString('vi-VN')} - ${days[6].toLocaleDateString('vi-VN')}`;
  }
  return `Tháng ${anchor.getMonth() + 1}/${anchor.getFullYear()}`;
}

function shiftAnchor(unit, anchor, dir) {
  const d = new Date(anchor);
  if (unit === 'day') { d.setDate(d.getDate() + dir); return d; }
  if (unit === 'week') { d.setDate(d.getDate() + dir * 7); return d; }
  d.setDate(1);
  d.setMonth(d.getMonth() + dir);
  return d;
}

function ShipperKpiCard({ name, kpi }) {
  return (
    <Card style={{ flex: '1 1 240px' }}>
      <div style={{ font: 'var(--text-title)', color: 'var(--text-primary)', marginBottom: 10 }}>{name}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ font: 'var(--text-body)', color: 'var(--text-secondary)' }}>Số đơn đã giao: <b style={{ color: 'var(--text-primary)' }}>{kpi.orderCount}</b></div>
        <div style={{ font: 'var(--text-body)', color: 'var(--text-secondary)' }}>Tổng km đã chạy: <b style={{ color: 'var(--text-primary)' }}>{kpi.totalKm} km</b></div>
      </div>
    </Card>
  );
}

function KitchenKpiCard({ name, kpi }) {
  return (
    <Card style={{ flex: '1 1 240px' }}>
      <div style={{ font: 'var(--text-title)', color: 'var(--text-primary)', marginBottom: 10 }}>{name}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ font: 'var(--text-body)', color: 'var(--text-secondary)' }}>Số đơn đã làm: <b style={{ color: 'var(--text-primary)' }}>{kpi.orderCount}</b></div>
        <div style={{ font: 'var(--text-body)', color: 'var(--text-secondary)' }}>SP từ đơn: <b style={{ color: 'var(--text-primary)' }}>{kpi.productsFromOrders}</b></div>
        <div style={{ font: 'var(--text-body)', color: 'var(--text-secondary)' }}>SP sản xuất: <b style={{ color: 'var(--text-primary)' }}>{kpi.productsProduced}</b></div>
      </div>
    </Card>
  );
}

function ExtendedKpiCard({ name, kpi }) {
  return (
    <Card style={{ flex: '1 1 240px' }}>
      <div style={{ font: 'var(--text-title)', color: 'var(--text-primary)', marginBottom: 10 }}>{name}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ font: 'var(--text-body)', color: 'var(--text-secondary)' }}>Tổng giờ làm: <b style={{ color: 'var(--text-primary)' }}>{kpi.hoursWorked}h</b></div>
        <div style={{ font: 'var(--text-body)', color: 'var(--text-secondary)' }}>
          Giờ tăng ca: <b style={{ color: 'var(--text-primary)' }}>{kpi.overtimeHours}h</b>
          {kpi.hasUnconfiguredShift && <span style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}> (một số ca chưa cấu hình giờ kết thúc)</span>}
        </div>
        <div style={{ font: 'var(--text-body)', color: 'var(--text-secondary)' }}>Tổng việc được giao: <b style={{ color: 'var(--text-primary)' }}>{kpi.assignedTaskCount}</b></div>
        <div style={{ font: 'var(--text-body)', color: 'var(--text-secondary)' }}>Tổng ngày nghỉ: <b style={{ color: 'var(--text-primary)' }}>{kpi.leaveDayCount}</b></div>
        <div style={{ font: 'var(--text-body)', color: 'var(--text-secondary)' }}>Tổng giờ trễ: <b style={{ color: 'var(--text-primary)' }}>{kpi.lateHours}h</b></div>
        <div style={{ font: 'var(--text-body)', color: 'var(--text-secondary)' }}>Làm cùng nhau: <b style={{ color: 'var(--text-primary)' }}>{kpi.coworkingHours}h</b></div>
      </div>
    </Card>
  );
}

export default function KpiScreen() {
  const { profile } = useAuth();
  const [unit, setUnit] = useState('day');
  const [anchor, setAnchor] = useState(() => new Date());
  const [ordersByCreation, setOrdersByCreation] = useState([]);
  const [ordersByCompletion, setOrdersByCompletion] = useState([]);
  const [productionLogs, setProductionLogs] = useState([]);
  const [allProfiles, setAllProfiles] = useState([]);
  const [shiftLogs, setShiftLogs] = useState([]);
  const [shiftConfigs, setShiftConfigs] = useState([]);
  const [assignedTasks, setAssignedTasks] = useState([]);
  const [approvedLeaveRequests, setApprovedLeaveRequests] = useState([]);
  const [orderStages, setOrderStages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const isAdmin = hasAnyRole(profile, ['owner', 'admin']);
  const { from, to } = periodRangeFor(unit, anchor);

  useEffect(() => {
    setLoading(true);
    setError('');
    const loads = [
      fetchOrders({ from, to }),
      fetchOrders({ from, to, dateField: 'completed_at' }),
      fetchProductionLogs({ from, to }).catch(() => []),
      fetchShiftLogsRange(from, to),
      fetchShiftConfigs(),
      fetchTasks({ category: 'assigned', createdFrom: from, createdTo: to }),
      fetchApprovalRequests({ status: 'approved', type: 'leave_request' }),
      fetchOrderStagesRange(from, to),
    ];
    if (isAdmin) loads.push(fetchAllProfiles());
    Promise.all(loads)
      .then(([ordersData, ordersCompletedData, logsData, shiftLogsData, shiftConfigsData, tasksData, leaveData, stagesData, profilesData]) => {
        setOrdersByCreation(ordersData);
        setOrdersByCompletion(ordersCompletedData);
        setProductionLogs(logsData);
        setShiftLogs(shiftLogsData);
        setShiftConfigs(shiftConfigsData);
        setAssignedTasks(tasksData);
        setApprovedLeaveRequests(leaveData);
        setOrderStages(stagesData);
        if (profilesData) setAllProfiles(profilesData);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, isAdmin]);

  const kpiStaffList = useMemo(() => {
    if (!isAdmin) return [];
    return allProfiles.filter((p) => hasAnyRole(p, ['shipper', ...KITCHEN_ROLES]));
  }, [allProfiles, isAdmin]);

  const extendedStaffList = useMemo(() => {
    if (!isAdmin) return [];
    return allProfiles.filter((p) => p.approved);
  }, [allProfiles, isAdmin]);

  function extendedKpiFor(staffId) {
    const shift = computeShiftHours(shiftLogs, shiftConfigs, staffId);
    return {
      ...shift,
      assignedTaskCount: computeAssignedTaskCount(assignedTasks, staffId),
      leaveDayCount: computeLeaveDayCount(approvedLeaveRequests, staffId, from, to),
      coworkingHours: computeCoworkingHours(orderStages, staffId),
    };
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ font: 'var(--text-display-md)', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <IconClipboard size={22} /> KPI
      </div>

      <Tabs
        tabs={[
          { key: 'day', label: 'Ngày' },
          { key: 'week', label: 'Tuần' },
          { key: 'month', label: 'Tháng' },
        ]}
        active={unit}
        onChange={setUnit}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Button variant="ghost" size="sm" onClick={() => setAnchor((a) => shiftAnchor(unit, a, -1))}>‹</Button>
        <div style={{ font: 'var(--text-body)', color: 'var(--text-primary)' }}>{periodLabelFor(unit, anchor)}</div>
        <Button variant="ghost" size="sm" onClick={() => setAnchor((a) => shiftAnchor(unit, a, 1))}>›</Button>
      </div>

      {error ? (
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)' }}>Lỗi tải KPI: {error}</div>
      ) : loading ? (
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Đang tải...</div>
      ) : isAdmin ? (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {extendedStaffList.length === 0 && (
              <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Chưa có nhân viên nào.</div>
            )}
            {extendedStaffList.map((p) => (
              <ExtendedKpiCard key={p.id} name={p.full_name} kpi={extendedKpiFor(p.id)} />
            ))}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {kpiStaffList.map((p) => (
              <React.Fragment key={p.id}>
                {hasRole(p, 'shipper') && (
                  <ShipperKpiCard name={p.full_name} kpi={computeShipperKpi(ordersByCompletion, p.full_name)} />
                )}
                {hasAnyRole(p, KITCHEN_ROLES) && (
                  <KitchenKpiCard name={p.full_name} kpi={computeKitchenKpi(ordersByCreation, productionLogs, p.full_name)} />
                )}
              </React.Fragment>
            ))}
          </div>
        </>
      ) : (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <ExtendedKpiCard name={profile?.full_name} kpi={extendedKpiFor(profile?.id)} />
          </div>
          {(hasRole(profile, 'shipper') || hasAnyRole(profile, KITCHEN_ROLES)) && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              {hasRole(profile, 'shipper') && (
                <ShipperKpiCard name={profile?.full_name} kpi={computeShipperKpi(ordersByCompletion, profile?.full_name)} />
              )}
              {hasAnyRole(profile, KITCHEN_ROLES) && (
                <KitchenKpiCard name={profile?.full_name} kpi={computeKitchenKpi(ordersByCreation, productionLogs, profile?.full_name)} />
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
```

Notes on what changed vs. the original file: the `RANGE_DAYS`/`rangeFor`/`customFrom`/`customTo` machinery is gone, replaced by `unit`/`anchor` state and `periodRangeFor`/`periodLabelFor`/`shiftAnchor`. The `Input` import is gone (no more custom date pickers) and `Button` is now imported instead (for the prev/next arrows). Every existing role-specific card and its data source (`ordersByCreation`, `ordersByCompletion`, `productionLogs`, `computeShipperKpi`, `computeKitchenKpi`) is preserved unchanged — only wrapped in a `<>...</>` fragment alongside the new extended-metrics block. The non-admin branch's old "Vai trò của bạn chưa có chỉ số KPI." fallback is removed because *every* staff member now has the extended metrics — there's no longer a role for which the KPI screen has nothing to show.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: succeeds, no errors.

- [ ] **Step 3: Commit**

```bash
git add src/screens/KpiScreen.jsx
git commit -m "Add day/week/month period picker and six universal KPI metrics"
```
