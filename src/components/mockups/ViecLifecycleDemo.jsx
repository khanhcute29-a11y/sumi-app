import React from 'react';
import VongDoiViec from '../tasks/v2/VongDoiViec';
import '../../styles/cong-viec.css';

// Xem thử dải vòng đời 6 bước, KHÔNG cần đăng nhập:
//   http://localhost:5173/?mockup=viec-lifecycle
//
// Chỉ để duyệt hình ảnh cho khớp mockup task-lifecycle-v2-approved — không
// đọc/ghi gì xuống database.

const gioNay = new Date();
const cach = (phut) => new Date(gioNay.getTime() - phut * 60000).toISOString();
const toi = (phut) => new Date(gioNay.getTime() + phut * 60000).toISOString();

const CAC_VIEC = [
  {
    ten: '1. Vừa giao — chờ nhận (đúng hạn)',
    viec: { status: 'open', created_at: cach(5), deadline: toi(120) },
  },
  {
    ten: '2. Chờ nhận — ĐÃ QUÁ HẠN nhận',
    viec: { status: 'open', created_at: cach(200), deadline: cach(30) },
  },
  {
    ten: '3. Đang làm (đúng tiến độ)',
    viec: { status: 'accepted', created_at: cach(60), accepted_at: cach(50), deadline: toi(60) },
  },
  {
    ten: '4. Đang làm — quá hạn',
    viec: { status: 'accepted', created_at: cach(300), accepted_at: cach(280), deadline: cach(20) },
  },
  {
    ten: '5. Đã báo xong, chờ quản lý duyệt',
    viec: { status: 'pending_approval', created_at: cach(180), accepted_at: cach(170), completed_at: cach(10), deadline: toi(30) },
  },
  {
    ten: '6. Đã duyệt xong — tính lương',
    viec: {
      status: 'done', created_at: cach(240), accepted_at: cach(230),
      completed_at: cach(40), approved_at: cach(5), deadline: cach(20),
    },
  },
];

export default function ViecLifecycleDemo() {
  return (
    <div style={{ minHeight: '100dvh', background: '#e5ded4', padding: 20 }}>
      <div style={{ maxWidth: 460, margin: '0 auto', display: 'grid', gap: 16 }}>
        <h1 style={{ fontSize: 18, color: '#2c1d11' }}>Xem thử: Dải vòng đời 6 bước</h1>
        {CAC_VIEC.map((x) => (
          <div key={x.ten} style={{
            padding: 14, borderRadius: 16, background: '#fff',
            border: '1px solid #e4d0ba', boxShadow: '0 7px 20px rgba(58,37,23,.07)',
          }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#6b4f3b', marginBottom: 4 }}>{x.ten}</div>
            <VongDoiViec viec={x.viec} />
          </div>
        ))}
      </div>
    </div>
  );
}
