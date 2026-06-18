import { supabaseAdmin, isAdmin } from '../../lib/supabase';
import { syncWeekLiveScores } from '../../lib/liveScores';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!isAdmin(req)) return res.status(401).json({ error: 'Not authorised' });

  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) {
    return res.status(400).json({ error: 'Set API_FOOTBALL_KEY in Vercel to enable score sync.' });
  }

  const { week_id } = req.body || {};
  if (!week_id) return res.status(400).json({ error: 'Missing week id' });

  try {
    const result = await syncWeekLiveScores(supabaseAdmin(), week_id, apiKey);
    if (!result.requested) {
      return res.status(400).json({ error: 'Add API fixture IDs to fixtures before syncing live scores.' });
    }
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
