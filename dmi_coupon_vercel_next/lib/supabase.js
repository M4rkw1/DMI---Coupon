import { createClient } from '@supabase/supabase-js';

export function supabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars');
  return createClient(url, key, { auth: { persistSession: false } });
}

export function isAdmin(req) {
  const pass = req.headers['x-admin-pass'];
  return Boolean(process.env.ADMIN_PASSCODE && pass === process.env.ADMIN_PASSCODE);
}
