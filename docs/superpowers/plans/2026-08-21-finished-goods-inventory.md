# Kho bánh thành phẩm (nhập/xuất/tồn) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track finished-goods (bánh đã làm) inventory per product per branch (Bakery / Xưởng 42 / Xưởng Macaron), nhập automatically from Ghi Nhận Sản Xuất, xuất automatically when an order is marked "Hoàn thành", plus an owner/admin-only manual adjustment for physical-count corrections.

**Architecture:** Three new Postgres tables (`finished_goods_stock` running-balance + two log tables), one pure helper (`branchForCategory`) reused by both the nhập and xuất call sites, two small additions to existing mutation functions in `src/lib/queries.js` (no new screens' worth of business logic — the automatic behavior piggybacks on functions that already run today), and one new tab + panel in the existing `WarehouseScreen.jsx`.

**Tech Stack:** React 18 + Vite, Supabase (Postgres + supabase-js client, no RPC/triggers — all logic lives in the JS client layer, matching this codebase's established convention), no test framework present in this repo (confirmed: no jest/vitest, no `*.test.*` files) — verification is `npx vite build` (compile-check) plus manual live QA against the deployed app, matching how every other feature in this codebase has been verified this project.

## Global Constraints

- This feature is **strictly additive**: new tables, new files, two small hooks into existing functions. It must never modify, delete, or migrate existing rows in `profiles`, `orders`, `order_items`, `products`, `production_logs`, or `warehouse_stock` — those hold real staff/production data (explicit owner instruction, 2026-08-21).
- All Supabase migrations are plain idempotent `.sql` files under `supabase/`, run manually by the owner in the Supabase SQL Editor — never auto-applied. Follow the exact style of `supabase/migrate_production_logs.sql` (RLS policies use `drop policy if exists` before `create policy`, tables use `create table if not exists`).
- No `.upsert()` calls — this codebase always does an explicit find-then-update-or-insert round trip in JS (see `addWarehouseStock` in `src/lib/queries.js:360`). Follow that exact pattern for `finished_goods_stock` writes, for consistency with the rest of the file.
- `size` must be normalized to JS `null` (never `''`) before any `finished_goods_stock` read/write — `null` and `''` are different values under the table's unique constraint, and empty string would silently create a second stock row for the same product.
- Follow existing component patterns exactly: `Select`/`Input`/`Button` from `src/components/forms/*`, `Tabs` from `src/components/navigation/Tabs.jsx`, `Badge` from `src/components/feedback/Badge.jsx`. Do not introduce new UI primitives.
- Every screen-visible number in Vietnamese, following existing copy conventions in `WarehouseScreen.jsx` (e.g. "Tồn:", "Kho chưa có...").

---

## File Structure

- **Create:** `supabase/migrate_finished_goods_stock.sql` — 3 tables + RLS.
- **Modify:** `src/lib/cakePricing.js` — add `branchForCategory(category)`.
- **Modify:** `src/lib/queries.js` — add `fetchFinishedGoodsStock`, `fetchFinishedGoodsStockInLog`, `fetchFinishedGoodsStockOutLog`, `adjustFinishedGoodsStock`; extend `addProductionLog` and add `deductFinishedGoodsStockForOrder`.
- **Modify:** `src/screens/ShippingScreen.jsx` — call `deductFinishedGoodsStockForOrder` after a successful "Hoàn thành" update.
- **Create:** `src/components/warehouse/FinishedGoodsPanel.jsx` — the new tab's list + branch selector + history + summary cards (kept out of `WarehouseScreen.jsx` to avoid growing that already-large file further, matching the "split by responsibility" guidance — ingredients stay in `WarehouseScreen.jsx`, finished goods gets its own file).
- **Create:** `src/components/warehouse/AdjustStockForm.jsx` — owner/admin-only manual correction form.
- **Modify:** `src/screens/WarehouseScreen.jsx` — add the Nguyên liệu/Thành phẩm `Tabs`, render `FinishedGoodsPanel` under the second tab.

---

## Task 1: Database schema — `finished_goods_stock` + log tables + RLS

**Files:**
- Create: `supabase/migrate_finished_goods_stock.sql`
- Modify: `supabase/schema.sql` (append the 3 table definitions in the same style as the existing `warehouse_stock`/`warehouse_stock_in_log`/`warehouse_stock_out_log` block, so a fresh install and a migrated install stay consistent — matches the existing convention of every other migration in this repo also appending to `schema.sql`)

**Interfaces:**
- Produces: tables `finished_goods_stock(id, product_id, size, branch, qty, updated_at)`, `finished_goods_stock_in_log(id, product_id, product_name, size, branch, qty, source, source_id, staff_name, note, created_at)`, `finished_goods_stock_out_log(id, product_id, product_name, size, branch, qty, order_id, order_code, note, created_at)` — these exact column names/types are consumed by every later task's queries.

- [ ] **Step 1: Write the migration SQL**

```sql
-- Run manually in Supabase SQL Editor. Safe to re-run (idempotent).
-- Kho bánh thành phẩm: tồn kho hiện tại theo (sản phẩm, size, chi nhánh),
-- nhập tự động từ Ghi Nhận Sản Xuất, xuất tự động khi đơn Hoàn thành.
-- Hoàn toàn thêm mới — không đụng đến profiles/orders/order_items/products/
-- production_logs/warehouse_stock đang có dữ liệu thật.

create table if not exists finished_goods_stock (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  size text,
  branch text not null check (branch in ('bakery','xuong41','xuong42')),
  qty numeric(12,0) not null default 0,
  updated_at timestamptz not null default now(),
  unique (product_id, size, branch)
);

create table if not exists finished_goods_stock_in_log (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) on delete set null,
  product_name text not null,
  size text,
  branch text not null,
  qty numeric(12,0) not null,
  source text not null default 'production_log',
  source_id uuid,
  staff_name text,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists finished_goods_stock_out_log (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) on delete set null,
  product_name text not null,
  size text,
  branch text not null,
  qty numeric(12,0) not null,
  order_id uuid references orders(id) on delete set null,
  order_code text,
  note text,
  created_at timestamptz not null default now()
);

alter table finished_goods_stock enable row level security;
alter table finished_goods_stock_in_log enable row level security;
alter table finished_goods_stock_out_log enable row level security;

drop policy if exists "read finished_goods_stock" on finished_goods_stock;
create policy "read finished_goods_stock" on finished_goods_stock
  for select using (auth.role() = 'authenticated' and public.is_approved());

drop policy if exists "insert finished_goods_stock" on finished_goods_stock;
create policy "insert finished_goods_stock" on finished_goods_stock
  for insert with check (auth.role() = 'authenticated');

drop policy if exists "update finished_goods_stock" on finished_goods_stock;
create policy "update finished_goods_stock" on finished_goods_stock
  for update using (auth.role() = 'authenticated');

drop policy if exists "read finished_goods_stock_in_log" on finished_goods_stock_in_log;
create policy "read finished_goods_stock_in_log" on finished_goods_stock_in_log
  for select using (auth.role() = 'authenticated' and public.is_approved());

drop policy if exists "insert finished_goods_stock_in_log" on finished_goods_stock_in_log;
create policy "insert finished_goods_stock_in_log" on finished_goods_stock_in_log
  for insert with check (auth.role() = 'authenticated');

drop policy if exists "read finished_goods_stock_out_log" on finished_goods_stock_out_log;
create policy "read finished_goods_stock_out_log" on finished_goods_stock_out_log
  for select using (auth.role() = 'authenticated' and public.is_approved());

drop policy if exists "insert finished_goods_stock_out_log" on finished_goods_stock_out_log;
create policy "insert finished_goods_stock_out_log" on finished_goods_stock_out_log
  for insert with check (auth.role() = 'authenticated');
```

- [ ] **Step 2: Verify `public.is_approved()` exists before relying on it**

Run: `grep -n "is_approved" supabase/schema.sql | head -3`
Expected: at least one `create function public.is_approved()` definition (this function is used by every other `read ...` policy in the file, e.g. `warehouse_stock`'s — confirm the name matches exactly before pasting it into the new policies above).

- [ ] **Step 3: Append the same 3 `create table` blocks (Step 1, minus the RLS section) to `supabase/schema.sql`**

Insert them directly after the existing `warehouse_stock_out_log`/`warehouse_stock_in_log` block (search for `create table if not exists warehouse_stock_in_log` to find the spot), so a fresh install has the tables from day one. The RLS `alter table ... enable row level security` and `create policy` statements belong in `schema.sql`'s existing RLS section — find where `alter table warehouse_stock enable row level security;` appears and add the 3 new `alter table` lines right after it, then add the 8 `create policy` statements near the existing `warehouse_stock` policies (search for `"read warehouse_stock"` in `schema.sql` to find that block).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrate_finished_goods_stock.sql supabase/schema.sql
git commit -m "Add finished_goods_stock schema (nhập/xuất/tồn kho bánh)"
```

---

## Task 2: `branchForCategory` helper

**Files:**
- Modify: `src/lib/cakePricing.js`

**Interfaces:**
- Consumes: nothing (pure function).
- Produces: `branchForCategory(category: string) => 'bakery' | 'xuong41' | 'xuong42'` — imported by Task 3's `queries.js` additions.

- [ ] **Step 1: Add the function**

Add near the other category-group exports at the top of the file (after `QTY_ONLY_CATEGORIES`/`NO_CAKE_EXTRAS_CATEGORIES`):

```js
// Kho bánh thành phẩm dùng đúng cách phân luồng này để xác định 1 sản phẩm
// thuộc kho nào — macaron -> Xưởng Macaron (xuong41), teabreak -> Xưởng 42,
// còn lại (bánh kem, mặn ngọt, trung thu...) -> Bakery. Dùng chung cho cả
// nhập kho (Ghi Nhận Sản Xuất) và xuất kho (đơn Hoàn thành) để không bao giờ
// lệch nhau giữa 2 luồng.
export function branchForCategory(category) {
  if (category === 'macaron') return 'xuong41';
  if (category === 'teabreak') return 'xuong42';
  return 'bakery';
}
```

- [ ] **Step 2: Verify with a quick node check**

Run:
```bash
node -e "
const m = require('child_process').execSync(\"grep -A6 'export function branchForCategory' src/lib/cakePricing.js\").toString();
console.log(m);
"
```
Expected: prints the function body unchanged (sanity check the edit landed correctly — this file has no build step of its own, `vite build` in Task 7 is the real verification).

- [ ] **Step 3: Commit**

```bash
git add src/lib/cakePricing.js
git commit -m "Add branchForCategory helper for finished-goods stock routing"
```

---

## Task 3: `queries.js` — fetch/adjust functions for finished-goods stock

**Files:**
- Modify: `src/lib/queries.js`

**Interfaces:**
- Consumes: `supabase` client (already imported at top of file).
- Produces:
  - `fetchFinishedGoodsStock() => Promise<Array<{id, product_id, size, branch, qty, updated_at}>>`
  - `fetchFinishedGoodsStockInLog(limit = 100) => Promise<Array<log row>>`
  - `fetchFinishedGoodsStockOutLog(limit = 100) => Promise<Array<log row>>`
  - `adjustFinishedGoodsStock({ productId, productName, size, branch, newQty, note, staffName }) => Promise<void>` — sets the row to exactly `newQty`, logging the delta.
  - `upsertFinishedGoodsStock({ productId, size, branch, delta }) => Promise<number>` (internal helper, not exported outside this file — returns the new qty) — used by Task 4 and Task 5.

- [ ] **Step 1: Add the fetch functions**

Add near `fetchWarehouseStockInLog`/`fetchWarehouseStockOutLog` (around line 415-420):

```js
export async function fetchFinishedGoodsStock() {
  const { data, error } = await supabase.from('finished_goods_stock').select('*').order('updated_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function fetchFinishedGoodsStockInLog(limit = 100) {
  const { data, error } = await supabase.from('finished_goods_stock_in_log').select('*').order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return data;
}

export async function fetchFinishedGoodsStockOutLog(limit = 100) {
  const { data, error } = await supabase.from('finished_goods_stock_out_log').select('*').order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return data;
}
```

- [ ] **Step 2: Add the internal upsert helper (find-then-update-or-insert, matching `addWarehouseStock`'s pattern)**

Add directly above the fetch functions from Step 1:

```js
// Cộng/trừ tồn kho thành phẩm cho đúng 1 dòng (product_id, size, branch).
// delta dương = nhập, âm = xuất (được phép âm nếu bán trước khi kịp ghi
// sản xuất). Trả về số dư mới để caller ghi log đúng số.
async function upsertFinishedGoodsStock({ productId, size, branch }, delta) {
  const normalizedSize = size || null;
  const { data: existing, error: findErr } = await supabase
    .from('finished_goods_stock').select('*')
    .eq('product_id', productId).eq('branch', branch)
    .is('size', normalizedSize === null ? null : undefined)
    .eq(normalizedSize === null ? 'id' : 'size', normalizedSize === null ? undefined : normalizedSize)
    .maybeSingle();
  // Supabase's query builder can't conditionally chain .is() vs .eq() cleanly for
  // a nullable column in one expression — query explicitly per case instead.
  let row = existing;
  let findError = findErr;
  if (normalizedSize === null) {
    const res = await supabase.from('finished_goods_stock').select('*')
      .eq('product_id', productId).eq('branch', branch).is('size', null).maybeSingle();
    row = res.data; findError = res.error;
  } else {
    const res = await supabase.from('finished_goods_stock').select('*')
      .eq('product_id', productId).eq('branch', branch).eq('size', normalizedSize).maybeSingle();
    row = res.data; findError = res.error;
  }
  if (findError) throw findError;

  if (row) {
    const newQty = Number(row.qty || 0) + delta;
    const { error } = await supabase.from('finished_goods_stock')
      .update({ qty: newQty, updated_at: new Date().toISOString() }).eq('id', row.id);
    if (error) throw error;
    return newQty;
  }
  const { error } = await supabase.from('finished_goods_stock')
    .insert({ product_id: productId, size: normalizedSize, branch, qty: delta });
  if (error) throw error;
  return delta;
}
```

- [ ] **Step 3: Simplify Step 2 — remove the dead first query attempt**

The first `existing`/`findErr` block in Step 2 is leftover reasoning-in-code and does nothing useful (its result is immediately overwritten). Delete these 6 lines before committing:

```js
  const { data: existing, error: findErr } = await supabase
    .from('finished_goods_stock').select('*')
    .eq('product_id', productId).eq('branch', branch)
    .is('size', normalizedSize === null ? null : undefined)
    .eq(normalizedSize === null ? 'id' : 'size', normalizedSize === null ? undefined : normalizedSize)
    .maybeSingle();
  // Supabase's query builder can't conditionally chain .is() vs .eq() cleanly for
  // a nullable column in one expression — query explicitly per case instead.
  let row = existing;
  let findError = findErr;
```

Replace with just:

```js
  let row, findError;
```

(The final function body: declare `let row, findError;` then the existing `if (normalizedSize === null) { ... } else { ... }` block, unchanged.)

- [ ] **Step 4: Add `adjustFinishedGoodsStock`**

```js
export async function adjustFinishedGoodsStock({ productId, productName, size, branch, newQty, note, staffName }) {
  const normalizedSize = size || null;
  let current;
  if (normalizedSize === null) {
    const { data, error } = await supabase.from('finished_goods_stock').select('*')
      .eq('product_id', productId).eq('branch', branch).is('size', null).maybeSingle();
    if (error) throw error;
    current = data;
  } else {
    const { data, error } = await supabase.from('finished_goods_stock').select('*')
      .eq('product_id', productId).eq('branch', branch).eq('size', normalizedSize).maybeSingle();
    if (error) throw error;
    current = data;
  }
  const currentQty = Number(current?.qty || 0);
  const delta = Number(newQty) - currentQty;
  if (delta === 0) return;

  if (current) {
    const { error } = await supabase.from('finished_goods_stock')
      .update({ qty: Number(newQty), updated_at: new Date().toISOString() }).eq('id', current.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('finished_goods_stock')
      .insert({ product_id: productId, size: normalizedSize, branch, qty: Number(newQty) });
    if (error) throw error;
  }

  const logTable = delta > 0 ? 'finished_goods_stock_in_log' : 'finished_goods_stock_out_log';
  const logRow = {
    product_id: productId, product_name: productName, size: normalizedSize, branch,
    qty: Math.abs(delta), note: note || null,
  };
  if (delta > 0) { logRow.source = 'adjustment'; logRow.staff_name = staffName || null; }
  const { error: logErr } = await supabase.from(logTable).insert(logRow);
  if (logErr) throw logErr;
}
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/queries.js
git commit -m "Add finished-goods stock fetch/adjust query functions"
```

---

## Task 4: Auto-nhập from `addProductionLog`

**Files:**
- Modify: `src/lib/queries.js:93-100` (the existing `addProductionLog` function)

**Interfaces:**
- Consumes: `upsertFinishedGoodsStock` (Task 3), `branchForCategory` (Task 2) — add the import: `import { branchForCategory } from './cakePricing';` at the top of `queries.js` if not already imported (check first — `queries.js` may not currently import from `cakePricing.js`).
- Produces: `addProductionLog` gains one side effect — no signature change, so every existing caller (`ProductionLogModal.jsx`) keeps working unchanged.

- [ ] **Step 1: Check whether `queries.js` already imports from `cakePricing.js`**

Run: `grep -n "from './cakePricing'" src/lib/queries.js`
Expected: no output (confirms the import needs to be added) — if it does exist, merge into that line instead of adding a new one.

- [ ] **Step 2: Add the import**

At the top of `src/lib/queries.js`, add:
```js
import { branchForCategory } from './cakePricing';
```

- [ ] **Step 3: Extend `addProductionLog` to look up the product's category and record stock-in**

Replace the existing function body (`src/lib/queries.js:93-100`):

```js
export async function addProductionLog({ productId, productName, qty, size, price, staffId, staffName, workDate }) {
  const { error } = await supabase.from('production_logs').insert({
    product_id: productId || null, product_name: productName, qty,
    size: size || null, price: price || null,
    staff_id: staffId || null, staff_name: staffName, work_date: workDate,
  });
  if (error) throw error;

  if (productId) {
    try {
      const { data: product } = await supabase.from('products').select('category').eq('id', productId).maybeSingle();
      const branch = branchForCategory(product?.category);
      await upsertFinishedGoodsStock({ productId, size, branch }, Number(qty) || 0);
      await supabase.from('finished_goods_stock_in_log').insert({
        product_id: productId, product_name: productName, size: size || null, branch,
        qty: Number(qty) || 0, source: 'production_log', staff_name: staffName || null,
      });
    } catch (stockErr) {
      // Ghi sản xuất đã lưu thành công — không chặn luồng chính nếu cộng kho
      // thất bại, chỉ cảnh báo để không mất dữ liệu sản xuất thật.
      console.error('Không cộng được kho thành phẩm:', stockErr);
    }
  }
}
```

- [ ] **Step 4: Run the build to check for syntax errors**

Run: `npx vite build --logLevel warn 2>&1 | tail -20`
Expected: `✓ built in ...ms`, no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/queries.js
git commit -m "Auto-nhập kho thành phẩm when logging production"
```

---

## Task 5: Auto-xuất on order completion

**Files:**
- Modify: `src/lib/queries.js` — add `deductFinishedGoodsStockForOrder`
- Modify: `src/screens/ShippingScreen.jsx:321-340` (`applyFields`) and `:361-367` (`handleComplete`)

**Interfaces:**
- Consumes: `upsertFinishedGoodsStock`, `branchForCategory` (already imported from Task 4).
- Produces: `deductFinishedGoodsStockForOrder(order) => Promise<void>` where `order` is the already-loaded order object with `.order_items` nested (matches `ORDER_SELECT`'s shape, already used everywhere else in this file — no extra fetch needed).

- [ ] **Step 1: Add `deductFinishedGoodsStockForOrder` to `queries.js`**

Add near `addProductionLog`:

```js
// Trừ kho thành phẩm cho từng sản phẩm trong đơn khi đơn được đánh dấu Hoàn
// thành. Chỉ áp dụng cho dòng có product_id (chọn từ menu) — dòng nhập tay
// tự do ("Khác") không có sản phẩm để trừ, bỏ qua theo đúng thiết kế đã
// thống nhất. Cho phép âm kho (bánh custom làm theo đơn, chưa từng "nhập").
export async function deductFinishedGoodsStockForOrder(order) {
  const items = order.order_items || [];
  for (const item of items) {
    if (!item.product_id) continue;
    const branch = branchForCategory(item.category);
    const qty = Number(item.qty) || 0;
    if (!qty) continue;
    try {
      await upsertFinishedGoodsStock({ productId: item.product_id, size: item.size, branch }, -qty);
      await supabase.from('finished_goods_stock_out_log').insert({
        product_id: item.product_id, product_name: item.name, size: item.size || null, branch,
        qty, order_id: order.id, order_code: order.order_code,
      });
    } catch (stockErr) {
      // Đơn đã được xác nhận giao xong — không chặn luồng giao hàng nếu trừ
      // kho thất bại, chỉ cảnh báo.
      console.error('Không trừ được kho thành phẩm cho đơn', order.order_code, stockErr);
    }
  }
}
```

- [ ] **Step 2: Call it from `ShippingScreen.jsx`'s `handleComplete`**

In `src/screens/ShippingScreen.jsx`, add the import at the top:
```js
import { deductFinishedGoodsStockForOrder } from '../lib/queries';
```
(check the existing import line from `'../lib/queries'` first and merge into it rather than adding a second import line — run `grep -n "from '../lib/queries'" src/screens/ShippingScreen.jsx` to find it.)

Then modify `handleComplete` (`src/screens/ShippingScreen.jsx:361-367`):

```js
const handleComplete = async (order, photoUrl, pos, lateReason) => {
  const fields = { status: 'hoan_thanh', completed_at: new Date().toISOString() };
  if (photoUrl) fields.delivery_photo_url = photoUrl;
  if (pos) { fields.delivery_lat = pos.lat; fields.delivery_lng = pos.lng; }
  if (lateReason) fields.late_reason = lateReason;
  const ok = await applyFields(order, fields);
  if (ok) deductFinishedGoodsStockForOrder(order).catch((err) => console.error('Trừ kho thành phẩm thất bại:', err));
};
```

- [ ] **Step 3: Run the build**

Run: `npx vite build --logLevel warn 2>&1 | tail -20`
Expected: `✓ built in ...ms`, no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/queries.js src/screens/ShippingScreen.jsx
git commit -m "Auto-xuất kho thành phẩm when an order is marked Hoàn thành"
```

---

## Task 6: `FinishedGoodsPanel` component (list + branch selector + summary + history)

**Files:**
- Create: `src/components/warehouse/FinishedGoodsPanel.jsx`

**Interfaces:**
- Consumes: `fetchFinishedGoodsStock`, `fetchFinishedGoodsStockInLog`, `fetchFinishedGoodsStockOutLog` (Task 3), `fetchProducts` (existing), `hasAnyRole` (existing, `../../lib/roles`), `useAuth` (existing, `../../lib/AuthContext`).
- Produces: `export default function FinishedGoodsPanel()` — a self-contained panel, no props (reads auth/profile itself), rendered by Task 7's `WarehouseScreen.jsx` change.

- [ ] **Step 1: Create the component**

```jsx
import React, { useEffect, useMemo, useState } from 'react';
import { Badge } from '../feedback/Badge';
import { Button } from '../forms/Button';
import {
  fetchFinishedGoodsStock, fetchFinishedGoodsStockInLog, fetchFinishedGoodsStockOutLog, fetchProducts,
} from '../../lib/queries';
import { useAuth } from '../../lib/AuthContext';
import { hasAnyRole } from '../../lib/roles';
import AdjustStockForm from './AdjustStockForm';

const BRANCHES = [
  { value: 'bakery', label: 'Kho Bakery' },
  { value: 'xuong41', label: 'Kho Xưởng Macaron' },
  { value: 'xuong42', label: 'Kho Xưởng 42' },
];
const branchLabel = (v) => BRANCHES.find((b) => b.value === v)?.label || v;
const BRANCH_ROLE_MAP = { kho_bakery: 'bakery', kho_xuong41: 'xuong41', kho_xuong42: 'xuong42' };
const FULL_ACCESS_ROLES = ['owner', 'admin', 'warehouse'];

function HistorySection({ products, effectiveBranch, onClose }) {
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([fetchFinishedGoodsStockInLog(200), fetchFinishedGoodsStockOutLog(200)])
      .then(([inLog, outLog]) => {
        const merged = [
          ...inLog.map((l) => ({ ...l, kind: 'in' })),
          ...outLog.map((l) => ({ ...l, kind: 'out' })),
        ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        setEntries(merged);
      })
      .catch((err) => setError(err.message));
  }, []);

  const filtered = entries?.filter((e) => effectiveBranch === 'all' || e.branch === effectiveBranch) || [];

  return (
    <div style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ font: 'var(--text-label)', color: 'var(--text-primary)' }}>Lịch sử Nhập/Xuất</div>
        <Button variant="ghost" size="sm" onClick={onClose}>Đóng</Button>
      </div>
      {error && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)' }}>{error}</div>}
      {entries === null ? (
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Đang tải...</div>
      ) : filtered.length === 0 ? (
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Chưa có lịch sử nhập/xuất nào.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 420, overflowY: 'auto' }}>
          {filtered.map((e) => (
            <div key={`${e.kind}-${e.id}`} style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}>
              <div style={{ minWidth: 0, flex: '1 1 200px' }}>
                <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-primary)' }}>
                  <Badge tone={e.kind === 'in' ? 'success' : 'warning'}>{e.kind === 'in' ? 'Nhập' : 'Xuất'}</Badge> {e.product_name}{e.size ? ` · ${e.size}` : ''} — {e.qty}
                </div>
                <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>
                  {branchLabel(e.branch)}{e.kind === 'in' && e.source === 'adjustment' ? ' · Điều chỉnh tay' : ''}{e.kind === 'out' && e.order_code ? ` · Đơn: ${e.order_code}` : ''}{e.staff_name ? ` · ${e.staff_name}` : ''}{e.note ? ` · ${e.note}` : ''}
                </div>
              </div>
              <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)', flexShrink: 0, textAlign: 'right' }}>
                {new Date(e.created_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function FinishedGoodsPanel() {
  const { profile } = useAuth();
  const hasFullAccess = hasAnyRole(profile, FULL_ACCESS_ROLES);
  const myBranches = hasFullAccess ? [] : [...new Set([profile?.role, ...(profile?.extra_roles || [])].map((r) => BRANCH_ROLE_MAP[r]).filter(Boolean))];
  const lockedBranch = !hasFullAccess && myBranches.length === 1 ? myBranches[0] : null;
  const [viewBranch, setViewBranch] = useState(lockedBranch || 'all');
  const effectiveBranch = lockedBranch || viewBranch;

  const [stock, setStock] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [showAdjust, setShowAdjust] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([fetchFinishedGoodsStock(), fetchProducts()])
      .then(([stockData, productsData]) => { setStock(stockData); setProducts(productsData); setError(''); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const productName = (id) => products.find((p) => p.id === id)?.name || 'Sản phẩm đã xoá';

  const allItems = effectiveBranch === 'all' ? stock : stock.filter((s) => s.branch === effectiveBranch);
  const negativeCount = allItems.filter((s) => Number(s.qty) < 0).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {!lockedBranch && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <label style={{ font: 'var(--text-label)', color: 'var(--text-secondary)' }}>Chọn kho:</label>
          <select
            value={effectiveBranch}
            onChange={(e) => setViewBranch(e.target.value)}
            style={{
              padding: '10px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)',
              background: 'var(--surface-card)', color: 'var(--text-primary)', font: 'var(--text-body)', cursor: 'pointer', minWidth: 220,
            }}
          >
            {hasFullAccess && <option value="all">Tất cả ({stock.length})</option>}
            {BRANCHES.filter((b) => hasFullAccess || myBranches.includes(b.value)).map((b) => (
              <option key={b.value} value={b.value}>{b.label} ({stock.filter((s) => s.branch === b.value).length})</option>
            ))}
          </select>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 12 }}>
        <div style={{ background: 'var(--surface-sunken)', borderRadius: 'var(--radius-md)', padding: 16 }}>
          <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Tổng dòng tồn kho</div>
          <div style={{ font: 'var(--text-title)', color: 'var(--text-primary)' }}>{allItems.length}</div>
        </div>
        <div style={{ background: 'var(--surface-sunken)', borderRadius: 'var(--radius-md)', padding: 16 }}>
          <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Sản phẩm âm kho</div>
          <div style={{ font: 'var(--text-title)', color: negativeCount ? 'var(--status-danger)' : 'var(--text-primary)' }}>{negativeCount}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button variant="ghost" size="sm" onClick={() => setShowHistory((v) => !v)}>
          {showHistory ? 'Ẩn lịch sử Nhập/Xuất' : 'Xem lịch sử Nhập/Xuất'}
        </Button>
        {hasAnyRole(profile, ['owner', 'admin']) && (
          <Button variant="secondary" size="sm" onClick={() => setShowAdjust((v) => !v)}>
            {showAdjust ? 'Đóng điều chỉnh' : 'Điều chỉnh tồn kho'}
          </Button>
        )}
      </div>

      {showHistory && <HistorySection products={products} effectiveBranch={effectiveBranch} onClose={() => setShowHistory(false)} />}
      {showAdjust && (
        <AdjustStockForm products={products} defaultBranch={effectiveBranch === 'all' ? 'bakery' : effectiveBranch}
          staffName={profile?.full_name} onSaved={load} onClose={() => setShowAdjust(false)} />
      )}

      {error && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)' }}>Lỗi tải kho: {error}</div>}
      {loading ? (
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Đang tải...</div>
      ) : allItems.length === 0 ? (
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Chưa có tồn kho thành phẩm nào — sẽ tự động cộng khi bếp ghi sản xuất.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {allItems.map((s) => (
            <div key={s.id} style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ font: '700 17px var(--font-body)', color: 'var(--text-primary)' }}>{productName(s.product_id)}{s.size ? ` · ${s.size}` : ''}</div>
                <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>{effectiveBranch === 'all' ? branchLabel(s.branch) : ' '}</div>
              </div>
              <div style={{ font: '700 20px var(--font-body)', color: Number(s.qty) < 0 ? 'var(--status-danger)' : 'var(--text-primary)' }}>{s.qty}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify `Badge`'s `tone` prop supports `"success"`/`"warning"`**

Run: `grep -n "tone" src/components/feedback/Badge.jsx`
Expected: a `tone` prop mapping including `success`/`warning` (matches usage already proven in `WarehouseScreen.jsx`'s own `HistorySection` — this component's `HistorySection` is a near-identical copy, so if it worked there it works here).

- [ ] **Step 3: Commit**

```bash
git add src/components/warehouse/FinishedGoodsPanel.jsx
git commit -m "Add FinishedGoodsPanel component for kho thành phẩm tab"
```

(This commit will fail to build stand-alone since `AdjustStockForm` doesn't exist yet — that's fine, Task 7 immediately follows and the combined result is what gets built/verified. If running tasks independently, verify the build after Task 7 instead.)

---

## Task 7: `AdjustStockForm` component (owner/admin only)

**Files:**
- Create: `src/components/warehouse/AdjustStockForm.jsx`

**Interfaces:**
- Consumes: `adjustFinishedGoodsStock` (Task 3), `fetchFinishedGoodsStock` (Task 3, to find the product's current qty for the size the user picks).
- Produces: `export default function AdjustStockForm({ products, defaultBranch, staffName, onSaved, onClose })` — rendered by `FinishedGoodsPanel` (Task 6).

- [ ] **Step 1: Create the component**

```jsx
import React, { useEffect, useState } from 'react';
import { Button } from '../forms/Button';
import { Input } from '../forms/Input';
import { Select } from '../forms/Select';
import { adjustFinishedGoodsStock, fetchFinishedGoodsStock } from '../../lib/queries';

const BRANCHES = [
  { value: 'bakery', label: 'Kho Bakery' },
  { value: 'xuong41', label: 'Kho Xưởng Macaron' },
  { value: 'xuong42', label: 'Kho Xưởng 42' },
];

export default function AdjustStockForm({ products, defaultBranch, staffName, onSaved, onClose }) {
  const [productId, setProductId] = useState(products[0]?.id || '');
  const [size, setSize] = useState('');
  const [branch, setBranch] = useState(defaultBranch || 'bakery');
  const [newQty, setNewQty] = useState('');
  const [note, setNote] = useState('');
  const [currentQty, setCurrentQty] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const product = products.find((p) => p.id === productId);
  const sizeOptions = product?.product_variants?.length
    ? product.product_variants.map((v) => ({ value: v.label, label: v.label }))
    : [];

  useEffect(() => {
    if (!productId) return;
    fetchFinishedGoodsStock().then((rows) => {
      const match = rows.find((r) => r.product_id === productId && r.branch === branch && (r.size || '') === (size || ''));
      setCurrentQty(match ? Number(match.qty) : 0);
    }).catch(() => setCurrentQty(null));
  }, [productId, branch, size]);

  const handleSubmit = async () => {
    if (!productId || newQty === '') { setError('Chọn sản phẩm và nhập số lượng đúng thực tế.'); return; }
    if (!note.trim()) { setError('Nhập lý do điều chỉnh (VD: kiểm kê phát hiện thiếu 2 cái).'); return; }
    setSaving(true);
    setError('');
    try {
      await adjustFinishedGoodsStock({
        productId, productName: product?.name || '', size: size || null, branch,
        newQty: Number(newQty), note: note.trim(), staffName,
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {error && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)' }}>{error}</div>}
      <Select label="Sản phẩm" value={productId} onChange={(e) => { setProductId(e.target.value); setSize(''); }}
        options={products.map((p) => ({ value: p.id, label: p.name }))} />
      {sizeOptions.length > 0 && (
        <Select label="Size" value={size} onChange={(e) => setSize(e.target.value)} options={sizeOptions} placeholder="Chọn size..." />
      )}
      <Select label="Thuộc kho" value={branch} onChange={(e) => setBranch(e.target.value)} options={BRANCHES} />
      {currentQty !== null && (
        <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Tồn kho hiện tại trong hệ thống: <b>{currentQty}</b></div>
      )}
      <Input label="Số lượng đúng thực tế" type="number" placeholder="VD: 6" value={newQty} onChange={(e) => setNewQty(e.target.value)}
        helpText="Nhập đúng số bánh đang thật sự còn trong kho — không phải số cộng/trừ." />
      <Input label="Lý do điều chỉnh" placeholder="VD: Kiểm kê phát hiện thiếu 2 cái" value={note} onChange={(e) => setNote(e.target.value)} />
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>Hủy</Button>
        <Button variant="primary" size="sm" onClick={handleSubmit} disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu điều chỉnh'}</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run the build**

Run: `npx vite build --logLevel warn 2>&1 | tail -20`
Expected: `✓ built in ...ms`, no errors. This is the first point both new components compile together — fix any import/prop mismatches surfaced here before continuing.

- [ ] **Step 3: Commit**

```bash
git add src/components/warehouse/AdjustStockForm.jsx
git commit -m "Add AdjustStockForm for owner/admin manual stock corrections"
```

---

## Task 8: Wire the new tab into `WarehouseScreen.jsx`

**Files:**
- Modify: `src/screens/WarehouseScreen.jsx`

**Interfaces:**
- Consumes: `FinishedGoodsPanel` (Task 6), `Tabs` (existing, `../components/navigation/Tabs`).
- Produces: no new exports — this is the final wiring task.

- [ ] **Step 1: Add the imports**

At the top of `src/screens/WarehouseScreen.jsx`, add:
```js
import { Tabs } from '../components/navigation/Tabs';
import FinishedGoodsPanel from '../components/warehouse/FinishedGoodsPanel';
```

- [ ] **Step 2: Add tab state and the `Tabs` control**

In `export default function WarehouseScreen(...)`, add near the top of the function body (after the existing `useState` calls, e.g. right after `const [showIncident, setShowIncident] = useState(false);`):
```js
const [activeTab, setActiveTab] = useState('nguyen_lieu');
```

Then, in the JSX, directly after the `<div>` block containing the screen title (the one with `Kho Hàng — Bà Tám`) and before the `{!lockedBranch && (...)}` branch-selector block, insert:
```jsx
<Tabs tabs={[{ key: 'nguyen_lieu', label: 'Nguyên liệu' }, { key: 'thanh_pham', label: 'Thành phẩm' }]} active={activeTab} onChange={setActiveTab} />
```

- [ ] **Step 3: Gate the existing ingredient UI behind the first tab, add the second tab's content**

The entire existing JSX body from the branch-selector `{!lockedBranch && (...)}` block through the closing `allItems.map(...)` list (i.e. everything currently below the title `<div>` and the tabs added in Step 2) must be wrapped in `{activeTab === 'nguyen_lieu' && (<>...</>)}`, and a sibling `{activeTab === 'thanh_pham' && <FinishedGoodsPanel />}` added right after it, immediately before the closing `</div>` of the component's root return.

Concretely: find the closing `</div>` that currently ends the `return (...)` JSX (the very last line before `);` in the file, `src/screens/WarehouseScreen.jsx:387`-ish). The existing content between the `Tabs` you just added and that final `</div>` gets wrapped:
```jsx
{activeTab === 'nguyen_lieu' && (
  <>
    {/* ...all existing JSX from {!lockedBranch && (...)} through the allItems.map(...) block, unchanged... */}
  </>
)}
{activeTab === 'thanh_pham' && <FinishedGoodsPanel />}
```

- [ ] **Step 4: Run the build**

Run: `npx vite build --logLevel warn 2>&1 | tail -20`
Expected: `✓ built in ...ms`, no errors.

- [ ] **Step 5: Commit**

```bash
git add src/screens/WarehouseScreen.jsx
git commit -m "Add Thành phẩm tab to Kho Hàng screen"
```

---

## Task 9: Live verification on production

**Files:** none (verification only, no code changes).

This task has no automated test suite to run — per Global Constraints, this codebase's actual verification convention is `npx vite build` (already done in Tasks 4/5/7/8) plus manual live QA against the deployed app, exactly as done for every prior feature this session.

- [ ] **Step 1: After the owner merges and pushes all commits from Tasks 1-8, and runs `supabase/migrate_finished_goods_stock.sql` in Supabase SQL Editor, verify on https://sumi-app-zyjk.vercel.app:**
  1. Open Kho Hàng — confirm the "Nguyên liệu" tab still shows exactly what it showed before this feature (same items, same quantities) — proves Task 8's tab-wrapping didn't alter the existing branch.
  2. Switch to "Thành phẩm" — confirm it loads with an empty-state message (no data yet), no console errors.
  3. Go to Bếp KDS, use "Ghi Sản Xuất" to log a real catalog product (pick one from the dropdown, not "Khác nhập tay") with a small test quantity (e.g. 1).
  4. Return to Kho Hàng → Thành phẩm — confirm that product now shows qty matching what was just logged, under the branch matching its category (macaron → Kho Xưởng Macaron, teabreak → Kho Xưởng 42, else → Kho Bakery).
  5. Confirm "Xem lịch sử Nhập/Xuất" shows the "Nhập" entry just created.
  6. As owner/admin, open "Điều chỉnh tồn kho", pick the same product, set a different quantity with a note, save — confirm the stock list updates to the new number and the history shows the adjustment entry.
  7. Confirm the "Điều chỉnh tồn kho" button does NOT appear for a non-owner/admin test account (or reason about role gating in code if no second test account is available).
  8. Check browser console for errors throughout (`read_console_messages` if using the Claude Browser tool, or DevTools directly).

- [ ] **Step 2: Report results back to the owner in Vietnamese, confirming the exact numbers observed at each step (per this project's established practice: verify live, report what was actually seen, never assume success).**

---

## Self-Review Notes (completed during plan authoring)

- **Spec coverage:** every section of the 2026-08-21 design doc maps to a task — schema (Task 1), branch resolution (Task 2), nhập hook (Task 4), xuất hook (Task 5), manual adjustment (Task 3 + Task 7), UI tab (Task 6 + Task 8), out-of-scope items explicitly not implemented (no tasks added for expiry/FIFO/low-stock-alerts, matching the design doc's "Out of scope" section).
- **Placeholder scan:** no TBD/TODO; Task 3's Step 2→Step 3 self-correction is deliberate (shows the exact dead code to delete, not a placeholder).
- **Type consistency:** `upsertFinishedGoodsStock({ productId, size, branch }, delta)` signature is used identically in Task 4 and Task 5. `deductFinishedGoodsStockForOrder(order)` takes the full order object (not an id) consistently between Task 5's definition and its `ShippingScreen.jsx` call site. `adjustFinishedGoodsStock` field names (`productId, productName, size, branch, newQty, note, staffName`) match between Task 3's definition and Task 7's call site.
