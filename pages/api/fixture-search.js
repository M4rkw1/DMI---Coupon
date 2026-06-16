import { isAdmin } from '../../lib/supabase';
import { DMI_APPROVED_COMPETITIONS } from '../../lib/dmiCompetitions';

const API_FOOTBALL_BASE_URL = 'https://v3.football.api-sports.io';
const FOOTBALL_DATA_BASE_URL = 'https://api.football-data.org/v4';
const MAX_FIXTURE_SEARCH_DAYS = 7;
const TEAM_NAME_ALIASES = new Map([
  ['ir iran', 'iran'],
  ['iran', 'iran'],
  ['turkiye', 'turkey'],
  ['turkey', 'turkey'],
  ['cabo verde', 'cape verde'],
  ['cape verde', 'cape verde'],
  ['ivory coast', 'ivory coast'],
  ['cote d ivoire', 'ivory coast'],
  ['cote divoire', 'ivory coast'],
  ['bosnia herzegovina', 'bosnia herzegovina'],
  ['bosnia and herzegovina', 'bosnia herzegovina'],
  ['dr congo', 'dr congo'],
  ['congo dr', 'dr congo'],
  ['democratic republic of congo', 'dr congo'],
  ['korea republic', 'south korea'],
  ['republic of korea', 'south korea'],
  ['south korea', 'south korea'],
  ['usa', 'usa'],
  ['united states', 'usa'],
  ['czechia', 'czech republic'],
  ['czech republic', 'czech republic'],
]);

function normaliseText(value) {
  const cleaned = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

  return TEAM_NAME_ALIASES.get(cleaned) || cleaned;
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

function footballDataUrl(path, params) {
  return `${FOOTBALL_DATA_BASE_URL}${path}?${params}`;
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

function teamBadgeMapFromFixtures(fixtures) {
  const badgeMap = {};

  fixtures.forEach(fixture => {
    if (fixture.home_team && fixture.home_badge) {
      badgeMap[normaliseText(fixture.home_team)] = fixture.home_badge;
    }
    if (fixture.away_team && fixture.away_badge) {
      badgeMap[normaliseText(fixture.away_team)] = fixture.away_badge;
    }
  });

  return badgeMap;
}

async function fetchFootballDataBadgeMap({ apiKey, from, to, teamNames = [] }) {
  if (!apiKey || !from || !to || !teamNames.length) {
    return {};
  }

  const params = new URLSearchParams({
    dateFrom: normaliseApiDate(from),
    dateTo: normaliseApiDate(to),
  });

  const response = await fetch(footballDataUrl('/matches', params), {
    headers: {
      'X-Auth-Token': apiKey,
    },
  });
  const json = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(json?.message || 'football-data.org badge lookup failed.');
  }

  const wanted = new Set(teamNames.map(normaliseText).filter(Boolean));
  const matches = Array.isArray(json.matches) ? json.matches : [];
  const badgeMap = {};

  matches.forEach(match => {
    const homeName = match?.homeTeam?.name || '';
    const awayName = match?.awayTeam?.name || '';
    const homeKey = normaliseText(homeName);
    const awayKey = normaliseText(awayName);
    const homeBadge = match?.homeTeam?.crest || '';
    const awayBadge = match?.awayTeam?.crest || '';

    if (homeKey && homeBadge && wanted.has(homeKey) && !badgeMap[homeKey]) {
      badgeMap[homeKey] = homeBadge;
    }

    if (awayKey && awayBadge && wanted.has(awayKey) && !badgeMap[awayKey]) {
      badgeMap[awayKey] = awayBadge;
    }
  });

  return badgeMap;
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

  const batches = await fetchFixtureDateBatches({ apiKey, dates });
  return {
    dates: batches.checkedDates,
    fixtures: batches.fixtures,
    blockedDates: batches.blockedDates,
  };
}

async function fetchFixturesByDates({ apiKey, dates }) {
  const normalisedDates = [...new Set((dates || []).map(normaliseApiDate).filter(Boolean))];

  if (!normalisedDates.length) {
    throw new Error('Choose at least one fixture search date.');
  }

  const batches = await fetchFixtureDateBatches({ apiKey, dates: normalisedDates });
  return {
    dates: batches.checkedDates,
    fixtures: batches.fixtures,
    blockedDates: batches.blockedDates,
  };
}

async function fetchFixtureDateBatches({ apiKey, dates }) {
  const settled = await Promise.all(
    dates.map(async date => {
      try {
        return {
          date,
          fixtures: await fetchFixtures({ apiKey, date }),
          error: '',
        };
      } catch (error) {
        return {
          date,
          fixtures: [],
          error: error.message || 'Fixture provider request failed.',
        };
      }
    })
  );

  const blockedDates = settled
    .filter(batch => batch.error)
    .map(batch => ({
      date: batch.date,
      error: batch.error,
    }));

  return {
    checkedDates: settled.map(batch => batch.date),
    fixtures: settled.flatMap(batch => batch.fixtures),
    blockedDates,
  };
}

async function fetchLeagueDateBatches({ apiKey, searchDates, leagueDescriptors, season }) {
  const settled = await Promise.all(
    leagueDescriptors.flatMap(league =>
      searchDates.map(async date => {
        try {
          const fixtures = await fetchFixtures({
            apiKey,
            date,
            league: league.id,
            season,
          });
          return {
            date,
            league,
            fixtures: fixtures.map(fixture => ({
              ...fixture,
              dmi_priority: league.priority,
              dmi_group: league.group,
            })),
            error: '',
          };
        } catch (error) {
          return {
            date,
            league,
            fixtures: [],
            error: error.message || 'Fixture provider request failed.',
          };
        }
      })
    )
  );

  const blockedDates = new Map();
  settled
    .filter(batch => batch.error)
    .forEach(batch => {
      if (!blockedDates.has(batch.date)) {
        blockedDates.set(batch.date, {
          date: batch.date,
          error: batch.error,
        });
      }
    });

  return {
    dates: searchDates,
    fixtures: settled.flatMap(batch => batch.fixtures),
    blockedDates: [...blockedDates.values()],
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
    const {
      from,
      to,
      dates,
      leagues,
      season,
      approved_competitions,
      all_fixtures_by_date,
      team_names,
    } = req.body || {};
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
    const searchAllFixturesByDate = Boolean(all_fixtures_by_date) && exactDates.length > 0;
    const leagueResolution = searchAllFixturesByDate
      ? {
          leagues: [],
          unresolved: [],
          usingApprovedDefaults: false,
        }
      : await resolveLeagues({
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
    const blockedDates = [];
    const batches = searchAllFixturesByDate
      ? [await fetchFixturesByDates({ apiKey, dates: searchDates })]
      : leagueDescriptors.length
      ? [await fetchLeagueDateBatches({ apiKey, searchDates, leagueDescriptors, season })]
      : exactDates.length
        ? [await fetchFixturesByDates({ apiKey, dates: searchDates })]
        : [await fetchFixturesByDateRange({ apiKey, from, to })];
    const rawFixtures = batches.flatMap(batch => {
      if (Array.isArray(batch)) return batch;
      checkedDates = batch.dates || checkedDates;
      (batch.blockedDates || []).forEach(entry => blockedDates.push(entry));
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
    const footballDataApiKey = process.env.FOOTBALL_DATA_API_KEY;
    const requestedTeamNames = Array.isArray(team_names)
      ? [...new Set(team_names.map(name => String(name || '').trim()).filter(Boolean))]
      : [];
    let teamBadges = teamBadgeMapFromFixtures(fixtures);
    let badgeProvider = Object.keys(teamBadges).length ? 'api-football' : '';
    let badgeProviderError = '';
    const missingTeamNames = requestedTeamNames.filter(name => !teamBadges[normaliseText(name)]);

    if (missingTeamNames.length && footballDataApiKey && checkedDates.length) {
      try {
        const footballDataBadges = await fetchFootballDataBadgeMap({
          apiKey: footballDataApiKey,
          from: checkedDates[0],
          to: checkedDates[checkedDates.length - 1],
          teamNames: missingTeamNames,
        });

        if (Object.keys(footballDataBadges).length) {
          teamBadges = {
            ...footballDataBadges,
            ...teamBadges,
          };
          badgeProvider = badgeProvider ? `${badgeProvider}, football-data.org` : 'football-data.org';
        }
      } catch (error) {
        badgeProviderError = error.message || 'football-data.org badge lookup failed.';
      }
    }

    res.status(200).json({
      fixtures,
      meta: {
        checked_dates: checkedDates,
        approved_defaults_used: leagueResolution.usingApprovedDefaults,
        approved_competitions_count: approvedCompetitionCount,
        resolved_league_ids: leagueDescriptors.map(league => league.id),
        unresolved_competitions: leagueResolution.unresolved,
        raw_fixture_count: rawFixtures.length,
        blocked_dates: blockedDates,
        team_badges: teamBadges,
        badge_provider: badgeProvider,
        badge_provider_error: badgeProviderError,
        search_mode: searchAllFixturesByDate ? 'all_fixtures_by_date' : 'league_filtered',
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
