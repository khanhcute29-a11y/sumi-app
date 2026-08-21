# Kho bánh thành phẩm (nhập/xuất/tồn theo 3 chi nhánh)

Date: 2026-08-21

## Goal

Track finished-goods inventory (bánh đã làm xong, chưa bán) per product
per branch (Bakery / Xưởng 42 / Xưởng Macaron), fully automatic:
- **Nhập kho**: whenever kitchen staff logs a catalog product in Ghi Nhận
  Sản Xuất, that quantity is added to stock.
- **Xuất kho**: whenever an order is marked "Hoàn thành" in Vận Chuyển,
  each order item with a catalog `product_id` is deducted from stock
  (allowed to go negative — many items, e.g. custom bánh kem, are made
  to order with no prior stock).
- **Điều chỉnh tay**: owner/admin only, for correcting drift from a
  physical count (broken/discarded stock, miscounts) — the one manual
  entry point in an otherwise fully-automatic system.

This is entirely additive — new tables, new UI tab, one new call site
in the order-completion flow. No existing table, row, or screen behavior
changes for current users/data. **No existing staff/production data is
touched by this feature** — all rows created by this feature are new,
and nothing it does can alter a profile, order, or existing warehouse
(ingredient) record.

## 1. Data model

### New table: `finished_goods_stock`

Current balance per (product, size, branch) — mirrors the existing
`warehouse_stock` pattern (a maintained running total, not a computed
SUM over the ledger).

```sql
create table if not exists finished_goods_stock (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  size text,
  branch text not null check (branch in ('bakery','xuong41','xuong42')),
  qty numeric(12,0) not null default 0,
  updated_at timestamptz not null default now(),
  unique (product_id, size, branch)
);
```

`size` is nullable and part of the uniqueness key — `null` and `''` are
NOT the same in a unique constraint, so all writers must normalize to
`null` (never empty string) for products with no size.

### New tables: `finished_goods_stock_in_log` / `finished_goods_stock_out_log`

Same shape as `warehouse_stock_in_log`/`warehouse_stock_out_log`, for
the history view.

```sql
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
  created_at timestamptz not null default now()
);
```

`finished_goods_stock_in_log.source` distinguishes `'production_log'`
(automatic) from `'adjustment'` (manual owner/admin correction) — the
adjustment form writes to whichever log matches the sign of the
correction (in-log for a positive adjustment, out-log for negative),
with `source = 'adjustment'` and a `note` column holding the reason.
Add `note text` to both log tables for this.

### RLS

- Read: any approved authenticated user (matches `warehouse_stock`).
- Insert/update on `finished_goods_stock` and both log tables: any
  authenticated approved user (the automatic nhập/xuất paths run as
  whichever staff member is logged in — kitchen staff logging
  production, shipper completing delivery). This matches the existing
  `warehouse_stock` policy, which is deliberately open for the same
  reason (staff need to record stock movements as part of their normal
  flow, not through an admin gate).
- The **manual adjustment** action is gated in the UI (owner/admin
  role check before the button renders and before the mutation fires),
  not at the RLS layer — consistent with how other owner/admin-only
  actions in this app are gated (e.g. staff deactivation).

## 2. Branch resolution

A single exported helper, colocated with the other category-group
constants in `src/lib/cakePricing.js`:

```js
export function branchForCategory(category) {
  if (category === 'macaron') return 'xuong41';
  if (category === 'teabreak') return 'xuong42';
  return 'bakery';
}
```

Both the nhập path (production log) and xuất path (order completion)
call this same function, so a product's branch is always consistent
between the two — no separate "which kho" decision made in two places
that could drift.

## 3. Nhập kho — hook into `addProductionLog`

`src/lib/queries.js`'s `addProductionLog({ productId, productName, qty,
size, price, staffId, staffName, workDate })` gets one addition: after
the existing `production_logs` insert succeeds, if `productId` is
present, look up the product's `category`, resolve `branch`, then
upsert `finished_goods_stock` (`qty = qty + inserted_qty`, via a
Postgres `on conflict (product_id, size, branch) do update` so it's a
single round trip and race-safe under concurrent production logs) and
insert one `finished_goods_stock_in_log` row.

Manual production-log entries (no `productId`, "Khác nhập tay") skip
this — there is no product to attribute stock to. This is a known,
accepted limitation (matches the same limitation already true of xuất,
see below) and is not silently different from what was discussed with
the owner.

## 4. Xuất kho — hook into order completion

`src/screens/ShippingScreen.jsx`'s `handleComplete` calls `applyFields`
which calls `updateOrder(order.id, { status: 'hoan_thanh', ... })`.
After that update succeeds, a new function
`deductFinishedGoodsStockForOrder(orderId)` in `queries.js`:
1. Fetches `order_items` for the order (`product_id`, `size`, `qty`,
   `category`).
2. For each item with a non-null `product_id`, resolves `branch` from
   `category`, then decrements `finished_goods_stock` by `qty` (upsert
   with a negative delta, allowed to go below zero — no floor clamp)
   and inserts one `finished_goods_stock_out_log` row referencing
   `order_id`/`order_code`.
3. Items with no `product_id` (fully hand-typed name, "Khác nhập tay")
   are skipped — no product to deduct against. Confirmed acceptable
   with the owner during design.

This deduction is best-effort: if it throws, the order's `hoan_thanh`
status update has already committed (delivery confirmation must never
be blocked by a stock-ledger hiccup) — the error is caught and
surfaced as a non-blocking toast/console warning, not a failed delivery
confirmation.

## 5. Manual adjustment (owner/admin only)

New `AdjustStockForm` component: picks a product (+ size, if the
product has variants) and branch, enters the **correct current
quantity** (not a delta — matches the mental model of "I just counted
and there are 6 left", not "subtract 2"), computes the delta
server-side against the existing row, writes it to
`finished_goods_stock` and the matching in/out log with
`source='adjustment'` and the entered reason in `note`.

## 6. UI — new "Thành phẩm" tab in `WarehouseScreen.jsx`

`WarehouseScreen.jsx` gains a top-level `Tabs` (Nguyên liệu / Thành
phẩm), defaulting to Nguyên liệu (no change to today's default
experience). The existing ingredient UI is untouched under the first
tab. The new tab:

- Reuses the same "Chọn kho" branch selector pattern (`bakery` /
  `xuong41` labeled "Kho Xưởng Macaron" for this tab / `xuong42`),
  reusing the existing `BRANCH_ROLE_MAP`-based access lock so
  `kho_bakery`/`kho_xuong41`/`kho_xuong42` roles see only their branch,
  same as ingredients today.
- Summary cards: total distinct products in stock, count of
  negative-stock lines (a soft signal something was sold before it was
  logged as produced — not necessarily an error).
- A flat list of `finished_goods_stock` rows for the selected branch,
  each showing product name + size, current qty (styled danger-red if
  negative), branch label (when viewing "Tất cả").
- "Xem lịch sử Nhập/Xuất" toggle reusing the `HistorySection` pattern
  (merges both log tables, sorted by `created_at`, badge Nhập/Xuất).
- "Điều chỉnh tồn kho" button, visible only to `owner`/`admin`, opens
  `AdjustStockForm`.

No changes to `ProductsScreen.jsx`, `OrdersScreen.jsx`, or `KdsScreen.jsx`
beyond the two call sites above (`addProductionLog`,
`deductFinishedGoodsStockForOrder`) — everything else is additive.

## 7. Out of scope (explicitly deferred, not silently dropped)

- No expiry/FIFO tracking for finished goods (bánh doesn't need it the
  way raw ingredients do) — if wanted later, it's a separate follow-up.
- No automatic low-stock alerts for finished goods (ingredient stock
  already has this for expiry; finished-goods "low stock" would need a
  per-product threshold concept that doesn't exist yet).
- No stock effect for order items or production-log entries without a
  `product_id` (freeform "Khác, nhập tay" entries) — confirmed
  acceptable with the owner.
