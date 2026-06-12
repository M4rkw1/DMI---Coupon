import { supabaseAdmin } from '../../lib/supabase';

export default async function handler(req, res) {
  try {
    const db = supabaseAdmin();
    const { data: week, error: wErr } = await db.from('coupon_weeks').select('*').eq('is_current', true).single();
    if (wErr) throw wErr;
    const weekId = week.id;
    const [fixtures, entries, settings] = await Promise.all([
      db.from('fixtures').select('*').eq('week_id', weekId).order('sort_order'),
      db.from('entries').select('*').eq('week_id', weekId).order('created_at'),
      db.from('coupon_settings').select('*').eq('week_id', weekId).single()
    ]);
    if (fixtures.error) throw fixtures.error;
    if (entries.error) throw entries.error;
    if (settings.error) throw settings.error;
    res.status(200).json({ week, fixtures: fixtures.data, entries: entries.data, settings: settings.data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
