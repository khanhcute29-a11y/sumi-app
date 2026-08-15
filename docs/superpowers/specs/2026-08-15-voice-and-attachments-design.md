# Voice input upgrade + generic file attachments

Date: 2026-08-15

## Goal

1. Improve the existing voice-input feature (currently only in `WarehouseScreen`) and roll it out to other free-text fields across the app.
2. Let comments/incident reports accept any file type (PDF, Word, Excel, etc.), not just images. Single-purpose image fields (product photo, warehouse stock photo, order item photo) stay image-only.

## 1. Voice input

### Hook upgrade (`src/lib/useVoiceInput.js`)

- Switch `interimResults` to `true` so partial transcript streams while the user is still talking.
- Add an `onInterim(text)` callback (fired repeatedly with the in-progress transcript) alongside the existing `onResult(text)` (fired with the final transcript when recognition ends).
- Capture `recognition.onerror` reason and expose it as an `error` string on the hook, mapped to Vietnamese messages:
  - `not-allowed` / `service-not-allowed` → "Chưa cấp quyền micro"
  - `no-speech` → "Không nghe thấy, thử lại"
  - anything else → "Không nhận diện được giọng nói"
- Keep the existing return shape (`supported`, `listening`, `start`, `stop`) so `WarehouseScreen`'s current call sites keep working unmodified; `start` gains an optional second callback param for interim updates, `error` is a new returned field.

### Reusable UI: `VoiceMicButton`

New component in `src/components/VoiceMicButton.jsx`, extracted from the button markup already duplicated in `WarehouseScreen`:
- Props: `onTranscript(text)` (final result), optional `onInterim(text)`.
- Renders nothing if `!supported` (Web Speech API unavailable).
- Shows the Vietnamese `error` inline (small caption, danger color) when set.
- Same visual language as today: `IconMic`, "Nói" / "Đang nghe...".

### Rollout

Add `VoiceMicButton` next to these free-text inputs (skip numeric/price/date/dropdown/password/email fields):

- `OrdersScreen.jsx` — customer name, address, order notes
- `CustomersScreen.jsx` — name, address, notes
- `ProductsScreen.jsx` — product name, description
- `ShippingScreen.jsx` — delivery notes
- `CashbookScreen.jsx` — transaction note/description
- `CommentSection.jsx` — comment draft input
- `IncidentReportModal.jsx` — incident description
- `WarehouseScreen.jsx` — migrate its two existing inline mic buttons to the shared component (behavior-preserving refactor)

Each integration is a small, independent change (add one button next to one input); the plan should enumerate exact fields per file at implementation time by reading each screen.

## 2. Generic file attachments

### Storage helper (`src/lib/queries.js`)

Add `uploadFile(file, pathPrefix)` alongside the existing `uploadPhoto`:
- Preserves the original file extension (from `file.name`), instead of hardcoding jpg/png.
- Uses `file.type` as `contentType`.
- Enforces a 25MB client-side size check before upload; throws a Vietnamese error (`"File vượt quá 25MB"`) if exceeded.
- Returns `{ url, name, type, size }` (vs. `uploadPhoto`'s bare URL string) so callers can render a filename/icon for non-image files.

`uploadPhoto` stays as-is (image-only call sites keep using it, untouched).

### `CommentSection.jsx` and `IncidentReportModal.jsx`

- File pickers change from `accept="image/*"` to `accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx"` (camera-capture button stays image/camera-only — no "capture" affordance for documents).
- Attachment list switches from a bare URL array to `{ url, name, type }` objects.
- Rendering: image types show the existing thumbnail; non-image types show `IconPaperclip`/filename + a link that opens/downloads the file (`IconDownload`).
- Message encoding: current markdown-embedded `[PHOTOS: ![image](url), ...]` scheme extends to a generic `[FILES: name|type|url, ...]` scheme so non-image attachments round-trip through the existing text-message storage without a DB migration.

### Everything else (Products, Warehouse stock, Order item photo, OrderDetailModal)

No change — these keep `PhotoField` / `CameraPhotoField`, image-only, exactly as today.

## Out of scope

- No DB schema changes (attachments continue to piggyback on the existing note-message text field).
- No server-side file-type/virus validation (client-side accept + size check only, consistent with current photo upload trust level).
- Voice input scope is "free-text fields identified above" — not literally every input in the app (search boxes with existing voice support like Warehouse's search field are already covered; other search boxes are out of scope unless flagged during implementation).
