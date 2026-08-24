import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { createOrderV2 } from '../lib/featureFlags';
import { useAuth } from '../lib/AuthContext';
import { newId } from '../lib/ids';
import { ORDER_FLOWS, CAKE_LINES, TEABREAK_CATALOG, MOONCAKE_CATALOG, normalizeSearch } from '../data/orderCatalogs';
import { SCHOOL_DELIVERY_POINTS } from '../data/schoolCatalog';
import { CAKE_BASES, CAKE_FILLINGS, baseSurcharge } from '../lib/cakePricing';

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

function OrderPreviewV2({type,customerName,customerPhone,selectedSchool,items,guestCount,fulfillment,address,requiredAt,note,itemsTotal,shipFee,paymentMethod,deposit,grandTotal,remaining}){
 const itemLine=(it)=>{
  const s=it.specification||{};
  const fillingLabel=CAKE_FILLINGS.find(f=>f.value===s.filling)?.label;
  const parts=[s.size,s.cot,fillingLabel,s.content&&`chữ: ${s.content}`,s.candle&&`nến: ${s.candle}`,s.packing,s.colors?.length&&`màu: ${s.colors.join(', ')}`,s.fillings?.length&&`nhân: ${s.fillings.join(', ')}`,s.color,s.flavor,s.spec,s.catalog_specification].filter(Boolean);
  return `${it.name?.trim()||'(chưa đặt tên)'} × ${it.quantity}${parts.length?` (${parts.join(', ')})`:''}`;
 };
 const displayName=type==='school'?(selectedSchool?.name||customerName):customerName;
 return <div style={{display:'flex',flexDirection:'column',gap:10,background:'#f5f1eb',borderRadius:17,padding:16,border:'2px solid #e0d5c7'}}>
  <div style={{fontSize:12,color:'#8c5a3c',fontWeight:800,display:'flex',alignItems:'center',gap:4}}>👁 XEM TRƯỚC ĐƠN HÀNG</div>
  <div style={{fontWeight:900,color:'#2d1c10',fontSize:16}}>{displayName||'Khách chưa đặt tên'}</div>
  {customerPhone&&type!=='school'&&<div style={{fontSize:13,color:'#725f50'}}>📞 {customerPhone}</div>}
  {type==='teabreak'&&guestCount&&<div style={{fontSize:13,color:'#725f50'}}>👥 {guestCount} khách</div>}
  <div style={{fontSize:13,color:'#725f50'}}>{items.length?items.map(itemLine).join(', '):'Chưa có sản phẩm nào'}</div>
  <div style={{fontSize:13,color:'#725f50'}}>{fulfillment==='delivery'?'🛵 Giao hàng tận nơi':'🏬 Nhận tại quầy'}{fulfillment==='delivery'&&` · Ship: ${shipFee?`${shipFee.toLocaleString('vi-VN')}đ`:'Miễn phí'}`}</div>
  {fulfillment==='delivery'&&address&&<div style={{fontSize:13,color:'#725f50'}}>📍 {address}</div>}
  {requiredAt&&<div style={{fontSize:13,color:'#725f50'}}>🕒 {new Date(requiredAt).toLocaleString('vi-VN')}</div>}
  {type!=='school'&&<div style={{display:'flex',flexDirection:'column',gap:4,paddingTop:8,borderTop:'1px solid #e0d5c7'}}>
   <div style={{display:'flex',justifyContent:'space-between',color:'#725f50',fontSize:13}}><span>Tiền hàng</span><span>{itemsTotal.toLocaleString('vi-VN')}đ</span></div>
   <div style={{display:'flex',justifyContent:'space-between',fontWeight:900,color:'#2d1c10'}}><span>Tổng tiền</span><span>{grandTotal?`${grandTotal.toLocaleString('vi-VN')}đ`:'0 đồng'}</span></div>
   <div style={{display:'flex',justifyContent:'space-between',color:'#725f50',fontSize:13}}><span>Đặt cọc</span><span>{deposit?`${deposit.toLocaleString('vi-VN')}đ`:'0 đồng'}</span></div>
   <div style={{display:'flex',justifyContent:'space-between',color:'#725f50',fontSize:13}}><span>Còn lại</span><span>{remaining.toLocaleString('vi-VN')}đ</span></div>
   <div style={{fontSize:11,color:'#8c5a3c'}}>Thanh toán: <span style={{fontWeight:700}}>{PAYMENT_METHODS.find(p=>p.value===paymentMethod)?.label}</span></div>
  </div>}
  {note&&<div style={{fontSize:13,color:'#725f50'}}>📝 {note}</div>}
 </div>;
}

export default function CreateOrderV2Modal({onClose,onCreated,embedded=false}){
 const {profile}=useAuth();
 const isOwnerAdmin=['owner','admin'].includes(profile?.role)||(profile?.extra_roles||[]).some(r=>['owner','admin'].includes(r));
 const isDirector=isOwnerAdmin||['deputy_director_x42'].includes(profile?.role)||(profile?.extra_roles||[]).some(r=>['deputy_director_x42'].includes(r));
 const isMacaronCreator=isOwnerAdmin||['deputy_director_x41'].includes(profile?.role)||(profile?.extra_roles||[]).some(r=>['deputy_director_x41'].includes(r));
 const visibleFlows=ORDER_FLOWS.filter(f=>(f.key!=='school'||isDirector)&&(f.key!=='macaron'||isMacaronCreator));
 const [type,setType]=useState(null); const [requiredAt,setRequiredAt]=useState('');
 const [customerName,setCustomerName]=useState(''); const [customerPhone,setCustomerPhone]=useState('');
 const [fulfillment,setFulfillment]=useState('delivery'); const [address,setAddress]=useState(''); const [note,setNote]=useState('');
 const [items,setItems]=useState([]); const [photos,setPhotos]=useState([]); const [saving,setSaving]=useState(false); const [error,setError]=useState('');
 const [showLibraryPicker,setShowLibraryPicker]=useState(false); const [libraryPhotos,setLibraryPhotos]=useState([]); const [libraryLoading,setLibraryLoading]=useState(false); const [selectedLibraryPhotos,setSelectedLibraryPhotos]=useState([]); const [libraryUploading,setLibraryUploading]=useState(false);
 const [isReadyStock, setIsReadyStock] = useState(false);
 const [catalogSearch,setCatalogSearch]=useState(''); const [guestCount,setGuestCount]=useState('');
 const [schoolSearch,setSchoolSearch]=useState(''); const [selectedSchool,setSelectedSchool]=useState(null);
 const [entryMode,setEntryMode]=useState('manual'); const [cakeLine,setCakeLine]=useState('decorated_cake');
 const [hasShipFee,setHasShipFee]=useState('no'); const [shipFee,setShipFee]=useState('');
 const [paymentMethod,setPaymentMethod]=useState('cod'); const [deposit,setDeposit]=useState('');
 const [productCatalog,setProductCatalog]=useState([]);
 const [isMobile,setIsMobile]=useState(typeof window!=='undefined'?window.innerWidth<860:false);
 const [isRecording,setIsRecording]=useState(false); const [voiceLoading,setVoiceLoading]=useState(false);
 useEffect(()=>{const onResize=()=>setIsMobile(window.innerWidth<860);window.addEventListener('resize',onResize);return()=>window.removeEventListener('resize',onResize)},[]);
 useEffect(()=>{let active=true;supabase.from('products').select('id,name,category,unit,price,product_variants(id,label,price)').eq('active',true).order('name').limit(500).then(({data,error})=>{if(active&&!error)setProductCatalog([...(data||[]),...MOONCAKE_CATALOG])});return()=>{active=false}},[]);
 const change=(i,key,value)=>setItems(x=>x.map((it,n)=>n===i?{...it,[key]:value}:it));
 const changeMany=(i,fields)=>setItems(x=>x.map((it,n)=>n===i?{...it,...fields}:it));
 const spec=(i,key,value)=>setItems(x=>x.map((it,n)=>n===i?{...it,specification:{...it.specification,[key]:value}}:it));
 const getPrice=(item)=>item.unit_price ?? item.specification?.catalog_price ?? 0;
 const getItemTotal=(item)=>(getPrice(item)||0)*(Number(item.quantity)||0);
 const getTotalPrice=()=>items.reduce((sum,item)=>sum+getItemTotal(item),0);
 const effectiveShipFee=hasShipFee==='yes'?(Number(shipFee)||0):0;
 const grandTotal=getTotalPrice()+effectiveShipFee;
 const remaining=grandTotal-(Number(deposit)||0);
 const blankItem=(key)=>({id:crypto.randomUUID(),flow_type:key,name:'',quantity:1,unit:'cái',specification:{product_flow:key,...(key==='cake'?{cake_line:cakeLine}:{})}});
 const selectFlow=(key)=>{if(key==='school'&&!isDirector)return;if(key==='macaron'&&!isMacaronCreator)return;setType(key);setItems(key==='teabreak'?[]:[blankItem(key)]);};
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
 const loadLibraryPhotos=async()=>{setLibraryLoading(true);try{const {data,error:err}=await supabase.from('macaron_photo_library').select('id,storage_path,caption,created_at').order('created_at',{ascending:false});if(err)throw err;setLibraryPhotos((data||[]).map(p=>({...p,url:supabase.storage.from('uploads').getPublicUrl(p.storage_path).data?.publicUrl})));}catch(e){setError(e.message);}finally{setLibraryLoading(false);}};
 const openLibraryPicker=()=>{setShowLibraryPicker(true);loadLibraryPhotos();};
 const toggleLibraryPhoto=(p)=>{setSelectedLibraryPhotos(x=>x.some(y=>y.id===p.id)?x.filter(y=>y.id!==p.id):[...x,p]);};
 const uploadToLibrary=async(file)=>{
  setLibraryUploading(true);setError('');
  try{
   const cleanExt=(file.name.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'')||'jpg';
   const safePath=`macaron-library/${newId()}.${cleanExt}`;
   const {error:upErr}=await supabase.storage.from('uploads').upload(safePath,file,{contentType:file.type||'image/jpeg'});
   if(upErr)throw upErr;
   const {error:insErr}=await supabase.from('macaron_photo_library').insert({storage_path:safePath,uploaded_by:profile?.id||null,uploaded_by_name:profile?.full_name||null});
   if(insErr)throw insErr;
   await loadLibraryPhotos();
  }catch(e){setError(e.message);}finally{setLibraryUploading(false);}
 };
 const startVoiceInput=async()=>{if(isRecording)return;setIsRecording(true);setVoiceLoading(true);try{const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SpeechRecognition){setError('Trình duyệt không hỗ trợ nhập giọng nói');setIsRecording(false);setVoiceLoading(false);return}const recognition=new SpeechRecognition();recognition.lang='vi-VN';recognition.interimResults=true;let transcript='';recognition.onresult=(event)=>{transcript=Array.from(event.results).map(r=>r[0].transcript).join('')};recognition.onerror=(event)=>{setError(`Lỗi: ${event.error}`)};recognition.onend=async()=>{setIsRecording(false);if(transcript.trim()){await parseVoiceInput(transcript)}else{setError('Không ghi âm được. Thử lại?')}setVoiceLoading(false)};recognition.start();setTimeout(()=>recognition.stop(),8000)}catch(e){setError(`Lỗi: ${e.message}`);setIsRecording(false);setVoiceLoading(false)}};const parseVoiceInput=async(text)=>{try{setVoiceLoading(true);const{data,error}=await supabase.functions.invoke('parse-voice-order',{body:{transcript:text,orderType:type,locale:'vi-VN'}});if(error)throw error;if(data?.customerName)setCustomerName(data.customerName);if(data?.customerPhone)setCustomerPhone(data.customerPhone);if(data?.address)setAddress(data.address);if(data?.items?.length)setItems(data.items.map(it=>({...it,id:crypto.randomUUID()})));if(data?.note)setNote(data.note)}catch(e){console.error('Parse error:',e);setError(`Phân tích không thành công: ${e.message}`)}finally{setVoiceLoading(false)}};
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
  if(customerName||customerPhone){
    const {data: cust} = await supabase.from('customers').select('id').match({name: customerName || null, phone: customerPhone || null}).maybeSingle();
    if(!cust) {
      const {data: newCust} = await supabase.from('customers').insert({name: customerName || null, phone: customerPhone || null, created_by: user?.id}).select('id').single();
      customerId = newCust?.id || null;
    } else {
      customerId = cust?.id || null;
    }
  }
  const customerNote=[customerName&&`Khách hàng: ${customerName}`,customerPhone&&`SĐT: ${customerPhone}`,type==='teabreak'&&guestCount&&`Số khách: ${guestCount}`,note,isReadyStock&&'⚡ BÁNH CÓ SẴN (XUẤT KHO THÀNH PHẨM NGAY)'].filter(Boolean).join(' · ');
  const normalizedItems=items.map((item,index)=>({...item,display_order:index,specification:{...(item.specification||{}),product_flow:item.flow_type||type,is_ready_stock:isReadyStock}}));
  const {data: orderId, error: orderErr} = await supabase.rpc('create_order_v2',{p_idempotency_key:key,p_order_code:orderCode,p_order_type:isMixed?'mixed':type,p_customer_id:customerId,p_required_at:requiredAt?new Date(requiredAt).toISOString():null,p_fulfillment_method:fulfillment,p_address:fulfillment==='delivery'?address:null,p_note:customerNote||null,p_confidentiality:type==='school'?'school_restricted':'normal',p_items:normalizedItems,p_ship_fee:effectiveShipFee,p_deposit:Number(deposit)||0,p_payment_method:paymentMethod,p_total:grandTotal});
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
  if(isReadyStock){
    const {error: readyErr} = await supabase.rpc('mark_order_ready_from_stock',{p_order_id:orderId});
    if(readyErr) {
      setError(`Báo vận tải thất bại: ${readyErr.message}`);
      throw readyErr;
    }
  }
  console.log('✅ Order created:', orderId);
  onCreated?.(orderId);
  setTimeout(() => {
    console.log('🔔 Closing modal...');
    onClose();
  }, 500);
 }catch(e){console.error('❌ Order error:', e);setError(e.message||'Không thể tạo đơn');}finally{setSaving(false);}};
 if(!type)return <div className={embedded?'sumi-order-create-page':'sumi-order-create-overlay'} onClick={embedded?undefined:onClose}>
  <div className="sumi-order-create-body sumi-flow-picker" onClick={e=>e.stopPropagation()}>
   <div className="sumi-create-head"><button onClick={onClose} aria-label="Quay lại">←</button><h2>Tạo đơn mới</h2></div>
   <div className="sumi-create-intro"><strong>Đơn này thuộc loại nào?</strong><span>Chọn đúng loại để chỉ hiện những thông tin cần nhập.</span></div>
   <div className="sumi-flow-grid">{visibleFlows.map(item=><button key={item.key} onClick={()=>selectFlow(item.key)}><b>{item.icon}</b><strong>{item.title}</strong><span>{item.subtitle}</span></button>)}</div>
   <div className="sumi-entry-title"><strong>Cách nhập đơn</strong><span>Chọn trước hoặc bổ sung ảnh sau</span></div>
   <div className="sumi-entry-grid"><button className={entryMode==='photo'?'active':''} onClick={()=>setEntryMode('photo')}>📷<span>Chụp đơn</span></button><button className={entryMode==='voice'?'active':''} onClick={()=>setEntryMode('voice')}>🎤<span>Nói để nhập</span></button></div>
   {entryMode!=='manual'&&<div className="sumi-entry-note">Đã chọn {entryMode==='photo'?'chụp ảnh':'nhập bằng giọng nói'}. Bây giờ chọn loại đơn ở phía trên.</div>}
  </div></div>;
 return <div className={embedded?'sumi-order-create-page':'sumi-order-create-overlay'} onClick={embedded?undefined:onClose}>
  <div className="sumi-order-create-body" style={isMobile?undefined:{maxWidth:1040}} onClick={e=>e.stopPropagation()}>
   <div className="sumi-create-head"><button onClick={()=>setType(null)} aria-label="Chọn lại loại đơn">←</button><h2>{isMixed?'🧺 Đơn nhiều sản phẩm':`${flow?.icon} ${flow?.title}`}</h2></div>
   <button className="sumi-change-flow" onClick={()=>setType(null)}>Đổi loại đơn</button>
   {entryMode!=='manual'&&<div className="sumi-entry-note">{entryMode==='photo'?'📷 Đơn được nhập từ ảnh — cần kiểm tra trước khi tạo':'🎤 Đơn được nhập bằng giọng nói — cần xác nhận lại nội dung'}</div>}
   <div style={{display:'flex',flexDirection:isMobile?'column':'row',gap:20,alignItems:'flex-start'}}>
   <div style={{flex:isMobile?'1 1 auto':'1 1 480px',minWidth:0}}>
   <p style={{color:'#725f50',fontWeight:700}}>Người tạo: {profile?.full_name||'Nhân viên'} · tự lưu ngày giờ</p>
   {type==='school'&&<section className="sumi-catalog-picker sumi-school-picker">
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
   {items.length>0&&<section className="sumi-mixed-summary"><header><div><small>ĐƠN HÀNG XUYÊN SUỐT</small><strong>{isMixed?'Nhiều bếp cùng thực hiện':'Một nhóm sản xuất'}</strong></div><b>{itemFlows.length} nhóm</b></header><div>{itemFlows.map(key=>{const meta=ORDER_FLOWS.find(x=>x.key===key);const count=items.filter(x=>(x.flow_type||type)===key).length;return <span key={key}><i>{meta?.icon}</i><b>{meta?.title}</b><small>{count} món · {routeFor[key]}</small></span>})}</div></section>}
   {items.map((it)=>{const itemIndex=items.indexOf(it);const itemPrice=getPrice(it);const itemTotal=getItemTotal(it);return <div key={it.id} style={{padding:12,border:'1px solid var(--border-default)',borderRadius:16,marginBottom:10,background:'var(--surface-card)'}}>
    <div className="sumi-item-flow"><span>{ORDER_FLOWS.find(x=>x.key===(it.flow_type||type))?.icon}</span><b>{ORDER_FLOWS.find(x=>x.key===(it.flow_type||type))?.title}</b><em>→ {routeFor[it.flow_type||type]}</em></div>
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
      {it.variants?.length?<select style={fieldStyle} value={it.specification?.priceTier||''} onChange={e=>{const v=it.variants.find(x=>x.label===e.target.value);changeMany(itemIndex,{unit_price:v?.price??null,specification:{...it.specification,priceTier:e.target.value}})}}><option value="">Chọn mức giá theo số lượng...</option>{it.variants.map(v=><option key={v.id} value={v.label}>{v.label} — {Number(v.price).toLocaleString('vi-VN')}đ</option>)}</select>:<input style={fieldStyle} inputMode="numeric" placeholder="Đơn giá (VD: 50.000)" value={fmtMoney(it.unit_price)} onChange={e=>change(itemIndex,'unit_price',parseMoney(e.target.value))}/>}
      <select style={fieldStyle} value={it.unit||'cái'} onChange={e=>change(itemIndex,'unit',e.target.value)}><option value="cái">Đơn vị: Cái</option><option value="khay">Đơn vị: Khay</option><option value="thùng">Đơn vị: Thùng</option><option value="hộp">Đơn vị: Hộp</option></select>
      <input style={{...fieldStyle,gridColumn:'1 / -1'}} placeholder="Quy cách (VD: Khay 36 cặp - 4cm, Hộp 100 cặp - 2cm)" value={it.specification?.packing||''} onChange={e=>spec(itemIndex,'packing',e.target.value)}/>
      <div style={{gridColumn:'1 / -1',display:'flex',flexDirection:'column',gap:6}}>
       <label style={{fontSize:13,fontWeight:800,color:'#2d1c10'}}>Màu (chọn nhiều màu)</label>
       <MultiChipPicker options={MACARON_COLORS} selected={it.specification?.colors||[]} onToggle={c=>{const cur=it.specification?.colors||[];spec(itemIndex,'colors',cur.includes(c)?cur.filter(x=>x!==c):[...cur,c])}}/>
      </div>
      <div style={{gridColumn:'1 / -1',display:'flex',flexDirection:'column',gap:6}}>
       <label style={{fontSize:13,fontWeight:800,color:'#2d1c10'}}>Nhân (chọn nhiều vị)</label>
       <MultiChipPicker options={MACARON_FILLINGS} selected={it.specification?.fillings||[]} onToggle={f=>{const cur=it.specification?.fillings||[];spec(itemIndex,'fillings',cur.includes(f)?cur.filter(x=>x!==f):[...cur,f])}}/>
      </div>
      <input style={{...fieldStyle,gridColumn:'1 / -1'}} placeholder="Ghi chú thêm về màu/nhân (VD: đỏ 4 khay, xanh 6 khay...)" value={it.specification?.color||''} onChange={e=>spec(itemIndex,'color',e.target.value)}/>
     </>}
     {(it.flow_type||type)==='school'&&<>{it.variants?.length?<select style={fieldStyle} value={it.specification?.size||''} onChange={e=>{const v=it.variants.find(x=>x.label===e.target.value);changeMany(itemIndex,{unit_price:v?.price??null,specification:{...it.specification,size:e.target.value}})}}><option value="">Chọn trọng lượng...</option>{it.variants.map(v=><option key={v.id} value={v.label}>{v.label} — {Number(v.price).toLocaleString('vi-VN')}đ</option>)}</select>:<input style={fieldStyle} placeholder="Quy cách" value={it.specification?.spec||''} onChange={e=>spec(itemIndex,'spec',e.target.value)}/>}<input style={fieldStyle} placeholder="Khối/lớp/ghi chú" value={it.specification?.grade_note||''} onChange={e=>spec(itemIndex,'grade_note',e.target.value)}/></>}
     {(it.flow_type||type)!=='school'&&!((it.flow_type||type)==='bakery'&&it.specification?.product_line==='moon_cake')&&<input style={fieldStyle} inputMode="numeric" placeholder="Đơn giá (có thể để trống)" value={fmtMoney(it.unit_price)} onChange={e=>change(itemIndex,'unit_price',parseMoney(e.target.value))}/>}
    </div>{items.length>1&&<button onClick={()=>setItems(x=>x.filter((_,n)=>n!==itemIndex))} style={{marginTop:8,minHeight:44,color:'#b42318',border:0,background:'none',cursor:'pointer',fontWeight:600}}>✕ Xóa sản phẩm</button>}
   </div>;})}
   {items.length===0&&<div className="sumi-no-selection">Chưa chọn món. Tìm món phía trên hoặc thêm món tùy chỉnh.</div>}
   <button onClick={()=>{const key=itemFlows.at(-1)||type;setItems(x=>[...x,{...blankItem(key),specification:{...blankItem(key).specification,custom:true}}])}} style={{...fieldStyle,fontWeight:900,borderStyle:'dashed'}}>＋ Thêm món cùng nhóm</button>
   {type!=='school'&&<section className="sumi-add-flow"><strong>＋ Thêm nhóm sản phẩm khác</strong><p>Một mã đơn, mỗi nhóm tự chuyển tới đúng bếp.</p><div>{ORDER_FLOWS.filter(x=>x.key!=='school'&&(x.key!=='macaron'||isMacaronCreator)&&!itemFlows.includes(x.key)).map(x=><button key={x.key} onClick={()=>addFlow(x.key)}><span>{x.icon}</span><b>{x.title}</b><small>{routeFor[x.key]}</small></button>)}</div></section>}
   <label style={{display:'block',marginTop:14,fontWeight:800}}>Ngày giờ cần giao</label><input style={fieldStyle} type="datetime-local" value={requiredAt} onChange={e=>setRequiredAt(e.target.value)}/>
   {type==='school'?
    <div style={{marginTop:12,padding:'12px 14px',borderRadius:14,background:'#f5f1eb',border:'1px solid #e0d5c7',fontSize:14,color:'#725f50'}}>🚚 Giao tận nơi đến địa chỉ trường đã chọn — không thu ship, không thu tiền tại chỗ (trường thanh toán riêng).</div>
   :<>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginTop:12}}><button onClick={()=>setFulfillment('delivery')} style={{...fieldStyle,fontWeight:900,border:fulfillment==='delivery'?'3px solid #138a53':fieldStyle.border,background:fulfillment==='delivery'?'#e6f6ed':'#fff',color:fulfillment==='delivery'?'#09663d':'#2d1c10'}}>🛵 Giao tận nơi</button><button onClick={()=>setFulfillment('pickup')} style={{...fieldStyle,fontWeight:900,border:fulfillment==='pickup'?'3px solid #138a53':fieldStyle.border,background:fulfillment==='pickup'?'#e6f6ed':'#fff',color:fulfillment==='pickup'?'#09663d':'#2d1c10'}}>🏬 Nhận tại quầy</button></div>
    {fulfillment==='delivery'&&<input style={{...fieldStyle,marginTop:10}} placeholder="Địa chỉ giao" value={address} onChange={e=>setAddress(e.target.value)}/>}
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
     {type==='macaron'&&<button type="button" onClick={openLibraryPicker} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:4,minHeight:70,border:'2px dashed #d96b43',borderRadius:14,background:'#fdf6ef',cursor:'pointer'}}>🎨<span>Ảnh mẫu đã lưu</span></button>}
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
         <div className="sumi-create-head"><button onClick={()=>setShowLibraryPicker(false)} aria-label="Đóng">←</button><h2>🎨 Ảnh mẫu Macaron đã lưu</h2></div>
         <label style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8,minHeight:50,border:'2px dashed #d96b43',borderRadius:14,background:'#fdf6ef',cursor:'pointer',fontWeight:800,color:'#b93e13',marginBottom:14}}>
           {libraryUploading?'Đang tải lên...':'+ Thêm ảnh mới vào kho'}
           <input hidden type="file" accept="image/*" disabled={libraryUploading} onChange={e=>{const f=e.target.files?.[0];if(f)uploadToLibrary(f);e.target.value='';}}/>
         </label>
         {libraryLoading?<p>Đang tải ảnh...</p>:libraryPhotos.length===0?<p style={{color:'#725f50'}}>Chưa có ảnh nào trong kho. Bấm "Thêm ảnh mới vào kho" để lưu ảnh đầu tiên.</p>:
         <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(100px,1fr))',gap:10}}>
           {libraryPhotos.map(p=>{const active=selectedLibraryPhotos.some(x=>x.id===p.id);return(
             <button type="button" key={p.id} onClick={()=>toggleLibraryPhoto(p)} style={{position:'relative',padding:0,width:'100%',aspectRatio:'1',borderRadius:14,overflow:'hidden',border:active?'3px solid #087f5b':'1.5px solid var(--border-default)',background:'#000',cursor:'pointer'}}>
               <img src={p.url} alt="Ảnh mẫu macaron" style={{width:'100%',height:'100%',objectFit:'cover'}}/>
               {active&&<div style={{position:'absolute',top:4,right:4,width:26,height:26,borderRadius:'50%',background:'#087f5b',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:900}}>✓</div>}
             </button>
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
   <div style={{padding:14,marginTop:14,borderRadius:14,background:'#f5f1eb',border:'2px solid #e0d5c7'}}>
     <div style={{fontSize:12,color:'#725f50',fontWeight:700,marginBottom:8}}>💰 TỔNG ĐƠN HÀNG</div>
     <div style={{fontSize:28,fontWeight:900,color:'#d96b43',marginBottom:10}}>{grandTotal.toLocaleString('vi-VN')}đ</div>
     <div style={{fontSize:11,color:'#8c5a3c'}}>Tiền hàng {getTotalPrice().toLocaleString('vi-VN')}đ{effectiveShipFee?` + Ship ${effectiveShipFee.toLocaleString('vi-VN')}đ`:''}{Number(deposit)>0?` · Đã cọc ${Number(deposit).toLocaleString('vi-VN')}đ · Còn lại ${remaining.toLocaleString('vi-VN')}đ`:''}</div>
   </div>
   {error&&<div style={{color:'#b42318',marginTop:10}}>{error}</div>}
   <button disabled={saving} onClick={submit} style={{width:'100%',minHeight:66,marginTop:18,border:0,borderRadius:18,background:saving?'#c7b6a3':'#ef642b',color:'#fff',fontSize:20,fontWeight:950,boxShadow:saving?'none':'0 7px 0 #b93e13',opacity:1}}>{saving?'ĐANG TẠO...':(isReadyStock?'TẠO ĐƠN & BÁO VẬN TẢI NGAY':'TẠO ĐƠN HÀNG')}</button>
   </div>
   <div style={{flex:isMobile?'1 1 auto':'1 1 320px',minWidth:0,width:isMobile?'100%':undefined}}>
    <div style={{position:isMobile?'static':'sticky',top:12}}>
     <OrderPreviewV2 type={type} customerName={type==='school'?selectedSchool?.name:customerName} customerPhone={customerPhone} selectedSchool={selectedSchool} items={items} guestCount={guestCount} fulfillment={fulfillment} address={address} requiredAt={requiredAt} note={note} itemsTotal={getTotalPrice()} shipFee={effectiveShipFee} paymentMethod={paymentMethod} deposit={Number(deposit)||0} grandTotal={grandTotal} remaining={remaining}/>
    </div>
   </div>
   </div>
  </div></div>;
}
