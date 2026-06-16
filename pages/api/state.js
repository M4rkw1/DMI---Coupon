import { supabaseAdmin, supabasePublic } from '../../lib/supabase';

function stateDb() {
  try {
    return supabaseAdmin();
  } catch {
    return supabasePublic();
  }
}

export default async function handler(req, res) {
  try {
    const db = stateDb();
    let { data: week, error: wErr } = await db
      .from('coupon_weeks')
      .select('*')
      .eq('is_current', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (wErr) throw wErr;

    if (!week?.id) {
      const latest = await db
        .from('coupon_weeks')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latest.error) throw latest.error;
      week = latest.data;
    }

    if (!week?.id) throw new Error('No current coupon week found');
    const weekId = week.id;
    const [fixtures, entries, settings, archives] = await Promise.all([
      db.from('fixtures').select('*').eq('week_id', weekId).order('sort_order'),
      db.from('entries').select('*').eq('week_id', weekId).order('created_at'),
      db.from('coupon_settings').select('*').eq('week_id', weekId).limit(1).maybeSingle(),
      db
        .from('coupon_archives')
        .select('id, week_title, week_subtitle, saved_as_historic, winner_name, winner_department, winner_points, leaderboard, created_at')
        .order('created_at', { ascending: false })
        .limit(12)
    ]);
    if (fixtures.error) throw fixtures.error;
    if (entries.error) throw entries.error;
    if (settings.error) throw settings.error;
    if (archives.error && !/coupon_archives/i.test(archives.error.message || '')) {
      throw archives.error;
    }
    res.status(200).json({
      week,
      fixtures: fixtures.data,
      entries: entries.data,
      settings: settings.data || { week_id: weekId },
      archives: archives.error ? [] : archives.data
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
