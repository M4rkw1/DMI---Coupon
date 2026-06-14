import { supabaseAdmin, isAdmin } from '../../lib/supabase';

function normaliseScore(value) {
  return value === null || value === undefined ? null : Number(value);
}

function mapApiFootballFixture(item) {
  return {
    api_fixture_id: String(item.fixture?.id || ''),
    status: item.fixture?.status?.short || 'NS',
    home_score: normaliseScore(item.goals?.home),
    away_score: normaliseScore(item.goals?.away),
    ht_home_score: normaliseScore(item.score?.halftime?.home),
    ht_away_score: normaliseScore(item.score?.halftime?.away),
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!isAdmin(req)) return res.status(401).json({ error: 'Not authorised' });

  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) {
    return res.status(400).json({ error: 'Set API_FOOTBALL_KEY in Vercel to enable score sync.' });
  }

  const { week_id } = req.body || {};
  if (!week_id) return res.status(400).json({ error: 'Missing week id' });

  const db = supabaseAdmin();
  const { data: fixtures, error } = await db
    .from('fixtures')
    .select('id, api_fixture_id')
    .eq('week_id', week_id)
    .not('api_fixture_id', 'is', null);

  if (error) return res.status(500).json({ error: error.message });

  const ids = (fixtures || []).map(f => f.api_fixture_id).filter(Boolean);
  if (!ids.length) {
    return res.status(400).json({
      error: 'Add API fixture IDs to fixtures before syncing live scores.',
    });
  }

  const response = await fetch(
    `https://v3.football.api-sports.io/fixtures?ids=${encodeURIComponent(ids.join('-'))}`,
    {
      headers: {
        'x-apisports-key': apiKey,
      },
    }
  );
  const json = await response.json().catch(() => ({}));

  if (!response.ok) {
    return res.status(response.status).json({
      error: json?.message || 'Live score provider request failed.',
    });
  }

  const updates = (json.response || []).map(mapApiFootballFixture);
  const byApiId = new Map(updates.map(item => [item.api_fixture_id, item]));

  for (const fixture of fixtures) {
    const update = byApiId.get(String(fixture.api_fixture_id));
    if (!update) continue;

    const { error: updateError } = await db
      .from('fixtures')
      .update({
        status: update.status,
        home_score: update.home_score,
        away_score: update.away_score,
        ht_home_score: update.ht_home_score,
        ht_away_score: update.ht_away_score,
      })
      .eq('id', fixture.id);

    if (updateError) return res.status(500).json({ error: updateError.message });
  }

  res.status(200).json({ ok: true, updated: updates.length });
}
