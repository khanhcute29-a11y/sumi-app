import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { createOrderV2 } from '../lib/featureFlags';
import { useAuth } from '../lib/AuthContext';
import { newId } from '../lib/ids';
import { ORDER_FLOWS, CAKE_LINES, TEABREAK_CATALOG, normalizeSearch } from '../data/orderCatalogs';
import { SCHOOL_DELIVERY_POINTS } from '../data/schoolCatalog';

const fieldStyle={width:'100%',minHeight:58,border:'2px solid #d7c3aa',borderRadius:17,padding:'11px 14px',fontSize:18,background:'#fff',color:'#2d1c10',boxSizing:'border-box',opacity:1};

export default function CreateOrderV2Modal({onClose,onCreated,embedded=false}){
 const {profile}=useAuth(); const [type,setType]=useState(null); const [requiredAt,setRequiredAt]=useState('');
 const [customerName,setCustomerName]=useState(''); const [customerPhone,setCustomerPhone]=useState('');
 const [fulfillment,setFulfillment]=useState('delivery'); const [address,setAddress]=useState(''); const [note,setNote]=useState('');
 const [items,setItems]=useState([]); const [photos,setPhotos]=useState([]); const [saving,setSaving]=useState(false); const [error,setError]=useState('');
 const [catalogSearch,setCatalogSearch]=useState(''); const [guestCount,setGuestCount]=useState('');
 const [schoolSearch,setSchoolSearch]=useState(''); const [selectedSchool,setSelectedSchool]=useState(null);
 const [entryMode,setEntryMode]=useState('manual'); const [cakeLine,setCakeLine]=useState('decorated_cake');
 const change=(i,key,value)=>setItems(x=>x.map((it,n)=>n===i?{...it,[key]:value}:it));
 const spec=(i,key,value)=>setItems(x=>x.map((it,n)=>n===i?{...it,specification:{...it.specification,[key]:value}}:it));
 const selectFlow=(key)=>{setType(key);setItems(key==='teabreak'?[]:[{name:'',quantity:1,unit:'cái',specification:key==='cake'?{cake_line:cakeLine}:{}}]);};
 const changeCakeLine=(key)=>{setCakeLine(key);setItems(current=>current.map(item=>({...item,specification:{...item.specification,cake_line:key}})));};
 const addCatalogItem=(product)=>{setItems(current=>{
  const found=current.findIndex(x=>x.catalog_code===product.code);
  if(found>=0)return current.map((x,i)=>i===found?{...x,quantity:Number(x.quantity||0)+1}:x);
  return [...current,{catalog_code:product.code,name:product.name,quantity:1,unit:'cái',specification:{catalog_specification:product.specification,group:product.group}}];
 });setCatalogSearch('');};
 const flow=ORDER_FLOWS.find(x=>x.key===type);
 const suggestions=TEABREAK_CATALOG.filter(x=>!catalogSearch||normalizeSearch(`${x.code} ${x.name} ${x.group}`).includes(normalizeSearch(catalogSearch))).slice(0,8);
 const schoolSuggestions=SCHOOL_DELIVERY_POINTS.filter(x=>!schoolSearch||normalizeSearch(`${x.code} ${x.name} ${x.address} ${x.type}`).includes(normalizeSearch(schoolSearch))).slice(0,10);
 const chooseSchool=(school)=>{setSelectedSchool(school);setCustomerName(school.name);setAddress(school.address);setSchoolSearch('');};
 const submit=async()=>{setError('');setSaving(true);try{
  if(type==='school'&&!selectedSchool)throw new Error('Vui lòng chọn trường hoặc điểm giao.');
  if(!items.length||items.some(x=>!x.name||Number(x.quantity)<=0))throw new Error('Vui lòng nhập đủ tên bánh và số lượng.');
  const key=newId(); const orderCode=`SUMI-${new Date().toISOString().slice(2,10).replaceAll('-','')}-${Date.now().toString().slice(-4)}`;
  const customerNote=[customerName&&`Khách hàng: ${customerName}`,customerPhone&&`SĐT: ${customerPhone}`,type==='teabreak'&&guestCount&&`Số khách: ${guestCount}`,note].filter(Boolean).join(' · ');
  const orderId=await createOrderV2({p_idempotency_key:key,p_order_code:orderCode,p_order_type:type,p_customer_id:null,p_required_at:requiredAt?new Date(requiredAt).toISOString():null,p_fulfillment_method:fulfillment,p_address:fulfillment==='delivery'?address:null,p_note:customerNote||null,p_confidentiality:type==='school'?'school_restricted':'normal',p_items:items});
  for(const file of photos){const path=`orders/${orderId}/customer/${newId()}-${file.name}`;const up=await supabase.storage.from('uploads').upload(path,file);if(up.error)throw up.error;const row=await supabase.from('order_attachments').insert({order_id:orderId,attachment_type:'customer_sample',storage_path:path,mime_type:file.type,size_bytes:file.size,created_by:profile.id});if(row.error)throw row.error;}
  onCreated?.(orderId);onClose();
 }catch(e){setError(e.message||'Không thể tạo đơn');}finally{setSaving(false);}};
 if(!type)return <div className={embedded?'sumi-order-create-page':'sumi-order-create-overlay'} onClick={embedded?undefined:onClose}>
  <div className="sumi-order-create-body sumi-flow-picker" onClick={e=>e.stopPropagation()}>
   <div className="sumi-create-head"><button onClick={onClose} aria-label="Quay lại">←</button><h2>Tạo đơn mới</h2></div>
   <div className="sumi-create-intro"><strong>Đơn này thuộc loại nào?</strong><span>Chọn đúng loại để chỉ hiện những thông tin cần nhập.</span></div>
   <div className="sumi-flow-grid">{ORDER_FLOWS.map(item=><button key={item.key} onClick={()=>selectFlow(item.key)}><b>{item.icon}</b><strong>{item.title}</strong><span>{item.subtitle}</span></button>)}</div>
   <div className="sumi-entry-title"><strong>Cách nhập đơn</strong><span>Chọn trước hoặc bổ sung ảnh sau</span></div>
   <div className="sumi-entry-grid"><button className={entryMode==='photo'?'active':''} onClick={()=>setEntryMode('photo')}>📷<span>Chụp đơn</span></button><button className={entryMode==='voice'?'active':''} onClick={()=>setEntryMode('voice')}>🎤<span>Nói để nhập</span></button></div>
   {entryMode!=='manual'&&<div className="sumi-entry-note">Đã chọn {entryMode==='photo'?'chụp ảnh':'nhập bằng giọng nói'}. Bây giờ chọn loại đơn ở phía trên.</div>}
  </div></div>;
 return <div className={embedded?'sumi-order-create-page':'sumi-order-create-overlay'} onClick={embedded?undefined:onClose}>
  <div className="sumi-order-create-body" onClick={e=>e.stopPropagation()}>
   <div className="sumi-create-head"><button onClick={()=>setType(null)} aria-label="Chọn lại loại đơn">←</button><h2>{flow?.icon} {flow?.title}</h2></div>
   <button className="sumi-change-flow" onClick={()=>setType(null)}>Đổi loại đơn</button>
   {entryMode!=='manual'&&<div className="sumi-entry-note">{entryMode==='photo'?'📷 Đơn được nhập từ ảnh — cần kiểm tra trước khi tạo':'🎤 Đơn được nhập bằng giọng nói — cần xác nhận lại nội dung'}</div>}
   <p style={{color:'#725f50',fontWeight:700}}>Người tạo: {profile?.full_name||'Nhân viên'} · tự lưu ngày giờ</p>
   {type==='school'&&<section className="sumi-catalog-picker sumi-school-picker">
    <label>Tìm trường hoặc điểm giao</label><input style={fieldStyle} placeholder="Gõ HC 5, Hoa Cúc, Dĩ An…" value={schoolSearch} onChange={e=>setSchoolSearch(e.target.value)}/>
    {!selectedSchool&&<div className="sumi-school-results">{schoolSuggestions.map(school=><button key={`${school.code}-${school.name}`} onClick={()=>chooseSchool(school)}><b>🏫</b><span><strong>{school.name}</strong><small>{school.code} · {school.type}</small><em>{school.address||'Chưa có địa chỉ — cần bổ sung'}</em></span></button>)}</div>}
    {selectedSchool&&<div className="sumi-school-selected"><b>✓</b><span><strong>{selectedSchool.name}</strong><small>{selectedSchool.code} · {selectedSchool.type}</small><em>{selectedSchool.address||'Chưa có địa chỉ'}</em></span><button onClick={()=>setSelectedSchool(null)}>Đổi</button></div>}
   </section>}
   {type!=='school'&&<><label style={{display:'block',fontWeight:900}}>Khách hàng</label><input style={{...fieldStyle,margin:'7px 0 12px'}} placeholder="Tên khách hàng" value={customerName} onChange={e=>setCustomerName(e.target.value)}/>
   <label style={{display:'block',fontWeight:900}}>Số điện thoại</label><input style={{...fieldStyle,margin:'7px 0 14px'}} inputMode="tel" placeholder="Số điện thoại khách" value={customerPhone} onChange={e=>setCustomerPhone(e.target.value)}/></>}
   {type==='teabreak'&&<section className="sumi-catalog-picker">
    <label>Số khách dự kiến</label><input style={fieldStyle} type="number" min="1" inputMode="numeric" placeholder="Ví dụ: 80 hoặc 1500" value={guestCount} onChange={e=>setGuestCount(e.target.value)}/>
    <label>Chọn món bằng tên hoặc mã</label><input style={fieldStyle} placeholder="Gõ su kem, bánh mặn, SM30…" value={catalogSearch} onChange={e=>setCatalogSearch(e.target.value)}/>
    <div className="sumi-catalog-results">{suggestions.map(product=><button key={product.code} onClick={()=>addCatalogItem(product)}><b>＋</b><span><strong>{product.name}</strong><small>{product.code} · {product.specification} · {product.group}</small></span></button>)}</div>
   </section>}
   {type==='cake'&&<section className="sumi-cake-line"><label>Chọn dòng bánh</label><div>{CAKE_LINES.map(line=><button className={cakeLine===line.key?'active':''} key={line.key} onClick={()=>changeCakeLine(line.key)}><strong>{line.label}</strong><span>{line.note}</span></button>)}</div>{cakeLine==='cold_cake'&&<p>❄️ Bếp lạnh phụ trách · phải ghi điều kiện bảo quản và thời gian lấy khỏi tủ lạnh.</p>}</section>}
   <div className="sumi-selected-head"><strong>{type==='teabreak'?'Món đã chọn':'Sản phẩm và số lượng'}</strong><span>{items.length} món</span></div>
   {items.map((it,i)=><div key={i} style={{padding:12,border:'1px solid var(--border-default)',borderRadius:16,marginBottom:10,background:'var(--surface-card)'}}>
    <div style={{display:'flex',gap:8}}><input style={fieldStyle} placeholder="Tên bánh/sản phẩm" value={it.name} onChange={e=>change(i,'name',e.target.value)}/><input style={{...fieldStyle,width:90}} type="number" min="1" value={it.quantity} onChange={e=>change(i,'quantity',Number(e.target.value))}/></div>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginTop:8}}>
     {type==='cake'&&<><input style={fieldStyle} placeholder="Size (18cm...)" onChange={e=>spec(i,'size',e.target.value)}/><input style={fieldStyle} placeholder="Chữ trên bánh" onChange={e=>spec(i,'content',e.target.value)}/></>}
     {type==='bakery'&&<><input style={fieldStyle} placeholder="Dòng bánh: Trung Thu, bánh pía…" onChange={e=>spec(i,'product_line',e.target.value)}/><input style={fieldStyle} placeholder="Quy cách/nhân/đóng gói" onChange={e=>spec(i,'packing',e.target.value)}/></>}
     {type==='teabreak'&&<><input style={fieldStyle} value={it.specification?.catalog_specification||''} placeholder="Quy cách" onChange={e=>spec(i,'catalog_specification',e.target.value)}/><input style={fieldStyle} placeholder="Khay/ghi chú" onChange={e=>spec(i,'packing',e.target.value)}/></>}
     {type==='macaron'&&<><input style={fieldStyle} placeholder="Màu" onChange={e=>spec(i,'color',e.target.value)}/><input style={fieldStyle} placeholder="Vị" onChange={e=>spec(i,'flavor',e.target.value)}/></>}
     {type==='school'&&<><input style={fieldStyle} placeholder="Quy cách" onChange={e=>spec(i,'spec',e.target.value)}/><input style={fieldStyle} placeholder="Khối/lớp/ghi chú" onChange={e=>spec(i,'grade_note',e.target.value)}/></>}
    </div>{items.length>1&&<button onClick={()=>setItems(x=>x.filter((_,n)=>n!==i))} style={{marginTop:8,color:'#b42318',border:0,background:'none'}}>Xóa sản phẩm</button>}
   </div>)}
   {items.length===0&&<div className="sumi-no-selection">Chưa chọn món. Tìm món phía trên hoặc thêm món tùy chỉnh.</div>}
   <button onClick={()=>setItems(x=>[...x,{name:'',quantity:1,unit:'cái',specification:{custom:true}}])} style={{...fieldStyle,fontWeight:900,borderStyle:'dashed'}}>＋ Thêm món khác</button>
   <label style={{display:'block',marginTop:14,fontWeight:800}}>Ngày giờ cần giao</label><input style={fieldStyle} type="datetime-local" value={requiredAt} onChange={e=>setRequiredAt(e.target.value)}/>
   <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginTop:12}}><button onClick={()=>setFulfillment('delivery')} style={{...fieldStyle,fontWeight:900,border:fulfillment==='delivery'?'3px solid #138a53':fieldStyle.border,background:fulfillment==='delivery'?'#e6f6ed':'#fff',color:fulfillment==='delivery'?'#09663d':'#2d1c10'}}>🛵 Giao tận nơi</button><button onClick={()=>setFulfillment('pickup')} style={{...fieldStyle,fontWeight:900,border:fulfillment==='pickup'?'3px solid #138a53':fieldStyle.border,background:fulfillment==='pickup'?'#e6f6ed':'#fff',color:fulfillment==='pickup'?'#09663d':'#2d1c10'}}>🏬 Nhận tại quầy</button></div>
   {fulfillment==='delivery'&&<input style={{...fieldStyle,marginTop:10}} placeholder="Địa chỉ giao" value={address} onChange={e=>setAddress(e.target.value)}/>}<textarea style={{...fieldStyle,marginTop:10,minHeight:82}} placeholder="Ghi chú" value={note} onChange={e=>setNote(e.target.value)}/>
   <label style={{display:'block',marginTop:16,fontWeight:900,fontSize:18}}>Ảnh mẫu khách gửi</label><div className="sumi-upload-grid"><label>📷<span>Chụp ảnh</span><input hidden type="file" accept="image/*" capture="environment" multiple onChange={e=>setPhotos([...photos,...e.target.files])}/></label><label>🖼️<span>Chọn ảnh có sẵn</span><input hidden type="file" accept="image/*" multiple onChange={e=>setPhotos([...photos,...e.target.files])}/></label></div><div style={{color:'#725f50',fontWeight:700,marginBottom:8}}>{photos.length?`${photos.length} ảnh đã chọn`:'Chưa có ảnh'}</div>
   {type==='school'&&<div style={{padding:12,marginTop:12,borderRadius:14,background:'#fff3cd',fontWeight:700}}>Đơn trường học không nhập và không hiển thị giá.</div>}{error&&<div style={{color:'#b42318',marginTop:10}}>{error}</div>}
   <button disabled={saving} onClick={submit} style={{width:'100%',minHeight:66,marginTop:18,border:0,borderRadius:18,background:saving?'#c7b6a3':'#ef642b',color:'#fff',fontSize:20,fontWeight:950,boxShadow:saving?'none':'0 7px 0 #b93e13',opacity:1}}>{saving?'ĐANG TẠO...':'TẠO ĐƠN HÀNG'}</button>
  </div></div>;
}
