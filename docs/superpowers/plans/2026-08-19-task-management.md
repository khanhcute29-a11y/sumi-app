# Task Management (Quản lý công việc) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the "Quản lý công việc" flow — daily checklist templates, owner-assigned multi-person tasks with an exemption-only flow, self-reported ad-hoc work, and a self-claim extension to the existing Shipping screen — per `docs/superpowers/specs/2026-08-19-task-management-design.md`.

**Architecture:** Two new Postgres tables (`task_templates`+`task_completions` for the daily-reset checklist, `tasks` for one-off assigned/ad-hoc work) plus a `task_exemption` extension of the existing `approval_requests` table. A new `TasksScreen.jsx` with three sub-tabs, composed from small per-category components under `src/components/tasks/`. `ShippingScreen.jsx` is extended (not rebuilt) to let non-shipper staff self-claim a `cho_giao` order after a last-4-digits phone check.

**Tech Stack:** React + Vite, Supabase (Postgres + RLS + Realtime), existing `src/components/forms/*` primitives (`Button`, `Input`, `Select`, `Checkbox`), `src/lib/queries.js` as the sole Supabase access layer. No test runner exists in this repo (no jest/vitest in `package.json`) — every prior flow (shift-schedule, kitchen-stages) was verified via `npm run build` + manual QA in the browser, not automated tests. This plan follows that existing convention: every task's verification step is a build check plus a concrete manual QA script, not a TDD unit test.

## Global Constraints

- Migrations are plain `.sql` files run manually by the owner in the Supabase SQL Editor — no migration runner. Write idempotent SQL (`create table if not exists`, `drop policy if exists` + `create policy`, `add column if not exists`) exactly like `supabase/migrate_order_stages.sql` and `supabase/migrate_shift_schedule.sql`.
- Role checks in RLS always use the pattern `role in (...) or extra_roles && array[...]` (see any existing policy) — never just `role = 'owner'`.
- Every mutating function in `src/lib/queries.js` ends with `notifyBadgesChanged()` (already imported/defined at the top of that file) so the global badge counters refresh without waiting on Realtime.
- No decline/reject button anywhere in the assigned-task UI — only an exemption request through `approval_requests`. Do not add one.
- Daily checklist tasks never get a `late` computation — only `tasks.category = 'assigned'` rows do.
- Vietnamese UI copy throughout, matching the existing screens' tone (see `ApprovalRequestsScreen.jsx`, `LeaveScheduleRequestModal.jsx` for reference phrasing).

---

## File Structure

**New files:**
- `supabase/migrate_task_management.sql` — schema, RLS, realtime publication.
- `src/components/StaffMultiSelect.jsx` — reusable checkbox list over a staff array.
- `src/screens/TasksScreen.jsx` — screen shell: role branching, tab state, staff/station/order-code filters, realtime.
- `src/components/tasks/DailyChecklistTab.jsx` — daily template checklist + owner end-of-day confirm.
- `src/components/tasks/AssignedTasksTab.jsx` — assigned task list, complete action, exemption trigger.
- `src/components/tasks/AssignTaskModal.jsx` — owner's multi-assignee task creation form.
- `src/components/tasks/ExemptionRequestModal.jsx` — staff's exemption request form.
- `src/components/tasks/AdhocTasksTab.jsx` — ad-hoc work list + owner delete.
- `src/components/tasks/AdhocReportModal.jsx` — staff's self-report form.

**Modified files:**
- `src/lib/queries.js` — add task-management query functions; extend `createApprovalRequest` with an optional `taskId`.
- `src/App.jsx` — import + register `TasksScreen` under a `tasks` tab key.
- `src/components/navigation/Sidebar.jsx` — add a `tasks` nav item.
- `src/screens/ApprovalRequestsScreen.jsx` — add `task_exemption` to `TYPE_LABELS`; on approving a `task_exemption` request, also call the new `exemptTask`.
- `src/screens/ShippingScreen.jsx` — let non-shipper staff self-claim a `cho_giao` order via last-4-digits phone verification; log the claim as an ad-hoc task.

---

## Task 1: Database migration

**Files:**
- Create: `supabase/migrate_task_management.sql`

**Interfaces:**
- Produces: tables `task_templates`, `task_completions`, `tasks`; `approval_requests.type` widened to include `'task_exemption'`; `approval_requests.task_id` column. All later tasks depend on these exact column names.

- [ ] **Step 1: Write the migration file**

```sql
-- Run manually in Supabase SQL Editor. Safe to re-run (idempotent).

create table if not exists task_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  station text check (station in ('bakery','nong','lanh','xuong41','xuong42')),
  active boolean not null default true,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table task_templates enable row level security;

drop policy if exists "read task_templates" on task_templates;
create policy "read task_templates" on task_templates for select
  using (auth.role() = 'authenticated' and public.is_approved());

drop policy if exists "owner manage task_templates" on task_templates;
create policy "owner manage task_templates" on task_templates for all
  using (
    exists (
      select 1 from profiles
      where id = auth.uid()
        and (role in ('owner','admin') or extra_roles && array['owner','admin'])
    )
  )
  with check (auth.role() = 'authenticated' and public.is_approved());

create table if not exists task_completions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references task_templates(id) on delete cascade,
  staff_id uuid not null references profiles(id) on delete cascade,
  date date not null default current_date,
  completed_at timestamptz,
  confirmed_by uuid references profiles(id) on delete set null,
  confirmed_at timestamptz,
  unique (template_id, staff_id, date)
);

alter table task_completions enable row level security;

drop policy if exists "read task_completions" on task_completions;
create policy "read task_completions" on task_completions for select
  using (auth.role() = 'authenticated' and public.is_approved());

drop policy if exists "self insert task_completions" on task_completions;
create policy "self insert task_completions" on task_completions for insert
  with check (
    auth.role() = 'authenticated' and public.is_approved()
    and staff_id = auth.uid()
  );

drop policy if exists "self or owner update task_completions" on task_completions;
create policy "self or owner update task_completions" on task_completions for update
  using (
    staff_id = auth.uid()
    or exists (
      select 1 from profiles
      where id = auth.uid()
        and (role in ('owner','admin') or extra_roles && array['owner','admin'])
    )
  )
  with check (auth.role() = 'authenticated' and public.is_approved());

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('assigned','adhoc')),
  title text not null,
  description text,
  order_code text,
  assignee_id uuid not null references profiles(id) on delete cascade,
  deadline timestamptz,
  batch_id uuid,
  status text not null default 'open' check (status in ('open','done','exempted')),
  completed_at timestamptz,
  late boolean,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table tasks enable row level security;

drop policy if exists "read own or owner tasks" on tasks;
create policy "read own or owner tasks" on tasks for select
  using (
    assignee_id = auth.uid()
    or exists (
      select 1 from profiles
      where id = auth.uid()
        and (role in ('owner','admin') or extra_roles && array['owner','admin'])
    )
  );

drop policy if exists "insert tasks" on tasks;
create policy "insert tasks" on tasks for insert
  with check (
    auth.role() = 'authenticated' and public.is_approved()
    and (
      (category = 'adhoc' and assignee_id = auth.uid())
      or exists (
        select 1 from profiles
        where id = auth.uid()
          and (role in ('owner','admin') or extra_roles && array['owner','admin'])
      )
    )
  );

drop policy if exists "assignee or owner update tasks" on tasks;
create policy "assignee or owner update tasks" on tasks for update
  using (
    assignee_id = auth.uid()
    or exists (
      select 1 from profiles
      where id = auth.uid()
        and (role in ('owner','admin') or extra_roles && array['owner','admin'])
    )
  )
  with check (auth.role() = 'authenticated' and public.is_approved());

drop policy if exists "owner delete tasks" on tasks;
create policy "owner delete tasks" on tasks for delete
  using (
    exists (
      select 1 from profiles
      where id = auth.uid()
        and (role in ('owner','admin') or extra_roles && array['owner','admin'])
    )
  );

alter table approval_requests drop constraint if exists approval_requests_type_check;
alter table approval_requests add constraint approval_requests_type_check
  check (type in ('order_edit','order_cancel','order_delete','shift_recheck','leave_request','task_exemption'));

alter table approval_requests add column if not exists task_id uuid references tasks(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'task_templates'
  ) then
    alter publication supabase_realtime add table task_templates;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'task_completions'
  ) then
    alter publication supabase_realtime add table task_completions;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tasks'
  ) then
    alter publication supabase_realtime add table tasks;
  end if;
end $$;
```

- [ ] **Step 2: Verify SQL is syntactically valid**

Run: `cat supabase/migrate_task_management.sql | grep -c "create table\|create policy\|alter table"`
Expected: a positive count with no shell error (this is a syntax sanity smoke check, not execution — the owner runs the actual SQL by hand in Supabase per project convention, same as every prior migration in this repo).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrate_task_management.sql
git commit -m "Add task management schema migration (templates, completions, tasks, exemption type)"
```

---

## Task 2: Query functions — daily checklist templates & completions

**Files:**
- Modify: `src/lib/queries.js` (add new exported functions near the end of the file, after `fetchSubordinates`)

**Interfaces:**
- Consumes: `supabase` client and `notifyBadgesChanged()` already defined at the top of `queries.js`.
- Produces: `fetchTaskTemplates({active})`, `createTaskTemplate({title, station, createdBy})`, `updateTaskTemplate(id, {title, station, active})`, `fetchTaskCompletions({date})`, `setTaskCompletion({templateId, staffId, date, completed})`, `confirmTaskCompletion(id, {confirmedBy})` — used by Task 6.

- [ ] **Step 1: Add the functions**

```js
// --- Task management: daily checklist templates ---

export async function fetchTaskTemplates({ active = true } = {}) {
  let q = supabase.from('task_templates').select('*').order('created_at', { ascending: true });
  if (active !== null) q = q.eq('active', active);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function createTaskTemplate({ title, station, createdBy }) {
  const { error } = await supabase.from('task_templates').insert({ title, station: station || null, created_by: createdBy || null });
  if (error) throw error;
  notifyBadgesChanged();
}

export async function updateTaskTemplate(id, { title, station, active }) {
  const fields = {};
  if (title !== undefined) fields.title = title;
  if (station !== undefined) fields.station = station || null;
  if (active !== undefined) fields.active = active;
  const { error } = await supabase.from('task_templates').update(fields).eq('id', id);
  if (error) throw error;
  notifyBadgesChanged();
}

// --- Task management: daily checklist completions ---

export async function fetchTaskCompletions({ date }) {
  const { data, error } = await supabase.from('task_completions').select('*').eq('date', date);
  if (error) throw error;
  return data;
}

export async function setTaskCompletion({ templateId, staffId, date, completed }) {
  const { data: existing, error: findErr } = await supabase
    .from('task_completions').select('id').eq('template_id', templateId).eq('staff_id', staffId).eq('date', date).maybeSingle();
  if (findErr) throw findErr;
  if (existing) {
    const { error } = await supabase.from('task_completions').update({ completed_at: completed ? new Date().toISOString() : null }).eq('id', existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('task_completions').insert({ template_id: templateId, staff_id: staffId, date, completed_at: completed ? new Date().toISOString() : null });
    if (error) throw error;
  }
  notifyBadgesChanged();
}

export async function confirmTaskCompletion(id, { confirmedBy }) {
  const { error } = await supabase.from('task_completions').update({ confirmed_by: confirmedBy, confirmed_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
  notifyBadgesChanged();
}
```

- [ ] **Step 2: Verify the build compiles**

Run: `npm run build`
Expected: exits 0 with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/queries.js
git commit -m "Add query functions for daily checklist templates and completions"
```

---

## Task 3: Query functions — assigned/ad-hoc tasks & exemption requests

**Files:**
- Modify: `src/lib/queries.js` (add after the functions from Task 2; also extend the existing `createApprovalRequest`)

**Interfaces:**
- Consumes: existing `createApprovalRequest` (lines ~606-614 per current file) — extend, don't replace.
- Produces: `fetchTasks({assigneeId, category, status})`, `createAssignedTasks(rows)`, `createAdhocTask({assigneeId, title, description, orderCode, createdBy})`, `completeTask(id)`, `updateTask(id, fields)`, `deleteTask(id)`, `requestTaskExemption({taskId, requesterId, requesterName, requesterRole, reason, photoUrl})`, `exemptTask(id)` — used by Tasks 7, 8, 9, 10.

- [ ] **Step 1: Extend `createApprovalRequest` to accept an optional `taskId`**

Find the existing function (currently):
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

Replace with:
```js
export async function createApprovalRequest({ type, orderId, orderCode, shiftLogId, requesterId, requesterName, requesterRole, reason, photoUrl, leaveDate, taskId }) {
  const { error } = await supabase.from('approval_requests').insert({
    type, order_id: orderId || null, order_code: orderCode || null, shift_log_id: shiftLogId || null,
    requester_id: requesterId || null, requester_name: requesterName || null, requester_role: requesterRole || null,
    reason: reason || null, photo_url: photoUrl || null, leave_date: leaveDate || null, task_id: taskId || null,
  });
  if (error) throw error;
  notifyBadgesChanged();
}
```

- [ ] **Step 2: Add the new functions**

```js
// --- Task management: assigned & ad-hoc tasks ---

export async function fetchTasks({ assigneeId, category, status } = {}) {
  let q = supabase.from('tasks').select('*').order('created_at', { ascending: false });
  if (assigneeId) q = q.eq('assignee_id', assigneeId);
  if (category) q = q.eq('category', category);
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function createAssignedTasks(rows) {
  const { error } = await supabase.from('tasks').insert(rows.map((r) => ({ ...r, category: 'assigned' })));
  if (error) throw error;
  notifyBadgesChanged();
}

export async function createAdhocTask({ assigneeId, title, description, orderCode, createdBy }) {
  const { error } = await supabase.from('tasks').insert({
    category: 'adhoc', assignee_id: assigneeId, title, description: description || null, order_code: orderCode || null, created_by: createdBy || null,
  });
  if (error) throw error;
  notifyBadgesChanged();
}

export async function completeTask(id) {
  const { data: task, error: findErr } = await supabase.from('tasks').select('deadline').eq('id', id).single();
  if (findErr) throw findErr;
  const completedAt = new Date();
  const late = task.deadline ? completedAt.getTime() > new Date(task.deadline).getTime() : false;
  const { error } = await supabase.from('tasks').update({ status: 'done', completed_at: completedAt.toISOString(), late }).eq('id', id);
  if (error) throw error;
  notifyBadgesChanged();
}

export async function updateTask(id, fields) {
  const { error } = await supabase.from('tasks').update(fields).eq('id', id);
  if (error) throw error;
  notifyBadgesChanged();
}

export async function deleteTask(id) {
  const { error } = await supabase.from('tasks').delete().eq('id', id);
  if (error) throw error;
  notifyBadgesChanged();
}

export async function requestTaskExemption({ taskId, requesterId, requesterName, requesterRole, reason, photoUrl }) {
  await createApprovalRequest({ type: 'task_exemption', taskId, reason, photoUrl, requesterId, requesterName, requesterRole });
}

export async function exemptTask(id) {
  const { error } = await supabase.from('tasks').update({ status: 'exempted' }).eq('id', id);
  if (error) throw error;
  notifyBadgesChanged();
}
```

- [ ] **Step 3: Verify the build compiles**

Run: `npm run build`
Expected: exits 0 with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/queries.js
git commit -m "Add query functions for assigned/ad-hoc tasks and exemption requests"
```

---

## Task 4: StaffMultiSelect component

**Files:**
- Create: `src/components/StaffMultiSelect.jsx`

**Interfaces:**
- Consumes: `Checkbox` from `src/components/forms/Checkbox.jsx` (props: `label`, `checked`, `onChange(nextBool)`).
- Produces: `<StaffMultiSelect staff={[{id, full_name}]} selectedIds={string[]} onChange={(nextIds) => void} />` — used by Task 7's `AssignTaskModal`.

- [ ] **Step 1: Write the component**

```jsx
import React from 'react';
import { Checkbox } from './forms/Checkbox';

export function StaffMultiSelect({ staff, selectedIds, onChange }) {
  const toggle = (id) => {
    if (selectedIds.includes(id)) onChange(selectedIds.filter((x) => x !== id));
    else onChange([...selectedIds, id]);
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', padding: 10 }}>
      {staff.length === 0 && <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Không có nhân viên.</div>}
      {staff.map((p) => (
        <Checkbox key={p.id} label={p.full_name} checked={selectedIds.includes(p.id)} onChange={() => toggle(p.id)} />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify the build compiles**

Run: `npm run build`
Expected: exits 0 with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/StaffMultiSelect.jsx
git commit -m "Add StaffMultiSelect component for multi-assignee task creation"
```

---

## Task 5: TasksScreen shell + navigation wiring

**Files:**
- Create: `src/screens/TasksScreen.jsx` (shell only — renders placeholders for the three tab bodies, which Tasks 6-8 fill in)
- Modify: `src/App.jsx` (import + tab map, around lines 15-32 and 113-117)
- Modify: `src/components/navigation/Sidebar.jsx` (add nav item to the `items` array, around lines 9-25)

**Interfaces:**
- Consumes: `useAuth` from `../lib/AuthContext` (returns `{ profile }`), `hasAnyRole` from `../lib/roles`, `fetchAllProfiles` from `../lib/queries`, `Tabs` from `../components/navigation/Tabs`, `supabase` from `../lib/supabaseClient`.
- Produces: exports default `TasksScreen`, and defines/passes these props to child tab components (built in Tasks 6-8): `profile`, `isOwner` (bool), `viewingStaffId`, `viewingStaffName`, `viewingStation`, `staffList` (array of `{id, full_name, station, ...}`), `orderCodeFilter` (string).

- [ ] **Step 1: Write the screen shell**

```jsx
import React, { useEffect, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { hasAnyRole } from '../lib/roles';
import { supabase } from '../lib/supabaseClient';
import { fetchAllProfiles } from '../lib/queries';
import { Tabs } from '../components/navigation/Tabs';
import { Input } from '../components/forms/Input';
import { Select } from '../components/forms/Select';
import { DailyChecklistTab } from '../components/tasks/DailyChecklistTab';
import { AssignedTasksTab } from '../components/tasks/AssignedTasksTab';
import { AdhocTasksTab } from '../components/tasks/AdhocTasksTab';

const STATION_OPTIONS = [
  { value: 'bakery', label: 'Bakery' },
  { value: 'nong', label: 'Bếp nóng' },
  { value: 'lanh', label: 'Bếp lạnh' },
  { value: 'xuong41', label: 'Xưởng 41' },
  { value: 'xuong42', label: 'Xưởng 42' },
];

export default function TasksScreen() {
  const { profile } = useAuth();
  const isOwner = hasAnyRole(profile, ['owner', 'admin']);
  const [tab, setTab] = useState('daily');
  const [staffList, setStaffList] = useState([]);
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [stationFilter, setStationFilter] = useState('');
  const [orderCodeFilter, setOrderCodeFilter] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!isOwner) return;
    fetchAllProfiles().then((data) => {
      const approved = data.filter((p) => p.approved && p.full_name);
      setStaffList(approved);
      setSelectedStaffId((prev) => prev || approved[0]?.id || '');
    }).catch(() => {});
  }, [isOwner]);

  useEffect(() => {
    const channel = supabase
      .channel('tasks-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => setRefreshKey((k) => k + 1))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_completions' }, () => setRefreshKey((k) => k + 1))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_templates' }, () => setRefreshKey((k) => k + 1))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const filteredStaff = stationFilter ? staffList.filter((p) => p.station === stationFilter) : staffList;
  const viewingStaffId = isOwner ? selectedStaffId : profile?.id;
  const viewingStaffName = isOwner ? (staffList.find((p) => p.id === selectedStaffId)?.full_name || '') : profile?.full_name;
  const viewingStation = isOwner ? (staffList.find((p) => p.id === selectedStaffId)?.station || '') : profile?.station;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ font: 'var(--text-display-md)', color: 'var(--text-primary)' }}>Quản Lý Công Việc</div>
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Việc hằng ngày, việc được giao, việc phát sinh</div>
      </div>
      {isOwner && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Select label="Khâu" value={stationFilter} onChange={(e) => setStationFilter(e.target.value)} options={STATION_OPTIONS} placeholder="Tất cả khâu" style={{ maxWidth: 200 }} />
          <Select label="Nhân viên" value={selectedStaffId} onChange={(e) => setSelectedStaffId(e.target.value)} options={filteredStaff.map((p) => ({ value: p.id, label: p.full_name }))} placeholder="Chọn nhân viên" style={{ maxWidth: 240 }} />
          <Input label="Lọc theo mã đơn" placeholder="VD: DH001" value={orderCodeFilter} onChange={(e) => setOrderCodeFilter(e.target.value)} style={{ maxWidth: 200 }} />
        </div>
      )}
      <Tabs tabs={[{ key: 'daily', label: 'Hằng ngày' }, { key: 'assigned', label: 'Được giao' }, { key: 'adhoc', label: 'Phát sinh' }]} active={tab} onChange={setTab} />
      {!viewingStaffId ? (
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Chọn nhân viên để xem việc.</div>
      ) : (
        <React.Fragment>
          {tab === 'daily' && <DailyChecklistTab key={`daily-${refreshKey}`} profile={profile} isOwner={isOwner} viewingStaffId={viewingStaffId} viewingStaffName={viewingStaffName} viewingStation={viewingStation} />}
          {tab === 'assigned' && <AssignedTasksTab key={`assigned-${refreshKey}`} profile={profile} isOwner={isOwner} viewingStaffId={viewingStaffId} viewingStaffName={viewingStaffName} staffList={staffList} orderCodeFilter={orderCodeFilter} />}
          {tab === 'adhoc' && <AdhocTasksTab key={`adhoc-${refreshKey}`} profile={profile} isOwner={isOwner} viewingStaffId={viewingStaffId} viewingStaffName={viewingStaffName} orderCodeFilter={orderCodeFilter} />}
        </React.Fragment>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Register the screen in `App.jsx`**

Add to the import block (after the `import ApprovalRequestsScreen from './screens/ApprovalRequestsScreen';` line):
```js
import TasksScreen from './screens/TasksScreen';
```

Add `tasks: <TasksScreen />,` into the `screens` map (the object currently starting `const screens = { dashboard: ..., orders: ..., ... };`), e.g. immediately after `approvals: <ApprovalRequestsScreen />,`.

- [ ] **Step 3: Register the nav item in `Sidebar.jsx`**

Read the current `items` array (lines 9-25) and add a new entry after the `approvals` entry (matching the exact `{ key, label, Icon }` shape already used by every other item — reuse `IconClipboard` from `../icons/FrogIcons`, already imported elsewhere in this codebase):
```js
{ key: 'tasks', label: 'Quản Lý Công Việc', Icon: IconClipboard },
```
If `IconClipboard` is not already imported in `Sidebar.jsx`, add it to that file's icon import line.

- [ ] **Step 4: Create the placeholder tab files so the build doesn't fail**

These get filled in by Tasks 6-8, but the shell imports them, so create minimal stubs now:

`src/components/tasks/DailyChecklistTab.jsx`:
```jsx
import React from 'react';
export function DailyChecklistTab() { return null; }
```

`src/components/tasks/AssignedTasksTab.jsx`:
```jsx
import React from 'react';
export function AssignedTasksTab() { return null; }
```

`src/components/tasks/AdhocTasksTab.jsx`:
```jsx
import React from 'react';
export function AdhocTasksTab() { return null; }
```

- [ ] **Step 5: Verify the build compiles and the tab renders**

Run: `npm run build`
Expected: exits 0 with no errors.

Manual check: run `npm run dev`, log in as owner, confirm "Quản Lý Công Việc" appears in the sidebar and clicking it shows the three-tab layout with a staff/station/order-code filter row and no console errors.

- [ ] **Step 6: Commit**

```bash
git add src/screens/TasksScreen.jsx src/App.jsx src/components/navigation/Sidebar.jsx src/components/tasks/
git commit -m "Add TasksScreen shell wired into navigation"
```

---

## Task 6: Daily checklist tab

**Files:**
- Modify: `src/components/tasks/DailyChecklistTab.jsx` (replace the Task 5 stub)

**Interfaces:**
- Consumes: `fetchTaskTemplates`, `fetchTaskCompletions`, `setTaskCompletion`, `confirmTaskCompletion` from `../../lib/queries`; `localDateStr` from `../../lib/date`; `Checkbox` from `../forms/Checkbox`; `Button` from `../forms/Button`. Props from Task 5: `profile`, `isOwner`, `viewingStaffId`, `viewingStaffName`, `viewingStation`.
- Produces: nothing consumed elsewhere.

- [ ] **Step 1: Write the component**

```jsx
import React, { useEffect, useState } from 'react';
import { Checkbox } from '../forms/Checkbox';
import { Button } from '../forms/Button';
import { fetchTaskTemplates, fetchTaskCompletions, setTaskCompletion, confirmTaskCompletion } from '../../lib/queries';
import { localDateStr } from '../../lib/date';

export function DailyChecklistTab({ profile, isOwner, viewingStaffId, viewingStaffName, viewingStation }) {
  const [templates, setTemplates] = useState([]);
  const [completions, setCompletions] = useState([]);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const today = localDateStr(new Date());

  const load = () => {
    Promise.all([fetchTaskTemplates({ active: true }), fetchTaskCompletions({ date: today })])
      .then(([t, c]) => { setTemplates(t); setCompletions(c); setError(''); })
      .catch((err) => setError(err.message));
  };

  useEffect(load, [viewingStaffId]);

  const applicable = templates.filter((t) => !t.station || t.station === viewingStation);
  const completionFor = (templateId) => completions.find((c) => c.template_id === templateId && c.staff_id === viewingStaffId);
  const canToggle = !isOwner && profile?.id === viewingStaffId;

  const handleToggle = async (templateId, currentlyDone) => {
    setBusyId(templateId); setError('');
    try {
      await setTaskCompletion({ templateId, staffId: viewingStaffId, date: today, completed: !currentlyDone });
      load();
    } catch (err) { setError(err.message); } finally { setBusyId(''); }
  };

  const handleConfirm = async (completionId) => {
    setBusyId(completionId); setError('');
    try {
      await confirmTaskCompletion(completionId, { confirmedBy: profile?.id });
      load();
    } catch (err) { setError(err.message); } finally { setBusyId(''); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Checklist ngày {today}{viewingStaffName ? ` — ${viewingStaffName}` : ''}</div>
      {applicable.length === 0 && <div style={{ font: 'var(--text-body)', color: 'var(--text-muted)' }}>Chưa có việc hằng ngày nào cho khâu này.</div>}
      {applicable.map((t) => {
        const c = completionFor(t.id);
        const done = !!c?.completed_at;
        const confirmed = !!c?.confirmed_at;
        return (
          <div key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 10, background: 'var(--surface-sunken)', borderRadius: 'var(--radius-sm)' }}>
            <Checkbox label={t.title} checked={done} onChange={canToggle ? () => handleToggle(t.id, done) : undefined} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {confirmed && <span style={{ font: 'var(--text-caption)', color: 'var(--status-success)' }}>Đã xác nhận</span>}
              {isOwner && done && !confirmed && (
                <Button size="sm" variant="secondary" disabled={busyId === c.id} onClick={() => handleConfirm(c.id)}>Xác nhận</Button>
              )}
            </div>
          </div>
        );
      })}
      {error && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)' }}>{error}</div>}
    </div>
  );
}
```

- [ ] **Step 2: Verify the build compiles**

Run: `npm run build`
Expected: exits 0 with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/tasks/DailyChecklistTab.jsx
git commit -m "Implement daily checklist tab with owner end-of-day confirmation"
```

---

## Task 7: Assigned tasks tab, creation modal, exemption modal

**Files:**
- Modify: `src/components/tasks/AssignedTasksTab.jsx` (replace the Task 5 stub)
- Create: `src/components/tasks/AssignTaskModal.jsx`
- Create: `src/components/tasks/ExemptionRequestModal.jsx`

**Interfaces:**
- Consumes: `fetchTasks`, `completeTask`, `createAssignedTasks`, `requestTaskExemption` from `../../lib/queries`; `StaffMultiSelect` from `../StaffMultiSelect` (Task 4); `Button`/`Input` from `../forms/*`; `PhotoField` from `../PhotoField`. Props from Task 5: `profile`, `isOwner`, `viewingStaffId`, `viewingStaffName`, `staffList`, `orderCodeFilter`.
- Produces: nothing consumed elsewhere.

- [ ] **Step 1: Write `AssignTaskModal.jsx`**

```jsx
import React, { useState } from 'react';
import { Button } from '../forms/Button';
import { Input } from '../forms/Input';
import { StaffMultiSelect } from '../StaffMultiSelect';
import { createAssignedTasks } from '../../lib/queries';

export function AssignTaskModal({ staffList, profile, onClose, onSaved }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [orderCode, setOrderCode] = useState('');
  const [deadline, setDeadline] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!title.trim()) { setError('Nhập tên công việc.'); return; }
    if (selectedIds.length === 0) { setError('Chọn ít nhất 1 nhân viên.'); return; }
    setSaving(true); setError('');
    try {
      const batchId = crypto.randomUUID();
      const rows = selectedIds.map((assigneeId) => ({
        title, description: description || null, order_code: orderCode || null,
        deadline: deadline ? new Date(deadline).toISOString() : null,
        assignee_id: assigneeId, batch_id: batchId, created_by: profile?.id || null,
      }));
      await createAssignedTasks(rows);
      onSaved?.();
      onClose();
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--surface-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 70, padding: 16 }} onClick={onClose}>
      <div style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-lg)', width: 420, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', padding: 20, boxShadow: 'var(--shadow-lg)', display: 'flex', flexDirection: 'column', gap: 12 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ font: 'var(--text-title)', color: 'var(--text-primary)' }}>Giao việc mới</div>
        <Input label="Tên công việc" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Input label="Mô tả (không bắt buộc)" value={description} onChange={(e) => setDescription(e.target.value)} />
        <Input label="Mã đơn liên quan (không bắt buộc)" value={orderCode} onChange={(e) => setOrderCode(e.target.value)} />
        <Input label="Hạn chót (không bắt buộc)" type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        <div style={{ font: 'var(--text-label)', color: 'var(--text-primary)' }}>Giao cho</div>
        <StaffMultiSelect staff={staffList} selectedIds={selectedIds} onChange={setSelectedIds} />
        {error && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)' }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>Huỷ</Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? 'Đang lưu...' : 'Giao việc'}</Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write `ExemptionRequestModal.jsx`**

```jsx
import React, { useState } from 'react';
import { Button } from '../forms/Button';
import { Input } from '../forms/Input';
import { PhotoField } from '../PhotoField';
import { requestTaskExemption } from '../../lib/queries';

export function ExemptionRequestModal({ task, profile, onClose, onSent }) {
  const [reason, setReason] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSend = async () => {
    if (!reason.trim()) { setError('Nhập lý do xin miễn trừ.'); return; }
    setSaving(true); setError('');
    try {
      await requestTaskExemption({
        taskId: task.id, reason, photoUrl: photoUrl || null,
        requesterId: profile?.id, requesterName: profile?.full_name, requesterRole: profile?.role,
      });
      onSent?.();
      onClose();
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--surface-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 70, padding: 16 }} onClick={onClose}>
      <div style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-lg)', width: 380, maxWidth: '100%', padding: 20, boxShadow: 'var(--shadow-lg)', display: 'flex', flexDirection: 'column', gap: 12 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ font: 'var(--text-title)', color: 'var(--text-primary)' }}>Xin miễn trừ: {task.title}</div>
        <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Cần sếp duyệt. Không có tuỳ chọn từ chối việc trực tiếp.</div>
        <Input label="Lý do" placeholder="VD: Bận việc khác, không đủ người..." value={reason} onChange={(e) => setReason(e.target.value)} />
        <PhotoField url={photoUrl} onChange={setPhotoUrl} label="Ảnh minh chứng (không bắt buộc)" prefix="task-exemption" />
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

- [ ] **Step 3: Write `AssignedTasksTab.jsx`**

```jsx
import React, { useEffect, useState } from 'react';
import { Button } from '../forms/Button';
import { fetchTasks, completeTask } from '../../lib/queries';
import { AssignTaskModal } from './AssignTaskModal';
import { ExemptionRequestModal } from './ExemptionRequestModal';

export function AssignedTasksTab({ profile, isOwner, viewingStaffId, staffList, orderCodeFilter }) {
  const [tasks, setTasks] = useState([]);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [showAssign, setShowAssign] = useState(false);
  const [exemptTarget, setExemptTarget] = useState(null);

  const load = () => {
    fetchTasks({ assigneeId: viewingStaffId, category: 'assigned' })
      .then((data) => { setTasks(data); setError(''); })
      .catch((err) => setError(err.message));
  };

  useEffect(load, [viewingStaffId]);

  const visible = orderCodeFilter ? tasks.filter((t) => (t.order_code || '').includes(orderCodeFilter)) : tasks;

  const handleComplete = async (id) => {
    setBusyId(id); setError('');
    try { await completeTask(id); load(); } catch (err) { setError(err.message); } finally { setBusyId(''); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {isOwner && <Button size="sm" onClick={() => setShowAssign(true)} style={{ alignSelf: 'flex-start' }}>Giao việc mới</Button>}
      {visible.length === 0 && <div style={{ font: 'var(--text-body)', color: 'var(--text-muted)' }}>Không có việc được giao.</div>}
      {visible.map((t) => (
        <div key={t.id} style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: 10, background: 'var(--surface-sunken)', borderRadius: 'var(--radius-sm)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ font: 'var(--text-label)', color: 'var(--text-primary)' }}>{t.title}</span>
            <span style={{ font: 'var(--text-caption)', color: t.status === 'done' && t.late ? 'var(--status-danger)' : t.status === 'done' ? 'var(--status-success)' : 'var(--text-muted)' }}>
              {t.status === 'done' ? (t.late ? 'Hoàn thành (trễ)' : 'Hoàn thành') : t.status === 'exempted' ? 'Đã miễn trừ' : 'Chưa xong'}
            </span>
          </div>
          {t.description && <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>{t.description}</div>}
          {t.order_code && <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Mã đơn: {t.order_code}</div>}
          {t.deadline && <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Hạn: {new Date(t.deadline).toLocaleString('vi-VN')}</div>}
          {!isOwner && t.assignee_id === profile?.id && t.status === 'open' && (
            <div style={{ display: 'flex', gap: 8 }}>
              <Button size="sm" disabled={busyId === t.id} onClick={() => handleComplete(t.id)}>Hoàn thành</Button>
              <Button size="sm" variant="secondary" onClick={() => setExemptTarget(t)}>Xin miễn trừ</Button>
            </div>
          )}
        </div>
      ))}
      {error && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)' }}>{error}</div>}
      {showAssign && <AssignTaskModal staffList={staffList} profile={profile} onClose={() => setShowAssign(false)} onSaved={load} />}
      {exemptTarget && <ExemptionRequestModal task={exemptTarget} profile={profile} onClose={() => setExemptTarget(null)} onSent={load} />}
    </div>
  );
}
```

- [ ] **Step 4: Verify the build compiles**

Run: `npm run build`
Expected: exits 0 with no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/tasks/AssignedTasksTab.jsx src/components/tasks/AssignTaskModal.jsx src/components/tasks/ExemptionRequestModal.jsx
git commit -m "Implement assigned-tasks tab: multi-assignee creation, completion, exemption request"
```

---

## Task 8: Ad-hoc tasks tab & report modal

**Files:**
- Modify: `src/components/tasks/AdhocTasksTab.jsx` (replace the Task 5 stub)
- Create: `src/components/tasks/AdhocReportModal.jsx`

**Interfaces:**
- Consumes: `fetchTasks`, `createAdhocTask`, `deleteTask` from `../../lib/queries`; `Button`/`Input` from `../forms/*`. Props from Task 5: `profile`, `isOwner`, `viewingStaffId`, `orderCodeFilter`.
- Produces: nothing consumed elsewhere.

- [ ] **Step 1: Write `AdhocReportModal.jsx`**

```jsx
import React, { useState } from 'react';
import { Button } from '../forms/Button';
import { Input } from '../forms/Input';
import { createAdhocTask } from '../../lib/queries';

export function AdhocReportModal({ profile, onClose, onSaved }) {
  const [title, setTitle] = useState('');
  const [orderCode, setOrderCode] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!title.trim()) { setError('Nhập tên việc.'); return; }
    setSaving(true); setError('');
    try {
      await createAdhocTask({ assigneeId: profile?.id, title, description: description || null, orderCode: orderCode || null, createdBy: profile?.id });
      onSaved?.();
      onClose();
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--surface-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 70, padding: 16 }} onClick={onClose}>
      <div style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-lg)', width: 380, maxWidth: '100%', padding: 20, boxShadow: 'var(--shadow-lg)', display: 'flex', flexDirection: 'column', gap: 12 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ font: 'var(--text-title)', color: 'var(--text-primary)' }}>Báo việc phát sinh</div>
        <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Ghi nhận ngay, không cần chờ duyệt.</div>
        <Input label="Tên việc" placeholder="VD: Phụ ship đơn quá tải" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Input label="Mã đơn liên quan (không bắt buộc)" value={orderCode} onChange={(e) => setOrderCode(e.target.value)} />
        <Input label="Mô tả (không bắt buộc)" value={description} onChange={(e) => setDescription(e.target.value)} />
        {error && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)' }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>Huỷ</Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? 'Đang lưu...' : 'Ghi nhận'}</Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write `AdhocTasksTab.jsx`**

```jsx
import React, { useEffect, useState } from 'react';
import { Button } from '../forms/Button';
import { fetchTasks, deleteTask } from '../../lib/queries';
import { AdhocReportModal } from './AdhocReportModal';

export function AdhocTasksTab({ profile, isOwner, viewingStaffId, orderCodeFilter }) {
  const [tasks, setTasks] = useState([]);
  const [error, setError] = useState('');
  const [showReport, setShowReport] = useState(false);
  const [busyId, setBusyId] = useState('');

  const load = () => {
    fetchTasks({ assigneeId: viewingStaffId, category: 'adhoc' })
      .then((data) => { setTasks(data); setError(''); })
      .catch((err) => setError(err.message));
  };

  useEffect(load, [viewingStaffId]);

  const visible = orderCodeFilter ? tasks.filter((t) => (t.order_code || '').includes(orderCodeFilter)) : tasks;
  const canReport = !isOwner && profile?.id === viewingStaffId;

  const handleDelete = async (id) => {
    setBusyId(id); setError('');
    try { await deleteTask(id); load(); } catch (err) { setError(err.message); } finally { setBusyId(''); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {canReport && <Button size="sm" onClick={() => setShowReport(true)} style={{ alignSelf: 'flex-start' }}>Báo việc phát sinh</Button>}
      {visible.length === 0 && <div style={{ font: 'var(--text-body)', color: 'var(--text-muted)' }}>Chưa có việc phát sinh nào.</div>}
      {visible.map((t) => (
        <div key={t.id} style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: 10, background: 'var(--surface-sunken)', borderRadius: 'var(--radius-sm)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ font: 'var(--text-label)', color: 'var(--text-primary)' }}>{t.title}</span>
            <span style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>{new Date(t.created_at).toLocaleString('vi-VN')}</span>
          </div>
          {t.description && <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>{t.description}</div>}
          {t.order_code && <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Mã đơn: {t.order_code}</div>}
          {isOwner && (
            <Button size="sm" variant="danger" disabled={busyId === t.id} onClick={() => handleDelete(t.id)} style={{ alignSelf: 'flex-start' }}>Xoá</Button>
          )}
        </div>
      ))}
      {error && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)' }}>{error}</div>}
      {showReport && <AdhocReportModal profile={profile} onClose={() => setShowReport(false)} onSaved={load} />}
    </div>
  );
}
```

- [ ] **Step 3: Verify the build compiles**

Run: `npm run build`
Expected: exits 0 with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/tasks/AdhocTasksTab.jsx src/components/tasks/AdhocReportModal.jsx
git commit -m "Implement ad-hoc tasks tab: self-report and owner oversight"
```

---

## Task 9: Approval queue extension for task exemptions

**Files:**
- Modify: `src/screens/ApprovalRequestsScreen.jsx`

**Interfaces:**
- Consumes: new `exemptTask` from `../lib/queries` (Task 3).
- Produces: nothing consumed elsewhere.

- [ ] **Step 1: Import `exemptTask` and add the type label**

In the import block (currently `import { fetchApprovalRequests, resolveApprovalRequest, cancelOrder, deleteOrder, fetchOrderById, deleteShiftLog } from '../lib/queries';`), add `exemptTask`:
```js
import {
  fetchApprovalRequests, resolveApprovalRequest,
  cancelOrder, deleteOrder, fetchOrderById, deleteShiftLog, exemptTask,
} from '../lib/queries';
```

In `TYPE_LABELS`, add:
```js
const TYPE_LABELS = {
  order_edit: 'Yêu cầu sửa đơn',
  order_cancel: 'Yêu cầu khách hủy đơn',
  order_delete: 'Yêu cầu xoá đơn',
  shift_recheck: 'Yêu cầu chấm công lại',
  leave_request: 'Yêu cầu xin nghỉ (lịch tuần)',
  task_exemption: 'Yêu cầu miễn trừ công việc',
};
```

- [ ] **Step 2: Handle approval of `task_exemption` in `handleApprove`**

Current code:
```js
  const handleApprove = async () => {
    setBusy(true);
    setError('');
    try {
      if (req.type === 'order_cancel') {
        await cancelOrder(req.order_id, { reason: req.reason, photoUrl: req.photo_url, staffName: req.requester_name });
      } else if (req.type === 'order_delete') {
        const order = await fetchOrderById(req.order_id);
        const itemsSummary = (order?.order_items || []).map((it) => `${it.name} x${it.qty}`).join(', ');
        await deleteOrder(req.order_id, {
          reason: req.reason, photoUrl: req.photo_url, staffName: req.requester_name,
          snapshot: { orderCode: order?.order_code || req.order_code, customerName: order?.customer?.name, itemsSummary, total: order?.total },
        });
      } else if (req.type === 'shift_recheck' && req.shift_log_id) {
        await deleteShiftLog(req.shift_log_id);
      }
      // order_edit: không có gì để tự động — sếp bấm Duyệt để báo đã xem, rồi tự vào đơn bấm "Sửa đơn".
      await resolveApprovalRequest(req.id, { status: 'approved', resolvedBy: profile?.full_name });
      onResolved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
```

Replace the branch chain to add a `task_exemption` case (add it right after the `shift_recheck` branch, before the closing `}`):
```js
  const handleApprove = async () => {
    setBusy(true);
    setError('');
    try {
      if (req.type === 'order_cancel') {
        await cancelOrder(req.order_id, { reason: req.reason, photoUrl: req.photo_url, staffName: req.requester_name });
      } else if (req.type === 'order_delete') {
        const order = await fetchOrderById(req.order_id);
        const itemsSummary = (order?.order_items || []).map((it) => `${it.name} x${it.qty}`).join(', ');
        await deleteOrder(req.order_id, {
          reason: req.reason, photoUrl: req.photo_url, staffName: req.requester_name,
          snapshot: { orderCode: order?.order_code || req.order_code, customerName: order?.customer?.name, itemsSummary, total: order?.total },
        });
      } else if (req.type === 'shift_recheck' && req.shift_log_id) {
        await deleteShiftLog(req.shift_log_id);
      } else if (req.type === 'task_exemption' && req.task_id) {
        await exemptTask(req.task_id);
      }
      // order_edit: không có gì để tự động — sếp bấm Duyệt để báo đã xem, rồi tự vào đơn bấm "Sửa đơn".
      await resolveApprovalRequest(req.id, { status: 'approved', resolvedBy: profile?.full_name });
      onResolved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
```

- [ ] **Step 3: Verify the build compiles**

Run: `npm run build`
Expected: exits 0 with no errors.

Manual check: run `npm run dev`, as a staff member request an exemption on an assigned task (Task 7's UI), then as owner open "Yêu Cầu Duyệt", confirm the row shows "Yêu cầu miễn trừ công việc", approve it, and confirm the task's status in the Tasks screen flips to "Đã miễn trừ".

- [ ] **Step 4: Commit**

```bash
git add src/screens/ApprovalRequestsScreen.jsx
git commit -m "Wire task exemption approval into the existing approval queue"
```

---

## Task 10: Shipping self-claim extension

**Files:**
- Modify: `src/screens/ShippingScreen.jsx`

**Interfaces:**
- Consumes: new `createAdhocTask` from `../lib/queries` (Task 3).
- Produces: nothing consumed elsewhere.

- [ ] **Step 1: Import `createAdhocTask`**

Change:
```js
import { fetchOrders, updateOrder, uploadPhoto, fetchShopSettings } from '../lib/queries';
```
to:
```js
import { fetchOrders, updateOrder, uploadPhoto, fetchShopSettings, createAdhocTask } from '../lib/queries';
```

- [ ] **Step 2: Give `DeliveryCard` per-order self-claim state**

Change the function signature from:
```js
function DeliveryCard({ order, onPickup, onComplete, onSignedDoc, canAct, shopSettings }) {
```
to:
```js
function DeliveryCard({ order, onPickup, onComplete, onSignedDoc, isDedicatedShipper, profile, shopSettings }) {
```

Add these lines right after the existing `const [showDetail, setShowDetail] = useState(false);` line:
```js
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const claimedByMe = !!order.shipper_staff_name && order.shipper_staff_name === profile?.full_name;
  const canAct = isDedicatedShipper || claimedByMe || (order.status === 'cho_giao' && phoneVerified);
  const canSelfClaim = !isDedicatedShipper && !claimedByMe && order.status === 'cho_giao';

  const handleVerifyPhone = () => {
    const last4 = (order.customer?.phone || '').slice(-4);
    if (!last4 || phoneInput.trim() !== last4) {
      setPhoneError('Số không khớp — kiểm tra lại 4 số cuối SĐT khách.');
      return;
    }
    setPhoneError('');
    setPhoneVerified(true);
  };
```

- [ ] **Step 3: Thread the self-claim flag through the pickup handlers**

Change `handlePickupPhoto`:
```js
  const handlePickupPhoto = async (blob) => {
    setShowCamera(false);
    setBusy(true);
    try {
      const photoUrl = await uploadPhoto(blob, 'pickup');
      const pos = await getCurrentPosition();
      await onPickup(order, photoUrl, pos);
    } finally {
      setBusy(false);
    }
  };
```
to:
```js
  const handlePickupPhoto = async (blob) => {
    setShowCamera(false);
    setBusy(true);
    try {
      const photoUrl = await uploadPhoto(blob, 'pickup');
      const pos = await getCurrentPosition();
      await onPickup(order, photoUrl, pos, canSelfClaim && phoneVerified);
    } finally {
      setBusy(false);
    }
  };
```

Change `skipPhoto`'s pickup branch:
```js
      if (order.status === 'cho_giao') {
        await onPickup(order, null, null);
      } else if (isLate(order)) {
```
to:
```js
      if (order.status === 'cho_giao') {
        await onPickup(order, null, null, canSelfClaim && phoneVerified);
      } else if (isLate(order)) {
```

- [ ] **Step 4: Add the phone-verification UI to the `cho_giao` block**

Change:
```jsx
        {order.status === 'cho_giao' && (
          <React.Fragment>
            <Badge tone="neutral" style={{ alignSelf: 'flex-start' }}>Chờ xuất bến</Badge>
            <Button variant="primary" size="sm" icon={<IconCamera size={16} />} disabled={busy || !canAct} onClick={() => setShowCamera(true)}>{busy ? 'Đang xử lý...' : 'Chụp xuất bến & Nhận giao'}</Button>
            {navigator.onLine === false && <Button variant="ghost" size="sm" onClick={skipPhoto} disabled={busy || !canAct}>Mất mạng — bỏ qua ảnh, nhận giao luôn</Button>}
          </React.Fragment>
        )}
```
to:
```jsx
        {order.status === 'cho_giao' && (
          <React.Fragment>
            <Badge tone="neutral" style={{ alignSelf: 'flex-start' }}>Chờ xuất bến</Badge>
            {canSelfClaim && !phoneVerified && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 10, background: 'var(--surface-sunken)', borderRadius: 'var(--radius-sm)' }}>
                <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Nhập 4 số cuối SĐT khách để xác thực trước khi nhận giao hộ.</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Input placeholder="VD: 1234" value={phoneInput} onChange={(e) => setPhoneInput(e.target.value)} style={{ flex: '1 1 auto', minWidth: 0 }} />
                  <Button size="sm" variant="secondary" onClick={handleVerifyPhone}>Xác thực</Button>
                </div>
                {phoneError && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)' }}>{phoneError}</div>}
              </div>
            )}
            <Button variant="primary" size="sm" icon={<IconCamera size={16} />} disabled={busy || !canAct} onClick={() => setShowCamera(true)}>{busy ? 'Đang xử lý...' : canSelfClaim ? 'Chụp xuất bến & Nhận giao hộ' : 'Chụp xuất bến & Nhận giao'}</Button>
            {navigator.onLine === false && <Button variant="ghost" size="sm" onClick={skipPhoto} disabled={busy || !canAct}>Mất mạng — bỏ qua ảnh, nhận giao luôn</Button>}
          </React.Fragment>
        )}
```

- [ ] **Step 5: Update the "not allowed" fallback message wording**

Change:
```jsx
        {!canAct && order.status !== 'hoan_thanh' && <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Chỉ Vận chuyển hoặc Chủ sở hữu mới thao tác được ở đây.</div>}
```
to:
```jsx
        {!canAct && order.status !== 'hoan_thanh' && !canSelfClaim && <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Chỉ Vận chuyển, Chủ sở hữu, hoặc người đã nhận giao hộ mới thao tác được ở đây.</div>}
```

- [ ] **Step 6: Update `ShippingScreen`'s top-level `canAct`, pass new props, and insert the ad-hoc task on self-claim**

Change:
```js
  const { profile } = useAuth();
  const canAct = hasAnyRole(profile, ['shipper', 'owner', 'admin']);
```
to:
```js
  const { profile } = useAuth();
  const isDedicatedShipper = hasAnyRole(profile, ['shipper', 'owner', 'admin']);
```

Change `handlePickup`:
```js
  const handlePickup = async (order, photoUrl, pos) => {
    const fields = { status: 'dang_giao', shipper_staff_name: profile?.full_name || null };
    if (photoUrl) fields.pickup_photo_url = photoUrl;
    if (pos) { fields.pickup_lat = pos.lat; fields.pickup_lng = pos.lng; }
    applyFields(order, fields);
  };
```
to:
```js
  const handlePickup = async (order, photoUrl, pos, selfClaimed) => {
    const fields = { status: 'dang_giao', shipper_staff_name: profile?.full_name || null };
    if (photoUrl) fields.pickup_photo_url = photoUrl;
    if (pos) { fields.pickup_lat = pos.lat; fields.pickup_lng = pos.lng; }
    applyFields(order, fields);
    if (selfClaimed) {
      createAdhocTask({
        assigneeId: profile?.id, title: `Nhận giao hộ đơn ${order.order_code || ''}`.trim(),
        orderCode: order.order_code || null, createdBy: profile?.id,
      }).catch(() => {});
    }
  };
```

Change the `DeliveryCard` usage in the render:
```jsx
          {orders.map((o) => <DeliveryCard key={o.id} order={o} onPickup={handlePickup} onComplete={handleComplete} onSignedDoc={handleSignedDoc} canAct={canAct} shopSettings={shopSettings} />)}
```
to:
```jsx
          {orders.map((o) => <DeliveryCard key={o.id} order={o} onPickup={handlePickup} onComplete={handleComplete} onSignedDoc={handleSignedDoc} isDedicatedShipper={isDedicatedShipper} profile={profile} shopSettings={shopSettings} />)}
```

- [ ] **Step 7: Verify the build compiles**

Run: `npm run build`
Expected: exits 0 with no errors.

Manual check: run `npm run dev`, log in as a non-shipper staff member (e.g. `bakery`), open "Vận Chuyển", confirm a `cho_giao` order shows the phone-verification box instead of the disabled-action message; enter the wrong last 4 digits and confirm it's rejected; enter the correct digits (check the order's linked customer phone in the DB) and confirm "Chụp xuất bến & Nhận giao hộ" becomes enabled; complete the claim and confirm a new row appears in that staff's ad-hoc tasks in the Tasks screen. Then confirm the existing dedicated-shipper flow (log in as `shipper`) still works unchanged with no phone-verification box shown.

- [ ] **Step 8: Commit**

```bash
git add src/screens/ShippingScreen.jsx
git commit -m "Let non-shipper staff self-claim deliveries via phone-digit verification"
```

---

## Self-Review Notes

- **Spec coverage:** daily templates (Task 1, 2, 6), assigned multi-person tasks + exemption (Task 1, 3, 7, 9), ad-hoc self-report (Task 1, 3, 8), Shipping self-claim (Task 10), nav wiring (Task 5) — every spec section has a task.
- **No decline button**: confirmed absent from `AssignedTasksTab.jsx` — only "Hoàn thành" and "Xin miễn trừ".
- **Late-flag timing**: `completeTask` in Task 3 computes `late` only at the moment of completion, matching the owner's explicit choice; daily templates never touch `late`.
- **Type consistency check**: `fetchTasks({assigneeId, category, status})` (Task 3) matches every call site in Tasks 7/8/9 (`fetchTasks({ assigneeId: viewingStaffId, category: 'assigned' })` etc.); `createAdhocTask({assigneeId, title, description, orderCode, createdBy})` matches both call sites (Task 8's modal, Task 10's Shipping extension).
