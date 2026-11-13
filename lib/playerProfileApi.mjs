import { accountFields, verifiedPlayer } from './playerIdentity.mjs';

export function createProfileHandler({ supabaseAdmin, isAdmin }) {
return async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST', 'PATCH'].includes(req.method)) return res.status(405).end();
  try {
    const db = supabaseAdmin();
    if (isAdmin(req)) {
      if (req.method === 'GET') {
        const page = Math.max(0, Math.min(10000, Number.parseInt(req.query.page, 10) || 0));
        const { data, error } = await db.from('player_profiles').select('user_id,name,department,phone').order('created_at').order('user_id').range(page * 50, page * 50 + 49);
        if (error) throw error;
        return res.json({ profiles: data });
      }
      if (req.method !== 'PATCH') return res.status(405).end();
      if (!/^[0-9a-f-]{36}$/i.test(req.body?.user_id || '')) return res.status(400).json({ error: 'Invalid player ID.' });
      const { data, error } = await db.from('player_profiles').update({ ...accountFields(req.body), updated_at: new Date().toISOString() }).eq('user_id', req.body.user_id).select('user_id,name,department,phone').maybeSingle();
      if (error) throw error;
      return data ? res.json({ profile: data }) : res.status(404).json({ error: 'Player not found.' });
    }
    const user = await verifiedPlayer(db, req.headers.authorization);
    if (!user) return res.status(401).json({ error: 'Please sign in.' });
    if (req.method === 'PATCH') return res.status(403).json({ error: 'Only an admin can change player details.' });
    if (req.method === 'POST') {
      // On concurrent/repeated setup, keep the first identity. Never upsert updates.
      const { error } = await db.from('player_profiles').insert({ user_id: user.id, ...accountFields(req.body) });
      if (error && error.code !== '23505') throw error;
    }
    const { data, error } = await db.from('player_profiles').select('name,department,phone').eq('user_id', user.id).maybeSingle();
    if (error) throw error;
    return res.json({ profile: data });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.status ? error.message : 'Unable to load or save player details. Please try again or contact the coupon admin.' });
  }
}

}
