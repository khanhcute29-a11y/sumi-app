import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured) {
  console.warn('Thiếu VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY trong .env — xem .env.example');
}

// Dùng placeholder hợp lệ khi chưa cấu hình để createClient() không crash cả app —
// mọi lời gọi auth/db thực tế vẫn sẽ báo lỗi rõ ràng cho tới khi .env được điền đúng.
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key'
);
