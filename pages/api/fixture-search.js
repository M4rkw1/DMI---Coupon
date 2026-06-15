import { isAdmin } from '../../lib/supabase';
import { DMI_APPROVED_COMPETITIONS } from '../../lib/dmiCompetitions';

const API_FOOTBALL_BASE_URL = 'https://v3.football.api-sports.io';
const MAX_FIXTURE_SEARCH_DAYS = 7;

function normaliseText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function competitionTerms(competition) {
  return [competition.name, ...(competition.aliases || [])].map(normaliseText).filter(Boolean);
}

function matchesCompetition(item, competition) {
  const leagueName = normaliseText(item.league?.name);
  const country = normaliseText(item.country?.name || item.country || '');
  const terms = competitionTerms(competition);
  const countryMatches = !competition.country || country === normaliseText(competition.country);

  return countryMatches && terms.some(term => leagueName === term || leagueName.includes(term));
}

function apiFootballUrl(path, params) {
  return `${API_FOOTBALL_BASE_URL}${path}?${params}`;
}

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

function nextThursday(date) {
  const end = new Date(date);
  const daysUntilThursday = (4 - end.getUTCDay() + 7) % 7;
  end.setUTCDate(end.getUTCDate() + daysUntilThursday);
  return end;
}

function dateRange(from, to) {
  const start = new Date(`${normaliseApiDate(from)}T00:00:00Z`);
  const requestedEnd = to
    ? new Date(`${normaliseApiDate(to)}T00:00:00Z`)
    : new Date(start);
  const maxEnd = new Date(start);
  maxEnd.setUTCDate(maxEnd.getUTCDate() + MAX_FIXTURE_SEARCH_DAYS - 1);
  const couponEnd = nextThursday(start);
  const end = [requestedEnd, maxEnd, couponEnd].reduce(
    (earliest, date) => (date < earliest ? date : earliest),
    requestedEnd
  );

  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(requestedEnd.getTime()) ||
    Number.isNaN(end.getTime()) ||
    start > end
  ) {
    return [];
  }

  const dates = [];
  const cursor = new Date(start);

  while (cursor <= end && dates.length < MAX_FIXTURE_SEARCH_DAYS) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}

function apiErrorMessage(errors) {
  if (!errors) return '';
  if (typeof errors === 'string') return errors;
  if (Array.isArray(errors)) return errors.filter(Boolean).join(' ');
  if (typeof errors === 'object') {
    return Object.values(errors)
      .flat()
      .filter(Boolean)
      .join(' ');
  }

  return '';
}

function normaliseScore(value) {
  return value === null || value === undefined ? null : Number(value);
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
    priority: item.dmi_priority || 999,
    competition_group: item.dmi_group || '',
    status: item.fixture?.status?.short || 'NS',
    home_score: normaliseScore(item.goals?.home),
    away_score: normaliseScore(item.goals?.away),
    ht_home_score: normaliseScore(item.score?.halftime?.home),
    ht_away_score: normaliseScore(item.score?.halftime?.away),
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

  const response = await fetch(apiFootballUrl('/fixtures', params), {
    headers: {
      'x-apisports-key': apiKey,
    },
  });
  const json = await response.json().catch(() => ({}));
  const apiError = apiErrorMessage(json.errors);

  if (!response.ok || apiError) {
    throw new Error(apiError || json?.message || 'Fixture provider request failed.');
  }

  return Array.isArray(json.response) ? json.response : [];
}

async function fetchFixturesByDateRange({ apiKey, from, to }) {
  const dates = dateRange(from, to);

  if (!dates.length) {
    throw new Error('Choose a valid from and to date.');
  }

  const batches = await Promise.all(dates.map(date => fetchFixtures({ apiKey, date })));
  return {
    dates,
    fixtures: batches.flat(),
  };
}

async function fetchFixturesByDates({ apiKey, dates }) {
  const normalisedDates = [...new Set((dates || []).map(normaliseApiDate).filter(Boolean))];

  if (!normalisedDates.length) {
    throw new Error('Choose at least one fixture search date.');
  }

  const batches = await Promise.all(normalisedDates.map(date => fetchFixtures({ apiKey, date })));
  return {
    dates: normalisedDates,
    fixtures: batches.flat(),
  };
}

async function searchLeagues({ apiKey, name, season }) {
  const params = new URLSearchParams({ search: name });
  if (season) params.set('season', season);

  const response = await fetch(apiFootballUrl('/leagues', params), {
    headers: {
      'x-apisports-key': apiKey,
    },
  });
  const json = await response.json().catch(() => ({}));
  const apiError = apiErrorMessage(json.errors);

  if (!response.ok || apiError) {
    throw new Error(apiError || json?.message || `League search failed for "${name}".`);
  }

  return Array.isArray(json.response) ? json.response : [];
}

function leagueDescriptorsFromSearchResults(results, competition) {
  return results
    .filter(item => matchesCompetition(item, competition))
    .map(item => ({
      id: String(item.league?.id || ''),
      name: item.league?.name || competition.name,
      country: item.country?.name || competition.country || '',
      priority: competition.priority || 999,
      group: competition.group || competition.name,
      requested_name: competition.name,
    }))
    .filter(item => item.id);
}

async function resolveApprovedCompetitions({ apiKey, season, approvedCompetitions }) {
  const resolved = [];
  const unresolved = [];
  const selected = Array.isArray(approvedCompetitions)
    ? new Set(approvedCompetitions.map(item => String(item || '').trim()).filter(Boolean))
    : null;
  const competitions = selected
    ? DMI_APPROVED_COMPETITIONS.filter(competition => selected.has(competition.name))
    : DMI_APPROVED_COMPETITIONS;

  for (const competition of competitions) {
    const searches = [competition.name, ...(competition.aliases || [])];
    const results = [];

    for (const name of searches) {
      const matches = await searchLeagues({ apiKey, name, season });
      results.push(...matches);
    }

    const descriptors = leagueDescriptorsFromSearchResults(results, competition);

    if (descriptors.length) {
      resolved.push(...descriptors);
    } else {
      unresolved.push(competition.name);
    }
  }

  return { resolved: uniqueLeagueDescriptors(resolved), unresolved };
}

function uniqueLeagueDescriptors(descriptors) {
  const unique = new Map();

  descriptors.forEach(descriptor => {
    const current = unique.get(descriptor.id);
    if (!current || descriptor.priority < current.priority) {
      unique.set(descriptor.id, descriptor);
    }
  });

  return [...unique.values()].sort(
    (a, b) =>
      Number(a.priority || 999) - Number(b.priority || 999) ||
      String(a.country || '').localeCompare(String(b.country || '')) ||
      String(a.name || '').localeCompare(String(b.name || ''))
  );
}

async function resolveDirectLeagues({ apiKey, leagues, season }) {
  const tokens = String(leagues || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
    .map((value, index) => ({ value, priority: index + 1 }));

  const resolved = [];

  for (const token of tokens) {
    if (/^\d+$/.test(token.value)) {
      resolved.push({
        id: token.value,
        name: token.value,
        country: '',
        priority: token.priority,
        group: 'Direct league search',
        requested_name: token.value,
      });
      continue;
    }

    const matches = await searchLeagues({ apiKey, name: token.value, season });
    resolved.push(
      ...matches
        .map(item => ({
          id: String(item.league?.id || ''),
          name: item.league?.name || token.value,
          country: item.country?.name || '',
          priority: token.priority,
          group: 'Direct league search',
          requested_name: token.value,
        }))
        .filter(item => item.id)
    );
  }

  return uniqueLeagueDescriptors(resolved);
}

async function resolveLeagues({ apiKey, leagues, season, approvedCompetitions }) {
  if (String(leagues || '').trim()) {
    return {
      leagues: await resolveDirectLeagues({ apiKey, leagues, season }),
      unresolved: [],
      usingApprovedDefaults: false,
    };
  }

  const { resolved, unresolved } = await resolveApprovedCompetitions({
    apiKey,
    season,
    approvedCompetitions,
  });
  return {
    leagues: resolved,
    unresolved,
    usingApprovedDefaults: true,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!isAdmin(req)) return res.status(401).json({ error: 'Not authorised' });

  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) {
    return res.status(400).json({ error: 'Set API_FOOTBALL_KEY in Vercel to search fixtures.' });
  }

  try {
    const { from, to, dates, leagues, season, approved_competitions } = req.body || {};
    const exactDates = Array.isArray(dates)
      ? [...new Set(dates.map(normaliseApiDate).filter(Boolean))]
      : [];

    if (!from && !exactDates.length) {
      return res.status(400).json({ error: 'Choose a fixture search start date.' });
    }

    const searchDates = exactDates.length ? exactDates : dateRange(from, to);

    if (!searchDates.length) {
      return res.status(400).json({ error: 'Choose a valid fixture search start date.' });
    }

    const approvedCompetitionCount = Array.isArray(approved_competitions)
      ? approved_competitions.length
      : DMI_APPROVED_COMPETITIONS.length;
    const leagueResolution = await resolveLeagues({
      apiKey,
      leagues,
      season,
      approvedCompetitions: approved_competitions,
    });
    const leagueDescriptors = leagueResolution.leagues;

    if (leagueResolution.usingApprovedDefaults && !leagueDescriptors.length) {
      return res.status(200).json({
        fixtures: [],
        meta: {
          checked_dates: [],
          approved_defaults_used: true,
          approved_competitions_count: approvedCompetitionCount,
          resolved_league_ids: [],
          unresolved_competitions: leagueResolution.unresolved,
          raw_fixture_count: 0,
        },
      });
    }

    let checkedDates = searchDates;
    const batches = leagueDescriptors.length
      ? await Promise.all(
          leagueDescriptors.flatMap(league =>
            searchDates.map(async date => {
              const fixtures = await fetchFixtures({
                apiKey,
                date,
                league: league.id,
                season,
              });
              return fixtures.map(fixture => ({
                ...fixture,
                dmi_priority: league.priority,
                dmi_group: league.group,
              }));
            })
          )
        )
      : exactDates.length
        ? [await fetchFixturesByDates({ apiKey, dates: searchDates })]
        : [await fetchFixturesByDateRange({ apiKey, from, to })];
    const rawFixtures = batches.flatMap(batch => {
      if (Array.isArray(batch)) return batch;
      checkedDates = batch.dates || checkedDates;
      return batch.fixtures || [];
    });

    const unique = new Map();
    rawFixtures.forEach(item => {
      const mapped = mapFixture(item);
      if (mapped.api_fixture_id && mapped.home_team && mapped.away_team) {
        unique.set(mapped.api_fixture_id, mapped);
      }
    });

    const fixtures = [...unique.values()].sort(
      (a, b) =>
        Number(a.priority || 999) - Number(b.priority || 999) ||
        Number(a.kickoff_timestamp || 0) - Number(b.kickoff_timestamp || 0) ||
        String(a.home_team || '').localeCompare(String(b.home_team || ''))
    );

    res.status(200).json({
      fixtures,
      meta: {
        checked_dates: checkedDates,
        approved_defaults_used: leagueResolution.usingApprovedDefaults,
        approved_competitions_count: approvedCompetitionCount,
        resolved_league_ids: leagueDescriptors.map(league => league.id),
        unresolved_competitions: leagueResolution.unresolved,
        raw_fixture_count: rawFixtures.length,
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
