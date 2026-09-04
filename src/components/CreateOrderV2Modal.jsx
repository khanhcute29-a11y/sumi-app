import React, { useEffect, useRef, useState } from 'react';
import { useOrderDraftAutosave, DraftSaveIndicator, listOrderDrafts, deleteOrderDraft } from '../lib/useDraftAutosave';
import { supabase } from '../lib/supabaseClient';
import { createOrderV2 } from '../lib/featureFlags';
import { useAuth } from '../lib/AuthContext';
import { newId } from '../lib/ids';
import { ORDER_FLOWS, CAKE_LINES, TEABREAK_CATALOG, MOONCAKE_CATALOG, normalizeSearch } from '../data/orderCatalogs';
import { SCHOOL_DELIVERY_POINTS } from '../data/schoolCatalog';
import { CAKE_BASES, CAKE_FILLINGS, baseSurcharge } from '../lib/cakePricing';
import { broadcastEvent, BroadcastEvents, notifyOtherTabs } from '../lib/realtimeSync';

const PAYMENT_METHODS = [{ value: 'cod', label: 'COD (thu khi giao)' }, { value: 'bank_transfer', label: 'Chuyển khoản' }, { value: 'cash', label: 'Tiền mặt' }];

const fieldStyle={width:'100%',minHeight:58,border:'2px solid #d7c3aa',borderRadius:17,padding:'11px 14px',fontSize:18,background:'#fff',color:'#2d1c10',boxSizing:'border-box',opacity:1};
const fmtMoney=v=>{const digits=String(v??'').replace(/\D/g,'');return digits?Number(digits).toLocaleString('vi-VN'):''};
const parseMoney=v=>{const digits=String(v??'').replace(/\D/g,'');return digits?Number(digits):null};

const categoryLabel=(value='')=>value.replaceAll('_',' ').replace(/\b\w/g,x=>x.toUpperCase());
const FLOW_WORDS={macaron:['macaron'],cake:['kem','mousse','mouse','tiramisu','su kem','banh lanh'],bakery:['banh mi','banh pia','banh quy','trung thu','btt','croissant','donut'],school:['banh mi','banh ngot','banh man'],teabreak:['teabreak']};
const MACARON_COLORS=['Đỏ','Hồng','Xanh dương nhạt','Trắng','Tím','Cam','Vàng đậm','Xanh lá','Đen','Nâu','Vàng nhạt','Xanh dương đậm'];
const MACARON_FILLINGS=['Việt quất','Chanh dây','Đào','Dưa lưới','Vải','Socola','Kiwi','Thơm','Dâu','Chanh','Xoài','Phúc bồn tử'];
function parseTierRange(label=''){
 const s=label.toLowerCase();
 let m=s.match(/(\d+)\s*-\s*(\d+)/); if(m) return [Number(m[1]),Number(m[2])];
 m=s.match(/[≥>=]{1,2}\s*(\d+)/); if(m) return [Number(m[1]),Infinity];
 m=s.match(/<\s*(\d+)/); if(m) return [0,Number(m[1])-1];
 return null;
}
function MultiChipPicker({options,selected,onToggle}){
 return <div style={{display:'flex',flexWrap:'wrap',gap:6}}>{options.map(o=>{const active=selected.includes(o);return <button type="button" key={o} onClick={()=>onToggle(o)} style={{minHeight:38,padding:'6px 12px',borderRadius:999,fontSize:13,fontWeight:700,cursor:'pointer',border:active?'2px solid #d96b43':'1px solid var(--border-default)',background:active?'#fdece3':'#fff',color:active?'#b93e13':'#2d1c10'}}>{active?'✓ ':''}{o}</button>})}</div>;
}
function ProductNameField({item,products,flowType,onChange}){
 const [open,setOpen]=useState(false); const wrap=useRef(null); const query=normalizeSearch(item.name||'');
 useEffect(()=>{if(!open)return;const close=e=>{if(wrap.current&&!wrap.current.contains(e.target))setOpen(false)};document.addEventListener('pointerdown',close);return()=>document.removeEventListener('pointerdown',close)},[open]);
 const scoped=flowType==='school'
  ?products.filter(p=>p.category==='school')
  :flowType==='macaron'
  ?products.filter(p=>p.category==='macaron')
  :products.filter(p=>!['school','macaron'].includes(p.category)&&FLOW_WORDS[flowType]?.some(word=>normalizeSearch(`${p.name} ${p.category||''}`).includes(normalizeSearch(word))));
 const matches=scoped.filter(p=>!query||normalizeSearch(`${p.name} ${p.category||''}`).includes(query)).slice(0,10);
 const choose=(p)=>{const variants=p.product_variants||[];onChange({name:p.name,product_id:p.id,unit:p.unit||item.unit||'cái',variants,unit_price:variants.length?null:(p.price??null),specification:{...(item.specification||{}),size:variants.length?'':(item.specification?.size),catalog_category:p.category||null,catalog_price:variants.length?null:(p.price??null)}});setOpen(false);};
 return <div className="sumi-product-combobox" ref={wrap}>
  <input style={fieldStyle} autoComplete="off" placeholder="Gõ tên bánh để tìm hoặc nhập mới" value={item.name||''} onFocus={()=>setOpen(true)} onChange={e=>{onChange({name:e.target.value,product_id:null,variants:[]});setOpen(true)}} aria-expanded={open}/>
  {open&&<div className="sumi-product-options">
   {matches.map(p=><button type="button" key={p.id} onClick={()=>choose(p)}><span>🍰</span><b>{p.name}</b><small>{categoryLabel(p.category||'Sản phẩm')} · {p.unit||'cái'}{p.product_variants?.length?` · ${p.product_variants.length} size`:''}</small></button>)}
   {item.name?.trim()&&<button type="button" className="manual" onClick={()=>setOpen(false)}><span>✍️</span><b>Dùng tên “{item.name.trim()}”</b><small>Chưa có trong danh sách · vẫn tạo đơn bình thường</small></button>}
   {!matches.length&&!item.name?.trim()&&<p>Gõ một phần tên bánh để tìm.</p>}
  </div>}
 </div>;
}

function OrderPreviewV2({type,customerName,customerPhone,selectedSchool,items,guestCount,fulfillment,address,requiredAt,note,itemsTotal,shipFee,paymentMethod,deposit,grandTotal,remaining,discountAmount,promotionNote,taxCode,vatAmount}){
 const itemSpecLine=(it)=>{
  const s=it.specification||{};
  const fillingLabel=CAKE_FILLINGS.find(f=>f.value===s.filling)?.label;
  const parts=[s.size,s.cot,fillingLabel,s.content&&`chữ: ${s.content}`,s.candle&&`nến: ${s.candle}`,s.packing,s.colors?.length&&`màu: ${s.colors.join(', ')}`,s.fillings?.length&&`nhân: ${s.fillings.join(', ')}`,s.color,s.flavor,s.spec,s.catalog_specification].filter(Boolean);
  return parts.join(', ');
 };
 const displayName=type==='school'?(selectedSchool?.name||customerName):customerName;
 return <div style={{display:'flex',flexDirection:'column',gap:10,background:'#f5f1eb',borderRadius:17,padding:16,border:'2px solid #e0d5c7'}}>
  <div style={{fontSize:12,color:'#8c5a3c',fontWeight:800,display:'flex',alignItems:'center',gap:4}}>👁 XEM TRƯỚC ĐƠN HÀNG</div>
  <div style={{fontWeight:900,color:'#2d1c10',fontSize:16}}>{displayName||'Khách chưa đặt tên'}</div>
  {customerPhone&&type!=='school'&&<div style={{fontSize:13,color:'#725f50'}}>📞 {customerPhone}</div>}
  {type==='teabreak'&&guestCount&&<div style={{fontSize:13,color:'#725f50'}}>👥 {guestCount} khách</div>}
  {items.length===0?<div style={{fontSize:13,color:'#725f50'}}>Chưa có sản phẩm nào</div>:
  <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
   <thead><tr style={{borderBottom:'1.5px dashed #c7b6a3'}}>
    <th style={{textAlign:'left',padding:'4px 4px 6px',color:'#8c5a3c',fontWeight:800}}>Sản phẩm</th>
    <th style={{textAlign:'center',padding:'4px 4px 6px',color:'#8c5a3c',fontWeight:800}}>SL</th>
    {type!=='school'&&<th style={{textAlign:'right',padding:'4px 4px 6px',color:'#8c5a3c',fontWeight:800}}>Đơn giá</th>}
    {type!=='school'&&<th style={{textAlign:'right',padding:'4px 4px 6px',color:'#8c5a3c',fontWeight:800}}>Thành tiền</th>}
   </tr></thead>
   <tbody>{items.map((it,i)=>{const spec=itemSpecLine(it);const price=Number(it.unit_price)||0;const qty=Number(it.quantity)||0;return(
    <tr key={it.id||i} style={{borderBottom:'1px dashed #e0d5c7'}}>
     <td style={{padding:'6px 4px',color:'#2d1c10',verticalAlign:'top'}}>
      <div style={{fontWeight:700}}>{it.name?.trim()||'(chưa đặt tên)'}</div>
      {spec&&<div style={{fontSize:11,color:'#8c5a3c'}}>{spec}</div>}
     </td>
     <td style={{padding:'6px 4px',textAlign:'center',color:'#2d1c10',verticalAlign:'top'}}>{qty}{it.unit&&it.unit!=='cái'?` ${it.unit}`:''}</td>
     {type!=='school'&&<td style={{padding:'6px 4px',textAlign:'right',color:'#2d1c10',verticalAlign:'top'}}>{price?price.toLocaleString('vi-VN'):'—'}</td>}
     {type!=='school'&&<td style={{padding:'6px 4px',textAlign:'right',color:'#2d1c10',fontWeight:700,verticalAlign:'top'}}>{price?(price*qty).toLocaleString('vi-VN'):'—'}</td>}
    </tr>
   );})}</tbody>
  </table>}
  <div style={{fontSize:13,color:'#725f50'}}>{fulfillment==='delivery'?'🛵 Giao hàng tận nơi':'🏬 Nhận tại quầy'}{fulfillment==='delivery'&&` · Ship: ${shipFee?`${shipFee.toLocaleString('vi-VN')}đ`:'Miễn phí'}`}</div>
  {fulfillment==='delivery'&&address&&<div style={{fontSize:13,color:'#725f50'}}>📍 {address}</div>}
  {requiredAt&&<div style={{fontSize:13,color:'#725f50'}}>🕒 {new Date(requiredAt).toLocaleString('vi-VN')}</div>}
  {type!=='school'&&<div style={{display:'flex',flexDirection:'column',gap:4,paddingTop:8,borderTop:'1px solid #e0d5c7'}}>
   <div style={{display:'flex',justifyContent:'space-between',color:'#725f50',fontSize:13}}><span>Tiền hàng</span><span>{itemsTotal.toLocaleString('vi-VN')}đ</span></div>
   {discountAmount>0&&<div style={{display:'flex',justifyContent:'space-between',color:'#b42318',fontSize:13}}><span>Chiết khấu</span><span>−{discountAmount.toLocaleString('vi-VN')}đ</span></div>}
   {vatAmount>0&&<div style={{display:'flex',justifyContent:'space-between',color:'#725f50',fontSize:13}}><span>VAT 8%</span><span>+{vatAmount.toLocaleString('vi-VN')}đ</span></div>}
   <div style={{display:'flex',justifyContent:'space-between',fontWeight:900,color:'#2d1c10'}}><span>Tổng tiền</span><span>{grandTotal?`${grandTotal.toLocaleString('vi-VN')}đ`:'0 đồng'}</span></div>
   <div style={{display:'flex',justifyContent:'space-between',color:'#725f50',fontSize:13}}><span>Đặt cọc</span><span>{deposit?`${deposit.toLocaleString('vi-VN')}đ`:'0 đồng'}</span></div>
   <div style={{display:'flex',justifyContent:'space-between',color:'#725f50',fontSize:13}}><span>Còn lại</span><span>{remaining.toLocaleString('vi-VN')}đ</span></div>
   <div style={{fontSize:11,color:'#8c5a3c'}}>Thanh toán: <span style={{fontWeight:700}}>{PAYMENT_METHODS.find(p=>p.value===paymentMethod)?.label}</span></div>
  </div>}
  {promotionNote&&<div style={{fontSize:13,color:'#725f50'}}>🎁 Khuyến mãi: {promotionNote}</div>}
  {taxCode&&<div style={{fontSize:13,color:'#725f50'}}>🧾 MST: {taxCode}</div>}
  {note&&<div style={{fontSize:13,color:'#725f50'}}>📝 {note}</div>}
 </div>;
}

export default function CreateOrderV2Modal({onClose,onCreated,embedded=false,resumeDraftId=null}){
 const {profile}=useAuth();
 const isOwnerAdmin=['owner','admin'].includes(profile?.role)||(profile?.extra_roles||[]).some(r=>['owner','admin'].includes(r));
 const isDirector=isOwnerAdmin||['deputy_director_x42'].includes(profile?.role)||(profile?.extra_roles||[]).some(r=>['deputy_director_x42'].includes(r));
 const isMacaronCreator=isOwnerAdmin||['deputy_director_x41'].includes(profile?.role)||(profile?.extra_roles||[]).some(r=>['deputy_director_x41'].includes(r));
 const visibleFlows=ORDER_FLOWS.filter(f=>(f.key!=='school'||isDirector)&&(f.key!=='macaron'||isMacaronCreator));
 const [type,setType]=useState(null); const [requiredAt,setRequiredAt]=useState('');
 const [customerName,setCustomerName]=useState(''); const [customerPhone,setCustomerPhone]=useState('');
 const [fulfillment,setFulfillment]=useState('delivery'); const [address,setAddress]=useState(''); const [note,setNote]=useState('');
 // Vị trí xưởng xuất đơn — KHÁC với "Địa chỉ" ở trên (địa chỉ nhà khách để
 // shipper tìm tới). Chỉ là thông tin ghi chú nội bộ (vào `note`), KHÔNG ảnh
 // hưởng cách chia kho/bếp — việc đó đã tự động theo category sản phẩm
 // (xem branchForCategory trong cakePricing.js), không nên có 2 nguồn quyết
 // trùng nhau kẻo đá nhau.
 const [viTriXuong,setViTriXuong]=useState('Quốc Lộ 13'); const [viTriKhac,setViTriKhac]=useState('');
 const [items,setItems]=useState([]); const [photos,setPhotos]=useState([]); const [saving,setSaving]=useState(false); const [error,setError]=useState('');
 const [showLibraryPicker,setShowLibraryPicker]=useState(false); const [libraryPhotos,setLibraryPhotos]=useState([]); const [libraryLoading,setLibraryLoading]=useState(false); const [selectedLibraryPhotos,setSelectedLibraryPhotos]=useState([]); const [libraryUploading,setLibraryUploading]=useState(false);
 const [isReadyStock, setIsReadyStock] = useState(false);
 const [tonKho,setTonKho]=useState(null);
 // Bánh có sẵn: soi kho NGAY khi tick, để nhân viên thấy còn mấy cái trước khi
 // bấm tạo — thay vì chọn xong mới bị chặn. Cách khớp size ở đây phải GIỐNG HỆT
 // hàm check_finished_goods_stock dưới database: không chọn size thì cộng tất
 // cả các size của sản phẩm đó.
 useEffect(()=>{
  if(!isReadyStock){setTonKho(null);return;}
  const ds=items.filter(it=>it.product_id&&(Number(it.quantity)||0)>0);
  if(!ds.length){setTonKho([]);return;}
  let huy=false;
  (async()=>{
   try{
    const ids=[...new Set(ds.map(it=>it.product_id))];
    const {data,error:err}=await supabase.from('finished_goods_stock').select('product_id,size,qty').in('product_id',ids);
    if(err)throw err;
    if(huy)return;
    setTonKho(ds.map(it=>{
     const sz=it.specification?.size||null;
     const con=(data||[]).filter(r=>r.product_id===it.product_id&&(!sz||(r.size||null)===sz))
                         .reduce((tong,r)=>tong+Number(r.qty||0),0);
     return {ten:it.name||'Sản phẩm',size:sz,can:Number(it.quantity)||0,con};
    }));
   }catch(e){if(!huy)setTonKho('loi');}
  })();
  return()=>{huy=true;};
 },[isReadyStock,items]);
 const [catalogSearch,setCatalogSearch]=useState(''); const [guestCount,setGuestCount]=useState('');
 const [schoolSearch,setSchoolSearch]=useState(''); const [selectedSchool,setSelectedSchool]=useState(null);
 const [entryMode,setEntryMode]=useState('manual'); const [cakeLine,setCakeLine]=useState('decorated_cake');
 const [hasShipFee,setHasShipFee]=useState('no'); const [shipFee,setShipFee]=useState('');
 const [paymentMethod,setPaymentMethod]=useState('cod'); const [deposit,setDeposit]=useState('');
 // Chiết khấu/khuyến mãi/mã số thuế/VAT — áp dụng cho Bánh kem, Bánh mặn/ngọt,
 // Teabreak, Macaron (ban đầu chỉ Macaron theo yêu cầu Nga Rubi 30/08/2026, mở
 // rộng thêm 3 luồng còn lại theo yêu cầu chủ shop). KHÔNG áp dụng cho đơn
 // trường học — trường học dùng cơ chế Công Nợ Khách Hàng riêng (VAT tính SAU
 // lúc giao hàng, ghi sổ riêng), không phải VAT/chiết khấu cộng/trừ thẳng vào
 // tổng đơn ngay lúc tạo như ở đây. type không bao giờ là 'mixed' cục bộ (luôn
 // là flow đầu tiên được chọn: cake/bakery/teabreak/macaron), và trường học
 // không bao giờ gộp được với nhóm khác (xem addFlow), nên chỉ cần loại trừ
 // đúng 'school' là đủ, không cần liệt kê danh sách flow được phép.
 const [discountAmount,setDiscountAmount]=useState(''); const [promotionNote,setPromotionNote]=useState('');
 const [taxCode,setTaxCode]=useState(''); const [vatEnabled,setVatEnabled]=useState(false);
 const [productCatalog,setProductCatalog]=useState([]);
 const [isMobile,setIsMobile]=useState(typeof window!=='undefined'?window.innerWidth<860:false);
 const [isRecording,setIsRecording]=useState(false); const [voiceLoading,setVoiceLoading]=useState(false);
 // Tự động lưu nháp: chỉ các field kiểu văn bản/số/mảng dữ liệu (KHÔNG đưa
 // `photos` — mảng File — vào đây, ảnh không khôi phục được sau khi tải lại
 // trang). Khôi phục xong người dùng vẫn cần chọn/chụp lại ảnh nếu có.
 // Nháp: mỗi đơn đang soạn có 1 draftId riêng (sinh mới khi chọn loại đơn,
 // hoặc truyền vào từ danh sách "Nháp đã lưu" để tiếp tục đúng đơn đó) — nhiều
 // đơn bỏ dở cùng lúc không ghi đè lên nhau.
 const [activeDraftId,setActiveDraftId]=useState(resumeDraftId);
 const draftValues={type,requiredAt,customerName,customerPhone,fulfillment,address,note,items,isReadyStock,guestCount,selectedSchool,entryMode,cakeLine,hasShipFee,shipFee,paymentMethod,deposit,selectedLibraryPhotos,viTriXuong,viTriKhac,discountAmount,promotionNote,taxCode,vatEnabled};
 const draftSetters={type:setType,requiredAt:setRequiredAt,customerName:setCustomerName,customerPhone:setCustomerPhone,fulfillment:setFulfillment,address:setAddress,note:setNote,items:setItems,isReadyStock:setIsReadyStock,guestCount:setGuestCount,selectedSchool:setSelectedSchool,entryMode:setEntryMode,cakeLine:setCakeLine,hasShipFee:setHasShipFee,shipFee:setShipFee,paymentMethod:setPaymentMethod,deposit:setDeposit,selectedLibraryPhotos:setSelectedLibraryPhotos,viTriXuong:setViTriXuong,viTriKhac:setViTriKhac,discountAmount:setDiscountAmount,promotionNote:setPromotionNote,taxCode:setTaxCode,vatEnabled:setVatEnabled};
 const {saveStatus:draftSaveStatus,clearDraft}=useOrderDraftAutosave(activeDraftId,draftValues,draftSetters);
 const resetDraftForm=()=>{
  clearDraft();
  setActiveDraftId(null);
  setType(null);setRequiredAt('');setCustomerName('');setCustomerPhone('');setFulfillment('delivery');setAddress('');setNote('');
  setItems([]);setPhotos([]);setIsReadyStock(false);setGuestCount('');setSchoolSearch('');setSelectedSchool(null);setEntryMode('manual');
  setCakeLine('decorated_cake');setHasShipFee('no');setShipFee('');setPaymentMethod('cod');setDeposit('');setSelectedLibraryPhotos([]);
  setViTriXuong('Quốc Lộ 13');setViTriKhac('');
  setDiscountAmount('');setPromotionNote('');setTaxCode('');setVatEnabled(false);
 };
 useEffect(()=>{const onResize=()=>setIsMobile(window.innerWidth<860);window.addEventListener('resize',onResize);return()=>window.removeEventListener('resize',onResize)},[]);
 useEffect(()=>{let active=true;supabase.from('products').select('id,name,category,unit,price,product_variants(id,label,price)').eq('active',true).order('name').limit(500).then(({data,error})=>{if(active&&!error)setProductCatalog([...(data||[]),...MOONCAKE_CATALOG])});return()=>{active=false}},[]);
 const change=(i,key,value)=>setItems(x=>x.map((it,n)=>n===i?{...it,[key]:value}:it));
 const changeMany=(i,fields)=>setItems(x=>x.map((it,n)=>n===i?{...it,...fields}:it));
 const spec=(i,key,value)=>setItems(x=>x.map((it,n)=>n===i?{...it,specification:{...it.specification,[key]:value}}:it));
 const getPrice=(item)=>item.unit_price ?? item.specification?.catalog_price ?? 0;
 const getItemTotal=(item)=>(getPrice(item)||0)*(Number(item.quantity)||0);
 const getTotalPrice=()=>items.reduce((sum,item)=>sum+getItemTotal(item),0);
 const effectiveShipFee=hasShipFee==='yes'?(Number(shipFee)||0):0;
 // Chiết khấu/VAT chỉ có giá trị khi type!=='school' (field chỉ hiện khi đó),
 // nên với đơn trường học discountAmount/vatEnabled luôn ở giá trị mặc định
 // (''/false) và công thức dưới đây tự nhiên giống hệt công thức cũ.
 const discountVal=type!=='school'?(Number(discountAmount)||0):0;
 const subtotalAfterDiscount=getTotalPrice()+effectiveShipFee-discountVal;
 const vatAmount=(type!=='school'&&vatEnabled)?Math.round(subtotalAfterDiscount*0.08):0;
 const grandTotal=subtotalAfterDiscount+vatAmount;
 const remaining=grandTotal-(Number(deposit)||0);
 const blankItem=(key)=>({id:crypto.randomUUID(),flow_type:key,name:'',quantity:1,unit:'cái',specification:{product_flow:key,...(key==='cake'?{cake_line:cakeLine}:{})}});
 // Đơn trường học không có ô nhập SĐT riêng (chọn trường qua selectedSchool) —
 // theo yêu cầu chủ shop, mặc định luôn SĐT liên hệ 0933799596 cho mọi đơn
 // trường học (vẫn ghi vào customerNote như các luồng khác).
 const selectFlow=(key)=>{if(key==='school'&&!isDirector)return;if(key==='macaron'&&!isMacaronCreator)return;setActiveDraftId(crypto.randomUUID());setType(key);setItems(key==='teabreak'?[]:[blankItem(key)]);if(key==='school')setCustomerPhone('0933799596');};
 const addFlow=(key)=>{if(type==='school'||key==='school'){setError('Đơn trường học cần tạo riêng để bảo vệ thông tin.');return}if(key==='macaron'&&!isMacaronCreator){setError('Chỉ Trợ lý Giám đốc mới được thêm sản phẩm Macaron.');return}setError('');setItems(x=>[...x,blankItem(key)]);setTimeout(()=>document.querySelector('.sumi-mixed-summary')?.scrollIntoView({behavior:'smooth',block:'start'}),0)};
 const changeCakeLine=(key)=>{setCakeLine(key);setItems(current=>current.map(item=>(item.flow_type||type)==='cake'?{...item,specification:{...item.specification,cake_line:key}}:item));};
 const addCatalogItem=(product)=>{setItems(current=>{
  const found=current.findIndex(x=>x.catalog_code===product.code);
  if(found>=0)return current.map((x,i)=>i===found?{...x,quantity:Number(x.quantity||0)+1}:x);
  return [...current,{flow_type:'teabreak',catalog_code:product.code,name:product.name,quantity:1,unit:'cái',specification:{product_flow:'teabreak',catalog_specification:product.specification,group:product.group}}];
 });setCatalogSearch('');};
 const flow=ORDER_FLOWS.find(x=>x.key===type);
 const suggestions=TEABREAK_CATALOG.filter(x=>!catalogSearch||normalizeSearch(`${x.code} ${x.name} ${x.group}`).includes(normalizeSearch(catalogSearch))).slice(0,8);
 const schoolSuggestions=SCHOOL_DELIVERY_POINTS.filter(x=>!schoolSearch||normalizeSearch(`${x.code} ${x.name} ${x.address} ${x.type}`).includes(normalizeSearch(schoolSearch))).slice(0,10);
 const chooseSchool=(school)=>{setSelectedSchool(school);setCustomerName(school.name);setAddress(school.address);setSchoolSearch('');};
 const libraryTable=type==='school'?'school_photo_library':'macaron_photo_library';
 const libraryStoragePrefix=type==='school'?'school-library':'macaron-library';
 const loadLibraryPhotos=async()=>{setLibraryLoading(true);try{const {data,error:err}=await supabase.from(libraryTable).select('id,storage_path,caption,created_at').order('created_at',{ascending:false});if(err)throw err;setLibraryPhotos((data||[]).map(p=>({...p,url:supabase.storage.from('uploads').getPublicUrl(p.storage_path).data?.publicUrl})));}catch(e){setError(e.message);}finally{setLibraryLoading(false);}};
 const openLibraryPicker=()=>{setShowLibraryPicker(true);loadLibraryPhotos();};
 const toggleLibraryPhoto=(p)=>{setSelectedLibraryPhotos(x=>x.some(y=>y.id===p.id)?x.filter(y=>y.id!==p.id):[...x,p]);};
 const deleteLibraryPhoto=async(p)=>{
  if(!window.confirm('Xoá ảnh này khỏi kho? Không thể hoàn tác.'))return;
  try{
   await supabase.storage.from('uploads').remove([p.storage_path]);
   const {error:err}=await supabase.from(libraryTable).delete().eq('id',p.id);
   if(err)throw err;
   setSelectedLibraryPhotos(x=>x.filter(y=>y.id!==p.id));
   await loadLibraryPhotos();
  }catch(e){setError(e.message);}
 };
 const uploadToLibrary=async(file)=>{
  setLibraryUploading(true);setError('');
  try{
   const cleanExt=(file.name.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'')||'jpg';
   const safePath=`${libraryStoragePrefix}/${newId()}.${cleanExt}`;
   const {error:upErr}=await supabase.storage.from('uploads').upload(safePath,file,{contentType:file.type||'image/jpeg'});
   if(upErr)throw upErr;
   const {error:insErr}=await supabase.from(libraryTable).insert({storage_path:safePath,uploaded_by:profile?.id||null,uploaded_by_name:profile?.full_name||null});
   if(insErr)throw insErr;
   await loadLibraryPhotos();
  }catch(e){setError(e.message);}finally{setLibraryUploading(false);}
 };
 const startVoiceInput=async()=>{if(isRecording)return;setIsRecording(true);setVoiceLoading(false);setError('');try{const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SpeechRecognition){setError('Trình duyệt không hỗ trợ nhập giọng nói');setIsRecording(false);return}const recognition=new SpeechRecognition();recognition.lang='vi-VN';recognition.interimResults=false;recognition.continuous=false;let transcript='';recognition.onstart=()=>{console.log('🎤 Recording started...')};recognition.onresult=(event)=>{for(let i=event.resultIndex;i<event.results.length;i++){if(event.results[i].isFinal){transcript+=event.results[i][0].transcript+' '}}console.log('📝 Transcript:',transcript)};recognition.onerror=(event)=>{console.error('Speech error:',event.error);setError(`Lỗi âm thanh: ${event.error}. Thử lại?`)};recognition.onend=async()=>{setIsRecording(false);if(transcript.trim()){console.log('✅ Parsing...');setVoiceLoading(true);await parseVoiceInput(transcript.trim())}else{setError('Không ghi được tiếng nói. Thử lại - nói rõ và lâu hơn.')}};recognition.start()}catch(e){console.error('Voice error:',e);setError(`Lỗi: ${e.message}`);setIsRecording(false)}};const parseVoiceInput=async(text)=>{try{console.log('Calling parse-voice-order with:',text);const{data,error}=await supabase.functions.invoke('parse-voice-order',{body:{transcript:text,orderType:type||'cake',locale:'vi-VN'}});if(error){console.error('Function error:',error);throw error}console.log('Parsed data:',data);
  if(type==='school'){
   if(data?.customerName){
    const q=normalizeSearch(data.customerName);
    const found=SCHOOL_DELIVERY_POINTS.filter(x=>normalizeSearch(`${x.code} ${x.name}`).includes(q)||q.includes(normalizeSearch(x.name)));
    if(found.length===1)chooseSchool(found[0]);else setSchoolSearch(data.customerName);
   }
  }else{
   if(data?.customerName)setCustomerName(data.customerName);
   if(data?.customerPhone)setCustomerPhone(data.customerPhone);
   if(data?.address)setAddress(data.address);
  }
  if(data?.items?.length)setItems(data.items.map(it=>({...it,id:crypto.randomUUID()})));if(data?.note)setNote(data.note);if(!data?.items?.length&&!data?.customerName){setError('Không trích xuất được thông tin nào. Nói rõ hơn?')}}catch(e){console.error('Parse error:',e);setError(`Không phân tích được: ${e.message}`)}finally{setVoiceLoading(false)}};
 const itemFlows=[...new Set(items.map(x=>x.flow_type||type))];
 const isMixed=itemFlows.length>1;
 const routeFor={cake:'Bếp lạnh',bakery:'Bếp nóng / Bakery',teabreak:'Bếp theo món',macaron:'Xưởng 41',school:'Xưởng 42'};
 const submit=async()=>{setError('');setSaving(true);try{
  if(type==='school'&&!selectedSchool)throw new Error('Vui lòng chọn trường hoặc điểm giao.');
  if(!items.length||items.some(x=>!x.name||Number(x.quantity)<=0))throw new Error('Vui lòng nhập đủ tên bánh và số lượng.');
  for(const it of items){
   if((it.flow_type||type)!=='macaron'||!it.specification?.priceTier)continue;
   const range=parseTierRange(it.specification.priceTier);
   if(range&&(Number(it.quantity)<range[0]||Number(it.quantity)>range[1]))throw new Error(`"${it.name}": số lượng ${it.quantity} không khớp mức giá đã chọn (${it.specification.priceTier}). Chọn lại đúng mức giá.`);
  }
  const key=newId();
  const {data: {user}} = await supabase.auth.getUser();
  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
  const timeStr = String(now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()).padStart(5,'0');
  const orderCode = `SUMI-${dateStr}-${timeStr}`;
  let customerId=null;
  if(type==='school'){
    if(selectedSchool?.code){
      const {data: schoolCust} = await supabase.from('customers').select('id').eq('school_code', selectedSchool.code).maybeSingle();
      customerId = schoolCust?.id || null;
    }
  } else if(customerName||customerPhone){
    const {data: cust} = await supabase.from('customers').select('id').match({name: customerName || null, phone: customerPhone || null}).maybeSingle();
    if(!cust) {
      const {data: newCust} = await supabase.from('customers').insert({name: customerName || null, phone: customerPhone || null, created_by: user?.id}).select('id').single();
      customerId = newCust?.id || null;
    } else {
      customerId = cust?.id || null;
    }
  }
  const viTriXuongText=fulfillment==='delivery'?(viTriXuong==='Chọn khác'?viTriKhac:viTriXuong):'';
  const customerNote=[customerName&&`Khách hàng: ${customerName}`,customerPhone&&`SĐT: ${customerPhone}`,type==='teabreak'&&guestCount&&`Số khách: ${guestCount}`,viTriXuongText&&`Vị trí xưởng: ${viTriXuongText}`,note,isReadyStock&&'⚡ BÁNH CÓ SẴN (XUẤT KHO THÀNH PHẨM NGAY)'].filter(Boolean).join(' · ');
  const normalizedItems=items.map((item,index)=>({...item,display_order:index,specification:{...(item.specification||{}),product_flow:item.flow_type||type,is_ready_stock:isReadyStock}}));
  // Bánh có sẵn: KIỂM TRA KHO TRƯỚC KHI TẠO ĐƠN.
  // Nếu để tạo đơn xong mới kiểm tra rồi báo lỗi thì đơn đã nằm trong hệ
  // thống ở trạng thái sai (rơi vào hàng chờ của Bếp) — đúng lỗi đang gặp.
  if(isReadyStock){
    const dsKiem=items.filter(it=>it.product_id&&(Number(it.quantity)||0)>0).map(it=>({
      product_id:it.product_id,
      name:it.name||'Sản phẩm',
      size:it.specification?.size||null,
      qty:Number(it.quantity)||0,
    }));
    if(dsKiem.length){
      const {data:thieu,error:kiemErr}=await supabase.rpc('check_finished_goods_stock',{p_items:dsKiem});
      if(kiemErr){ setError(`Không kiểm tra được tồn kho: ${kiemErr.message}`); setSaving(false); return; }
      if(thieu&&thieu.length){
        const mota=thieu.map(t=>`${t.ten}${t.size?` (${t.size})`:''}: cần ${t.can_co}, kho còn ${t.ton_kho}`).join(' · ');
        setError(`Kho thành phẩm không đủ hàng — ${mota}. Bỏ tick "Bánh có sẵn" để Bếp làm, hoặc giảm số lượng.`);
        setSaving(false);
        return;
      }
    }
  }

  const {data: orderId, error: orderErr} = await supabase.rpc('create_order_v2',{p_idempotency_key:key,p_order_code:orderCode,p_order_type:isMixed?'mixed':type,p_customer_id:customerId,p_required_at:requiredAt?new Date(requiredAt).toISOString():null,p_fulfillment_method:fulfillment,p_address:fulfillment==='delivery'?address:null,p_note:customerNote||null,p_confidentiality:type==='school'?'school_restricted':'normal',p_items:normalizedItems,p_ship_fee:effectiveShipFee,p_deposit:Number(deposit)||0,p_payment_method:paymentMethod,p_total:grandTotal,p_discount_amount:discountVal,p_promotion_note:type!=='school'?(promotionNote||null):null,p_tax_code:type!=='school'?(taxCode||null):null,p_vat_amount:vatAmount});
  if(orderErr) throw orderErr;
  for(const file of photos){
    try {
      const cleanExt = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
      const safePath = `orders/${orderId}/customer/${newId()}.${cleanExt}`;
      const {error: upErr} = await supabase.storage.from('uploads').upload(safePath, file, { contentType: file.type || 'image/jpeg' });
      if (!upErr) {
        const {error: insertErr} = await supabase.from('order_attachments').insert({
          order_id: orderId,
          attachment_type: 'customer_sample',
          storage_path: safePath,
          mime_type: file.type || 'image/jpeg',
          size_bytes: file.size,
          created_by: profile?.id || null
        });
        if(insertErr) throw insertErr;
      } else {
        throw upErr;
      }
    } catch (err) {
      setError(`Không tải được ảnh "${file.name}": ${err.message}`);
      throw err;
    }
  }
  for(const p of selectedLibraryPhotos){
    const {error: insertErr} = await supabase.from('order_attachments').insert({
      order_id: orderId,
      attachment_type: 'customer_sample',
      storage_path: p.storage_path,
      mime_type: 'image/jpeg',
      created_by: profile?.id || null
    });
    if(insertErr) throw insertErr;
  }
  let daBaoVanTai=false;
  if(isReadyStock){
    const {error: readyErr} = await supabase.rpc('mark_order_ready_from_stock',{p_order_id:orderId});
    if(readyErr){
      // Đơn ĐÃ được tạo rồi. Không ném lỗi ở đây, vì ném là màn hình đứng im
      // mà đơn vẫn nằm trong hệ thống — người dùng không biết chuyện gì xảy ra.
      // Thay vào đó báo rõ và vẫn đóng màn hình: đơn rơi về luồng Bếp bình
      // thường, bếp làm được, không mất đơn.
      console.error('[TaoDon] Báo vận tải thất bại:', readyErr);
      setError(`Đơn đã tạo nhưng chưa chuyển được sang chờ giao: ${readyErr.message}. Đơn đang nằm ở hàng chờ của Bếp.`);
    } else {
      daBaoVanTai=true;
    }
  }
  console.log('✅ Order created:', orderId);
  // Broadcast order creation to all listeners
  await broadcastEvent(BroadcastEvents.ORDER_CREATED, {
    orderId,
    orderCode,
    orderType: isMixed ? 'mixed' : type,
    customerName,
    createdAt: new Date().toISOString(),
  });
  notifyOtherTabs(BroadcastEvents.ORDER_CREATED, { orderId });
  clearDraft();
  onCreated?.(orderId);

  // Đóng màn hình tạo đơn rồi đưa về đúng danh sách cần theo dõi tiếp:
  //  - bánh có sẵn đã báo vận tải -> tab "Chờ vận chuyển"
  //  - còn lại                    -> tab "Đơn chờ làm"
  // Mỗi bước bọc riêng: dọn dẹp vấp thì chỉ ghi nhật ký, không để màn hình đơ.
  setTimeout(() => {
    try { onClose(); } catch (err) { console.error('[TaoDon] Đóng màn hình lỗi (bỏ qua):', err); }
    try {
      window.dispatchEvent(new CustomEvent('sumi-navigate', {
        detail: { tab: 'orders', filter: daBaoVanTai ? 'ready' : 'waiting' },
      }));
    } catch (err) { console.error('[TaoDon] Chuyển trang lỗi (bỏ qua):', err); }
  }, 500);
 }catch(e){console.error('❌ Order error:', e);setError(e.message||'Không thể tạo đơn');}finally{setSaving(false);}};
 if(!type)return <div className={embedded?'sumi-order-create-page':'sumi-order-create-overlay'} onClick={embedded?undefined:onClose}>
  <div className="sumi-order-create-body sumi-flow-picker" onClick={e=>e.stopPropagation()}>
   <div className="sumi-create-head"><button onClick={onClose} aria-label="Quay lại">←</button><h2>Tạo đơn mới</h2></div>
   <div className="sumi-create-intro"><strong>Đơn này thuộc loại nào?</strong><span>Chọn đúng loại để chỉ hiện những thông tin cần nhập.</span></div>
   <div className="sumi-flow-grid">{visibleFlows.map(item=><button key={item.key} onClick={()=>selectFlow(item.key)}><b><item.Icon size={28}/></b><strong>{item.title}</strong><span>{item.subtitle}</span></button>)}</div>
   <div className="sumi-entry-title"><strong>Cách nhập đơn</strong><span>Chọn trước hoặc bổ sung ảnh sau</span></div>
   <div className="sumi-entry-grid"><button className={entryMode==='photo'?'active':''} onClick={()=>setEntryMode('photo')}>📷<span>Chụp đơn</span></button><button className={entryMode==='voice'?'active':''} onClick={()=>setEntryMode('voice')}>🎤<span>Nói để nhập</span></button></div>
   {entryMode!=='manual'&&<div className="sumi-entry-note">Đã chọn {entryMode==='photo'?'chụp ảnh':'nhập bằng giọng nói'}. Bây giờ chọn loại đơn ở phía trên.</div>}
  </div></div>;
 return <div className={embedded?'sumi-order-create-page':'sumi-order-create-overlay'} onClick={embedded?undefined:onClose}>
  <div className="sumi-order-create-body" style={isMobile?undefined:{maxWidth:1040}} onClick={e=>e.stopPropagation()}>
   <div className="sumi-create-head"><button onClick={()=>setType(null)} aria-label="Chọn lại loại đơn">←</button><h2>{isMixed?'🧺 Đơn nhiều sản phẩm':`${flow?.icon} ${flow?.title}`}</h2></div>
   <button className="sumi-change-flow" onClick={()=>setType(null)}>Đổi loại đơn</button>
   {entryMode!=='manual'&&<div className="sumi-entry-note">{entryMode==='photo'?'📷 Đơn được nhập từ ảnh — cần kiểm tra trước khi tạo':'🎤 Đơn được nhập bằng giọng nói — cần xác nhận lại nội dung'}</div>}
   <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,margin:'6px 0'}}>
    <DraftSaveIndicator status={draftSaveStatus}/>
    <button type="button" onClick={()=>{if(window.confirm('Xoá bản nháp và nhập lại từ đầu?'))resetDraftForm();}} style={{border:'1px solid #e0d5c7',background:'#fff',color:'#8c5a3c',fontSize:12,fontWeight:700,borderRadius:8,padding:'4px 10px',cursor:'pointer'}}>Xoá bản nháp</button>
   </div>
   <div style={{display:'flex',flexDirection:isMobile?'column':'row',gap:20,alignItems:'flex-start'}}>
   <div style={{flex:isMobile?'1 1 auto':'1 1 480px',minWidth:0}}>
   <p style={{color:'#725f50',fontWeight:700}}>Người tạo: {profile?.full_name||'Nhân viên'} · tự lưu ngày giờ</p>
   {type==='school'&&<section className="sumi-catalog-picker sumi-school-picker">
    <button onClick={startVoiceInput} disabled={isRecording||voiceLoading} style={{width:'100%',minHeight:54,border:'2px dashed #d7c3aa',borderRadius:17,background:'#fff',fontSize:16,fontWeight:900,color:isRecording?'#b93e13':'#2d1c10',cursor:isRecording||voiceLoading?'not-allowed':'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:8,marginBottom:12}}>🎤 {isRecording?'Đang ghi âm...':voiceLoading?'Đang xử lý...':'Nói để chọn trường + nhập món'}</button>
    <label>Tìm trường hoặc điểm giao</label><input style={fieldStyle} placeholder="Gõ HC 5, Hoa Cúc, Dĩ An…" value={schoolSearch} onChange={e=>setSchoolSearch(e.target.value)}/>
    {!selectedSchool&&<div className="sumi-school-results">{schoolSuggestions.map(school=><button key={`${school.code}-${school.name}`} onClick={()=>chooseSchool(school)}><b>🏫</b><span><strong>{school.name}</strong><small>{school.code} · {school.type}</small><em>{school.address||'Chưa có địa chỉ — cần bổ sung'}</em></span></button>)}</div>}
    {selectedSchool&&<div className="sumi-school-selected"><b>✓</b><span><strong>{selectedSchool.name}</strong><small>{selectedSchool.code} · {selectedSchool.type}</small><em>{selectedSchool.address||'Chưa có địa chỉ'}</em></span><button onClick={()=>setSelectedSchool(null)}>Đổi</button></div>}
   </section>}
   {type!=='school'&&<><label style={{display:'block',fontWeight:900}}>Khách hàng</label><input style={{...fieldStyle,margin:'7px 0 12px'}} placeholder="Tên khách hàng" value={customerName} onChange={e=>setCustomerName(e.target.value)}/>
   <label style={{display:'block',fontWeight:900}}>Số điện thoại</label><input style={{...fieldStyle,margin:'7px 0 12px'}} inputMode="tel" placeholder="Số điện thoại khách" value={customerPhone} onChange={e=>setCustomerPhone(e.target.value)}/>
   <label style={{display:'block',fontWeight:900}}>Địa chỉ</label><input style={{...fieldStyle,margin:'7px 0 14px'}} placeholder="Địa chỉ giao hàng" value={address} onChange={e=>setAddress(e.target.value)}/>
   <button onClick={startVoiceInput} disabled={isRecording||voiceLoading} style={{width:'100%',minHeight:54,border:'2px dashed #d7c3aa',borderRadius:17,background:'#fff',fontSize:16,fontWeight:900,color:isRecording?'#b93e13':'#2d1c10',cursor:isRecording||voiceLoading?'not-allowed':'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>🎤 {isRecording?'Đang ghi âm...':voiceLoading?'Đang xử lý...':'Nói để nhập đơn'}</button></>}
   {type==='teabreak'&&<section className="sumi-catalog-picker">
    <label>Số khách dự kiến</label><input style={fieldStyle} type="number" min="1" inputMode="numeric" placeholder="Ví dụ: 80 hoặc 1500" value={guestCount} onChange={e=>setGuestCount(e.target.value)}/>
    <label>Chọn món bằng tên hoặc mã</label><input style={fieldStyle} placeholder="Gõ su kem, bánh mặn, SM30…" value={catalogSearch} onChange={e=>setCatalogSearch(e.target.value)}/>
    <div className="sumi-catalog-results">{suggestions.map(product=><button key={product.code} onClick={()=>addCatalogItem(product)}><b>＋</b><span><strong>{product.name}</strong><small>{product.code} · {product.specification} · {product.group}</small></span></button>)}</div>
   </section>}
   {type==='cake'&&<section className="sumi-cake-line"><label>Chọn dòng bánh</label><div>{CAKE_LINES.map(line=><button className={cakeLine===line.key?'active':''} key={line.key} onClick={()=>changeCakeLine(line.key)}><strong>{line.label}</strong><span>{line.note}</span></button>)}</div>{cakeLine==='cold_cake'&&<p>❄️ Bếp lạnh phụ trách · phải ghi điều kiện bảo quản và thời gian lấy khỏi tủ lạnh.</p>}</section>}
   <div className="sumi-selected-head"><strong>{type==='teabreak'?'Món đã chọn':'Sản phẩm và số lượng'}</strong><span>{items.length} món</span></div>
   {items.length>0&&<section className="sumi-mixed-summary"><header><div><small>ĐƠN HÀNG XUYÊN SUỐT</small><strong>{isMixed?'Nhiều bếp cùng thực hiện':'Một nhóm sản xuất'}</strong></div><b>{itemFlows.length} nhóm</b></header><div>{itemFlows.map(key=>{const meta=ORDER_FLOWS.find(x=>x.key===key);const count=items.filter(x=>(x.flow_type||type)===key).length;return <span key={key}><i>{meta?.Icon&&<meta.Icon size={18}/>}</i><b>{meta?.title}</b><small>{count} món · {routeFor[key]}</small></span>})}</div></section>}
   {items.map((it)=>{const itemIndex=items.indexOf(it);const itemPrice=getPrice(it);const itemTotal=getItemTotal(it);return <div key={it.id} style={{padding:12,border:'1px solid var(--border-default)',borderRadius:16,marginBottom:10,background:'var(--surface-card)'}}>
    <div className="sumi-item-flow"><span>{(()=>{const M=ORDER_FLOWS.find(x=>x.key===(it.flow_type||type))?.Icon;return M?<M size={16}/>:null})()}</span><b>{ORDER_FLOWS.find(x=>x.key===(it.flow_type||type))?.title}</b><em>→ {routeFor[it.flow_type||type]}</em></div>
    <div className="sumi-product-line"><ProductNameField item={it} products={productCatalog} flowType={it.flow_type||type} onChange={fields=>changeMany(itemIndex,{...fields,unit_price:fields.unit_price??fields.specification?.catalog_price})}/><input style={{...fieldStyle,width:90}} aria-label="Số lượng" type="number" min="1" value={it.quantity} onChange={e=>change(itemIndex,'quantity',Number(e.target.value))}/></div>
    {itemPrice>0&&<div style={{fontSize:13,color:'#d96b43',fontWeight:700,marginTop:6}}>{itemPrice.toLocaleString('vi-VN')}đ × {it.quantity}{it.unit&&it.unit!=='cái'?` ${it.unit}`:''} = {itemTotal.toLocaleString('vi-VN')}đ</div>}
    {(it.flow_type||type)==='macaron'&&it.specification?.priceTier&&(()=>{const range=parseTierRange(it.specification.priceTier);if(!range)return null;const[min,max]=range;if(Number(it.quantity)>=min&&Number(it.quantity)<=max)return null;return <div style={{fontSize:13,color:'#b42318',fontWeight:700,marginTop:4}}>⚠️ Số lượng ({it.quantity}) không khớp mức giá đã chọn ({it.specification.priceTier}) — chọn lại đúng mức giá cho số lượng này.</div>})()}
    <div className="sumi-item-fields" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginTop:8}}>
     {(it.flow_type||type)==='cake'&&<>{it.variants?.length?<select style={fieldStyle} value={it.specification?.size||''} onChange={e=>{const v=it.variants.find(x=>x.label===e.target.value);changeMany(itemIndex,{unit_price:v?.price??null,specification:{...it.specification,size:e.target.value}})}}><option value="">Chọn size...</option>{it.variants.map(v=><option key={v.id} value={v.label}>{v.label} — {Number(v.price).toLocaleString('vi-VN')}đ</option>)}</select>:<input style={fieldStyle} placeholder="Size (18cm...)" value={it.specification?.size||''} onChange={e=>spec(itemIndex,'size',e.target.value)}/>}
      <select style={fieldStyle} value={it.specification?.cot||''} onChange={e=>spec(itemIndex,'cot',e.target.value)}><option value="">Chọn cốt bánh...</option>{CAKE_BASES.map(b=><option key={b} value={b}>{baseSurcharge(b)?`${b} (+${baseSurcharge(b).toLocaleString('vi-VN')}đ)`:b}</option>)}</select>
      <select style={fieldStyle} value={it.specification?.filling||''} onChange={e=>spec(itemIndex,'filling',e.target.value)}><option value="">Chọn nhân...</option>{CAKE_FILLINGS.map(f=><option key={f.value} value={f.value}>{f.label}</option>)}</select>
      <input style={fieldStyle} placeholder="Chữ trên bánh" value={it.specification?.content||''} onChange={e=>spec(itemIndex,'content',e.target.value)}/>
      <input style={fieldStyle} placeholder="Loại nến (VD: Nến số 25)" value={it.specification?.candle||''} onChange={e=>spec(itemIndex,'candle',e.target.value)}/>
     </>}
     {(it.flow_type||type)==='bakery'&&(it.variants?.length?<><select style={fieldStyle} value={it.specification?.size||''} onChange={e=>{const v=it.variants.find(x=>x.label===e.target.value);changeMany(itemIndex,{unit_price:v?.price??null,specification:{...it.specification,size:e.target.value}})}}><option value="">Chọn size...</option>{it.variants.map(v=><option key={v.id} value={v.label}>{v.label} — {Number(v.price).toLocaleString('vi-VN')}đ</option>)}</select><input style={fieldStyle} placeholder="Quy cách/nhân/đóng gói (nếu có)" value={it.specification?.packing||''} onChange={e=>spec(itemIndex,'packing',e.target.value)}/></>:<><select style={fieldStyle} value={it.specification?.product_line||''} onChange={e=>spec(itemIndex,'product_line',e.target.value)}><option value="">Chọn dòng bánh</option><option value="moon_cake">BTT · Bánh Trung Thu</option><option value="other">Bánh mặn/ngọt khác</option></select>{it.specification?.product_line==='moon_cake'?<><input style={fieldStyle} inputMode="numeric" placeholder="Quy cách (gram)" value={it.specification?.weight_gram||''} onChange={e=>spec(itemIndex,'weight_gram',e.target.value)}/><select style={fieldStyle} value={it.specification?.egg_count??''} onChange={e=>spec(itemIndex,'egg_count',Number(e.target.value))}><option value="">Số trứng</option><option value="0">0 trứng</option><option value="1">1 trứng</option><option value="2">2 trứng</option></select><input style={fieldStyle} inputMode="numeric" placeholder="Giá tùy nhập (không bắt buộc)" value={fmtMoney(it.unit_price)} onChange={e=>change(itemIndex,'unit_price',parseMoney(e.target.value))}/><input style={fieldStyle} placeholder="Ghi chú linh hoạt" value={it.specification?.flex_note||''} onChange={e=>spec(itemIndex,'flex_note',e.target.value)}/></>:<input style={fieldStyle} placeholder="Quy cách/nhân/đóng gói" value={it.specification?.packing||''} onChange={e=>spec(itemIndex,'packing',e.target.value)}/>}</>)}
     {(it.flow_type||type)==='teabreak'&&<><input style={fieldStyle} value={it.specification?.catalog_specification||''} placeholder="Quy cách" onChange={e=>spec(itemIndex,'catalog_specification',e.target.value)}/><input style={fieldStyle} placeholder="Khay/ghi chú" value={it.specification?.packing||''} onChange={e=>spec(itemIndex,'packing',e.target.value)}/></>}
     {(it.flow_type||type)==='macaron'&&<>
      {it.variants?.length>0&&<select style={fieldStyle} value={it.specification?.priceTier||''} onChange={e=>{const v=it.variants.find(x=>x.label===e.target.value);changeMany(itemIndex,{unit_price:v?.price??null,specification:{...it.specification,priceTier:e.target.value}})}}><option value="">Chọn mức giá theo số lượng...</option>{it.variants.map(v=><option key={v.id} value={v.label}>{v.label} — {Number(v.price).toLocaleString('vi-VN')}đ</option>)}</select>}
      <input style={fieldStyle} inputMode="numeric" placeholder="Hoặc nhập giá tay (VD: 48.000/khay)" value={fmtMoney(it.unit_price)} onChange={e=>changeMany(itemIndex,{unit_price:parseMoney(e.target.value),specification:{...it.specification,priceTier:''}})}/>
      <select style={fieldStyle} value={it.unit||'cái'} onChange={e=>change(itemIndex,'unit',e.target.value)}><option value="cái">Đơn vị: Cái</option><option value="khay">Đơn vị: Khay</option><option value="thùng">Đơn vị: Thùng</option><option value="hộp">Đơn vị: Hộp</option></select>
      <input style={{...fieldStyle,gridColumn:'1 / -1'}} placeholder="Quy cách (VD: Khay 36 cặp - 4cm, Hộp 100 cặp - 2cm)" value={it.specification?.packing||''} onChange={e=>spec(itemIndex,'packing',e.target.value)}/>
      <div style={{gridColumn:'1 / -1',display:'flex',flexDirection:'column',gap:6}}>
       <label style={{fontSize:13,fontWeight:800,color:'#2d1c10'}}>Màu (chọn nhiều màu)</label>
       <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
        {[6,9,10,12].map(n=><button type="button" key={n} onClick={()=>spec(itemIndex,'colors',MACARON_COLORS.slice(0,n))} style={{minHeight:34,padding:'5px 12px',borderRadius:999,fontSize:12,fontWeight:800,cursor:'pointer',border:'1px solid #d96b43',background:'#fff5f0',color:'#b93e13'}}>Mix {n} màu</button>)}
        <button type="button" onClick={()=>spec(itemIndex,'colors',[])} style={{minHeight:34,padding:'5px 12px',borderRadius:999,fontSize:12,fontWeight:700,cursor:'pointer',border:'1px solid var(--border-default)',background:'#fff',color:'#6b5a4a'}}>Xóa hết</button>
       </div>
       <MultiChipPicker options={MACARON_COLORS} selected={it.specification?.colors||[]} onToggle={c=>{const cur=it.specification?.colors||[];spec(itemIndex,'colors',cur.includes(c)?cur.filter(x=>x!==c):[...cur,c])}}/>
      </div>
      <div style={{gridColumn:'1 / -1',display:'flex',flexDirection:'column',gap:6}}>
       <label style={{fontSize:13,fontWeight:800,color:'#2d1c10'}}>Nhân (chọn nhiều vị)</label>
       <MultiChipPicker options={MACARON_FILLINGS} selected={it.specification?.fillings||[]} onToggle={f=>{const cur=it.specification?.fillings||[];spec(itemIndex,'fillings',cur.includes(f)?cur.filter(x=>x!==f):[...cur,f])}}/>
      </div>
      <input style={{...fieldStyle,gridColumn:'1 / -1'}} placeholder="Ghi chú thêm về màu/nhân (VD: đỏ 4 khay, xanh 6 khay...)" value={it.specification?.color||''} onChange={e=>spec(itemIndex,'color',e.target.value)}/>
     </>}
     {(it.flow_type||type)==='school'&&<>{it.variants?.length?<select style={fieldStyle} value={it.specification?.size||''} onChange={e=>{const v=it.variants.find(x=>x.label===e.target.value);changeMany(itemIndex,{unit_price:v?.price??null,specification:{...it.specification,size:e.target.value}})}}><option value="">Chọn trọng lượng...</option>{it.variants.map(v=><option key={v.id} value={v.label}>{v.label} — {Number(v.price).toLocaleString('vi-VN')}đ</option>)}</select>:<input style={fieldStyle} placeholder="Quy cách" value={it.specification?.spec||''} onChange={e=>spec(itemIndex,'spec',e.target.value)}/>}<input style={fieldStyle} inputMode="numeric" placeholder="Hoặc nhập giá tay (VD: 8.500)" value={fmtMoney(it.unit_price)} onChange={e=>change(itemIndex,'unit_price',parseMoney(e.target.value))}/><input style={fieldStyle} placeholder="Khối/lớp/ghi chú" value={it.specification?.grade_note||''} onChange={e=>spec(itemIndex,'grade_note',e.target.value)}/></>}
     {(it.flow_type||type)!=='school'&&!((it.flow_type||type)==='bakery'&&it.specification?.product_line==='moon_cake')&&<input style={fieldStyle} inputMode="numeric" placeholder="Đơn giá (có thể để trống)" value={fmtMoney(it.unit_price)} onChange={e=>change(itemIndex,'unit_price',parseMoney(e.target.value))}/>}
    </div>{items.length>1&&<button onClick={()=>setItems(x=>x.filter((_,n)=>n!==itemIndex))} style={{marginTop:8,minHeight:44,color:'#b42318',border:0,background:'none',cursor:'pointer',fontWeight:600}}>✕ Xóa sản phẩm</button>}
   </div>;})}
   {items.length===0&&<div className="sumi-no-selection">Chưa chọn món. Tìm món phía trên hoặc thêm món tùy chỉnh.</div>}
   <button onClick={()=>{const key=itemFlows.at(-1)||type;setItems(x=>[...x,{...blankItem(key),specification:{...blankItem(key).specification,custom:true}}])}} style={{...fieldStyle,fontWeight:900,borderStyle:'dashed'}}>＋ Thêm món cùng nhóm</button>
   {type!=='school'&&<section className="sumi-add-flow"><strong>＋ Thêm nhóm sản phẩm khác</strong><p>Một mã đơn, mỗi nhóm tự chuyển tới đúng bếp.</p><div>{ORDER_FLOWS.filter(x=>x.key!=='school'&&(x.key!=='macaron'||isMacaronCreator)&&!itemFlows.includes(x.key)).map(x=><button key={x.key} onClick={()=>addFlow(x.key)}><span><x.Icon size={20}/></span><b>{x.title}</b><small>{routeFor[x.key]}</small></button>)}</div></section>}
   <label style={{display:'block',marginTop:14,fontWeight:800}}>Ngày giờ cần giao</label><input style={fieldStyle} type="datetime-local" value={requiredAt} onChange={e=>setRequiredAt(e.target.value)}/>
   {type==='school'?
    <div style={{marginTop:12,padding:'12px 14px',borderRadius:14,background:'#f5f1eb',border:'1px solid #e0d5c7',fontSize:14,color:'#725f50'}}>🚚 Giao tận nơi đến địa chỉ trường đã chọn — không thu ship, không thu tiền tại chỗ (trường thanh toán riêng).</div>
   :<>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginTop:12}}><button onClick={()=>setFulfillment('delivery')} style={{...fieldStyle,fontWeight:900,border:fulfillment==='delivery'?'3px solid #138a53':fieldStyle.border,background:fulfillment==='delivery'?'#e6f6ed':'#fff',color:fulfillment==='delivery'?'#09663d':'#2d1c10'}}>🛵 Giao tận nơi</button><button onClick={()=>setFulfillment('pickup')} style={{...fieldStyle,fontWeight:900,border:fulfillment==='pickup'?'3px solid #138a53':fieldStyle.border,background:fulfillment==='pickup'?'#e6f6ed':'#fff',color:fulfillment==='pickup'?'#09663d':'#2d1c10'}}>🏬 Nhận tại quầy</button></div>
    <label style={{display:'block',marginTop:10,fontWeight:800}}>Vị trí xưởng xuất đơn</label>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginTop:6}}>
     {['Quốc Lộ 13','Vĩnh Phú 42','Chọn khác'].map(x=><button type="button" key={x} onClick={()=>setViTriXuong(x)} style={{...fieldStyle,fontSize:13,fontWeight:800,border:viTriXuong===x?'3px solid #138a53':fieldStyle.border,background:viTriXuong===x?'#e6f6ed':'#fff',color:viTriXuong===x?'#09663d':'#2d1c10'}}>{x}</button>)}
    </div>
    {viTriXuong==='Chọn khác'&&<input style={{...fieldStyle,marginTop:8}} placeholder="Nhập vị trí khác (VD: Xưởng 41)" value={viTriKhac} onChange={e=>setViTriKhac(e.target.value)}/>}
    {fulfillment==='delivery'&&<div style={{display:'grid',gridTemplateColumns:hasShipFee==='yes'?'1fr 1fr':'1fr',gap:8,marginTop:10}}>
      <select style={fieldStyle} value={hasShipFee} onChange={e=>{setHasShipFee(e.target.value);if(e.target.value==='no')setShipFee('')}}><option value="no">Ship miễn phí</option><option value="yes">Có phí ship</option></select>
      {hasShipFee==='yes'&&<input style={fieldStyle} inputMode="numeric" placeholder="VD: 30.000" value={fmtMoney(shipFee)} onChange={e=>setShipFee(parseMoney(e.target.value)||'')}/>}
    </div>}
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginTop:10}}>
      <select style={fieldStyle} value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value)}>{PAYMENT_METHODS.map(p=><option key={p.value} value={p.value}>{p.label}</option>)}</select>
      <input style={fieldStyle} inputMode="numeric" placeholder="Đặt cọc (VD: 100.000)" value={fmtMoney(deposit)} onChange={e=>setDeposit(parseMoney(e.target.value)||'')}/>
    </div>
   </>}
   <textarea style={{...fieldStyle,marginTop:10,minHeight:82}} placeholder="Ghi chú" value={note} onChange={e=>setNote(e.target.value)}/>
   <label style={{display:'block',marginTop:16,fontWeight:900,fontSize:18}}>Ảnh mẫu khách gửi</label>
   <div className="sumi-upload-grid">
     <label>📷<span>Chụp ảnh</span><input hidden type="file" accept="image/*" capture="environment" multiple onChange={e=>{const files=Array.from(e.target.files||[]);setPhotos([...photos,...files]);e.target.value='';}}/></label>
     <label>🖼️<span>Chọn ảnh có sẵn</span><input hidden type="file" accept="image/*" multiple onChange={e=>{const files=Array.from(e.target.files||[]);setPhotos([...photos,...files]);e.target.value='';}}/></label>
     {(type==='macaron'||type==='school')&&<button type="button" onClick={openLibraryPicker} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:4,minHeight:70,border:'2px dashed #d96b43',borderRadius:14,background:'#fdf6ef',cursor:'pointer'}}>🎨<span>Ảnh mẫu đã lưu</span></button>}
   </div>
   {photos.length>0&&(
     <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(80px,1fr))',gap:8,marginTop:10}}>
       {photos.map((file,idx)=>{const blobUrl=URL.createObjectURL(file);return(
         <div key={`photo-${idx}`} style={{position:'relative',width:80,height:80,borderRadius:12,overflow:'hidden',border:'1.5px solid var(--border-default)',background:'#000'}}>
           <img src={blobUrl} alt="Ảnh mẫu" style={{width:'100%',height:'100%',objectFit:'cover'}}/>
           <button type="button" onClick={(e)=>{e.preventDefault();setPhotos(photos.filter((_,n)=>n!==idx));URL.revokeObjectURL(blobUrl);}} style={{position:'absolute',top:3,right:3,minHeight:44,minWidth:44,borderRadius:'50%',background:'rgba(0,0,0,0.7)',color:'#fff',border:0,fontSize:12,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:900}}>✕</button>
         </div>
       );})}</div>
   )}
   {selectedLibraryPhotos.length>0&&(
     <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(80px,1fr))',gap:8,marginTop:10}}>
       {selectedLibraryPhotos.map(p=>(
         <div key={p.id} style={{position:'relative',width:80,height:80,borderRadius:12,overflow:'hidden',border:'1.5px solid #d96b43',background:'#000'}}>
           <img src={p.url} alt="Ảnh mẫu đã lưu" style={{width:'100%',height:'100%',objectFit:'cover'}}/>
           <button type="button" onClick={(e)=>{e.preventDefault();toggleLibraryPhoto(p);}} style={{position:'absolute',top:3,right:3,minHeight:44,minWidth:44,borderRadius:'50%',background:'rgba(0,0,0,0.7)',color:'#fff',border:0,fontSize:12,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:900}}>✕</button>
         </div>
       ))}</div>
   )}
   <div style={{color:'#725f50',fontWeight:700,marginTop:6,marginBottom:8}}>{(photos.length+selectedLibraryPhotos.length)?`${photos.length+selectedLibraryPhotos.length} ảnh đã chọn`:'Chưa có ảnh'}</div>
   {showLibraryPicker&&(
     <div className="sumi-order-create-overlay" onClick={()=>setShowLibraryPicker(false)}>
       <div className="sumi-order-create-body" onClick={e=>e.stopPropagation()}>
         <div className="sumi-create-head"><button onClick={()=>setShowLibraryPicker(false)} aria-label="Đóng">←</button><h2>🎨 Ảnh mẫu {type==='school'?'Trường học':'Macaron'} đã lưu</h2></div>
         <label style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8,minHeight:50,border:'2px dashed #d96b43',borderRadius:14,background:'#fdf6ef',cursor:'pointer',fontWeight:800,color:'#b93e13',marginBottom:14}}>
           {libraryUploading?'Đang tải lên...':'+ Thêm ảnh mới vào kho'}
           <input hidden type="file" accept="image/*" disabled={libraryUploading} onChange={e=>{const f=e.target.files?.[0];if(f)uploadToLibrary(f);e.target.value='';}}/>
         </label>
         {libraryLoading?<p>Đang tải ảnh...</p>:libraryPhotos.length===0?<p style={{color:'#725f50'}}>Chưa có ảnh nào trong kho. Bấm "Thêm ảnh mới vào kho" để lưu ảnh đầu tiên.</p>:
         <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(100px,1fr))',gap:10}}>
           {libraryPhotos.map(p=>{const active=selectedLibraryPhotos.some(x=>x.id===p.id);return(
             <div key={p.id} style={{position:'relative',width:'100%',aspectRatio:'1',borderRadius:14,overflow:'hidden',border:active?'3px solid #087f5b':'1.5px solid var(--border-default)',background:'#000'}}>
               <button type="button" onClick={()=>toggleLibraryPhoto(p)} style={{padding:0,border:0,width:'100%',height:'100%',cursor:'pointer',display:'block'}}>
                 <img src={p.url} alt="Ảnh mẫu macaron" style={{width:'100%',height:'100%',objectFit:'cover'}}/>
               </button>
               {active&&<div style={{position:'absolute',top:4,right:4,width:26,height:26,borderRadius:'50%',background:'#087f5b',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:900,pointerEvents:'none'}}>✓</div>}
               <button type="button" onClick={()=>deleteLibraryPhoto(p)} title="Xoá khỏi kho" style={{position:'absolute',top:4,left:4,width:26,height:26,borderRadius:'50%',background:'rgba(0,0,0,0.7)',color:'#fff',border:0,fontSize:13,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:900}}>✕</button>
             </div>
           );})}
         </div>}
         <button onClick={()=>setShowLibraryPicker(false)} style={{width:'100%',minHeight:54,marginTop:16,border:0,borderRadius:14,background:'#087f5b',color:'#fff',fontSize:16,fontWeight:900,cursor:'pointer'}}>Xong ({selectedLibraryPhotos.length} ảnh đã chọn)</button>
       </div>
     </div>
   )}
   {type!=='school'&&<label style={{display:'flex',alignItems:'center',gap:10,marginTop:14,padding:'12px 14px',borderRadius:14,background:isReadyStock?'#e6f6ed':'#fcf9f5',border:isReadyStock?'2px solid #087f5b':'1px solid var(--border-default)',cursor:'pointer'}}>
     <input type="checkbox" checked={isReadyStock} onChange={e=>setIsReadyStock(e.target.checked)} style={{width:22,height:22,margin:0}}/>
     <div>
       <b style={{fontSize:15,color:isReadyStock?'#087f5b':'var(--text-primary)',display:'block'}}>⚡ Bánh có sẵn trong Kho Thành Phẩm (Xuất giao ngay)</b>
       <span style={{fontSize:13,color:'var(--text-secondary)'}}>Bỏ qua khâu làm bánh của Bếp, đưa thẳng vào Kho Thành Phẩm và kích hoạt Shipper nhận đơn.</span>
     </div>
   </label>}
   {isReadyStock&&tonKho!==null&&(
     <div style={{marginTop:8,padding:'10px 14px',borderRadius:14,background:'#fff',border:'1px solid #cfe8db'}}>
       <div style={{fontSize:12,fontWeight:800,color:'#087f5b',marginBottom:6}}>📦 KHO THÀNH PHẨM ĐANG CÒN</div>
       {tonKho==='loi'&&<div style={{fontSize:13,color:'#b42318'}}>Chưa đọc được tồn kho. Vẫn tạo đơn được — hệ thống sẽ kiểm tra lại lúc bấm tạo.</div>}
       {Array.isArray(tonKho)&&tonKho.length===0&&<div style={{fontSize:13,color:'var(--text-secondary)'}}>Chọn bánh vào đơn để xem kho còn bao nhiêu.</div>}
       {Array.isArray(tonKho)&&tonKho.map((d,i)=>{
         const du=d.con>=d.can;
         return <div key={i} style={{display:'flex',justifyContent:'space-between',gap:10,fontSize:13,padding:'4px 0',borderTop:i?'1px dashed #ece4da':'none'}}>
           <span style={{color:'var(--text-primary)'}}>{d.ten}{d.size?` (${d.size})`:''}</span>
           <b style={{color:du?'#087f5b':'#b42318',whiteSpace:'nowrap'}}>{du?'✓':'⚠'} cần {d.can} · kho còn {d.con}</b>
         </div>;
       })}
       {Array.isArray(tonKho)&&tonKho.some(d=>d.con<d.can)&&(
         <div style={{marginTop:8,fontSize:12.5,color:'#b42318',lineHeight:1.45}}>Không đủ hàng. Hãy <b>giảm số lượng</b>, <b>nhập thêm vào Kho Hàng</b>, hoặc <b>bỏ tick</b> để Bếp làm.</div>
       )}
     </div>
   )}
   {type!=='school'&&<section style={{marginTop:14,padding:'12px 14px',borderRadius:14,background:'#fff',border:'1px solid var(--border-default)'}}>
     <div style={{fontSize:13,fontWeight:900,color:'#2d1c10',marginBottom:8}}>🏷️ Chiết khấu / Khuyến mãi / Xuất hoá đơn</div>
     <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
      <input style={fieldStyle} inputMode="numeric" placeholder="Chiết khấu (VNĐ, VD: 50.000)" value={fmtMoney(discountAmount)} onChange={e=>setDiscountAmount(parseMoney(e.target.value)||'')}/>
      <input style={fieldStyle} placeholder="Khuyến mãi (VD: Mua 2 tặng 1)" value={promotionNote} onChange={e=>setPromotionNote(e.target.value)}/>
     </div>
     <input style={{...fieldStyle,marginTop:8}} placeholder="Mã số thuế khách hàng (nếu xuất hoá đơn)" value={taxCode} onChange={e=>setTaxCode(e.target.value)}/>
     <label style={{display:'flex',alignItems:'center',gap:10,marginTop:10,padding:'10px 12px',borderRadius:12,background:vatEnabled?'#e6f6ed':'#fcf9f5',border:vatEnabled?'2px solid #087f5b':'1px solid var(--border-default)',cursor:'pointer'}}>
      <input type="checkbox" checked={vatEnabled} onChange={e=>setVatEnabled(e.target.checked)} style={{width:20,height:20,margin:0}}/>
      <b style={{fontSize:14,color:vatEnabled?'#087f5b':'var(--text-primary)'}}>Xuất VAT 8% — cộng thẳng vào tổng đơn</b>
     </label>
   </section>}
   <div style={{padding:14,marginTop:14,borderRadius:14,background:'#f5f1eb',border:'2px solid #e0d5c7'}}>
     <div style={{fontSize:12,color:'#725f50',fontWeight:700,marginBottom:8}}>💰 TỔNG ĐƠN HÀNG</div>
     <div style={{fontSize:28,fontWeight:900,color:'#d96b43',marginBottom:10}}>{grandTotal.toLocaleString('vi-VN')}đ</div>
     <div style={{fontSize:11,color:'#8c5a3c'}}>Tiền hàng {getTotalPrice().toLocaleString('vi-VN')}đ{effectiveShipFee?` + Ship ${effectiveShipFee.toLocaleString('vi-VN')}đ`:''}{discountVal>0?` − Chiết khấu ${discountVal.toLocaleString('vi-VN')}đ`:''}{vatAmount>0?` + VAT 8% ${vatAmount.toLocaleString('vi-VN')}đ`:''}{Number(deposit)>0?` · Đã cọc ${Number(deposit).toLocaleString('vi-VN')}đ · Còn lại ${remaining.toLocaleString('vi-VN')}đ`:''}</div>
   </div>
   {error&&<div style={{color:'#b42318',marginTop:10}}>{error}</div>}
   <button disabled={saving} onClick={submit} style={{width:'100%',minHeight:66,marginTop:18,border:0,borderRadius:18,background:saving?'#c7b6a3':'#ef642b',color:'#fff',fontSize:20,fontWeight:950,boxShadow:saving?'none':'0 7px 0 #b93e13',opacity:1}}>{saving?'ĐANG TẠO...':(isReadyStock?'TẠO ĐƠN & BÁO VẬN TẢI NGAY':'TẠO ĐƠN HÀNG')}</button>
   </div>
   <div style={{flex:isMobile?'1 1 auto':'1 1 320px',minWidth:0,width:isMobile?'100%':undefined}}>
    <div style={{position:isMobile?'static':'sticky',top:12}}>
     <OrderPreviewV2 type={type} customerName={type==='school'?selectedSchool?.name:customerName} customerPhone={customerPhone} selectedSchool={selectedSchool} items={items} guestCount={guestCount} fulfillment={fulfillment} address={address} requiredAt={requiredAt} note={note} itemsTotal={getTotalPrice()} shipFee={effectiveShipFee} paymentMethod={paymentMethod} deposit={Number(deposit)||0} grandTotal={grandTotal} remaining={remaining} discountAmount={discountVal} promotionNote={type!=='school'?promotionNote:''} taxCode={type!=='school'?taxCode:''} vatAmount={vatAmount}/>
    </div>
   </div>
   </div>
  </div></div>;
}
