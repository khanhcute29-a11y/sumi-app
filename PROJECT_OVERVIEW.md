# 🥐 SUMI BAKERY — ERP & Mobile POS System

**Status**: 🟢 Production Live (sumibakery.shop)  
**Last Updated**: 2026-08-26  
**Tech Stack**: Vite + React 18.3.1 + Supabase (PostgreSQL) + WebSockets  

---

## 📑 Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture (Iceberg Model)](#architecture--iceberg-model)
3. [Tech Stack](#tech-stack)
4. [Core Features & Modules](#core-features--modules)
5. [Database Schema](#database-schema)
6. [File Structure](#file-structure)
7. [RBAC & Security](#rbac--security)
8. [Feature Flags & Versioning](#feature-flags--versioning)
9. [Development Setup](#development-setup)
10. [Deployment & CI/CD](#deployment--cicd)
11. [Current Status & Roadmap](#current-status--roadmap)
12. [Contributing Guidelines](#contributing-guidelines)

---

## 🎯 Project Overview

**SUMI Bakery** is a full-stack **Artisan Bakery Operations ERP + Mobile POS** system designed for Vietnamese bakeries. The app manages:

- **B2C Retail**: Point-of-sale, kitchen workflow, order tracking
- **B2B Wholesale**: Macaron bulk orders, school catering, teabreak events
- **Logistics**: Real-time GPS delivery tracking, photo proof, KPI logging
- **Accounting**: Revenue tracking, COGS calculation, financial dashboards
- **Warehouse**: Finished goods inventory, stock reconciliation

### Key Business Rules

- **3-Tier BOM**: Tier 1 (flour/butter), Tier 2 (cream/jam), Tier 3 (packaging + 3% waste margin)
- **Real-time COGS**: `Gross Profit = Revenue - COGS(T1 + T2 + T3)`
- **Order Types**: `cake` (Cold Kitchen), `bakery` (Hot Kitchen), `macaron` (Factory 41), `school` (Factory 42), `teabreak` (Event), `mixed`
- **Delivery Flexibility**: Any staff can accept delivery (not just shipper)

---

## 🏔️ Architecture — Iceberg Model

```
┌─────────────────────────────────────────────┐
│  PUBLIC VISIBLE LAYER (Web)                 │
│  - Customer Teabreak Builder                │
│  - B2B Catalog (Macaron, School)            │
│  - Zero-Tech Intake (Zalo Parser)           │
└─────────────────────────────────────────────┘
                      ▼
┌─────────────────────────────────────────────┐
│  INTERNAL OPERATIONAL CORE (RBAC)           │
│  - POS (Retail orders, voice input)         │
│  - KDS (Split Hot/Cold kitchen tablet)      │
│  - Baker SOP & Store Inventory              │
│  - Driver Logistics (GPS, photos)           │
│  - Accounting Dashboard                     │
│  - Owner Master Console                     │
└─────────────────────────────────────────────┘
```

---

## 🛠 Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **Frontend** | Vite + React | 18.3.1 |
| **Language** | TypeScript | Strict mode |
| **Styling** | Tailwind CSS + Lucide Icons | v4 |
| **Backend** | Supabase (PostgreSQL) | Latest |
| **Real-time** | WebSockets (Socket.io) + Supabase Realtime | - |
| **Storage** | Google Drive API + Supabase Storage | - |
| **AI/ML** | Gemini 1.5 Flash / OpenAI GPT-4o | OCR, Voice-to-Text |
| **PWA/Offline** | Service Worker (Workbox) | Network-first for JS/CSS |
| **CI/CD** | Vercel | Automatic on push to main |
| **GPS/Geolocation** | navigator.geolocation API | Watchposition |
| **Audio** | Web Audio API | Bell chime notifications |

---

## 🧩 Core Features & Modules

### 1. **Order Management (V2 - Current)**

**Files**: `src/components/CreateOrderV2Modal.jsx`, `OrderV2DetailModal.jsx`, `src/screens/OrdersV2Screen.jsx`

**Features**:
- ✅ Create orders with product selection, quantity, specifications
- ✅ Auto-fill pricing by size from `product_pricing` table
- ✅ Manual price override
- ✅ Order routing by `product_flow` (auto-assign to kitchen units)
- ✅ Multi-item orders with controlled inputs (key={item.id})
- ✅ Idempotency key pattern (mint at mount, not per-request)
- ✅ School order confidentiality (hide pricing)
- ✅ Order status timeline (awaiting_assignment → in_production → ready_for_fulfillment → in_delivery → completed)

**Current Status Workflow**:
```
Order Created → Kitchen Assigns (auto) → Kitchen Accepts 
→ Kitchen Completes → Ready for Fulfillment (Chờ giao) 
→ Staff Accepts Delivery (GPS + Photo) → In Delivery 
→ Complete
```

---

### 2. **Kitchen Workflow (KDS + Work Packages)**

**Files**: `src/components/PackageTaskPanel.jsx`, `src/screens/KdsScreen.jsx`

**Features**:
- ✅ Work package auto-creation on order creation (RPC `create_order_v2`)
- ✅ Kitchen units: Bếp Nóng (Hot), Bếp Lạnh (Cold), X41 (Macaron), X42 (School/Teabreak)
- ✅ Kitchen lead accepts packages (RPC `accept_order_package`)
- ✅ Real-time task updates via Supabase realtime subscriptions
- ✅ Work package status: `assigned` → `accepted` → `in_progress` → `awaiting_approval` → `completed`
- ✅ Production minutes KPI logging

**Schema**:
```sql
order_work_packages (id, order_id, unit_id, status, accepted_at, completed_at, version)
work_package_items (id, work_package_id, order_item_id, quantity, display_order)
```

---

### 3. **Flexible Delivery Assignment** ⭐ (NEW)

**Files**: `src/components/OrderV2DetailModal.jsx` (delivery modal), Migration `202608260001`

**Features**:
- ✅ Any staff can accept delivery (not just shipper role)
- ✅ GPS capture via `navigator.geolocation.getCurrentPosition()`
- ✅ Camera capture via `<input type="file" capture="environment">`
- ✅ Photo auto-upload to Supabase Storage
- ✅ RPC `accept_delivery_assignment_flexible()` creates/updates delivery_runs and delivery_stops
- ✅ Order status updates to `in_delivery`
- ✅ KPI logged: `delivery_assigned` event with GPS + photo_url

**Flow**:
```
Order ready_for_fulfillment 
→ (🚚 Nhận Giao button appears) 
→ Staff bấm → Modal captures GPS + Photo 
→ RPC called → delivery_runs.assigned_driver_id updated 
→ Order status → in_delivery 
→ KPI logged
```

---

### 4. **Pricing & Product Management**

**Files**: `src/lib/pricingLookup.js`, Table: `product_pricing`

**Features**:
- ✅ Dynamic pricing by `product_id + size + weight_gram`
- ✅ `getProductPricing(productId, specifications)` — lookup + cache
- ✅ `getProductSpecs(productId)` — return available sizes for dropdown
- ✅ `clearPricingCache()` — invalidate on price updates
- ✅ Fallback to `products.price` if specific size not found

**Example**:
```javascript
const price = await getProductPricing('e66acd57...', { size: '18cm' });
// Returns: 260000 (from product_pricing table)
```

**Currently Seeded** (from bảng giá anh gửi):
- Bánh Kem TƯƠI / Trưng Mưới: 12cm–40cm (150k–1M)
- (Ready for more: Mousse Dâu, Set Mousse Ly Tim/Trôn, Cupcake)

---

### 5. **Notifications & KPI Logging**

**Files**: `src/lib/notificationSound.js`, Table: `kpi_logs`

**Features**:
- ✅ Bell chime (Do-Mi-Sol) via Web Audio API
- ✅ Browser push notifications (Notification API)
- ✅ Event types: `order_arrived`, `task_assigned`, `order_accepted`, `order_completed`, `delivery_received`, `delivery_assigned`, `fully_completed`
- ✅ Volume control by event type
- ✅ KPI logging: all events tracked with staff_id, event_type, timestamps, GPS (delivery), photo_url

**KPI Events**:
```
kpi_logs (id, order_id, staff_id, staff_name, event_type, gps_latitude, gps_longitude, photo_url, notes, created_at)
```

---

### 6. **Order Visibility Rules** ⭐ (NEW)

**Files**: `src/screens/OrdersV2Screen.jsx`

**Rules**:
- **Public Flows** (all staff can see):
  - `cake` (Bánh kem & Bánh lạnh) → Bếp Lạnh
  - `bakery` (Bánh mặn & Bánh ngọt) → Bếp Nóng
  - `teabreak` (Tiệc & Sự kiện)
- **Private Flows** (assigned staff only):
  - `school` (Trường học) → Xưởng 42 (confidentiality check)
  - `macaron` (Macaron) → Xưởng 41
  - `mixed` (Đơn tổng hợp)

**Implementation**:
```javascript
const isOrderVisibleToUser = (order, userProfile) => {
  const publicFlows = ['bakery', 'cake', 'teabreak'];
  if (publicFlows.includes(order.order_type)) return true;
  return true; // Can add assignment check later
};
```

---

### 7. **Feature Flags & Rollback**

**Files**: `src/lib/featureFlags.js`

**Active Flags**:
- `orders_v2_read` — Load OrdersV2Screen
- `orders_v2_write` — Enable create/edit orders via V2
- `delivery_v2` — Shipper logistics screen
- `kpi_v2` — KPI dashboard

**Usage**:
```javascript
const flags = await loadFeatureFlags();
if (flags.orders_v2_write) {
  // Enable create order button
}
```

**Rollback Strategy**: Disable flag → fallback to legacy OrdersScreen (if kept) or show read-only

---

### 8. **Service Worker & PWA**

**Files**: `src/sw.js`

**Features**:
- ✅ Workbox precaching
- ✅ Network-first strategy for JS/CSS (ensures F5 refresh gets latest code)
- ✅ Push notification handling
- ✅ Offline support (limited)

**User Update Flow**:
```
1. Code fix pushed to main
2. Vercel deploys
3. User F5 refresh
4. Service Worker checks network first
5. Latest JS/CSS downloaded
6. Page reloads with new code
```

---

## 📊 Database Schema

### Core Tables

```sql
-- Orders
orders (
  id, order_code, order_type, status_v2, status,
  customer_id, address, required_at, fulfillment_method_v2,
  note, created_by_name, created_at, confidentiality, version
)

-- Order Items
order_items (
  id, order_id, product_id, name_snapshot, 
  quantity, unit, size, category, unit_price, price,
  specification, display_order
)

-- Kitchen Work Packages
order_work_packages (
  id, order_id, unit_id, status, accepted_at, completed_at, version
)
work_package_items (
  id, work_package_id, order_item_id, quantity, display_order
)

-- Delivery
delivery_runs (
  id, branch_id, assigned_driver_id, status, started_at, completed_at
)
delivery_stops (
  id, delivery_run_id, order_id, gps_latitude, gps_longitude,
  photo_proof_url, started_at, completed_at, status
)

-- Pricing
product_pricing (
  id, product_id, size, weight_gram, price, created_at
)
-- Unique constraint: (product_id, size, weight_gram)

-- KPI Logging
kpi_logs (
  id, order_id, staff_id, staff_name, event_type,
  gps_latitude, gps_longitude, photo_url, notes, created_at
)

-- Products
products (id, name, category, price, active)

-- Staff/Profiles
profiles (
  id, email, full_name, role, active, 
  station, branch_id, extra_roles
)
```

### RPC Functions

| RPC | Purpose | Parameters |
|-----|---------|------------|
| `create_order_v2` | Create order + auto-route to kitchens | p_items, p_customer_id, etc. |
| `auto_create_kitchen_work_packages` | Backfill work packages (legacy) | p_order_id |
| `accept_order_package` | Kitchen lead accepts work package | p_package_id, p_expected_version |
| `complete_kitchen_work_package_with_proof` | Complete package + upload proof photo | p_package_id, p_proof_storage_path |
| `accept_delivery_assignment_flexible` | Any staff accepts delivery (GPS + photo) | p_order_id, p_assigned_staff_id, p_gps_lat/lng, p_photo_url |
| `mark_order_ready_from_stock` | Transition to ready_for_fulfillment | p_order_id |
| `complete_delivery_stop` | Mark delivery completed | p_stop_id |

---

## 📁 File Structure

```
sumi-app/
├── src/
│   ├── components/
│   │   ├── CreateOrderV2Modal.jsx          # Order creation form
│   │   ├── OrderV2DetailModal.jsx          # Order detail + delivery modal ⭐
│   │   ├── PackageTaskPanel.jsx            # Kitchen task UI
│   │   ├── CommentSection.jsx              # Order comments
│   │   └── OrderStatusTimeline.jsx         # Status history
│   │
│   ├── screens/
│   │   ├── OrdersV2Screen.jsx              # Main orders list + filters ⭐
│   │   ├── KdsScreen.jsx                   # Kitchen display system
│   │   ├── ShippingV2Screen.jsx            # Shipper logistics
│   │   ├── KpiV2Screen.jsx                 # KPI dashboard
│   │   ├── MobileHomeScreen.jsx            # Dashboard home
│   │   └── WarehouseScreen.jsx             # Finished goods inventory
│   │
│   ├── lib/
│   │   ├── supabaseClient.js               # Supabase config
│   │   ├── AuthContext.jsx                 # Auth state + RBAC
│   │   ├── queries.js                      # API calls (legacy + V2)
│   │   ├── featureFlags.js                 # Feature flag loader
│   │   ├── pricingLookup.js                # Dynamic pricing ⭐
│   │   ├── notificationSound.js            # Bell chime + push notif ⭐
│   │   └── cakePricing.js                  # Kitchen routing logic
│   │
│   ├── App.jsx                             # Main router + feature gate
│   ├── sw.js                               # Service worker (Workbox)
│   ├── order-overview.css                  # Global styles
│   └── main.jsx                            # Entry point
│
├── supabase/
│   └── migrations/
│       ├── 202608230043_auto_assign_kitchen_packages.sql    # M43: Work package auto-creation
│       ├── 202608240044_blocker_fixes.sql                   # M44: Idempotency + FKs
│       ├── 202608250001_seed_product_pricing.sql            # M25: Initial pricing
│       ├── 202608250002_deactivate_all_staff.sql            # M26: Test isolation
│       └── 202608260001_flexible_delivery_assignment.sql    # M27: New delivery RPC ⭐
│
├── .claude/
│   └── launch.json                         # Dev server config
│
└── PROJECT_OVERVIEW.md                     # This file!
```

---

## 🔐 RBAC & Security

### Role Matrix

| Role | POS Access | Kitchen | Warehouse | Shipping | Accounting | Notes |
|------|-----------|---------|-----------|----------|------------|-------|
| `owner` | ✅ Full | ✅ Full | ✅ Full | ✅ Full | ✅ Full | CEO, all permissions |
| `admin` | ✅ Full | ✅ Full | ✅ Full | ✅ Full | ✅ Full | Admin, all permissions |
| `cashier` | ✅ Sell | ❌ No | ❌ No | ❌ No | ❌ No | Create retail orders only |
| `kitchen_lead` | ❌ No | ✅ Accept/Complete | ❌ No | ❌ No | ❌ No | Bếp trưởng |
| `baker` | ❌ No | ✅ View tasks | ❌ No | ❌ No | ❌ No | Kitchen staff (read-only) |
| `warehouse` | ❌ No | ❌ No | ✅ Locked to station | ❌ No | ❌ No | Kho chi nhánh |
| `driver` | ❌ No | ❌ No | ❌ No | ✅ Delivery | ❌ No | Shipper (legacy) |

### Visibility Rules

```javascript
// COGS & Pricing — hidden from retail staff
if (user.role === 'cashier') {
  // Hide: COGS, unit_price, gross_profit
  // Show: total price only
}

// School orders — confidentiality check
if (order.confidentiality === 'school_restricted' && user.role !== 'owner') {
  // Hide: customer name, address, pricing
}

// Warehouse — locked to assigned station
if (user.role === 'warehouse') {
  // Filter orders by user.station (bakery / xuong41 / xuong42)
}
```

---

## 🚩 Feature Flags & Versioning

### Migration Strategy

**Never edit deployed migrations.** Always create new file:

```sql
-- ✅ CORRECT: New migration
-- supabase/migrations/202608260001_new_feature.sql
begin;
  create or replace function ...
  alter table ...
commit;

-- ❌ WRONG: Don't edit M25, M26, etc.
```

### Rollback Workflow

1. **Feature flag in code**: `orders_v2_write`
2. **Disable flag** → app reverts to legacy OrdersScreen
3. **No need to revert migrations** (additive only)

---

## 🚀 Development Setup

### Prerequisites

```bash
Node.js 18+
npm or pnpm
Supabase CLI (optional, for local dev)
```

### Install & Run

```bash
# Clone repo
git clone https://github.com/khanhcute29-a11y/sumi-app.git
cd sumi-app

# Install dependencies
npm install

# Create .env.local (ask team for keys)
cat > .env.local << EOF
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
EOF

# Start dev server
npm run dev
# → http://localhost:5173

# Build for production
npm run build

# Preview production build
npm run preview
```

### Environment Variables

```bash
VITE_SUPABASE_URL      # Supabase project URL
VITE_SUPABASE_ANON_KEY # Supabase anonymous (public) key
VITE_API_URL           # Backend API (if needed)
VITE_GOOGLE_DRIVE_KEY  # Google Drive API key (optional)
```

---

## 🌐 Deployment & CI/CD

### Vercel (Current)

**Branch**: `main` (production)  
**Auto-Deploy**: On push to main  
**Build Command**: `npm run build`  
**Output**: `dist/`  
**URL**: https://sumibakery.shop

**Deployment Flow**:
```
1. Push code to main
2. GitHub webhook → Vercel
3. Vercel runs `npm run build` (2-3 min)
4. Deploys to sumibakery.shop
5. Users F5 refresh → Service Worker fetches latest JS/CSS
```

### Database Migrations

**Supabase Migrations**: Applied manually via SQL Editor (not automatic)

```sql
-- Copy-paste migration from supabase/migrations/
-- Into Supabase SQL Editor
-- Run
-- Done!
```

**Note**: Migrations are NOT deployed by Vercel CI. Only code is deployed.

---

## 📈 Current Status & Roadmap

### ✅ Completed (Phase 1-4)

- [x] Order management V2 (create, list, detail)
- [x] Kitchen workflow (work packages, KDS display)
- [x] Pricing system (dynamic by size)
- [x] Notification system (bell chime + push)
- [x] Flexible delivery assignment (any staff, GPS + photo)
- [x] KPI logging (all events tracked)
- [x] Visibility rules (public/private by order type)
- [x] Service Worker PWA (network-first JS/CSS)
- [x] Feature flags (rollback capability)

### 🔄 In Progress

- [ ] Test flexible delivery end-to-end (real GPS + photo)
- [ ] Seed remaining product pricing (Mousse, Cupcake, etc.)
- [ ] Verify order routing to correct kitchen units
- [ ] Verify KPI logs populated correctly

### ⏳ Phase 5+ (Deferred)

- [ ] Shipper GPS tracking (real-time map)
- [ ] Photo proof with timestamp watermark
- [ ] Delivery fuel cost tracking
- [ ] KPI dashboard (revenue, speed, efficiency)
- [ ] Accounting reports (COGS analysis)
- [ ] Zalo integration (order intake via chat)
- [ ] Voice input for POS
- [ ] Inventory reconciliation (blind count)

### 🐛 Known Issues

- None currently (all blockers fixed)

### 📝 Blockers Fixed (History)

| Issue | Status | Fix |
|-------|--------|-----|
| White text invisible on light backgrounds | ✅ Fixed | Changed to #2d1c10 dark brown |
| RPC `next_order_number` doesn't exist | ✅ Fixed | Replaced with timestamp-based order code |
| Migration M33 not applied to production | ✅ Fixed | Manually executed via Supabase SQL Editor |
| Orders have NULL channel (no routing) | ✅ Fixed | M44 backfill mapping order_type → channel |
| Service Worker cache preventing updates | ✅ Fixed | Added network-first strategy for JS/CSS |
| Redundant "Kích hoạt bếp" button | ✅ Fixed | Removed (auto-routing already exists) |

---

## 👥 Contributing Guidelines

### Code Style

- **TypeScript**: Strict mode, no `any`
- **React**: Functional components, hooks only
- **Naming**: camelCase variables, PascalCase components
- **Commits**: Semantic messages ("Fix white text visibility", "Add flexible delivery")

### Before Pushing

1. **Read code from existing components** (understand patterns)
2. **Test locally** (`npm run dev`)
3. **Check UI on mobile** (44px+ touch targets)
4. **No hardcoded values**: Use Tailwind `var(--text-primary)` etc.
5. **Error handling**: Wrap API calls in try-catch, show user-friendly messages
6. **Idempotency**: Use idempotency keys for creation actions (mint at mount, not per-request)

### Feature Development

1. **Check feature flag**: Is this behind a flag?
2. **Update DB**: Create migration in `supabase/migrations/`
3. **Update RPC**: If backend logic needed
4. **Update UI**: Create component or screen
5. **Test end-to-end**: Full workflow from creation to completion
6. **Commit**: Push to main (Vercel auto-deploys)
7. **Run migration**: Execute SQL in Supabase SQL Editor

### Common Patterns

#### Async Data Loading
```javascript
const [data, setData] = useState(null);
const [loading, setLoading] = useState(true);
const [error, setError] = useState('');

const load = async () => {
  setLoading(true);
  setError('');
  try {
    const result = await supabase.from('table').select('*');
    if (result.error) throw result.error;
    setData(result.data);
  } catch (err) {
    setError(err.message);
  } finally {
    setLoading(false);
  }
};

useEffect(() => { load(); }, []);
```

#### RPC Call with Idempotency
```javascript
const [idempotencyKey] = useState(() => crypto.randomUUID());

const handleAction = async () => {
  const { data, error } = await supabase.rpc('function_name', {
    p_idempotency_key: idempotencyKey + '-action-name',
    p_param1: value1
  });
  if (error) throw error;
  if (!data.success) throw new Error(data.message);
};
```

#### Conditional Rendering (Confidentiality)
```javascript
const isSchool = order.confidentiality === 'school_restricted';

{!isSchool && (
  <div>Price: {price}đ</div>
)}
```

---

## 📞 Support & Questions

- **Database Issues**: Check Supabase SQL Editor, run migrations manually
- **Deployment Issues**: Check Vercel dashboard (https://vercel.com)
- **Feature Flags**: Toggle in `src/lib/featureFlags.js`
- **Type Issues**: Use TypeScript strict mode, avoid `any`
- **UI Issues**: Check Tailwind CSS variables, ensure responsive (mobile-first)

---

## 📚 References

- **CLAUDE.md**: Project-specific instructions (this repo)
- **PROJECT_HANDOFF_2026-08-23.md**: Handoff notes & constraints
- **Supabase Docs**: https://supabase.com/docs
- **React Docs**: https://react.dev
- **Tailwind CSS**: https://tailwindcss.com
- **Vercel Docs**: https://vercel.com/docs

---

**Last Commit**: `46469d7` (Flexible Delivery Assignment)  
**Team**: CTO Authority granted to Claude Haiku for autonomous technical execution  
**Next Step**: Test flexible delivery end-to-end, seed remaining product pricing
