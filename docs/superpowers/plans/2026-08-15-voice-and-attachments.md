# Voice Input Upgrade + Generic File Attachments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the voice-input feature (streaming transcript + real error messages) and roll it out to free-text fields across the app; let Comments and Incident Reports accept any file type (PDF/Word/Excel/etc.), not just images.

**Architecture:** Extract the mic-button pattern already used twice in `WarehouseScreen.jsx` into a shared `useVoiceInput` hook upgrade + a new `VoiceMicButton` component, then drop that component next to identified free-text inputs across 6 screens. Separately, add a generic `uploadFile()` alongside the existing `uploadPhoto()`, and extend the two multi-attachment surfaces (Comments, Incident Reports) to accept non-image files.

**Tech Stack:** React 18 (plain JSX, no CSS framework — inline style objects using CSS custom properties), Supabase (Postgres + Storage), Vite. **No test runner is configured in this project** (no vitest/jest in package.json) — verification for every task is manual: run `npm run dev`, open the relevant screen in the browser, and exercise the feature.

## Global Constraints

- No test framework exists — every "verify" step is a manual browser check via the Vite dev server, not an automated test run.
- Follow existing code style exactly: inline `style={{ ... }}` objects using `var(--...)` design tokens, no CSS files, no component libraries beyond what's in `src/components/forms/`.
- File size limit for the new generic attachment upload: **25MB**, enforced client-side in `uploadFile()` with a Vietnamese error message.
- Keep `uploadPhoto()` untouched — it's still used by every image-only call site (Products, Warehouse, Shipping, Kds, PhotoField, CameraPhotoField).
- `VoiceMicButton` must render nothing (not even a disabled button) when `window.SpeechRecognition`/`webkitSpeechRecognition` is unavailable, matching the current `voice.supported &&` gating in WarehouseScreen.
- Never touch `CustomersScreen.jsx` — confirmed during planning it has no free-text create/edit fields (only a search box); customer name/address/notes are captured through `OrdersScreen.jsx` forms instead.

---

### Task 1: Upgrade `useVoiceInput` hook (interim results + real error messages)

**Files:**
- Modify: `src/lib/useVoiceInput.js` (full file, currently 32 lines)

**Interfaces:**
- Produces: `useVoiceInput({ lang })` returns `{ supported, listening, error, start, stop }`.
  - `start(onResult, onInterim?)` — `onResult(finalText)` fires once when recognition ends with a final transcript; `onInterim(partialText)` (optional) fires repeatedly while the user is still speaking.
  - `error` — `string | null`, a Vietnamese message set when recognition fails, cleared on the next `start()`.
- Consumes: nothing (leaf module, only depends on the browser `SpeechRecognition` API).

- [ ] **Step 1: Rewrite the hook**

Replace the entire contents of `src/lib/useVoiceInput.js` with:

```js
import { useRef, useState } from 'react';

const ERROR_MESSAGES = {
  'not-allowed': 'Chưa cấp quyền micro',
  'service-not-allowed': 'Chưa cấp quyền micro',
  'no-speech': 'Không nghe thấy, thử lại',
};

export function useVoiceInput({ lang = 'vi-VN' } = {}) {
  const recognitionRef = useRef(null);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState(null);
  const [supported] = useState(() => typeof window !== 'undefined' && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition));

  const start = (onResult, onInterim) => {
    if (!supported) return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = lang;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    setError(null);
    recognition.onresult = (event) => {
      const result = event.results[event.results.length - 1];
      const transcript = result[0].transcript;
      if (result.isFinal) {
        onResult(transcript);
      } else {
        onInterim?.(transcript);
      }
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = (event) => {
      setError(ERROR_MESSAGES[event.error] || 'Không nhận diện được giọng nói');
      setListening(false);
    };
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  };

  const stop = () => {
    recognitionRef.current?.stop();
    setListening(false);
  };

  return { supported, listening, error, start, stop };
}
```

- [ ] **Step 2: Manual verify — existing call sites still compile and run**

Run: `npm run dev`
Open the app in the browser, go to Warehouse screen ("Kho" nav item) → "Nhập kho" form. Click the "Nói" button next to "Tên nguyên liệu", say a word, confirm it fills the field and the button returns to "Nói" state (not stuck on "Đang nghe...").
Expected: no console errors, behavior unchanged from before this task (WarehouseScreen still calls `voice.start((t) => setName(t))` with only one argument — `onInterim` is optional so this remains valid).

- [ ] **Step 3: Commit**

```bash
git add src/lib/useVoiceInput.js
git commit -m "Stream interim voice transcript and surface real recognition errors"
```

---

### Task 2: Create shared `VoiceMicButton` component

**Files:**
- Create: `src/components/VoiceMicButton.jsx`

**Interfaces:**
- Consumes: `useVoiceInput` from `src/lib/useVoiceInput.js` (Task 1), `Button` from `src/components/forms/Button.jsx`, `IconMic` from `src/components/icons/FrogIcons.jsx`.
- Produces: `<VoiceMicButton onTranscript={(text) => void} onInterim={(text) => void}? size="sm"? />` — a self-contained mic button + inline error text. Renders `null` if voice recognition isn't supported in the browser.

- [ ] **Step 1: Write the component**

```jsx
import React from 'react';
import { Button } from './forms/Button';
import { useVoiceInput } from '../lib/useVoiceInput';
import { IconMic } from './icons/FrogIcons';

export function VoiceMicButton({ onTranscript, onInterim, size = 'sm' }) {
  const voice = useVoiceInput();
  if (!voice.supported) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <Button
        variant={voice.listening ? 'danger' : 'secondary'}
        size={size}
        icon={<IconMic size={16} />}
        onClick={() => voice.start(onTranscript, onInterim)}
      >
        {voice.listening ? 'Đang nghe...' : 'Nói'}
      </Button>
      {voice.error && (
        <div style={{ font: 'var(--text-caption)', color: 'var(--status-danger)' }}>{voice.error}</div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Manual verify — renders standalone**

There's no isolated call site yet (that's Tasks 3-9), so verify by temporarily importing it into any screen, e.g. add `<VoiceMicButton onTranscript={(t) => console.log(t)} />` near the top of `DashboardScreen.jsx`, run `npm run dev`, confirm the mic button renders and logs to console when you speak. Remove the temporary import/JSX afterward — this step is throwaway verification only, do not commit it.

- [ ] **Step 3: Commit**

```bash
git add src/components/VoiceMicButton.jsx
git commit -m "Add reusable VoiceMicButton component"
```

---

### Task 3: Migrate `WarehouseScreen.jsx` to `VoiceMicButton`

**Files:**
- Modify: `src/screens/WarehouseScreen.jsx`

**Interfaces:**
- Consumes: `VoiceMicButton` (Task 2).

- [ ] **Step 1: Replace `AddStockForm`'s inline mic button (around line 36, 40-42, 85-89)**

Old:
```jsx
        {voice.supported && (
          <Button variant={voice.listening ? 'danger' : 'secondary'} size="sm" icon={<IconMic size={16} />} onClick={handleVoice}>
            {voice.listening ? 'Đang nghe...' : 'Nói'}
          </Button>
        )}
```
New:
```jsx
        <VoiceMicButton onTranscript={setName} />
```
Then remove the now-unused `voice` and `handleVoice` declarations (the `const voice = useVoiceInput();` line and the `handleVoice` function), since `VoiceMicButton` owns its own hook instance internally.

- [ ] **Step 2: Replace `StockOutForm`'s inline mic button (around line 122, 158-162)**

Old:
```jsx
            {voice.supported && (
              <Button variant={voice.listening ? 'danger' : 'secondary'} size="sm" icon={<IconMic size={16} />} onClick={() => voice.start((t) => setSearch(t))}>
                {voice.listening ? 'Đang nghe...' : 'Nói'}
              </Button>
            )}
```
New:
```jsx
            <VoiceMicButton onTranscript={setSearch} />
```
Remove the now-unused `const voice = useVoiceInput();` line in this component too.

- [ ] **Step 3: Update imports**

Add `import { VoiceMicButton } from '../components/VoiceMicButton';` near the other component imports at the top of the file. Remove `useVoiceInput` and `IconMic` from the existing imports if they are no longer referenced anywhere else in this file after Steps 1-2 (check with `grep -n "useVoiceInput\|IconMic" src/screens/WarehouseScreen.jsx` — if any other usage remains, keep the import).

- [ ] **Step 4: Manual verify**

Run: `npm run dev`
Go to Kho → Nhập kho, click "Nói" next to "Tên nguyên liệu", speak, confirm the field fills.
Go to Kho → Xuất kho, click "Nói" next to "Tìm nguyên liệu", speak, confirm the search field fills and filters the list.
Expected: identical behavior to before, now backed by the shared component; no console errors.

- [ ] **Step 5: Commit**

```bash
git add src/screens/WarehouseScreen.jsx
git commit -m "Migrate WarehouseScreen voice buttons to shared VoiceMicButton"
```

---

### Task 4: Add voice input to `OrdersScreen.jsx` free-text fields

**Files:**
- Modify: `src/screens/OrdersScreen.jsx`

**Interfaces:**
- Consumes: `VoiceMicButton` (Task 2).

- [ ] **Step 1: Add the import**

In the import block (top of file, alongside line 14 `import { PhotoField } from '../components/PhotoField';`), add:
```jsx
import { VoiceMicButton } from '../components/VoiceMicButton';
```

- [ ] **Step 2: Wrap each standalone field in a flex row with its mic button**

For each of the following fields, the current JSX is a bare `<Input .../>` on its own line, not inside a flex wrapper. Apply this transform to each: wrap the `Input` and a new `<VoiceMicButton onTranscript={<setter>} />` in a `<div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>`, and give the `Input` `style={{ flex: '1 1 auto', minWidth: 0 }}` (merge with any existing `style` prop on that `Input` if present — none of the fields below currently have one).

| Line | Field (current bare `<Input .../>`) | Setter to pass to `VoiceMicButton` |
|---|---|---|
| 273 | Teabreak — Tên công ty/khách | `(t) => setC('name', t)` |
| 278 | Teabreak — Địa chỉ | `(t) => setC('address', t)` |
| 302 | Teabreak — Ghi chú | `setNote` |
| 394 | Teabreak (edit) — Tên công ty/khách | `setCustName` |
| 395 | Teabreak (edit) — Địa chỉ | `setAddress` |
| 418 | Teabreak (edit) — Ghi chú | `setNote` |
| 558 | Macaron — Tên khách hàng/công ty | `setCustName` |
| 563 | Macaron — Địa chỉ giao | `setAddress` |
| 594 | Macaron — Ghi chú | `setNote` |
| 690 | Macaron (edit) — Tên khách hàng/công ty | `setCustName` |
| 695 | Macaron (edit) — Địa chỉ giao | `setAddress` |
| 724 | Macaron (edit) — Ghi chú | `setNote` |
| 1027 | Cake order — Tên khách | `setCustName` |
| 1031 | Cake order — Địa chỉ giao | `setAddress` |
| 1059 | Cake order — Ghi chú đơn hàng | `setNote` |
| 1186 | Cake order (edit) — Tên khách | `setCustName` |
| 1190 | Cake order (edit) — Địa chỉ giao | `setAddress` |
| 1216 | Cake order (edit) — Ghi chú đơn hàng | `setNote` |

Example concrete transform for the line-273 field (apply the same shape to every row in the table above, substituting that row's `Input` JSX and setter — read each `Input`'s exact current props before editing since label/placeholder differ per field):

Old:
```jsx
        <Input label="Tên công ty/khách" placeholder="..." value={customer.name} onChange={(e) => setC('name', e.target.value)} />
```
New:
```jsx
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <Input label="Tên công ty/khách" placeholder="..." value={customer.name} onChange={(e) => setC('name', e.target.value)} style={{ flex: '1 1 auto', minWidth: 0 }} />
          <VoiceMicButton onTranscript={(t) => setC('name', t)} />
        </div>
```

The address fields at lines 563, 695, 1031, 1190 are already inside a conditional block (`{deliveryMethod === 'giao_tan_noi' && (...)}`) — wrap only the `Input` itself in the flex row as above; leave the surrounding conditional untouched.

- [ ] **Step 3: Add voice input to the manual product-name entry row (`ProductRow`, line 826)**

This field already sits in a flex row next to a "Tìm trong menu" button. Old (around line 826-827):
```jsx
          <Input placeholder="Tên sản phẩm (nhập tay)" value={item.name} onChange={(e) => set('name', e.target.value)} style={{ flex: '1 1 160px', minWidth: 0 }} />
          <Button ...>Tìm trong menu</Button>
```
New: insert a `VoiceMicButton` between them:
```jsx
          <Input placeholder="Tên sản phẩm (nhập tay)" value={item.name} onChange={(e) => set('name', e.target.value)} style={{ flex: '1 1 160px', minWidth: 0 }} />
          <VoiceMicButton onTranscript={(t) => set('name', t)} />
          <Button ...>Tìm trong menu</Button>
```
(Keep the existing `Button` props exactly as they are — only insert the new line.)

- [ ] **Step 4: Manual verify**

Run: `npm run dev`. Go to Orders → tạo đơn mới, cycle through each order type tab (Teabreak, Macaron, Cake), click each new "Nói" button next to tên/địa chỉ/ghi chú, confirm it fills the right field. Repeat for the edit-order modals (open an existing order, click Sửa). Confirm the manual product-name row in the Cake tab also has a working mic button next to "Tìm trong menu".
Expected: all fields fill correctly, no layout breakage (mic buttons don't overflow on mobile width — resize browser to ~375px and check).

- [ ] **Step 5: Commit**

```bash
git add src/screens/OrdersScreen.jsx
git commit -m "Add voice input to OrdersScreen name/address/note fields"
```

---

### Task 5: Add voice input to `ProductsScreen.jsx`

**Files:**
- Modify: `src/screens/ProductsScreen.jsx`

**Interfaces:**
- Consumes: `VoiceMicButton` (Task 2).

- [ ] **Step 1: Add the import** (alongside other component imports at the top of the file):
```jsx
import { VoiceMicButton } from '../components/VoiceMicButton';
```

- [ ] **Step 2: Add mic button next to "Tên sản phẩm" (line 59)**

Old:
```jsx
      <Input label="Tên sản phẩm" placeholder="VD: Bánh Kem Dâu" value={name} onChange={(e) => setName(e.target.value)} />
```
New:
```jsx
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <Input label="Tên sản phẩm" placeholder="VD: Bánh Kem Dâu" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: '1 1 auto', minWidth: 0 }} />
        <VoiceMicButton onTranscript={setName} />
      </div>
```

- [ ] **Step 3: Manual verify**

Run: `npm run dev`. Go to Products → "+ Thêm sản phẩm", click "Nói" next to "Tên sản phẩm", speak, confirm it fills.

- [ ] **Step 4: Commit**

```bash
git add src/screens/ProductsScreen.jsx
git commit -m "Add voice input to Products screen name field"
```

---

### Task 6: Add voice input to `ShippingScreen.jsx`

**Files:**
- Modify: `src/screens/ShippingScreen.jsx`

**Interfaces:**
- Consumes: `VoiceMicButton` (Task 2).

- [ ] **Step 1: Add the import** (alongside the existing `Button`/`Input` imports at the top of the file):
```jsx
import { VoiceMicButton } from '../components/VoiceMicButton';
```

- [ ] **Step 2: Add mic button next to "Lý do giao trễ" (line 54, inside `LateReasonPrompt`)**

Old:
```jsx
          <Input label="Lý do giao trễ" placeholder="VD: Kẹt xe, chờ khách, khách đổi địa chỉ..." value={reason} onChange={(e) => setReason(e.target.value)} />
```
New:
```jsx
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <Input label="Lý do giao trễ" placeholder="VD: Kẹt xe, chờ khách, khách đổi địa chỉ..." value={reason} onChange={(e) => setReason(e.target.value)} style={{ flex: '1 1 auto', minWidth: 0 }} />
            <VoiceMicButton onTranscript={setReason} />
          </div>
```

- [ ] **Step 3: Manual verify**

Run: `npm run dev`. Trigger the late-delivery reason prompt (mark an overdue order as delivered on the Shipping screen), click "Nói", speak, confirm it fills the reason field.

- [ ] **Step 4: Commit**

```bash
git add src/screens/ShippingScreen.jsx
git commit -m "Add voice input to Shipping screen late-reason field"
```

---

### Task 7: Add voice input to `CashbookScreen.jsx`

**Files:**
- Modify: `src/screens/CashbookScreen.jsx`

**Interfaces:**
- Consumes: `VoiceMicButton` (Task 2).

- [ ] **Step 1: Add the import** (alongside other component imports at the top of the file):
```jsx
import { VoiceMicButton } from '../components/VoiceMicButton';
```

- [ ] **Step 2: Chốt-ca note field (line 57)** — wrap in a flex row (this field is currently standalone, same shape as prior tasks):
```jsx
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <Input label="Lý do lệch quỹ" ... value={note} onChange={(e) => setNote(e.target.value)} style={{ flex: '1 1 auto', minWidth: 0 }} />
            <VoiceMicButton onTranscript={setNote} />
          </div>
```
(Keep the field's actual current `label`/`placeholder` text — read the exact line before editing; only the wrapping and the added `VoiceMicButton` are new.)

- [ ] **Step 3: `AddEntryForm` — "Khoản thu/chi" label field (line 86)**

This row already uses `display: flex, alignItems: 'flex-end'` with `flex`-sized children. Old:
```jsx
        <Input label={type === 'thu' ? 'Khoản thu' : 'Khoản chi'} placeholder="VD: Thanh toán VietQR" value={label} onChange={(e) => setLabel(e.target.value)} style={{ flex: '2 1 200px' }} />
        <Input label="Số tiền" type="number" placeholder="VD: 500000" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ flex: '1 1 140px' }} />
```
New: insert a mic button after the label `Input`, before the numeric `Input`:
```jsx
        <Input label={type === 'thu' ? 'Khoản thu' : 'Khoản chi'} placeholder="VD: Thanh toán VietQR" value={label} onChange={(e) => setLabel(e.target.value)} style={{ flex: '2 1 200px' }} />
        <VoiceMicButton onTranscript={setLabel} />
        <Input label="Số tiền" type="number" placeholder="VD: 500000" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ flex: '1 1 140px' }} />
```

- [ ] **Step 4: `AddDebtForm` — "Nhà cung cấp" and "Ghi chú" fields (lines 135, 138)**

Old:
```jsx
        <Input label="Nhà cung cấp" placeholder="VD: Vựa trứng Cô Ba" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} style={{ flex: '2 1 180px' }} />
        <Input label="Số tiền nợ" type="number" placeholder="VD: 2000000" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ flex: '1 1 130px' }} />
        <Input label="Hạn trả" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={{ flex: '1 1 140px' }} />
        <Input label="Ghi chú" placeholder="VD: tiền trứng tháng 8" value={note} onChange={(e) => setNote(e.target.value)} style={{ flex: '2 1 180px' }} />
```
New: add one mic button after "Nhà cung cấp" and one after "Ghi chú" (skip the numeric and date fields):
```jsx
        <Input label="Nhà cung cấp" placeholder="VD: Vựa trứng Cô Ba" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} style={{ flex: '2 1 180px' }} />
        <VoiceMicButton onTranscript={setSupplierName} />
        <Input label="Số tiền nợ" type="number" placeholder="VD: 2000000" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ flex: '1 1 130px' }} />
        <Input label="Hạn trả" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={{ flex: '1 1 140px' }} />
        <Input label="Ghi chú" placeholder="VD: tiền trứng tháng 8" value={note} onChange={(e) => setNote(e.target.value)} style={{ flex: '2 1 180px' }} />
        <VoiceMicButton onTranscript={setNote} />
```

- [ ] **Step 5: Manual verify**

Run: `npm run dev`. Go to Cashbook: (a) open "Chốt ca", confirm mic button next to lý do lệch quỹ; (b) add a thu/chi entry, confirm mic button next to "Khoản thu/chi"; (c) add a debt entry, confirm mic buttons next to "Nhà cung cấp" and "Ghi chú".

- [ ] **Step 6: Commit**

```bash
git add src/screens/CashbookScreen.jsx
git commit -m "Add voice input to Cashbook screen text fields"
```

---

### Task 8: Add voice input to `CommentSection.jsx` draft input

**Files:**
- Modify: `src/components/CommentSection.jsx`

**Interfaces:**
- Consumes: `VoiceMicButton` (Task 2).

- [ ] **Step 1: Add the import** (alongside the existing imports, e.g. after line 6 `import { useAuth } from '../lib/AuthContext';`):
```jsx
import { VoiceMicButton } from './VoiceMicButton';
```

- [ ] **Step 2: Insert mic button next to the comment draft `Input` (line 171)**

Old:
```jsx
        <Input placeholder="Viết bình luận cho đơn này..." value={draft} onChange={(e) => setDraft(e.target.value)} style={{ flex: '1 1 160px', minWidth: 0 }} />
```
New:
```jsx
        <Input placeholder="Viết bình luận cho đơn này..." value={draft} onChange={(e) => setDraft(e.target.value)} style={{ flex: '1 1 160px', minWidth: 0 }} />
        <VoiceMicButton onTranscript={(t) => setDraft(draft ? `${draft} ${t}` : t)} />
```
(This field already sits inside the existing flex row at line 148-175 alongside the camera/image buttons — no new wrapper needed. Note the transcript is appended to any existing draft text rather than replacing it, since a comment box is more likely to be dictated in multiple takes than name/address fields are.)

- [ ] **Step 3: Manual verify**

Run: `npm run dev`. Open any order's detail modal, scroll to Bình Luận, click the new mic button, speak, confirm text appends to the draft box; speak again, confirm it appends rather than overwrites.

- [ ] **Step 4: Commit**

```bash
git add src/components/CommentSection.jsx
git commit -m "Add voice input to comment draft field"
```

---

### Task 9: Add voice input to `IncidentReportModal.jsx` note field

**Files:**
- Modify: `src/components/IncidentReportModal.jsx`

**Interfaces:**
- Consumes: `VoiceMicButton` (Task 2).

- [ ] **Step 1: Add the import** (alongside line 6 `import { useAuth } from '../lib/AuthContext';`):
```jsx
import { VoiceMicButton } from './VoiceMicButton';
```

- [ ] **Step 2: Wrap the note field (line 110)**

Old:
```jsx
          <Input placeholder="Ghi chú thêm (không bắt buộc)..." value={note} onChange={(e) => setNote(e.target.value)} />
```
New:
```jsx
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <Input placeholder="Ghi chú thêm (không bắt buộc)..." value={note} onChange={(e) => setNote(e.target.value)} style={{ flex: '1 1 auto', minWidth: 0 }} />
            <VoiceMicButton onTranscript={(t) => setNote(note ? `${note} ${t}` : t)} />
          </div>
```

- [ ] **Step 3: Manual verify**

Run: `npm run dev`. Open an order, trigger "Báo Sự Cố 1-Chạm", click the mic button next to the note field, speak, confirm it fills/appends.

- [ ] **Step 4: Commit**

```bash
git add src/components/IncidentReportModal.jsx
git commit -m "Add voice input to incident report note field"
```

---

### Task 10: Add `uploadFile()` generic upload helper

**Files:**
- Modify: `src/lib/queries.js` (add new function near existing `uploadPhoto`, line 291-299)

**Interfaces:**
- Produces: `uploadFile(file, pathPrefix)` → `Promise<{ url: string, name: string, type: string, size: number }>`. Throws `Error('File vượt quá 25MB')` if `file.size > 25 * 1024 * 1024`.
- Consumes: `supabase` client already imported at the top of `queries.js`; same `uploads` storage bucket used by `uploadPhoto`.

- [ ] **Step 1: Add the function right after `uploadPhoto` (after line 299)**

```js
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export async function uploadFile(file, pathPrefix) {
  if (file.size > MAX_ATTACHMENT_BYTES) throw new Error('File vượt quá 25MB');
  const contentType = file.type || 'application/octet-stream';
  const originalName = file.name || 'file';
  const extMatch = originalName.match(/\.[^.]+$/);
  const ext = extMatch ? extMatch[0] : '';
  const path = `${pathPrefix}/${Date.now()}${ext}`;
  const { error } = await supabase.storage.from('uploads').upload(path, file, { contentType });
  if (error) throw error;
  const { data } = supabase.storage.from('uploads').getPublicUrl(path);
  return { url: data.publicUrl, name: originalName, type: contentType, size: file.size };
}
```

- [ ] **Step 2: Manual verify**

This function has no UI call site yet (wired up in Tasks 12-13). Verify by temporarily calling it from the browser console after `npm run dev` is running and the app is loaded and authenticated: open devtools console on the running app, and confirm `uploads` bucket exists and is reachable by checking that an existing image URL (e.g. any product photo already in the app) loads — this is a sanity check that the bucket/public-URL scheme this function relies on is correct, not a full test of the new function (that happens end-to-end in Task 12).

- [ ] **Step 3: Commit**

```bash
git add src/lib/queries.js
git commit -m "Add generic uploadFile() helper alongside uploadPhoto()"
```

---

### Task 11: Persist incident photos (pre-existing bug fix required for Task 13)

**Context:** `IncidentReportModal.jsx` already uploads photos and passes a `photos` array into `addIncidentReport(...)`, but `addIncidentReport` (queries.js:237) doesn't accept that field and `incident_reports` (schema.sql:653) has no `photos` column — uploaded incident photos are silently discarded today. This must be fixed before Task 13 adds file attachments to incidents, otherwise the new attachments would be discarded too.

**Files:**
- Create: `supabase/migrate_incident_photos.sql`
- Modify: `src/lib/queries.js:237-244` (`addIncidentReport`)

**Interfaces:**
- Produces: `addIncidentReport({ ..., photos })` now persists `photos` (an array of `{ url, name, type }` objects) to a new `jsonb` column.
- Consumes: nothing new.

- [ ] **Step 1: Write the migration file**

```sql
-- Run manually in Supabase SQL Editor. Safe to re-run (idempotent).
alter table incident_reports add column if not exists photos jsonb;
```

- [ ] **Step 2: Update `addIncidentReport` in `src/lib/queries.js`**

Old (lines 237-244):
```js
export async function addIncidentReport({ orderId, orderCode, category, code, label, note, reporterId, reporterName, reporterRole }) {
  const { error } = await supabase.from('incident_reports').insert({
    order_id: orderId || null, order_code: orderCode || null, category, code, label, note: note || null,
    reporter_id: reporterId || null, reporter_name: reporterName || null, reporter_role: reporterRole || null,
  });
  if (error) throw error;
  notifyBadgesChanged();
}
```
New:
```js
export async function addIncidentReport({ orderId, orderCode, category, code, label, note, photos, reporterId, reporterName, reporterRole }) {
  const { error } = await supabase.from('incident_reports').insert({
    order_id: orderId || null, order_code: orderCode || null, category, code, label, note: note || null,
    photos: photos && photos.length > 0 ? photos : null,
    reporter_id: reporterId || null, reporter_name: reporterName || null, reporter_role: reporterRole || null,
  });
  if (error) throw error;
  notifyBadgesChanged();
}
```

- [ ] **Step 3: Manual verify**

Tell the user to run the migration in the Supabase SQL Editor (this repo's established pattern — migrations are hand-run by the project owner, not auto-applied). After they confirm it's run, this task's own verification happens together with Task 13's end-to-end check (submitting an incident with a photo and confirming the `photos` column is populated via the Supabase table editor).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrate_incident_photos.sql src/lib/queries.js
git commit -m "Persist incident report photos (were silently discarded before)"
```

---

### Task 12: Generic file attachments in `CommentSection.jsx`

**Files:**
- Modify: `src/components/CommentSection.jsx`

**Interfaces:**
- Consumes: `uploadFile` (Task 10) from `src/lib/queries.js`.

- [ ] **Step 1: Update imports (line 2)**

Old:
```jsx
import { fetchOrderNotes, addOrderNote, uploadPhoto } from '../lib/queries';
```
New:
```jsx
import { fetchOrderNotes, addOrderNote, uploadPhoto, uploadFile } from '../lib/queries';
```
Also add `IconDownload` to the icon import (line 7):
Old: `import { IconChat, IconCamera, IconImage, IconBell } from './icons/FrogIcons';`
New: `import { IconChat, IconCamera, IconImage, IconBell, IconPaperclip, IconDownload } from './icons/FrogIcons';`

- [ ] **Step 2: Rewrite `handlePhotoSelect` to handle mixed file types (lines 56-71)**

Old:
```jsx
  const handlePhotoSelect = async (files) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError('');
    try {
      const newPhotos = await Promise.all(Array.from(files).map(async (file, i) => {
        const safeFile = await toWebSafeImage(file);
        return uploadPhoto(safeFile, `comment_${Date.now()}_${i}`);
      }));
      setPhotos([...photos, ...newPhotos]);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };
```
New (rename `photos` state usage stays the same variable name — now holds objects instead of bare URL strings, so the state itself and its setter names are unchanged, only the shape of each array element changes):
```jsx
  const handlePhotoSelect = async (files) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError('');
    try {
      const newAttachments = await Promise.all(Array.from(files).map(async (file, i) => {
        if (file.type.startsWith('image/')) {
          const safeFile = await toWebSafeImage(file);
          const url = await uploadPhoto(safeFile, `comment_${Date.now()}_${i}`);
          return { url, name: safeFile.name || file.name, type: safeFile.type };
        }
        return uploadFile(file, `comment_${Date.now()}_${i}`);
      }));
      setPhotos([...photos, ...newAttachments]);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };
```

- [ ] **Step 3: Update message encoding in `handleSend` (lines 73-105)**

Old (lines 79-81):
```jsx
      const fullMessage = photos.length > 0
        ? `${message}\n[PHOTOS: ${photos.map(p => `![image](${p})`).join(', ')}]`
        : message;
```
New — encode each attachment as `name|type|url` inside a `[FILES: ...]` block (replacing the old `[PHOTOS: ...]` scheme; the rendering side in Step 5 is updated to match, so no old messages need to keep parsing against this — existing already-sent comments with the old `[PHOTOS:` scheme are handled by a fallback kept in Step 5):
```jsx
      const fullMessage = photos.length > 0
        ? `${message}\n[FILES: ${photos.map(p => `${p.name}|${p.type}|${p.url}`).join(', ')}]`
        : message;
```

- [ ] **Step 4: Update the local optimistic-comment insert (lines 89-96) — no change needed**, it already stores `fullMessage` as-is; skip this step, it's handled by Step 3's `fullMessage` already containing the new encoding.

- [ ] **Step 5: Update rendering (lines 121-139) to handle both the old `[PHOTOS:` scheme (already-sent historical comments) and the new `[FILES:` scheme**

Old:
```jsx
              <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {c.message.split('[PHOTOS:')[0]}
              </div>
              {c.message.includes('[PHOTOS:') && (
                <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {c.message.match(/!\[image\]\(([^)]+)\)/g)?.map((match, i) => {
                    const url = match.match(/\((.*?)\)/)[1];
                    return (
                      <img
                        key={i}
                        src={url}
                        alt={`comment-${i}`}
                        style={{ maxWidth: 100, maxHeight: 100, borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
                        onClick={() => window.open(url, '_blank')}
                      />
                    );
                  })}
                </div>
              )}
```
New:
```jsx
              <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {c.message.split('[PHOTOS:')[0].split('[FILES:')[0]}
              </div>
              {c.message.includes('[PHOTOS:') && (
                <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {c.message.match(/!\[image\]\(([^)]+)\)/g)?.map((match, i) => {
                    const url = match.match(/\((.*?)\)/)[1];
                    return (
                      <img
                        key={i}
                        src={url}
                        alt={`comment-${i}`}
                        style={{ maxWidth: 100, maxHeight: 100, borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
                        onClick={() => window.open(url, '_blank')}
                      />
                    );
                  })}
                </div>
              )}
              {c.message.includes('[FILES:') && (
                <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {c.message.match(/\[FILES: (.+)\]/)?.[1].split(', ').map((entry, i) => {
                    const [name, type, url] = entry.split('|');
                    if (type?.startsWith('image/')) {
                      return (
                        <img
                          key={i}
                          src={url}
                          alt={name}
                          style={{ maxWidth: 100, maxHeight: 100, borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
                          onClick={() => window.open(url, '_blank')}
                        />
                      );
                    }
                    return (
                      <a
                        key={i}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--surface-sunken)', font: 'var(--text-caption)', color: 'var(--text-primary)', textDecoration: 'none' }}
                      >
                        <IconDownload size={14} /> {name}
                      </a>
                    );
                  })}
                </div>
              )}
```

- [ ] **Step 6: Widen the file picker input and its preview thumbnails**

Old (line 198):
```jsx
      <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={(e) => handlePhotoSelect(e.target.files)} style={{ display: 'none' }} />
```
New:
```jsx
      <input ref={fileInputRef} type="file" accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx" multiple onChange={(e) => handlePhotoSelect(e.target.files)} style={{ display: 'none' }} />
```
(Leave the camera input at line 197 — `accept="image/*" capture="environment"` — unchanged; camera capture is inherently image-only.)

Old preview block (lines 177-195) renders `photos.map((url, i) => ... <img src={url} .../>)`. Since `photos` entries are now `{ url, name, type }` objects, update to:
```jsx
      {photos.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {photos.map((p, i) => (
            <div key={i} style={{ position: 'relative', width: 60, height: 60, borderRadius: 'var(--radius-sm)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-sunken)' }}>
              {p.type?.startsWith('image/') ? (
                <img src={p.url} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: 4 }}>
                  <IconPaperclip size={16} />
                  <span style={{ font: 'var(--text-caption)', color: 'var(--text-muted)', fontSize: 9, textAlign: 'center', wordBreak: 'break-all' }}>{p.name}</span>
                </div>
              )}
              <button
                onClick={() => setPhotos(photos.filter((_, idx) => idx !== i))}
                style={{
                  position: 'absolute', top: 2, right: 2, width: 20, height: 20, borderRadius: '50%',
                  background: 'var(--status-danger)', color: '#fff', border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', font: '12px',
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
```

- [ ] **Step 7: Manual verify**

Run: `npm run dev`. Open an order's Bình Luận section:
1. Attach an image via the image-picker button — confirm thumbnail preview, send, confirm it renders as an `<img>` in the thread.
2. Attach a PDF via the same button — confirm it shows a paperclip + filename preview (not broken), send, confirm the sent comment shows a clickable "📎 filename.pdf" link that opens the file in a new tab.
3. Confirm a pre-existing comment with an old-style `[PHOTOS:` image (if any test data has one) still renders correctly.

- [ ] **Step 8: Commit**

```bash
git add src/components/CommentSection.jsx
git commit -m "Accept PDF/Word/Excel attachments in order comments, not just images"
```

---

### Task 13: Generic file attachments in `IncidentReportModal.jsx`

**Files:**
- Modify: `src/components/IncidentReportModal.jsx`

**Interfaces:**
- Consumes: `uploadFile` (Task 10), the fixed `addIncidentReport` (Task 11).

- [ ] **Step 1: Update imports**

Old (line 4): `import { addIncidentReport, uploadPhoto } from '../lib/queries';`
New: `import { addIncidentReport, uploadPhoto, uploadFile } from '../lib/queries';`
Old (line 7): `import { IconWarning, IconCamera, IconImage } from './icons/FrogIcons';`
New: `import { IconWarning, IconCamera, IconImage, IconPaperclip, IconDownload } from './icons/FrogIcons';`

- [ ] **Step 2: Rewrite `handlePhotoSelect` (lines 45-60)** — identical shape to Task 12 Step 2:

Old:
```jsx
  const handlePhotoSelect = async (files) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError('');
    try {
      const newPhotos = await Promise.all(Array.from(files).map(async (file, i) => {
        const safeFile = await toWebSafeImage(file);
        return uploadPhoto(safeFile, `incident_${Date.now()}_${i}`);
      }));
      setPhotos([...photos, ...newPhotos]);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };
```
New:
```jsx
  const handlePhotoSelect = async (files) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError('');
    try {
      const newAttachments = await Promise.all(Array.from(files).map(async (file, i) => {
        if (file.type.startsWith('image/')) {
          const safeFile = await toWebSafeImage(file);
          const url = await uploadPhoto(safeFile, `incident_${Date.now()}_${i}`);
          return { url, name: safeFile.name || file.name, type: safeFile.type };
        }
        return uploadFile(file, `incident_${Date.now()}_${i}`);
      }));
      setPhotos([...photos, ...newAttachments]);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };
```

- [ ] **Step 3: `handleSend` already passes `photos` through (line 69, `photos: photos.length > 0 ? photos : null`) — no change needed** since Task 11 already updated `addIncidentReport` to accept and store this array of `{ url, name, type }` objects directly (as `jsonb`, no text-encoding needed here unlike Comments, since incidents have a real DB column).

- [ ] **Step 4: Widen the file picker (line 152)**

Old:
```jsx
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => handlePhotoSelect(e.target.files)}
              style={{ display: 'none' }}
            />
```
New:
```jsx
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx"
              multiple
              onChange={(e) => handlePhotoSelect(e.target.files)}
              style={{ display: 'none' }}
            />
```
(Leave the camera input at line 141-148 — `accept="image/*" capture="environment"` — unchanged.)

- [ ] **Step 5: Update preview rendering (lines 157-175)** — same pattern as Task 12 Step 6:

Old:
```jsx
            {photos.length > 0 && (
              <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {photos.map((url, i) => (
                  <div key={i} style={{ position: 'relative', width: 60, height: 60, borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                    <img src={url} alt={`incident-${i}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <button
                      onClick={() => setPhotos(photos.filter((_, idx) => idx !== i))}
                      style={{
                        position: 'absolute', top: 2, right: 2, width: 20, height: 20, borderRadius: '50%',
                        background: 'var(--status-danger)', color: '#fff', border: 'none', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', font: '12px',
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
```
New:
```jsx
            {photos.length > 0 && (
              <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {photos.map((p, i) => (
                  <div key={i} style={{ position: 'relative', width: 60, height: 60, borderRadius: 'var(--radius-sm)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-sunken)' }}>
                    {p.type?.startsWith('image/') ? (
                      <img src={p.url} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: 4 }}>
                        <IconPaperclip size={16} />
                        <span style={{ font: 'var(--text-caption)', color: 'var(--text-muted)', fontSize: 9, textAlign: 'center', wordBreak: 'break-all' }}>{p.name}</span>
                      </div>
                    )}
                    <button
                      onClick={() => setPhotos(photos.filter((_, idx) => idx !== i))}
                      style={{
                        position: 'absolute', top: 2, right: 2, width: 20, height: 20, borderRadius: '50%',
                        background: 'var(--status-danger)', color: '#fff', border: 'none', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', font: '12px',
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
```

- [ ] **Step 6: Manual verify (requires Task 11's migration to have been run in Supabase first)**

Run: `npm run dev`. Open an order → "Báo Sự Cố 1-Chạm":
1. Attach an image, confirm thumbnail preview.
2. Attach a PDF, confirm paperclip + filename preview.
3. Submit the incident. Open the Supabase table editor on `incident_reports`, confirm the new row's `photos` column contains a JSON array with both attachments (`url`, `name`, `type` for each).
4. If there's an incidents list/detail view elsewhere in the app that reads this table, confirm it doesn't crash on the new `photos` column (it wasn't rendering photos before since the column didn't exist, so this is a regression check, not a new render path).

- [ ] **Step 7: Commit**

```bash
git add src/components/IncidentReportModal.jsx
git commit -m "Accept PDF/Word/Excel attachments in incident reports, not just images"
```

---

## Post-plan note for the user

After Tasks 11 and 13 land, run `supabase/migrate_incident_photos.sql` in the Supabase SQL Editor (same pattern as `migrate_owner_approval.sql` from the prior session) to activate incident-photo persistence in production.
