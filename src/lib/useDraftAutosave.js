import { useEffect, useRef, useState } from 'react';
import React from 'react';

// Tự động lưu bản nháp form vào localStorage — dữ liệu đang nhập dở không
// mất khi tắt/thoát trình duyệt hoặc F5 giữa chừng. Dùng chung cho mọi form
// nhập liệu cần chống mất dữ liệu (đơn hàng, giao việc...).
//
// storageKey: khoá lưu trong localStorage, ví dụ 'sumi_order_draft_v2'.
// values: object các giá trị hiện tại của form (phải serialize được bằng
//   JSON — KHÔNG đưa File/Blob vào đây, ảnh đính kèm không khôi phục được
//   sau khi tải lại trang vì trình duyệt không cho đọc lại File từ đĩa).
// setters: object cùng key với values, mỗi key là hàm set state tương ứng —
//   dùng để điền ngược dữ liệu khi khôi phục bản nháp lúc mount.
export function useDraftAutosave(storageKey, values, setters) {
  const [saveStatus, setSaveStatus] = useState('idle'); // 'idle' | 'saving' | 'saved'
  const isFirstRun = useRef(true);
  const debounceTimer = useRef(null);

  // Khôi phục bản nháp đã lưu — chỉ chạy 1 lần lúc mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw);
        Object.keys(setters).forEach((key) => {
          if (saved[key] !== undefined) setters[key](saved[key]);
        });
      }
    } catch (err) {
      console.warn(`[Autosave] Không đọc được bản nháp "${storageKey}":`, err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  // Tự động lưu mỗi khi giá trị form thay đổi — debounce 1s để gõ nhanh
  // không bị đơ/lag do ghi localStorage liên tục theo từng phím bấm.
  const serialized = JSON.stringify(values);
  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }
    setSaveStatus('saving');
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      try {
        localStorage.setItem(storageKey, serialized);
        setSaveStatus('saved');
      } catch (err) {
        console.warn(`[Autosave] Không lưu được bản nháp "${storageKey}":`, err);
      }
    }, 1000);
    return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serialized, storageKey]);

  const clearDraft = () => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    localStorage.removeItem(storageKey);
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
