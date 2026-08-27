import { useState, useEffect } from 'react';

export function getCurrentPosition(options = {}) {
  return new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0, ...options }
    );
  });
}

// GPS "nhanh nhất có thể" cho các form Nhận việc/Chốt ca/Giao đơn: thử độ
// chính xác cao trước (enableHighAccuracy, timeout ngắn, cho phép dùng lại vị
// trí cache trong 3s để phản hồi tức thì khi bấm liên tiếp) — nếu quá giờ
// hoặc lỗi, tự động hạ cấp sang định vị mạng (Cell/IP, enableHighAccuracy
// false, chờ lâu hơn) thay vì chặn luồng bấm của nhân viên. Không throw —
// luôn resolve, kể cả khi cả 2 lần đều thất bại (resolve null).
export function getCurrentPositionSmart({ onDegraded } = {}) {
  return new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(null); return; }
    const toResult = (pos) => ({
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: Number.isFinite(pos.coords.accuracy) ? Math.round(pos.coords.accuracy) : null,
    });
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(toResult(pos)),
      () => {
        onDegraded?.();
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve(toResult(pos)),
          () => resolve(null),
          { enableHighAccuracy: false, timeout: 8000, maximumAge: 3000 }
        );
      },
      { enableHighAccuracy: true, timeout: 6000, maximumAge: 3000 }
    );
  });
}

// Tải trước GPS âm thầm ngay khi 1 form/trang việc vừa mount, để lúc nhân
// viên bấm "Nhận việc"/"Chốt ca"/"Giao đơn" đã sẵn có toạ độ — dùng trong
// component với `const gps = usePrefetchedLocation();`.
export function usePrefetchedLocation() {
  const [state, setState] = useState({ coords: null, degraded: false, loading: true });
  useEffect(() => {
    let cancelled = false;
    getCurrentPositionSmart({ onDegraded: () => { if (!cancelled) setState((s) => ({ ...s, degraded: true })); } })
      .then((coords) => { if (!cancelled) setState((s) => ({ ...s, coords, loading: false })); });
    return () => { cancelled = true; };
  }, []);
  return state;
}

export function haversineKm(lat1, lng1, lat2, lng2) {
  if ([lat1, lng1, lat2, lng2].some((v) => v === null || v === undefined)) return null;
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function estimateTrip(distanceKm, avgSpeedKmh, gasPricePerKm) {
  if (distanceKm === null || distanceKm === undefined) return null;
  const roundTripKm = distanceKm * 2;
  const oneWayMinutes = Math.round((distanceKm / avgSpeedKmh) * 60);
  const roundTripMinutes = oneWayMinutes * 2;
  const gasCost = Math.round(roundTripKm * gasPricePerKm);
  return { distanceKm, roundTripKm, oneWayMinutes, roundTripMinutes, gasCost };
}
