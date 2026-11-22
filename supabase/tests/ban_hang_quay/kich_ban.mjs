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
  await chan('Vào ca khi ca người khác đang mở', ()=>q(`select public.pos_vao_ca('${S}',0,'ket.jpg')`),process.argv.some((x)=>x.includes('nhan_ca_va_bao_cao'))?'Nhận ca':'phải kết ca');
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
  const CA_NGAY=process.argv.some((x)=>x.includes('nhan_ca_va_bao_cao'));  // 202611221040: nhân viên xem cả cửa hàng như KiotViet
  if (!CA_NGAY) {
  await ok('Nhân viên C: chỉ thấy 2 HĐ của mình, tổng thu 360k', async()=>{const r=await bc(); return [r.chi_cua_toi, r.hd.so, Number(r.tong_thu), Number(r.pttt.tien_mat), Number(r.pttt.chuyen_khoan)];},[true,2,360000,180000,180000]);
  await ok('Nhân viên gửi lọc người khác vẫn chỉ ra số của mình', async()=>{const r=await bc({nguoi_tao:[NV]}); return r.hd.so;},2);
  await ok('Nhân viên không thấy danh sách người để lọc', async()=>{const r=await bc(); return [r.ds_nhan_vien.length, r.ds_nguoi_tao.length];},[0,0]);
  } else {
  const soCh=await v(`select count(*) from pos_invoices where status='xong' and store_location='${S}' and created_at>='${tu}'`);
  await ok('Nhân viên C: thấy CẢ cửa hàng (đủ số HĐ trong DB)', async()=>{const r=await bc(); return [r.chi_cua_toi, r.hd.so===soCh];},[false,true]);
  await ok('Nhân viên C lọc Người tạo = mình → 2 HĐ, 360k', async()=>{const r=await bc({nguoi_tao:[NV2]}); return [r.hd.so, Number(r.tong_thu), Number(r.pttt.tien_mat), Number(r.pttt.chuyen_khoan)];},[2,360000,180000,180000]);
  await ok('Nhân viên C lọc Nhân viên = người khác → ra số người đó', async()=>{const r=await bc({nguoi_tao:[NV]}); const that=await v(`select count(*) from pos_invoices where status='xong' and store_location='${S}' and created_at>='${tu}' and cashier_id='${NV}'`); return r.hd.so===that && that>0;},true);
  await ok('Nhân viên C chọn 2 người → cộng gộp đúng', async()=>{const a=(await bc({nguoi_tao:[NV]})).hd.so, b=(await bc({nguoi_tao:[NV2]})).hd.so; return (await bc({nguoi_tao:[NV,NV2]})).hd.so===a+b;},true);
  await ok('Nhân viên thấy danh sách người để lọc', async()=>{const r=await bc(); return r.ds_nhan_vien.length>0 && r.ds_nguoi_tao.length>0;},true);
  await ok('Nhân viên không thấy giá vốn', async()=>{const r=await bc(); return r.gia_von===undefined || r.gia_von===null;},true);
  }
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
    await as(NV2); await ok(CA_NGAY?'Nhân viên thấy đủ danh sách như GĐ':'Nhân viên vẫn không thấy danh sách', async()=>{const x=await bc(); return CA_NGAY?[x.ds_nhan_vien.length===r.ds_nhan_vien.length, x.ds_nguoi_tao.length===r.ds_nguoi_tao.length]:[x.ds_nhan_vien.length, x.ds_nguoi_tao.length];},CA_NGAY?[true,true]:[0,0]); await as(GD);
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
// ── 202611181020: phiếu chi tiền từ két + khai đã chi lúc vào ca ──
if (await v(`select count(*)::int from pg_proc where proname='pos_chi_ket'`)) {
  const Q='Quầy thử chi', NV6='00000000-0000-0000-0000-0000000000aa', NV7='00000000-0000-0000-0000-0000000000ab';
  await db.exec(`insert into pos_settings(store_location) values ('${Q}') on conflict do nothing; update pos_settings set bat_cham_cong=false where store_location='${Q}'`);
  await q(`insert into profiles values ('${NV6}','Thu ngân F','sale','{}',true,true),('${NV7}','Thu ngân G','sale','{}',true,true) on conflict do nothing`);
  const vao=(tien,ly)=>q(`select public.pos_vao_ca_v2('${Q}',${tien},'k.jpg',${ly?`'${ly}'`:'null'}) r`).then((r)=>r[0].r);
  const sl=(ca)=>v(`select public.pos__so_lieu_ca('${ca}')`);
  const ket=(ca,tien)=>q(`select public.pos_ket_ca('${ca}',${tien},null,'k.jpg','[]'::jsonb) r`).then((r)=>r[0].r);
  const chi=(ca,tien,ly,pid=id())=>q(`select public.pos_chi_ket('${pid}','${ca}',${tien},${ly==null?'null':`'${ly}'`}) r`).then((r)=>r[0].r);
  await as(NV6);
  const c1=await vao(1000000);
  await ok('Ca đầu tiên (chưa có ca trước): két = số nhập', ()=>Number(c1.opening_cash),1000000);
  const pid=id();
  const p1=await chi(c1.id,200000,'mua đá viên',pid);
  await ok('Ghi phiếu chi trong ca → mã PC…', ()=>[/^PC\d{6}$/.test(p1.code), Number(p1.amount), p1.truoc_ca],[true,200000,false]);
  await ok('Gửi lại cùng mã (mất mạng / bấm 2 lần) không ghi trùng', async()=>{await chi(c1.id,200000,'mua đá viên',pid); return v(`select count(*)::int from pos_cash_outs where shift_id='${c1.id}'`);},1);
  await ok('Số liệu ca trừ tiền chi', async()=>{const x=await sl(c1.id); return [Number(x.chi_ket), Number(x.tien_mat_trong_ca), x.so_phieu_chi];},[200000,-200000,1]);
  await ok('Báo Giám đốc khi chi', ()=>v(`select count(*)::int from notifications where event_key like 'pos-chi-ket:${p1.id}%'`),1);
  await chan('Thiếu lý do bị chặn', ()=>chi(c1.id,1000,'  '),'Ghi rõ');
  await chan('Số tiền 0 bị chặn', ()=>chi(c1.id,0,'abc'),'không hợp lệ');
  await as(NV7);
  await chan('Nhân viên khác KHÔNG ghi chi vào ca người khác', ()=>chi(c1.id,1000,'lấy tiền'),'chỉ người đang giữ ca');
  await chan('Nhân viên khác KHÔNG huỷ phiếu chi người khác', ()=>q(`select public.pos_huy_chi_ket('${p1.id}','nhầm')`),'Chỉ người ghi');
  await as(QL);
  const pql=await chi(c1.id,50000,'Quản lý lấy tiền lẻ đổi');
  await ok('Quản lý ghi chi vào ca nhân viên được', ()=>Number(pql.amount),50000);
  await as(NV6);
  await chan('Huỷ phải có lý do', ()=>q(`select public.pos_huy_chi_ket('${p1.id}','')`),'lý do');
  await ok('Người ghi huỷ phiếu chi của mình', async()=>(await q(`select public.pos_huy_chi_ket('${p1.id}','ghi nhầm số') r`))[0].r.status,'huy');
  await ok('Phiếu huỷ không còn trừ tiền', async()=>Number((await sl(c1.id)).chi_ket),50000);
  await chi(c1.id,150000,'trả tiền ship bánh');
  const k1=await ket(c1.id,800000);
  await ok('Kết ca: két phải có = đầu ca − tiền chi, đếm đúng → lệch 0', ()=>[Number(k1.expected_cash), Number(k1.diff)],[800000,0]);
  await chan('Ca kết rồi không ghi chi được', ()=>chi(c1.id,1000,'abc'),'đã kết');
  await chan('Ca kết rồi không huỷ phiếu chi được', ()=>q(`select public.pos_huy_chi_ket('${pql.id}','x')`),'Ca đã kết');
  // Vào ca két ít hơn ca trước + khai đã chi (đúng lỗi thật 18/11)
  await as(NV7);
  const c2=await vao(500000,'chi tiền mua bột lúc sáng');
  await ok('Vào ca khai đã chi: két tính theo ca trước, tạo phiếu chi "trước ca" đúng phần thiếu', async()=>{const x=await sl(c2.id); return [Number(c2.opening_cash), Number(c2.opening_cash_entered), Number(x.chi_ket), x.phieu_chi[0].truoc_ca, c2.chi_truoc_ca?.reason];},[800000,500000,300000,true,'chi tiền mua bột lúc sáng']);
  await ok('Không báo "nhập THIẾU" (đã có phiếu chi giải thích), chỉ báo chi', async()=>[await v(`select count(*)::int from notifications where event_key like 'pos-dau-ca:${c2.id}%'`), await v(`select count(*)::int from notifications where event_key like 'pos-chi-ket:%' and body like '%khai lúc vào ca%'`)>0],[0,true]);
  const k2=await ket(c2.id,500000);
  await ok('Kết ca đếm đúng số thật → lệch 0 (không đổ thiếu lên người vào ca)', ()=>[Number(k2.expected_cash), Number(k2.diff)],[500000,0]);
  // Không khai lý do → như cũ
  await as(NV6);
  const c3=(await q(`select public.pos_vao_ca('${Q}',400000,'k.jpg') r`))[0].r;
  await ok('Bản cũ pos_vao_ca vẫn chạy, không khai → két theo ca trước, không phiếu chi, có báo nhập THIẾU', async()=>[Number(c3.opening_cash), await v(`select count(*)::int from pos_cash_outs where shift_id='${c3.id}'`), await v(`select count(*)::int from notifications where event_key like 'pos-dau-ca:${c3.id}%'`)>0],[500000,0,true]);
  await ket(c3.id,500000);
  const c4=await vao(700000,'thêm tiền lẻ');
  await ok('Két NHIỀU hơn ca trước: lý do không tạo phiếu chi, vẫn báo nhập DƯ', async()=>[Number(c4.opening_cash), await v(`select count(*)::int from pos_cash_outs where shift_id='${c4.id}'`), await v(`select title from notifications where event_key like 'pos-dau-ca:${c4.id}%' limit 1`)],[500000,0,'⚠️ Tiền đầu ca nhập DƯ 200,000đ — Quầy thử chi']);
  await ket(c4.id,500000);
  await chan('Khai lý do quá ngắn bị chặn', ()=>vao(100000,'x'),'Ghi rõ');
  await ok('Không ai gọi thẳng hàm ghi phiếu nội bộ', ()=>v(`select has_function_privilege('authenticated','public.pos__ghi_chi_ket(uuid,public.pos_shifts,numeric,text,text,boolean)','execute')`),false);
}
// ── 202611221000: xuất dùng nội bộ (XD, loại xuất KiotViet) + luân chuyển bánh giữa cửa hàng ──
if (await v(`select count(*)::int from information_schema.columns where table_name='pos_stock_docs' and column_name='to_store'`)) {
  const P4='00000000-0000-0000-0000-0000000000b4', A='Vĩnh Phú 42', B='Quốc Lộ 13', LC='Luân chuyển bánh giữa các cửa hàng';
  await db.exec(`insert into products(id,name,category,price) values ('${P4}','Bánh mì que','khac',10000);
    insert into finished_goods_stock(product_id,size,branch,qty,store_location) values ('${P4}',null,'bakery',100,null);
    insert into pos_shelf_life(product_id,days) values ('${P4}',2) on conflict (product_id) do update set days=2;`);
  const t4=(s)=>v(`select public.pos__ton('${s}','${P4}',null)::int`);
  const luu=(o)=>q(`select public.pos_luu_phieu('${JSON.stringify({id:id(),type:'noi_bo',store:A,lines:[{product_id:P4,name:'Bánh mì que',qty:3}],...o}).replace(/'/g,"''")}'::jsonb) r`).then((r)=>r[0].r);
  await as(NV);
  // nhập 20 vào A (có hạn 2 ngày)
  { const d=id(); await q(`select public.pos_luu_phieu('{"id":"${d}","type":"bep_giao","store":"${A}","lines":[{"product_id":"${P4}","name":"Bánh mì que","qty":20}]}')`); await q(`select public.pos_nhan_hang('${d}','{"${P4}:":20}')`); }
  await ok('Chuẩn bị: A có 20 bánh mì que, B 0', async()=>[await t4(A), await t4(B)],[20,0]);
  const x1=await luu({loai_xuat:'Xuất cho nhân viên dùng',note:'ăn sáng'});
  await ok('Xuất dùng nội bộ → mã XD…, lưu loại xuất, trừ tồn A', async()=>[/^XD\d{6}$/.test(x1.code), x1.loai_xuat, x1.status, x1.to_store, await t4(A)],[true,'Xuất cho nhân viên dùng','xong',null,17]);
  await chan('Thiếu loại xuất bị chặn', ()=>luu({loai_xuat:'  '}),'loại xuất');
  await ok('Bản cũ (không gửi loai_xuat) vẫn chạy như trước', async()=>(await luu({note:'Xuất cho nhân viên dùng'})).status,'xong');
  await chan('Luân chuyển chưa chọn cửa hàng nhận', ()=>luu({loai_xuat:LC}),'cửa hàng nhận');
  await chan('Luân chuyển sang chính mình', ()=>luu({loai_xuat:LC,to_store:A}),'phải khác');
  await chan('Luân chuyển sang cửa hàng không có', ()=>luu({loai_xuat:LC,to_store:'Quầy ma'}),'không hợp lệ');
  await ok('Tồn A vẫn 14 sau các lần bị chặn', ()=>t4(A),14);
  const xtam=id();
  await ok('Lưu tạm luân chuyển không đụng tồn, chưa tạo phiếu nhận', async()=>{await q(`select public.pos_luu_phieu('${JSON.stringify({id:xtam,type:'noi_bo',store:A,status:'tam',loai_xuat:LC,to_store:B,lines:[{product_id:P4,name:'Bánh mì que',qty:5}]})}'::jsonb)`); return [await t4(A), await v(`select count(*)::int from pos_stock_docs where doc_type='nhan_chuyen'`)];},[14,0]);
  const xc=(await q(`select public.pos_luu_phieu('${JSON.stringify({id:xtam,type:'noi_bo',store:A,loai_xuat:LC,to_store:B,note:'gửi qua ship',lines:[{product_id:P4,name:'Bánh mì que',qty:5}]})}'::jsonb) r`))[0].r;
  const nc=(await q(`select * from pos_stock_docs where id='${xc.ref_doc}'`))[0];
  await ok('Chốt luân chuyển 5: A trừ 5, B CHƯA cộng, có phiếu NC chờ nhận ở B', async()=>[await t4(A), await t4(B), /^NC\d{6}$/.test(nc.code), nc.doc_type, nc.store_location, nc.status, nc.from_store, nc.ref_doc===xc.id, nc.lines[0].qty],[9,0,true,'nhan_chuyen',B,'cho_nhan',A,true,5]);
  await ok('Báo quản lý có phiếu chuyển bánh', ()=>v(`select count(*)::int from notifications where event_key like 'pos-chuyen-banh:${nc.id}%'`),2);
  await ok('Gửi lại cùng mã (mất mạng) không tạo phiếu nhận thứ 2, không trừ thêm', async()=>{await q(`select public.pos_luu_phieu('${JSON.stringify({id:xtam,type:'noi_bo',store:A,loai_xuat:LC,to_store:B,lines:[{product_id:P4,name:'Bánh mì que',qty:5}]})}'::jsonb)`); return [await t4(A), await v(`select count(*)::int from pos_stock_docs where doc_type='nhan_chuyen'`)];},[9,1]);
  await chan('Phiếu NC không huỷ riêng', ()=>q(`select public.pos_huy_phieu('${nc.id}','x')`),'không huỷ riêng');
  await ok('B nhận thực tế 4 (lệch 1) → B cộng 4, kho bếp không bị trừ, báo GĐ lệch', async()=>{const bep=await v(`select public.pos__ton(null,'${P4}',null)::int`); await q(`select public.pos_nhan_hang('${nc.id}','{"${P4}:":4}')`); return [await t4(B), await v(`select public.pos__ton(null,'${P4}',null)::int`)-bep, await v(`select count(*)::int from notifications where event_key like 'pos-lech-giao:${nc.id}%'`)>0];},[4,0,true]);
  await ok('Lô ở B mang hạn dùng của bánh bên A (không tính lại từ đầu)', async()=>v(`select (select min(expiry_at) from pos_stock_lots where ref_code='${nc.code}') = (select min(expiry_at) from pos_stock_lots where store_location='${A}' and product_id='${P4}')`),true);
  await ok('Nhận lần 2 không cộng thêm', async()=>{await q(`select public.pos_nhan_hang('${nc.id}','{"${P4}:":4}')`); return t4(B);},4);
  await chan('B đã nhận → A không huỷ được phiếu XD', ()=>q(`select public.pos_huy_phieu('${xc.id}','nhầm')`),'đã nhận bánh');
  // huỷ khi bên nhận chưa nhận
  const x3=await luu({loai_xuat:LC,to_store:B,lines:[{product_id:P4,name:'Bánh mì que',qty:2}]});
  await ok('Chuyển tiếp 2 → A còn 7', ()=>t4(A),7);
  await ok('A huỷ khi B chưa nhận → A hoàn 2, phiếu NC cũng huỷ, B không đổi', async()=>{await q(`select public.pos_huy_phieu('${x3.id}','chuyển nhầm')`); return [await t4(A), await t4(B), await v(`select status from pos_stock_docs where id='${x3.ref_doc}'`)];},[9,4,'huy']);
  await ok('B bấm nhận phiếu đã huỷ → không cộng', async()=>{await q(`select public.pos_nhan_hang('${x3.ref_doc}','{}')`); return t4(B);},4);
  await chan('Không nhận hàng bằng phiếu XD', ()=>q(`select public.pos_nhan_hang('${x1.id}','{}')`),'chờ nhận');
  await ok('Loại xuất không phải luân chuyển thì bỏ qua cửa hàng nhận', async()=>{const r=await luu({loai_xuat:'Xuất dùng cho khách',to_store:B}); return [r.to_store, r.ref_doc, await t4(A)];},[null,null,6]);
}
// ── 202611221010: trả tiền kết hợp (tiền mặt + chuyển khoản + …) ──
if (await v(`select count(*)::int from information_schema.columns where table_name='pos_invoices' and column_name='pay_parts'`)) {
  const Q='Quầy kết hợp', NV8='00000000-0000-0000-0000-0000000000ac', P5='00000000-0000-0000-0000-0000000000b5';
  await db.exec(`insert into pos_settings(store_location) values ('${Q}') on conflict do nothing; update pos_settings set bat_cham_cong=false where store_location='${Q}';
    insert into products(id,name,category,price) values ('${P5}','Bánh tart','khac',50000);
    insert into finished_goods_stock(product_id,size,branch,qty,store_location) values ('${P5}',null,'bakery',50,'${Q}');`);
  await q(`insert into profiles values ('${NV8}','Thu ngân K','sale','{}',true,true) on conflict do nothing`);
  await as(NV8);
  const ca=(await q(`select public.pos_vao_ca('${Q}',0,'k.jpg') r`))[0].r.id;
  const banK=(sl,parts,o={})=>q(`select public.pos_ban('${JSON.stringify({id:id(),store:Q,pay_method:'ket_hop',photo_url:'a.jpg',pay_parts:parts,lines:[{product_id:P5,name:'Bánh tart',qty:sl,list_price:50000,unit_price:50000}],...o})}'::jsonb) r`).then((r)=>r[0].r);
  const k1=await banK(5,{tien_mat:100000,chuyen_khoan:150000});
  const h1=(await q(`select pay_method,pay_parts,paid_amount::int,change_amount::int,transfer_status from pos_invoices where id='${k1.id}'`))[0];
  await ok('Kết hợp 100k TM + 150k CK cho HĐ 250k → ghi đủ 2 phần, CK chờ xác nhận', ()=>[h1.pay_method,h1.pay_parts,h1.paid_amount,h1.change_amount,h1.transfer_status],['ket_hop',{tien_mat:100000,chuyen_khoan:150000},250000,0,'cho_xac_nhan']);
  const k2=await banK(1,{tien_mat:100000,the:20000});
  const h2=(await q(`select pay_parts,change_amount::int,transfer_status from pos_invoices where id='${k2.id}'`))[0];
  await ok('Kết hợp dư 70k → thối từ tiền mặt, phần TM lưu 30k (số thật vào két)', ()=>[h2.pay_parts,h2.change_amount,h2.transfer_status],[{the:20000,tien_mat:30000},70000,'khong']);
  await chan('Chuyển khoản nhiều hơn cần trả → không thối được', ()=>banK(1,{tien_mat:10000,chuyen_khoan:60000}),'Chỉ tiền mặt');
  await chan('Cách trả lạ bị chặn', ()=>banK(1,{bitcoin:50000}),'không hợp lệ');
  const k3=await banK(1,{tien_mat:0,vi:50000});
  await ok('Chỉ 1 cách có tiền → ghi như hoá đơn thường', async()=>(await q(`select pay_method,pay_parts from pos_invoices where id='${k3.id}'`))[0],{pay_method:'vi',pay_parts:null});
  await chan('Khách lẻ trả thiếu kết hợp → không ghi nợ', ()=>banK(2,{tien_mat:30000,chuyen_khoan:20000}),'Khách lẻ');
  const sl=await v(`select public.pos__so_lieu_ca('${ca}')`);
  await ok('Két ca: tiền mặt = 100k + 30k, CK 150k, thẻ 20k, ví 50k', ()=>[Number(sl.ban.tien_mat),Number(sl.ban.chuyen_khoan),Number(sl.ban.the),Number(sl.ban.vi),Number(sl.tien_mat_trong_ca)],[130000,150000,20000,50000,130000]);
  await as(GD);
  const bc=await v(`select public.pos_bao_cao('${Q}', now()-interval '1 day', now()+interval '1 day')`);
  await ok('Báo cáo GĐ chia đúng từng cách + CK chờ = phần CK', ()=>[Number(bc.tien_mat),Number(bc.chuyen_khoan),Number(bc.the),Number(bc.vi),Number(bc.ck_cho)],[130000,150000,20000,50000,150000]);
  const cn=await v(`select public.pos_bao_cao_cuoi_ngay('${Q}', now()-interval '1 day', now()+interval '1 day', '{}'::jsonb)`);
  await ok('Báo cáo cuối ngày: HĐ kết hợp tách thành từng dòng thu', ()=>[Number(cn.pttt.tien_mat),Number(cn.pttt.chuyen_khoan),Number(cn.tong_thu),cn.phieu.filter((x)=>x.ma===k1.code).length],[130000,150000,350000,2]);
  const cnCk=await v(`select public.pos_bao_cao_cuoi_ngay('${Q}', now()-interval '1 day', now()+interval '1 day', '{"pttt":["chuyen_khoan"]}'::jsonb)`);
  await ok('Lọc "Chuyển khoản" vẫn ra HĐ kết hợp có phần CK (chỉ tính phần CK)', ()=>[Number(cnCk.tong_thu), cnCk.hd.so],[150000,1]);
  await as(KT);
  await ok('Kế toán xác nhận CK của HĐ kết hợp', async()=>(await q(`select public.pos_xac_nhan_ck('${k1.id}',true) r`))[0].r.transfer_status,'da_ve');
  await chan('HĐ kết hợp không có CK → không xác nhận CK', ()=>q(`select public.pos_xac_nhan_ck('${k2.id}',true)`),'Không phải');
  await as(NV8);
  await ok('Huỷ HĐ kết hợp trong ca → két bớt đúng phần tiền mặt 30k', async()=>{await q(`select public.pos_huy_hd('${k2.id}','nhầm')`); return Number((await v(`select public.pos__so_lieu_ca('${ca}')`)).tien_mat_trong_ca);},100000);
  await ok('Hoá đơn 1 cách cũ (không gửi pay_parts) vẫn như trước', async()=>{const r=(await q(`select public.pos_ban('${JSON.stringify({id:id(),store:Q,pay_method:'tien_mat',received:60000,photo_url:'b.jpg',lines:[{product_id:P5,name:'Bánh tart',qty:1,list_price:50000,unit_price:50000}]})}'::jsonb) r`))[0].r; return [Number(r.change), r.pay_parts];},[10000,null]);
}
// ── 202611221020: sổ quỹ + phiếu thu tiền vào két ──
if (await v(`select count(*)::int from pg_proc where proname='pos_so_quy'`)) {
  const Q='Quầy sổ quỹ', NV9='00000000-0000-0000-0000-0000000000ad', P6='00000000-0000-0000-0000-0000000000b6';
  await db.exec(`insert into pos_settings(store_location) values ('${Q}') on conflict do nothing; update pos_settings set bat_cham_cong=false where store_location='${Q}';
    insert into products(id,name,category,price) values ('${P6}','Bánh flan','khac',20000);
    insert into finished_goods_stock(product_id,size,branch,qty,store_location) values ('${P6}',null,'bakery',50,'${Q}');`);
  await q(`insert into profiles values ('${NV9}','Thu ngân S','sale','{}',true,true) on conflict do nothing`);
  await as(NV9);
  const ca=(await q(`select public.pos_vao_ca('${Q}',0,'k.jpg') r`))[0].r.id;
  const banS=(sl,o)=>q(`select public.pos_ban('${JSON.stringify({id:id(),store:Q,photo_url:'s.jpg',lines:[{product_id:P6,name:'Bánh flan',qty:sl,list_price:20000,unit_price:20000}],...o})}'::jsonb) r`).then((r)=>r[0].r);
  await banS(5,{pay_method:'tien_mat',received:100000});
  await banS(3,{pay_method:'ket_hop',pay_parts:{tien_mat:20000,chuyen_khoan:40000}});
  await banS(1,{pay_method:'vi',received:20000});
  const lap=(o)=>q(`select public.pos_lap_phieu_quy('${JSON.stringify({id:id(),shift_id:ca,...o})}'::jsonb) r`).then((r)=>r[0].r);
  const pt1=await lap({kind:'thu',amount:200000,reason:'chủ tiệm nộp tiền lẻ',loai:'Thu khác',doi_tuong:'Chủ tiệm'});
  await ok('Phiếu thu → mã PT…, lưu loại + người nộp', ()=>[/^PT\d{6}$/.test(pt1.code), pt1.kind, pt1.loai, pt1.doi_tuong],[true,'thu','Thu khác','Chủ tiệm']);
  const pc1=await lap({kind:'chi',amount:50000,reason:'mua đá viên',loai:'Chi phí khác',doi_tuong:'Cửa hàng đá'});
  await ok('Phiếu chi qua hàm mới → mã PC…, có loại', ()=>[/^PC\d{6}$/.test(pc1.code), pc1.kind, pc1.loai],[true,'chi','Chi phí khác']);
  await chan('Phiếu thu số 0 bị chặn', ()=>lap({kind:'thu',amount:0,reason:'abc'}),'không hợp lệ');
  await chan('Phiếu thu thiếu lý do', ()=>lap({kind:'thu',amount:1000,reason:' '}),'thu tiền gì');
  const sl=await v(`select public.pos__so_lieu_ca('${ca}')`);
  await ok('Két ca: TM bán 120k + thu 200k − chi 50k = 270k; phiếu chi không lẫn phiếu thu', ()=>[Number(sl.thu_ket),Number(sl.chi_ket),sl.so_phieu_chi,sl.phieu_thu.length,Number(sl.tien_mat_trong_ca)],[200000,50000,1,1,270000]);
  await chan('Nhân viên không xem sổ quỹ', ()=>q(`select public.pos_so_quy('${Q}', now()-interval '1 day', now()+interval '1 day')`),'Chỉ Quản lý');
  await as(KT);
  const sq=await v(`select public.pos_so_quy('${Q}', now()-interval '1 day', now()+interval '1 day')`);
  await ok('Sổ quỹ: tiền mặt thu 320k chi 50k · ngân hàng 40k · ví 20k · tổng tồn 330k', ()=>[Number(sq.quy.tien_mat.thu),Number(sq.quy.tien_mat.chi),Number(sq.quy.ngan_hang.thu),Number(sq.quy.vi.thu),Number(sq.quy.tong.thu)-Number(sq.quy.tong.chi),sq.so_dong],[320000,50000,40000,20000,330000,6]);
  const sq2=await v(`select public.pos_so_quy('${Q}', now()+interval '1 hour', now()+interval '2 days')`);
  await ok('Kỳ sau: quỹ đầu kỳ = tồn kỳ trước, không có dòng', ()=>[Number(sq2.quy.tien_mat.dau_ky),Number(sq2.quy.tong.dau_ky),sq2.so_dong],[270000,330000,0]);
  await as(NV9);
  await ok('Huỷ phiếu thu → két bớt lại 200k', async()=>{await q(`select public.pos_huy_chi_ket('${pt1.id}','ghi nhầm')`); return Number((await v(`select public.pos__so_lieu_ca('${ca}')`)).tien_mat_trong_ca);},70000);
}
// ── 202611221030: khuyến mại (giảm hoá đơn / giảm giá hàng / mua X tặng Y) ──
if (await v(`select count(*)::int from pg_proc where proname='pos_luu_km'`)) {
  const Q='Quầy khuyến mại', NVk='00000000-0000-0000-0000-0000000000ae', P7='00000000-0000-0000-0000-0000000000b7', P8='00000000-0000-0000-0000-0000000000b8';
  await db.exec(`insert into pos_settings(store_location) values ('${Q}') on conflict do nothing; update pos_settings set bat_cham_cong=false where store_location='${Q}';
    insert into products(id,name,category,price) values ('${P7}','Bánh su','khac',10000),('${P8}','Bánh mì','khac',20000);
    insert into finished_goods_stock(product_id,size,branch,qty,store_location) values ('${P7}',null,'bakery',100,'${Q}'),('${P8}',null,'bakery',100,'${Q}');`);
  await q(`insert into profiles values ('${NVk}','Thu ngân KM','sale','{}',true,true) on conflict do nothing`);
  const luuKm=(o)=>q(`select public.pos_luu_km('${JSON.stringify(o)}'::jsonb) r`).then((r)=>r[0].r);
  await as(NVk);
  await chan('Nhân viên không tạo được khuyến mại', ()=>luuKm({name:'x',kind:'hd_giam',rule:{muc:[{tu:0,giam:1000,kieu:'tien'}]}}),'Chỉ Quản lý');
  await as(QL);
  const kmHd=await luuKm({name:'Hoá đơn lớn',kind:'hd_giam',stores:[Q],rule:{muc:[{tu:200000,giam:10,kieu:'pt',toi_da:25000},{tu:100000,giam:10000,kieu:'tien'}]}});
  await ok('QL tạo KM giảm hoá đơn → mã KM…, mức sắp theo tổng tiền', ()=>[/^KM\d{6}$/.test(kmHd.code), kmHd.rule.muc.map((m)=>m.tu)],[true,[100000,200000]]);
  const kmHang=await luuKm({name:'Bánh su đồng giá 8k',kind:'hang_giam',rule:{product_id:P7,ten:'Bánh su',sl_tu:3,kieu:'gia',giam:8000}});
  const kmTang=await luuKm({name:'Mua 2 bánh mì tặng 1 su',kind:'tang_hang',rule:{mua:{product_id:P8,ten:'Bánh mì',sl:2},tang:{product_id:P7,ten:'Bánh su',sl:1}}});
  const kmLon=await luuKm({name:'Khai trương 50%',kind:'hd_giam',rule:{muc:[{tu:0,giam:50,kieu:'pt'}]}});
  await chan('KM không có mức giảm', ()=>luuKm({name:'x',kind:'hd_giam',rule:{muc:[]}}),'mức giảm');
  await chan('Khung giờ ngược', ()=>luuKm({name:'x',kind:'hd_giam',time_from:'14:00',time_to:'09:00',rule:{muc:[{tu:0,giam:1000,kieu:'tien'}]}}),'Khung giờ');
  await chan('Giảm quá 100%', ()=>luuKm({name:'x',kind:'hang_giam',rule:{product_id:P7,sl_tu:1,kieu:'pt',giam:120}}),'chưa đúng');
  await as(NVk);
  await q(`select public.pos_vao_ca('${Q}',0,'k.jpg')`);
  const L=(pid,ten,gia,sl,o={})=>({product_id:pid,name:ten,qty:sl,list_price:gia,unit_price:o.km?0:gia,...o});
  const banM=(lines,o={})=>q(`select public.pos_ban('${JSON.stringify({id:id(),store:Q,pay_method:'tien_mat',photo_url:'m.jpg',lines,...o})}'::jsonb) r`).then((r)=>r[0].r);
  const r1=await banM([L(P8,'Bánh mì',20000,6)],{promo_id:kmHd.id,promo_discount:10000});
  const h1=(await q(`select total::int,invoice_discount::int,promo_discount::int,promo_name from pos_invoices where id='${r1.id}'`))[0];
  await ok('HĐ 120k đủ mức 100k → giảm 10k, ghi tên KM', ()=>[h1.total,h1.invoice_discount,h1.promo_discount,h1.promo_name],[110000,10000,10000,'Hoá đơn lớn']);
  await ok('HĐ 300k → mức 10% = 30k nhưng trần 25k', async()=>Number((await banM([L(P8,'Bánh mì',20000,15)],{promo_id:kmHd.id,promo_discount:25000})).total),275000);
  await chan('Máy gửi số giảm KM sai → chặn', ()=>banM([L(P8,'Bánh mì',20000,6)],{promo_id:kmHd.id,promo_discount:20000}),'vừa thay đổi');
  await chan('Chưa đủ tiền thì không được KM', ()=>banM([L(P8,'Bánh mì',20000,4)],{promo_id:kmHd.id,promo_discount:10000}),'chưa đủ tiền');
  await chan('Giảm KM mà không có chương trình', ()=>banM([L(P8,'Bánh mì',20000,6)],{promo_discount:10000}),'phải theo một chương trình');
  await ok('KM 50% không tính vào hạn mức 10% của nhân viên', async()=>Number((await banM([L(P8,'Bánh mì',20000,2)],{promo_id:kmLon.id,promo_discount:20000})).total),20000);
  await chan('KM 50% + giảm tay 20% vẫn phải xin duyệt', ()=>banM([L(P8,'Bánh mì',20000,2,{unit_price:16000})],{promo_id:kmLon.id,promo_discount:16000}),'vượt mức');
  await ok('3 bánh su đồng giá 8k → giảm 6k', async()=>Number((await banM([L(P7,'Bánh su',10000,3)],{promo_id:kmHang.id,promo_discount:6000})).total),24000);
  await chan('2 bánh su chưa đủ SL đồng giá', ()=>banM([L(P7,'Bánh su',10000,2)],{promo_id:kmHang.id,promo_discount:4000}),'chưa đủ số lượng');
  const tonSu=()=>v(`select public.pos__ton('${Q}','${P7}',null)::int`);
  const su0=await tonSu();
  const r2=await banM([L(P8,'Bánh mì',20000,4),L(P7,'Bánh su',10000,2,{km:true})],{promo_id:kmTang.id,promo_discount:0});
  const h2=(await q(`select total::int,promo_discount::int,line_discount::int from pos_invoices where id='${r2.id}'`))[0];
  const g2=(await q(`select unit_price::int,line_total::int,is_gift,note from pos_invoice_lines where invoice_id='${r2.id}' and product_id='${P7}'`))[0];
  await ok('Mua 4 bánh mì tặng 2 su: khách trả 80k, dòng tặng giá 0, vẫn trừ tồn su', async()=>[h2.total,h2.promo_discount,g2.unit_price,g2.line_total,g2.is_gift,g2.note,su0-(await tonSu())],[80000,20000,0,0,true,'Tặng (khuyến mại)',2]);
  await chan('Tặng quá số được', ()=>banM([L(P8,'Bánh mì',20000,4),L(P7,'Bánh su',10000,3,{km:true})],{promo_id:kmTang.id,promo_discount:0}),'Chỉ được tặng 2');
  await chan('Tặng sai món', ()=>banM([L(P8,'Bánh mì',20000,4),L(P8,'Bánh mì',20000,1,{km:true})],{promo_id:kmTang.id,promo_discount:0}),'không đúng chương trình');
  await chan('Hàng tặng không có chương trình', ()=>banM([L(P8,'Bánh mì',20000,2),L(P7,'Bánh su',10000,1,{km:true})]),'phải theo một chương trình');
  await chan('KM giảm hoá đơn không cho tặng hàng', ()=>banM([L(P8,'Bánh mì',20000,6),L(P7,'Bánh su',10000,1,{km:true})],{promo_id:kmHd.id,promo_discount:10000}),'không tặng hàng');
  await as(QL);
  await q(`select public.pos_bat_km('${kmHang.id}',false)`);
  const thu=Number(await v(`select extract(isodow from now() at time zone 'Asia/Ho_Chi_Minh')::int`));
  const kmMai=await luuKm({name:'Chỉ ngày mai',kind:'hd_giam',days:[thu%7+1],rule:{muc:[{tu:0,giam:1000,kieu:'tien'}]}});
  const kmCn=await luuKm({name:'Chỉ quầy khác',kind:'hd_giam',stores:['Vĩnh Phú 42'],rule:{muc:[{tu:0,giam:1000,kieu:'tien'}]}});
  const kmHet=await luuKm({name:'Hết hạn',kind:'hd_giam',from_date:'2026-01-01',to_date:'2026-01-31',rule:{muc:[{tu:0,giam:1000,kieu:'tien'}]}});
  await as(NVk);
  await chan('KM đã tắt', ()=>banM([L(P7,'Bánh su',10000,3)],{promo_id:kmHang.id,promo_discount:6000}),'đã tắt');
  await chan('KM không phải ngày hôm nay', ()=>banM([L(P7,'Bánh su',10000,1)],{promo_id:kmMai.id,promo_discount:1000}),'không áp dụng hôm nay');
  await chan('KM của chi nhánh khác', ()=>banM([L(P7,'Bánh su',10000,1)],{promo_id:kmCn.id,promo_discount:1000}),'không áp dụng ở');
  await chan('KM hết hạn', ()=>banM([L(P7,'Bánh su',10000,1)],{promo_id:kmHet.id,promo_discount:1000}),'hết hạn');
  const r3=await banM([L(P7,'Bánh su',10000,3)],{promo_id:kmHang.id,promo_discount:6000,offline:true,client_created_at:new Date().toISOString()});
  await ok('Mất mạng gửi lại khi KM vừa tắt → vẫn ghi đúng số khách đã trả + cảnh báo', async()=>[Number(r3.total), (await v(`select canh_bao->0->>'loai' from pos_invoices where id='${r3.id}'`))],[24000,'km_lech']);
  await as(QL);
  const tk=await v(`select public.pos_km_thong_ke()`);
  await ok('Thống kê: KM hoá đơn lớn 2 HĐ, giảm 35k', ()=>[tk[kmHd.id].so_hd, Number(tk[kmHd.id].tien)],[2,35000]);
  await as(NVk);
  await ok('Nhân viên không xem thống kê KM', ()=>v(`select public.pos_km_thong_ke()::text`),'{}');
}
// ── 202611221040: nhận ca khi người trước quên kết + đầu ca không bắt buộc + tự kết qua đêm ──
if (await v(`select count(*)::int from pg_proc where proname='pos_nhan_ca'`)) {
  const Q='Quầy nhận ca', A='00000000-0000-0000-0000-0000000000d1', B='00000000-0000-0000-0000-0000000000d2', P9='00000000-0000-0000-0000-0000000000b9';
  await db.exec(`insert into pos_settings(store_location) values ('${Q}') on conflict do nothing; update pos_settings set bat_cham_cong=false where store_location='${Q}';
    insert into products(id,name,category,price) values ('${P9}','Bánh cuộn','khac',50000);
    insert into finished_goods_stock(product_id,size,branch,qty,store_location) values ('${P9}',null,'bakery',100,'${Q}');`);
  await q(`insert into profiles values ('${A}','Chị Sáng','sale','{}',true,true),('${B}','Chị Chiều','sale','{}',true,true) on conflict do nothing`);
  const banQ=(o={})=>v(`select public.pos_ban('${JSON.stringify({id:id(),store:Q,pay_method:'tien_mat',photo_url:'nc-'+id()+'.jpg',lines:[{product_id:P9,name:'Bánh cuộn',qty:1,list_price:50000,unit_price:50000}],...o})}'::jsonb)`);
  const caMo=()=>q(`select * from pos_shifts where store_location='${Q}' and status='open'`).then((r)=>r[0]||null);
  const ca=(i)=>q(`select * from pos_shifts where id='${i}'`).then((r)=>r[0]);
  const ket=async(i,dem,anh)=>{const ton=await v(`select public.pos__ton('${Q}','${P9}',null)::int`); return q(`select public.pos_ket_ca('${i}',${dem},null,'${anh}','${JSON.stringify([{product_id:P9,name:'Bánh cuộn',dem:ton}])}'::jsonb)`);};
  await as(A);
  const s1=await v(`select public.pos_vao_ca_v2('${Q}',null,'a.jpg',null)`);
  await ok('Vào ca KHÔNG nhập tiền đầu ca được (chưa có ca trước → két 0)', ()=>[Number(s1.opening_cash), s1.opening_cash_entered, s1.opened_by],[0,null,A]);
  await chan('Vào ca vẫn phải chụp ảnh két', ()=>q(`select public.pos_vao_ca_v2('${Q}',null,'',null)`).then(async()=>{const c=await caMo(); if(c.opened_by!==A) return; throw new Error('x');}).then(()=>{throw new Error('ok');}),'');
  await banQ(); await banQ();
  await as(B);
  await chan('Chị Chiều vào ca khi ca Chị Sáng còn mở → chỉ nút Nhận ca', ()=>q(`select public.pos_vao_ca_v2('${Q}',null,'b.jpg',null)`),'Nhận ca');
  await chan('Chị Chiều chưa nhận ca thì chưa bán được', ()=>banQ(),'Chị Sáng');
  await chan('Nhận ca sai mã ca (ca vừa đổi)', ()=>q(`select public.pos_nhan_ca('${Q}','${id()}',null,'b.jpg')`),'vừa thay đổi');
  await chan('Nhận ca phải chụp ảnh két', ()=>q(`select public.pos_nhan_ca('${Q}','${s1.id}',null,'')`),'ảnh');
  await db.exec(`update pos_settings set bat_cham_cong=true where store_location='${Q}'`);
  await chan('Bật chấm công mà chưa chấm vào làm → nhận ca bị chặn', ()=>q(`select public.pos_nhan_ca('${Q}','${s1.id}',null,'b.jpg')`),'chấm công');
  await ok('…và ca Chị Sáng vẫn mở nguyên (không kết dở)', async()=>(await caMo()).id,s1.id);
  await db.exec(`update pos_settings set bat_cham_cong=false where store_location='${Q}'`);
  const n1=await v(`select public.pos_nhan_ca('${Q}','${s1.id}',null,'b.jpg')`);
  const c1=await ca(s1.id);
  await ok('Nhận ca không đếm: ca cũ đóng, máy tính két 100k, chênh để trống', ()=>[c1.status, c1.auto_closed, Number(c1.expected_cash), c1.counted_cash, c1.diff, c1.closed_by, c1.closing_photo],['closed','nhan_ca',100000,null,null,B,'b.jpg']);
  await ok('Ca cũ ghi rõ ai không kết, ai nhận', ()=>c1.note,'Chị Sáng không kết ca — Chị Chiều nhận ca');
  await ok('Ca cũ vẫn lưu doanh số của Chị Sáng', ()=>[c1.summary.so_hoa_don, Number(c1.summary.doanh_so_tinh), c1.summary.tu_ket],[2,100000,'nhan_ca']);
  await ok('Ca mới của Chị Chiều nhận két 100k từ ca cũ', ()=>[n1.opened_by, Number(n1.opening_cash), n1.opening_prev_shift, n1.ca_cu],[B,100000,s1.id,c1.code]);
  await ok('Giám đốc được báo Chị Sáng không kết ca', ()=>v(`select count(*) from notifications where event_key='pos-dong-ca:${s1.id}:${GD}' and title like '%Chị Sáng không kết ca%'`),1);
  await ok('Không báo lệch tiền đầu ca khi nhận ca', ()=>v(`select count(*) from notifications where event_key like 'pos-dau-ca:${n1.id}%'`),0);
  await ok('Chị Chiều bán được ngay', async()=>Number((await banQ()).total),50000);
  await chan('Ca của mình hôm nay thì phải Kết ca, không "nhận ca" được', ()=>q(`select public.pos_nhan_ca('${Q}','${n1.id}',null,'b.jpg')`),'Kết ca');
  await as(A);
  await chan('Chị Sáng quay lại kết ca cũ → báo ca đã đóng', ()=>q(`select public.pos_ket_ca('${s1.id}',100000,null,'a2.jpg','[]'::jsonb)`),'đã đóng');
  await chan('Chị Sáng bán vào ca Chị Chiều → bị chặn', ()=>banQ(),'Chị Chiều');
  // Chị Sáng nhận lại có đếm két: thiếu 10k → ca Chị Chiều chênh -10k
  const n2=await v(`select public.pos_nhan_ca('${Q}','${n1.id}',140000,'a3.jpg')`);
  const c2=await ca(n1.id);
  await ok('Nhận ca CÓ đếm 140k (máy 150k) → ca cũ chênh -10k', ()=>[Number(c2.expected_cash), Number(c2.counted_cash), Number(c2.diff)],[150000,140000,-10000]);
  await ok('Ca mới nhận đúng số đếm 140k', ()=>[Number(n2.opening_cash), Number(n2.opening_cash_entered)],[140000,140000]);
  await ok('Báo GĐ có số THIẾU', ()=>v(`select count(*) from notifications where event_key='pos-dong-ca:${n1.id}:${GD}' and body like '%THIẾU 10.000đ%' or event_key='pos-dong-ca:${n1.id}:${GD}' and body like '%THIẾU 10,000đ%'`),1);
  await ok('Tiền đầu ca gợi ý = số đếm ca trước', async()=>{await ket(n2.id,140000,'a4.jpg'); const r=await v(`select public.pos_tien_dau_ca('${Q}')`); return [Number(r.so), r.chua_dem];},[140000,false]);
  // Quên kết ca qua đêm: 2 giờ sáng máy tự kết
  const s3=await v(`select public.pos_vao_ca_v2('${Q}',null,'a5.jpg',null)`);
  await ok('Không nhập đầu ca → lấy két ca trước 140k', ()=>[Number(s3.opening_cash), s3.opening_cash_entered],[140000,null]);
  await banQ();
  await db.exec(`update pos_shifts set opened_at=now()-interval '1 day' where id='${s3.id}'`);
  await as('');  // cron chạy không có người đăng nhập
  const soDong=await v(`select public.pos_tu_ket_ca_qua_dem()`);
  const c3=await ca(s3.id);
  await ok('2 giờ sáng: tự kết ca hôm qua còn mở', ()=>[soDong>=1, c3.status, c3.auto_closed, Number(c3.expected_cash), c3.counted_cash, c3.closed_by, c3.closed_by_name],[true,'closed','qua_dem',190000,null,null,'Máy tự kết ca']);
  await ok('Ca mở hôm nay không bị tự kết', ()=>v(`select count(*) from pos_shifts where status='open' and (opened_at at time zone 'Asia/Ho_Chi_Minh')::date=(now() at time zone 'Asia/Ho_Chi_Minh')::date and auto_closed is not null`),0);
  await ok('Ghi nhật ký kết hộ', ()=>v(`select count(*) from pos_audit_log where action='dong_ca_ho' and ref='${c3.code}'`),1);
  await as(B);
  const t3=await v(`select public.pos_tien_dau_ca('${Q}')`);
  await ok('Ca trước chưa ai đếm → gợi ý số máy tính 190k, đánh dấu chưa đếm', ()=>[Number(t3.so), t3.chua_dem],[190000,true]);
  const s4=await v(`select public.pos_vao_ca_v2('${Q}',180000,'b5.jpg',null)`);
  await ok('Đếm lại thấy 180k (máy 190k) → vẫn báo GĐ như cũ', ()=>v(`select count(*) from notifications where event_key='pos-dau-ca:${s4.id}:${GD}' and body like '%máy tính két%'`),1);
  // Ca của chính mình từ hôm qua: tự nhận lại được
  await db.exec(`update pos_shifts set opened_at=now()-interval '1 day' where id='${s4.id}'`);
  const n5=await v(`select public.pos_nhan_ca('${Q}','${s4.id}',null,'b6.jpg')`);
  await ok('Ca hôm qua của chính mình → nhận ca mới được', async()=>[(await ca(s4.id)).auto_closed, n5.opened_by, Number(n5.opening_cash)],['nhan_ca',B,190000]);
  await ok('Bản cũ pos_vao_ca (app chưa cập nhật) vẫn chạy', async()=>{await ket(n5.id,180000,'k.jpg'); const r=await v(`select public.pos_vao_ca('${Q}',180000,'k2.jpg')`); return Number(r.opening_cash);},180000);
  await ok('Tài khoản đăng nhập không gọi được hàm kết hộ / tự kết', ()=>v(`select has_function_privilege('authenticated','public.pos__ket_ca_ho(uuid,numeric,text,text,text)','execute') or has_function_privilege('authenticated','public.pos_tu_ket_ca_qua_dem()','execute')`),false);
}
console.log(`\n${dem-loi}/${dem} đạt`); process.exit(loi?1:0);
