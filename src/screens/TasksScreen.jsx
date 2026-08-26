import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { hasAnyRole } from '../lib/roles';
import { supabase } from '../lib/supabaseClient';
import { fetchAllProfiles } from '../lib/queries';
import { Input } from '../components/forms/Input';
import { Select } from '../components/forms/Select';
import { DailyChecklistTab } from '../components/tasks/DailyChecklistTab';
import CongViecV2 from '../components/tasks/v2/CongViecV2';
import '../styles/cong-viec.css';

function StaffPicker({ label, value, onChange, options }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef(null);

  useEffect(() => {
    const onClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const selected = options.find((o) => o.value === value);
  const filtered = query.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase()))
    : options;

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <label style={{ display: 'block', font: 'var(--text-body-sm)', color: 'var(--text-secondary)', marginBottom: 4 }}>
        {label}
      </label>
      <input
        type="text"
        value={open ? query : (selected?.label || '')}
        placeholder="Gõ tên để tìm..."
        onFocus={() => { setOpen(true); setQuery(''); }}
        onChange={(e) => setQuery(e.target.value)}
        style={{
          width: '100%', padding: '8px 10px', borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-subtle)', background: 'var(--surface-card)',
          color: 'var(--text-primary)', font: 'var(--text-body-sm)', boxSizing: 'border-box'
        }}
      />
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, marginTop: 4,
          background: 'var(--surface-card)', border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md, 0 4px 12px rgba(0,0,0,.15))',
          maxHeight: 260, overflowY: 'auto'
        }}>
          {filtered.length === 0 && (
            <div style={{ padding: '10px 12px', color: 'var(--text-muted)', font: 'var(--text-body-sm)' }}>
              Không tìm thấy nhân viên
            </div>
          )}
          {filtered.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => { onChange(o.value); setOpen(false); setQuery(''); }}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px',
                border: 'none', background: o.value === value ? 'var(--surface-sunken)' : 'transparent',
                color: 'var(--text-primary)', font: 'var(--text-body-sm)', cursor: 'pointer'
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const STATION_OPTIONS = [
  { value: '', label: 'Tất cả khâu (Tổng quan)' },
  { value: 'bakery', label: 'Bakery' },
  { value: 'nong', label: 'Bếp nóng' },
  { value: 'lanh', label: 'Bếp lạnh' },
  { value: 'xuong41', label: 'Xưởng 41' },
  { value: 'xuong42', label: 'Xưởng 42' },
];

export default function TasksScreen() {
  const { profile } = useAuth();
  const isOwner = hasAnyRole(profile, ['owner', 'admin']);
  const [tab, setTab] = useState('assigned');
  const [staffList, setStaffList] = useState([]);
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [stationFilter, setStationFilter] = useState('');
  const [orderCodeFilter, setOrderCodeFilter] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [metrics, setMetrics] = useState({ dangLam: 0, choDuyet: 0, xongHomNay: 0 });


  useEffect(() => {
    // Luôn tải danh sách nhân viên (không chỉ khi là chủ) để nhân viên
    // thường cũng suy ra được tên "Giao bởi / Người nhận" trong việc được giao.
    fetchAllProfiles().then((data) => {
      const approved = data.filter((p) => p.approved && p.active !== false && p.full_name);
      setStaffList(approved);
      if (!isOwner) return;
      const requested = sessionStorage.getItem('sumi_managed_staff_id');
      if (requested && approved.some((p) => p.id === requested)) {
        setSelectedStaffId(requested);
        setTab('assigned');
      } else {
        // Mặc định chọn chính mình (Quản lý) để có thể tự tạo việc / checklist hoặc xem việc của mình
        setSelectedStaffId(profile?.id || approved[0]?.id || '');
      }
      sessionStorage.removeItem('sumi_managed_staff_id');
    }).catch(() => {});
  }, [isOwner, profile?.id]);

  useEffect(() => {
    const channel = supabase
      .channel('tasks-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => setRefreshKey((k) => k + 1))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_completions' }, () => setRefreshKey((k) => k + 1))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_templates' }, () => setRefreshKey((k) => k + 1))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // Bấm vào tin nhắn "được giao việc" -> cuộn tới đúng đầu việc và làm nổi bật.
  // Thử lại vài lần vì danh sách việc có thể chưa tải xong lúc vừa chuyển trang.
  useEffect(() => {
    const go = (e) => {
      const id = e.detail?.entityId;
      if (!id) return;
      let n = 0;
      const tim = () => {
        const el = document.getElementById(`task-item-${id}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.style.transition = 'box-shadow .3s';
          el.style.boxShadow = '0 0 0 4px rgba(217,107,67,.55)';
          setTimeout(() => { el.style.boxShadow = ''; }, 2600);
          return;
        }
        if (++n < 20) setTimeout(tim, 250);
      };
      tim();
    };
    window.addEventListener('sumi-open-task', go);
    return () => window.removeEventListener('sumi-open-task', go);
  }, []);

  const filteredStaff = stationFilter ? staffList.filter((p) => p.station === stationFilter) : staffList;

  useEffect(() => {
    if (!isOwner) return;
    if (stationFilter && selectedStaffId && selectedStaffId !== profile?.id && !filteredStaff.some((p) => p.id === selectedStaffId)) {
      setSelectedStaffId(filteredStaff[0]?.id || profile?.id || '');
    }
  }, [stationFilter, staffList, profile?.id]);

  // Reset về trạng thái tổng quan ban đầu
  const handleResetToOverview = () => {
    setStationFilter('');
    setOrderCodeFilter('');
    setSelectedStaffId(profile?.id || '');
    setTab('assigned');
  };

  const isViewingOtherStaff = isOwner && selectedStaffId && selectedStaffId !== profile?.id;
  const viewingStaffId = isOwner ? (selectedStaffId || profile?.id) : profile?.id;
  const viewingStaff = isOwner ? (staffList.find((p) => p.id === selectedStaffId) || (selectedStaffId === profile?.id ? profile : null)) : profile;
  const viewingStaffName = viewingStaff?.full_name || (viewingStaffId === profile?.id ? 'Chính tôi' : '');
  const viewingStation = viewingStaff?.station || '';

  const hasActiveFilter = !!stationFilter || !!orderCodeFilter || isViewingOtherStaff;

  const staffOptions = [
    ...(profile?.id ? [{ value: profile.id, label: `👤 Việc của tôi (${profile.full_name || 'Quản lý'})` }] : []),
    ...filteredStaff.filter((p) => p.id !== profile?.id).map((p) => ({
      value: p.id,
      label: `${p.full_name}${p.station ? ` (${p.station})` : ''}`
    })),
  ];

  const tenHienThi = profile?.full_name || 'Bạn';
  const chuCai = tenHienThi.trim().charAt(0).toUpperCase() || '?';

  return (
    <div className="cv-wrap" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Hero — mockup task-lifecycle-v2-approved: cam cho thợ, xanh cho Quản lý/Giám đốc */}
      <div className={`cv-hero${isOwner ? ' blue' : ''}`}>
        <div className="cv-hero-top">
          <div className="cv-hero-identity">
            <div className="cv-hero-avatar">{chuCai}</div>
            <div style={{ minWidth: 0 }}>
              <p className="cv-hero-eyebrow">{isOwner ? 'Quản lý / Giám đốc' : 'Công việc của tôi'}</p>
              <h1 className="cv-hero-name">
                {isViewingOtherStaff ? `Đang xem: ${viewingStaffName}` : tenHienThi}
              </h1>
            </div>
          </div>
          <button
            type="button"
            className="cv-hero-bell"
            title="Thông báo việc"
            onClick={() => window.dispatchEvent(new CustomEvent('sumi-navigate', { detail: { tab: 'notifications' } }))}
          >
            🔔
          </button>
        </div>
        <div className="cv-hero-metrics">
          <div className="cv-hero-metric"><strong>{metrics.dangLam}</strong><span>Đang làm</span></div>
          <div className="cv-hero-metric"><strong>{metrics.choDuyet}</strong><span>Chờ duyệt</span></div>
          <div className="cv-hero-metric"><strong>{metrics.xongHomNay}</strong><span>Xong hôm nay</span></div>
        </div>
      </div>

      {/* Hàng thao tác nhanh */}
      {(isOwner || hasActiveFilter) && (
        <div className="cv-quick-actions">
          {isOwner && (
            <button
              className="cv-btn outline"
              onClick={() => window.dispatchEvent(new CustomEvent('sumi-navigate', { detail: { tab: 'staff' } }))}
            >
              👥 Danh sách nhân viên
            </button>
          )}
          {isOwner && hasActiveFilter && (
            <button className="cv-btn primary" onClick={handleResetToOverview}>🔄 Quay lại Tổng quan</button>
          )}
        </div>
      )}

      {/* Tabs dạng viên thuốc */}
      <div className="cv-pill-tabs">
        <button className={`cv-pill-tab${tab === 'assigned' ? ' active' : ''}`} onClick={() => setTab('assigned')}>Việc được giao</button>
        <button className={`cv-pill-tab${tab === 'daily' ? ' active' : ''}`} onClick={() => setTab('daily')}>Hằng ngày</button>
      </div>

      {/* Bộ lọc Khâu & Chọn nhân viên — chỉ Hằng ngày còn cần (Việc được giao tự phân quyền qua RLS) */}
      {isOwner && tab === 'daily' && (
        <div style={{
          display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end',
          padding: '12px', background: 'var(--surface-card)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)',
          marginBottom: 14
        }}>
          <div style={{ flex: '1 1 180px', minWidth: 150 }}>
            <Select
              label="Lọc theo khâu"
              value={stationFilter}
              onChange={(e) => setStationFilter(e.target.value)}
              options={STATION_OPTIONS}
            />
          </div>
          <div style={{ flex: '1 1 240px', minWidth: 180 }}>
            <StaffPicker
              label="Người thực hiện"
              value={selectedStaffId || profile?.id || ''}
              onChange={setSelectedStaffId}
              options={staffOptions}
            />
          </div>
          <div style={{ flex: '1 1 160px', minWidth: 130 }}>
            <Input
              label="Mã đơn"
              placeholder="VD: DH001"
              value={orderCodeFilter}
              onChange={(e) => setOrderCodeFilter(e.target.value)}
            />
          </div>
          {hasActiveFilter && (
            <button className="cv-btn outline" onClick={handleResetToOverview} style={{ flex: '0 0 auto' }}>Xóa bộ lọc</button>
          )}
        </div>
      )}

      {/* Nội dung theo tab */}
      {!viewingStaffId ? (
        <div className="cv-empty">Chọn một nhân viên hoặc bấm "Quay lại Tổng quan" để xem việc.</div>
      ) : (
        <React.Fragment>
          {tab === 'assigned' && (
            <CongViecV2 profile={profile} staffList={staffList} onMetrics={setMetrics} />
          )}
          {tab === 'daily' && (
            <DailyChecklistTab
              refreshKey={refreshKey}
              profile={profile}
              isOwner={isOwner}
              viewingStaffId={viewingStaffId}
              viewingStaffName={viewingStaffName}
              viewingStation={viewingStation}
            />
          )}
        </React.Fragment>
      )}
    </div>
  );
}
