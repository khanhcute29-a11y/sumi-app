import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../lib/AuthContext';
import { hasAnyRole } from '../lib/roles';
import { OrderCodePicker } from '../components/OrderCodePicker';
import { fetchMyStarsSummary } from '../lib/employeeOverviewV4';

const money=n=>Number(n||0).toLocaleString('vi-VN')+'đ';
const monthKey=()=>new Date().toISOString().slice(0,7);
const localDate=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh'}).format(new Date());
const nextMonthStart=month=>{const [year,number]=month.split('-').map(Number);return new Date(Date.UTC(year,number,1)).toISOString().slice(0,10)};
// star_bonus/star_penalty tu dong dong bo tu Gieo hat (sumi_dieu_chinh_sao),
// KHONG phai truong Ke toan go tay nhu cac cot con lai.
const total=e=>['base_pay','overtime_pay','allowance','kpi_bonus','output_bonus','delegation_bonus','other_bonus','star_bonus'].reduce((s,k)=>s+Number(e?.[k]||0),0)-Number(e?.advance_amount||0)-Number(e?.deduction_amount||0)-Number(e?.star_penalty||0);
const statusLabel={pending:'Chờ duyệt',approved:'Đã duyệt',rejected:'Từ chối',cancelled:'Đã hủy',draft:'Đang tổng hợp',review:'Chờ Giám đốc duyệt',locked:'Đã chốt'};

export default function CompensationScreen(){
 const {profile}=useAuth(); const manager=hasAnyRole(profile,['owner','admin','accountant']);
 const [month,setMonth]=useState(monthKey()); const [period,setPeriod]=useState(null); const [entries,setEntries]=useState([]); const [overtime,setOvertime]=useState([]);
 const [minutes,setMinutes]=useState(60); const [reason,setReason]=useState(''); const [orderCode,setOrderCode]=useState(''); const [error,setError]=useState(''); const [busy,setBusy]=useState(false);
 const [starsSummary,setStarsSummary]=useState(null);
 const load=async()=>{setError('');try{
  const p=await supabase.from('payroll_periods').select('*').eq('period_month',`${month}-01`).maybeSingle();if(p.error)throw p.error;setPeriod(p.data||null);
  if(p.data){const q=await supabase.from('payroll_entries').select('*,employee:profiles!employee_id(id,full_name,role,station)').eq('period_id',p.data.id).order('employee_id');if(q.error)throw q.error;setEntries(q.data||[])}else setEntries([]);
  const o=await supabase.from('overtime_requests').select('*,employee:profiles!employee_id(id,full_name,role,station)').gte('work_date',`${month}-01`).lt('work_date',nextMonthStart(month)).order('created_at',{ascending:false});if(o.error)throw o.error;setOvertime(o.data||[]);
  if(profile?.id){fetchMyStarsSummary(profile.id,`${month}-01`,nextMonthStart(month)).then(setStarsSummary).catch(()=>{})}
 }catch(e){setError(e.message||'Không thể tải dữ liệu lương và tăng ca');}};
 useEffect(()=>{load()},[month,profile?.id]);
 const requestOvertime=async()=>{if(!reason.trim())return setError('Cần nhập lý do tăng ca.');setBusy(true);setError('');try{const r=await supabase.from('overtime_requests').insert({employee_id:profile.id,work_date:localDate(),planned_minutes:Number(minutes),reason:reason.trim(),related_order_code:orderCode.trim()||null});if(r.error)throw r.error;setReason('');setOrderCode('');await load()}catch(e){setError(e.message)}finally{setBusy(false)}};
 const review=async(row,status)=>{setBusy(true);try{const r=await supabase.from('overtime_requests').update({status,reviewed_by:profile.id,reviewed_at:new Date().toISOString()}).eq('id',row.id);if(r.error)throw r.error;await load()}catch(e){setError(e.message)}finally{setBusy(false)}};
 const createPeriod=async()=>{setBusy(true);try{let r=await supabase.from('payroll_periods').insert({period_month:`${month}-01`,created_by:profile.id}).select().single();if(r.error)throw r.error;const staff=await supabase.from('profiles').select('id').eq('approved',true).neq('active',false);if(staff.error)throw staff.error;if(staff.data?.length){const seed=await supabase.from('payroll_entries').insert(staff.data.map(x=>({period_id:r.data.id,employee_id:x.id,prepared_by:profile.id})));if(seed.error)throw seed.error}
  // Kéo sẵn sao đã Gieo hạt TRƯỚC khi bảng lương này được tạo vào đúng kỳ.
  await supabase.rpc('sumi_dong_bo_sao_thang',{p_period_id:r.data.id}).catch(()=>{});
  await load()}catch(e){setError(e.message)}finally{setBusy(false)}};
 const change=(id,key,value)=>setEntries(x=>x.map(e=>e.id===id?{...e,[key]:Number(value||0)}:e));
 const save=async row=>{setBusy(true);setError('');try{const fields={regular_minutes:row.regular_minutes,overtime_minutes:row.overtime_minutes,completed_tasks:row.completed_tasks,output_quantity:row.output_quantity,base_pay:row.base_pay,overtime_pay:row.overtime_pay,allowance:row.allowance,kpi_bonus:row.kpi_bonus,output_bonus:row.output_bonus,delegation_bonus:row.delegation_bonus,other_bonus:row.other_bonus,advance_amount:row.advance_amount,deduction_amount:row.deduction_amount,note:row.note||null,prepared_by:profile.id,updated_at:new Date().toISOString()};const r=await supabase.from('payroll_entries').update(fields).eq('id',row.id);if(r.error)throw r.error;await load()}catch(e){setError(e.message)}finally{setBusy(false)}};
 const setPeriodStatus=async status=>{setBusy(true);try{const fields={status,updated_at:new Date().toISOString(),...(status==='locked'?{locked_by:profile.id,locked_at:new Date().toISOString()}:{})};const r=await supabase.from('payroll_periods').update(fields).eq('id',period.id);if(r.error)throw r.error;await load()}catch(e){setError(e.message)}finally{setBusy(false)}};
 const myEntry=useMemo(()=>entries.find(x=>x.employee_id===profile?.id),[entries,profile?.id]);
 return <div className="sumi-comp-page"><header><small>NHÂN SỰ SUMI</small><h1>Tăng ca & lương tháng</h1><p>KPI là dữ liệu tham khảo. Kế toán và Giám đốc xác nhận số tiền cuối cùng.</p></header>
  <label className="sumi-month-picker">Xem tháng<input type="month" value={month} onChange={e=>setMonth(e.target.value)}/></label>
  {!manager&&<section className="sumi-overtime-request"><div><span>⏱️</span><h2>Yêu cầu tăng ca</h2></div><label>Thời gian dự kiến<select value={minutes} onChange={e=>setMinutes(e.target.value)}><option value="30">30 phút</option><option value="60">1 giờ</option><option value="90">1 giờ 30 phút</option><option value="120">2 giờ</option><option value="180">3 giờ</option></select></label><label>Lý do<textarea value={reason} onChange={e=>setReason(e.target.value)} placeholder="Ví dụ: hoàn thành đơn giao sáng mai"/></label><div className="sumi-order-code-picker"><OrderCodePicker label="Mã đơn nếu có" value={orderCode} onChange={setOrderCode} placeholder="Ví dụ: SUMI-0822-001"/></div><button disabled={busy} onClick={requestOvertime}>GỬI YÊU CẦU DUYỆT</button></section>}
  <section className="sumi-comp-section"><div className="sumi-comp-title"><h2>{manager?'Yêu cầu tăng ca':'Tăng ca của tôi'}</h2><b>{overtime.filter(x=>x.status==='pending').length} chờ</b></div>{overtime.length===0?<p className="sumi-comp-empty">Chưa có yêu cầu tăng ca trong tháng này.</p>:overtime.map(x=><article className="sumi-overtime-row" key={x.id}><div><strong>{manager?x.employee?.full_name:'Ngày '+new Date(x.work_date).toLocaleDateString('vi-VN')}</strong><small>{x.planned_minutes} phút · {x.reason}{x.related_order_code?` · ${x.related_order_code}`:''}</small></div><em className={x.status}>{statusLabel[x.status]}</em>{manager&&x.status==='pending'&&<div className="actions"><button onClick={()=>review(x,'rejected')}>Từ chối</button><button onClick={()=>review(x,'approved')}>Duyệt</button></div>}</article>)}</section>
  <section className="sumi-comp-section"><div className="sumi-comp-title"><h2>Bảng lương tháng</h2><b>{period?statusLabel[period.status]:'Chưa lập'}</b></div>
   {!period&&manager&&<button className="sumi-create-payroll" disabled={busy} onClick={createPeriod}>＋ LẬP BẢNG LƯƠNG THÁNG NÀY</button>}
   {!period&&!manager&&<p className="sumi-comp-empty">Kế toán chưa chốt bảng lương tháng này.</p>}
   {period&&!manager&&myEntry&&<PayrollSummary entry={myEntry} stars={starsSummary}/>} {period&&!manager&&!myEntry&&<p className="sumi-comp-empty">Bảng lương của bạn chưa được công bố.</p>}
   {manager&&period&&<><div className="sumi-payroll-actions"><button onClick={()=>setPeriodStatus('draft')}>Nháp</button><button onClick={()=>setPeriodStatus('review')}>Chờ duyệt</button><button className="lock" onClick={()=>setPeriodStatus('locked')}>Khóa & công bố</button></div>{entries.map(row=><PayrollEditor key={row.id} row={row} onChange={change} onSave={save} busy={busy}/>)}</>}
  </section>{error&&<div className="sumi-comp-error">{error.includes('does not exist')||error.includes('schema cache')||error.includes('payroll_')||error.includes('overtime_requests')?'Chức năng đang chờ kích hoạt dữ liệu nhân sự trên Supabase.':error}</div>}
 </div>;
}

function PayrollSummary({entry,stars}){return <div className="sumi-pay-slip">
 {stars&&(stars.thuong?.sao>0||stars.phat?.sao>0)&&<div style={{margin:'0 0 10px',padding:'10px 12px',borderRadius:12,background:'#FFF8F0',border:'1px solid #F0DFC8',fontSize:13,lineHeight:1.7}}>
  <div style={{color:'#1e7e4c',fontWeight:800}}>Thưởng: Tổng cộng {stars.thuong.sao}⭐ = {money(stars.thuong.tien)}</div>
  <div style={{color:'#b42318',fontWeight:800}}>Phạt: Tổng cộng {stars.phat.sao}⭐ = {money(stars.phat.tien)}</div>
 </div>}
 <div><small>THỰC NHẬN</small><strong>{money(total(entry))}</strong></div><dl><dt>Lương cơ bản</dt><dd>{money(entry.base_pay)}</dd><dt>Tăng ca</dt><dd>{money(entry.overtime_pay)}</dd><dt>Phụ cấp + thưởng</dt><dd>{money(Number(entry.allowance)+Number(entry.kpi_bonus)+Number(entry.output_bonus)+Number(entry.delegation_bonus)+Number(entry.other_bonus))}</dd><dt>Gieo hạt (Cộng sao)</dt><dd>+{money(entry.star_bonus)}</dd><dt>Tạm ứng + giảm trừ + Trừ sao</dt><dd>-{money(Number(entry.advance_amount)+Number(entry.deduction_amount)+Number(entry.star_penalty))}</dd></dl>{entry.note&&<p>Ghi chú: {entry.note}</p>}</div>}
function PayrollEditor({row,onChange,onSave,busy}){const fields=[['base_pay','Lương cơ bản'],['overtime_pay','Tiền tăng ca'],['allowance','Phụ cấp'],['kpi_bonus','Thưởng KPI'],['output_bonus','Thưởng sản lượng'],['delegation_bonus','Thưởng kiêm nhiệm'],['other_bonus','Thưởng khác'],['advance_amount','Tạm ứng'],['deduction_amount','Giảm trừ']];return <article className="sumi-payroll-editor"><div className="head"><span><strong>{row.employee?.full_name||'Nhân viên'}</strong><small>{row.employee?.station||row.employee?.role}</small></span><b>{money(total(row))}</b></div>{(Number(row.star_bonus)>0||Number(row.star_penalty)>0)&&<div style={{fontSize:12.5,color:'#8C5A3C',margin:'4px 0'}}>🌱 Gieo hạt (tự động, không sửa tay ở đây): +{money(row.star_bonus)} / -{money(row.star_penalty)}</div>}<div className="fields">{fields.map(([key,label])=><label key={key}>{label}<input type="number" inputMode="numeric" value={row[key]||0} onChange={e=>onChange(row.id,key,e.target.value)}/></label>)}</div><button disabled={busy} onClick={()=>onSave(row)}>LƯU NHÂN VIÊN NÀY</button></article>}
