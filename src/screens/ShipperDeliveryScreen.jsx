import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../lib/AuthContext';

export default function ShipperDeliveryScreen() {
  const { profile } = useAuth();
  const [deliveries, setDeliveries] = useState([]);
  const [activeDelivery, setActiveDelivery] = useState(null);
  const [gpsLocation, setGpsLocation] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [kpiData, setKpiData] = useState({});
  const cameraRef = useRef(null);

  // Load active deliveries for shipper
  useEffect(() => {
    const loadDeliveries = async () => {
      const { data } = await supabase
        .from('delivery_runs')
        .select('*,delivery_stops(*)')
        .eq('driver_id', profile?.id)
        .eq('status', 'in_progress');
      setDeliveries(data || []);
    };
    loadDeliveries();
  }, [profile?.id]);

  // Watch GPS location
  useEffect(() => {
    if (!activeDelivery) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => setGpsLocation({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        timestamp: new Date(),
        accuracy: pos.coords.accuracy
      }),
      null,
      { enableHighAccuracy: true, timeout: 5000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [activeDelivery]);

  // Start delivery
  const startDelivery = async (delivery) => {
    const { error } = await supabase
      .from('delivery_runs')
      .update({ status: 'in_progress', started_at: new Date() })
      .eq('id', delivery.id);
    if (!error) setActiveDelivery(delivery);
  };

  // Complete delivery + upload photo proof
  const completeDelivery = async (delivery, stop) => {
    const now = new Date();
    let photoUrl = null;

    // Upload photo if captured
    if (photos.length > 0) {
      const file = photos[0];
      const path = `deliveries/${delivery.id}/${stop.id}/${now.getTime()}.jpg`;
      const { error: uploadErr } = await supabase.storage
        .from('uploads')
        .upload(path, file);
      if (!uploadErr) photoUrl = path;
    }

    // Calculate KPI
    const distance = gpsLocation ? calculateDistance(delivery, gpsLocation) : 0;
    const deliveryTime = stop.arrived_at
      ? Math.round((now - new Date(stop.arrived_at)) / 60000)
      : 0;
    const fuelCost = distance * 0.05; // 50đ per km estimate

    // Update delivery stop
    const { error } = await supabase
      .from('delivery_stops')
      .update({
        status: 'completed',
        completed_at: now,
        proof_storage_path: photoUrl,
        gps_latitude: gpsLocation?.lat,
        gps_longitude: gpsLocation?.lng
      })
      .eq('id', stop.id);

    // Log KPI
    if (!error) {
      await supabase.from('kpi_logs').insert({
        delivery_id: delivery.id,
        driver_id: profile?.id,
        distance_km: distance,
        delivery_time_minutes: deliveryTime,
        fuel_cost: fuelCost,
        photo_proof_path: photoUrl,
        completed_at: now
      });
    }

    setPhotos([]);
  };

  // Calculate distance (simplified)
  const calculateDistance = (delivery, current) => {
    const R = 6371; // km
    const lastStop = delivery.delivery_stops?.[delivery.delivery_stops.length - 1];
    if (!lastStop) return 0;

    const dLat = (current.lat - lastStop.latitude) * Math.PI / 180;
    const dLng = (current.lng - lastStop.longitude) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lastStop.latitude * Math.PI / 180) * Math.cos(current.lat * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  return (
    <div style={{ padding: 16, maxWidth: 600, margin: '0 auto' }}>
      <h2>🚚 Giao Hàng - {profile?.full_name}</h2>

      {!activeDelivery ? (
        <div>
          <h3>Chuyến giao hôm nay</h3>
          {deliveries.map(d => (
            <div key={d.id} style={{padding: 12, border: '1px solid #e0d5c7', borderRadius: 8, marginBottom: 8}}>
              <div style={{fontWeight: 700}}>{d.delivery_stops?.length || 0} điểm giao</div>
              <div style={{fontSize: 13, color: '#8c5a3c', marginTop: 4}}>
                {d.delivery_stops?.[0]?.address || 'Chưa có'}
              </div>
              <button onClick={() => startDelivery(d)}
                style={{marginTop: 8, width: '100%', padding: 10, background: '#d96b43', color: '#fff', border: 0, borderRadius: 8, fontWeight: 700}}>
                Bắt đầu giao
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div>
          <h3>Đang giao</h3>
          {gpsLocation && (
            <div style={{padding: 12, background: '#f5f1eb', borderRadius: 8, marginBottom: 12}}>
              <div style={{fontSize: 12, color: '#8c5a3c'}}>📍 Vị trí: {gpsLocation.lat.toFixed(4)}, {gpsLocation.lng.toFixed(4)}</div>
              <div style={{fontSize: 12, color: '#8c5a3c', marginTop: 4}}>Độ chính xác: {gpsLocation.accuracy?.toFixed(0)}m</div>
            </div>
          )}

          {activeDelivery.delivery_stops?.map((stop, idx) => (
            <div key={stop.id} style={{padding: 12, border: '1px solid #e0d5c7', borderRadius: 8, marginBottom: 8}}>
              <div style={{fontWeight: 700}}>Điểm {idx + 1}: {stop.address}</div>
              <div style={{fontSize: 13, color: '#8c5a3c', marginTop: 4}}>Khách: {stop.customer_name}</div>
              <div style={{fontSize: 13, color: '#8c5a3c'}}>SĐT: {stop.phone}</div>

              {stop.status !== 'completed' && (
                <>
                  <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={e => setPhotos([e.target.files[0]])} style={{marginTop: 8, width: '100%'}} />
                  {photos.length > 0 && <div style={{fontSize: 12, color: '#087f5b', marginTop: 4}}>✓ Đã chụp ảnh</div>}
                  <button onClick={() => completeDelivery(activeDelivery, stop)}
                    style={{marginTop: 8, width: '100%', padding: 10, background: '#087f5b', color: '#fff', border: 0, borderRadius: 8, fontWeight: 700}}>
                    ✓ Giao thành công
                  </button>
                </>
              )}

              {stop.status === 'completed' && (
                <div style={{marginTop: 8, color: '#087f5b', fontWeight: 700}}>✓ Đã hoàn thành</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
