import React, { useEffect, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { hasAnyRole } from '../lib/roles';
import { supabase } from '../lib/supabaseClient';
import { fetchAllProfiles } from '../lib/queries';
import { Tabs } from '../components/navigation/Tabs';
import { Input } from '../components/forms/Input';
import { Select } from '../components/forms/Select';
import { DailyChecklistTab } from '../components/tasks/DailyChecklistTab';
import { AssignedTasksTab } from '../components/tasks/AssignedTasksTab';
import { AdhocTasksTab } from '../components/tasks/AdhocTasksTab';

const STATION_OPTIONS = [
  { value: 'bakery', label: 'Bakery' },
  { value: 'nong', label: 'Bếp nóng' },
  { value: 'lanh', label: 'Bếp lạnh' },
  { value: 'xuong41', label: 'Xưởng 41' },
  { value: 'xuong42', label: 'Xưởng 42' },
];

export default function TasksScreen() {
  const { profile } = useAuth();
  const isOwner = hasAnyRole(profile, ['owner', 'admin']);
  const [tab, setTab] = useState('daily');
  const [staffList, setStaffList] = useState([]);
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [stationFilter, setStationFilter] = useState('');
  const [orderCodeFilter, setOrderCodeFilter] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!isOwner) return;
    fetchAllProfiles().then((data) => {
      const approved = data.filter((p) => p.approved && p.full_name);
      setStaffList(approved);
      setSelectedStaffId((prev) => prev || approved[0]?.id || '');
    }).catch(() => {});
  }, [isOwner]);

  useEffect(() => {
    const channel = supabase
      .channel('tasks-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => setRefreshKey((k) => k + 1))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_completions' }, () => setRefreshKey((k) => k + 1))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_templates' }, () => setRefreshKey((k) => k + 1))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const filteredStaff = stationFilter ? staffList.filter((p) => p.station === stationFilter) : staffList;

  // Đổi bộ lọc khâu mà nhân viên đang chọn không còn trong danh sách → chọn lại người đầu tiên.
  useEffect(() => {
    if (!isOwner) return;
    if (selectedStaffId && !filteredStaff.some((p) => p.id === selectedStaffId)) {
      setSelectedStaffId(filteredStaff[0]?.id || '');
    }
  }, [stationFilter, staffList]);

  const viewingStaffId = isOwner ? selectedStaffId : profile?.id;
  const viewingStaffName = isOwner ? (staffList.find((p) => p.id === selectedStaffId)?.full_name || '') : profile?.full_name;
  const viewingStation = isOwner ? (staffList.find((p) => p.id === selectedStaffId)?.station || '') : profile?.station;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ font: 'var(--text-display-md)', color: 'var(--text-primary)' }}>Quản Lý Công Việc</div>
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Việc hằng ngày, việc được giao, việc phát sinh</div>
      </div>
      {isOwner && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Select label="Khâu" value={stationFilter} onChange={(e) => setStationFilter(e.target.value)} options={STATION_OPTIONS} placeholder="Tất cả khâu" style={{ maxWidth: 200 }} />
          <Select label="Nhân viên" value={selectedStaffId} onChange={(e) => setSelectedStaffId(e.target.value)} options={filteredStaff.map((p) => ({ value: p.id, label: p.full_name }))} placeholder="Chọn nhân viên" style={{ maxWidth: 240 }} />
          <Input label="Lọc theo mã đơn" placeholder="VD: DH001" value={orderCodeFilter} onChange={(e) => setOrderCodeFilter(e.target.value)} style={{ maxWidth: 200 }} />
        </div>
      )}
      <Tabs tabs={[{ key: 'daily', label: 'Hằng ngày' }, { key: 'assigned', label: 'Được giao' }, { key: 'adhoc', label: 'Phát sinh' }]} active={tab} onChange={setTab} />
      {!viewingStaffId ? (
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Chọn nhân viên để xem việc.</div>
      ) : (
        <React.Fragment>
          {tab === 'daily' && <DailyChecklistTab refreshKey={refreshKey} profile={profile} isOwner={isOwner} viewingStaffId={viewingStaffId} viewingStaffName={viewingStaffName} viewingStation={viewingStation} />}
          {tab === 'assigned' && <AssignedTasksTab refreshKey={refreshKey} profile={profile} isOwner={isOwner} viewingStaffId={viewingStaffId} viewingStaffName={viewingStaffName} staffList={staffList} orderCodeFilter={orderCodeFilter} />}
          {tab === 'adhoc' && <AdhocTasksTab refreshKey={refreshKey} profile={profile} isOwner={isOwner} viewingStaffId={viewingStaffId} viewingStaffName={viewingStaffName} orderCodeFilter={orderCodeFilter} />}
        </React.Fragment>
      )}
    </div>
  );
}
