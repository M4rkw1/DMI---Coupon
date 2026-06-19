import { syncWeekLiveScores } from '../../lib/liveScores';
import { supabaseAdmin } from '../../lib/supabase';

const MINIMUM_INTERVAL_MS = 5 * 60 * 1000;

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).end();

  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) return res.status(200).json({ ok: true, skipped: true, reason: 'API key is not configured.' });

  try {
    const db = supabaseAdmin();
    const currentWeek = await db
      .from('coupon_weeks')
      .select('id')
      .eq('is_current', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (currentWeek.error) throw currentWeek.error;
    if (!currentWeek.data?.id) {
      return res.status(200).json({ ok: true, skipped: true, reason: 'No live coupon week.' });
    }

    const settingsResult = await db
      .from('coupon_settings')
      .select('*')
      .eq('week_id', currentWeek.data.id)
      .limit(1)
      .maybeSingle();

    if (settingsResult.error) throw settingsResult.error;
    const settings = settingsResult.data || {};
    if (settings.auto_live_scores !== true) {
      return res.status(200).json({ ok: true, skipped: true, reason: 'Automatic live scores are disabled.' });
    }

    const lastSync = settings.last_live_sync_at ? new Date(settings.last_live_sync_at).getTime() : 0;
    if (lastSync && Date.now() - lastSync < MINIMUM_INTERVAL_MS) {
      return res.status(200).json({ ok: true, skipped: true, reason: 'Automatic sync is rate limited.' });
    }

    const syncStartedAt = new Date().toISOString();
    const lockResult = await db
      .from('coupon_settings')
      .update({ last_live_sync_at: syncStartedAt })
      .eq('id', settings.id);
    if (lockResult.error) throw lockResult.error;

    const result = await syncWeekLiveScores(db, currentWeek.data.id, apiKey, { automatic: true });
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    if (/auto_live_scores|last_live_sync_at/i.test(error.message || '')) {
      return res.status(400).json({
        error: 'Automatic live-score database fields are missing. Run add_automatic_live_scores.sql in Supabase.',
      });
    }

    return res.status(500).json({ error: error.message });
  }
}
