import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { fetchFinishedGoodsStock, fetchFinishedGoodsStockInLog, fetchFinishedGoodsStockOutLog } from './queries';

// Hook riêng cho các màn hình KHÁC (vd. Boss Dashboard V3 của anh Khánh) cần
// hiển thị số liệu Kho Thành Phẩm mà không phải tự viết lại truy vấn hay
// đụng vào file trong phân hệ Kho — chỉ cần gọi useFinishedGoodsSummary().
//
// Trả về:
//   { totalQty, negativeCount, expiringSoonCount, todayIn, todayOut, loading, error }
// - expiringSoonCount: số dòng còn hạn dùng nhưng hết hạn trong vòng 24h.
// - todayIn/todayOut: tổng số lượng nhập/xuất trong ngày hôm nay (giờ VN).
export function useFinishedGoodsSummary() {
  const [state, setState] = useState({
    totalQty: 0, negativeCount: 0, expiringSoonCount: 0, todayIn: 0, todayOut: 0,
    loading: true, error: '',
  });

  const load = () => {
    Promise.all([fetchFinishedGoodsStock(), fetchFinishedGoodsStockInLog(200), fetchFinishedGoodsStockOutLog(200)])
      .then(([stock, inLog, outLog]) => {
        const now = Date.now();
        const in24h = now + 24 * 60 * 60 * 1000;
        const todayStr = new Date().toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
        const sumToday = (log) => log
          .filter((l) => new Date(l.created_at).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) === todayStr)
          .reduce((t, l) => t + (Number(l.qty) || 0), 0);
        setState({
          totalQty: stock.reduce((t, s) => t + (Number(s.qty) || 0), 0),
          negativeCount: stock.filter((s) => Number(s.qty) < 0).length,
          expiringSoonCount: stock.filter((s) => {
            if (!s.expiry_date) return false;
            const t = new Date(s.expiry_date).getTime();
            return t >= now && t <= in24h;
          }).length,
          todayIn: sumToday(inLog),
          todayOut: sumToday(outLog),
          loading: false, error: '',
        });
      })
      .catch((err) => setState((s) => ({ ...s, loading: false, error: err.message || 'Không tải được kho thành phẩm.' })));
  };

  useEffect(() => {
    load();
    const channel = supabase.channel('finished-goods-summary')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'finished_goods_stock' }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  return state;
}
