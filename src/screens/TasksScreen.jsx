import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { hasAnyRole } from '../lib/roles';
import { supabase } from '../lib/supabaseClient';
import { fetchAllProfiles } from '../lib/queries';
import { Tabs } from '../components/navigation/Tabs';
import { Input } from '../components/forms/Input';
import { Select } from '../components/forms/Select';
import { Button } from '../components/forms/Button';
import { DailyChecklistTab } from '../components/tasks/DailyChecklistTab';
import { AssignedTasksTab } from '../components/tasks/AssignedTasksTab';
import { AdhocTasksTab } from '../components/tasks/AdhocTasksTab';
import CongViecV2 from '../components/tasks/v2/CongViecV2';
import { ProductionLogModal } from '../components/ProductionLogModal';
import { ProductionLogList } from '../components/ProductionLogList';

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
  const [showProductionLog, setShowProductionLog] = useState(false);
  const [showProductionLogList, setShowProductionLogList] = useState(false);
  const [productionLogRefreshKey, setProductionLogRefreshKey] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);

  // Giao diện Công việc bản mới (theo mockup): tự chọn góc nhìn theo vai trò.
  // Giữ nút chuyển về bản cũ để nếu bản mới có vấn đề thì vẫn làm việc được,
  // không phải chờ sửa xong mới dùng lại được.
  const [banMoi, setBanMoi] = useState(true);

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header & Thanh điều hướng nhanh */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ font: 'var(--text-display-md)', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>
              {isViewingOtherStaff ? `Công việc · ${viewingStaffName}` : `Quản Lý Công Việc ${viewingStaffName ? `(${viewingStaffName})` : ''}`}
            </span>
            {viewingStation && (
              <span style={{ fontSize: 13, padding: '2px 8px', borderRadius: 'var(--radius-pill)', background: 'var(--surface-sunken)', color: 'var(--text-secondary)' }}>
                {viewingStation}
              </span>
            )}
          </div>
          <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>
            {isViewingOtherStaff ? `Đang xem và giao việc cho ${viewingStaffName}` : 'Tự tạo việc, giao việc cho nhân viên và theo dõi tiến độ'}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {isOwner && hasActiveFilter && (
            <Button
              variant="primary"
              size="sm"
              onClick={handleResetToOverview}
              style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}
            >
              🔄 ← Quay lại Tổng quan
            </Button>
          )}
          {isOwner && (
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('sumi-navigate', { detail: { tab: 'staff' } }))}
              style={{
                padding: '6px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)',
                background: 'var(--surface-card)', color: 'var(--text-primary)', font: 'var(--text-body-sm)',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
              }}
            >
              👥 Danh sách nhân viên
            </button>
          )}
          <Button variant="secondary" size="sm" onClick={() => setShowProductionLog(true)}>
            Ghi Sản Xuất
          </Button>
          <Button variant={showProductionLogList ? 'primary' : 'ghost'} size="sm" onClick={() => setShowProductionLogList((v) => !v)}>
            Đã ghi sản xuất {showProductionLogList ? '▲' : '▼'}
          </Button>
        </div>
      </div>

      {showProductionLogList && <ProductionLogList refreshKey={productionLogRefreshKey} />}

      {showProductionLog && (
        <ProductionLogModal
          onClose={() => setShowProductionLog(false)}
          onSaved={() => { setShowProductionLog(false); setProductionLogRefreshKey((k) => k + 1); }}
        />
      )}

      {/* Bộ lọc Khâu & Chọn nhân viên */}
      {isOwner && (
        <div style={{
          display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end',
          padding: '12px', background: 'var(--surface-card)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)'
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
            <Button variant="ghost" size="sm" onClick={handleResetToOverview} style={{ alignSelf: 'flex-end', marginBottom: 2 }}>
              Xóa bộ lọc
            </Button>
          )}
        </div>
      )}

      {tab === 'assigned' && (
        <button
          onClick={() => setBanMoi((x) => !x)}
          style={{
            alignSelf: 'flex-start', minHeight: 40, padding: '0 14px', borderRadius: 12,
            border: '1.5px solid var(--border-default)', background: 'var(--surface-card)',
            color: 'var(--text-secondary)', fontWeight: 700, fontSize: 13, cursor: 'pointer',
          }}
        >
          {banMoi ? '↩ Dùng bản cũ' : '✨ Dùng giao diện mới'}
        </button>
      )}

      {/* Tabs công việc */}
      <Tabs
        tabs={[
          { key: 'assigned', label: 'Việc được giao' },
          { key: 'daily', label: 'Hằng ngày' },
          { key: 'adhoc', label: 'Phát sinh & Báo cáo' }
        ]}
        active={tab}
        onChange={setTab}
      />

      {/* Nội dung theo tab */}
      {!viewingStaffId ? (
        <div style={{ font: 'var(--text-body)', color: 'var(--text-muted)', padding: 20, textAlign: 'center' }}>
          Chọn một nhân viên hoặc bấm "Quay lại Tổng quan" để xem việc.
        </div>
      ) : (
        <React.Fragment>
          {tab === 'assigned' && banMoi && (
            <CongViecV2
              profile={profile}
              staffList={staffList}
              onMoGiaoViec={() => setBanMoi(false)}
            />
          )}
          {tab === 'assigned' && !banMoi && (
            <AssignedTasksTab
              refreshKey={refreshKey}
              profile={profile}
              isOwner={isOwner}
              viewingStaffId={viewingStaffId}
              viewingStaffName={viewingStaffName}
              staffList={staffList}
              orderCodeFilter={orderCodeFilter}
            />
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
          {tab === 'adhoc' && (
            <AdhocTasksTab
              refreshKey={refreshKey}
              profile={profile}
              isOwner={isOwner}
              viewingStaffId={viewingStaffId}
              viewingStaffName={viewingStaffName}
              orderCodeFilter={orderCodeFilter}
            />
          )}
        </React.Fragment>
      )}
    </div>
  );
}
