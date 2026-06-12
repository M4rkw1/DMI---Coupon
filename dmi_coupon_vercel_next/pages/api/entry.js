import { supabaseAdmin } from '../../lib/supabase';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const { week_id, name, department, predictions } = req.body;
    if (!week_id || !name || !predictions) return res.status(400).json({ error: 'Missing entry details' });
    const db = supabaseAdmin();
    const { data, error } = await db.from('entries').insert({
      week_id, name: name.trim(), department: (department || '').trim(), predictions, paid: false, payment_method: ''
    }).select().single();
    if (error) throw error;
    res.status(200).json({ entry: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
}
