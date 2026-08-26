import { useEffect, useRef, useState } from 'react';
import React from 'react';

// Nhiều bản nháp cùng lưu chung 1 khoá localStorage, dạng { [draftId]: {...values, savedAt} }
// — cho phép người dùng bỏ dở nhiều đơn khác nhau (VD: đang gõ đơn Macaron thì
// có khách khác gọi, chuyển sang gõ đơn Trường học) mà không mất cái nào.
const DRAFTS_STORAGE_KEY = 'sumi_order_drafts_v2';

function readDraftsMap(storageKey) {
  try {
    return JSON.parse(localStorage.getItem(storageKey) || '{}');
  } catch (err) {
    console.warn(`[Autosave] Không đọc được danh sách nháp "${storageKey}":`, err);
    return {};
  }
}

function writeDraftsMap(storageKey, map) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(map));
  } catch (err) {
    console.warn(`[Autosave] Không lưu được danh sách nháp "${storageKey}":`, err);
  }
}

// Liệt kê các bản nháp đã lưu, mới nhất lên đầu.
export function listOrderDrafts(storageKey = DRAFTS_STORAGE_KEY) {
  const map = readDraftsMap(storageKey);
  return Object.entries(map)
    .map(([id, draft]) => ({ id, ...draft }))
    .sort((a, b) => (b.savedAt || '').localeCompare(a.savedAt || ''));
}

// Xoá 1 bản nháp cụ thể khỏi danh sách.
export function deleteOrderDraft(draftId, storageKey = DRAFTS_STORAGE_KEY) {
  const map = readDraftsMap(storageKey);
  delete map[draftId];
  writeDraftsMap(storageKey, map);
}

// Tự động lưu 1 bản nháp (theo draftId) vào danh sách nháp trong localStorage —
// dữ liệu đang nhập dở không mất khi tắt/thoát trình duyệt hoặc F5 giữa chừng,
// và nhiều đơn bỏ dở khác nhau đều được giữ lại riêng biệt để chọn tiếp sau.
//
// draftId: null/undefined khi chưa có đơn nào đang soạn (chưa chọn loại đơn) —
//   hook sẽ không đọc/ghi gì cho tới khi có id thật.
// values: object các giá trị hiện tại của form (phải serialize được bằng
//   JSON — KHÔNG đưa File/Blob vào đây, ảnh đính kèm không khôi phục được
//   sau khi tải lại trang vì trình duyệt không cho đọc lại File từ đĩa).
// setters: object cùng key với values, mỗi key là hàm set state tương ứng —
//   dùng để điền ngược dữ liệu khi tiếp tục một bản nháp đã lưu.
export function useOrderDraftAutosave(draftId, values, setters, storageKey = DRAFTS_STORAGE_KEY) {
  const [saveStatus, setSaveStatus] = useState('idle'); // 'idle' | 'saving' | 'saved'
  const isFirstRunForId = useRef(null);
  const debounceTimer = useRef(null);

  // Khôi phục bản nháp đã lưu mỗi khi draftId đổi (bắt đầu đơn mới hoặc bấm
  // "Tiếp tục" trên 1 nháp cũ).
  useEffect(() => {
    isFirstRunForId.current = draftId;
    if (!draftId) { setSaveStatus('idle'); return; }
    try {
      const map = readDraftsMap(storageKey);
      const saved = map[draftId];
      if (saved) {
        Object.keys(setters).forEach((key) => {
          if (saved[key] !== undefined) setters[key](saved[key]);
        });
      }
    } catch (err) {
      console.warn(`[Autosave] Không đọc được bản nháp "${draftId}":`, err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId, storageKey]);

  // Tự động lưu mỗi khi giá trị form thay đổi — debounce 1s để gõ nhanh
  // không bị đơ/lag do ghi localStorage liên tục theo từng phím bấm.
  const serialized = JSON.stringify(values);
  useEffect(() => {
    if (!draftId) return;
    // Bỏ qua lần chạy đầu tiên NGAY SAU KHI đổi draftId (đó là lúc restore
    // vừa điền dữ liệu vào, không phải người dùng vừa gõ) — nhưng vẫn lưu
    // cho các thay đổi thật sự tiếp theo.
    if (isFirstRunForId.current === draftId) {
      isFirstRunForId.current = 'done:' + draftId;
      return;
    }
    setSaveStatus('saving');
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      try {
        const map = readDraftsMap(storageKey);
        map[draftId] = { ...values, savedAt: new Date().toISOString() };
        writeDraftsMap(storageKey, map);
        setSaveStatus('saved');
      } catch (err) {
        console.warn(`[Autosave] Không lưu được bản nháp "${draftId}":`, err);
      }
    }, 1000);
    return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serialized, draftId, storageKey]);

  const clearDraft = () => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    if (draftId) deleteOrderDraft(draftId, storageKey);
    setSaveStatus('idle');
  };

  return { saveStatus, clearDraft };
}

// Chỉ báo trạng thái tự động lưu — dùng chung cho mọi form áp dụng hook trên.
export function DraftSaveIndicator({ status, style }) {
  if (status === 'idle') return null;
  const isSaving = status === 'saving';
  return React.createElement('div', {
    style: {
      fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4,
      color: isSaving ? '#a08060' : '#15803d', ...style,
    },
  }, isSaving ? '⏳ Đang lưu bản nháp...' : '✓ Đã lưu tạm vào máy');
}
