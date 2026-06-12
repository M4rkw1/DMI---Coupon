import { createClient } from '@supabase/supabase-js';

export function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) throw new Error('Missing Supabase env vars');

  return createClient(url, key, { auth: { persistSession: false } });
}

export function isAdmin(req) {
  const pass = req.headers['x-admin-pass'];
  return Boolean(process.env.ADMIN_PASS && pass === process.env.ADMIN_PASS);
}
