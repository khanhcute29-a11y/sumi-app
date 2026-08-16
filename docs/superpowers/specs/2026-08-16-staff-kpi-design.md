# Staff KPI (shipper delivery + kitchen/bakery production)

Date: 2026-08-16

## Goal

Let staff and the owner see what a staff member actually accomplished over a
time period (day/week/month/custom range), so the owner can manually decide
pay — the app does not compute pay from KPI, it's a viewing/reference tool
the owner actively uses.

- Shipper: orders delivered + total km driven, per day.
- Kitchen/bakery: orders worked + product quantity from those orders + product
  quantity produced for bakery stock (not tied to a customer order).

## Non-goals

- No automatic salary calculation from KPI.
- No staff-to-staff comparison or ranking UI.
- No kitchen-lead-sees-subordinates visibility yet (explicitly deferred by
  the owner — build later when asked).
- No new metrics for shipper beyond order count + km (owner said "for now",
  more may be requested later as a separate change).
- No distance persisted historically before this feature ships — KPI km is
  computed only from orders that already have both pickup and delivery
  coordinates captured (existing `orders.pickup_lat/lng` and
  `delivery_lat/lng`, populated by the existing Shipping flow). Orders
  missing either coordinate contribute an order to the count but 0 km.

## 1. New table: `production_logs`

Tracks bakery production not tied to a customer order (e.g. "làm thêm 50 bánh
mì cho tủ bakery hôm nay").

```sql
create table if not exists production_logs (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) on delete set null,
  product_name text not null, -- snapshot, same pattern as orders.kitchen_staff_name
  qty numeric not null check (qty > 0),
  staff_id uuid references profiles(id) on delete set null,
  staff_name text not null,
  work_date date not null default current_date,
  created_at timestamptz not null default now()
);
```

RLS: readable by any authenticated+approved user (KPI screen needs to read
across staff for the owner view; visibility restriction to "self only" for
non-owner roles is enforced in the app query layer, not RLS — consistent
with how `ReportsScreen` already gates by JS permission checks rather than
per-row RLS). Insertable by kitchen/bakery/kitchen_lead/kitchen_deputy/
owner/admin roles (mirrors `KdsScreen`'s existing `canAct` role check).

Unlike `order_notes`/`incident_reports`, this table has no legacy data to
stay backward-compatible with — it's new, so no dual-read path needed.

## 2. Production entry point: KDS screen

Add a small "+ Ghi sản xuất" button to `KdsScreen.jsx`, visible only when
`hasAnyRole(profile, ['kitchen','bakery','kitchen_lead','kitchen_deputy','owner','admin'])`
(same check already used for `canAct` in that screen). Opens a lightweight
modal (new component `ProductionLogModal.jsx`, styled like the existing
`IncidentReportModal.jsx`):

- Product: a searchable select over the `products` table (reuse the product
  list already fetched elsewhere, e.g. the same `fetchProducts()` query used
  by `OrdersScreen`).
- Quantity: number input.
- Date: defaults to today, not editable in v1 (YAGNI — owner didn't ask for
  backdating; add later if requested).
- Save button inserts one `production_logs` row via a new
  `addProductionLog({ productId, productName, qty, staffId, staffName })`
  query function in `src/lib/queries.js`.

## 3. KPI computation

### Shipper KPI (per staff, per day, summed over the selected range)

For each day in range: fetch orders where `shipper_staff_name` matches the
staff's `full_name` and `status = 'hoan_thanh'`. For each such order with
both `pickup_lat/lng` and `delivery_lat/lng` present, compute distance via
the existing `haversineKm()` from `src/lib/geo.js`. Sum:
- `orderCount` = number of matching orders in range
- `totalKm` = sum of per-order haversine distances in range

This mirrors (and can reuse the aggregation pattern of) `ReportsScreen.jsx`'s
existing `shipperStaff` per-staff order count — extended with the km sum.

### Kitchen/Bakery KPI (per staff, summed over the selected range)

- `orderCount` = number of orders where `kitchen_staff_name` matches the
  staff's `full_name`, in range (mirrors `ReportsScreen.jsx`'s existing
  `kitchenStaff` count).
- `productsFromOrders` = sum of `order_items.qty` across those matched
  orders.
- `productsProduced` = sum of `production_logs.qty` where `staff_name`
  matches the staff's `full_name` and `work_date` is in range.

Displayed as three separate numbers (not combined), per the owner's choice:
"Số đơn: N — SP từ đơn: X — SP sản xuất: Y".

A staff member who works both bếp nóng and bếp lạnh gets one combined KPI
(no per-station split) — station isn't tracked per staff today (confirmed
during scoping) and the owner explicitly wants them combined, not separated.

## 4. New screen: KPI

New nav item "KPI" (`src/screens/KpiScreen.jsx`), added to the sidebar nav
list alongside existing items. Date-range filter UI matches `ReportsScreen`'s
existing pattern (today/7d/30d/custom).

- **Regular staff** (role is shipper, or any kitchen/bakery role, and not
  owner/admin): sees only their own KPI block — shipper block if their role
  is shipper, kitchen/bakery block if their role is one of the kitchen
  roles. No staff list, no picker — it's just "your numbers."
- **Owner/Admin**: sees every staff member with a role in
  {shipper, kitchen, bakery, kitchen_lead, kitchen_deputy}, each showing
  their respective KPI block, grouped by role. No comparison/ranking UI —
  just a flat list per person, matching the "no comparison" requirement.

Staff-to-KPI matching is by `profiles.full_name` against
`orders.shipper_staff_name` / `orders.kitchen_staff_name` /
`production_logs.staff_name` (exact string match) — accepted risk if two
staff ever share a name (owner confirmed this doesn't happen today).

## Out of scope (explicitly deferred by the owner)

- Kitchen-lead-sees-subordinates visibility.
- Any change to how payroll (`ShiftsScreen.jsx`'s `PayrollSection`) is
  calculated — KPI and payroll remain two separate, unconnected screens.
- Backdating a production log entry to a date other than today.
- Weighting/scoring formulas (e.g. distance-weighted delivery score) —
  raw counts and sums only.
