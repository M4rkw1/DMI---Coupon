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
    const weeksResult = await db
      .from('coupon_weeks')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    if (weeksResult.error) throw weeksResult.error;

    const weeks = weeksResult.data || [];
    const week = weeks.find(item => item.is_current) || weeks[0];

    if (!week?.id) throw new Error('No current coupon week found');
    const weekId = week.id;
    const weekIds = weeks.map(item => item.id).filter(Boolean);
    const [allFixtures, allEntries, allSettings, archives] = await Promise.all([
      db.from('fixtures').select('*').in('week_id', weekIds.length ? weekIds : [weekId]).order('sort_order'),
      db.from('entries').select('*').in('week_id', weekIds.length ? weekIds : [weekId]).order('created_at'),
      db.from('coupon_settings').select('*').in('week_id', weekIds.length ? weekIds : [weekId]),
      db
        .from('coupon_archives')
        .select('id, week_title, week_subtitle, saved_as_historic, winner_name, winner_department, winner_points, leaderboard, created_at')
        .order('created_at', { ascending: false })
        .limit(100)
    ]);
    if (allFixtures.error) throw allFixtures.error;
    if (allEntries.error) throw allEntries.error;
    if (allSettings.error) throw allSettings.error;
    if (archives.error && !/coupon_archives/i.test(archives.error.message || '')) {
      throw archives.error;
    }

    const fixturesByWeek = (allFixtures.data || []).reduce((groups, fixture) => {
      const key = fixture.week_id;
      if (!groups[key]) groups[key] = [];
      groups[key].push(fixture);
      return groups;
    }, {});
    const entriesByWeek = (allEntries.data || []).reduce((groups, entry) => {
      const key = entry.week_id;
      if (!groups[key]) groups[key] = [];
      groups[key].push(entry);
      return groups;
    }, {});
    const settingsByWeek = (allSettings.data || []).reduce((groups, setting) => {
      if (setting.week_id && !groups[setting.week_id]) groups[setting.week_id] = setting;
      return groups;
    }, {});
    const now = new Date();
    const parseKickoff = kickoff => {
      const raw = String(kickoff || '').trim();
      if (!raw) return null;

      const [datePart, timePart] = raw.split(' ');
      if (datePart?.includes('/') && timePart) {
        const [day, month, year] = datePart.split('/').map(Number);
        const [hour, minute] = timePart.split(':').map(Number);
        if (day && month && year) return new Date(year, month - 1, day, hour || 0, minute || 0);
      }

      const parsed = new Date(raw);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    };
    const entryDeadlineFor = fixtures =>
      (fixtures || [])
        .map(fixture => parseKickoff(fixture.kickoff))
        .filter(Boolean)
        .sort((a, b) => a - b)[0] || null;
    const publishedWeeks = weeks.filter(item => item.is_published !== false);
    const openEntryWeek =
      publishedWeeks
        .map(item => {
          const weekFixtures = fixturesByWeek[item.id] || [];
          if (!weekFixtures.length) return null;
          const firstKickoff = entryDeadlineFor(weekFixtures);
          const entryCloses = firstKickoff ? new Date(firstKickoff.getTime() - 60 * 1000) : null;
          if (entryCloses && now >= entryCloses) return null;
          return { week: item, firstKickoff: firstKickoff?.getTime() || Number.MAX_SAFE_INTEGER };
        })
        .filter(Boolean)
        .sort((a, b) => a.firstKickoff - b.firstKickoff)[0]?.week || week;
    const entryWeekId = openEntryWeek.id || weekId;

    res.status(200).json({
      week,
      fixtures: fixturesByWeek[weekId] || [],
      entries: entriesByWeek[weekId] || [],
      settings: settingsByWeek[weekId] || { week_id: weekId },
      entryWeek: openEntryWeek,
      entryFixtures: fixturesByWeek[entryWeekId] || [],
      entrySettings: settingsByWeek[entryWeekId] || { week_id: entryWeekId },
      weeks,
      fixturesByWeek,
      entriesByWeek,
      settingsByWeek,
      archives: archives.error ? [] : archives.data
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
