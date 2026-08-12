import React from 'react';
import { Button } from '../components/forms/Button';

export default function PendingApprovalScreen({ profile, onSignOut }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-app)', padding: 20 }}>
      <div style={{ maxWidth: 360, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
        <div style={{ fontSize: 40 }}>⏳</div>
        <div style={{ font: 'var(--text-title)', color: 'var(--text-primary)' }}>Tài khoản đang chờ duyệt</div>
        <div style={{ font: 'var(--text-body)', color: 'var(--text-secondary)' }}>
          Xin chào {profile?.full_name || ''}! Tài khoản của bạn đã đăng ký thành công, nhưng cần Chủ sở hữu duyệt và gán quyền trước khi có thể sử dụng.
        </div>
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>
          Nhắn Chủ sở hữu để họ vào Thiết Lập → Quản trị → Nhân viên & phân quyền duyệt cho bạn.
        </div>
        <Button variant="secondary" size="sm" onClick={onSignOut}>Đăng xuất</Button>
      </div>
    </div>
  );
}
