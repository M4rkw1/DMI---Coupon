import { isAdmin } from '../../lib/supabase';

function formatUkKickoff(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '';

  const parts = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Europe/London',
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map(part => [part.type, part.value]));

  return `${byType.day}/${byType.month}/${byType.year} ${byType.hour}:${byType.minute}`;
}

function normaliseApiDate(value) {
  const raw = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (match) return `${match[3]}-${match[2]}-${match[1]}`;

  return raw;
}

function dateRange(from, to) {
  const start = new Date(`${normaliseApiDate(from)}T00:00:00Z`);
  const end = new Date(`${normaliseApiDate(to)}T00:00:00Z`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    return [];
  }

  const dates = [];
  const cursor = new Date(start);

  while (cursor <= end && dates.length < 21) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}

function mapFixture(item) {
  const league = item.league || {};

  return {
    api_fixture_id: String(item.fixture?.id || ''),
    home_team: item.teams?.home?.name || '',
    away_team: item.teams?.away?.name || '',
    home_badge: item.teams?.home?.logo || '',
    away_badge: item.teams?.away?.logo || '',
    kickoff: formatUkKickoff(item.fixture?.date),
    kickoff_timestamp: item.fixture?.timestamp || 0,
    league_id: league.id || '',
    league_name: league.name || '',
    country: league.country || '',
    season: league.season || '',
    status: item.fixture?.status?.short || 'NS',
  };
}

async function fetchFixtures({ apiKey, from, to, date, league, season }) {
  const params = new URLSearchParams();
  if (date) {
    params.set('date', normaliseApiDate(date));
  } else {
    params.set('from', normaliseApiDate(from));
    params.set('to', normaliseApiDate(to));
  }
  if (league) params.set('league', league);
  if (season) params.set('season', season);

  const response = await fetch(`https://v3.football.api-sports.io/fixtures?${params}`, {
    headers: {
      'x-apisports-key': apiKey,
    },
  });
  const json = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(json?.message || 'Fixture provider request failed.');
  }

  return Array.isArray(json.response) ? json.response : [];
}

async function fetchFixturesByDateRange({ apiKey, from, to }) {
  const dates = dateRange(from, to);

  if (!dates.length) {
    throw new Error('Choose a valid from and to date.');
  }

  const batches = await Promise.all(dates.map(date => fetchFixtures({ apiKey, date })));
  return batches.flat();
}

async function searchLeagues({ apiKey, name, season }) {
  const params = new URLSearchParams({ search: name });
  if (season) params.set('season', season);

  const response = await fetch(`https://v3.football.api-sports.io/leagues?${params}`, {
    headers: {
      'x-apisports-key': apiKey,
    },
  });
  const json = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(json?.message || `League search failed for "${name}".`);
  }

  return (json.response || [])
    .map(item => item.league?.id)
    .filter(Boolean)
    .map(String);
}

async function resolveLeagues({ apiKey, leagues, season }) {
  const tokens = String(leagues || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);

  const resolved = [];

  for (const token of tokens) {
    if (/^\d+$/.test(token)) {
      resolved.push(token);
      continue;
    }

    const matches = await searchLeagues({ apiKey, name: token, season });
    resolved.push(...matches);
  }

  return [...new Set(resolved)];
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!isAdmin(req)) return res.status(401).json({ error: 'Not authorised' });

  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) {
    return res.status(400).json({ error: 'Set API_FOOTBALL_KEY in Vercel to search fixtures.' });
  }

  try {
    const { from, to, leagues, season } = req.body || {};
    const leagueIds = await resolveLeagues({ apiKey, leagues, season });

    if (!from || !to) {
      return res.status(400).json({ error: 'Choose a from and to date.' });
    }

    const batches = leagueIds.length
      ? await Promise.all(
          leagueIds.map(league => fetchFixtures({ apiKey, from, to, league, season }))
        )
      : [await fetchFixturesByDateRange({ apiKey, from, to })];

    const unique = new Map();
    batches.flat().forEach(item => {
      const mapped = mapFixture(item);
      if (mapped.api_fixture_id && mapped.home_team && mapped.away_team) {
        unique.set(mapped.api_fixture_id, mapped);
      }
    });

    const fixtures = [...unique.values()].sort(
      (a, b) =>
        Number(a.kickoff_timestamp || 0) - Number(b.kickoff_timestamp || 0) ||
        String(a.home_team || '').localeCompare(String(b.home_team || ''))
    );

    res.status(200).json({ fixtures });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
