import { isAdmin } from '../../lib/supabase';

export default function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!isAdmin(req)) {
    return res.status(401).json({ error: 'Not authorised' });
  }

  return res.status(200).json({ ok: true });
}
