import { supabase } from './supabaseClient';
import { newId } from './ids';
import { uploadPhoto } from './queries';

export async function fetchDebtBalances({ search } = {}) {
  let q = supabase.from('customer_debt_balances').select('*').order('balance', { ascending: false });
  if (search?.trim()) {
    const s = search.trim();
    q = q.or(`name.ilike.%${s}%,school_code.ilike.%${s}%,tax_code.ilike.%${s}%`);
  }
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function fetchDebtEntries(customerId) {
  const { data, error } = await supabase
    .from('customer_debt_entries')
    .select('*, orders(order_code)')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function recordDebtPayment({ customerId, amount, photoUrl, note }) {
  const { data, error } = await supabase.rpc('record_customer_debt_payment', {
    p_idempotency_key: newId(),
    p_customer_id: customerId,
    p_amount: amount,
    p_photo_url: photoUrl,
    p_note: note || null,
  });
  if (error) throw error;
  return data;
}

export async function uploadDebtPaymentPhoto(blob) {
  return uploadPhoto(blob, 'customer-debt');
}
