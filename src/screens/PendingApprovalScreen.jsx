import React from 'react';
import { Button } from '../components/forms/Button';
import { IconClock } from '../components/icons/FrogIcons';

export default function PendingApprovalScreen({ profile, onSignOut, reason = 'pending' }) {
  const isDeactivated = reason === 'deactivated';
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-app)', padding: 20 }}>
      <div style={{ maxWidth: 360, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
        <div style={{ color: 'var(--brand-caramel)' }}><IconClock size={40} /></div>
        <div style={{ font: 'var(--text-title)', color: 'var(--text-primary)' }}>
          {isDeactivated ? 'Tài khoản đã bị khoá' : 'Tài khoản đang chờ duyệt'}
        </div>
        <div style={{ font: 'var(--text-body)', color: 'var(--text-secondary)' }}>
          {isDeactivated
            ? `Xin chào ${profile?.full_name || ''}! Tài khoản của bạn đã bị Chủ sở hữu/Quản trị khoá và không thể sử dụng nữa.`
            : `Xin chào ${profile?.full_name || ''}! Tài khoản của bạn đã đăng ký thành công, nhưng cần Chủ sở hữu duyệt và gán quyền trước khi có thể sử dụng.`}
        </div>
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>
          {isDeactivated
            ? 'Nếu đây là nhầm lẫn, liên hệ Chủ sở hữu để mở lại tài khoản.'
            : 'Nhắn Chủ sở hữu để họ vào Thiết Lập → Quản trị → Nhân viên & phân quyền duyệt cho bạn.'}
        </div>
        <Button variant="secondary" size="sm" onClick={onSignOut}>Đăng xuất</Button>
      </div>
    </div>
  );
}
