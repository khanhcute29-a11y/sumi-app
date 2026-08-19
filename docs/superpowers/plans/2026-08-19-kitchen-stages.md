# Kitchen Multi-Stage Order Coordination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a bếp trưởng split one order into sequential production stages, each assigned to a currently-checked-in staff member, with stage N+1 locked until stage N is done, unlocking in real time.

**Architecture:** One new table (`order_stages`) holding the stage list per order, joined into the existing `fetchOrders`/`ORDER_SELECT` query so stages arrive pre-nested exactly like `order_items` already do. A new `StageSplitModal` lets the bếp trưởng define stages and pick assignees from today's checked-in staff (reusing the exact "who's online" computation already built for the weekly schedule feature). `KdsScreen.jsx`'s existing order card gets a stage checklist that replaces the single Accept/Ready flow only when an order actually has stages — unsplit orders (the majority) are completely unaffected.

**Tech Stack:** React 18 (plain JSX, inline `style={{...}}` with `var(--...)` tokens), Supabase (Postgres + RLS + Realtime), Vite. **No test runner exists** — verification is `npm run build` plus manual browser checks.

## Global Constraints

- Splitting is available on both `moi` (unaccepted) and `dang_lam` (already accepted, solo, no stages yet) orders — confirmed explicitly by the owner ("đơn gấp cần thêm người phụ"). Splitting a `dang_lam` order pre-fills stage 1 with the existing solo worker.
- Help is **sequential only** — no parallel/unlocked-concurrent stage model (owner's explicit choice). Stage N (N>1) stays locked until stage N-1's status is `hoan_thanh`.
- "Locked" is never stored in the database — it's derived client-side from stage position + predecessor status, to avoid a flag that can drift out of sync.
- Only `kitchen_lead`/`owner`/`admin` (role or `extra_roles`) can create/reassign stages — plain `kitchen`/`bakery`/`kitchen_deputy` cannot split an order, matching `kitchen_lead`'s existing (previously unused) `manage_kitchen_staff` permission intent.
- The assignee picker for a new stage is restricted to staff currently checked in today (open `shift_logs` checkin, no matching checkout) — reuse the exact Set-building logic already in `src/components/WeeklyScheduleSection.jsx`, don't reinvent it.
- No changes to `orders`' existing columns, check constraint, or its `enforce_order_update_permissions()` trigger — marking the LAST stage done writes to `orders` using the exact same `{status: 'cho_giao', kitchen_staff_name: <name>}` shape `handleReady` already writes today, which the trigger already permits for kitchen roles.
- Per-stage photos are out of scope — only the final stage's completion can attach `kitchen_photo_url`, exactly as today's "Chụp ảnh & Sẵn sàng giao" flow already does (untouched).
- Fair time-splitting on stage handoff is out of scope — whoever is assignee when a stage is marked done gets full KPI credit for it later; this is a known, accepted simplification (see design spec's trade-off section).

---

### Task 1: Database migration

**Files:**
- Create: `supabase/migrate_order_stages.sql`

**Interfaces:**
- Produces: `order_stages` table (columns: `id, order_id, stage_index, stage_name, assignee_id, assignee_name, status, started_at, ended_at, created_by, created_at`), added to the `supabase_realtime` publication.

- [ ] **Step 1: Write the migration**

```sql
-- Run manually in Supabase SQL Editor. Safe to re-run (idempotent).

create table if not exists order_stages (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  stage_index int not null,
  stage_name text not null,
  assignee_id uuid references profiles(id) on delete set null,
  assignee_name text not null,
  status text not null default 'cho_lam' check (status in ('cho_lam','dang_lam','hoan_thanh')),
  started_at timestamptz,
  ended_at timestamptz,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (order_id, stage_index)
);

alter table order_stages enable row level security;

drop policy if exists "read order_stages" on order_stages;
create policy "read order_stages" on order_stages for select
  using (auth.role() = 'authenticated' and public.is_approved());

drop policy if exists "kitchen_lead insert order_stages" on order_stages;
create policy "kitchen_lead insert order_stages" on order_stages for insert
  with check (
    exists (
      select 1 from profiles
      where id = auth.uid()
        and (role in ('kitchen_lead','owner','admin') or extra_roles && array['kitchen_lead','owner','admin'])
    )
  );

drop policy if exists "assignee or lead update order_stages" on order_stages;
create policy "assignee or lead update order_stages" on order_stages for update
  using (
    assignee_id = auth.uid()
    or exists (
      select 1 from profiles
      where id = auth.uid()
        and (role in ('kitchen_lead','owner','admin') or extra_roles && array['kitchen_lead','owner','admin'])
    )
  );

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'order_stages'
  ) then
    alter publication supabase_realtime add table order_stages;
  end if;
end $$;
```

- [ ] **Step 2: Manual verify**

This is a SQL-only file — re-read it after writing to confirm it matches exactly. No app code depends on it yet.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrate_order_stages.sql
git commit -m "Add order_stages table migration for kitchen multi-stage coordination"
```

---

### Task 2: Query functions + `ORDER_SELECT` join

**Files:**
- Modify: `src/lib/queries.js`

**Interfaces:**
- Produces:
  - `ORDER_SELECT` now includes `order_stages(*)`, so every `fetchOrders`/`fetchOrderById` result has an `order.order_stages` array (empty for unsplit orders).
  - `createOrderStages(rows)` → `Promise<void>` — bulk-inserts an array of already-fully-formed row objects.
  - `startOrderStage(id)` → `Promise<void>`
  - `completeOrderStage(id)` → `Promise<void>`
  - `reassignOrderStage(id, { assigneeId, assigneeName })` → `Promise<void>`

- [ ] **Step 1: Add `order_stages(*)` to `ORDER_SELECT`**

Read the current file to find the exact current line (was `const ORDER_SELECT = '*, customer:customers(id, name, phone, trust_score, vip, locked), order_items(*)';`). Change to:
```js
const ORDER_SELECT = '*, customer:customers(id, name, phone, trust_score, vip, locked), order_items(*), order_stages(*)';
```

- [ ] **Step 2: Add the 4 new functions**

Insert these as a new section right after the existing `// ---- Ca làm việc (chấm công / trễ giờ / xin nghỉ đột xuất) ----` section ends (after `updateProfileStation`, before the `// ---- Yêu cầu duyệt hợp nhất` section comment):

```js
// ---- Chia công đoạn bếp (gán nhân viên đang trực vào công đoạn của đơn) ----

export async function createOrderStages(rows) {
  const { error } = await supabase.from('order_stages').insert(rows);
  if (error) throw error;
  notifyBadgesChanged();
}

export async function startOrderStage(id) {
  const { error } = await supabase.from('order_stages').update({ status: 'dang_lam', started_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
  notifyBadgesChanged();
}

export async function completeOrderStage(id) {
  const { error } = await supabase.from('order_stages').update({ status: 'hoan_thanh', ended_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
  notifyBadgesChanged();
}

export async function reassignOrderStage(id, { assigneeId, assigneeName }) {
  const { error } = await supabase.from('order_stages').update({ assignee_id: assigneeId, assignee_name: assigneeName }).eq('id', id);
  if (error) throw error;
  notifyBadgesChanged();
}
```

`createOrderStages` takes fully-formed row objects (caller decides `order_id`, `stage_index`, `stage_name`, `assignee_id`, `assignee_name`, `status`, `started_at`, `created_by`) — this function is a thin insert wrapper, matching this file's existing convention of no business logic in query functions.

- [ ] **Step 3: Manual verify**

Run: `npm run build` — must pass with no errors. No UI call site yet (later tasks wire these up).

- [ ] **Step 4: Commit**

```bash
git add src/lib/queries.js
git commit -m "Add order_stages query functions and join stages into ORDER_SELECT"
```

---

### Task 3: `StageSplitModal` component

**Files:**
- Create: `src/components/StageSplitModal.jsx`

**Interfaces:**
- Consumes: `createOrderStages`, `updateOrder` (from `src/lib/queries.js`; `createOrderStages` from Task 2, `updateOrder` pre-existing), `fetchShiftLogsRange`, `fetchAllProfiles`, `fetchProducts` (pre-existing), `useAuth` (`src/lib/AuthContext`), `localDateStr` (`src/lib/date.js`).
- Produces: `<StageSplitModal order={order} onClose={fn} onSaved={fn} />` — self-contained. `order` is a full order object as returned by `fetchOrders` (has `.status`, `.kitchen_staff_name`, `.id`).

- [ ] **Step 1: Write the component**

```jsx
import React, { useEffect, useState } from 'react';
import { Button } from './forms/Button';
import { Input } from './forms/Input';
import { Select } from './forms/Select';
import { createOrderStages, updateOrder, fetchShiftLogsRange, fetchAllProfiles, fetchProducts } from '../lib/queries';
import { useAuth } from '../lib/AuthContext';
import { localDateStr } from '../lib/date';

const BLANK_STAGE = { stageName: '', assigneeId: '', assigneeName: '' };

function StageRow({ index, item, onChange, onRemove, canRemove, onlineOptions, productNames }) {
  const set = (k, v) => onChange({ ...item, [k]: v });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, background: 'var(--surface-sunken)', borderRadius: 'var(--radius-sm)' }}>
      <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Công đoạn {index + 1}</div>
      <Input
        placeholder="Tên công đoạn — VD: Chà kem, Đánh bột..."
        value={item.stageName}
        onChange={(e) => set('stageName', e.target.value)}
        list="stage-name-suggestions"
      />
      <Select
        value={item.assigneeId}
        onChange={(e) => {
          const opt = onlineOptions.find((o) => o.value === e.target.value);
          set('assigneeId', e.target.value);
          set('assigneeName', opt ? opt.label : '');
        }}
        options={onlineOptions}
        placeholder="Chọn người đang trực..."
      />
      {canRemove && <Button variant="ghost" size="sm" onClick={onRemove}>Xoá công đoạn này</Button>}
    </div>
  );
}

export function StageSplitModal({ order, onClose, onSaved }) {
  const { profile } = useAuth();
  const [onlineProfiles, setOnlineProfiles] = useState([]);
  const [productNames, setProductNames] = useState([]);
  const [stages, setStages] = useState([{ ...BLANK_STAGE }]);
  const [preFilledFromSolo, setPreFilledFromSolo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const today = localDateStr();
    Promise.all([fetchShiftLogsRange(today, today), fetchAllProfiles(), fetchProducts({ activeOnly: true })])
      .then(([logs, profiles, products]) => {
        const onlineIds = new Set(
          logs.filter((l) => l.type === 'checkin' && !logs.some((c) => c.type === 'checkout' && c.staff_id === l.staff_id && c.work_date === l.work_date))
            .map((l) => l.staff_id)
        );
        const online = profiles.filter((p) => onlineIds.has(p.id));
        setOnlineProfiles(online);
        setProductNames(products.map((p) => p.name));

        if (order.status === 'dang_lam' && order.kitchen_staff_name && (order.order_stages || []).length === 0) {
          const matched = profiles.find((p) => p.full_name === order.kitchen_staff_name);
          setStages([{ stageName: 'Đã bắt đầu', assigneeId: matched?.id || '', assigneeName: order.kitchen_staff_name }]);
          setPreFilledFromSolo(true);
        }
      })
      .catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onlineOptions = onlineProfiles.map((p) => ({ value: p.id, label: p.full_name }));
  const updateStage = (i, next) => setStages(stages.map((s, idx) => (idx === i ? next : s)));
  const removeStage = (i) => setStages(stages.filter((_, idx) => idx !== i));

  const handleSave = async () => {
    if (stages.length < 2) { setError('Cần ít nhất 2 công đoạn — nếu chỉ 1 người làm thì dùng nút Nhận đơn bình thường.'); return; }
    if (stages.some((s) => !s.stageName.trim() || !s.assigneeName)) { setError('Điền đủ tên công đoạn và chọn người cho mỗi dòng.'); return; }
    setSaving(true);
    setError('');
    try {
      const rows = stages.map((s, i) => ({
        order_id: order.id, stage_index: i + 1, stage_name: s.stageName.trim(),
        assignee_id: s.assigneeId || null, assignee_name: s.assigneeName,
        status: i === 0 && preFilledFromSolo ? 'dang_lam' : 'cho_lam',
        started_at: i === 0 && preFilledFromSolo ? new Date().toISOString() : null,
        created_by: profile?.id || null,
      }));
      await createOrderStages(rows);
      if (order.status === 'moi') {
        await updateOrder(order.id, { status: 'dang_lam', kitchen_staff_name: stages[0].assigneeName });
      }
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--surface-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 70, padding: 16 }} onClick={onClose}>
      <div style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-lg)', width: 420, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', padding: 20, boxShadow: 'var(--shadow-lg)', display: 'flex', flexDirection: 'column', gap: 12 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ font: 'var(--text-title)', color: 'var(--text-primary)' }}>Chia công đoạn — {order.order_code}</div>
        <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Chỉ hiện người đang trực (đã bắt đầu ca hôm nay). Công đoạn sau bị khoá tới khi công đoạn trước xong.</div>
        <datalist id="stage-name-suggestions">
          {productNames.map((n) => <option key={n} value={n} />)}
        </datalist>
        {stages.map((s, i) => (
          <StageRow key={i} index={i} item={s} canRemove={stages.length > 1 && !(i === 0 && preFilledFromSolo)}
            onChange={(next) => updateStage(i, next)} onRemove={() => removeStage(i)}
            onlineOptions={onlineOptions} productNames={productNames} />
        ))}
        <Button variant="secondary" size="sm" onClick={() => setStages([...stages, { ...BLANK_STAGE }])}>+ Thêm công đoạn</Button>
        {error && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)' }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>Huỷ</Button>
          <Button variant="primary" size="sm" onClick={handleSave} disabled={saving}>{saving ? 'Đang lưu...' : 'Chia công đoạn'}</Button>
        </div>
      </div>
    </div>
  );
}
```

Note on `preFilledFromSolo`: when the order was already `dang_lam` with a solo `kitchen_staff_name`, stage 1 is locked to that person's name (can't remove that row, since it represents already-started work) but can still be renamed — the `canRemove` check on `StageRow` (`!(i === 0 && preFilledFromSolo)`) prevents deleting it, not editing its text fields. This matches the design spec's "pre-fills stage 1... bếp trưởng can change this if needed" — the assignee/name stay editable, only removal is blocked for that specific row.

- [ ] **Step 2: Manual verify**

Run: `npm run build` — must pass with no errors. No screen renders this modal yet (Task 4 wires it in).

- [ ] **Step 3: Commit**

```bash
git add src/components/StageSplitModal.jsx
git commit -m "Add StageSplitModal for bếp trưởng to split an order into stages"
```

---

### Task 4: Wire stage checklist + splitting into `KdsScreen.jsx`

**Files:**
- Modify: `src/screens/KdsScreen.jsx`

**Interfaces:**
- Consumes: `StageSplitModal` (Task 3), `startOrderStage`, `completeOrderStage`, `reassignOrderStage` (Task 2), `fetchShiftLogsRange`, `fetchAllProfiles` (pre-existing), `hasAnyRole` (pre-existing).
- Produces: nothing consumed elsewhere — this is the final integration point for Luồng 4.

This is the largest task — read the actual current `src/screens/KdsScreen.jsx` fully before editing, since line numbers may have drifted. Anchor every edit by matching the code shown below, not by line number.

- [ ] **Step 1: Add imports**

Add to the existing icon import block (find the line importing `IconStationHot, IconStationCold, ...`) — add `IconStaff`:
```js
IconStationHot, IconStationCold, IconStationWorkshop, IconStationSparkle,
IconChat, IconWarning, IconPaperclip, IconClipboard, IconKitchen, IconCamera, IconSearch, IconClock,
IconPhone, IconHome, IconMapPin, IconStaff,
```
Add to the queries import (find `import { fetchOrders, updateOrder, uploadPhoto, addOrderNote, fetchOpenIncidentOrderIds } from '../lib/queries';`):
```js
import { fetchOrders, updateOrder, uploadPhoto, addOrderNote, fetchOpenIncidentOrderIds, startOrderStage, completeOrderStage, reassignOrderStage, fetchShiftLogsRange, fetchAllProfiles } from '../lib/queries';
```
Add the new component import:
```js
import { StageSplitModal } from '../components/StageSplitModal';
```
Add `localDateStr` import if not already present (check first — grep the file for `localDateStr`; if absent, add `import { localDateStr } from '../lib/date';`).

- [ ] **Step 2: Compute "who's online" once in the parent, pass down to children**

In the default-exported `KdsScreen` component, add state and a loader near the existing `orders`/`loading` state:
```js
const [onlineProfiles, setOnlineProfiles] = useState([]);

const loadOnlineProfiles = () => {
  const today = localDateStr();
  Promise.all([fetchShiftLogsRange(today, today), fetchAllProfiles()])
    .then(([logs, profiles]) => {
      const onlineIds = new Set(
        logs.filter((l) => l.type === 'checkin' && !logs.some((c) => c.type === 'checkout' && c.staff_id === l.staff_id && c.work_date === l.work_date))
          .map((l) => l.staff_id)
      );
      setOnlineProfiles(profiles.filter((p) => onlineIds.has(p.id)));
    })
    .catch(() => {});
};
```
Call `loadOnlineProfiles()` once in the existing mount `useEffect` alongside wherever `load()` is first called (find that effect and add the call there — do not create a second effect).

- [ ] **Step 3: Add 3 stage-action handlers in the parent, next to `handleAccept`/`handleReady`**

```js
const handleStageStart = async (stage) => {
  await startOrderStage(stage.id);
  load();
};

const handleStageComplete = async (order, stage, isLastStage) => {
  await completeOrderStage(stage.id);
  if (isLastStage) {
    applyFields(order, { status: 'cho_giao', kitchen_staff_name: stage.assignee_name });
  } else {
    load();
  }
};

const handleStageReassign = async (stage, assigneeId, assigneeName) => {
  await reassignOrderStage(stage.id, { assigneeId, assigneeName });
  load();
};
```

- [ ] **Step 4: Pass new props down to `CompactOrderRow`**

Find the JSX call site that renders `<CompactOrderRow order={...} onAccept={...} onReady={...} canAct={...} hasIncident={...} />` (there will be one per column/list rendering the orders). Add:
```jsx
profile={profile}
onlineProfiles={onlineProfiles}
onStageStart={handleStageStart}
onStageComplete={handleStageComplete}
onStageReassign={handleStageReassign}
```

- [ ] **Step 5: Update `CompactOrderRow`'s signature and add the "Chia công đoạn" chip**

Old signature: `function CompactOrderRow({ order, onAccept, onReady, canAct, hasIncident }) {`
New: `function CompactOrderRow({ order, onAccept, onReady, canAct, hasIncident, profile, onlineProfiles, onStageStart, onStageComplete, onStageReassign }) {`

Add new local state near the existing `showCamera`/`showIncident`/`showFullDetail` declarations:
```js
const [showSplitStages, setShowSplitStages] = useState(false);
const stages = (order.order_stages || []).slice().sort((a, b) => a.stage_index - b.stage_index);
const canSplit = hasAnyRole(profile, ['kitchen_lead', 'owner', 'admin']) && stages.length === 0 && (order.status === 'moi' || order.status === 'dang_lam');
```
(`hasAnyRole` is already imported at the top of this file for `canAct`, so no new import needed here.)

In the chip row (find the line with `<QuickAskButton .../>` and the two `<ActionChip .../>`s for "Báo sự cố"/"Xem đầy đủ"), add a fourth chip right after them:
```jsx
{canSplit && <ActionChip icon={<IconStaff size={16} />} label="Chia công đoạn" tone="info" onClick={() => setShowSplitStages(true)} />}
```
Add the modal render alongside the other 3 conditional modals at the bottom of the expanded section:
```jsx
{showSplitStages && (
  <StageSplitModal order={order} onClose={() => setShowSplitStages(false)} onSaved={() => setShowSplitStages(false)} />
)}
```
(Its `onSaved` doesn't need to call `load()` directly — the parent's realtime subscription, extended in Step 7, will pick up the new `order_stages` rows and refresh automatically. If you want instant feedback without waiting on realtime round-trip, it's also fine to thread a `reloadOrders` prop down and call it in `onSaved` — do this if it's straightforward given the actual current prop-drilling shape you find; skip it if it complicates the diff, since realtime coverage makes it non-essential.)

- [ ] **Step 6: Render the stage checklist, replacing the single Accept/Ready block when stages exist**

Find the existing conditional block:
```jsx
{order.status === 'moi' && <Button variant="primary" size="sm" onClick={handleAccept} disabled={busy || !canAct}>{busy ? 'Đang xử lý...' : 'Nhận đơn'}</Button>}
{order.status === 'dang_lam' && (
  <React.Fragment>
    ...
  </React.Fragment>
)}
```
Wrap BOTH of these existing conditions in `{stages.length === 0 && (...)}` (unsplit orders keep exactly today's behavior), and add a new sibling block for split orders:
```jsx
{stages.length > 0 && (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
    {stages.map((stage, i) => {
      const locked = i > 0 && stages[i - 1].status !== 'hoan_thanh';
      const isMine = stage.assignee_id === profile?.id;
      const canManage = hasAnyRole(profile, ['kitchen_lead', 'owner', 'admin']);
      return (
        <div key={stage.id} style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: 8, background: locked ? 'var(--surface-sunken)' : 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', opacity: locked ? 0.6 : 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', font: 'var(--text-body-sm)' }}>
            <span>CĐ{stage.stage_index} · {stage.stage_name}</span>
            <Badge tone={stage.status === 'hoan_thanh' ? 'success' : stage.status === 'dang_lam' ? 'primary' : 'neutral'}>
              {stage.status === 'hoan_thanh' ? 'Xong' : stage.status === 'dang_lam' ? 'Đang làm' : locked ? 'Đã khoá' : 'Chờ làm'}
            </Badge>
          </div>
          <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>{stage.assignee_name}</div>
          {!locked && stage.status === 'cho_lam' && (isMine || canManage) && (
            <Button variant="secondary" size="sm" onClick={() => onStageStart(stage)}>Bắt đầu</Button>
          )}
          {!locked && stage.status === 'dang_lam' && (isMine || canManage) && (
            <div style={{ display: 'flex', gap: 6 }}>
              <Button variant="primary" size="sm" onClick={() => onStageComplete(order, stage, i === stages.length - 1)}>Hoàn thành</Button>
              <Select
                value=""
                onChange={(e) => {
                  const opt = onlineProfiles.find((p) => p.id === e.target.value);
                  if (opt) onStageReassign(stage, opt.id, opt.full_name);
                }}
                options={onlineProfiles.filter((p) => p.id !== stage.assignee_id).map((p) => ({ value: p.id, label: p.full_name }))}
                placeholder="Nhường lại cho..."
                style={{ maxWidth: 160 }}
              />
            </div>
          )}
        </div>
      );
    })}
  </div>
)}
```
This requires importing `Select` in this file (check whether `Select` is already imported at the top — if not, add `import { Select } from '../components/forms/Select';` alongside the existing `Button`/`Badge` imports).

- [ ] **Step 7: Extend the realtime subscription**

Find the existing block:
```js
useEffect(() => {
  const channel = supabase
    .channel('kds-orders-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, load)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'incident_reports' }, loadIncidentOrderIds)
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}, []);
```
Add one more `.on(...)` clause for `order_stages`, refetching via `load` (the same callback used for `orders`, since stages are nested inside each order's `fetchOrders` result — re-running `load()` re-fetches orders with their current nested stages):
```js
useEffect(() => {
  const channel = supabase
    .channel('kds-orders-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, load)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'incident_reports' }, loadIncidentOrderIds)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'order_stages' }, load)
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}, []);
```

- [ ] **Step 8: Manual verify**

Run: `npm run build` — must pass with no errors.
Run: `npm run dev`. Log in as a `kitchen_lead`/owner account, go to Bếp KDS:
1. On a `moi` order, confirm "Chia công đoạn" chip appears; open it, confirm only checked-in staff show in the assignee pickers, add 2 stages, save — confirm the order now shows a 2-row stage checklist instead of the normal Accept button, stage 1 unlocked/actionable, stage 2 shows "Đã khoá".
2. As the stage-1 assignee (or as owner/kitchen_lead, who can manage any stage), tap "Bắt đầu" then "Hoàn thành" on stage 1 — confirm stage 2 unlocks immediately (test with two browser tabs/windows to confirm the realtime unlock, not just a reload).
3. Complete the final stage — confirm the order's status moves to `cho_giao` (check it disappears from the KDS active list / appears correctly in Shipping) and `kitchen_staff_name` reflects the last stage's assignee.
4. On a `dang_lam` order that already has a solo `kitchen_staff_name` (no stages), open "Chia công đoạn" — confirm stage 1 pre-fills with that person's name and status "Đang làm" (not removable), add a helper as stage 2.
5. Confirm an already-split order does NOT show the "Chia công đoạn" chip again (only unsplit orders offer it).
6. Confirm a plain `kitchen`/`bakery` account does NOT see the "Chia công đoạn" chip at all.
7. Test "Nhường lại" — while a stage is `dang_lam`, reassign it to a different online staff member, confirm the name updates.

- [ ] **Step 9: Commit**

```bash
git add src/screens/KdsScreen.jsx
git commit -m "Wire multi-stage order splitting and stage checklist into Bếp KDS"
```

---

## Post-plan note for the user

After Task 1 lands, run `supabase/migrate_order_stages.sql` in the Supabase SQL Editor (safe to re-run) to activate the feature **before** deploying Task 2's code — Task 2 adds `order_stages(*)` to `ORDER_SELECT`, which every screen using `fetchOrders`/`fetchOrderById` depends on (Orders, KDS, Shipping, Reports, KPI). If that join runs against a database where `order_stages` doesn't exist yet, PostgREST will reject the whole query with a "relation does not exist" error, and every one of those screens will show its existing error-banner state instead of loading orders — this is a wider blast radius than prior features' migrations, since `ORDER_SELECT` is shared infrastructure. Run the migration first, confirm the table exists, then it's safe to deploy the rest.
