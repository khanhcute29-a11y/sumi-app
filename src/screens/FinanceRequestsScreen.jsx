import React,{useEffect,useRef,useState} from 'react';
import {supabase} from '../lib/supabaseClient';
import {useAuth} from '../lib/AuthContext';
import {hasAnyRole} from '../lib/roles';
import {VoiceMicButton} from '../components/VoiceMicButton';
import {playConfirmSound} from '../lib/sound';
import {uploadPhoto} from '../lib/queries';
import {toWebSafeImage} from '../lib/imageConvert';
import {parseVoiceByContext} from '../lib/parseVoiceContext';
import {OrderCodePicker} from '../components/OrderCodePicker';

const money=n=>Number(n||0).toLocaleString('vi-VN')+'đ';
const nowLocal=()=>{const d=new Date(Date.now()-new Date().getTimezoneOffset()*60000);return d.toISOString().slice(0,16)};
const labels={pending_director:'Chờ Giám đốc',pending_accounting:'Chờ Kế toán',recorded:'Đã ghi sổ',paid:'Đã chi',rejected:'Từ chối',cancelled:'Đã hủy'};

export default function FinanceRequestsScreen(){
 const {profile}=useAuth(),director=hasAnyRole(profile,['owner','admin']),finance=hasAnyRole(profile,['owner','admin','accountant','cashier']);
 const[tab,setTab]=useState('expense'),[expenses,setExpenses]=useState([]),[advances,setAdvances]=useState([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 // Khoản chi thật (chi tạm ứng) — kể từ khi bắt buộc Nguồn tiền + ảnh chứng
 // từ ở database, đơn nào đang chờ "Xác nhận đã chi" phải mở popup này thay
 // vì gọi thẳng RPC chỉ với p_id (RPC cũ đã bị xoá, chỉ còn bản 3 tham số).
 const[payingRow,setPayingRow]=useState(null);
 const load=async()=>{setError('');try{const[e,a]=await Promise.all([supabase.from('expense_claims').select('*').order('created_at',{ascending:false}),supabase.from('salary_advance_requests').select('*').order('created_at',{ascending:false})]);if(e.error)throw e.error;if(a.error)throw a.error;setExpenses(e.data||[]);setAdvances(a.data||[])}catch(e){setError(e.message)}};
 useEffect(()=>{load()},[profile?.id]);
 const act=async(fn,args)=>{setBusy(true);try{const r=await supabase.rpc(fn,args);if(r.error)throw r.error;playConfirmSound();await load()}catch(e){setError(e.message)}finally{setBusy(false)}};
 const friendly=error&&(error.includes('does not exist')||error.includes('schema cache')||error.includes('expense_claims'))?'Chức năng đang chờ kích hoạt dữ liệu tài chính trên Supabase.':error;
 return <div className="finance-request-page"><header><small>CHI TIÊU MINH BẠCH</small><h1>Chi & tạm ứng</h1><p>Báo nhanh bằng chữ, giọng nói hoặc ảnh. Hệ thống tự xác định khoản cần Giám đốc duyệt.</p></header><nav><button className={tab==='expense'?'active':''} onClick={()=>setTab('expense')}>🧾 Khoản chi</button><button className={tab==='advance'?'active':''} onClick={()=>setTab('advance')}>💵 Tạm ứng lương</button></nav>{tab==='expense'?<><ExpenseForm onDone={load}/><Rows rows={expenses} kind="expense" director={director} finance={finance} busy={busy} act={act} onNeedDisburse={setPayingRow}/></>:<><AdvanceForm onDone={load}/><Rows rows={advances} kind="advance" director={director} finance={finance} busy={busy} act={act} onNeedDisburse={setPayingRow}/></>}{friendly&&<div className="finance-error">{friendly}</div>}{payingRow&&<DisburseForm row={payingRow} act={act} busy={busy} onClose={()=>setPayingRow(null)}/>}</div>
}

// Chọn Nguồn tiền chi ra + ảnh chứng từ — bắt buộc ở database (xem migration
// 202608271700), nên bắt buộc ở đây trước khi gọi record_expense_claim /
// pay_salary_advance.
function DisburseForm({row,act,busy,onClose}){
 const[method,setMethod]=useState('cash'),[receipt,setReceipt]=useState(null),[uploading,setUploading]=useState(false),[error,setError]=useState('');
 const ref=useRef();
 const pick=async f=>{if(!f)return;setUploading(true);setError('');try{const safe=await toWebSafeImage(f);const url=await uploadPhoto(safe,`disburse_${row.kind}_${row.id}`);setReceipt(url)}catch(e){setError(e.message)}finally{setUploading(false)}};
 const confirm=async()=>{
  if(!receipt){setError('Bắt buộc chụp ảnh chứng từ chi tiền.');return}
  await act(row.kind==='expense'?'record_expense_claim':'pay_salary_advance',{p_id:row.id,p_payment_method:method,p_receipt_url:receipt});
  onClose();
 };
 return <div className="finance-disburse-overlay" onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(0,0,0,.5)',zIndex:200,display:'flex',alignItems:'flex-end',justifyContent:'center'}}>
  <div onClick={e=>e.stopPropagation()} style={{background:'#fff',width:'100%',maxWidth:420,borderRadius:'18px 18px 0 0',padding:18,boxSizing:'border-box'}}>
   <h3 style={{margin:'0 0 4px'}}>Xác nhận chi tiền</h3>
   <p style={{margin:'0 0 12px',color:'#725f50',fontSize:13}}>Bắt buộc chọn nguồn tiền và ảnh chứng từ trước khi ghi sổ.</p>
   <label style={{display:'block',fontWeight:700,fontSize:13,marginBottom:6}}>Nguồn tiền chi ra</label>
   <select value={method} onChange={e=>setMethod(e.target.value)} style={{width:'100%',minHeight:44,borderRadius:10,border:'1px solid #eadcca',marginBottom:12}}>
    <option value="cash">💵 Tiền mặt</option>
    <option value="bank_vcb">🏦 Chuyển khoản VCB</option>
    <option value="bank_tcb">🏦 Chuyển khoản TCB</option>
    <option value="momo">📱 MoMo</option>
   </select>
   <button onClick={()=>ref.current?.click()} disabled={uploading} style={{width:'100%',minHeight:44,borderRadius:10,border:'2px dashed #eadcca',background:'#fff',marginBottom:12}}>
    {uploading?'Đang tải ảnh...':receipt?'📎 Đã có ảnh chứng từ':'📷 Chụp ảnh hoặc chọn ảnh chuyển khoản có sẵn'}
   </button>
   <input ref={ref} hidden type="file" accept="image/*" onChange={e=>pick(e.target.files?.[0])}/>
   {error&&<p className="finance-inline-error">{error}</p>}
   <div style={{display:'flex',gap:8}}>
    <button onClick={onClose} disabled={busy} style={{flex:1,minHeight:46,borderRadius:10,border:'1px solid #eadcca',background:'#fff'}}>Huỷ</button>
    <button onClick={confirm} disabled={busy||uploading||!receipt} style={{flex:2,minHeight:46,borderRadius:10,border:'none',background:(busy||uploading||!receipt)?'#e8b6a0':'#f05c2b',color:'#fff',fontWeight:800}}>
     {busy?'Đang lưu...':'✓ Xác nhận'}
    </button>
   </div>
  </div>
 </div>;
}

function ExpenseForm({onDone}){const[a,setA]=useState(''),[desc,setDesc]=useState(''),[note,setNote]=useState(''),[order,setOrder]=useState(''),[when,setWhen]=useState(nowLocal()),[receipt,setReceipt]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');const ref=useRef();
 const pick=async f=>{if(!f)return;setBusy(true);try{const safe=await toWebSafeImage(f),url=await uploadPhoto(safe,`expense_${Date.now()}`);setReceipt({url,name:safe.name,type:safe.type})}catch(e){setError(e.message)}finally{setBusy(false)}};
 const send=async()=>{if(!a||!desc.trim())return setError('Nhập số tiền và nội dung chi.');setBusy(true);try{const r=await supabase.rpc('submit_expense_claim',{p_amount:Number(a),p_description:desc.trim(),p_note:note.trim()||null,p_related_order_code:order.trim()||null,p_receipt_attachments:receipt?[receipt]:null,p_occurred_at:new Date(when).toISOString()});if(r.error)throw r.error;setA('');setDesc('');setNote('');setOrder('');setReceipt(null);setWhen(nowLocal());await onDone()}catch(e){setError(e.message)}finally{setBusy(false)}};
 const onVoice=t=>{const{amount,label}=parseVoiceByContext('finance',t);if(amount)setA(String(amount));setDesc(label||t)};
 return <section className="finance-form"><Title icon="🧾" title="Báo một khoản chi" text="Người chi và nơi làm việc được lấy tự động."/>
 <div className="voice-field" style={{marginBottom:10}}><VoiceMicButton onTranscript={onVoice}/><span style={{fontSize:12,color:'#725f50'}}>Nói VD: "Chi một trăm hai mươi nghìn mua đá lạnh"</span></div>
 <Field name="Số tiền"><input type="number" inputMode="numeric" value={a} onChange={e=>setA(e.target.value)} placeholder="Ví dụ: 120000"/></Field><Field name="Nội dung chi"><textarea value={desc} onChange={e=>setDesc(e.target.value)} placeholder="Ví dụ: mua thêm đá lạnh cho đơn gấp"/></Field><Field name="Ngày giờ phát sinh"><input type="datetime-local" value={when} onChange={e=>setWhen(e.target.value)}/></Field><Field name="Ghi chú"><Voice value={note} set={setNote} placeholder="Ví dụ: Sếp đưa tiền mặt; mượn từ thu ngân"/></Field><Field name="Mã đơn nếu có"><OrderCodePicker value={order} onChange={setOrder} placeholder="Không bắt buộc"/></Field><button className="receipt-button" onClick={()=>ref.current?.click()}>📷 {receipt?'Đã có ảnh chứng từ':'Chụp hóa đơn/chứng từ'}</button><input ref={ref} hidden type="file" accept="image/*" capture="environment" onChange={e=>pick(e.target.files?.[0])}/><button className="finance-submit" disabled={busy} onClick={send}>{busy?'ĐANG LƯU...':'GỬI KHOẢN CHI'}</button>{error&&<p className="finance-inline-error">{error}</p>}</section>}

function AdvanceForm({onDone}){const[a,setA]=useState(''),[reason,setReason]=useState(''),[needed,setNeeded]=useState(new Date().toISOString().slice(0,10)),[method,setMethod]=useState('cash'),[busy,setBusy]=useState(false),[error,setError]=useState('');const send=async()=>{if(!a||!reason.trim())return setError('Nhập số tiền và lý do tạm ứng.');setBusy(true);try{const r=await supabase.rpc('submit_salary_advance',{p_amount:Number(a),p_reason:reason.trim(),p_needed_on:needed,p_payment_method:method});if(r.error)throw r.error;setA('');setReason('');await onDone()}catch(e){setError(e.message)}finally{setBusy(false)}};const onVoice=t=>{const{amount,label}=parseVoiceByContext('finance',t);if(amount)setA(String(amount));setReason(label||t)};return <section className="finance-form"><Title icon="💵" title="Xin tạm ứng lương" text="Mọi yêu cầu đều cần Giám đốc duyệt."/>
 <div className="voice-field" style={{marginBottom:10}}><VoiceMicButton onTranscript={onVoice}/><span style={{fontSize:12,color:'#725f50'}}>Nói VD: "Tạm ứng 2 triệu lo tiền nhà"</span></div>
 <Field name="Số tiền"><input type="number" inputMode="numeric" value={a} onChange={e=>setA(e.target.value)} placeholder="Ví dụ: 1000000"/></Field><Field name="Lý do"><textarea value={reason} onChange={e=>setReason(e.target.value)} placeholder="Nói hoặc nhập lý do cần tạm ứng"/></Field><Field name="Ngày cần nhận"><input type="date" value={needed} onChange={e=>setNeeded(e.target.value)}/></Field><div className="finance-method"><button className={method==='cash'?'active':''} onClick={()=>setMethod('cash')}>💴 Tiền mặt</button><button className={method==='bank_transfer'?'active':''} onClick={()=>setMethod('bank_transfer')}>🏦 Chuyển khoản</button></div><button className="finance-submit" disabled={busy} onClick={send}>{busy?'ĐANG GỬI...':'GỬI GIÁM ĐỐC DUYỆT'}</button>{error&&<p className="finance-inline-error">{error}</p>}</section>}

const Title=({icon,title,text})=><div className="finance-form-title"><span>{icon}</span><div><h2>{title}</h2><p>{text}</p></div></div>;
const Field=({name,children})=><label>{name}{children}</label>;
const Voice=({value,set,placeholder})=><div className="voice-field"><textarea value={value} onChange={e=>set(e.target.value)} placeholder={placeholder}/><VoiceMicButton onTranscript={set}/></div>;

function Rows({rows,kind,director,finance,busy,act,onNeedDisburse}){return <section className="finance-list"><div className="finance-list-title"><h2>{kind==='expense'?'Các khoản đã báo':'Yêu cầu tạm ứng'}</h2><b>{rows.filter(x=>x.status.startsWith('pending')).length} chờ</b></div>{rows.length===0?<p className="finance-empty">Chưa có dữ liệu.</p>:rows.map(r=><article key={r.id} className={`finance-row ${r.status}`}><div className="finance-row-top"><div><strong>{kind==='expense'?r.description:r.employee_name}</strong><small>{kind==='expense'?r.claimant_name:r.reason}</small></div><b>{money(r.amount)}</b></div><div className="finance-meta"><span>{labels[r.status]}</span><time>{new Date(r.occurred_at||r.created_at).toLocaleString('vi-VN')}</time></div>{kind==='expense'&&r.note&&<p>Ghi chú: {r.note}</p>}{kind==='expense'&&r.approval_reason&&<em>⚠ {r.approval_reason}</em>}{kind==='expense'&&r.receipt_attachments?.[0]?.url&&<a href={r.receipt_attachments[0].url} target="_blank" rel="noreferrer">📷 Xem chứng từ báo chi</a>}{(r.status==='recorded'||r.status==='paid')&&r.disbursed_receipt_url&&<a href={r.disbursed_receipt_url} target="_blank" rel="noreferrer">📎 Xem chứng từ đã chi ({r.disbursed_payment_method})</a>}{r.status==='pending_director'&&director&&<div className="finance-actions"><button onClick={()=>act(kind==='expense'?'review_expense_claim':'review_salary_advance',{p_id:r.id,p_approve:false,p_note:null})}>Từ chối</button><button onClick={()=>act(kind==='expense'?'review_expense_claim':'review_salary_advance',{p_id:r.id,p_approve:true,p_note:null})}>Duyệt</button></div>}{r.status==='pending_accounting'&&finance&&<button className="finance-record" disabled={busy} onClick={()=>onNeedDisburse({kind,id:r.id})}>{kind==='expense'?'XÁC NHẬN & GHI SỔ':'XÁC NHẬN ĐÃ CHI'}</button>}</article>)}</section>}
