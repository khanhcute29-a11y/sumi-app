// BÀI THỬ TẠM (không commit): chạy màn Bán tại quầy ở CHẾ ĐỘ THẬT trên database giả lập PGlite trong trình duyệt.
// Mọi supabase.rpc / supabase.from đều đi vào PGlite — không có gì ghi lên database thật.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { PGlite } from './pglite/index.js';
import { supabase } from '/src/lib/supabaseClient.js';
import BanHangQuay from '/src/components/mockups/BanHangQuay/BanHangQuay.jsx';
import { doiKhoThu } from '/src/components/mockups/BanHangQuay/posThat.js';

const NHUNG = {
  pos_invoices: { pos_invoice_lines: ['nhieu', 'invoice_id'] },
  pos_debt_entries: { customers: ['mot', 'customer_id'] },
  products: { product_variants: ['nhieu', 'product_id'] },
};
const doiGiaTri = (v, oid) => {
  if (v == null) return v;
  if (v instanceof Date) return oid === 1082 ? v.toISOString().slice(0, 10) : v.toISOString();
  if (oid === 1700 || oid === 20) return Number(v);
  return v;
};
const hangRa = (res) => res.rows.map((r) => Object.fromEntries(res.fields.map((f) => [f.name, doiGiaTri(r[f.name], f.dataTypeID)])));
const lit = (v) => (v === null ? 'null' : typeof v === 'number' ? String(v) : typeof v === 'boolean' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);

export async function chay({ vaiTro = 'sale', ten = 'Thu ngân thử' } = {}) {
  window.__ghiLog = [];
  doiKhoThu('bhq-thu-gia-lap'); // hàng đợi mất mạng riêng — không bao giờ để máy thật gửi lên database thật
  try { localStorage.setItem('bhq-in-tu-dong', '0'); } catch { /* */ }
  window.print = () => { window.__daIn = (window.__daIn || 0) + 1; };
  const that = { rpc: supabase.rpc.bind(supabase), from: supabase.from.bind(supabase) };
  const { data: s } = await supabase.auth.getSession();
  const uid = s.session.user.id;
  const sp = (await that.from('products').select('*, product_variants(*)').eq('active', true).limit(60)).data || [];
  const kh = (await that.from('customers').select('id,name,phone').eq('is_school', false).limit(50)).data || [];
  const db = new PGlite();
  await db.exec(await (await fetch('/.thu-that/stub.sql')).text());
  await db.exec(await (await fetch('/supabase/migrations/202611141000_ban_hang_quay_that.sql')).text());
  await db.exec(await (await fetch('/supabase/migrations/202611141010_ban_hang_quay_mat_mang_va_thu_don.sql')).text());
  await db.exec(await (await fetch('/supabase/migrations/202611141020_ban_hang_quay_giao_don_dat.sql')).text());
  await db.exec(`update feature_flags set enabled = true, rollout_percentage = 100 where key = 'pos_ban_hang_that';
    insert into profiles(id, full_name, role) values (${lit(uid)}, ${lit(ten)}, ${lit(vaiTro)}), ('00000000-0000-0000-0000-0000000000a2', 'Quản lý thử', 'admin');
    select set_config('test.uid', ${lit(uid)}, false);`);
  for (const p of sp) {
    await db.query('insert into products(id,name,category,price,active,created_at,photo_url) values ($1,$2,$3,$4,true,$5,$6)', [p.id, p.name, p.category, p.price || 0, p.created_at, p.photo_url]);
    for (const v of p.product_variants || []) await db.query('insert into product_variants(id,product_id,label,price) values ($1,$2,$3,$4)', [v.id, p.id, v.label, v.price || 0]);
  }
  for (const k of kh) await db.query('insert into customers(id,name,phone) values ($1,$2,$3)', [k.id, k.name, k.phone]);
  // Tồn: 10 món đầu có 8 cái ở quầy Vĩnh Phú 42 (món 1 hết hạn hôm qua, món 2 hết hạn hôm nay) + 30 cái ở bếp.
  let i = 0;
  for (const p of sp) {
    if (p.category === 'school') continue;
    const size = (p.product_variants || [])[0]?.label || null;
    await db.query(`insert into finished_goods_stock(product_id,size,branch,qty,store_location,expiry_date) values ($1,$2,'bakery',8,'Vĩnh Phú 42',$3),($1,$2,'bakery',30,null,null)`,
      [p.id, size, i === 0 ? new Date(Date.now() - 86400000).toISOString() : i === 1 ? new Date().toISOString() : null]);
    if (++i >= 10) break;
  }
  window.__db = db;

  supabase.rpc = async (ten2, thamSo = {}) => {
    const ks = Object.keys(thamSo || {});
    const sql = `select public.${ten2}(${ks.map((k) => `${k} => ${(() => { const v = thamSo[k]; return v != null && typeof v === 'object' ? `${lit(JSON.stringify(v))}::jsonb` : lit(v ?? null); })()}`).join(', ')}) as r`;
    window.__ghiLog.push(['rpc', ten2, thamSo]);
    if (window.__matMang) return { data: null, error: { message: 'TypeError: Failed to fetch' } }; // giả mất mạng
    try { const r = await db.query(sql); return { data: doiGiaTri(r.rows[0].r, r.fields[0].dataTypeID), error: null }; } catch (e) { return { data: null, error: { message: e.message } }; }
  };
  supabase.from = (bang) => {
    const st = { cot: '*', dk: [], xep: [], gh: null, mot: false };
    const b = {
      select(c) { st.cot = c || '*'; return b; },
      eq(c, v) { st.dk.push(`${c} = ${lit(v)}`); return b; }, neq(c, v) { st.dk.push(`${c} <> ${lit(v)}`); return b; },
      gte(c, v) { st.dk.push(`${c} >= ${lit(v)}`); return b; }, lte(c, v) { st.dk.push(`${c} <= ${lit(v)}`); return b; },
      gt(c, v) { st.dk.push(`${c} > ${lit(v)}`); return b; }, lt(c, v) { st.dk.push(`${c} < ${lit(v)}`); return b; },
      in(c, vs) { st.dk.push(`${c} in (${vs.map(lit).join(',') || 'null'})`); return b; },
      is(c, v) { st.dk.push(`${c} is ${v === null ? 'null' : v}`); return b; },
      not(c, op, v) { st.dk.push(`not (${c} ${op === 'is' ? 'is' : op === 'eq' ? '=' : op} ${v === null ? 'null' : lit(v)})`); return b; },
      or(str) { st.dk.push(`(${str.split(',').map((x) => { const [c, op, ...r] = x.split('.'); const v = r.join('.'); return op === 'is' ? `${c} is ${v}` : `${c} = ${lit(v)}`; }).join(' or ')})`); return b; },
      order(c, o = {}) { st.xep.push(`${c} ${o.ascending === false ? 'desc' : 'asc'}`); return b; },
      limit(n) { st.gh = n; return b; },
      maybeSingle() { st.mot = true; return b; }, single() { st.mot = true; return b; },
      insert() { throw new Error(`BÀI THỬ: ghi thẳng bảng ${bang} bị chặn`); }, update() { throw new Error(`BÀI THỬ: ghi thẳng bảng ${bang} bị chặn`); },
      upsert() { throw new Error(`BÀI THỬ: ghi thẳng bảng ${bang} bị chặn`); }, delete() { throw new Error(`BÀI THỬ: ghi thẳng bảng ${bang} bị chặn`); },
      then(ok, sai) { return chayQ().then(ok, sai); },
    };
    const chayQ = async () => {
      try {
        const phan = []; let d = 0; let cur = '';
        for (const ch of st.cot) { if (ch === '(') d++; if (ch === ')') d--; if (ch === ',' && !d) { phan.push(cur.trim()); cur = ''; } else cur += ch; }
        if (cur.trim()) phan.push(cur.trim());
        const nhung = phan.filter((x) => x.includes('(')); const thuong = phan.filter((x) => !x.includes('('));
        const sql = `select ${thuong.join(', ') || '*'} from public.${bang}${st.dk.length ? ` where ${st.dk.join(' and ')}` : ''}${st.xep.length ? ` order by ${st.xep.join(', ')}` : ''}${st.gh ? ` limit ${st.gh}` : ''}`;
        const rows = hangRa(await db.query(sql));
        for (const n of nhung) {
          const tenN = n.slice(0, n.indexOf('(')).trim(); const cotN = n.slice(n.indexOf('(') + 1, -1);
          const [kieu, khoa] = NHUNG[bang]?.[tenN] || [];
          for (const r of rows) {
            if (kieu === 'nhieu') r[tenN] = hangRa(await db.query(`select ${cotN} from public.${tenN} where ${khoa} = ${lit(r.id)}`));
            else if (kieu === 'mot') r[tenN] = r[khoa] ? hangRa(await db.query(`select ${cotN} from public.${tenN} where id = ${lit(r[khoa])}`))[0] || null : null;
          }
        }
        return { data: st.mot ? rows[0] || null : rows, error: null };
      } catch (e) { return { data: null, error: { message: e.message } }; }
    };
    return b;
  };
  supabase.storage.from = () => ({
    upload: async (path) => { window.__ghiLog.push(['upload', path]); return { data: { path }, error: null }; },
    createSignedUrl: async () => ({ data: { signedUrl: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2256%22 height=%2256%22%3E%3Crect width=%2256%22 height=%2256%22 fill=%22%23f9c6d3%22/%3E%3C/svg%3E' }, error: null }),
  });
  document.getElementById('root').style.display = 'none';
  let el = document.getElementById('thu-that');
  if (!el) { el = document.createElement('div'); el.id = 'thu-that'; document.body.appendChild(el); }
  createRoot(el).render(<BanHangQuay />);
  return { uid, soSp: sp.length, soKhach: kh.length };
}

export function troGiup() {
  window.__R = document.getElementById('thu-that');
  window.__go = (el, v) => { const d = Object.getOwnPropertyDescriptor(el.tagName === 'SELECT' ? HTMLSelectElement.prototype : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value'); d.set.call(el, v); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); };
  window.__bam = (txt, goc = window.__R) => { const b = [...goc.querySelectorAll('button')].find((x) => x.innerText.trim().replace(/\s+/g, ' ').includes(txt) && !x.disabled); if (!b) return `KHONG THAY: ${txt}`; b.click(); return 'ok'; };
  window.__cho = (ms = 600) => new Promise((r) => setTimeout(r, ms));
  window.__hop = () => window.__R.querySelector('.bhq-hop')?.innerText;
  window.__bao = () => window.__R.querySelector('.kv-bao')?.innerText;
  window.__q = async (sql) => (await window.__db.query(sql)).rows;
  window.__la = async (uid, sql) => { const cu = (await window.__q("select current_setting('test.uid') u"))[0].u; await window.__db.exec(`select set_config('test.uid','${uid}',false)`); try { return await window.__q(sql); } finally { await window.__db.exec(`select set_config('test.uid','${cu}',false)`); } };
}
