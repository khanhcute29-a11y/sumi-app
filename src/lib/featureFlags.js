import { supabase } from './supabaseClient';

const DEFAULT_FLAGS = Object.freeze({
  orders_v2_read: false,
  orders_v2_write: false,
  inventory_ledger_write: false,
  notifications_v2: false,
  school_lockdown: false,
  delivery_v2: false,
  kpi_v2: false,
});

let cache = { value: DEFAULT_FLAGS, expiresAt: 0 };

export async function loadFeatureFlags({ force = false } = {}) {
  if (!force && cache.expiresAt > Date.now()) return cache.value;
  const { data, error } = await supabase.from('feature_flags').select('key,enabled,rollout_percentage,allowed_profile_ids');
  if (error) return cache.value;
  const { data: { user } } = await supabase.auth.getUser();
  const flags = { ...DEFAULT_FLAGS };
  for (const row of data || []) {
    if (!(row.key in flags)) continue;
    flags[row.key] = Boolean(row.enabled && (row.rollout_percentage === 100 || row.allowed_profile_ids?.includes(user?.id)));
  }
  cache = { value: Object.freeze(flags), expiresAt: Date.now() + 30_000 };
  return cache.value;
}

export function clearFeatureFlagCache() {
  cache = { value: DEFAULT_FLAGS, expiresAt: 0 };
}

export async function listOrdersV2() {
  const { data, error } = await supabase.from('order_operations_list').select('*').order('required_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function createOrderV2(command) {
  const { data, error } = await supabase.rpc('create_order_v2', command);
  if (error) throw error;
  return data;
}

export async function assignOrderPackage(command) {
  const { data, error } = await supabase.rpc('assign_order_package', command);
  if (error) throw error;
  return data;
}

export async function acceptOrderPackage(command) {
  const { data, error } = await supabase.rpc('accept_order_package', command);
  if (error) throw error;
  return data;
}
