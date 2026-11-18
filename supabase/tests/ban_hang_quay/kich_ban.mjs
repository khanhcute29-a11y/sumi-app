import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const db = new PGlite();
await db.exec(fs.readFileSync(process.argv[2], 'utf8'));
for (const f of process.argv.slice(3)) await db.exec(fs.readFileSync(f, 'utf8'));
const GD='00000000-0000-0000-0000-0000000000a1', QL='00000000-0000-0000-0000-0000000000a2', NV='00000000-0000-0000-0000-0000000000a3', KT='00000000-0000-0000-0000-0000000000a4';
const P1='00000000-0000-0000-0000-0000000000b1', P2='00000000-0000-0000-0000-0000000000b2', V14='00000000-0000-0000-0000-0000000000c1';
await db.exec(`insert into profiles values ('${GD}','Sếp','owner','{}',true,true),('${QL}','Quản lý','admin','{}',true,true),('${NV}','Thu ngân A','sale','{}',true,true),('${KT}','Kế toán','accountant','{}',true,true);
insert into products(id,name,category,price) values ('${P1}','Bánh bò','khac',90000),('${P2}','Bánh kem','banh_kem',0);
insert into product_variants(id,product_id,label,price) values ('${V14}','${P2}','14cm',200000);
insert into finished_goods_stock(product_id,size,branch,qty,store_location) values ('${P1}',null,'bakery',20,'Vĩnh Phú 42'),('${P1}',null,'bakery',50,null);`);
let loi=0, dem=0;
const as=async(uid)=>db.exec(`select set_config('test.uid','${uid}',false)`);
const q=async(sql)=>(await db.query(sql)).rows;
const v=async(sql)=>{const x=Object.values((await q(sql))[0])[0]; return (typeof x==='string'&&/^-?\d+(\.\d+)?$/.test(x))?Number(x):x;};
const ok=async(ten,fn,mong)=>{dem++;try{const r=await fn(); if(mong!==undefined&&JSON.stringify(r)!==JSON.stringify(mong)){loi++;console.log('✗',ten,'được',JSON.stringify(r),'mong',JSON.stringify(mong));} else console.log('✓',ten, mong===undefined?JSON.stringify(r).slice(0,90):'');}catch(e){loi++;console.log('✗',ten,'LỖI',e.message);}};
const chan=async(ten,fn,chua)=>{dem++;try{await fn();loi++;console.log('✗',ten,'KHÔNG bị chặn');}catch(e){if(chua&&!e.message.includes(chua)){loi++;console.log('✗',ten,'chặn sai lý do:',e.message);}else console.log('✓',ten,'→',e.message.slice(0,80));}};
const ton=(store='Vĩnh Phú 42')=>v(`select public.pos__ton(${store?`'${store}'`:'null'},'${P1}',null)`);
const id=()=>crypto.randomUUID();
const ban=(o)=>v(`select public.pos_ban('${JSON.stringify({id:o.id||id(),store:'Vĩnh Phú 42',pay_method:'tien_mat',photo_url:'ban.jpg',lines:[{product_id:P1,name:'Bánh bò',qty:2,list_price:90000,unit_price:90000}],...o}).replace(/'/g,"''")}'::jsonb)`);

await as(NV);
await ok('NV vào ca 100k (có ảnh két)', ()=>v(`select (public.pos_vao_ca('Vĩnh Phú 42',100000,'ket.jpg'))->>'code'`),'PGC000001');
await ok('Vào ca lần 2 trả về ca cũ của mình', ()=>v(`select (public.pos_vao_ca('Vĩnh Phú 42',0,'ket.jpg'))->>'code'`),'PGC000001');
const id1=id();
await ok('Bán 2 bánh tiền mặt', async()=>{const r=await ban({id:id1,received:200000}); return [r.code,r.total,r.change];},['HD000001',180000,20000]);
await ok('Tồn 20 → 18', ton, 18);
await ok('Gửi lại cùng mã (mất mạng) không bán trùng', async()=>{const r=await ban({id:id1}); return [r.code,r.trung];},['HD000001',true]);
await ok('Tồn vẫn 18', ton, 18);
await chan('Sửa giá niêm yết bên máy', ()=>ban({lines:[{product_id:P1,name:'Bánh bò',qty:1,list_price:50000}]}),'đã thay đổi');
await chan('NV giảm 20% không duyệt', ()=>ban({lines:[{product_id:P1,name:'Bánh bò',qty:1,list_price:90000,unit_price:72000}]}),'vượt mức');
await ok('NV giảm 10% (đúng hạn mức)', async()=>(await ban({lines:[{product_id:P1,name:'Bánh bò',qty:1,list_price:90000,unit_price:81000}]})).total,81000);
const ap=await v(`select public.pos_xin_duyet('giam_gia','Vĩnh Phú 42','{"tien":18000,"mo_ta":"giảm 18k"}')`);
await ok('Xin duyệt báo quản lý (thông báo)', ()=>v(`select count(*)::int from notifications where notification_type='pos_duyet'`),2);
await chan('NV tự duyệt', ()=>q(`select public.pos_quyet_duyet('${ap}',true)`),'Chỉ Quản lý');
await as(QL); await ok('QL đồng ý', ()=>v(`select (public.pos_quyet_duyet('${ap}',true))->>'status'`),'dong_y');
await as(NV);
await ok('NV giảm 20% có phiếu duyệt', async()=>(await ban({approval_id:ap,lines:[{product_id:P1,name:'Bánh bò',qty:1,list_price:90000,unit_price:72000}]})).total,72000);
await chan('Dùng lại phiếu duyệt lần 2', ()=>ban({approval_id:ap,lines:[{product_id:P1,name:'Bánh bò',qty:1,list_price:90000,unit_price:72000}]}),'vượt mức');
await chan('Khách lẻ trả thiếu', ()=>ban({received:50000}),'Khách lẻ');
const kh=await v(`select (public.pos_tao_khach('Chị Lan','0901 234 567'))->>'id'`);
await ok('Tạo khách trùng SĐT trả khách cũ', ()=>v(`select (public.pos_tao_khach('Lan','0901234567'))->>'id'`),kh);
const idNo=id();
await ok('Khách có tên trả thiếu → ghi nợ 130k', async()=>(await ban({id:idNo,customer_id:kh,received:50000})).debt,130000);
await ok('Thu nợ 30k', async()=>Number((await v(`select public.pos_thu_no('${id()}','${kh}',30000,'tien_mat','Vĩnh Phú 42')`)).con_no),100000);
await chan('Thu quá số nợ', ()=>q(`select public.pos_thu_no('${id()}','${kh}',500000,'tien_mat','Vĩnh Phú 42')`),'chỉ đang nợ');
await chan('Huỷ không ghi lý do', ()=>q(`select public.pos_huy_hd('${idNo}','  ')`),'lý do');
await ok('Huỷ HĐ nợ trong ca', ()=>v(`select (public.pos_huy_hd('${idNo}','Bấm nhầm'))->>'status'`),'huy');
await ok('Khách thành DƯ 30k (không mất dấu tiền đã trả)', ()=>v(`select public.pos__no_cua('${kh}')::int`),-30000);
const idCk=id();
await ok('Bán chuyển khoản → chờ xác nhận', async()=>(await ban({id:idCk,pay_method:'chuyen_khoan',lines:[{product_id:P1,name:'Bánh bò',qty:1,list_price:90000}]})).transfer_status,'cho_xac_nhan');
await chan('NV tự xác nhận tiền về', ()=>q(`select public.pos_xac_nhan_ck('${idCk}',true)`),'Chỉ Quản lý');
await as(KT); await ok('Kế toán xác nhận tiền về', ()=>v(`select (public.pos_xac_nhan_ck('${idCk}',true))->>'transfer_status'`),'da_ve');
await as(NV);
await ok('Tồn trước phiếu kho (20−2−1−1−2+2−1)', ton, 15);
await chan('Xuất huỷ thiếu ảnh', ()=>q(`select public.pos_luu_phieu('{"id":"${id()}","type":"xuat_huy","store":"Vĩnh Phú 42","reason":"hết date","lines":[{"product_id":"${P1}","name":"Bánh bò","qty":3}]}')`),'ảnh');
await chan('Xuất huỷ thiếu lý do', ()=>q(`select public.pos_luu_phieu('{"id":"${id()}","type":"xuat_huy","store":"Vĩnh Phú 42","photo_url":"x.jpg","lines":[{"product_id":"${P1}","name":"Bánh bò","qty":3}]}')`),'lý do');
await ok('Xuất huỷ 3 có ảnh', ()=>v(`select (public.pos_luu_phieu('{"id":"${id()}","type":"xuat_huy","store":"Vĩnh Phú 42","reason":"hết date","photo_url":"x.jpg","lines":[{"product_id":"${P1}","name":"Bánh bò","qty":3}]}'))->>'status'`),'xong');
await ok('Tồn 15 → 12', ton, 12);
const kk=id();
await ok('Kiểm kho lưu tạm không đụng tồn', async()=>{await q(`select public.pos_luu_phieu('{"id":"${kk}","type":"kiem_kho","store":"Vĩnh Phú 42","status":"tam","lines":[{"product_id":"${P1}","name":"Bánh bò","qty":9}]}')`); return ton();}, 12);
await ok('Kiểm kho chốt thực tế 9', async()=>{await q(`select public.pos_luu_phieu('{"id":"${kk}","type":"kiem_kho","store":"Vĩnh Phú 42","lines":[{"product_id":"${P1}","name":"Bánh bò","qty":9}]}')`); return ton();}, 9);
await ok('Huỷ phiếu kiểm → tồn về 12', async()=>{await q(`select public.pos_huy_phieu('${kk}','kiểm sai')`); return ton();}, 12);
const bg=id();
await ok('Bếp giao 5 (chưa cộng tồn quầy)', async()=>{await q(`select public.pos_luu_phieu('{"id":"${bg}","type":"bep_giao","store":"Vĩnh Phú 42","lines":[{"product_id":"${P1}","name":"Bánh bò","qty":5}]}')`); return ton();}, 12);
await ok('Quầy nhận thực tế 4', async()=>{await q(`select public.pos_nhan_hang('${bg}','{"${P1}:":4}')`); return [await ton(), await ton(null)];}, [16,45]);
await ok('Lệch giao/nhận báo sếp', ()=>v(`select count(*)::int from notifications where event_key like 'pos-lech-giao%'`),1);
await ok('Đóng ca: đếm 450k', async()=>{const s=await v(`select public.pos_ket_ca((select id from pos_shifts where status='open'),450000,null,'ket.jpg','[{"product_id":"${P1}","name":"Bánh bò","dem":16}]')`); return [Number(s.expected_cash),Number(s.diff)];},[463000, -13000]);
await ok('Đóng ca báo sếp', ()=>v(`select title from notifications where event_key like 'pos-dong-ca%'`));
await chan('NV huỷ HĐ ca đã đóng', ()=>q(`select public.pos_huy_hd('${id1}','khách đổi ý')`),'ca đã đóng');
await as(GD);
await ok('GĐ huỷ HĐ ca cũ được + báo sếp', async()=>{await q(`select public.pos_huy_hd('${id1}','khách đổi ý')`); return [await ton(), await v(`select count(*)::int from notifications where event_key like 'pos-huy-hd%'`)];},[18,1]);
await q(`select public.pos_luu_gia_von('${P1}',null,30000)`);
await ok('Báo cáo GĐ có giá vốn', async()=>{const b=await v(`select public.pos_bao_cao('Vĩnh Phú 42',now()-interval '1 day',now()+interval '1 day')`); return [b.so_hd,b.so_huy,b.gia_von,b.huy_gia_von,b.tien_mat];},[3,2,90000,90000,153000]);
await as(QL);
await ok('Báo cáo QL không có giá vốn', async()=>(await v(`select public.pos_bao_cao('Vĩnh Phú 42',now()-interval '1 day',now()+interval '1 day')`)).gia_von,null);
await as(NV);
await chan('NV xem báo cáo', ()=>q(`select public.pos_bao_cao('Vĩnh Phú 42',now()-interval '1 day',now())`),'Chỉ Quản lý');
await chan('NV đổi thiết lập', ()=>q(`select public.pos_luu_thiet_lap('Vĩnh Phú 42','{"staff_discount_pct":90}')`),'Chỉ Giám đốc');
// Biến thể size + điểm
await as(GD); await q(`select public.pos_luu_thiet_lap('Vĩnh Phú 42','{"points_enabled":true}')`);
await as(NV); await q(`select public.pos_vao_ca('Vĩnh Phú 42',0,'ket.jpg')`);
await as(GD);
await ok('GĐ huỷ HĐ tiền mặt ca cũ khi ca mới đang mở → két ca mới trừ tiền trả khách', async()=>{const h=await v(`select id from pos_invoices where status='xong' and pay_method='tien_mat' and total=81000`); await q(`select public.pos_huy_hd('${h}','khách trả lại')`); const sl=await v(`select public.pos__so_lieu_ca((select id from pos_shifts where status='open'))`); return [Number(sl.hoan_tien_huy), Number(sl.tien_mat_trong_ca)];},[81000,-81000]);
await as(NV);
await ok('Bán bánh kem 14cm (giá biến thể) + tích điểm', async()=>{const r=await ban({customer_id:kh,lines:[{product_id:P2,variant_id:V14,size:'14cm',name:'Bánh kem',qty:1,list_price:200000}]}); return [r.total,r.points_earned, await v(`select public.pos__ton('Vĩnh Phú 42','${P2}','14cm')::int`)];},[200000,20,-1]);
await ok('Xem số liệu ca đang mở', async()=>{const c=await v(`select public.pos_xem_ca((select id from pos_shifts where status='open'))`); return typeof c.so_lieu.tien_mat_trong_ca;},'number');
await db.exec(`insert into orders(id,order_code,customer_id,required_at,status_v2,total,deposit) values ('00000000-0000-0000-0000-0000000000d1','SUMI-20261114-1','${kh}',now()+interval '1 day','in_production',500000,200000)`);
await ok('Thu tiền còn lại khi khách lấy bánh', async()=>{await q(`select public.pos_thu_don('${id()}','00000000-0000-0000-0000-0000000000d1','thu_con_lai',300000,'tien_mat','Vĩnh Phú 42')`); const r=await v(`select public.pos_tim_don('0901234')`); return [r.length, Number(r[0].da_thu_quay)];},[1,300000]);
await ok('Tìm đơn theo mã', async()=>(await v(`select public.pos_tim_don('sumi-2026')`)).length,1);
// Phân quyền đọc thật (RLS)
await db.exec(`grant usage on schema public to authenticated; grant select on profiles to authenticated; grant execute on function auth.uid() to authenticated; grant usage on schema auth to authenticated;`);
await db.exec(`set role authenticated`);
await ok('NV đọc được hoá đơn', ()=>v(`select count(*)::int from pos_invoices`),6);
await ok('NV KHÔNG thấy giá vốn', ()=>v(`select count(*)::int from pos_product_costs`),0);
await ok('NV KHÔNG thấy nhật ký', ()=>v(`select count(*)::int from pos_audit_log`),0);
await chan('NV ghi thẳng bảng hoá đơn', ()=>q(`update pos_invoices set total=0`),'permission');
await chan('NV xoá sạch bảng (truncate)', ()=>q(`truncate pos_invoices cascade`),'permission');
await chan('NV gọi hàm nội bộ cộng tồn', ()=>q(`select public.pos__ton_cong('Vĩnh Phú 42','${P1}',null,'x',100,'ban','x')`),'permission');
await db.exec(`reset role`);
await chan('NV gọi tổng kết cuối ngày', async()=>{await db.exec(`set role authenticated`); try{await q(`select public.pos_bao_cuoi_ngay()`);}finally{await db.exec(`reset role`);}},'permission');
await ok('Tổng kết cuối ngày: báo sếp 1 cửa hàng', ()=>v(`select public.pos_bao_cuoi_ngay()`),1);
await ok('Tin tổng kết tới đúng sếp, có cảnh báo', ()=>v(`select severity||'|'||(title like '📊 Vĩnh Phú 42 hôm nay:%')::text from notifications where event_key like 'pos-cuoi-ngay:%' and recipient_profile_id='${GD}'`),'warning|true');
await ok('Chạy lại không gửi trùng', async()=>{await q(`select public.pos_bao_cuoi_ngay()`); return v(`select count(*)::int from notifications where event_key like 'pos-cuoi-ngay:%'`);},1);

// ── Vá 202611141010: bán lúc mất mạng luôn được ghi + chặn thu trùng đơn đặt ──
if (process.argv.length > 4) {
  await as(NV);
  const caMo = await v(`select (public.pos_vao_ca('Vĩnh Phú 42',0,'ket.jpg'))->>'id'`);
  const soTb = () => v(`select count(*)::int from notifications where event_key like 'pos-mat-mang:%'`);
  const tb0 = await soTb();
  const o1 = id();
  await ok('Mất mạng: giá đổi lúc chờ gửi → vẫn ghi theo giá lúc bán', async()=>{const r=await ban({id:o1,offline:true,shift_id:caMo,client_created_at:new Date(Date.now()-3600e3).toISOString(),lines:[{product_id:P1,name:'Bánh bò',qty:1,list_price:85000,unit_price:85000}]}); return [r.total, r.canh_bao[0].loai];},[85000,'gia_lech']);
  await ok('… hoá đơn có cờ cảnh báo + giờ bán = giờ trên máy', ()=>v(`select (canh_bao->0->>'gia_dung')||'|'||(abs(extract(epoch from created_at - (now()-interval '1 hour')))<5)::text from pos_invoices where id='${o1}'`),'90000|true');
  await ok('… Giám đốc được báo ngay', async()=>(await soTb())-tb0, 1);
  await ok('Mất mạng: giờ máy ở tương lai bị kéo về hiện tại', async()=>{const x=id(); await ban({id:x,offline:true,client_created_at:new Date(Date.now()+86400e3).toISOString()}); return v(`select (created_at<=now())::text from pos_invoices where id='${x}'`);},'true');
  await ok('Mất mạng: giờ máy cũ 10 ngày bị giới hạn 3 ngày', async()=>{const x=id(); await ban({id:x,offline:true,client_created_at:new Date(Date.now()-10*86400e3).toISOString()}); return v(`select (created_at>now()-interval '3 days 1 minute')::text from pos_invoices where id='${x}'`);},'true');
  await ok('Mất mạng đúng giá: không gắn cờ, không báo', async()=>{const t=await soTb(); const x=id(); const r=await ban({id:x,offline:true,shift_id:caMo}); return [r.canh_bao.length, (await soTb())-t];},[0,0]);
  await chan('CÓ mạng mà sửa giá vẫn bị chặn', ()=>ban({lines:[{product_id:P1,name:'Bánh bò',qty:1,list_price:85000}]}),'đã thay đổi');
  await chan('Mất mạng nhưng khách lẻ ghi nợ vẫn bị chặn', ()=>ban({offline:true,received:1000}),'Khách lẻ');
  const caCu = await v(`select coalesce((select id::text from pos_shifts where status<>'open' limit 1),'')`);
  if (caCu) await ok('Mất mạng: ca lúc bán đã đóng → ghi ca đang mở + gắn cờ', async()=>(await ban({offline:true,shift_id:caCu})).canh_bao.map((x)=>x.loai),['khac_ca']);
  await ok('Mất mạng: NV giảm 20% (không xin được duyệt) → vẫn ghi, gắn cờ', async()=>(await ban({offline:true,lines:[{product_id:P1,name:'Bánh bò',qty:1,list_price:90000,unit_price:72000}]})).canh_bao.map((x)=>x.loai),['giam_qua_muc']);
  // Đơn đặt
  await chan('Thu nốt đơn đã thu đủ → chặn (2 máy bấm trùng)', ()=>q(`select public.pos_thu_don('${id()}','00000000-0000-0000-0000-0000000000d1','thu_con_lai',300000,'tien_mat','Vĩnh Phú 42')`),'đã thu đủ');
  await db.exec(`insert into orders(id,order_code,customer_id,required_at,status_v2,total,deposit) values ('00000000-0000-0000-0000-0000000000d2','SUMI-20261114-2',null,now()+interval '1 day','in_production',400000,100000)`);
  await chan('Ghi cọc lớn hơn tiền cọc trên đơn', ()=>q(`select public.pos_thu_don('${id()}','00000000-0000-0000-0000-0000000000d2','coc',150000,'tien_mat','Vĩnh Phú 42')`),'tiền cọc');
  await ok('Ghi cọc đúng 100k', async()=>(await v(`select public.pos_thu_don('${id()}','00000000-0000-0000-0000-0000000000d2','coc',100000,'tien_mat','Vĩnh Phú 42')`)).order_code,'SUMI-20261114-2');
  await chan('Ghi cọc lần 2 (bấm trùng)', ()=>q(`select public.pos_thu_don('${id()}','00000000-0000-0000-0000-0000000000d2','coc',100000,'tien_mat','Vĩnh Phú 42')`),'tiền cọc');
  await chan('Thu nốt quá số còn lại (300k)', ()=>q(`select public.pos_thu_don('${id()}','00000000-0000-0000-0000-0000000000d2','thu_con_lai',350000,'tien_mat','Vĩnh Phú 42')`),'còn phải thu');
  await ok('Thu nốt đúng 300k', async()=>(await v(`select public.pos_thu_don('${id()}','00000000-0000-0000-0000-0000000000d2','thu_con_lai',300000,'chuyen_khoan','Vĩnh Phú 42')`)).order_code,'SUMI-20261114-2');
  await chan('Thu 0đ', ()=>q(`select public.pos_thu_don('${id()}','00000000-0000-0000-0000-0000000000d2','thu_con_lai',0,'tien_mat','Vĩnh Phú 42')`),'Nhập số tiền');
}

// ── 202611141020: khách lấy bánh đặt tại quầy → đơn Hoàn thành ──
if (process.argv.length > 5) {
  await as(NV);
  const D2='00000000-0000-0000-0000-0000000000d2', D3='00000000-0000-0000-0000-0000000000d3';
  // d2: tổng 400k, cọc 100k, đã thu nốt 300k ở trên, bếp đang làm
  await chan('Bếp chưa xong → chưa đóng đơn được', ()=>q(`select public.pos_giao_don('${D2}','Vĩnh Phú 42')`),'Bếp chưa báo xong');
  await db.exec(`update orders set status_v2='ready_for_fulfillment' where id='${D2}'`);
  await ok('Bếp xong + thu đủ → đơn Hoàn thành', async()=>{const r=await v(`select public.pos_giao_don('${D2}','Vĩnh Phú 42')`); return [r.already_completed, await v(`select status_v2||'|'||status||'|'||(completed_at is not null)::text from orders where id='${D2}'`)];},[false,'completed|hoan_thanh|true']);
  await ok('Bấm Giao bánh lần 2 không ghi trùng', async()=>(await v(`select public.pos_giao_don('${D2}','Vĩnh Phú 42')`)).already_completed,true);
  await ok('Có dòng nhật ký giao đơn (1 dòng)', ()=>v(`select count(*)::int from pos_audit_log where action='giao_don_dat'`),1);
  await db.exec(`insert into orders(id,order_code,status_v2,total,deposit) values ('${D3}','SUMI-20261114-3','ready_for_fulfillment',500000,100000)`);
  await chan('Chưa thu đủ → chặn giao', ()=>q(`select public.pos_giao_don('${D3}','Vĩnh Phú 42')`),'còn phải thu');
  await db.exec(`update orders set status_v2='in_delivery' where id='${D3}'`);
  await chan('Đơn đang giao shipper → chặn', ()=>q(`select public.pos_giao_don('${D3}','Vĩnh Phú 42')`),'shipper');
  await chan('Chi nhánh lạ', ()=>q(`select public.pos_giao_don('${D3}','Kho X')`),'Chi nhánh');
  await chan('Người chưa duyệt', async()=>{await as('00000000-0000-0000-0000-0000000000ff'); try { await q(`select public.pos_giao_don('${D3}','Vĩnh Phú 42')`); } finally { await as(NV); }},'chưa được duyệt');
}
// ── 202611151000: HSD theo lô · chặn bán bánh quá hạn · xuất huỷ trừ lô hết hạn trước ──
if (process.argv.length > 6) {
  const P3='00000000-0000-0000-0000-0000000000b3', S='Vĩnh Phú 42';
  await db.exec(`insert into products(id,name,category,price) values ('${P3}','Bông lan','khac',50000)`);
  const tonP3=()=>v(`select public.pos__ton('${S}','${P3}',null)::int`);
  const lo=async()=>(await q(`select qty::int q from pos_stock_lots where product_id='${P3}' and qty>0 order by id`)).map((r)=>r.q);
  const banP3=(sl,o={})=>ban({lines:[{product_id:P3,name:'Bông lan',qty:sl,list_price:50000,unit_price:50000}],...o});
  const nhanP3=async(sl)=>{const d=id(); await q(`select public.pos_luu_phieu('{"id":"${d}","type":"bep_giao","store":"${S}","lines":[{"product_id":"${P3}","name":"Bông lan","qty":${sl}}]}')`); await q(`select public.pos_nhan_hang('${d}','{"${P3}:":${sl}}')`); return d;};
  await as(NV);
  await chan('NV tự cài hạn dùng', ()=>q(`select public.pos_luu_han_dung('${P3}',2)`),'Chỉ Quản lý');
  await as(QL);
  await ok('QL cài Bông lan bán được 2 ngày', async()=>{await q(`select public.pos_luu_han_dung('${P3}',2)`); return v(`select days from pos_shelf_life where product_id='${P3}'`);},2);
  await as(NV); await q(`select public.pos_vao_ca('${S}',0,'ket.jpg')`);
  await ok('Nhận 10 → 1 lô, HSD = 0h ngày nhận + 2', async()=>{await nhanP3(10); return [await lo(), await v(`select ((expiry_at at time zone 'Asia/Ho_Chi_Minh')::date - (now() at time zone 'Asia/Ho_Chi_Minh')::date) from pos_stock_lots where product_id='${P3}'`)];},[[10],2]);
  await db.exec(`update pos_stock_lots set expiry_at=now()-interval '1 hour' where product_id='${P3}'`);
  await nhanP3(5);
  await ok('Lô 10 quá hạn + lô 5 mới', lo, [10,5]);
  await ok('Bán 3 → trừ lô CÒN HẠN (5→2), lô quá hạn giữ nguyên', async()=>{await banP3(3); return lo();},[10,2]);
  await chan('Bán 3 khi chỉ còn 2 cái còn hạn → chặn', ()=>banP3(3),'QUÁ HẠN');
  await ok('Bán 2 (đủ bánh còn hạn)', async()=>{await banP3(2); return [await lo(), await tonP3()];},[[10],10]);
  await chan('Chỉ còn bánh quá hạn → chặn bán', ()=>banP3(1),'QUÁ HẠN');
  const idOff=id();
  await ok('Mất mạng vẫn ghi HĐ, gắn cờ ban_qua_han + báo GĐ', async()=>{await banP3(1,{id:idOff,offline:true,client_created_at:new Date().toISOString()});
    return [await v(`select canh_bao->0->>'loai' from pos_invoices where id='${idOff}'`), await v(`select count(*)::int from notifications where event_key like 'pos-ban-qua-han:${idOff}%'`), await lo()];},['ban_qua_han',1,[9]]);
  await ok('Huỷ HĐ đó → bánh trả về đúng lô cũ', async()=>{await q(`select public.pos_huy_hd('${idOff}','test')`); return lo();},[10]);
  await ok('23:00 báo GĐ còn 10 bánh hết hạn', async()=>[await v(`select public.pos_bao_qua_han()`), await v(`select title from notifications where event_key like 'pos-qua-han:%'`)],[1,'🗑️ Vĩnh Phú 42: 10 bánh hết hạn chưa xuất huỷ']);
  const xh=id();
  await ok('Xuất huỷ 10 → hết lô quá hạn', async()=>{await q(`select public.pos_luu_phieu('{"id":"${xh}","type":"xuat_huy","store":"${S}","reason":"hết date","photo_url":"x.jpg","lines":[{"product_id":"${P3}","name":"Bông lan","qty":10}]}')`); return [await lo(), await tonP3()];},[[],0]);
  await ok('Hết bánh quá hạn → bán lại bình thường', async()=>{await nhanP3(4); await banP3(1); return lo();},[3]);
  await as(GD);
  await ok('Huỷ phiếu xuất huỷ → 10 bánh về đúng lô quá hạn', async()=>{await q(`select public.pos_huy_phieu('${xh}','huỷ nhầm')`); return [await lo(), await v(`select count(*)::int from pos_stock_lots where product_id='${P3}' and qty>0 and expiry_at<=now()`)];},[[10,3],1]);
  await as(NV);
  await ok('Tồn bị sửa ở màn khác (còn 2) → lô cắt cho khớp', async()=>{await db.exec(`update finished_goods_stock set qty=2 where product_id='${P3}' and store_location='${S}'`); await nhanP3(1); return [await tonP3(), (await lo()).reduce((a,b)=>a+b,0)];},[3,3]);
  await ok('Món chưa cài hạn dùng → lô không có HSD', async()=>{const d=id(); await q(`select public.pos_luu_phieu('{"id":"${d}","type":"bep_giao","store":"${S}","lines":[{"product_id":"${P1}","name":"Bánh bò","qty":2}]}')`); await q(`select public.pos_nhan_hang('${d}','{"${P1}:":2}')`); return v(`select bool_or(expiry_at is not null) from pos_stock_lots where product_id='${P1}'`);},false);
  await ok('Huỷ phiếu nhận hàng → bớt đúng lô phiếu đó', async()=>{await as(GD); const d=await nhanP3(6); const truoc=await lo(); await q(`select public.pos_huy_phieu('${d}','nhận nhầm')`); await as(NV); return [truoc.at(-1), (await lo()).length===truoc.length-1];},[6,true]);
}
// ── 202611151010: doanh số theo nhân viên · ảnh bắt buộc · vào/kết ca có ảnh két + đếm bánh ──
if (process.argv.length > 7) {
  const NV2='00000000-0000-0000-0000-0000000000a5', S='Vĩnh Phú 42', Q='Quốc Lộ 13';
  await db.exec(`insert into profiles(id,full_name,role,extra_roles,approved,active,phone) values ('${NV2}','Thu ngân B','cashier','{}',true,true,'0912 345 678');
    update profiles set phone='+84901000111' where id='${NV}';`);
  const caDangMo=(st=S)=>v(`select coalesce((select id::text from pos_shifts where status='open' and store_location='${st}'),'')`);
  const demBanh=(lech=0)=>v(`select coalesce(jsonb_agg(jsonb_build_object('product_id',product_id,'size',size,'name','Món','dem',qty + case when rn=1 then ${lech} else 0 end)),'[]')::text from (select *, row_number() over (order by product_id, size) rn from finished_goods_stock where store_location='${S}' and is_semi_finished=false and qty>0) x`);
  const ketCa=async(ca,anh='ket.jpg',banh=null)=>v(`select public.pos_ket_ca('${ca}',0,null,${anh?`'${anh}'`:'null'},'${banh ?? await demBanh()}'::jsonb)`);
  const banB=(o={})=>ban({lines:[{product_id:P1,name:'Bánh bò',qty:2,list_price:90000,unit_price:90000}],...o});
  await chan('Hàm mở ca cũ ngừng dùng', ()=>q(`select public.pos_mo_ca('${S}',0)`),'bản mới');
  const ca1=await caDangMo();
  await as(NV);
  await chan('Kết ca thiếu ảnh két', ()=>ketCa(ca1,null),'ảnh két');
  await chan('Kết ca chưa đếm bánh', ()=>ketCa(ca1,'ket.jpg','[]'),'Đếm nhanh');
  await as(NV2);
  await chan('Người khác kết ca của mình', ()=>ketCa(ca1),'chỉ người đó');
  await chan('Vào ca khi ca người khác đang mở', ()=>q(`select public.pos_vao_ca('${S}',0,'ket.jpg')`),'phải kết ca');
  await chan('Bán trong ca của người khác', ()=>banB(),'Ca đang mở là của');
  await as(NV);
  await ok('Kết ca: lệch 1 món bánh → báo GĐ', async()=>{const r=await ketCa(ca1,'ket.jpg',await demBanh(-1)); return [r.closing_photo, r.summary.so_banh_lech, await v(`select (body like '%Bánh lệch: Món (máy%')::text from notifications where event_key like 'pos-dong-ca:${ca1}%' limit 1`)];},['ket.jpg',1,'true']);
  await as(NV2);
  await chan('Bán khi chưa vào ca', ()=>banB(),'chưa vào ca');
  await chan('Vào ca thiếu ảnh két', ()=>q(`select public.pos_vao_ca('${S}',200000,'')`),'ảnh két');
  await ok('NV B vào ca 200k', ()=>v(`select (public.pos_vao_ca('${S}',200000,'ket2.jpg'))->>'opening_photo'`),'ket2.jpg');
  const ca2=await caDangMo();
  // Chấm công (cửa hàng Quốc Lộ 13)
  await as(NV); await chan('NV tự bật chấm công', ()=>q(`select public.pos_bat_cham_cong('${Q}',true)`),'Chỉ Giám đốc');
  await as(GD); await q(`select public.pos_bat_cham_cong('${Q}',true)`);
  await as(NV);
  await chan('Bật chấm công: chưa chấm công → không vào ca', ()=>q(`select public.pos_vao_ca('${Q}',0,'k.jpg')`),'chưa chấm công');
  await db.exec(`insert into shift_logs(staff_id,work_date,branch,type,checkin_time) values ('${NV}',(now() at time zone 'Asia/Ho_Chi_Minh')::date,'Vĩnh Phú 42','checkin',now()-interval '2 hours')`);
  await chan('Chấm công ở cửa hàng khác → không vào ca', ()=>q(`select public.pos_vao_ca('${Q}',0,'k.jpg')`),'chấm công ở Vĩnh Phú 42');
  await db.exec(`insert into shift_logs(staff_id,work_date,branch,type,checkin_time) values ('${NV}',(now() at time zone 'Asia/Ho_Chi_Minh')::date,'Vĩnh Phú 42','checkout',now()-interval '1 hour'),('${NV}',(now() at time zone 'Asia/Ho_Chi_Minh')::date,'Quốc lộ 13','checkin',now()-interval '10 minutes')`);
  await ok('Chấm công đúng "Quốc lộ 13" (chữ thường) → vào ca được', ()=>v(`select (public.pos_vao_ca('${Q}',0,'k.jpg'))->>'store_location'`),Q);
  await ok('Kết ca cửa hàng không có bánh: không cần đếm', async()=>(await v(`select public.pos_ket_ca('${await caDangMo(Q)}',0,null,'k.jpg','[]'::jsonb)`)).status,'closed');
  // Bán của NV B
  await as(NV2);
  await chan('Bán không có ảnh', ()=>banB({photo_url:''}),'ảnh bán hàng');
  const h1=id(), h2=id(), h3=id(), h4=id(), h5=id(), h6=id();
  await ok('Bán tiền mặt 180k (ảnh A)', async()=>(await banB({id:h1,photo_hash:'anhA'})).total,180000);
  await chan('Dùng lại ảnh A cho hoá đơn khác', ()=>banB({photo_hash:'anhA'}),'đã dùng cho hoá đơn');
  await ok('Mất mạng dùng lại ảnh A → vẫn ghi, gắn cờ anh_trung', async()=>(await banB({id:h2,photo_hash:'anhA',offline:true})).canh_bao.map((x)=>x.loai),['anh_trung']);
  await ok('Chuyển khoản 90k (chờ xác nhận)', async()=>(await banB({id:h3,pay_method:'chuyen_khoan',lines:[{product_id:P1,name:'Bánh bò',qty:1,list_price:90000,unit_price:90000}]})).transfer_status,'cho_xac_nhan');
  const khNo=await v(`select (public.pos_tao_khach('Anh Nợ','0933 000 111'))->>'id'`);
  await ok('Ghi nợ 150k (trả 30k)', async()=>(await banB({id:h4,customer_id:khNo,received:30000})).debt,150000);
  const khNv=await v(`select (public.pos_tao_khach('Người nhà','0901 000 111'))->>'id'`);
  await ok('Bán cho khách trùng SĐT nhân viên', async()=>(await banB({id:h5,customer_id:khNv})).total,180000);
  await ok('Hoá đơn có VAT 8%: 97.200', async()=>(await banB({id:h6,vat:true,lines:[{product_id:P1,name:'Bánh bò',qty:1,list_price:90000,unit_price:90000}]})).total,97200);
  const tu=new Date(Date.now()-86400e3).toISOString(), den=new Date(Date.now()+86400e3).toISOString();
  const dsB=async()=>{await as(GD); const r=await v(`select public.pos_doanh_so_nv('${tu}','${den}','${S}')`); await as(NV2); return r.nhan_vien.find((x)=>x.staff_id===NV2);};
  await ok('Doanh số B: tiền mặt + mất mạng + nợ đã trả + VAT bỏ ra; CK chờ, nợ chưa trả, mua NV tách riêng', async()=>{const b=await dsB(); return [b.so_hd,b.ban_tinh,b.ck_cho,b.no_chua_tra,b.bi_loai,b.so_hd_canh_bao];},[6,180000+180000+30000+90000,90000,150000,180000,1]);
  await as(KT); await q(`select public.pos_xac_nhan_ck('${h3}',true)`); await as(NV2);
  await q(`select public.pos_thu_no('${id()}','${khNo}',100000,'tien_mat','${S}')`);
  await ok('CK đã về + khách trả nợ 100k → tính thêm 190k', async()=>{const b=await dsB(); return [b.ban_tinh,b.ck_cho,b.no_chua_tra];},[670000,0,50000]);
  await as(NV2); await chan('NV tự loại doanh số', ()=>q(`select public.pos_loai_doanh_so('${h1}',true,'x')`),'Chỉ Quản lý');
  await as(GD); await chan('Loại không ghi lý do', ()=>q(`select public.pos_loai_doanh_so('${h1}',true,'')`),'lý do');
  await q(`select public.pos_loai_doanh_so('${h1}',true,'Ảnh không phải bánh bán')`);
  await ok('GĐ loại 1 hoá đơn → trừ khỏi doanh số', async()=>{const b=await dsB(); return [b.ban_tinh,b.bi_loai,b.so_hd_loai];},[490000,360000,2]);
  await as(GD); await q(`select public.pos_loai_doanh_so('${h1}',false)`);
  await ok('Bỏ loại → tính lại', async()=>(await dsB()).ban_tinh,670000);
  // Bánh đặt nhận tại quầy
  const D9='00000000-0000-0000-0000-0000000000d9';
  await db.exec(`insert into orders(id,order_code,status_v2,total,deposit,created_by) values ('${D9}','SUMI-QUAY-9','in_production',300000,100000,'${NV2}')`);
  await as(NV); await chan('Ghi đơn quầy của người khác', ()=>q(`select public.pos_ghi_don_quay('${D9}','${S}')`),'chính bạn');
  await as(NV2); await ok('NV B ghi đơn đặt tại quầy', async()=>(await v(`select public.pos_ghi_don_quay('${D9}','${S}')`)).order_code,'SUMI-QUAY-9');
  await ok('Đơn chưa hoàn thành → chưa tính', async()=>(await dsB()).dat_quay,0);
  await db.exec(`update orders set status_v2='completed', completed_at=now() where id='${D9}'`);
  await ok('Đơn hoàn thành → tính toàn bộ 300k', async()=>{const b=await dsB(); return [b.dat_quay,b.so_don_dat,b.tong];},[300000,1,970000]);
  // Theo ca + hoá đơn kèm ảnh
  await ok('Theo ca: ca của B có 6 hoá đơn, doanh số 670k', async()=>{await as(GD); const r=await v(`select public.pos_doanh_so_nv('${tu}','${den}','${S}')`); await as(NV2); const c=r.ca.find((x)=>x.id===ca2); return [c.ten,c.so_hd,c.ban_tinh,c.anh_vao];},['Thu ngân B',6,670000,'ket2.jpg']);
  await ok('Hoá đơn của ca kèm ảnh + phần tính', async()=>{await as(GD); const r=await v(`select public.pos_hd_ca('${ca2}')`); await as(NV2); return [r.length, r.every((x)=>x.photo_url), r.find((x)=>x.invoice_id===h5).mua_nv];},[6,true,true]);
  await as(NV2); await chan('NV xem doanh số nhân viên', ()=>q(`select public.pos_doanh_so_nv('${tu}','${den}',null)`),'Chỉ Giám đốc');
  await as(KT); await ok('Kế toán xem được', async()=>Array.isArray((await v(`select public.pos_doanh_so_nv('${tu}','${den}',null)`)).nhan_vien),true);
  // Xếp hạng
  await as(NV);
  await ok('Xếp hạng: NV thấy hạng + tên, KHÔNG thấy tiền người khác', async()=>{const r=await v(`select public.pos_xep_hang_thang()`); const b=r.bang.find((x)=>x.ten==='Thu ngân B'); return [b.hang, 'tong' in b, r.bang.some((x)=>x.ten==='Sếp'), r.bang.find((x)=>x.la_toi)?.ten];},[2,false,false,'Thu ngân A']);
  await as(NV2); await ok('B thấy hạng + tiền của mình', async()=>{const r=await v(`select public.pos_xep_hang_thang()`); return [r.cua_toi.hang, Number(r.cua_toi.tong)];},[2,970000]);
  // Kết ca B: tổng doanh số ca nằm trong tin báo GĐ
  await ok('Kết ca B: tin báo GĐ có doanh số ca', async()=>{const r=await ketCa(ca2); return [Number(r.summary.doanh_so_tinh), await v(`select (body like '%doanh số tính 670.000đ%' or body like '%doanh số tính 670,000đ%')::text from notifications where event_key like 'pos-dong-ca:${ca2}%' limit 1`)];},[670000,'true']);
  await chan('NV gọi hàm nội bộ doanh số', async()=>{await db.exec(`set role authenticated`); try{await q(`select * from public.pos__ds_hd(now()-interval '1 day',now())`);}finally{await db.exec(`reset role`);}},'permission');
}
// ── 202611161010: thanh toán Ví + phiếu nhập hàng mã PN (giống KiotViet) ──
if (process.argv.some((x)=>x.includes('vi_va_ma_pn'))) {
  await as(NV);
  const S='Vĩnh Phú 42';
  const ca=await v(`select (public.pos_vao_ca('${S}',0,'ket.jpg'))->>'id'`);
  const tmTruoc=Number((await v(`select public.pos__so_lieu_ca('${ca}')`)).tien_mat_trong_ca);
  await ok('Bán bằng Ví: lưu pay_method vi, không chờ xác nhận', async()=>{const r=await ban({pay_method:'vi',photo_url:'vi-'+id()+'.jpg'}); return [await v(`select pay_method from pos_invoices where code='${r.code}'`), r.transfer_status];},['vi','khong']);
  await ok('Ví: kết ca tách riêng, tiền mặt trong két không đổi', async()=>{const sl=await v(`select public.pos__so_lieu_ca('${ca}')`); return [Number(sl.ban.vi)>0, Number(sl.tien_mat_trong_ca)===tmTruoc];},[true,true]);
  await chan('Phương thức lạ vẫn bị chặn', ()=>ban({pay_method:'momo',photo_url:'x-'+id()+'.jpg'}),'không hợp lệ');
  await ok('Phiếu nhập hàng (bếp giao) mã PN…', ()=>v(`select left((public.pos_luu_phieu('{"id":"${id()}","type":"bep_giao","store":"${S}","lines":[{"product_id":"${P1}","name":"Bánh bò","qty":1}]}'))->>'code',2)`),'PN');
}
// ── 202611161020: tiền đầu ca theo ca trước + Tổng quan của tôi ──
if (process.argv.some((x)=>x.includes('tong_quan_nv_va_dau_ca'))) {
  const S='Vĩnh Phú 42', NV2='00000000-0000-0000-0000-0000000000a5';
  const caDangMo=()=>v(`select coalesce((select id::text from pos_shifts where status='open' and store_location='${S}'),'')`);
  const demBanh=()=>v(`select coalesce(jsonb_agg(jsonb_build_object('product_id',product_id,'size',size,'name','Món','dem',qty)),'[]')::text from finished_goods_stock where store_location='${S}' and is_semi_finished=false and qty>0`);
  const ket=async(dem)=>{await as(GD); const c=await caDangMo(); if(c) await q(`select public.pos_ket_ca('${c}',${dem},null,'k.jpg','${await demBanh()}'::jsonb)`);};
  await ket(300000);   // đóng ca còn mở (nếu có), két đếm 300k
  await as(NV);
  await ok('Màn vào ca thấy số két ca trước', async()=>{const r=await v(`select public.pos_tien_dau_ca('${S}')`); return [r.co, Number(r.so)];},[true,300000]);
  await ok('Nhập khống 900k: máy vẫn tính két 300k (ca trước), lưu số gõ', async()=>{const r=await v(`select public.pos_vao_ca('${S}',900000,'k1.jpg')`); return [Number(r.opening_cash), Number(r.opening_cash_entered)];},[300000,900000]);
  await ok('Giám đốc nhận cảnh báo đầu ca nhập DƯ 600k', ()=>v(`select count(*) from notifications where event_key like 'pos-dau-ca:%' and title like '%nhập DƯ 600%'`),1);
  const soBao=await v(`select count(*) from notifications where event_key like 'pos-dau-ca:%'`);
  const caA=await caDangMo();
  await ok('Bán 2 hoá đơn trong ca', async()=>{await ban({photo_url:'a1-'+id()+'.jpg'}); await ban({photo_url:'a2-'+id()+'.jpg'}); return true;},true);
  await ok('Kết ca: két máy = 300k + 360k (KHÔNG cộng 900k gõ khống)', async()=>{await as(NV); const r=await v(`select public.pos_ket_ca('${caA}',660000,null,'k.jpg','${await demBanh()}'::jsonb)`); return [Number(r.expected_cash), Number(r.diff)];},[660000,0]);
  await as(NV2);
  await ok('Vào ca đúng số ca trước → không báo GĐ', async()=>{await q(`select public.pos_vao_ca('${S}',660000,'k2.jpg')`); return v(`select count(*) from notifications where event_key like 'pos-dau-ca:%'`);},soBao);
  await ok('Người B bán 1 hoá đơn', async()=>{await ban({photo_url:'b1-'+id()+'.jpg'}); return true;},true);
  const tu=new Date(Date.now()-86400000).toISOString(), den=new Date(Date.now()+86400000).toISOString();
  await ok('Tổng quan của B: đúng số HĐ của B, ca mới nhất đang mở có 1 HĐ 180k', async()=>{const r=await v(`select public.pos_tong_quan_cua_toi('${tu}','${den}')`); const that=await v(`select count(*) from pos_invoices where status='xong' and cashier_id='${NV2}' and created_at>='${tu}'`); return [r.so_hd===that, r.ca[0].status, r.ca[0].so_hd, Number(r.ca[0].ban_tinh)];},[true,'open',1,180000]);
  await as(NV);
  await ok('Tổng quan của A: không lẫn HĐ của B, ca đã kết lưu doanh số', async()=>{const r=await v(`select public.pos_tong_quan_cua_toi('${tu}','${den}')`); const c=r.ca.find((x)=>x.id===caA); const that=await v(`select count(*) from pos_invoices where status='xong' and cashier_id='${NV}' and created_at>='${tu}'`); return [r.so_hd===that, r.hd.length===that, c.status, c.so_hd, Number(c.ban_tinh)];},[true,true,'closed',2,360000]);
  await chan('Khoảng ngày quá dài bị chặn', ()=>q(`select public.pos_tong_quan_cua_toi(now()-interval '200 days', now())`),'3 tháng');
  await ket(0);
}
// ── 202611161030: danh sách Giám đốc riêng của quầy ──
if (process.argv.some((x)=>x.includes('danh_sach_giam_doc'))) {
  const S='Vĩnh Phú 42';
  await as(KT);
  await ok('Kế toán chưa trong danh sách GĐ → cấp nv', ()=>v(`select public.pos_cap_do()`),'nv');
  await q(`insert into pos_giam_doc(profile_id) values ('${KT}') on conflict do nothing`);
  await ok('Thêm vào danh sách GĐ quầy → cấp gd', ()=>v(`select public.pos_cap_do()`),'gd');
  await ok('Không có ca mở', ()=>v(`select count(*) from pos_shifts where status='open' and store_location='${S}'`),0);
  await ok('GĐ quầy bán luôn không cần vào ca', async()=>{const i=id(); await ban({id:i,photo_url:'gd-'+id()+'.jpg'}); return q(`select status, shift_id from pos_invoices where id='${i}'`);},[{status:'xong',shift_id:null}]);
  await ok('GĐ quầy nhận cảnh báo của Giám đốc', async()=>{await q(`select public.pos__bao_sep('thu-gd-quay','t','b','${id()}','info')`); return v(`select count(*) from notifications where event_key='thu-gd-quay:${KT}'`);},1);
  await ok('GĐ quầy nhận việc chờ duyệt', async()=>{await q(`select public.pos__bao_quan_ly('thu-ql-quay','t','b','${id()}')`); return v(`select count(*) from notifications where event_key='thu-ql-quay:${KT}'`);},1);
  await as(NV);
  await ok('Nhân viên vẫn là nv', ()=>v(`select public.pos_cap_do()`),'nv');
  await chan('Nhân viên vẫn phải vào ca mới bán được', ()=>ban({photo_url:'nv-'+id()+'.jpg'}));
  await ok('Tài khoản đăng nhập không đọc/sửa thẳng được danh sách GĐ', ()=>v(`select has_table_privilege('authenticated','public.pos_giam_doc','select') or has_table_privilege('authenticated','public.pos_giam_doc','insert')`),false);
  await as(GD);
  await ok('Chủ tiệm (owner) vẫn là gd', ()=>v(`select public.pos_cap_do()`),'gd');
  await q(`delete from pos_giam_doc where profile_id='${KT}'`);
}
// ── 202611171000: Báo cáo cuối ngày ──
if (process.argv.some((x)=>x.includes('bao_cao_cuoi_ngay'))) {
  const S='Vĩnh Phú 42', NV2='00000000-0000-0000-0000-0000000000a6';
  await q(`insert into profiles values ('${NV2}','Thu ngân C','sale','{}',true,true) on conflict do nothing`);
  const tu=new Date(Date.now()-3600000).toISOString(), den=new Date(Date.now()+3600000).toISOString();
  const bc=(loc={})=>v(`select public.pos_bao_cao_cuoi_ngay('${S}','${tu}','${den}','${JSON.stringify(loc)}'::jsonb)`);
  // C vào ca, bán 1 HĐ tiền mặt 180k + 1 HĐ chuyển khoản 180k
  await as(GD); const c0=await v(`select coalesce((select id::text from pos_shifts where status='open' and store_location='${S}'),'')`);
  if (c0) await q(`select public.pos_ket_ca('${c0}',0,null,'k.jpg','[]'::jsonb)`).catch(()=>{});
  await as(NV2);
  await q(`select public.pos_vao_ca('${S}',0,'kc.jpg')`);
  await ban({photo_url:'c1-'+id()+'.jpg'}); await ban({pay_method:'chuyen_khoan',photo_url:'c2-'+id()+'.jpg'});
  await ok('Nhân viên C: chỉ thấy 2 HĐ của mình, tổng thu 360k', async()=>{const r=await bc(); return [r.chi_cua_toi, r.hd.so, Number(r.tong_thu), Number(r.pttt.tien_mat), Number(r.pttt.chuyen_khoan)];},[true,2,360000,180000,180000]);
  await ok('Nhân viên gửi lọc người khác vẫn chỉ ra số của mình', async()=>{const r=await bc({nguoi_tao:[NV]}); return r.hd.so;},2);
  await ok('Nhân viên không thấy danh sách người để lọc', async()=>{const r=await bc(); return [r.ds_nhan_vien.length, r.ds_nguoi_tao.length];},[0,0]);
  await as(GD);
  const tatCa=await bc();
  const soThat=await v(`select count(*) from pos_invoices where status='xong' and store_location='${S}' and created_at>='${tu}'`);
  await ok('Giám đốc: thấy cả cửa hàng (đúng số HĐ trong DB)', ()=>tatCa.hd.so===soThat && tatCa.chi_cua_toi===false,true);
  await ok('Giám đốc lọc Người tạo = C → 2 HĐ', async()=>(await bc({nguoi_tao:[NV2]})).hd.so,2);
  await ok('Lọc Chuyển khoản → chỉ tiền CK', async()=>{const r=await bc({nguoi_tao:[NV2],pttt:['chuyen_khoan']}); return [r.hd.so, Number(r.tong_thu), Number(r.pttt.tien_mat)];},[1,180000,0]);
  await ok('Lọc chỉ "Giao hàng" → không có HĐ bán tại quầy', async()=>(await bc({ban:['giao']})).hd.so,0);
  await ok('Tổng kết bán hàng: số lượng hàng bán của C', async()=>{const r=await bc({nguoi_tao:[NV2]}); return [Number(r.hang.so_luong), r.hang.so_mat_hang];},[4,1]);
  await chan('Khoảng quá 3 tháng bị chặn', ()=>q(`select public.pos_bao_cao_cuoi_ngay('${S}',now()-interval '200 days',now(),'{}')`),'3 tháng');
  if (process.argv.some((x)=>x.includes('bao_cao_loc_nhan_vien'))) {
    // 202611171030: lọc liệt kê ĐỦ người được bán hàng, kể cả người chưa bán đơn nào
    const NV3='00000000-0000-0000-0000-0000000000a7', NGHI='00000000-0000-0000-0000-0000000000a8';
    await q(`insert into profiles values ('${NV3}','Sale mới chưa bán','sale','{}',true,true),('${NGHI}','Đã nghỉ','sale','{}',true,false) on conflict do nothing`);
    await q(`insert into feature_flags(key,enabled,description,allowed_profile_ids) values ('pos_ban_hang_that',true,'x','{${NV3},${NGHI},${NV2}}') on conflict (key) do update set allowed_profile_ids=excluded.allowed_profile_ids`);
    const r=await bc();
    await ok('Lọc Nhân viên có người chưa bán đơn nào', ()=>r.ds_nhan_vien.includes('Sale mới chưa bán'),true);
    await ok('Lọc Nhân viên vẫn có người đã bán, không trùng tên', ()=>r.ds_nhan_vien.filter((n)=>n==='Thu ngân C').length,1);
    await ok('Người đã nghỉ không hiện', ()=>r.ds_nhan_vien.includes('Đã nghỉ'),false);
    await ok('Người tạo có người chưa bán, mỗi người 1 dòng', ()=>[r.ds_nguoi_tao.some((x)=>x.id===NV3), r.ds_nguoi_tao.filter((x)=>x.id===NV2).length],[true,1]);
    await ok('Lọc theo người chưa bán → 0 HĐ', async()=>(await bc({nhan_vien:['Sale mới chưa bán']})).hd.so,0);
    await as(NV2); await ok('Nhân viên vẫn không thấy danh sách', async()=>{const x=await bc(); return [x.ds_nhan_vien.length, x.ds_nguoi_tao.length];},[0,0]); await as(GD);
  }
}
// ── 202611171010: báo điện thoại Giám đốc mỗi hoá đơn ──
if (process.argv.some((x)=>x.includes('bao_moi_hoa_don'))) {
  await q(`delete from thu_push`);
  await q(`insert into pos_giam_doc(profile_id) values ('${KT}') on conflict do nothing`);
  await as(GD);
  await ban({photo_url:'p1-'+id()+'.jpg'});
  await ok('GĐ tự bán: báo GĐ khác (kế toán GĐ quầy), không báo chính mình', ()=>q(`select staff_id::text s from thu_push order by s`).then(r=>r.map(x=>x.s)),[KT]);
  await ok('Nội dung như KiotViet', ()=>v(`select body from thu_push limit 1`),'Sếp bán đơn hàng với giá trị 180,000 tại Vĩnh Phú 42');
  await ok('Bấm vào mở màn Bán hàng', ()=>v(`select url from thu_push limit 1`),'/?mockup=ban-hang');
  await q(`delete from thu_push`);
  await db.exec(`select set_config('test.push_loi','1',false)`);
  const truoc=await v(`select count(*) from pos_invoices`);
  await ok('Gửi thông báo hỏng → hoá đơn VẪN lưu', async()=>{await ban({photo_url:'p2-'+id()+'.jpg'}); return (await v(`select count(*) from pos_invoices`))-truoc;},1);
  await db.exec(`select set_config('test.push_loi','',false)`);
  await ok('Quản lý / nhân viên thường không nhận', ()=>v(`select count(*) from thu_push where staff_id in ('${QL}','${NV}')`),0);
  await q(`delete from pos_giam_doc where profile_id='${KT}'`);
}
// ── 202611171020: dọn ảnh hoá đơn cũ ──
if (await v(`select count(*)::int from pg_proc where proname='pos_goi_don_anh_cu'`)) {
  await ok('Có cột photo_deleted_at, hoá đơn cũ = null', ()=>v(`select count(*)::int from pos_invoices where photo_deleted_at is not null`),0);
  await ok('Nhân viên không tự gọi được hàm dọn ảnh', ()=>v(`select has_function_privilege('authenticated','public.pos_goi_don_anh_cu()','execute')`),false);
}
// ── 202611181000/1010: thêm / sửa / xoá hàng ở quầy + ẩn hết hàng cũ ──
if (await v(`select count(*)::int from pg_proc where proname='pos_them_hang'`)) {
  const NV5='00000000-0000-0000-0000-0000000000a9';
  await q(`insert into profiles values ('${NV5}','Thu ngân E','sale','{}',true,true) on conflict do nothing`);
  const them=(o)=>q(`select public.pos_them_hang(${o.ten==null?'null':`'${o.ten}'`},${o.nhom?`'${o.nhom}'`:'null'},${o.gia},${o.ma?`'${o.ma}'`:'null'},null) r`).then((r)=>r[0].r);
  const maKe='SP'+String((await v(`select coalesce(max(substring(pos_code from 3)::int),0) from products where pos_code ~ '^SP[0-9]{6}$'`))+1).padStart(6,'0');
  const kvTruoc=await v(`select id::text from products where pos_code is not null limit 1`);
  await as(NV);
  const a=await them({ten:'Bánh mì que',nhom:'42Bánh mì',gia:15000});
  await ok('Nhân viên thêm món, máy tự đặt mã tiếp theo sau mã KiotViet lớn nhất', ()=>[a.pos_code,Number(a.price),a.pos_group],[maKe,15000,'42Bánh mì']);
  await ok('Món mới có pos_code → Tạo đơn (lọc pos_code is null) không thấy', ()=>v(`select count(*)::int from products where active and pos_code is null and id='${a.id}'`),0);
  const b=await them({ten:'Bông lan',gia:30000,ma:'bl01'});
  await ok('Tự gõ mã → viết hoa, nhóm trống thành Khác', ()=>[b.pos_code,b.pos_group],['BL01','Khác']);
  await chan('Mã trùng bị chặn', ()=>them({ten:'X',gia:1,ma:'BL01'}),'đã có');
  await chan('Mã có dấu cách bị chặn', ()=>them({ten:'X',gia:1,ma:'A B'}),'dấu cách');
  await chan('Thiếu tên bị chặn', ()=>them({ten:'  ',gia:1}),'tên');
  await chan('Giá âm bị chặn', ()=>them({ten:'X',gia:-5}),'Giá');
  await ok('Ghi nhật ký them_hang', ()=>v(`select count(*)::int from pos_audit_log where action='them_hang' and actor='${NV}'`),2);
  await ok('Nhân viên sửa món mình vừa tạo', async()=>{const r=(await q(`select public.pos_sua_hang('${a.id}','Bánh mì que bơ','42Bánh mì',16000,'893') r`))[0].r; return [r.name,Number(r.price),r.pos_barcode];},['Bánh mì que bơ',16000,'893']);
  await as(NV5);
  await chan('Nhân viên khác KHÔNG sửa được món người khác tạo', ()=>q(`select public.pos_sua_hang('${a.id}','Hack',null,1)`),'Chỉ quản lý');
  await chan('Nhân viên khác KHÔNG xoá được', ()=>q(`select public.pos_an_hang('${a.id}')`),'Chỉ quản lý');
  await chan('Nhân viên KHÔNG sửa được món app chính', ()=>q(`select public.pos_sua_hang('${P1}','Hack',null,1)`),'Không tìm thấy');
  await chan('Nhân viên KHÔNG ẩn được món app chính', ()=>q(`select public.pos_an_hang('${P1}')`),'Giám đốc');
  await as(QL);
  await ok('Quản lý sửa giá món quầy', async()=>Number((await q(`select public.pos_sua_hang('${b.id}','Bông lan','42Bông Lan',32000) r`))[0].r.price),32000);
  await q(`select public.pos__ton_cong('Vĩnh Phú 42','${b.id}',null,'Bông lan',3,'kiem_kho','KT')`);
  await chan('Còn tồn thì không xoá được', ()=>q(`select public.pos_an_hang('${b.id}')`),'còn tồn 3');
  await q(`select public.pos__ton_cong('Vĩnh Phú 42','${b.id}',null,'Bông lan',-3,'kiem_kho','KT')`);
  await ok('Hết tồn → quản lý xoá khỏi quầy', async()=>{await q(`select public.pos_an_hang('${b.id}')`); return v(`select pos_an from products where id='${b.id}'`);},true);
  await chan('Quản lý KHÔNG hiện lại được (chỉ GĐ)', ()=>q(`select public.pos_an_hang('${b.id}',false)`),'Giám đốc');
  await chan('Món đã xoá không sửa được nữa', ()=>q(`select public.pos_sua_hang('${b.id}','x',null,1)`),'Không tìm thấy');
  await as(GD);
  await ok('GĐ hiện lại được', async()=>{await q(`select public.pos_an_hang('${b.id}',false)`); return v(`select pos_an from products where id='${b.id}'`);},false);
  await ok('Không ai gọi thẳng được hàm kiểm quyền', ()=>v(`select has_function_privilege('authenticated','public.pos__duoc_sua_hang(uuid)','execute')`),false);
  // 1010: ẩn hết hàng cũ, tồn món cũ về 0 bằng phiếu KK, món tạo ở quầy giữ nguyên
  await q(`insert into pos_settings(store_location) values ('Vĩnh Phú 41') on conflict do nothing`);
  await q(`select public.pos__ton_cong('Vĩnh Phú 41','${P1}',null,'Bánh bò',4,'kiem_kho','KT')`);
  await q(`select public.pos__ton_cong('Vĩnh Phú 42','${a.id}',null,'Bánh mì que bơ',5,'kiem_kho','KT')`);
  const bepTruoc=await ton(null), tonP1=await ton(), kkTruoc=await v(`select count(*)::int from pos_stock_docs where doc_type='kiem_kho'`);
  const f1010=process.argv.find((x)=>x.includes('an_het_hang_cu'));
  if (f1010) {
    await db.exec(fs.readFileSync(f1010,'utf8').replace(/^begin;|^commit;/gm,'')); // file đã chạy 1 lần lúc đầu (chưa có dữ liệu) → chạy lại
    await ok('Món app + món KiotViet cũ bị ẩn khỏi quầy', ()=>q(`select pos_an from products where id in ('${P1}','${kvTruoc}') order by id`).then((r)=>r.map((x)=>x.pos_an)),[true,true]);
    await ok('Không còn món cũ nào hiện ở quầy', ()=>v(`select count(*)::int from products where not pos_an and id not in ('${a.id}','${b.id}')`),0);
    await ok('Món tạo ở quầy KHÔNG bị ẩn', ()=>q(`select pos_an from products where id in ('${a.id}','${b.id}') order by pos_code`).then((r)=>r.map((x)=>x.pos_an)),[false,false]);
    await ok('Món app vẫn active (Tạo đơn vẫn thấy)', ()=>v(`select active from products where id='${P1}'`),true);
    await ok('Tồn món cũ ở 2 quầy về 0', async()=>[await ton(), await ton('Vĩnh Phú 41')],[0,0]);
    await ok('Kho bếp không đụng', ()=>ton(null),bepTruoc);
    await ok('Tồn món mới tạo ở quầy giữ nguyên', ()=>v(`select public.pos__ton('Vĩnh Phú 42','${a.id}',null)`),5);
    await ok('Mỗi quầy có tồn 1 phiếu KK, thẻ kho ghi số cũ', async()=>[(await v(`select count(*)::int from pos_stock_docs where doc_type='kiem_kho'`))-kkTruoc, await v(`select -delta from pos_stock_ledger where product_id='${P1}' and store_location='Vĩnh Phú 42' order by id desc limit 1`)],[2,tonP1]);
    const kk2=await v(`select count(*)::int from pos_stock_docs where doc_type='kiem_kho'`);
    await db.exec(fs.readFileSync(f1010,'utf8').replace(/^begin;|^commit;/gm,''));
    await ok('Chạy lại lần 2 không tạo phiếu mới', ()=>v(`select count(*)::int from pos_stock_docs where doc_type='kiem_kho'`),kk2);
  }
}
console.log(`\n${dem-loi}/${dem} đạt`); process.exit(loi?1:0);
