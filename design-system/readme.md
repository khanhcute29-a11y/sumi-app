# Sumi Bakery Design System

**Sumi Bakery — Enterprise Operations & Management Web App.** A responsive internal ops tool for a bakery business covering four operational modules: front-of-house sales/CRM (Omnichannel Inbox, order creation), kitchen production (KDS) and raw-material warehouse, delivery/shipping, and a master cashbook/accounting system. Desktop uses a fixed left sidebar; mobile/tablet swaps to a 4-icon bottom nav + "Thêm" (More) sheet — this is a non-negotiable responsive requirement from the brief.

This is a from-scratch design system: no existing product codebase or Figma file was available, so tokens, components, and the UI kit were built directly from the written brand brief plus two reference images the user supplied (an order-flow mockup and a KiotViet-style reference screen used only as a structural/interaction reference, not for visual style).

## Sources
- Brand & module brief (pasted text, in this conversation) — the primary source of truth for colors, module structure, and terminology.
- `uploads/1785386986036_..._3dbbe106dcb3b9b699ddb488295a8537.jpg` (copied to `assets/mockup-order-flow.jpg`) — 3-screen order flow mockup showing the "Sumi Bakery" wordmark and a swatch reference (Creamy Milk White / Toasted Brown / Buttery Yellow).
- `uploads/IMG_6982.PNG` (copied to `assets/mockup-kiotviet-reference.png`) — a KiotViet admin screen used only as a reference for the bottom-nav/menu-sheet *pattern* the brief asks to emulate; none of its visuals were copied (it's a different, unrelated product).
- `uploads/Logo cty Sumi_FA-01 bakery.pdf` — the provided logo file. **Could not be rendered**: it contains only outlined vector paths (no fonts, no raster images), and PDF rasterization in this environment repeatedly timed out on it. No logo mark is included in this design system as a result — see Caveats.
- GitHub repo `Mon292007/Monn-IT-Sumi` — attached as a design-system source but contains only a placeholder `README.md` (14 bytes, no code). Nothing was imported from it. Explore it yourself at https://github.com/Mon292007/Monn-IT-Sumi if it gets populated later.

## Index
- `styles.css` — root stylesheet, imports all tokens.
- `tokens/` — `colors.css`, `typography.css`, `spacing.css`, `effects.css` (radius/shadow/motion).
- `assets/` — reference mockups (see Sources). No logo file.
- `guidelines/` — foundation specimen cards (Colors ×4, Type ×3, Spacing ×2, Brand ×2).
- `components/forms/` — Button, Input, Select, Checkbox, Switch.
- `components/feedback/` — Badge, TrustScoreBadge, FifoTag, Toast.
- `components/navigation/` — Sidebar, BottomNav, Tabs.
- `components/data/` — Card, KanbanCard, StatCard.
- `ui_kits/ops-app/` — interactive recreation of the ops web app (Đơn Hàng / Bếp KDS / Kho Hàng / Sổ Quỹ), responsive down to the mobile bottom nav.
- `SKILL.md` — portable skill file for use in Claude Code.

## Components
Button, Input, Select, Checkbox, Switch (forms) · Badge, TrustScoreBadge, FifoTag, Toast (feedback) · Sidebar, BottomNav, Tabs (navigation) · Card, KanbanCard, StatCard (data).

### Intentional additions
No source defined a component inventory, so this is an original standard set sized to the brief's needs — including two bakery-specific primitives the brief explicitly calls for: `TrustScoreBadge` (Customer Trust Score / COD lock) and `FifoTag` (warehouse expiry-date color coding).

## Content fundamentals
- **Language:** All UI copy is in Vietnamese, matching the brief and reference mockups verbatim (e.g. "TẠO ĐƠN MỚI", "Xác nhận Thanh toán", "Chốt ca").
- **Tone:** Operational and directive, not conversational — short imperative labels and status words ("Đang làm", "Chờ cọc", "Quá hạn"), not friendly marketing copy. This is staff-facing software, not a customer storefront.
- **Casing:** Buttons and key CTAs are Vietnamese sentence case, occasionally ALL CAPS for the single most important action per screen (TẠO ĐƠN MỚI). Section headers use title case.
- **Numbers & currency:** Vietnamese dot-separated currency, đồng suffix — `580.000đ`, `12.480.000đ`.
- **Emoji:** Used sparingly as functional icons, not decoration — 🎙️ (voice input), 📷 (photo capture), ⛔ (Emergency Stop), 👑 (VIP Override), ⭐ (VIP badge), 🔥📦📋💰 (nav icons per brief). Never used in body copy or for flourish.
- **Abbreviations kept as given:** "SLA", "KDS", "P&L", "COD", "VIP", "Z-Report" appear in Latin/English even inside Vietnamese sentences — this is normal in Vietnamese back-office software and the brief uses it consistently.

## Visual foundations
- **Palette:** Warm bakery palette, exactly as briefed — Creamy Milk White background (`#FAF6F0`), pure white surfaces (`#FFFFFF`), Buttery Yellow/caramel primary (`#C88A4B`), Toasted Brown text (`#4A3225`). Semantic red/green (`#D9534F` / `#5CB85C`) plus an added amber warning and muted blue info tone to round out status states. Max two background tones app-wide (cream app background, white cards) — no gradients.
- **Type:** Nunito (700/800) for display/module titles — a rounded, warm display face that suits a bakery brand without tipping into decorative script. Inter (400–700) for all UI/body/data text — small-size legible sans for dense tables and dashboards. A system monospace stack for order IDs/codes.
- **Backgrounds:** Flat color only. No photography, illustration, gradients, or texture — an operations tool, not a marketing surface. The only imagery is user-uploaded product photos (order thumbnails) inside cards.
- **Motion:** Minimal — short (120–180ms) ease-standard transitions on hover/press only (background fade, toggle slide, button scale-down on press). No entrance animations, bounces, or parallax; this is a dense data tool where motion should never distract from throughput.
- **Hover/press states:** Hover darkens the fill one step (primary → primary-600) or tints the background with `--surface-sunken`. Press scales interactive buttons to 0.97. No lightening-on-hover.
- **Borders & shadows:** Cards use a soft, warm-tinted (brown, not gray) drop shadow (`--shadow-sm`/`md`/`lg`) instead of visible borders — borders are reserved for inputs, secondary buttons, and column dividers (`--border-subtle`/`default`/`strong`).
- **Corner radii:** 8px (inputs, small controls) / 12px (buttons, chips-as-rect) / 16px (cards, modals) / pill (badges, toggle track). Never sharp corners on interactive surfaces.
- **Transparency/blur:** Only for the modal scrim (`rgba(36,24,17,.48)`, no blur) — otherwise fully opaque; a data-dense ops tool avoids translucent chrome that would hurt legibility.
- **Cards:** White fill, 16px radius, soft shadow, no border — content (customer name, item, badges) left-aligned with generous internal padding.
- **Layout rule:** Desktop = fixed 232px left `Sidebar`; below ~860px, sidebar hides and a fixed-bottom `BottomNav` (4 core icons + "Thêm" overflow sheet) takes over — implemented with a CSS breakpoint in `ui_kits/ops-app/index.html`.

## Iconography
- No icon font or SVG icon set was supplied with the brief or the reference images. The KiotViet reference screen uses custom two-tone flat icons, but that's a different, unrelated product — not something to copy into this brand.
- **Approach taken:** Unicode emoji as the icon system, matching the brief's own notation (📦🔥📋💰🎙️📷⛔👑⭐). This keeps the kit dependency-free and matches the tone the brief itself established by writing emoji directly into the module spec.
- If the team has a real icon set (Lucide, a custom SVG sprite, or brand-specific glyphs), swap these emoji 1:1 — every icon usage in components is an isolated `icon` prop, not baked into markup.

## Caveats & next steps
- **No usable logo file.** `Logo cty Sumi_FA-01 bakery.pdf` contains only vector paths — no embedded fonts or raster images — and PDF-to-image rendering timed out repeatedly in this environment (tried at three resolutions, with and without font/cmap resources loaded). Every "logo" placement in this system is the plain wordmark "Sumi Bakery" in Nunito. **Please export the logo as a PNG or SVG and re-upload it** so it can be dropped in.
- **Fonts are Google Fonts, not brand-supplied.** Nunito + Inter were chosen as a close, Vietnamese-diacritic-safe match to the brief's warm/rounded description — flag if the brand has specific licensed fonts.
- The Ops App UI kit fully builds Đơn Hàng, Bếp KDS, Kho Hàng, and Sổ Quỹ (the 4 bottom-nav modules). Vận Chuyển (shipper offline-first flow), Báo Cáo, Khách Hàng, and Thiết lập are stubbed placeholders behind "Thêm" — say the word and they can be built out next.
- The GitHub repo attached (`Mon292007/Monn-IT-Sumi`) is currently empty of real code — re-attach once it has content and this system can be reconciled against it.

**Please iterate with me** — tell me what's off (a color, a copy line, a missing screen) and I'll fix it directly; this first pass is a strong starting point, not a final answer.
