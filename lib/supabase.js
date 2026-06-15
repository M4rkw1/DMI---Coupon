import { createClient } from '@supabase/supabase-js';

function supabaseUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
}

function supabaseAnonKey() {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
}

export function supabaseAdmin() {
  const url = supabaseUrl();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!url) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL env var');
  if (!key) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY env var');

  return createClient(url, key, { auth: { persistSession: false } });
}

export function supabasePublic() {
  const url = supabaseUrl();
  const key = supabaseAnonKey();

  if (!url) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL env var');
  if (!key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY env var');

  return createClient(url, key, { auth: { persistSession: false } });
}

export function isAdmin(req) {
  const pass = req.headers['x-admin-pass'];
  return Boolean(process.env.ADMIN_PASS && pass === process.env.ADMIN_PASS);
}
