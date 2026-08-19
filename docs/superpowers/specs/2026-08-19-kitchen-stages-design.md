# Luồng 4 — Phối hợp nhóm trong bếp (multi-stage orders)

Date: 2026-08-19

## Goal

Let a bếp trưởng (head chef) split ONE order into sequential production
stages (e.g. bánh kem: chà kem → trang trí; bếp nóng: chuẩn bị nguyên liệu
→ đánh bột → tạo hình), assign each stage to a different online staff
member, and have stage N+1 stay locked until stage N is marked done —
in real time, no manual refresh needed. Most orders still go to one person
exactly as today; splitting is opt-in per order.

## 1. Data model

### New table: `order_stages`

```sql
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
```

"Locked" is never stored — it's derived: stage 1 is always actionable;
stage N (N>1) is locked in the UI until stage N-1's `status = 'hoan_thanh'`.
This avoids a redundant flag that could drift out of sync with the real
predecessor state.

An order with zero `order_stages` rows behaves exactly as today (single
`kitchen_staff_name`, no splitting) — this table is purely additive.

### RLS

- Read: any approved authenticated user.
- Insert: only `kitchen_lead`/`owner`/`admin` (role or `extra_roles`,
  matching the pattern established in `migrate_staff_log_self_attribution.sql`).
- Update: the row's own `assignee_id = auth.uid()` (to start/complete/hand
  off their own stage), OR `kitchen_lead`/`owner`/`admin` (to intervene on
  any stage — reassign, unblock).

### Realtime

`order_stages` gets added to the `supabase_realtime` publication (new
migration, same idempotent `do $$ ... $$` pattern already used for
`orders`/`order_notes`/`incident_reports` in `schema.sql`). `KdsScreen.jsx`'s
existing `kds-orders-live` channel (already subscribed to `orders` and
`incident_reports`) gains one more `.on('postgres_changes', {table:
'order_stages'}, ...)` clause — no new channel, same established pattern.

### No changes to `orders` or its update trigger

`orders.status`/`kitchen_staff_name`/`kitchen_photo_url` stay exactly as
they are. When the LAST stage is marked done, the app updates the order
the same way `handleReady` already does today (`status: 'cho_giao'`,
`kitchen_staff_name: <last stage's assignee>`) — this is already an
allowed transition for kitchen roles under the existing
`enforce_order_update_permissions()` trigger, so that trigger needs no
change. Stages are a KDS-internal detail; every other screen (Shipping,
Reports, KPI) keeps reading `orders` exactly as before and never needs to
know an order was split.

## 2. UI flow (`src/screens/KdsScreen.jsx`)

### Splitting an order

A new "Chia công đoạn" button appears on both `moi` (not-yet-accepted) AND
`dang_lam` (already accepted, solo, no stages yet) order cards, visible
only to `kitchen_lead`/`owner`/`admin` (bếp trưởng-only — plain
`kitchen`/`bakery`/`kitchen_deputy` don't see it, matching `kitchen_lead`'s
existing-but-unused `manage_kitchen_staff` permission). This covers the
"đơn gấp, cần thêm người phụ" case: an order already being worked solo can
still be split to bring in help.

Opening the modal on a `dang_lam` order (one that already has a solo
`kitchen_staff_name`) pre-fills stage 1 with that person as the assignee,
`status: 'dang_lam'` and `started_at: now()` (their real start time isn't
known, so "now" is used rather than guessing) — bếp trưởng can change this
if needed, then adds stage 2+ for the helper(s). Opening it on a `moi`
order starts with an empty stage list as before. Either way, help stays
**sequential** (confirmed): the helper's stage is still locked until the
current person's stage is marked done — same locking mechanism, no
separate "parallel work" concept. This keeps the feature to the one
locking mechanism already designed, rather than adding a second
unlocked-concurrent-stages model.

Opens a modal:

- A list of stage rows, each with: stage name (free-text input with
  autocomplete suggestions pulled from `fetchProducts()` names — typing
  or picking both work, no forced selection) and an assignee picker.
- The assignee picker is filtered to staff who are currently checked in
  today ("đang phát sáng xanh" — reuses the same open-checkin/no-checkout
  `shift_logs` computation already built for Luồng 1's schedule grid).
- "+ Thêm công đoạn" adds another row; minimum 1 stage (a 1-stage split is
  just today's single-assignee flow via a different button, so the
  minimum is really 2 in practice, but the UI doesn't hard-block 1).
- Submitting creates all `order_stages` rows at once (`stage_index` 1..N)
  and moves the order to `dang_lam` (work has started).

### Working a stage

The order card for a split order shows a stage checklist instead of the
single Accept/Ready buttons:
- Stage 1 (and any stage whose predecessor is done): if you're the
  assignee, "Bắt đầu" (sets `status: 'dang_lam'`, `started_at: now()`)
  then "Hoàn thành" (sets `status: 'hoan_thanh'`, `ended_at: now()`).
  Marking the LAST stage done also transitions the parent order to
  `cho_giao` in the same action.
- A locked stage (predecessor not done) shows a lock icon and "Chờ [tên
  công đoạn trước] xong" — no buttons.
- **Hand off mid-work**: the current assignee (or bếp trưởng) can tap
  "Nhường lại" on their own in-progress stage to reassign it to another
  online staff member — this just updates `assignee_id`/`assignee_name`
  on the same row; `started_at` is untouched (the stage's own elapsed
  time keeps running, credited to whoever is assignee when it's marked
  done — see trade-off below).

### Real-time unlock

When stage N is marked done, every KDS client subscribed to
`order_stages` changes re-renders immediately — the newly-unlocked stage
N+1 shows its "Bắt đầu" button the moment it becomes actionable, no
refresh needed.

## 3. Trade-off: stage credit is single-assignee, not time-split

If a stage is handed off mid-work, the KPI "coworking time" metric
(Luồng 3, not yet built) will credit whoever was assignee when the stage
was marked done — not a fair split between the original and replacement
person. Building true multi-person time-splitting per stage is
meaningfully more complex (needs a handoff-history sub-table) and wasn't
asked for — handoff is described as an occasional exception, not the
common case. If this proves wrong in practice, a `stage_handoffs` history
table is a natural, additive follow-up.

## Out of scope (v1)

- **Parallel (unlocked-concurrent) stages** — help is always sequential,
  per the owner's explicit choice; no second locking-free stage model.
- Per-stage photos — only the final stage's completion can still attach
  the existing single `kitchen_photo_url`, exactly as today's "Sẵn sàng"
  flow already does.
- Fair time-splitting on handoff (see trade-off above).
- Any change to the Shipping/Reports/KPI screens' existing
  `kitchen_staff_name`-based reads — they keep working unmodified; a
  split order still surfaces there as a single completing name.
