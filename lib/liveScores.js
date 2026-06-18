const FINAL_STATUSES = new Set(['FT', 'AET', 'PEN', 'AWD', 'WO', 'CANC', 'ABD', 'PST']);

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

function parseKickoff(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;

  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/);
  if (match) {
    const [, day, month, year, hour, minute] = match.map(Number);
    const utcGuess = Date.UTC(year, month - 1, day, hour, minute);
    const timeZoneName = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London',
      timeZoneName: 'shortOffset',
    })
      .formatToParts(new Date(utcGuess))
      .find(part => part.type === 'timeZoneName')?.value || 'GMT';
    const offsetMatch = timeZoneName.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
    const offsetMinutes = offsetMatch
      ? (offsetMatch[1] === '+' ? 1 : -1) * (Number(offsetMatch[2]) * 60 + Number(offsetMatch[3] || 0))
      : 0;

    return new Date(utcGuess - offsetMinutes * 60 * 1000);
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function shouldAutoSync(fixture, now = new Date()) {
  const status = String(fixture.status || 'NS').toUpperCase();
  if (FINAL_STATUSES.has(status)) return false;
  if (!['NS', 'TBD'].includes(status)) return true;

  const kickoff = parseKickoff(fixture.kickoff);
  if (!kickoff) return false;

  const difference = kickoff.getTime() - now.getTime();
  return difference <= 15 * 60 * 1000 && difference >= -24 * 60 * 60 * 1000;
}

function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export async function syncWeekLiveScores(db, weekId, apiKey, { automatic = false } = {}) {
  const { data: allFixtures, error } = await db
    .from('fixtures')
    .select('id, api_fixture_id, kickoff, status')
    .eq('week_id', weekId)
    .not('api_fixture_id', 'is', null);

  if (error) throw error;

  const fixtures = (allFixtures || []).filter(fixture =>
    fixture.api_fixture_id && (!automatic || shouldAutoSync(fixture))
  );

  if (!fixtures.length) {
    return {
      updated: 0,
      requested: 0,
      reason: automatic ? 'No due or live fixtures need updating.' : 'No fixtures have API fixture IDs.',
    };
  }

  const updates = [];
  for (const fixtureBatch of chunk(fixtures, 20)) {
    const ids = fixtureBatch.map(fixture => fixture.api_fixture_id).filter(Boolean);
    const response = await fetch(
      `https://v3.football.api-sports.io/fixtures?ids=${encodeURIComponent(ids.join('-'))}`,
      { headers: { 'x-apisports-key': apiKey } }
    );
    const json = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(json?.message || 'Live score provider request failed.');
    }

    const providerErrors = json?.errors;
    if (
      (Array.isArray(providerErrors) && providerErrors.length) ||
      (providerErrors && typeof providerErrors === 'object' && Object.keys(providerErrors).length)
    ) {
      const message = Array.isArray(providerErrors)
        ? providerErrors.join(', ')
        : Object.values(providerErrors).join(', ');
      throw new Error(message || 'Live score provider returned an error.');
    }

    updates.push(...(json.response || []).map(mapApiFootballFixture));
  }

  const byApiId = new Map(updates.map(item => [item.api_fixture_id, item]));
  let updated = 0;

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

    if (updateError) throw updateError;
    updated += 1;
  }

  return { updated, requested: fixtures.length };
}
