import { createClient } from '@supabase/supabase-js';
let client;
export const accountsEnabled = process.env.NEXT_PUBLIC_PLAYER_ACCOUNTS_ENABLED === 'true';
export function playerAuth() {
  if (!accountsEnabled) throw new Error('Player sign-in is not enabled yet. You can still enter as a guest.');
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error('Player sign-in is unavailable. Please contact the coupon admin.');
    client = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  }
  return client;
}
export async function playerToken() {
  const { data, error } = await playerAuth().auth.getSession();
  if (error) throw error;
  if (!data.session?.access_token) throw new Error('Your sign-in has expired. Please sign in again.');
  return data.session.access_token;
}
