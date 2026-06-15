import { createClient } from '@supabase/supabase-js';

export function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!url) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL env var');
  if (!key) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY env var');

  return createClient(url, key, { auth: { persistSession: false } });
}

export function isAdmin(req) {
  const pass = req.headers['x-admin-pass'];
  return Boolean(process.env.ADMIN_PASS && pass === process.env.ADMIN_PASS);
}
