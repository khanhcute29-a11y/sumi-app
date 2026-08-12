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
