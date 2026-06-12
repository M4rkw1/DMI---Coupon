import { supabaseAdmin, isAdmin } from '../../lib/supabase';

export default async function handler(req, res) {
  if (!isAdmin(req)) return res.status(401).json({ error: 'Not authorised' });
  const db = supabaseAdmin();
  try {
    const { action, payload } = req.body;
    if (action === 'saveSettings') {
      const { id, ...fields } = payload;
      const { error } = await db.from('coupon_settings').update(fields).eq('id', id);
      if (error) throw error;
    }
    if (action === 'saveWeek') {
      const { id, ...fields } = payload;
      const { error } = await db.from('coupon_weeks').update(fields).eq('id', id);
      if (error) throw error;
    }
    if (action === 'replaceFixtures') {
      const { week_id, fixtures } = payload;
      await db.from('fixtures').delete().eq('week_id', week_id);
      const rows = fixtures.map((f, i) => ({ ...f, week_id, sort_order: i + 1 }));
      const { error } = await db.from('fixtures').insert(rows);
      if (error) throw error;
    }
    if (action === 'setResults') {
      for (const f of payload.fixtures) {
        const { error } = await db.from('fixtures').update({ home_score: f.home_score, away_score: f.away_score, status: f.status || 'FT' }).eq('id', f.id);
        if (error) throw error;
      }
    }
    if (action === 'updateEntry') {
      const { id, ...fields } = payload;
      const { error } = await db.from('entries').update(fields).eq('id', id);
      if (error) throw error;
    }
    if (action === 'deleteEntry') {
      const { error } = await db.from('entries').delete().eq('id', payload.id);
      if (error) throw error;
    }
    if (action === 'importEntry') {
      const { error } = await db.from('entries').insert(payload);
      if (error) throw error;
    }
    res.status(200).json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
}
