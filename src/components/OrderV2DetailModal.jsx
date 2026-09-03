import React, { useEffect, useState } from 'react';
import EditOrderModal from './orders/EditOrderModal';
import { supabase } from '../lib/supabaseClient';
import { assignOrderPackage, acceptOrderPackage } from '../lib/featureFlags';
import { useAuth } from '../lib/AuthContext';
import PackageTaskPanel from './PackageTaskPanel';
import { CommentSection } from './CommentSection';
import OrderStatusTimeline from './OrderStatusTimeline';
import { MapPin, Camera, Trash2 } from 'lucide-react';
import { hasAnyRole } from '../lib/roles';
import { deleteOrderByDirector } from '../lib/bossOverviewV3';
import { CAKE_FILLINGS } from '../lib/cakePricing';
import { canViewSchoolOrder, canViewMacaronPrice } from '../lib/orderVisibility';
import { broadcastEvent, BroadcastEvents } from '../lib/realtimeSync';
import { getCurrentPositionSmart } from '../lib/geo';
import { showToast } from '../lib/toast';
import { addFinishedGoodsEntryV2 } from '../lib/queries';
import { branchForOrderType } from '../lib/internalOrders';
import { IconCake, IconBakery, IconMacaron, IconSchool, IconTeabreak, IconMixed } from './icons/FrogIcons';
import StarRateBar from './StarRateBar';
import { PhotoField } from './PhotoField';
import { CameraPhotoField } from './CameraPhotoField';
import { CARRIER_OPTIONS, SHIPMENT_STATUS_OPTIONS, shipmentStatusMeta, carrierLabel, fetchActiveShipmentForOrder, handOffToCarrier, updateShipmentStatus } from '../lib/thirdPartyShipping';

const ORDER_TYPE_ICONS = {
  cake: IconCake, bakery: IconBakery, macaron: IconMacaron, school: IconSchool, teabreak: IconTeabreak, mixed: IconMixed,
};

const ORDER_TYPE_LABELS = {
  cake: 'Bánh kem & Bánh lạnh',
  bakery: 'Bánh mặn & Bánh ngọt',
  macaron: 'Macaron',
  school: 'Trường học',
  teabreak: 'Teabreak',
  mixed: 'Đơn tổng hợp'
};

const PAYMENT_METHOD_LABELS = {
  cod: 'COD (thu khi giao)',
  bank_transfer: 'Chuyển khoản',
  cash: 'Tiền mặt'
};

const box = {
  padding: 16,
  border: '1px solid var(--border-default)',
  borderRadius: 18,
  background: 'var(--surface-card)',
  marginBottom: 12,
  boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
};

// Chuyển đổi specification JSON thành text tiếng Việt thân thiện, bỏ code tiếng Anh
function formatSpecificationLines(spec = {}) {
  if (!spec || typeof spec !== 'object') return [];
  const lines = [];

  // Bánh kem & bánh lạnh
  if (spec.size) {
    const sizeStr = String(spec.size).trim();
    lines.push(`Size: ${sizeStr}${isNaN(sizeStr) ? '' : 'cm'}`);
  }
  if (spec.content) {
    lines.push(`Chữ trên bánh: "${spec.content}"`);
  }
  if (spec.cake_line) {
    const label = spec.cake_line === 'cold_cake' ? 'Bánh lạnh (Bảo quản lạnh)' : 'Bánh kem trang trí';
    lines.push(`Dòng bánh: ${label}`);
  }
  if (spec.flavor) lines.push(`Vị / Nhân: ${spec.flavor}`);
  if (spec.colors?.length) lines.push(`Màu: ${spec.colors.join(', ')}`);
  if (spec.fillings?.length) lines.push(`Nhân: ${spec.fillings.join(', ')}`);
  if (spec.color) lines.push(`Ghi chú màu/nhân: ${spec.color}`);
  if (spec.cot) lines.push(`Cốt bánh: ${spec.cot}`);
  if (spec.candle) lines.push(`Loại nến: ${spec.candle}`);
  if (spec.filling) {
    const fillingLabel = CAKE_FILLINGS.find(f => f.value === spec.filling)?.label || spec.filling;
    lines.push(`Nhân/Mứt: ${fillingLabel}`);
  }

  // Bánh Trung Thu & Bakery
  if (spec.product_line === 'moon_cake' || spec.weight_gram || spec.egg_count !== undefined) {
    if (spec.weight_gram) lines.push(`Trọng lượng: ${spec.weight_gram}g`);
    if (spec.egg_count !== undefined && spec.egg_count !== null && spec.egg_count !== '') {
      lines.push(`${spec.egg_count} trứng`);
    }
    if (spec.flex_note) lines.push(`Ghi chú: ${spec.flex_note}`);
  }

  // Teabreak / School / Khác
  if (spec.catalog_specification) lines.push(`Quy cách: ${spec.catalog_specification}`);
  if (spec.group) lines.push(`Nhóm món: ${spec.group}`);
  if (spec.spec) lines.push(`Quy cách: ${spec.spec}`);
  if (spec.grade_note) lines.push(`Khối / Lớp: ${spec.grade_note}`);
  if (spec.packing) lines.push(`Đóng gói: ${spec.packing}`);
  if (spec.note) lines.push(`Ghi chú: ${spec.note}`);

  // Các thuộc tính tuỳ chỉnh khác (bỏ qua các trường hệ thống nội bộ tiếng Anh)
  const systemKeys = new Set(['product_flow', 'catalog_price', 'catalog_category', 'custom', 'size', 'content', 'cake_line', 'flavor', 'color', 'product_line', 'weight_gram', 'egg_count', 'flex_note', 'catalog_specification', 'group', 'spec', 'grade_note', 'packing', 'note', 'cot', 'candle', 'filling', 'is_ready_stock', 'colors', 'fillings', 'priceTier']);
  for (const [k, v] of Object.entries(spec)) {
    if (!systemKeys.has(k) && v !== null && v !== undefined && v !== '') {
      lines.push(`${k}: ${v}`);
    }
  }

  return lines;
}

export default function OrderV2DetailModal({ orderId, onClose, onChanged }) {
  const { profile } = useAuth();
  const [data, setData] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [units, setUnits] = useState([]);
  const [unit, setUnit] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [deletingOrder, setDeletingOrder] = useState(false);
  const [zoomImage, setZoomImage] = useState(null);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [showDeliveryModal, setShowDeliveryModal] = useState(false);
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [showAcceptPackageModal, setShowAcceptPackageModal] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState(null);
  const [selectedStaff, setSelectedStaff] = useState('');
  const [staffOptions, setStaffOptions] = useState([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [gpsCoords, setGpsCoords] = useState(null);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const cameraInputRef = React.useRef(null);
  // Chốt chặn Xác Minh Thanh Toán — mở ra NGAY SAU khi "Hoàn Thành Giao"
  // thành công, trước khi rời màn hình. Đơn đã completed nhưng chưa xác minh
  // thì KHÔNG tính vào Doanh thu thuần (xem fetchRevenueByChannel).
  const [showPaymentVerifyModal, setShowPaymentVerifyModal] = useState(false);
  const [verifyMethod, setVerifyMethod] = useState(null); // 'bank_transfer' | 'cod'
  const [verifyProofUrl, setVerifyProofUrl] = useState('');
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [verifyError, setVerifyError] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);
  // Hoàn thành đơn nội bộ -> đẩy thẳng lên Kho Thành Phẩm. Bắt buộc ảnh/ngày
  // SX/HSD theo đúng yêu cầu — dùng lại addFinishedGoodsEntryV2 đã có sẵn
  // (Khánh viết cho Nhập kho), không tạo đường ghi kho mới.
  const [showWarehouseForm, setShowWarehouseForm] = useState(false);
  const [showThirdPartyModal, setShowThirdPartyModal] = useState(false);
  const [showShipmentStatusModal, setShowShipmentStatusModal] = useState(false);
  const [tpCarrier, setTpCarrier] = useState('ghn');
  const [tpCarrierOther, setTpCarrierOther] = useState('');
  const [tpTrackingId, setTpTrackingId] = useState('');
  const [tpDriverName, setTpDriverName] = useState('');
  const [tpDriverPhone, setTpDriverPhone] = useState('');
  const [tpNotes, setTpNotes] = useState('');
  const [tpBusy, setTpBusy] = useState(false);
  const [tpError, setTpError] = useState('');
  const [whPhoto, setWhPhoto] = useState(null);
  const [whProductionDate, setWhProductionDate] = useState('');
  const [whExpiryDate, setWhExpiryDate] = useState('');
  const [whBusy, setWhBusy] = useState(false);
  const [whError, setWhError] = useState('');
  // Vỏ Macaron Hạnh Nhân chưa bơm nhân KHÔNG giữ được ở nhiệt độ thường —
  // theo yêu cầu thật: Xưởng 41 làm xong là phải chuyển ngay cho Bếp Lạnh,
  // không chờ ai "tạo đơn" thủ công. Đánh dấu ở bước Nhập kho vì đó là lúc
  // biết chắc mẻ này thuộc loại nào (cùng 1 luồng macaron có 2 loại hàng
  // khác nhau — trang trí xong bán được ngay, và vỏ hạnh nhân cần bơm nhân).
  const [isUnfilledShell, setIsUnfilledShell] = useState(false);

  const director = ['owner', 'admin'].includes(profile?.role) || (profile?.extra_roles || []).some(x => ['owner', 'admin'].includes(x));

  // Quyền sửa đơn KHÔNG đoán ở client nữa. Trước đây dòng này so `created_by_id`
  // — một cột không hề tồn tại (tên thật là `created_by`) — nên người tạo đơn
  // vĩnh viễn không sửa được đơn của chính mình, còn bếp trưởng thì sửa được
  // MỌI đơn kể cả đơn không được giao. Giờ hỏi thẳng database qua
  // `sumi_quyen_sua_don`, đúng hàm mà API sửa đơn dùng để chặn.
  const [quyenSua, setQuyenSua] = useState(null);

  const load = async () => {
    const [o, i, p, u, e, kpi, ops, att, changes, qs, ship] = await Promise.all([
      supabase.from('orders').select('id,order_code,order_type,status_v2,required_at,fulfillment_method_v2,address,note,created_by,created_by_name,created_at,confidentiality,version,ship_fee,deposit,payment_method,total,is_internal,target_store,discount_amount,promotion_note,tax_code,vat_amount,payment_verified,payment_verified_at,payment_proof_url,customers(name,phone)').eq('id', orderId).single(),
      supabase.from('order_items').select('id,name_snapshot,quantity,unit,specification,unit_price,display_order').eq('order_id', orderId).order('display_order'),
      supabase.from('order_work_packages_readable').select('id,unit_id,status,due_at,accepted_at,completed_at,version,organization_units(name,code),work_package_items(order_item_id,quantity)').eq('order_id', orderId),
      supabase.from('organization_units').select('id,name,code').eq('unit_type', 'kitchen').eq('active', true),
      supabase.from('domain_events').select('id,event_type,occurred_at,payload').eq('entity_type', 'order').eq('entity_id', orderId).order('occurred_at', { ascending: false }),
      supabase.from('kpi_logs').select('id,event_type,created_at,staff_name,staff_id,gps_latitude,gps_longitude,photo_url,notes').eq('order_id', orderId).order('created_at', { ascending: false }),
      supabase.from('order_operations_list').select('production_started_at,production_completed_at,production_minutes,delivery_started_at,delivery_completed_at,delivery_minutes,delivery_provider,provider_label,shipping_fee,driver_name,is_overdue,overdue_stage,overdue_minutes,was_late,late_staff_names').eq('id', orderId).single(),
      supabase.from('order_attachments').select('id,attachment_type,storage_path,mime_type,created_at').eq('order_id', orderId).order('created_at', { ascending: false }),
      supabase.from('order_change_logs').select('id,field_name,old_value,new_value,edited_by_name,created_at').eq('order_id', orderId).order('created_at', { ascending: false }),
      supabase.rpc('sumi_quyen_sua_don', { p_order_id: orderId }),
      // Người giao hàng thật (staff_id) để Giám đốc đánh giá — order_operations_list
      // chỉ có driver_name (text), không có id. Có thể ra nhiều dòng nếu đơn có
      // nhiều mẻ bếp, nhưng thông tin shipper là như nhau ở mọi dòng nên lấy dòng đầu.
      supabase.from('order_lateness_detail').select('shipper_staff_id,shipper_staff_name,shipper_delivered_at').eq('order_id', orderId).limit(1),
    ]);

    setQuyenSua(qs?.data || null);

    if (o.error) throw o.error;

    // Lấy URL xem ảnh cho các file đính kèm
    const resolvedAttachments = await Promise.all((att.data || []).map(async (a) => {
      let url = '';
      if (a.storage_path) {
        try {
          const { data: signed } = await supabase.storage.from('uploads').createSignedUrl(a.storage_path, 86400);
          url = signed?.signedUrl || supabase.storage.from('uploads').getPublicUrl(a.storage_path).data?.publicUrl;
        } catch {
          url = supabase.storage.from('uploads').getPublicUrl(a.storage_path).data?.publicUrl || '';
        }
      }
      return { ...a, url };
    }));

    let currentPackages = p.data || [];

    // Đội Vận Tải Ảo — chỉ có ý nghĩa khi đơn đã qua Kho Thành Phẩm; bỏ qua
    // truy vấn cho các trạng thái sớm hơn để đỡ tốn round-trip.
    let thirdPartyShipment = null;
    if (['ready_for_fulfillment', 'in_delivery', 'completed'].includes(o.data?.status_v2)) {
      try { thirdPartyShipment = await fetchActiveShipmentForOrder(orderId); } catch { /* không chặn load đơn nếu lỗi */ }
    }

    setData({
      order: o.data,
      items: i.data || [],
      packages: currentPackages,
      events: e.data || [],
      kpiLogs: kpi.data || [],
      operations: ops.data || {},
      shipper: (ship.data && ship.data[0]) || null,
      thirdPartyShipment,
      changeHistory: (changes.data || []).map(c => ({
        ...c,
        editor_name: c.edited_by_name,
        field_name: c.field_name
      }))
    });
    setAttachments(resolvedAttachments);
    setUnits(u.data || []);
  };

  useEffect(() => {
    load().catch(x => setError(x.message));
  }, [orderId]);

  useEffect(() => {
    if (!selectedPackage?.unit_id) { setStaffOptions([]); return; }
    setStaffLoading(true);
    setSelectedStaff('');
    supabase.from('profile_assignments')
      .select('profile_id, profiles!inner(id, full_name, active)')
      .eq('unit_id', selectedPackage.unit_id)
      .is('valid_to', null)
      .eq('profiles.active', true)
      .then(({ data: rows, error: err }) => {
        if (err) { setStaffOptions([]); setStaffLoading(false); return; }
        const list = (rows || [])
          .map(r => r.profiles)
          .filter(Boolean)
          .filter((p, i, arr) => arr.findIndex(x => x.id === p.id) === i);
        setStaffOptions(list);
        setStaffLoading(false);
      });
  }, [selectedPackage?.unit_id]);

  // Số lượng CÒN LẠI CHƯA PHÂN của 1 món — cộng dồn qua mọi work package chưa
  // huỷ đã có (bếp chính + mọi bếp phối hợp trước đó). RPC assign_order_package
  // tự chặn nếu tổng phân bổ vượt số lượng đặt (đúng, tránh sản xuất dư) —
  // trước đây bug ở CLIENT: luôn gửi nguyên số lượng gốc của cả đơn cho MỌI
  // bếp phối hợp mới, nên bếp chính đã nhận đủ 100% thì bếp phối hợp nào
  // thêm sau cũng bị RPC từ chối ngay ("allocated quantity exceeds order
  // quantity") — không phải lỗi state null/undefined như tưởng ban đầu.
  const remainingQtyForItem = (itemId) => {
    const item = data.items.find(x => x.id === itemId);
    if (!item) return 0;
    const allocated = (data.packages || [])
      .filter(p => p.status !== 'cancelled')
      .reduce((sum, p) => sum + (p.work_package_items || [])
        .filter(wpi => wpi.order_item_id === itemId)
        .reduce((s, wpi) => s + Number(wpi.quantity || 0), 0), 0);
    return Math.max(0, Number(item.quantity || 0) - allocated);
  };

  const assign = async () => {
    setBusy(true); setError('');
    try {
      const itemsToAssign = data.items
        .map(x => ({ order_item_id: x.id, quantity: remainingQtyForItem(x.id) }))
        .filter(x => x.quantity > 0);
      if (itemsToAssign.length === 0) {
        setError('Đơn này đã phân hết số lượng cho các bếp — không còn gì để thêm bếp phối hợp.');
        setBusy(false);
        return;
      }
      const {error: assignErr} = await supabase.rpc('assign_order_package',{
        p_idempotency_key: idempotencyKey + '-assign-' + unit,
        p_order_id: orderId,
        p_unit_id: unit,
        p_due_at: data.order.required_at,
        p_items: itemsToAssign,
        p_expected_version: data.order.version
      });
      if(assignErr) throw assignErr;
      setUnit('');
      await load();
      onChanged?.();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const accept = async (p) => {
    setBusy(true); setError('');
    try {
      const {error: acceptErr} = await supabase.rpc('accept_order_package',{
        p_idempotency_key: idempotencyKey + '-accept-' + p.id,
        p_package_id: p.id,
        p_expected_version: p.version
      });
      if(acceptErr) throw acceptErr;
      await load();
      onChanged?.();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const markReadyStock = async () => {
    setBusy(true); setError('');
    try {
      const { error } = await supabase.rpc('mark_order_ready_from_stock', { p_order_id: orderId });
      if (error) throw error;
      await load();
      onChanged?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const openThirdPartyModal = () => {
    setTpCarrier('ghn'); setTpCarrierOther(''); setTpTrackingId('');
    setTpDriverName(''); setTpDriverPhone(''); setTpNotes(''); setTpError('');
    setShowThirdPartyModal(true);
  };

  const submitHandOffToCarrier = async () => {
    setTpBusy(true); setTpError('');
    try {
      await handOffToCarrier(orderId, {
        carrier: tpCarrier,
        carrierOtherName: tpCarrier === 'other' ? tpCarrierOther : null,
        trackingId: tpTrackingId,
        driverName: tpDriverName,
        driverPhone: tpDriverPhone,
        notes: tpNotes,
      });
      setShowThirdPartyModal(false);
      await load();
      onChanged?.();
    } catch (e) {
      setTpError(e.message);
    } finally {
      setTpBusy(false);
    }
  };

  const submitShipmentStatus = async (status) => {
    if (!data?.thirdPartyShipment?.id) return;
    setTpBusy(true); setTpError('');
    try {
      await updateShipmentStatus(data.thirdPartyShipment.id, status, tpNotes);
      setShowShipmentStatusModal(false);
      await load();
      onChanged?.();
    } catch (e) {
      setTpError(e.message);
    } finally {
      setTpBusy(false);
    }
  };

  const handleDeleteOrder = async () => {
    if (deletingOrder) return;
    if (!window.confirm('Xóa hẳn đơn hàng này? Toàn bộ sản phẩm/phân công/lịch sử liên quan sẽ mất vĩnh viễn, không khôi phục được.')) return;
    setDeletingOrder(true);
    setError('');
    try {
      await deleteOrderByDirector(orderId);
      onChanged?.();
      onClose?.();
    } catch (e) {
      setError(e.message);
      setDeletingOrder(false);
    }
  };

  const approvePackage = async (p, photoFile = null) => {
    setBusy(true); setError('');
    try {
      let photoPath = null;
      if (photoFile) {
        const cleanExt = (photoFile.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
        photoPath = `orders/${orderId}/production/${crypto.randomUUID()}.${cleanExt}`;
        const {error: upErr} = await supabase.storage.from('uploads').upload(photoPath, photoFile, { contentType: photoFile.type || 'image/jpeg' });
        if (upErr) throw upErr;
      }
      const {error} = await supabase.rpc('complete_kitchen_work_package_with_proof', {
        p_package_id: p.id,
        p_proof_storage_path: photoPath
      });
      if (error) {
        const {error: fallbackErr} = await supabase.rpc('approve_work_package_completion', {
          p_idempotency_key: idempotencyKey + '-approve-' + p.id,
          p_package_id: p.id,
          p_expected_version: p.version
        });
        if(fallbackErr) throw fallbackErr;
      }
      await load();
      onChanged?.();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const captureGPS = async () => {
    if (!navigator.geolocation) {
      setError('Thiết bị không hỗ trợ định vị GPS');
      return;
    }
    setError('');
    // Thử GPS độ chính xác cao trước (tối đa 6s, dùng lại vị trí cache trong
    // 3s để phản hồi tức thì) — quá giờ thì tự hạ xuống định vị mạng, không
    // chặn nhân viên chờ vô thời hạn.
    const pos = await getCurrentPositionSmart({
      onDegraded: () => setError('GPS chính xác cao chậm, đang dùng định vị mạng thay thế...'),
    });
    if (pos) {
      setGpsCoords(pos);
      setError('');
    } else {
      setError('Không lấy được vị trí. Vui lòng cấp quyền định vị và thử lại.');
    }
  };

  // Tự lấy GPS ngay khi mở "Nhận Giao"/"Hoàn Thành Giao" thay vì bắt buộc phải
  // bấm nút "Bấm để lấy GPS hiện tại" — nhân viên hay bỏ qua bước bấm tay, dẫn
  // tới hoàn thành đơn bị chặn ở bước cuối vì tưởng đã có GPS mà thực ra chưa.
  useEffect(() => {
    if ((showDeliveryModal || showCompletionModal) && !gpsCoords) captureGPS();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDeliveryModal, showCompletionModal]);

  const capturePhoto = async () => {
    if (cameraInputRef.current) {
      cameraInputRef.current.click();
    }
  };

  // Đơn nội bộ đã sản xuất xong (status_v2='ready_for_fulfillment') -> bấm
  // "Nhập kho thành phẩm" bắt buộc ảnh + ngày SX + HSD, ghi từng loại bánh
  // trong đơn vào finished_goods_stock (dùng đúng hàm Nhập kho có sẵn), rồi
  // đóng đơn (completed) — không đẩy qua luồng giao hàng nữa vì bản Phase 1
  // này coi "nhập kho" là bước cuối của đơn sản xuất mới.
  const completeInternalOrderToWarehouse = async () => {
    if (!whPhoto) { setWhError('Bắt buộc chụp ảnh thành phẩm.'); return; }
    if (!whProductionDate) { setWhError('Bắt buộc nhập ngày sản xuất.'); return; }
    if (!whExpiryDate) { setWhError('Bắt buộc nhập hạn sử dụng.'); return; }
    setWhBusy(true); setWhError('');
    try {
      const cleanExt = (whPhoto.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
      const photoPath = `internal-orders/${orderId}/warehouse/${crypto.randomUUID()}.${cleanExt}`;
      const { error: upErr } = await supabase.storage.from('uploads').upload(photoPath, whPhoto, { contentType: whPhoto.type || 'image/jpeg' });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from('uploads').getPublicUrl(photoPath);
      const photoUrl = urlData.publicUrl;

      const staffName = profile?.full_name || profile?.email;
      for (const item of data.items) {
        const productId = item.product_id || null;
        const productName = item.name_snapshot || item.name || 'Sản phẩm';
        // Xưởng 41 đếm sản lượng vỏ theo CẶP (2 mặt bánh), nhưng 1 cặp vỏ =
        // đúng 1 cái bánh hoàn chỉnh sau khi Bếp Lạnh bơm nhân — số lượng
        // không đổi, chỉ đổi đơn vị hiển thị.
        const qty = Number(item.quantity) || 1;

        if (isUnfilledShell) {
          // Vỏ chưa bơm nhân: ghi vào Kho Bán Thành Phẩm (is_semi_finished),
          // giữ tồn THẬT (không tự xoá ngay) để Bếp Lạnh có hàng đợi thật
          // trong "Bán thành phẩm" của tab Macaron 41 — bấm "Đã hoàn thiện"
          // khi bơm nhân xong (xem CompleteSemiFinishedSheet trong
          // FinishedGoodsInventoryV2.jsx). Đồng thời vẫn là bản ghi sản
          // lượng/KPI thật cho Xưởng 41 ngay khi nhập.
          await addFinishedGoodsEntryV2({
            productId, productName: `${productName} (vỏ, chưa bơm nhân)`, size: item.specification?.size || null,
            branch: branchForOrderType(data.order.order_type), storeLocation: null, qty,
            productionDate: new Date(whProductionDate).toISOString(),
            expiryDate: new Date(whExpiryDate).toISOString(),
            photoUrl, staffName, isSemiFinished: true,
          });
        } else {
          await addFinishedGoodsEntryV2({
            productId, productName, size: item.specification?.size || null,
            branch: branchForOrderType(data.order.order_type),
            storeLocation: data.order.target_store || null,
            qty,
            productionDate: new Date(whProductionDate).toISOString(),
            expiryDate: new Date(whExpiryDate).toISOString(),
            photoUrl, staffName,
          });
        }
      }

      const { error: updErr } = await supabase.from('orders').update({ status_v2: 'completed', completed_at: new Date().toISOString() }).eq('id', orderId);
      if (updErr) throw updErr;

      setShowWarehouseForm(false);
      setWhPhoto(null); setWhProductionDate(''); setWhExpiryDate(''); setIsUnfilledShell(false);
      await load();
      onChanged?.();
    } catch (e) {
      setWhError(e.message || 'Không nhập kho được.');
    } finally {
      setWhBusy(false);
    }
  };

  const handlePhotoSelected = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhotoFile(file);
      const reader = new FileReader();
      reader.onload = (event) => {
        setPhotoPreview(event.target?.result);
      };
      reader.readAsDataURL(file);
    }
  };

  // Sau khi một thao tác đã THÀNH CÔNG: làm mới danh sách, đóng hộp chi tiết
  // và đưa người dùng về đúng tab cần theo dõi tiếp.
  //
  // Mọi bước ở đây đều được bọc riêng: việc dọn dẹp mà vấp thì CHỈ ghi vào
  // nhật ký, TUYỆT ĐỐI không hiện dòng đỏ. Trước đây các bước này nằm chung
  // khối bắt lỗi với lời gọi máy chủ, nên chỉ cần một bước dọn dẹp lỗi là
  // màn hình báo đỏ như thể giao hàng thất bại — dù thực tế đã xong xuôi
  // (chuông và tin nhắn đã phát đi rồi).
  const hoanTatVaChuyenTrang = (filter) => {
    try { onChanged?.(); } catch (err) { console.error('[OrderV2] Làm mới danh sách lỗi (bỏ qua):', err); }
    try { onClose?.(); } catch (err) { console.error('[OrderV2] Đóng hộp chi tiết lỗi (bỏ qua):', err); }
    try {
      window.dispatchEvent(new CustomEvent('sumi-navigate', { detail: { tab: 'orders', filter } }));
    } catch (err) {
      console.error('[OrderV2] Chuyển trang lỗi (bỏ qua):', err);
    }
  };

  // Lạc quan: đóng modal + chuyển sang tab "Đang vận chuyển" NGAY khi bấm xác
  // nhận, không chờ upload ảnh + RPC (thường vài giây). accept_delivery_assignment_flexible
  // không có version check nên an toàn cập nhật lạc quan như các luồng Nhận
  // việc khác đã làm. Khác biệt duy nhất: hành động thành công vốn đã ĐÓNG hẳn
  // modal này (hoanTatVaChuyenTrang gọi onClose), nên nếu upload/RPC thất bại
  // SAU KHI đã điều hướng đi thì không còn chỗ hiện lỗi tại chỗ nữa — phải báo
  // qua toast toàn cục thay vì setError cục bộ.
  const acceptDeliveryAssignment = () => {
    if (!gpsCoords) { setError('Chưa lấy được GPS'); return; }
    if (!photoFile) { setError('Chưa chụp ảnh nhận giao'); return; }
    setError('');

    const file = photoFile;
    const gps = gpsCoords;
    const orderCodeForToast = data?.order?.order_code || '';

    setShowDeliveryModal(false);
    setGpsCoords(null);
    setPhotoFile(null);
    setPhotoPreview(null);
    // Về danh sách "Đang vận chuyển" để shipper theo dõi chuyến của mình
    hoanTatVaChuyenTrang('delivery');

    (async () => {
      try {
        // Upload photo
        const cleanExt = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
        const photoPath = `orders/${orderId}/delivery/${crypto.randomUUID()}.${cleanExt}`;
        const { error: upErr } = await supabase.storage.from('uploads').upload(photoPath, file, { contentType: file.type || 'image/jpeg' });
        if (upErr) throw upErr;

        // Get signed URL for photo
        // ⚠️ KHÔNG đặt tên biến destructure là `data` — component đã có state
        // `data` (đơn hàng) ở phần trên; const `data` cục bộ trong CÙNG block
        // sẽ che luôn biến ngoài CHO CẢ QUÃNG TRƯỚC NÓ (temporal dead zone),
        // y hệt lỗi thật đã vá ở completeDelivery() bên dưới.
        const { data: urlData } = supabase.storage.from('uploads').getPublicUrl(photoPath);
        const publicUrl = urlData.publicUrl;

        // Call RPC to accept delivery
        const { data: rpcData, error } = await supabase.rpc('accept_delivery_assignment_flexible', {
          p_order_id: orderId,
          p_assigned_staff_id: profile.id,
          p_assigned_staff_name: profile.full_name || profile.email,
          p_gps_latitude: gps.lat,
          p_gps_longitude: gps.lng,
          p_photo_url: publicUrl
        });

        if (error) throw error;
        // rpcData có thể là null nếu máy chủ trả về rỗng -> dùng ?. để không vỡ
        if (!rpcData?.success) throw new Error(rpcData?.message || rpcData?.error || 'Không nhận giao được');

        // Từ đây trở đi việc giao hàng ĐÃ THÀNH CÔNG. Không được để bất kỳ
        // bước phụ nào biến nó thành lỗi trên màn hình.
        try {
          const { playNotificationSound } = await import('../lib/notificationSound.js');
          playNotificationSound('delivery_assigned');
        } catch (err) {
          console.error('[OrderV2] Chuông nhận giao lỗi (bỏ qua):', err);
        }
      } catch (e) {
        showToast({ icon: '⚠️', title: 'Không nhận giao được', message: `${orderCodeForToast} — ${e.message}`, tone: 'warning' });
      }
    })();
  };

  const completeWorkPackage = async (p) => {
    setBusy(true);
    setError('');
    try {
      const staffId = p.assigned_to_staff_id || profile.id;
      const staffName = p.assigned_to_staff_name || profile.full_name || profile.email;

      // Call RPC to complete work package and update order status (bypasses RLS)
      const { data, error } = await supabase.rpc('complete_work_package_and_order', {
        p_package_id: p.id,
        p_order_id: orderId,
        p_staff_id: staffId,
        p_staff_name: staffName
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.message || 'Failed to complete work package');

      // RPC chỉ đổi orders.status_v2 -> 'ready_for_fulfillment' khi MỌI bếp
      // của đơn đã xong (order_ready = true); khi đó useOrderNotifications tự
      // phát chuông cho mọi máy. Còn nếu vẫn còn bếp khác đang làm thì bảng
      // `orders` không đổi -> phải tự bắn tín hiệu, nếu không sẽ im lặng.
      // Tách bạch như vậy để không bao giờ kêu chồng hai lần.
      if (data.order_ready === false) {
        broadcastEvent(BroadcastEvents.SOUND_NOTIFICATION, { soundType: 'kitchen_complete', orderCode: data?.order?.order_code, orderId })
          .catch(e => console.error('[OrderV2] Không gửi được chuông xong mẻ bánh:', e));
      }

      // Log KPI: work_package_completed
      await supabase.from('kpi_logs').insert({
        order_id: orderId,
        staff_id: p.assigned_to_staff_id || profile.id,
        staff_name: p.assigned_to_staff_name || profile.full_name || profile.email,
        event_type: 'work_package_completed',
        notes: 'Nhân viên hoàn thành đơn hàng'
      }); // Fire-and-forget KPI logging

      await load();
      onChanged?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  // Cập nhật lạc quan: đổi trạng thái gói việc + đóng modal NGAY khi bấm,
  // không chờ round-trip RPC — bếp trưởng cảm giác nhận đơn tức thì. RPC này
  // (khác với `accept` phía trên) KHÔNG dùng p_expected_version — chỉ update
  // theo package_id, nên đoán trước status 'in_progress' ở client không đụng
  // tới cơ chế optimistic-concurrency nào của server. Nếu RPC lỗi, phục hồi
  // đúng snapshot trước đó + mở lại modal để bếp trưởng thử lại.
  const acceptPackageSelf = async (p) => {
    setError('');
    const snapshot = data;
    setData((d) => ({ ...d, packages: d.packages.map((x) => (x.id === p.id ? { ...x, status: 'in_progress', assigned_to_staff_id: profile.id, assigned_to_staff_name: profile.full_name || profile.email } : x)) }));
    setShowAcceptPackageModal(false);
    setSelectedPackage(null);
    setBusy(true);
    try {
      // Call RPC to accept work package by kitchen lead (bypasses RLS)
      const { data: result, error } = await supabase.rpc('accept_work_package_self', {
        p_package_id: p.id,
        p_staff_id: profile.id,
        p_staff_name: profile.full_name || profile.email
      });

      if (error) throw error;
      if (!result.success) throw new Error(result.error || result.message || 'Failed to accept work package');

      // RPC accept_work_package_self CHỈ sửa bảng công việc bếp, không đụng
      // vào bảng `orders` — mà chỉ `orders` mới được phát realtime. Nên phải
      // tự bắn tín hiệu, nếu không các máy khác sẽ không hay biết gì.
      broadcastEvent(BroadcastEvents.SOUND_NOTIFICATION, { soundType: 'kitchen_receive', orderCode: result?.order?.order_code, orderId })
        .catch(e => console.error('[OrderV2] Không gửi được chuông nhận đơn:', e));

      // Log KPI: work_package_accepted by bếp trưởng
      await supabase.from('kpi_logs').insert({
        order_id: orderId,
        staff_id: profile.id,
        staff_name: profile.full_name || profile.email,
        event_type: 'work_package_accepted',
        notes: 'Bếp trưởng tự nhận đơn để làm'
      }); // Fire-and-forget KPI logging

      await load();
      onChanged?.();
    } catch (e) {
      setData(snapshot);
      setShowAcceptPackageModal(true);
      setSelectedPackage(p);
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };





  const loadStaffForPackage = async (pkg) => {
    setStaffLoading(true);
    try {
      // Get kitchen unit from package
      const kitchenUnit = pkg?.organization_units?.id || pkg?.kitchen_unit_id;

      // Query staff by role (kitchen staff) or by kitchen unit
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, role, station')
        .eq('active', true)
        .or(`role.eq.kitchen_lead,role.eq.baker`)
        .limit(20);

      if (error) throw error;
      setStaffOptions(data || []);
    } catch (e) {
      setError(e.message);
      setStaffOptions([]);
    } finally {
      setStaffLoading(false);
    }
  };

  // Cùng cơ chế lạc quan như acceptPackageSelf — accept_delegate_work_package
  // cũng chỉ update theo package_id, không có p_expected_version.
  const acceptPackageDelegate = async (p, staffId, staffName) => {
    if (!staffId) { setError('Chưa chọn nhân viên'); return; }
    setError('');
    const snapshot = data;
    setData((d) => ({ ...d, packages: d.packages.map((x) => (x.id === p.id ? { ...x, status: 'in_progress', assigned_to_staff_id: staffId, assigned_to_staff_name: staffName } : x)) }));
    setShowAcceptPackageModal(false);
    setSelectedPackage(null);
    setSelectedStaff('');
    setBusy(true);
    try {
      // Call RPC to delegate work package to staff (bypasses RLS)
      const { data: result, error } = await supabase.rpc('accept_delegate_work_package', {
        p_package_id: p.id,
        p_staff_id: staffId,
        p_staff_name: staffName
      });

      if (error) throw error;
      if (!result.success) throw new Error(result.message || 'Failed to delegate work package');

      // Cùng lý do như acceptPackageSelf: RPC này không sửa bảng `orders`.
      broadcastEvent(BroadcastEvents.SOUND_NOTIFICATION, { soundType: 'kitchen_receive', orderCode: result?.order?.order_code, orderId })
        .catch(e => console.error('[OrderV2] Không gửi được chuông nhận đơn:', e));

      // Log KPI: work_package_accepted by delegated staff
      await supabase.from('kpi_logs').insert({
        order_id: orderId,
        staff_id: staffId,
        staff_name: staffName,
        event_type: 'work_package_accepted',
        notes: 'Nhân viên nhận đơn từ bếp trưởng'
      }); // Fire-and-forget KPI logging

      await load();
      onChanged?.();
    } catch (e) {
      setData(snapshot);
      setShowAcceptPackageModal(true);
      setSelectedPackage(p);
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const completeDelivery = async () => {
    setBusy(true);
    setError('');
    try {
      if (!gpsCoords) throw new Error('Chưa lấy được GPS');
      if (!photoFile) throw new Error('Chưa chụp ảnh hoàn thành');
      const ord = data.order;
      const missing = [];
      if (!ord?.required_at) missing.push('giờ giao');
      if (!ord?.customers?.name) missing.push('tên khách');
      if (!ord?.address) missing.push('địa chỉ');
      if (!ord?.customers?.phone) missing.push('số điện thoại');
      if (missing.length) throw new Error(`Thiếu thông tin đơn: ${missing.join(', ')} — bổ sung trước khi hoàn thành.`);

      // Upload completion photo
      const cleanExt = (photoFile.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
      const photoPath = `orders/${orderId}/delivery/completion-${crypto.randomUUID()}.${cleanExt}`;
      const { error: upErr } = await supabase.storage.from('uploads').upload(photoPath, photoFile, { contentType: photoFile.type || 'image/jpeg' });
      if (upErr) throw upErr;

      // Get signed URL for completion photo
      // ⚠️ LỖI THẬT tìm thấy ở đây: đặt tên `data` trùng với state `data` (đơn
      // hàng) khai báo ở đầu component. Vì đây là `const` trong CÙNG block với
      // dòng `const ord = data.order;` phía trên (dòng ~560), toàn bộ block bị
      // coi là dùng biến `data` CỤC BỘ ngay từ đầu (temporal dead zone) — nên
      // dòng `data.order` phía trên ném "Cannot access 'data' before
      // initialization". Lỗi này có từ trước, chỉ chưa ai chạm tới vì nút
      // "Hoàn Thành Giao" luôn bị khoá do thiếu tên/SĐT/GPS cho tới khi các lỗi
      // đó được vá ở các lần sửa trước.
      const { data: urlData } = supabase.storage.from('uploads').getPublicUrl(photoPath);
      const publicUrl = urlData.publicUrl;

      // Call RPC to complete delivery
      const { data: rpcData, error } = await supabase.rpc('complete_delivery_assignment', {
        p_order_id: orderId,
        p_staff_id: profile.id,
        p_staff_name: profile.full_name || profile.email,
        p_gps_latitude: gpsCoords.lat,
        p_gps_longitude: gpsCoords.lng,
        p_photo_url: publicUrl
      });

      if (error) throw error;
      if (!rpcData?.success) throw new Error(rpcData?.message || rpcData?.error || 'Không hoàn thành giao được');

      // Từ đây trở đi đơn ĐÃ GIAO XONG. Bước phụ vấp thì bỏ qua, không báo đỏ.
      try {
        const { playNotificationSound } = await import('../lib/notificationSound.js');
        playNotificationSound('fully_completed');
      } catch (err) {
        console.error('[OrderV2] Chuông hoàn thành lỗi (bỏ qua):', err);
      }

      setShowCompletionModal(false);
      setGpsCoords(null);
      setPhotoFile(null);
      setPhotoPreview(null);

      // ĐƠN CHƯA TÍNH DOANH THU THUẦN cho tới khi xác minh thanh toán — mở
      // ngay bước tiếp theo thay vì rời màn hình, để không tạo ra một đơn
      // "đã giao" mà không ai quay lại xác minh.
      await load();
      setShowPaymentVerifyModal(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const verifyPayment = async () => {
    if (!verifyMethod) { setVerifyError('Chọn hình thức thanh toán trước.'); return; }
    if (!verifyProofUrl) {
      setVerifyError(verifyMethod === 'bank_transfer'
        ? 'Cần ảnh chụp màn hình chuyển khoản.'
        : 'Cần chụp ảnh nhận tiền mặt.');
      return;
    }
    setVerifyBusy(true); setVerifyError('');
    try {
      const { data: rpcData, error } = await supabase.rpc('verify_order_payment', {
        p_order_id: orderId,
        p_payment_method: verifyMethod,
        p_proof_url: verifyProofUrl,
      });
      if (error) throw error;
      if (!rpcData?.thanh_cong) throw new Error(rpcData?.thong_bao || 'Không xác minh được thanh toán.');

      setShowPaymentVerifyModal(false);
      setVerifyMethod(null);
      setVerifyProofUrl('');
      await load();
      onChanged?.();
      // Về danh sách "Giao thành công" — đơn giờ đã tính vào Doanh thu thuần.
      hoanTatVaChuyenTrang('completed');
    } catch (e) {
      setVerifyError(e.message || 'Không xác minh được thanh toán. Thử lại giúp tôi.');
    } finally {
      setVerifyBusy(false);
    }
  };

  if (!data) return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 110, background: 'rgba(0,0,0,.55)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{...box, maxWidth: 400, position: 'relative'}}>
        <button onClick={onClose} style={{position:'absolute',top:10,right:10,minHeight:44,minWidth:44,border:0,borderRadius:'50%',background:'var(--surface-sunken)',fontSize:16,cursor:'pointer'}}>✕</button>
        <div style={{color: error ? '#b42318' : 'var(--text-muted)', fontWeight: error ? 700 : 400}}>
          {error || '⏳ Đang tải chi tiết đơn...'}
        </div>
      </div>
    </div>
  );

  const o = data.order;
  const isSchool = o.confidentiality === 'school_restricted';

  if (isSchool && !canViewSchoolOrder(profile)) {
    return (
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 110, background: 'rgba(0,0,0,.55)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <div onClick={e => e.stopPropagation()} style={{...box, maxWidth: 400, position: 'relative'}}>
          <button onClick={onClose} style={{position:'absolute',top:10,right:10,minHeight:44,minWidth:44,border:0,borderRadius:'50%',background:'var(--surface-sunken)',fontSize:16,cursor:'pointer'}}>✕</button>
          <div style={{fontWeight: 700, color: '#b42318'}}>🔒 Đơn trường học chỉ Giám đốc, Trợ Lý Giám Đốc Xưởng 42 và nhân viên Bếp Trường học được xem.</div>
        </div>
      </div>
    );
  }

  const isMacaron = o.order_type === 'macaron';
  const hidePrice = isSchool || (isMacaron && !canViewMacaronPrice(profile));
  const isReady = ['ready_for_fulfillment', 'in_delivery', 'completed'].includes(o.status_v2);

  const customerSamplePhotos = attachments.filter(a => a.attachment_type === 'customer_sample' || !a.attachment_type);
  const proofPhotos = attachments.filter(a => a.attachment_type !== 'customer_sample' && !!a.attachment_type);

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 110, background: 'rgba(0,0,0,.55)', display: 'flex', justifyContent: 'center', alignItems: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 720, maxHeight: '94vh', overflowY: 'auto', padding: 18, borderRadius: '24px 24px 0 0', background: 'var(--surface-app)' }}>
        
        {/* Header đơn hàng */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20, color: 'var(--text-primary)' }}>
              Đơn #{o.order_code || o.id.slice(0, 8)}
            </h2>
            <div style={{ marginTop: 4, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              {o.is_internal && (
                <span style={{ background: '#7c3aed', color: '#fff', fontWeight: 900, fontSize: 12, padding: '3px 10px', borderRadius: 999, letterSpacing: 0.3 }}>
                  🏷️ NỘI BỘ{o.target_store ? ` · ${o.target_store}` : ''}
                </span>
              )}
              <span style={{
                fontSize: 13, fontWeight: 800, padding: '3px 10px', borderRadius: 999,
                background: isReady ? '#e6f6ed' : '#fff0d4',
                color: isReady ? '#087f5b' : '#b93e13'
              }}>
                {o.status_v2 === 'ready_for_fulfillment' ? '📦 Đã vào Kho Thành Phẩm (Chờ giao)' :
                 o.status_v2 === 'in_delivery' ? '🛵 Shipper đang giao' :
                 o.status_v2 === 'completed' ? '✅ Đã giao thành công' :
                 o.status_v2 === 'in_production' ? '👩‍🍳 Bếp đang làm bánh' : '📥 Đơn chờ làm'}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: 'var(--text-muted)' }}>
                Loại đơn: {(() => { const M = ORDER_TYPE_ICONS[o.order_type]; return M ? <M size={15} /> : null; })()} {ORDER_TYPE_LABELS[o.order_type] || o.order_type}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {!isReady && (
              <button
                type="button"
                disabled={busy}
                onClick={markReadyStock}
                style={{
                  minHeight: 38, padding: '0 12px', borderRadius: 10, border: '1.5px solid #087f5b',
                  background: '#e6f6ed', color: '#087f5b', fontWeight: 800, fontSize: 13, cursor: 'pointer'
                }}
                title="Bánh có sẵn tại kho thành phẩm/tủ - Bỏ qua khâu bếp và báo Vận tải nhận đơn"
              >
                ⚡ Bánh có sẵn (Vào kho ngay)
              </button>
            )}
            {hasAnyRole(profile, ['owner', 'admin']) && (
              <button
                type="button"
                disabled={busy || deletingOrder}
                onClick={handleDeleteOrder}
                title="Chỉ Giám đốc/Quản lý mới xóa được đơn hàng — xóa hẳn ở bất kỳ giai đoạn nào, không khôi phục"
                style={{
                  minHeight: 38, padding: '0 10px', borderRadius: 10, border: '1.5px solid #dc2626',
                  background: '#fef2f2', color: '#dc2626', fontWeight: 800, fontSize: 13, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 5
                }}
              >
                <Trash2 size={14} /> {deletingOrder ? 'Đang xóa…' : 'Xóa đơn'}
              </button>
            )}
            {quyenSua && (quyenSua.duoc_sua || quyenSua.ly_do === 'qua_han') && (
              <button
                type="button"
                disabled={busy}
                onClick={() => setShowEditModal(true)}
                style={{
                  minHeight: 44, padding: '0 12px', borderRadius: 10,
                  border: `1.5px solid ${quyenSua.duoc_sua ? '#d96b43' : '#96690a'}`,
                  background: quyenSua.duoc_sua ? '#fde8de' : '#fff8e6',
                  color: quyenSua.duoc_sua ? '#d96b43' : '#96690a',
                  fontWeight: 800, fontSize: 13, cursor: 'pointer'
                }}
                title={quyenSua.thong_bao || ''}
              >
                {quyenSua.duoc_sua
                  ? '✏️ Chỉnh sửa đơn'
                  : quyenSua.dang_cho_duyet ? '⏳ Đang chờ duyệt' : '📨 Gửi yêu cầu chỉnh sửa'}
              </button>
            )}
            <button
              onClick={onClose}
              style={{
                width: 36, height: 36, border: 0, borderRadius: '50%',
                background: 'var(--surface-sunken)', fontSize: 16, cursor: 'pointer'
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {isSchool && (
          <div style={{ ...box, marginTop: 12, background: '#fff3cd', color: '#856404', fontWeight: 800 }}>
            🔒 Đơn trường học · Tuyệt đối không hiển thị giá
          </div>
        )}

        {/* Đơn nội bộ đã sản xuất xong -> bắt buộc nhập kho (ảnh + ngày SX + HSD)
            trước khi đóng đơn. Chỉ hiện khi bếp đã xong (ready_for_fulfillment). */}
        {o.is_internal && o.status_v2 === 'ready_for_fulfillment' && (
          <div style={{ ...box, marginTop: 12, background: '#f5f0ff', border: '1.5px solid #c4b5fd' }}>
            <div style={{ fontWeight: 900, color: '#6d28d9', marginBottom: 8 }}>📦 Bếp đã sản xuất xong — nhập kho thành phẩm</div>
            {!showWarehouseForm ? (
              <button type="button" onClick={() => setShowWarehouseForm(true)} style={{ minHeight: 46, width: '100%', border: 0, borderRadius: 12, background: '#7c3aed', color: '#fff', fontWeight: 900, cursor: 'pointer' }}>
                📥 Nhập kho thành phẩm
              </button>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 800, fontSize: 13, marginBottom: 6 }}>Ảnh thành phẩm (bắt buộc)</label>
                  <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48, border: '2px dashed #c4b5fd', borderRadius: 12, cursor: 'pointer' }}>
                    {whPhoto ? `📷 ${whPhoto.name}` : '📷 Chụp / chọn ảnh'}
                    <input hidden type="file" accept="image/*" onChange={(e) => setWhPhoto(e.target.files?.[0] || null)} />
                  </label>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <label style={{ display: 'block', fontWeight: 800, fontSize: 13, marginBottom: 6 }}>Ngày sản xuất (bắt buộc)</label>
                    <input type="datetime-local" value={whProductionDate} onChange={(e) => setWhProductionDate(e.target.value)} style={{ width: '100%', minHeight: 46, borderRadius: 10, border: '1px solid #c4b5fd', padding: '0 10px', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontWeight: 800, fontSize: 13, marginBottom: 6 }}>Hạn sử dụng (bắt buộc)</label>
                    <input type="datetime-local" value={whExpiryDate} onChange={(e) => setWhExpiryDate(e.target.value)} style={{ width: '100%', minHeight: 46, borderRadius: 10, border: '1px solid #c4b5fd', padding: '0 10px', boxSizing: 'border-box' }} />
                  </div>
                </div>
                {data.order.order_type === 'macaron' && (
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: 10, borderRadius: 12, background: '#fff', border: '1px dashed #c4b5fd', cursor: 'pointer' }}>
                    <input type="checkbox" checked={isUnfilledShell} onChange={(e) => setIsUnfilledShell(e.target.checked)} style={{ marginTop: 3 }} />
                    <span style={{ fontSize: 12.5, lineHeight: 1.4 }}>
                      🥚 Đây là <b>vỏ Macaron Hạnh Nhân chưa bơm nhân</b> — hệ thống ghi nhận sản lượng (KPI Xưởng 41) và đưa vào <b>Kho Bán Thành Phẩm</b> (tab "Bán thành phẩm" trong Macaron 41), Bếp Lạnh bấm "Đã hoàn thiện" khi bơm nhân xong. Không vào kho bán được cho tới lúc đó.
                    </span>
                  </label>
                )}
                {whError && <div style={{ color: '#dc2626', fontWeight: 700, fontSize: 13 }}>⚠️ {whError}</div>}
                <button type="button" disabled={whBusy} onClick={completeInternalOrderToWarehouse} style={{ minHeight: 50, border: 0, borderRadius: 12, background: whBusy ? '#c4b5fd' : '#7c3aed', color: '#fff', fontWeight: 900, cursor: whBusy ? 'not-allowed' : 'pointer' }}>
                  {whBusy ? 'Đang lưu...' : '✓ Xác nhận nhập kho & hoàn thành đơn'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Status Timeline - hiển thị tiến trình đơn hàng */}
        <OrderStatusTimeline order={data.order} packages={data.packages} tasks={data.allTasks || []} changeHistory={data.changeHistory || []} kpiLogs={data.kpiLogs || []} />

        {/* Danh sách sản phẩm & quy cách tiếng Việt */}
        <div style={{ ...box, marginTop: 12 }}>
          <strong style={{ fontSize: 16, display: 'block', marginBottom: 8, color: 'var(--text-primary)' }}>
            📦 Sản phẩm và quy cách
          </strong>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead><tr style={{ borderBottom: '1.5px dashed var(--border-default)' }}>
              <th style={{ textAlign: 'left', padding: '4px 4px 8px', color: 'var(--text-secondary)', fontWeight: 700, fontSize: 12 }}>Sản phẩm</th>
              <th style={{ textAlign: 'center', padding: '4px 4px 8px', color: 'var(--text-secondary)', fontWeight: 700, fontSize: 12 }}>SL</th>
              {!hidePrice && <th style={{ textAlign: 'right', padding: '4px 4px 8px', color: 'var(--text-secondary)', fontWeight: 700, fontSize: 12 }}>Đơn giá</th>}
              {!hidePrice && <th style={{ textAlign: 'right', padding: '4px 4px 8px', color: 'var(--text-secondary)', fontWeight: 700, fontSize: 12 }}>Thành tiền</th>}
            </tr></thead>
            <tbody>
              {data.items.map((x) => {
                const specLines = formatSpecificationLines(x.specification);
                const price = Number(x.unit_price) || 0;
                const qty = Number(x.quantity) || 0;
                return (
                  <tr key={x.id} style={{ borderBottom: '1px dashed var(--border-default)' }}>
                    <td style={{ padding: '8px 4px', verticalAlign: 'top' }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{x.name_snapshot}</div>
                      {specLines.length > 0 && (
                        <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {specLines.map((line, idx) => (
                            <span key={idx} style={{
                              fontSize: 12, padding: '2px 7px', borderRadius: 'var(--radius-sm)',
                              background: 'var(--surface-sunken)', color: 'var(--text-secondary)', fontWeight: 500
                            }}>
                              {line}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '8px 4px', textAlign: 'center', verticalAlign: 'top', color: 'var(--text-primary)' }}>{qty} {x.unit || 'cái'}</td>
                    {!hidePrice && <td style={{ padding: '8px 4px', textAlign: 'right', verticalAlign: 'top', color: 'var(--text-primary)' }}>{price ? price.toLocaleString('vi-VN') : '—'}</td>}
                    {!hidePrice && <td style={{ padding: '8px 4px', textAlign: 'right', verticalAlign: 'top', color: 'var(--text-primary)', fontWeight: 700 }}>{price ? (price * qty).toLocaleString('vi-VN') : '—'}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Ảnh mẫu khách gửi (Cake Sample Photo) */}
        {customerSamplePhotos.length > 0 && (
          <div style={box}>
            <strong style={{ fontSize: 16, display: 'block', marginBottom: 10, color: 'var(--text-primary)' }}>
              🖼️ Ảnh mẫu bánh kem khách gửi ({customerSamplePhotos.length})
            </strong>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 10 }}>
              {customerSamplePhotos.map((att) => (
                <div
                  key={att.id}
                  onClick={() => setZoomImage(att.url)}
                  style={{
                    position: 'relative', borderRadius: 12, overflow: 'hidden', cursor: 'pointer',
                    border: '2px solid var(--border-default)', aspectRatio: '1/1', background: '#000'
                  }}
                  title="Bấm để xem ảnh lớn"
                >
                  <img
                    src={att.url}
                    alt="Mẫu bánh kem"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                  <div style={{
                    position: 'absolute', bottom: 0, insetInline: 0, padding: '2px 4px',
                    background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 11, textAlign: 'center'
                  }}>
                    🔍 Xem ảnh lớn
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Thông tin Giao nhận & Khách hàng */}
        <div style={box}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
            <strong style={{ fontSize: 16, color: 'var(--text-primary)' }}>
              🚚 Thông tin giao nhận
            </strong>
            {o.status_v2 === 'ready_for_fulfillment' && (
              <button
                disabled={busy}
                onClick={() => setShowDeliveryModal(true)}
                style={{
                  minHeight: 40, border: 0, borderRadius: 12, padding: '0 14px', fontWeight: 900,
                  background: '#d96b43', color: 'white', fontSize: 14, cursor: busy ? 'not-allowed' : 'pointer',
                  boxShadow: '0 2px 0 #a84b2e', opacity: busy ? 0.6 : 1
                }}
              >
                🚚 Nhận Giao
              </button>
            )}
            {o.status_v2 === 'ready_for_fulfillment' && hasAnyRole(profile, ['owner', 'admin']) && (
              <button
                disabled={busy}
                onClick={openThirdPartyModal}
                style={{
                  minHeight: 40, border: 0, borderRadius: 12, padding: '0 14px', fontWeight: 900,
                  background: '#1E88E5', color: 'white', fontSize: 14, cursor: busy ? 'not-allowed' : 'pointer',
                  boxShadow: '0 2px 0 #145a94', opacity: busy ? 0.6 : 1
                }}
              >
                📦 Chuyển Giao ĐVVC
              </button>
            )}
            {o.status_v2 === 'in_delivery' && !data.thirdPartyShipment && (
              <button
                disabled={busy}
                onClick={() => {
                  setGpsCoords(null);
                  setPhotoFile(null);
                  setPhotoPreview(null);
                  setShowCompletionModal(true);
                }}
                style={{
                  minHeight: 40, border: 0, borderRadius: 12, padding: '0 14px', fontWeight: 900,
                  background: '#28a745', color: 'white', fontSize: 14, cursor: busy ? 'not-allowed' : 'pointer',
                  boxShadow: '0 2px 0 #1a6f2a', opacity: busy ? 0.6 : 1
                }}
              >
                ✅ Hoàn Thành Giao
              </button>
            )}
          </div>

          {data.thirdPartyShipment && (
            <div style={{
              marginBottom: 10, padding: 14, borderRadius: 14, background: 'var(--surface-sunken)',
              border: `1.5px solid ${shipmentStatusMeta(data.thirdPartyShipment.manual_status).color}55`,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                <strong style={{ fontSize: 14, color: 'var(--text-primary)' }}>
                  📦 Đơn vị vận chuyển: {carrierLabel(data.thirdPartyShipment.carrier, data.thirdPartyShipment.carrier_other_name)}
                </strong>
                <span style={{
                  fontSize: 12, fontWeight: 800, padding: '3px 10px', borderRadius: 999, color: '#fff',
                  background: shipmentStatusMeta(data.thirdPartyShipment.manual_status).color,
                }}>
                  {shipmentStatusMeta(data.thirdPartyShipment.manual_status).label}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13.5, color: 'var(--text-secondary)' }}>
                {data.thirdPartyShipment.tracking_id && <div><b>Mã vận đơn:</b> {data.thirdPartyShipment.tracking_id}</div>}
                {(data.thirdPartyShipment.driver_name || data.thirdPartyShipment.driver_phone) && (
                  <div><b>Tài xế:</b> {data.thirdPartyShipment.driver_name || '—'}{data.thirdPartyShipment.driver_phone ? ` · ${data.thirdPartyShipment.driver_phone}` : ''}</div>
                )}
                {data.thirdPartyShipment.notes && <div><b>Ghi chú:</b> {data.thirdPartyShipment.notes}</div>}
                <div><b>Chuyển giao lúc:</b> {new Date(data.thirdPartyShipment.handed_off_at).toLocaleString('vi-VN')}{data.thirdPartyShipment.handed_off_by_name ? ` · ${data.thirdPartyShipment.handed_off_by_name}` : ''}</div>
              </div>
              {hasAnyRole(profile, ['owner', 'admin']) && o.status_v2 === 'in_delivery' && (
                <button
                  disabled={busy}
                  onClick={() => { setTpNotes(''); setTpError(''); setShowShipmentStatusModal(true); }}
                  style={{
                    marginTop: 10, minHeight: 38, border: 0, borderRadius: 10, padding: '0 14px', fontWeight: 800,
                    background: '#fff', color: '#1E88E5', border: '1.5px solid #1E88E5', fontSize: 13.5, cursor: 'pointer',
                  }}
                >
                  Cập nhật trạng thái vận chuyển
                </button>
              )}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 15 }}>
            {o.customers && (o.customers.name || o.customers.phone) && (
              <div>
                <b>Khách hàng:</b> {o.customers.name || '—'}{o.customers.phone ? ` · ${o.customers.phone}` : ''}
              </div>
            )}
            <div>
              <b>Phương thức:</b> {o.fulfillment_method_v2 === 'pickup' ? '🏬 Nhận tại quầy' : '🛵 Giao tận nơi'}
            </div>
            {o.address && (
              <div>
                <b>Địa chỉ:</b> {o.address}
              </div>
            )}
            {data.operations?.was_late && (
              <div style={{ marginTop: 4, padding: '8px 10px', background: '#fee2e2', borderRadius: 8, color: '#b42318', fontWeight: 700 }}>
                ⚠️ Đơn này trễ giờ hẹn{data.operations?.late_staff_names ? ` — nhân viên: ${data.operations.late_staff_names}` : ''}
              </div>
            )}
            {o.status_v2 === 'completed' && !o.payment_verified && (
              <button
                onClick={() => { setVerifyMethod(null); setVerifyProofUrl(''); setVerifyError(''); setShowPaymentVerifyModal(true); }}
                style={{
                  marginTop: 4, padding: '10px 12px', background: '#fff3cd', border: '1px solid #f2d488', borderRadius: 10,
                  color: '#7a5a00', fontWeight: 800, fontSize: 13, cursor: 'pointer', textAlign: 'left',
                }}
              >
                ⚠️ Đã giao nhưng CHƯA xác minh thanh toán — chưa tính vào Doanh thu thuần. Bấm để xác minh ngay.
              </button>
            )}
            {o.status_v2 === 'completed' && o.payment_verified && o.payment_proof_url && (
              <div style={{ marginTop: 4, fontSize: 12.5, color: 'var(--text-secondary)' }}>
                ✅ Đã xác minh thanh toán ({PAYMENT_METHOD_LABELS[o.payment_method] || o.payment_method})
                {o.payment_verified_at ? ` · ${new Date(o.payment_verified_at).toLocaleString('vi-VN')}` : ''}
                {' · '}
                <a href={o.payment_proof_url} target="_blank" rel="noreferrer" style={{ color: '#d96b43', fontWeight: 700 }}>Xem ảnh chứng từ</a>
              </div>
            )}
            <div>
              <b>Hẹn giờ:</b> {o.required_at ? new Date(o.required_at).toLocaleString('vi-VN') : 'Chưa có giờ hẹn'}
            </div>
            {!hidePrice && o.ship_fee > 0 && (
              <div>
                <b>Phí ship:</b> {Number(o.ship_fee).toLocaleString('vi-VN')}đ
              </div>
            )}
            <div>
              <b>Thanh toán:</b> {PAYMENT_METHOD_LABELS[o.payment_method] || o.payment_method || 'COD (thu khi giao)'}
            </div>
            {!hidePrice && o.deposit > 0 && (
              <div>
                <b>Đặt cọc:</b> {Number(o.deposit).toLocaleString('vi-VN')}đ
              </div>
            )}
            {!hidePrice && o.discount_amount > 0 && (
              <div>
                <b>Chiết khấu:</b> −{Number(o.discount_amount).toLocaleString('vi-VN')}đ
              </div>
            )}
            {!hidePrice && o.vat_amount > 0 && (
              <div>
                <b>VAT 8%:</b> +{Number(o.vat_amount).toLocaleString('vi-VN')}đ
              </div>
            )}
            {o.tax_code && (
              <div>
                <b>Mã số thuế:</b> {o.tax_code}
              </div>
            )}
            {o.promotion_note && (
              <div>
                <b>Khuyến mãi:</b> {o.promotion_note}
              </div>
            )}
            {!hidePrice && o.total > 0 && (
              <div>
                <b>Tổng tiền đơn:</b> {Number(o.total).toLocaleString('vi-VN')}đ
              </div>
            )}
            {o.note && (
              <div style={{ marginTop: 4, padding: '8px 10px', borderRadius: 10, background: 'var(--surface-sunken)', color: 'var(--text-primary)' }}>
                <b>Ghi chú đơn:</b> {o.note}
              </div>
            )}
          </div>
        </div>

        {/* Cảnh báo quá hạn (nếu có) */}
        {data.operations?.is_overdue && (
          <div style={{ ...box, background: '#fee2e2', color: '#b42318', fontWeight: 850 }}>
            ⚠️ Chưa thực hiện · {data.operations.overdue_stage} · quá {data.operations.overdue_minutes} phút
          </div>
        )}

        {/* Tiến độ thời gian xử lý */}
        <div style={box}>
          <strong style={{ fontSize: 16, display: 'block', marginBottom: 8, color: 'var(--text-primary)' }}>
            ⏱️ Tiến độ thời gian xử lý
          </strong>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14 }}>
            <div>
              <b>Bếp:</b> {data.operations?.production_started_at ? `Bắt đầu lúc ${new Date(data.operations.production_started_at).toLocaleString('vi-VN')}` : 'Chưa bắt đầu'}
              {data.operations?.production_completed_at ? ` · Xong lúc ${new Date(data.operations.production_completed_at).toLocaleString('vi-VN')}` : ''}
              {data.operations?.production_minutes != null ? ` (${data.operations.production_minutes} phút)` : ''}
            </div>
            <div>
              <b>Giao hàng:</b> {data.operations?.delivery_started_at ? `Bắt đầu lúc ${new Date(data.operations.delivery_started_at).toLocaleString('vi-VN')}` : 'Chưa bắt đầu'}
              {data.operations?.delivery_completed_at ? ` · Xong lúc ${new Date(data.operations.delivery_completed_at).toLocaleString('vi-VN')}` : ''}
              {data.operations?.delivery_minutes != null ? ` (${data.operations.delivery_minutes} phút)` : ''}
            </div>
            {(data.operations?.driver_name || data.operations?.provider_label) && (
              <div>
                <b>Người giao:</b> {data.operations.driver_name || data.operations.provider_label}
                {!hidePrice && data.operations?.shipping_fee != null ? ` · Phí ship: ${Number(data.operations.shipping_fee).toLocaleString('vi-VN')}đ` : ''}
              </div>
            )}
          </div>
        </div>

        {/* Đánh giá nhanh theo từng công đoạn — chỉ Giám đốc/Quản lý */}
        {director && o.created_by && (
          <StarRateBar
            staffId={o.created_by}
            staffName={`Chốt đơn: ${o.created_by_name || 'Nhân viên'}`}
            linkType="order_created"
            linkId={orderId}
            compact
            onDone={load}
          />
        )}
        {director && data.shipper?.shipper_staff_id && (
          <StarRateBar
            staffId={data.shipper.shipper_staff_id}
            staffName={`Giao hàng: ${data.shipper.shipper_staff_name || 'Nhân viên'}`}
            linkType="order_delivery"
            linkId={orderId}
            compact
            onDone={load}
          />
        )}

        {/* Ảnh chụp lúc hoàn thành hoặc giao hàng */}
        {proofPhotos.length > 0 && (
          <div style={box}>
            <strong style={{ fontSize: 16, display: 'block', marginBottom: 10, color: 'var(--text-primary)' }}>
              📸 Ảnh chụp hoàn thành / giao hàng ({proofPhotos.length})
            </strong>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 10 }}>
              {proofPhotos.map((att) => (
                <div
                  key={att.id}
                  onClick={() => setZoomImage(att.url)}
                  style={{
                    position: 'relative', borderRadius: 12, overflow: 'hidden', cursor: 'pointer',
                    border: '2px solid var(--border-default)', aspectRatio: '1/1', background: '#000'
                  }}
                >
                  <img
                    src={att.url}
                    alt={att.attachment_type || 'Ảnh'}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Các bếp thực hiện */}
        <div style={box}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
            <strong style={{ fontSize: 16, color: 'var(--text-primary)' }}>
              👨‍🍳 Các bếp thực hiện ({data.packages.length})
            </strong>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Tự động phân theo luồng món
            </span>
          </div>


          {data.packages.map((p) => {
            const isAssigned = p.status === 'assigned';
            const isInProgress = ['accepted', 'in_progress', 'awaiting_approval'].includes(p.status);
            const isCompleted = p.status === 'completed';

            return (
              <div key={p.id} style={{ padding: '14px 0', borderBottom: '1px solid var(--border-default)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <div>
                    <span style={{ fontWeight: 850, fontSize: 16, color: 'var(--text-primary)' }}>
                      {p.organization_units?.name || 'Bếp sản xuất'}
                    </span>
                    <div style={{ fontSize: 13, color: isCompleted ? '#087f5b' : isInProgress ? '#b93e13' : '#725f50', marginTop: 2, fontWeight: 700 }}>
                      {isCompleted ? '✅ Đã hoàn thành mẻ bánh' : isInProgress ? '👩‍🍳 Bếp đang thực hiện' : '⏳ Chờ bếp trưởng nhận đơn'}
                    </div>
                  </div>

                  <div>
                    {isAssigned && (
                      <button
                        disabled={busy}
                        onClick={() => {
                          setSelectedPackage(p);
                          setShowAcceptPackageModal(true);
                          loadStaffForPackage(p);
                        }}
                        style={{
                          minHeight: 48, border: 0, borderRadius: 14, padding: '0 20px', fontWeight: 950,
                          background: '#ef642b', color: '#fff', fontSize: 16, cursor: 'pointer',
                          boxShadow: '0 4px 0 #b93e13'
                        }}
                      >
                        👩‍🍳 Nhận đơn
                      </button>
                    )}
                    {p.status === 'in_progress' && (
                      <button
                        disabled={busy}
                        onClick={() => completeWorkPackage(p)}
                        style={{
                          minHeight: 44, border: 0, borderRadius: 12, padding: '0 16px', fontWeight: 900,
                          background: '#28a745', color: 'white', fontSize: 15, cursor: 'pointer',
                          boxShadow: '0 3px 0 #1a6f2a'
                        }}
                      >
                        ✅ Hoàn thành
                      </button>
                    )}
                    {p.status === 'awaiting_approval' && (
                      <button
                        disabled={busy}
                        onClick={() => approvePackage(p)}
                        style={{
                          minHeight: 44, border: 0, borderRadius: 12, padding: '0 16px', fontWeight: 900,
                          background: '#087f5b', color: 'white', fontSize: 15, cursor: 'pointer',
                          boxShadow: '0 3px 0 #05523b'
                        }}
                      >
                        ✓ Duyệt hoàn thành mẻ
                      </button>
                    )}
                  </div>
                </div>

                {(p.assigned_to_staff_name || p.accepted_at) && (
                  <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <small style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                      {p.assigned_to_staff_name && `✋ Giao cho: ${p.assigned_to_staff_name}`}
                      {p.assigned_at && ` · ${new Date(p.assigned_at).toLocaleString('vi-VN')}`}
                      {p.completed_by_staff_name && ` · ✅ ${new Date(p.completed_at).toLocaleString('vi-VN')}`}
                    </small>
                    {isInProgress && director && !p.completed_at && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedPackage(p);
                          setShowAcceptPackageModal(true);
                        }}
                        style={{
                          padding: '4px 10px',
                          fontSize: 12,
                          fontWeight: 700,
                          border: 'none',
                          borderRadius: 8,
                          background: '#fde8de',
                          color: '#d96b43',
                          cursor: 'pointer',
                          whiteSpace: 'nowrap'
                        }}
                        title="Giao lại cho nhân viên khác"
                      >
                        🔄 Giao lại
                      </button>
                    )}
                  </div>
                )}

                {/* Đánh giá nhanh +/- sao cho người được giao mẻ này (chỉ Quản lý/Giám đốc) */}
                {director && p.assigned_to_staff_id && (
                  <StarRateBar
                    staffId={p.assigned_to_staff_id}
                    staffName={`Sản xuất: ${p.assigned_to_staff_name || 'Nhân viên'}`}
                    linkType="order_work_package"
                    linkId={p.id}
                    compact
                    onDone={load}
                  />
                )}

                {/* Bếp trưởng giao việc cho thợ bếp tuyến dưới */}
                {isInProgress && (
                  <div style={{ marginTop: 10 }}>
                    <PackageTaskPanel
                      packageId={p.id}
                      packageUnit={p.organization_units}
                      defaultDueAt={p.due_at || data.order?.required_at}
                      onChanged={load}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Phân thêm bếp cùng làm (Tùy chọn dành riêng cho Quản lý) */}
        {director && (
          <details style={{ ...box, padding: '12px 16px', cursor: 'pointer' }}>
            <summary style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-secondary)' }}>
              ＋ Thêm bếp phối hợp thực hiện (Tùy chọn Quản lý / Điều phối)
            </summary>
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px dashed var(--border-subtle)' }}>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 8px' }}>
                Dùng khi đơn hàng lớn cần xưởng khác hoặc bếp khác cùng hỗ trợ làm thêm mẻ.
                Bếp phối hợp sẽ nhận đúng phần <strong>số lượng còn chưa phân</strong> của từng món (bếp chính đã nhận bao nhiêu thì phần còn lại mới chia tiếp).
              </p>
              {data.items.map(x => {
                const remaining = remainingQtyForItem(x.id);
                if (remaining <= 0) return null;
                return (
                  <div key={x.id} style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginBottom: 4 }}>
                    • {x.name_snapshot}: còn <strong>{remaining}</strong> {x.unit} chưa phân
                  </div>
                );
              })}
              <select
                value={unit}
                onChange={e => setUnit(e.target.value)}
                style={{ width: '100%', minHeight: 46, borderRadius: 12, padding: '0 10px', fontSize: 15, border: '1px solid var(--border-default)', background: 'var(--surface-sunken)' }}
              >
                <option value="">Chọn bếp muốn phân thêm</option>
                {units.map(x => <option value={x.id} key={x.id}>{x.name}</option>)}
              </select>
              <button
                disabled={!unit || busy}
                onClick={assign}
                style={{ width: '100%', minHeight: 46, marginTop: 10, border: 0, borderRadius: 12, fontWeight: 900, background: '#d96b43', color: '#fff', fontSize: 15, cursor: 'pointer' }}
              >
                ＋ Thêm bếp phụ trách phần đơn
              </button>
            </div>
          </details>
        )}

        {/* Bình luận nội bộ đơn hàng */}
        <div style={box}>
          <CommentSection order={o} profile={profile} />
        </div>

        {error && <div style={{ color: '#b42318', marginTop: 8, fontWeight: 700 }}>{error}</div>}

      </div>

      {/* Modal: Nhận Giao - GPS + Photo */}
      {showDeliveryModal && (
        <div onClick={() => !busy && setShowDeliveryModal(false)} style={{
          position: 'fixed', inset: 0, zIndex: 115, background: 'rgba(0,0,0,0.5)',
          display: 'flex', justifyContent: 'center', alignItems: 'flex-end'
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            width: '100%', maxWidth: 600, background: 'var(--surface-app)', borderRadius: '20px 20px 0 0',
            padding: 24, maxHeight: '85vh', overflowY: 'auto'
          }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: 18, color: 'var(--text-primary)', fontWeight: 900 }}>
              🚚 Nhận Giao Hàng
            </h3>

            {/* GPS Section */}
            <div style={{ marginBottom: 20, padding: 14, background: 'var(--surface-sunken)', borderRadius: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <MapPin size={20} color="#d96b43" />
                <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Định vị GPS</span>
              </div>
              {gpsCoords ? (
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>
                  ✅ Đã lấy: {gpsCoords.lat.toFixed(6)}, {gpsCoords.lng.toFixed(6)}<br/>
                  <small>Độ chính xác: ±{gpsCoords.accuracy.toFixed(1)}m</small>
                </div>
              ) : (
                <button
                  onClick={captureGPS}
                  disabled={busy}
                  style={{
                    width: '100%', padding: '10px 14px', background: '#d96b43', color: '#fff',
                    border: 0, borderRadius: 10, fontWeight: 700, cursor: 'pointer', fontSize: 14
                  }}
                >
                  📍 Bấm để lấy GPS hiện tại
                </button>
              )}
            </div>

            {/* Camera Section */}
            <div style={{ marginBottom: 20, padding: 14, background: 'var(--surface-sunken)', borderRadius: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <Camera size={20} color="#d96b43" />
                <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Chụp ảnh nhận giao</span>
              </div>
              {photoPreview ? (
                <div>
                  <img src={photoPreview} alt="preview" style={{ width: '100%', borderRadius: 10, marginBottom: 10, maxHeight: 200, objectFit: 'cover' }} />
                  <button
                    onClick={capturePhoto}
                    style={{
                      width: '100%', padding: '10px 14px', background: '#f5a623', color: '#fff',
                      border: 0, borderRadius: 10, fontWeight: 700, cursor: 'pointer', fontSize: 14
                    }}
                  >
                    📷 Chụp lại
                  </button>
                </div>
              ) : (
                <button
                  onClick={capturePhoto}
                  style={{
                    width: '100%', padding: '10px 14px', background: '#d96b43', color: '#fff',
                    border: 0, borderRadius: 10, fontWeight: 700, cursor: 'pointer', fontSize: 14
                  }}
                >
                  📷 Chụp ảnh
                </button>
              )}
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handlePhotoSelected}
                style={{ display: 'none' }}
              />
            </div>

            {/* Error */}
            {error && (
              <div style={{
                marginBottom: 14, padding: 10, background: '#fee2e2', borderRadius: 10,
                color: '#b42318', fontWeight: 700, fontSize: 14
              }}>
                ⚠️ {error}
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setShowDeliveryModal(false)}
                disabled={busy}
                style={{
                  flex: 1, padding: '12px 16px', background: 'var(--surface-sunken)', color: 'var(--text-primary)',
                  border: 0, borderRadius: 10, fontWeight: 700, cursor: 'pointer', fontSize: 14
                }}
              >
                Huỷ
              </button>
              <button
                onClick={acceptDeliveryAssignment}
                disabled={busy || !gpsCoords || !photoFile}
                style={{
                  flex: 1, padding: '12px 16px', background: '#d96b43', color: '#fff',
                  border: 0, borderRadius: 10, fontWeight: 700, cursor: busy || !gpsCoords || !photoFile ? 'not-allowed' : 'pointer',
                  fontSize: 14, opacity: (busy || !gpsCoords || !photoFile) ? 0.5 : 1
                }}
              >
                {busy ? '⏳ Đang xử lý...' : '✓ Xác nhận Nhận Giao'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Chuyển giao cho Đơn vị Vận chuyển (Đội Vận Tải Ảo) */}
      {showThirdPartyModal && (
        <div onClick={() => !tpBusy && setShowThirdPartyModal(false)} style={{
          position: 'fixed', inset: 0, zIndex: 115, background: 'rgba(0,0,0,0.5)',
          display: 'flex', justifyContent: 'center', alignItems: 'flex-end'
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            width: '100%', maxWidth: 600, background: 'var(--surface-app)', borderRadius: '20px 20px 0 0',
            padding: 24, maxHeight: '85vh', overflowY: 'auto'
          }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: 18, color: 'var(--text-primary)', fontWeight: 900 }}>
              📦 Chuyển Giao Đơn Vị Vận Chuyển
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6, color: 'var(--text-secondary)' }}>Đơn vị vận chuyển</label>
                <select value={tpCarrier} onChange={(e) => setTpCarrier(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid var(--border-default)', fontSize: 14, background: 'var(--surface-app)', color: 'var(--text-primary)' }}>
                  {CARRIER_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              {tpCarrier === 'other' && (
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6, color: 'var(--text-secondary)' }}>Tên đơn vị (khác)</label>
                  <input value={tpCarrierOther} onChange={(e) => setTpCarrierOther(e.target.value)} placeholder="VD: J&T Express" style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid var(--border-default)', fontSize: 14 }} />
                </div>
              )}
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6, color: 'var(--text-secondary)' }}>Mã vận đơn (Tracking ID)</label>
                <input value={tpTrackingId} onChange={(e) => setTpTrackingId(e.target.value)} placeholder="VD: GHN123456789" style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid var(--border-default)', fontSize: 14 }} />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6, color: 'var(--text-secondary)' }}>Tên tài xế</label>
                  <input value={tpDriverName} onChange={(e) => setTpDriverName(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid var(--border-default)', fontSize: 14 }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6, color: 'var(--text-secondary)' }}>SĐT tài xế</label>
                  <input value={tpDriverPhone} onChange={(e) => setTpDriverPhone(e.target.value)} type="tel" style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid var(--border-default)', fontSize: 14 }} />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6, color: 'var(--text-secondary)' }}>Ghi chú</label>
                <textarea value={tpNotes} onChange={(e) => setTpNotes(e.target.value)} rows={2} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid var(--border-default)', fontSize: 14, resize: 'vertical' }} />
              </div>
            </div>

            {tpError && (
              <div style={{ marginTop: 14, padding: 10, background: '#fee2e2', borderRadius: 10, color: '#b42318', fontWeight: 700, fontSize: 14 }}>
                ⚠️ {tpError}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <button onClick={() => setShowThirdPartyModal(false)} disabled={tpBusy} style={{ flex: 1, padding: '12px 16px', background: 'var(--surface-sunken)', color: 'var(--text-primary)', border: 0, borderRadius: 10, fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
                Huỷ
              </button>
              <button onClick={submitHandOffToCarrier} disabled={tpBusy} style={{ flex: 1, padding: '12px 16px', background: '#1E88E5', color: '#fff', border: 0, borderRadius: 10, fontWeight: 700, cursor: tpBusy ? 'not-allowed' : 'pointer', fontSize: 14, opacity: tpBusy ? 0.6 : 1 }}>
                {tpBusy ? '⏳ Đang xử lý...' : '✓ Xác nhận chuyển giao'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Cập nhật trạng thái vận chuyển ĐVVC */}
      {showShipmentStatusModal && (
        <div onClick={() => !tpBusy && setShowShipmentStatusModal(false)} style={{
          position: 'fixed', inset: 0, zIndex: 115, background: 'rgba(0,0,0,0.5)',
          display: 'flex', justifyContent: 'center', alignItems: 'flex-end'
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            width: '100%', maxWidth: 600, background: 'var(--surface-app)', borderRadius: '20px 20px 0 0',
            padding: 24, maxHeight: '85vh', overflowY: 'auto'
          }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: 18, color: 'var(--text-primary)', fontWeight: 900 }}>
              🚚 Cập Nhật Trạng Thái Vận Chuyển
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
              {SHIPMENT_STATUS_OPTIONS.map((s) => (
                <button
                  key={s.value}
                  disabled={tpBusy}
                  onClick={() => submitShipmentStatus(s.value)}
                  style={{
                    minHeight: 48, border: `1.5px solid ${s.color}`, borderRadius: 12, fontWeight: 800,
                    background: data?.thirdPartyShipment?.manual_status === s.value ? s.color : '#fff',
                    color: data?.thirdPartyShipment?.manual_status === s.value ? '#fff' : s.color,
                    fontSize: 14, cursor: tpBusy ? 'not-allowed' : 'pointer',
                  }}
                >
                  {s.label}{s.value === 'that_bai' ? ' (đơn sẽ trả về "Chờ giao" để chuyển giao lại)' : ''}{s.value === 'da_hoan_thanh' ? ' (đơn sẽ đóng lại)' : ''}
                </button>
              ))}
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6, color: 'var(--text-secondary)' }}>Ghi chú (tuỳ chọn)</label>
              <textarea value={tpNotes} onChange={(e) => setTpNotes(e.target.value)} rows={2} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid var(--border-default)', fontSize: 14, resize: 'vertical' }} />
            </div>
            {tpError && (
              <div style={{ marginTop: 14, padding: 10, background: '#fee2e2', borderRadius: 10, color: '#b42318', fontWeight: 700, fontSize: 14 }}>
                ⚠️ {tpError}
              </div>
            )}
            <button onClick={() => setShowShipmentStatusModal(false)} disabled={tpBusy} style={{ marginTop: 14, width: '100%', padding: '12px 16px', background: 'var(--surface-sunken)', color: 'var(--text-primary)', border: 0, borderRadius: 10, fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
              Đóng
            </button>
          </div>
        </div>
      )}

      {/* Modal: Hoàn Thành Giao - GPS + Photo (lần 2) */}
      {showCompletionModal && (
        <div onClick={() => !busy && setShowCompletionModal(false)} style={{
          position: 'fixed', inset: 0, zIndex: 115, background: 'rgba(0,0,0,0.5)',
          display: 'flex', justifyContent: 'center', alignItems: 'flex-end'
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            width: '100%', maxWidth: 600, background: 'var(--surface-app)', borderRadius: '20px 20px 0 0',
            padding: 24, maxHeight: '85vh', overflowY: 'auto'
          }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: 18, color: 'var(--text-primary)', fontWeight: 900 }}>
              ✅ Hoàn Thành Giao Hàng
            </h3>

            {/* GPS Section (lần 2) */}
            <div style={{ marginBottom: 20, padding: 14, background: 'var(--surface-sunken)', borderRadius: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <MapPin size={20} color="#d96b43" />
                <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Xác định vị trí giao hàng</span>
              </div>
              {gpsCoords ? (
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>
                  ✅ Đã lấy: {gpsCoords.lat.toFixed(6)}, {gpsCoords.lng.toFixed(6)}<br/>
                  <small>Độ chính xác: ±{gpsCoords.accuracy.toFixed(1)}m</small>
                </div>
              ) : (
                <button
                  onClick={captureGPS}
                  disabled={busy}
                  style={{
                    width: '100%', padding: '10px 14px', background: '#d96b43', color: '#fff',
                    border: 0, borderRadius: 10, fontWeight: 700, cursor: 'pointer', fontSize: 14
                  }}
                >
                  📍 Bấm để lấy GPS hiện tại
                </button>
              )}
            </div>

            {/* Camera Section (lần 2) */}
            <div style={{ marginBottom: 20, padding: 14, background: 'var(--surface-sunken)', borderRadius: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <Camera size={20} color="#d96b43" />
                <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Chụp ảnh hoàn thành</span>
              </div>
              {photoPreview ? (
                <div>
                  <img src={photoPreview} alt="preview" style={{ width: '100%', borderRadius: 10, marginBottom: 10, maxHeight: 200, objectFit: 'cover' }} />
                  <button
                    onClick={capturePhoto}
                    style={{
                      width: '100%', padding: '10px 14px', background: '#f5a623', color: '#fff',
                      border: 0, borderRadius: 10, fontWeight: 700, cursor: 'pointer', fontSize: 14
                    }}
                  >
                    📷 Chụp lại
                  </button>
                </div>
              ) : (
                <button
                  onClick={capturePhoto}
                  style={{
                    width: '100%', padding: '10px 14px', background: '#d96b43', color: '#fff',
                    border: 0, borderRadius: 10, fontWeight: 700, cursor: 'pointer', fontSize: 14
                  }}
                >
                  📷 Chụp ảnh
                </button>
              )}
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handlePhotoSelected}
                style={{ display: 'none' }}
              />
            </div>

            {/* Error */}
            {error && (
              <div style={{
                marginBottom: 14, padding: 10, background: '#fee2e2', borderRadius: 10,
                color: '#b42318', fontWeight: 700, fontSize: 14
              }}>
                ⚠️ {error}
              </div>
            )}

            {(!data.order?.required_at || !data.order?.address || !data.order?.customers?.name || !data.order?.customers?.phone) && (
              <div style={{ marginBottom: 14, padding: 10, background: '#fff3cd', borderRadius: 10, color: '#7a5a00', fontWeight: 700, fontSize: 13 }}>
                ⚠️ Đơn còn thiếu: {[
                  !data.order?.required_at && 'giờ giao',
                  !data.order?.customers?.name && 'tên khách',
                  !data.order?.address && 'địa chỉ',
                  !data.order?.customers?.phone && 'số điện thoại',
                ].filter(Boolean).join(', ')} — vào "Sửa đơn" bổ sung trước khi hoàn thành.
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setShowCompletionModal(false)}
                disabled={busy}
                style={{
                  flex: 1, padding: '12px 16px', background: 'var(--surface-sunken)', color: 'var(--text-primary)',
                  border: 0, borderRadius: 10, fontWeight: 700, cursor: 'pointer', fontSize: 14
                }}
              >
                Huỷ
              </button>
              <button
                onClick={completeDelivery}
                disabled={busy || !gpsCoords || !photoFile || !data.order?.required_at || !data.order?.address || !data.order?.customers?.name || !data.order?.customers?.phone}
                style={{
                  flex: 1, padding: '12px 16px', background: '#28a745', color: '#fff',
                  border: 0, borderRadius: 10, fontWeight: 700, cursor: (busy || !gpsCoords || !photoFile || !data.order?.required_at || !data.order?.address || !data.order?.customers?.name || !data.order?.customers?.phone) ? 'not-allowed' : 'pointer',
                  fontSize: 14, opacity: (busy || !gpsCoords || !photoFile || !data.order?.required_at || !data.order?.address || !data.order?.customers?.name || !data.order?.customers?.phone) ? 0.5 : 1
                }}
              >
                {busy ? '⏳ Đang xử lý...' : '✅ Hoàn Thành Giao'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Xác Minh Thanh Toán — bắt buộc SAU khi Hoàn Thành Giao, trước
          khi đơn được tính vào Doanh thu thuần. Chuyển khoản: tải ảnh chụp
          màn hình có sẵn. Tiền mặt: bắt buộc chụp trực tiếp qua camera thiết
          bị (CameraPhotoField, không cho chọn ảnh cũ từ thư viện). */}
      {showPaymentVerifyModal && (
        <div onClick={() => !verifyBusy && setShowPaymentVerifyModal(false)} style={{
          position: 'fixed', inset: 0, zIndex: 116, background: 'rgba(0,0,0,0.5)',
          display: 'flex', justifyContent: 'center', alignItems: 'flex-end'
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            width: '100%', maxWidth: 600, background: 'var(--surface-app)', borderRadius: '20px 20px 0 0',
            padding: 24, maxHeight: '85vh', overflowY: 'auto'
          }}>
            <h3 style={{ margin: '0 0 6px 0', fontSize: 18, color: 'var(--text-primary)', fontWeight: 900 }}>
              💳 Xác Minh Thanh Toán
            </h3>
            <p style={{ margin: '0 0 18px', fontSize: 13, color: 'var(--text-secondary)' }}>
              Đơn đã giao xong — chỉ tính vào Doanh thu thuần sau khi xác minh đã thu tiền.
            </p>

            <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
              <button
                onClick={() => { setVerifyMethod('bank_transfer'); setVerifyProofUrl(''); setVerifyError(''); }}
                style={{
                  flex: 1, padding: '14px 10px', borderRadius: 14, fontWeight: 800, fontSize: 14, cursor: 'pointer',
                  border: verifyMethod === 'bank_transfer' ? '2px solid #d96b43' : '1px solid var(--border-subtle)',
                  background: verifyMethod === 'bank_transfer' ? '#fde8de' : 'var(--surface-sunken)',
                  color: verifyMethod === 'bank_transfer' ? '#d96b43' : 'var(--text-primary)',
                }}
              >
                🏦 Chuyển khoản
              </button>
              <button
                onClick={() => { setVerifyMethod('cod'); setVerifyProofUrl(''); setVerifyError(''); }}
                style={{
                  flex: 1, padding: '14px 10px', borderRadius: 14, fontWeight: 800, fontSize: 14, cursor: 'pointer',
                  border: verifyMethod === 'cod' ? '2px solid #d96b43' : '1px solid var(--border-subtle)',
                  background: verifyMethod === 'cod' ? '#fde8de' : 'var(--surface-sunken)',
                  color: verifyMethod === 'cod' ? '#d96b43' : 'var(--text-primary)',
                }}
              >
                💵 Tiền mặt
              </button>
            </div>

            {verifyMethod === 'bank_transfer' && (
              <div style={{ marginBottom: 18, padding: 14, background: 'var(--surface-sunken)', borderRadius: 14 }}>
                <PhotoField
                  url={verifyProofUrl}
                  onChange={setVerifyProofUrl}
                  label="Ảnh chụp màn hình chuyển khoản"
                  prefix={`orders/${orderId}/payment-proof`}
                />
              </div>
            )}
            {verifyMethod === 'cod' && (
              <div style={{ marginBottom: 18, padding: 14, background: 'var(--surface-sunken)', borderRadius: 14 }}>
                <CameraPhotoField
                  url={verifyProofUrl}
                  onChange={setVerifyProofUrl}
                  label="Chụp ảnh nhận tiền mặt trực tiếp"
                  prefix={`orders/${orderId}/payment-proof`}
                />
              </div>
            )}

            {verifyError && (
              <div style={{ marginBottom: 14, padding: 10, background: '#fee2e2', borderRadius: 10, color: '#b42318', fontWeight: 700, fontSize: 14 }}>
                ⚠️ {verifyError}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setShowPaymentVerifyModal(false)}
                disabled={verifyBusy}
                style={{ flex: 1, padding: '12px 16px', background: 'var(--surface-sunken)', color: 'var(--text-primary)', border: 0, borderRadius: 10, fontWeight: 700, cursor: 'pointer', fontSize: 14 }}
              >
                Để sau
              </button>
              <button
                onClick={verifyPayment}
                disabled={verifyBusy || !verifyMethod || !verifyProofUrl}
                style={{
                  flex: 1, padding: '12px 16px', background: '#28a745', color: '#fff', border: 0, borderRadius: 10, fontWeight: 700,
                  cursor: (verifyBusy || !verifyMethod || !verifyProofUrl) ? 'not-allowed' : 'pointer', fontSize: 14,
                  opacity: (verifyBusy || !verifyMethod || !verifyProofUrl) ? 0.5 : 1,
                }}
              >
                {verifyBusy ? '⏳ Đang xác minh...' : '✅ Xác Minh Thanh Toán'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Nhận đơn - Tự làm hoặc Giao nhân viên */}
      {showAcceptPackageModal && selectedPackage && (
        <div onClick={() => !busy && setShowAcceptPackageModal(false)} style={{
          position: 'fixed', inset: 0, zIndex: 115, background: 'rgba(0,0,0,0.5)',
          display: 'flex', justifyContent: 'center', alignItems: 'center'
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            width: '100%', maxWidth: 400, background: 'var(--surface-app)', borderRadius: 16,
            padding: 24, boxShadow: '0 10px 40px rgba(0,0,0,0.2)'
          }}>
            <h3 style={{ margin: '0 0 20px 0', fontSize: 18, color: 'var(--text-primary)', fontWeight: 900 }}>
              👨‍🍳 Nhận đơn - {selectedPackage.organization_units?.name}
            </h3>

            {/* Option 1: Tự làm */}
            <button
              disabled={busy}
              onClick={() => acceptPackageSelf(selectedPackage)}
              style={{
                width: '100%', padding: '16px', marginBottom: 10, background: '#d96b43', color: '#fff',
                border: 0, borderRadius: 12, fontWeight: 900, fontSize: 16, cursor: busy ? 'not-allowed' : 'pointer',
                opacity: busy ? 0.6 : 1
              }}
            >
              ✅ Tự làm
            </button>

            {/* Option 2: Giao nhân viên - with staff selection */}
            <div style={{ marginBottom: 10 }}>
              <select
                value={selectedStaff}
                onChange={(e) => setSelectedStaff(e.target.value)}
                disabled={busy}
                style={{
                  width: '100%', padding: '12px 10px', marginBottom: 10, borderRadius: 10,
                  border: '1px solid var(--border-default)', background: 'var(--surface-sunken)',
                  fontSize: 14, color: 'var(--text-primary)'
                }}
              >
                <option value="">
                  {staffLoading ? '⏳ Đang tải danh sách...' : staffOptions.length ? '👥 Chọn nhân viên để giao' : '⚠️ Bếp này chưa có nhân viên'}
                </option>
                {staffOptions.map(s => (
                  <option key={s.id} value={s.id}>{s.full_name}</option>
                ))}
              </select>
              <button
                disabled={busy || !selectedStaff}
                onClick={() => {
                  const staffName = staffOptions.find(s => s.id === selectedStaff)?.full_name || '';
                  acceptPackageDelegate(selectedPackage, selectedStaff, staffName);
                }}
                style={{
                  width: '100%', padding: '16px', background: '#1e88e5', color: '#fff',
                  border: 0, borderRadius: 12, fontWeight: 900, fontSize: 16,
                  cursor: (busy || !selectedStaff) ? 'not-allowed' : 'pointer',
                  opacity: (busy || !selectedStaff) ? 0.5 : 1
                }}
              >
                👥 Giao nhân viên
              </button>
            </div>

            {error && (
              <div style={{
                marginTop: 10, padding: 10, background: '#fee2e2', borderRadius: 10,
                color: '#b42318', fontWeight: 700, fontSize: 13
              }}>
                ⚠️ {error}
              </div>
            )}

            {/* Close button */}
            <button
              onClick={() => setShowAcceptPackageModal(false)}
              disabled={busy}
              style={{
                width: '100%', marginTop: 10, padding: '12px', background: 'var(--surface-sunken)',
                color: 'var(--text-primary)', border: 0, borderRadius: 10, fontWeight: 700,
                cursor: 'pointer', fontSize: 14
              }}
            >
              Huỷ
            </button>
          </div>
        </div>
      )}

      {/* Lightbox / Modal xem ảnh phóng to */}
      {zoomImage && (
        <div
          onClick={() => setZoomImage(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 120, background: 'rgba(0,0,0,0.88)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 16
          }}
        >
          <button
            onClick={() => setZoomImage(null)}
            style={{
              position: 'absolute', top: 16, right: 16, background: 'rgba(255,255,255,0.25)',
              border: 0, borderRadius: '50%', width: 44, height: 44, color: '#fff', fontSize: 24, cursor: 'pointer'
            }}
          >
            ×
          </button>
          <img
            src={zoomImage}
            alt="Phóng to ảnh mẫu bánh"
            style={{ maxWidth: '96%', maxHeight: '85vh', objectFit: 'contain', borderRadius: 12, boxShadow: '0 8px 30px rgba(0,0,0,0.5)' }}
            onClick={e => e.stopPropagation()}
          />
          <div style={{ color: '#fff', marginTop: 12, fontSize: 14 }}>
            Bấm bất kỳ đâu ngoài ảnh để đóng
          </div>
        </div>
      )}

      {showEditModal && (
        <EditOrderModal
          orderId={orderId}
          onClose={() => setShowEditModal(false)}
          onSaved={async () => { await load(); onChanged?.(); }}
        />
      )}
    </div>
  );
}
