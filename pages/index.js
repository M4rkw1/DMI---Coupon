import AdminTabs from '../components/AdminTabs';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import FixtureImageExport from '../components/FixtureImageExport';
import { PlayerHeader, PlayerNavigation, PlayerHome, MatchList, usePlayerNavigation } from '../components/PlayerApp';
import { fixturePresentation, predictionPresentation } from '../lib/predictionPresentation.mjs';

const resultOf = (h, a) => (h > a ? 'H' : h < a ? 'A' : 'D');
const FINAL_STATUSES = new Set(['FT', 'AET', 'PEN']);
const hasScore = f =>
  f.home_score !== null &&
  f.home_score !== undefined &&
  f.away_score !== null &&
  f.away_score !== undefined;
const isFinishedFixture = f => hasScore(f) && FINAL_STATUSES.has(String(f.status || '').toUpperCase());

function points(pred, fix) {
  if (
    fix.home_score === null ||
    fix.away_score === null ||
    fix.home_score === undefined ||
    fix.away_score === undefined
  ) {
    return 0;
  }

  if (
    pred?.home === null ||
    pred?.away === null ||
    pred?.home === undefined ||
    pred?.away === undefined ||
    String(pred.home).trim() === '' ||
    String(pred.away).trim() === ''
  ) {
    return 0;
  }

  const ph = Number(pred?.home);
  const pa = Number(pred?.away);

  if (Number.isNaN(ph) || Number.isNaN(pa)) return 0;

  if (ph === Number(fix.home_score) && pa === Number(fix.away_score)) {
    return 3;
  }

  return resultOf(ph, pa) === resultOf(Number(fix.home_score), Number(fix.away_score))
    ? 1
    : 0;
}

const sym = c => ({ GBP: '£', USD: '$', EUR: '€' }[c] || `${c} `);
const CURRENCY_OPTIONS = ['GBP', 'USD', 'EUR'];
const leaderboardPosition = (entries, index) => {
  const current = entries[index];
  if (!current) return index + 1;

  const firstSameScoreIndex = entries.findIndex(entry => Number(entry.pts || 0) === Number(current.pts || 0));
  return firstSameScoreIndex >= 0 ? firstSameScoreIndex + 1 : index + 1;
};
const isMobileAppleDevice = () => {
  if (typeof navigator === 'undefined') return false;

  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
};
const saveGeneratedBlob = (blob, filename) => {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;

  const url = URL.createObjectURL(blob);

  if (isMobileAppleDevice()) {
    const opened = window.open(url, '_blank', 'noopener,noreferrer');

    if (!opened) {
      window.location.href = url;
    }

    window.setTimeout(() => URL.revokeObjectURL(url), 10 * 60 * 1000);
    return;
  }

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60 * 1000);
};
const canvasToBlob = (canvas, type = 'image/png', quality = 1) =>
  new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) {
        resolve(blob);
        return;
      }

      reject(new Error('Unable to create image file'));
    }, type, quality);
  });
const addDaysIsoDate = (value, days) => {
  if (!value) return '';

  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return '';

  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
};
const fixtureSearchDateRange = (from, days) => {
  const count = Math.max(1, Math.min(31, Number(days) || 1));
  return Array.from({ length: count }, (_, index) => addDaysIsoDate(from, index)).filter(Boolean);
};
const SAVED_API_LEAGUES_KEY = 'rigCouponSavedApiLeagues';
const isoWeekInfo = (input = new Date()) => {
  const date = new Date(Date.UTC(input.getFullYear(), input.getMonth(), input.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);

  return { year: date.getUTCFullYear(), week };
};
const weekDisplayName = week => {
  if (!week?.id) return 'No coupon week selected';

  const title = week.title || 'RIG Coupon';
  const bits = [];

  if (week.calendar_year && week.calendar_week) {
    bits.push(`${week.calendar_year} Week ${week.calendar_week}`);
  }

  if (week.is_current) bits.push('Live leaderboard');
  if (week.is_published === false) bits.push('Draft');

  return bits.length ? `${title} (${bits.join(' • ')})` : title;
};
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
const normaliseMatchText = value =>
  TEAM_NAME_ALIASES.get(
    String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
  ) ||
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
const fixtureMatchKey = fixture =>
  `${normaliseMatchText(fixture.home_team)}__${normaliseMatchText(fixture.away_team)}`;
const fixtureKickoffIsoDate = value => {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const uk = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (uk) return `${uk[3]}-${uk[2].padStart(2, '0')}-${uk[1].padStart(2, '0')}`;

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
};
const fixtureKickoffSortValue = value => {
  const raw = String(value || '').trim();
  if (!raw) return Number.POSITIVE_INFINITY;

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (iso) {
    return Date.UTC(
      Number(iso[1]),
      Number(iso[2]) - 1,
      Number(iso[3]),
      Number(iso[4] || 0),
      Number(iso[5] || 0)
    );
  }

  const uk = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[,\s]+(\d{1,2}):(\d{2}))?/);
  if (uk) {
    return Date.UTC(
      Number(uk[3]),
      Number(uk[2]) - 1,
      Number(uk[1]),
      Number(uk[4] || 0),
      Number(uk[5] || 0)
    );
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? Number.POSITIVE_INFINITY : parsed.getTime();
};
const sortFixturesChronologically = fixtures =>
  [...(fixtures || [])].sort((a, b) => {
    const timeDiff = fixtureKickoffSortValue(a.kickoff) - fixtureKickoffSortValue(b.kickoff);
    if (timeDiff) return timeDiff;
    return Number(a.sort_order || 0) - Number(b.sort_order || 0);
  });
const apiFixtureSelectionKey = fixture =>
  String(
    fixture.api_fixture_id ||
      `${fixture.league_id || fixture.league_name || 'other'}:${fixtureMatchKey(fixture)}:${
        fixtureKickoffIsoDate(fixture.kickoff) || fixture.kickoff || ''
      }`
  );
const fixturesToTsv = fixtures =>
  fixtures
    .map(fixture =>
      [
        fixture.home_team,
        fixture.away_team,
        fixture.kickoff || '',
        fixture.api_fixture_id || '',
        fixture.home_badge || '',
        fixture.away_badge || '',
      ].join('\t')
    )
    .join('\n');
const entriesToTsv = (entries, fixtures) =>
  entries
    .map(entry =>
      [
        entry.name || '',
        entry.department || '',
        ...fixtures.map(fixture => {
          const prediction = entry.predictions?.[fixture.id];
          const home = prediction?.home ?? '';
          const away = prediction?.away ?? '';
          return home === '' && away === '' ? '' : `${home}-${away}`;
        }),
        entry.paid ? 'PAID' : 'UNPAID',
        entry.payment_method || '',
        entry.pts ?? '',
      ].join('\t')
    )
    .join('\n');
const fixtureTeamNames = fixtures =>
  [...new Set(
    (fixtures || [])
      .flatMap(fixture => [fixture.home_team, fixture.away_team])
      .map(name => String(name || '').trim())
      .filter(Boolean)
  )];
const formatBlockedDateSummary = blockedDates => {
  const entries = Array.isArray(blockedDates) ? blockedDates.filter(entry => entry?.date) : [];
  if (!entries.length) return '';

  const uniqueDates = [...new Set(entries.map(entry => entry.date))];
  const sampleError = entries[0]?.error || 'API-Football blocked one or more dates.';
  return `${sampleError} Blocked date${uniqueDates.length === 1 ? '' : 's'}: ${uniqueDates.join(', ')}.`;
};
const formatCachedBadgeSummary = meta => {
  const teamCount = Number(meta?.cached_badges || 0);
  const countryCount = Number(meta?.cached_country_badges || 0);
  const parts = [];

  if (teamCount > 0) {
    parts.push(`${teamCount} team badge${teamCount === 1 ? '' : 's'} saved to badge cache.`);
  }

  if (countryCount > 0) {
    parts.push(`${countryCount} country badge${countryCount === 1 ? '' : 's'} saved to country cache.`);
  }

  return parts.join(' ');
};

const TIMEZONE_OPTIONS = [
  { label: 'UK time only', offset: 0 },
  { label: 'UK - 4 hours', offset: -240 },
  { label: 'UK - 3 hours', offset: -180 },
  { label: 'UK - 2 hours', offset: -120 },
  { label: 'UK - 1 hour', offset: -60 },
  { label: 'UK + 1 hour', offset: 60 },
  { label: 'UK + 2 hours', offset: 120 },
  { label: 'UK + 3 hours', offset: 180 },
  { label: 'UK + 4 hours', offset: 240 },
  { label: 'UK + 5 hours', offset: 300 },
  { label: 'UK + 6 hours', offset: 360 },
  { label: 'UK + 7 hours', offset: 420 },
  { label: 'UK + 8 hours', offset: 480 },
  { label: 'UK + 9 hours', offset: 540 },
  { label: 'UK + 10 hours', offset: 600 },
  { label: 'UK + 11 hours', offset: 660 },
  { label: 'UK + 12 hours', offset: 720 },
];

const UK_TIME_ZONE = 'Europe/London';
const getTimeZoneOffsetMs = (date, timeZone) => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const asUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second)
  );

  return asUtc - date.getTime();
};
const zonedTimeToUtc = ({ year, month, day, hour = 0, minute = 0 }, timeZone = UK_TIME_ZONE) => {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const firstPass = new Date(utcGuess.getTime() - getTimeZoneOffsetMs(utcGuess, timeZone));

  return new Date(utcGuess.getTime() - getTimeZoneOffsetMs(firstPass, timeZone));
};

const parseKickoff = kickoff => {
  if (!kickoff) return null;

  const value = String(kickoff).trim();
  const [datePart, timePart] = value.split(' ');

  if (datePart?.includes('/') && timePart) {
    const [day, month, year] = datePart.split('/').map(Number);
    const [hour, minute] = timePart.split(':').map(Number);

    if (day && month && year) {
      return zonedTimeToUtc({ year, month, day, hour: hour || 0, minute: minute || 0 });
    }
  }

  const iso = new Date(value);
  return Number.isNaN(iso.getTime()) ? null : iso;
};

const firstKickoffFor = fixtures =>
  fixtures
    .map(f => parseKickoff(f.kickoff))
    .filter(Boolean)
    .sort((a, b) => a - b)[0] || null;

const finalKickoffFor = fixtures =>
  fixtures
    .map(f => parseKickoff(f.kickoff))
    .filter(Boolean)
    .sort((a, b) => b - a)[0] || null;

const entryDeadlineFor = fixtures => {
  const firstKickoff = firstKickoffFor(fixtures);
  return firstKickoff ? new Date(firstKickoff.getTime() - 60 * 1000) : null;
};

const viewerTimeZone = () => {
  if (typeof Intl === 'undefined') return '';
  return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
};
const formatDateTime = (date, timeZone) =>
  date.toLocaleString('en-GB', {
    ...(timeZone ? { timeZone } : {}),
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
const formatViewerDateTime = date => {
  const zone = viewerTimeZone();
  const ukText = formatDateTime(date, UK_TIME_ZONE);

  if (!zone || zone === UK_TIME_ZONE) return `${ukText} (UK)`;

  return `${ukText} UK / ${formatDateTime(date, zone)} local`;
};

const formatArchiveDate = value => {
  const date = value ? new Date(value) : null;

  if (!date || Number.isNaN(date.getTime())) return '';

  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const DEFAULT_RULES_TEMPLATE = `Entry Fee: £10 / €10 / $10 per sheet.

1. Payment is preferred via Bank Transfer or Revolut.
2. Submit your predicted scores. One point is awarded for a correct result, and three points are awarded for a correct score.
3. In the event of a tie, the prize pool will be divided equally among the winners.
4. Abandoned or postponed matches will be voided and will not count toward your final score.
5. For cup matches, the score at the end of normal time (90 minutes plus stoppage time) will be used. Extra time will not be considered.
6. The winner takes all. The entire prize pool consists of the total entry fees collected.
7. If you are submitting an “Old School” entry, please hand in your completed sheet and entry fee to the Tech Office before the stated deadline. Alternatively, you can submit a photo of your sheet via email or WhatsApp.`;

const defaultSettings = overrides => ({
  currency: 'GBP',
  entry_fee: 10,
  rules: DEFAULT_RULES_TEMPLATE,
  entries_released: false,
  auto_live_scores: false,
  ...overrides,
});

const parseRulesText = value => {
  const text = String(value || DEFAULT_RULES_TEMPLATE).replace(/\r/g, '').trim();

  if (!text) return [];

  return text
    .replace(/\n(?=\d+[.)]\s*)/g, '\n\n')
    .split(/\n\s*\n/)
    .map(rule => rule.replace(/^\s*\d+[.)]\s*/, '').trim())
    .filter(Boolean);
};

const mergeWeekDraft = (current = {}, incoming = {}) => ({
  ...current,
  ...incoming,
  id: incoming?.id || current?.id || '',
  title:
    incoming && Object.prototype.hasOwnProperty.call(incoming, 'title')
      ? incoming.title || current?.title || ''
      : current?.title || '',
  subtitle:
    incoming && Object.prototype.hasOwnProperty.call(incoming, 'subtitle')
      ? incoming.subtitle ?? current?.subtitle ?? ''
      : current?.subtitle ?? '',
});

const mergeSettingsDraft = (current = {}, incoming = {}) =>
  defaultSettings({
    ...current,
    ...incoming,
    week_id: incoming?.week_id || current?.week_id || '',
  });

function TeamBadge({ src, name, className = '' }) {
  if (!src) return null;

  return (
    <img
      alt=""
      aria-hidden="true"
      className={`teamBadge ${className}`}
      crossOrigin="anonymous"
      referrerPolicy="no-referrer"
      src={src}
    />
  );
}

function TeamLabel({ name, badge, align = 'left' }) {
  return (
    <span className={`teamLabel ${align}`}>
      <TeamBadge src={badge} name={name} />
      <span>{name}</span>
    </span>
  );
}

const timezoneSelection = settings => {
  const offset = Number(settings?.timezone_offset_minutes || 0);
  const label = settings?.timezone_label || 'UK time only';
  return { offset, label, hasLocalTime: offset !== 0 };
};

const formatKickoff = (kickoff, settings = {}, selectedOnly = false) => {
  const ukDate = parseKickoff(kickoff);
  if (!ukDate) return 'TBC';

  const { offset, label, hasLocalTime } = timezoneSelection(settings);
  const localDate = new Date(ukDate.getTime() + offset * 60000);
  const automaticTime = formatViewerDateTime(ukDate);

  if (selectedOnly) {
    if (hasLocalTime) return `${formatDateTime(localDate)} (${label})`;
    return automaticTime;
  }

  if (hasLocalTime) {
    return `UK: ${formatDateTime(ukDate, UK_TIME_ZONE)} | ${label}: ${formatDateTime(localDate)}`;
  }

  return automaticTime;
};

export default function Home() {
  const navigation = usePlayerNavigation();
  const [state, setState] = useState(null);
  const [tab, setTab] = useState('home');
  const [admin, setAdmin] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [msg, setMsg] = useState('');
  const [now, setNow] = useState(new Date());
  const [form, setForm] = useState({ name: '', department: '', predictions: {} });
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const draftWeek = useRef(null);
  const submittingRef = useRef(false);
  const entryWeekId = state?.entryWeek?.id;
  useEffect(() => { if (msg) window.scrollTo({ top: 0 }); }, [msg]);

  function navigate(next) {
    setTab(next);
    setMsg('');
    window.location.hash = encodeURIComponent(next);
    window.scrollTo({ top: 0 });
  }
  useEffect(() => {
    const syncTab = () => {
      const allowed = ['home', 'enter coupon', 'leaderboard', 'historic winners', 'old school', 'admin'];
      let value = '';
      try { value = decodeURIComponent(window.location.hash.slice(1)); } catch {}
      setTab(allowed.includes(value) ? value : 'home');
    };
    syncTab();
    window.addEventListener('hashchange', syncTab);
    return () => window.removeEventListener('hashchange', syncTab);
  }, []);
  useEffect(() => {
    if (!entryWeekId) return;
    let draft = { name: '', department: '', predictions: {} };
    try {
      const stored = JSON.parse(localStorage.getItem(`rig-coupon-draft:${entryWeekId}`));
      if (stored && typeof stored.name === 'string' && stored.predictions && typeof stored.predictions === 'object') draft = { ...draft, ...stored };
    } catch {}
    draftWeek.current = entryWeekId;
    setForm(draft);
  }, [entryWeekId]);
  useEffect(() => {
    if (!entryWeekId || draftWeek.current !== entryWeekId) return;
    const timer = setTimeout(() => {
      try { localStorage.setItem(`rig-coupon-draft:${entryWeekId}`, JSON.stringify(form)); } catch {}
    }, 300);
    return () => clearTimeout(timer);
  }, [form, entryWeekId]);

  const imgRef = useRef(null);
  const unpaidImgRef = useRef(null);
  const entriesImgRef = useRef(null);

  const load = () =>
    fetch('/api/state')
      .then(async r => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || `State load failed (${r.status})`);
        return data;
      })
      .then(data => {
        setLoadError(false);
        setState({
          week: data?.week || {},
          fixtures: Array.isArray(data?.fixtures) ? data.fixtures : [],
          entries: Array.isArray(data?.entries) ? data.entries : [],
          settings: defaultSettings(data?.settings || {}),
          entryWeek: data?.entryWeek || data?.week || {},
          entryFixtures: Array.isArray(data?.entryFixtures) ? data.entryFixtures : Array.isArray(data?.fixtures) ? data.fixtures : [],
          entrySettings: defaultSettings(data?.entrySettings || data?.settings || {}),
          weeks: Array.isArray(data?.weeks) ? data.weeks : [],
          fixturesByWeek: data?.fixturesByWeek || {},
          entriesByWeek: data?.entriesByWeek || {},
          settingsByWeek: data?.settingsByWeek || {},
          archives: Array.isArray(data?.archives) ? data.archives : [],
        });
      })
      .catch(e => {
        setLoadError(true);
        setState(current => current || {
          week: { id: null, title: 'RIG Coupon', subtitle: '' },
          fixtures: [],
          entries: [],
          settings: defaultSettings(),
          entryWeek: { id: null, title: 'RIG Coupon', subtitle: '' },
          entryFixtures: [],
          entrySettings: defaultSettings(),
          weeks: [],
          fixturesByWeek: {},
          entriesByWeek: {},
          settingsByWeek: {},
          archives: [],
        });
      });

  useEffect(() => {
    load();

    const clockTimer = setInterval(() => setNow(new Date()), 1000);
    const dataTimer = setInterval(() => load(), 60000);

    return () => {
      clearInterval(clockTimer);
      clearInterval(dataTimer);
    };
  }, []);

  useEffect(() => {
    const weekId = state?.week?.id;
    const automaticScoresEnabled = state?.settings?.auto_live_scores === true;
    if (!weekId || !automaticScoresEnabled) return undefined;

    let cancelled = false;
    const syncScores = async () => {
      try {
        const response = await fetch('/api/auto-live-scores', { method: 'POST' });
        const result = await response.json().catch(() => ({}));
        if (!cancelled && response.ok && Number(result.updated || 0) > 0) load();
      } catch {
        // The normal state refresh will retry; live-score failures should not interrupt the page.
      }
    };

    syncScores();
    const timer = setInterval(syncScores, 60 * 1000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [state?.week?.id, state?.settings?.auto_live_scores]);

async function validateAdminPassword() {
    try {
      const res = await fetch('/api/validate-admin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-pass': admin,
        },
      });

      const j = await res.json().catch(() => ({}));

      if (!res.ok) {
        setIsAdmin(false);
        setMsg(j.error || 'Invalid admin password');
        return;
      }

      setIsAdmin(true);
      setMsg('Admin unlocked ✅');
    } catch {
      setIsAdmin(false);
      setMsg('Unable to validate admin password');
    }
  }

  const ranked = useMemo(() => {
    if (!state || !Array.isArray(state.entries) || !Array.isArray(state.fixtures)) {
      return [];
    }

    return [...state.entries]
      .map(e => ({
        ...e,
        pts: state.fixtures.reduce((s, f) => s + points(e.predictions?.[f.id], f), 0),
        exact: state.fixtures.filter(f => points(e.predictions?.[f.id], f) === 3).length,
      }))
      .sort(
        (a, b) =>
          b.pts - a.pts ||
          b.exact - a.exact ||
          String(a.name || '').localeCompare(String(b.name || ''))
      );
  }, [state]);

  if (!state) {
    return (
      <main className="wrap">
        <h1>The Rig Coupon</h1>
        <p role="status">Loading your coupon…</p>
      </main>
    );
  }

  const {
    week = {},
    fixtures = [],
    settings = {},
    entries = [],
    archives = [],
    entryWeek = week,
    entryFixtures = fixtures,
    entrySettings = settings,
  } = state || {};

  const maxPts = fixtures.length * 3;
  const stake = Number(settings?.entry_fee || 10);
  const pot = entries.length * stake;

  const entryDeadline = entryDeadlineFor(entryFixtures);
  const entryFinalFixture = finalKickoffFor(entryFixtures);
  const upcomingEntryWeeks = (state.weeks || [])
    .filter(item => item?.id && item.is_current !== true && item.is_published !== false)
    .map(item => {
      const weekFixtures = state.fixturesByWeek?.[item.id] || [];
      const weekEntries = state.entriesByWeek?.[item.id] || [];
      const deadline = entryDeadlineFor(weekFixtures);
      const finalFixture = finalKickoffFor(weekFixtures);

      return {
        week: item,
        fixtures: weekFixtures,
        entries: weekEntries,
        deadline,
        finalFixture,
      };
    })
    .filter(item => item.fixtures.length > 0 && (!item.deadline || now < item.deadline))
    .sort((a, b) => {
      const aTime = firstKickoffFor(a.fixtures)?.getTime() || Number.MAX_SAFE_INTEGER;
      const bTime = firstKickoffFor(b.fixtures)?.getTime() || Number.MAX_SAFE_INTEGER;
      return aTime - bTime;
    });

  const entriesOpen = entryFixtures.length > 0 && (entryDeadline ? now < entryDeadline : true);

  const countdownMs = entryDeadline ? entryDeadline.getTime() - now.getTime() : null;

  const countdownText =
    countdownMs && countdownMs > 0
      ? `${Math.floor(countdownMs / 86400000)}d ${Math.floor(
          (countdownMs % 86400000) / 3600000
        )}h ${Math.floor((countdownMs % 3600000) / 60000)}m ${Math.floor(
          (countdownMs % 60000) / 1000
        )}s`
      : null;
  
async function adminAction(action, payload) {
    const r = await fetch('/api/admin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-pass': admin,
      },
      body: JSON.stringify({ action, payload }),
    });

    const text = await r.text();
    let j = {};

    try {
      j = text ? JSON.parse(text) : {};
    } catch {
      j = { error: text };
    }

    if (!r.ok) {
      if (r.status === 401) {
        setIsAdmin(false);
        setAdmin('');
      }

      return setMsg(j.error || `Admin action failed (${r.status})`);
    }

    setMsg('Saved ✅');
    load();
  }

  async function submitEntry(e) {
    e.preventDefault();

    if (!entriesOpen) {
      return setMsg('Entries are now closed for this coupon');
    }

    if (submittingRef.current) return;
    if (!form.name.trim()) return setMsg('Please enter your name.');
    if (entryFixtures.some(f => ['home', 'away'].some(side => {
      const value = form.predictions[f.id]?.[side];
      return value === undefined || value === '' || !Number.isInteger(Number(value)) || Number(value) < 0 || Number(value) > 99;
    }))) return setMsg('Please enter a score from 0 to 99 for every team.');
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const r = await fetch('/api/entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, week_id: entryWeek.id }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Entry failed');
      try { localStorage.removeItem(`rig-coupon-draft:${entryWeek.id}`); } catch {}
      setForm({ name: '', department: '', predictions: {} });
      navigate('leaderboard');
      setMsg('Your coupon has been submitted. Good luck!');
      load();
    } catch (error) {
      setMsg(error.message || 'Unable to submit. Your predictions are still here; please try again.');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <div data-navigation={navigation.right ? 'right' : 'standard'} className={`appShell ${tab === 'admin' ? 'adminPage' : tab === 'old school' ? 'printPage' : 'playerApp'}`}>
      <PlayerHeader tab={tab} onNavigate={navigate} navigation={navigation} />
      <main className="wrap playerMain">
        {msg && <div className="msg" role="status">{msg}</div>}
        {loadError && <div className="playerLoadError" role="alert"><strong>Unable to refresh the coupon.</strong><p>{week.id ? 'Showing the last loaded scores. Please reconnect before submitting.' : 'Please check your connection and try again.'}</p><button onClick={load}>Try again</button></div>}
        {tab === 'leaderboard' && <WinnerBanner ranked={ranked} fixtures={fixtures} pot={pot} settings={settings} />}
        {tab === 'home' && <PlayerHome week={entryWeek} fixtures={entryFixtures} settings={entrySettings} ranked={ranked} liveWeek={week} entriesOpen={entriesOpen} deadline={entryDeadline} countdown={countdownText} archives={archives.filter(a => a.saved_as_historic)} onNavigate={navigate} formatKickoff={formatKickoff} formatDate={formatViewerDateTime} position={leaderboardPosition} />}

        {tab === 'old school' && (
          <OldSchool
            week={entryWeek}
            fixtures={entryFixtures}
            settings={entrySettings}
            maxPts={entryFixtures.length * 3}
            entryDeadline={entryDeadline}
          />
        )}

        {tab === 'enter coupon' && (
          <section className="card playerCoupon">
            <p className="playerEyebrow">{entryWeek.title || 'This week'}</p>
            {!entriesOpen ? (
              <>
                <h2>Entries Closed</h2>
                <p>Entries closed at {entryDeadline ? formatViewerDateTime(entryDeadline) : 'TBC'}</p>
                <p>{entryFixtures.length ? 'Follow the results as the matches unfold.' : 'The next coupon will appear here once published.'}</p><MatchList fixtures={entryFixtures} settings={entrySettings} formatKickoff={formatKickoff} />
              </>
            ) : (
              <>
                <div className="playerSectionHeading"><h1>My coupon</h1><span>{entryFixtures.filter(f => ['home', 'away'].every(side => form.predictions[f.id]?.[side] !== undefined && form.predictions[f.id]?.[side] !== '')).length} / {entryFixtures.length} picked</span></div>
                {entryDeadline && <p className="playerClosing">Closes {formatViewerDateTime(entryDeadline)} <strong>{countdownText}</strong></p>}

                <form onSubmit={submitEntry}>
                  <div className="grid2">
                    <input
                      required
                      placeholder="Your name"
                      aria-label="Your name"
                      autoComplete="name"
                      maxLength={100}
                      value={form.name}
                      onChange={e => setForm({ ...form, name: e.target.value })}
                    />

                    <input
                      placeholder="Department (optional)"
                      aria-label="Department (optional)"
                      maxLength={100}
                      value={form.department}
                      onChange={e => setForm({ ...form, department: e.target.value })}
                    />
                  </div>

                  <FixtureInputs
                    fixtures={entryFixtures}
                    predictions={form.predictions}
                    setPredictions={p => setForm({ ...form, predictions: p })}
                    settings={entrySettings}
                  />

                  {entryDeadline && <p>Entries close: {formatViewerDateTime(entryDeadline)}</p>}

                  <button type="submit" className="primary playerSubmit" disabled={!entriesOpen || submitting || loadError}>
                    {submitting ? 'Submitting…' : 'Submit predictions'}
                  </button><p className="playerSmallNote">Drafts stay on this device. Submit to enter the coupon.</p>
                </form>
              </>
            )}
          </section>
        )}

        {tab === 'leaderboard' && (
          <><div className="playerPageHeading"><p className="playerEyebrow">{week.title}</p><h1>Live table</h1><p>Scores refresh every minute.</p></div><Leaderboard
            ranked={ranked}
            fixtures={fixtures}
            settings={settings}
            maxPts={maxPts}
            pot={pot}
            upcomingEntryWeeks={upcomingEntryWeeks}
          /><section className="playerPanel"><div className="playerSectionHeading"><h2>Match scores</h2></div><MatchList fixtures={fixtures} settings={settings} formatKickoff={formatKickoff} /></section></>
        )}

        {tab === 'historic winners' && (
          <HistoricWinners archives={archives.filter(archive => archive.saved_as_historic)} />
        )}

        {tab === 'admin' && (
          <section className="card adminLock">
            <h2>Admin</h2>

            {!isAdmin ? (
              <div className="adminLogin">
                <p>Enter the admin password to unlock the control panel.</p>

                <input
                  type="password"
                  placeholder="Admin password"
                  value={admin}
                  onChange={e => setAdmin(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') validateAdminPassword();
                  }}
                />

                <button className="primary" onClick={validateAdminPassword}>
                  Unlock Admin
                </button>
              </div>
            ) : (
              <>
                <div className="adminBar">
                  <span>Admin unlocked ✅</span>
                  <button
                    onClick={() => {
                      setIsAdmin(false);
                      setAdmin('');
                      setMsg('Admin locked');
                    }}
                  >
                    Lock Admin
                  </button>
                </div>

                <Admin
                  state={state}
                  adminAction={adminAction}
                  setMsg={setMsg}
                  ranked={ranked}
                  pot={pot}
                  imgRef={imgRef}
                  unpaidImgRef={unpaidImgRef}
                  entriesImgRef={entriesImgRef}
                  admin={admin}
                  load={load}
                />
              </>
            )}
          </section>
        )}
      </main>
      <PlayerNavigation tab={tab} onNavigate={navigate} />
    </div>
  );
}

function FixtureInputs({ fixtures, predictions, setPredictions, settings = {} }) {
  return <div className="playerPredictionList">{fixtures.map(f => <div className="playerPrediction" key={f.id}>
    <div className="playerPredictionRow">
      <TeamLabel badge={f.home_badge} name={f.home_team} />
      <div className="playerScoreInputs">{['home', 'away'].map((side, i) => <Fragment key={side}>
        {i === 1 && <span aria-hidden="true">:</span>}
        <input aria-label={`${side === 'home' ? f.home_team : f.away_team} goals`} required type="number" inputMode="numeric" min="0" max="99" step="1" value={predictions[f.id]?.[side] ?? ''} onChange={e => setPredictions({ ...predictions, [f.id]: { ...(predictions[f.id] || {}), [side]: e.target.value } })} />
      </Fragment>)}</div>
      <TeamLabel badge={f.away_badge} name={f.away_team} align="right" />
    </div>
    <small>{f.kickoff ? formatKickoff(f.kickoff, settings) : 'Kick-off to be confirmed'}</small>
  </div>)}</div>;
}

function Leaderboard({ ranked, fixtures, settings = {}, maxPts, pot, upcomingEntryWeeks = [] }) {
  const [view, setView] = useState('leaderboard');

  const now = new Date();

  const entryDeadline = settings?.entry_deadline
  ? new Date(settings.entry_deadline)
  : null;

  const predictionsReleased =
    settings?.entries_released || (entryDeadline && now >= entryDeadline);

  const playersEntered = ranked.length;
  const fixturesThisWeek = fixtures.length;

  const gamesPlayed = fixtures.filter(
    f =>
      f.home_score !== null &&
      f.home_score !== undefined &&
      f.away_score !== null &&
      f.away_score !== undefined
  ).length;

  const unpaidPlayers = ranked.filter(e => !e.paid).length;
  const unpaidEntries = ranked.filter(e => !e.paid);
  const stake = Number(settings?.entry_fee || 10);
  const fullPot = playersEntered * stake;

  return (
    <section className="card">
      <h2>Leaderboard</h2>

      <div className="dashboardStats">
        <div className="statCard">
          <small>Players Entered</small>
          <strong>{playersEntered}</strong>
        </div>

        <div className="statCard">
          <small>Fixtures This Week</small>
          <strong>{fixturesThisWeek}</strong>
        </div>

        <div className="statCard">
          <small>Maximum Points</small>
          <strong>{maxPts}</strong>
        </div>

        <div className="statCard">
          <small>Games Played / To Play</small>
          <strong>
            {gamesPlayed} / {fixturesThisWeek}
          </strong>
        </div>

        <div className="statCard">
          <small>Players Yet To Pay</small>
          <strong>{unpaidPlayers}</strong>
        </div>

        <div className="statCard">
          <small>Pot Size</small>
          <strong>
            {sym(settings?.currency || 'USD')}
            {fullPot}
          </strong>
        </div>
      </div>

      <div className="tabs">
        <button
          className={view === 'leaderboard' ? 'on' : ''}
          onClick={() => setView('leaderboard')}
        >
          Leaderboard
        </button>

        <button
          className={view === 'predictions' ? 'on' : ''}
          onClick={() => setView('predictions')}
          disabled={!predictionsReleased}
        >
          All Predictions
        </button>

        <button
          className={view === 'unpaid' ? 'on' : ''}
          onClick={() => setView('unpaid')}
        >
          Yet To Pay
        </button>

        <button
          className={view === 'upcoming' ? 'on' : ''}
          onClick={() => setView('upcoming')}
        >
          Next Week Entries
        </button>
      </div>

      {view === 'leaderboard' && (
        <div className="leagueTableWrap">
          <table className="leagueTable">
            <thead>
              <tr>
                <th>Pos.</th>
                <th>Player</th>
                <th>Points</th>
              </tr>
            </thead>

            <tbody>
              {ranked.map((e, i) => (
                <tr key={e.id}>
                  <td>{leaderboardPosition(ranked, i)}</td>
                  <td>
                    {e.name} {e.department}
                  </td>
                  <td>
                    <b>{e.pts}</b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {view === 'predictions' && predictionsReleased && (
        <EntriesMatrix
          entries={ranked}
          fixtures={fixtures}
          settings={settings}
          maxPts={maxPts}
          pot={fullPot}
        />
      )}

      {view === 'unpaid' && (
        <div className="leagueTableWrap">
          <table className="leagueTable">
            <thead>
              <tr>
                <th>Pos.</th>
                <th>Player</th>
                <th>Department</th>
                <th>Entry Fee</th>
                <th>Status</th>
              </tr>
            </thead>

            <tbody>
              {unpaidEntries.length ? (
                unpaidEntries.map((entry, index) => (
                  <tr key={entry.id}>
                    <td>{index + 1}</td>
                    <td>{entry.name}</td>
                    <td>{entry.department || '-'}</td>
                    <td>
                      {sym(settings?.currency || 'USD')}
                      {stake}
                    </td>
                    <td>Unpaid</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5">Everyone is marked as paid.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {view === 'upcoming' && (
        <div className="leagueTableWrap">
          <table className="leagueTable">
            <thead>
              <tr>
                <th>Coupon / Week</th>
                <th>Entered Names</th>
              </tr>
            </thead>

            <tbody>
              {upcomingEntryWeeks.length ? (
                upcomingEntryWeeks.map(item => (
                  <tr key={item.week.id}>
                    <td>
                      <b>{weekDisplayName(item.week)}</b>
                      <small>
                        {item.entries.length} entered
                      </small>
                    </td>
                    <td>
                      {item.entries.length
                        ? item.entries.map(entry => entry.department ? `${entry.name} (${entry.department})` : entry.name).join(', ')
                        : 'No entries yet'}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="2">No open future coupon entries yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {view === 'predictions' && !predictionsReleased && (
        <p>All predictions will be shown here once entries are released.</p>
      )}
    </section>
  );
}

function EntriesMatrix({ entries, fixtures, settings = {}, maxPts, pot }) {
  const stake = Number(settings?.entry_fee || 10);
  const prizeFund = entries.length * stake;

  return (
    <section className="scoreGrid" aria-labelledby="score-grid-heading">
      <div className="scoreGridHeading">
        <div>
          <h3 id="score-grid-heading">Everyone’s predictions</h3>
          <p>Actual scores above · everyone’s picks below</p>
        </div>
        <span>{fixtures.length} fixtures · {entries.length} players</span>
      </div>
      <p className="scoreGridHint" id="score-grid-hint">Scroll across for more matches. Player names stay visible. Points during matches are provisional.</p>
      {!fixtures.length ? <p className="playerEmpty">No fixtures published yet.</p> : (
        <div className="scoreGridScroll" role="region" aria-label="All predictions" aria-describedby="score-grid-hint" tabIndex={0}>
          <table className="scoreGridTable" aria-label="Player predictions compared with actual scores" style={{ '--fixture-count': fixtures.length }}>
            <colgroup><col className="scoreGridNameCol" />{fixtures.map(f => <col key={f.id} className="scoreGridMatchCol" />)}</colgroup>
            <thead>
              <tr>
                <th scope="col" className="scoreGridName"><span>Player</span><small>Prediction / points</small></th>
                {fixtures.map(f => {
                  const actual = fixturePresentation(f);
                  return (
                    <th key={f.id} scope="col">
                      <span className="scoreGridFixture"><span>{f.home_team}</span><em>v</em><span>{f.away_team}</span></span>
                      <div className="scoreGridActual">
                        <span className="scoreGridScoreLabel">{actual.scoreLabel}</span>
                        <strong>{actual.score}</strong>
                        <small>{actual.status}</small>
                        {actual.result && <small>{actual.result}{actual.halfTime ? ` · ${actual.halfTime}` : ''}</small>}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {entries.length ? entries.map(entry => (
                <tr key={entry.id}>
                  <th scope="row" className="scoreGridName">
                    <span>{entry.name}</span>
                    {entry.department && <small>{entry.department}</small>}
                    <b>{entry.pts ?? 0} pts</b>
                  </th>
                  {fixtures.map(f => {
                    const prediction = entry.predictions?.[f.id];
                    const display = predictionPresentation(prediction, f, points(prediction, f));
                    return <td key={f.id}><span className={`scoreGridPick ${display.kind}`}><strong>{display.score}</strong><small>{display.label}</small></span></td>;
                  })}
                </tr>
              )) : <tr><td colSpan={fixtures.length + 1}>No entries to show yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      <div className="scoreGridLegend" aria-label="Scoring key">
        <span><i className="exact" aria-hidden="true" />Exact score · 3 pts</span>
        <span><i className="result" aria-hidden="true" />Correct result · 1 pt</span>
        <span><i className="miss" aria-hidden="true" />Miss · 0 pts</span>
        <span><i className="pending" aria-hidden="true" />Awaiting score</span>
      </div>
      <div className="scoreGridFooter"><span>Maximum: <b>{maxPts} points</b></span><span>Prize fund: <b>{sym(settings?.currency || 'USD')}{prizeFund}</b></span></div>
    </section>
  );
}

function EntriesMatrixExport({ entries, fixtures, settings = {}, week = {} }) {
  return (
    <div className="entriesMatrixExport">
      <div className="entriesExportHeader">
        <div>
          <span>RIG Football Coupon</span>
          <h2>{week.title || 'Released Entries'}</h2>
          {week.subtitle && <p>{week.subtitle}</p>}
        </div>
        <strong>
          {entries.length} player{entries.length === 1 ? '' : 's'}
        </strong>
      </div>

      <table className="entriesExportTable">
        <thead>
          <tr>
            <th>Player</th>
            {fixtures.map(f => (
              <th key={f.id}>
                {f.home_team} v {f.away_team}
              </th>
            ))}
            <th>Pts</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(entry => (
            <tr key={entry.id}>
              <td>
                <strong>{entry.name}</strong>
                {entry.department && <small>{entry.department}</small>}
              </td>
              {fixtures.map(f => {
                const pts = points(entry.predictions?.[f.id], f);
                const className = pts === 3 ? 'exactScore' : pts === 1 ? 'correctResult' : '';
                return (
                  <td className={className} key={f.id}>
                    {entry.predictions?.[f.id]?.home ?? ''}-{entry.predictions?.[f.id]?.away ?? ''}
                  </td>
                );
              })}
              <td>
                <b>{entry.pts}</b>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="entriesExportLegend">
        <span className="correctResult">1 point correct result</span>
        <span className="exactScore">3 points exact score</span>
      </div>
    </div>
  );
}

function WinnerBanner({ ranked = [], fixtures = [], pot = 0, settings = {} }) {
  const completedFixtures = fixtures.filter(isFinishedFixture).length;
  const allGamesFinished = fixtures.length > 0 && completedFixtures === fixtures.length;
  const leader = ranked[0];

  if (!allGamesFinished || !leader) return null;

  const winners = ranked.filter(entry => entry.pts === leader.pts);
  const prize = `${sym(settings?.currency || 'GBP')}${pot}`;

  return (
    <section className="winnerBanner" aria-live="polite">
      <div>
        <span className="winnerLabel">Winner Confirmed</span>
        <h2>
          {winners.length === 1
            ? leader.name
            : `${winners.length} players tied at the top`}
        </h2>
        {winners.length === 1 && leader.department && <p>{leader.department}</p>}
        {winners.length > 1 && (
          <p>{winners.map(entry => entry.name).join(', ')}</p>
        )}
      </div>

      <div className="winnerBannerStats">
        <span>
          <b>{leader.pts}</b>
          points
        </span>
        <span>
          <b>{leader.exact}</b>
          exact scores
        </span>
        <span>
          <b>{prize}</b>
          prize pot
        </span>
      </div>
    </section>
  );
}

function OldSchool({ week, fixtures, settings = {}, maxPts, entryDeadline, buttonOnly = false }) {
  const [scoreDrafts, setScoreDrafts] = useState({});
  const [entrantName, setEntrantName] = useState('');
  const [entrantDepartment, setEntrantDepartment] = useState('');
  const [pdfDownloading, setPdfDownloading] = useState(false);
  const rules = parseRulesText(settings?.rules);
  const fixtureCount = fixtures.length || 1;
  const fixturePrintFont =
    fixtureCount > 28 ? '7px' :
    fixtureCount > 24 ? '7.8px' :
    fixtureCount > 20 ? '8.8px' :
    fixtureCount > 14 ? '9.6px' :
    '10.5px';
  const fixtureBadgeSize =
    fixtureCount > 28 ? '3mm' :
    fixtureCount > 24 ? '3.3mm' :
    fixtureCount > 20 ? '3.8mm' :
    fixtureCount > 14 ? '4.2mm' :
    '4.8mm';
  const fixtureScoreBoxWidth =
    fixtureCount > 28 ? '12mm' :
    fixtureCount > 24 ? '13mm' :
    fixtureCount > 20 ? '15mm' :
    '16mm';
  const fixtureScoreBoxHeight =
    fixtureCount > 28 ? '3.6mm' :
    fixtureCount > 24 ? '4mm' :
    fixtureCount > 20 ? '4.5mm' :
    '5mm';
  const entryFee = `${sym(settings?.currency || 'GBP')}${settings?.entry_fee || 10}`;
  const deadlineText = entryDeadline ? formatViewerDateTime(entryDeadline) : 'TBC';
  const sheetRules = rules.length ? rules : parseRulesText(DEFAULT_RULES_TEMPLATE);
  const printFileTitle = String(week?.title || 'RIG Football Coupon')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ');

  const updateScoreDraft = (fixtureId, side, value) => {
    const score = String(value || '').replace(/\D/g, '').slice(0, 2);
    setScoreDrafts(current => ({
      ...current,
      [fixtureId]: {
        ...(current[fixtureId] || {}),
        [side]: score,
      },
    }));
  };

  const downloadFillablePdf = async () => {
    setPdfDownloading(true);

    try {
      const response = await fetch('/api/old-school-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          week_id: week.id,
          scores: scoreDrafts,
          name: entrantName,
          department: entrantDepartment,
          deadline: deadlineText,
          entry_fee: entryFee,
          rules: sheetRules,
        }),
      });

      if (!response.ok) {
        let errorMessage = 'Unable to create fillable PDF';

        try {
          const error = await response.json();
          errorMessage = error.error || errorMessage;
        } catch {
          errorMessage = await response.text();
        }

        throw new Error(errorMessage);
      }

      const blob = await response.blob();
      saveGeneratedBlob(blob, `${printFileTitle || 'RIG Football Coupon'} Fillable.pdf`);
    } catch (error) {
      window.alert(error.message || 'Unable to create fillable PDF');
    } finally {
      setPdfDownloading(false);
    }
  };

  const printButton = (
    <button type="button" disabled={pdfDownloading || !fixtures.length} onClick={downloadFillablePdf}>
      {pdfDownloading ? 'Creating Old School PDF...' : 'Print Old School Coupon'}
    </button>
  );

  if (buttonOnly) return printButton;

  const CouponPanel = ({ label, copyType = 'office' }) => (
    <div className={`couponBox ${copyType === 'entrant' ? 'entrantCopy' : 'officeCopy'}`}>
      <div className="couponTitle">
        <span>RIG</span>
        <em>Football Coupon</em>
      </div>

      <div className="couponFixtures">
        {fixtures.map(f => (
          <div className="couponFixture" key={`${label}-${f.id}`}>
            <div className="couponFixtureLine">
              <div className="team home">{f.home_team}</div>
              <div className="couponBadgeSlot">
                {f.home_badge && <img alt="" crossOrigin="anonymous" referrerPolicy="no-referrer" src={f.home_badge} />}
              </div>
              <input
                aria-label={`${f.home_team} score`}
                className="scoreCell"
                inputMode="numeric"
                maxLength="2"
                pattern="[0-9]*"
                type="text"
                value={scoreDrafts[f.id]?.home || ''}
                onChange={event => updateScoreDraft(f.id, 'home', event.target.value)}
              />
              <div className="versus">v</div>
              <input
                aria-label={`${f.away_team} score`}
                className="scoreCell"
                inputMode="numeric"
                maxLength="2"
                pattern="[0-9]*"
                type="text"
                value={scoreDrafts[f.id]?.away || ''}
                onChange={event => updateScoreDraft(f.id, 'away', event.target.value)}
              />
              <div className="couponBadgeSlot">
                {f.away_badge && <img alt="" crossOrigin="anonymous" referrerPolicy="no-referrer" src={f.away_badge} />}
              </div>
              <div className="team away">{f.away_team}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="couponCopyLabel">{label}</div>
    </div>
  );

  return (
    <section
      className="paper couponSheet"
      style={{
        '--fixture-count': fixtureCount,
        '--fixture-print-font': fixturePrintFont,
        '--fixture-badge-size': fixtureBadgeSize,
        '--fixture-score-width': fixtureScoreBoxWidth,
        '--fixture-score-height': fixtureScoreBoxHeight,
      }}
    >
      <div className="printButtonWrap">
        {printButton}
      </div>

      <div className="couponPrintGrid">
        <CouponPanel label="Office Copy" />
        <CouponPanel label="Entrant Copy" copyType="entrant" />
      </div>

      <div className="couponInfoGrid">
        <div className="couponAdminInfo">
          <div className="couponMeta">
            <div>Match Date(s)</div>
            <div className="blueText">{week.subtitle}</div>

            <div>Entries Submitted By</div>
            <div className="redText">{deadlineText}</div>

            <div>Name</div>
            <input
              aria-label="Entrant name"
              className="couponMetaInput"
              type="text"
              value={entrantName}
              onChange={event => setEntrantName(event.target.value)}
            />

            <div>Company / Department</div>
            <input
              aria-label="Company or department"
              className="couponMetaInput"
              type="text"
              value={entrantDepartment}
              onChange={event => setEntrantDepartment(event.target.value)}
            />
          </div>

          <div className="couponRules">
            <h3>Rules</h3>

            <div className="rulesBox">
              {sheetRules.map((rule, index) => (
                <div key={`${index}-${rule}`} className="ruleItem">
                  <strong>{index + 1}.</strong>
                  <span>{rule}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="couponEntrantInfo">
          <div className="couponMeta">
            <div>Match Date(s)</div>
            <div className="blueText">{week.subtitle}</div>

            <div>Entries Submitted By</div>
            <div className="redText">{deadlineText}</div>

            <div>Name</div>
            <input
              aria-label="Entrant name copy"
              className="couponMetaInput"
              type="text"
              value={entrantName}
              onChange={event => setEntrantName(event.target.value)}
            />

            <div>Company / Department</div>
            <input
              aria-label="Company or department copy"
              className="couponMetaInput"
              type="text"
              value={entrantDepartment}
              onChange={event => setEntrantDepartment(event.target.value)}
            />
          </div>

          <div className="printQrWrap">
            <img alt="WhatsApp QR" src="/whatsapp-qr.png" />
            <img alt="Payment QR" src="/payment-qr.png" />
          </div>

          <div className="summaryBox">
            <div>
              <strong>Scoring:</strong> 1 result point
            </div>

            <div>
              <strong>Exact Score:</strong> 3 points
            </div>

            <div>
              <strong>Maximum:</strong> {maxPts}
            </div>

            <div>
              <strong>Entry Fee:</strong> {entryFee}
            </div>
          </div>

          <div className="couponRules screenCouponRules">
            <h3>Rules</h3>

            <div className="rulesBox">
              {sheetRules.map((rule, index) => (
                <div key={`screen-${index}-${rule}`} className="ruleItem">
                  <strong>{index + 1}.</strong>
                  <span>{rule}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function parseFixtureRows(text) {
  const fixtures = [];
  const errors = [];
  const rows = [];

  String(text || '')
    .split('\n')
    .forEach((line, index) => {
      const raw = line.trim();
      if (!raw) return;

      const parts = raw.includes('\t')
        ? raw.split('\t')
        : raw.split(/\s+(?:v|vs|-)\s+/i);
      const [
        home,
        away,
        kickoff = '',
        apiFixtureId = '',
        homeBadge = '',
        awayBadge = '',
      ] = parts.map(part => part.trim());

      if (!home || !away || !kickoff) {
        const error = `Row ${index + 1}: use Home TAB Away TAB Kick-off`;
        errors.push(error);
        rows.push({
          line: index + 1,
          raw,
          home,
          away,
          kickoff,
          api_fixture_id: apiFixtureId,
          home_badge: homeBadge,
          away_badge: awayBadge,
          error,
        });
        return;
      }

      const fixture = {
        home_team: home,
        away_team: away,
        kickoff,
        api_fixture_id: apiFixtureId,
        home_badge: homeBadge,
        away_badge: awayBadge,
        status: 'NS',
      };

      fixtures.push(fixture);
      rows.push({ line: index + 1, raw, ...fixture, error: '' });
    });

  return { fixtures, errors, rows };
}

const fixtureResultLabel = fixture =>
  hasScore(fixture) ? `${fixture.home_score}-${fixture.away_score}` : fixture.status || 'TBC';

const predictionLabel = prediction => {
  if (
    !prediction ||
    prediction.home === null ||
    prediction.home === undefined ||
    prediction.away === null ||
    prediction.away === undefined ||
    String(prediction.home).trim() === '' ||
    String(prediction.away).trim() === ''
  ) {
    return '-';
  }

  return `${prediction.home}-${prediction.away}`;
};

function rankArchivedEntries(entries = [], fixtures = [], leaderboard = []) {
  const leaderboardById = new Map(leaderboard.map(entry => [entry.id, entry]));

  return [...entries]
    .map(entry => {
      const leaderboardEntry = leaderboardById.get(entry.id);
      const pts = fixtures.reduce((sum, fixture) => sum + points(entry.predictions?.[fixture.id], fixture), 0);
      const exact = fixtures.filter(fixture => points(entry.predictions?.[fixture.id], fixture) === 3).length;

      return {
        ...entry,
        pts: leaderboardEntry?.pts ?? pts,
        exact: leaderboardEntry?.exact ?? exact,
      };
    })
    .sort(
      (a, b) =>
        b.pts - a.pts ||
        b.exact - a.exact ||
        String(a.name || '').localeCompare(String(b.name || ''))
    );
}

function archivedWinnersFromLeaderboard(leaderboard = []) {
  const leader = leaderboard[0];
  if (!leader) return [];

  const topPoints = Number(leader.pts || 0);
  return leaderboard.filter(entry => Number(entry.pts || 0) === topPoints);
}

function archiveWinners(archive, leaderboard = []) {
  const pointsWinners = archivedWinnersFromLeaderboard(leaderboard);
  const snapshotWinners = Array.isArray(archive.snapshot?.winners) ? archive.snapshot.winners : [];

  if (pointsWinners.length > 1) return pointsWinners;
  if (snapshotWinners.length > 1) return snapshotWinners;
  if (pointsWinners.length) return pointsWinners;
  if (snapshotWinners.length) return snapshotWinners;

  const leader = leaderboard[0] || {};
  return [{
    name: archive.winner_name || leader.name || 'No winner recorded',
    department: archive.winner_department || leader.department || '',
    pts: archive.winner_points ?? leader.pts ?? 0,
  }];
}

function HistoricWinnerDetail({ archive, leaderboard = [] }) {
  const fixtures = Array.isArray(archive.snapshot?.fixtures) ? archive.snapshot.fixtures : [];
  const entries = Array.isArray(archive.snapshot?.entries) ? archive.snapshot.entries : [];
  const ranked = rankArchivedEntries(entries, fixtures, leaderboard);

  if (!fixtures.length || !ranked.length) {
    return (
      <div className="historicDetailEmpty">
        Full entry details are not available for this archived coupon.
      </div>
    );
  }

  return (
    <div className="historicDetailPanel">
      <div className="historicDetailStats">
        <span>
          <strong>{ranked.length}</strong>
          entrants
        </span>
        <span>
          <strong>{fixtures.length}</strong>
          fixtures
        </span>
      </div>

      <div className="scroll">
        <table className="historicDetailTable">
          <thead>
            <tr>
              <th>Entrant</th>
              <th>Total</th>
              {fixtures.map((fixture, index) => (
                <th key={fixture.id || `${fixture.home_team}-${fixture.away_team}-${index}`}>
                  <span>{fixture.home_team}</span>
                  <b>{fixtureResultLabel(fixture)}</b>
                  <span>{fixture.away_team}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ranked.map((entry, index) => (
              <tr key={entry.id || `${entry.name}-${index}`}>
                <td>
                  <strong>{leaderboardPosition(ranked, index)}. {entry.name || 'Unnamed entry'}</strong>
                  {entry.department && <small>{entry.department}</small>}
                </td>
                <td>
                  <b>{entry.pts} pts</b>
                  <small>{entry.exact} exact</small>
                </td>
                {fixtures.map((fixture, fixtureIndex) => {
                  const prediction = entry.predictions?.[fixture.id];
                  const earned = points(prediction, fixture);
                  const className =
                    earned === 3 ? 'exactScore' :
                    earned === 1 ? 'correctResult' :
                    '';

                  return (
                    <td
                      className={className}
                      key={fixture.id || `${fixture.home_team}-${fixture.away_team}-${fixtureIndex}`}
                    >
                      <strong>{predictionLabel(prediction)}</strong>
                      <small>{earned} pt{earned === 1 ? '' : 's'}</small>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function HistoricWinners({ archives = [] }) {
  if (!archives.length) {
    return (
      <section className="card historicWinnersPage">
        <div className="sectionTitleRow">
          <div>
            <p className="eyebrow">Past Coupons</p>
            <h1>Results & history</h1>
          </div>
        </div>

        <div className="historicEmpty">
          <h3>No historic winners saved yet</h3>
          <p>Completed coupons and their results will appear here after they are archived.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="card historicWinnersPage">
      <div className="sectionTitleRow">
        <div>
          <p className="eyebrow">Past Coupons</p>
          <h1>Results & history</h1>
        </div>

        <strong>{archives.length} saved</strong>
      </div>

      <div className="historicGrid">
        {archives.map(archive => {
          const leaderboard = Array.isArray(archive.leaderboard) ? archive.leaderboard : [];
          const archiveDate = formatArchiveDate(archive.created_at);
          const winners = archiveWinners(archive, leaderboard);
          const winnerPoints = winners[0]?.pts ?? archive.winner_points ?? leaderboard[0]?.pts ?? 0;

          return (
            <article className="historicWinner" key={archive.id}>
              <div className="historicWinnerHeader">
                <div>
                  <small>{archive.week_subtitle || archiveDate || 'Archived coupon'}</small>
                  <h3>{archive.week_title || 'RIG Coupon'}</h3>
                </div>

                <span>{leaderboard.length} entr{leaderboard.length === 1 ? 'y' : 'ies'}</span>
              </div>

              <div className="winnerPanel">
                <p>{winners.length === 1 ? 'Winner' : 'Split Winners'}</p>
                <strong>
                  {winners.length === 1
                    ? winners[0]?.name
                    : `${winners.length} winners`}
                </strong>
                {winners.length === 1 && winners[0]?.department && <span>{winners[0].department}</span>}
                {winners.length > 1 && (
                  <div className="splitWinnerList">
                    {winners.map((winner, index) => (
                      <span key={winner.id || `${winner.name}-${index}`}>
                        {winner.name}
                        {winner.department ? ` (${winner.department})` : ''}
                      </span>
                    ))}
                  </div>
                )}
                <b>{winnerPoints} pts</b>
              </div>

              {!!leaderboard.length && (
                <div className="historicStandings">
                  <h4>Top 5</h4>
                  <ol>
                    {leaderboard.slice(0, 5).map((entry, index) => (
                      <li key={entry.id || `${entry.name}-${index}`}>
                        <span>
                          <b>{leaderboardPosition(leaderboard, index)}</b>
                          {entry.name}
                        </span>
                        <strong>{entry.pts} pts</strong>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              <details className="historicEntryDetails">
                <summary>View all entries and predictions</summary>
                <HistoricWinnerDetail archive={archive} leaderboard={leaderboard} />
              </details>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function Admin({ state, adminAction, setMsg, ranked, pot, imgRef, unpaidImgRef, entriesImgRef, admin, load }) {
  const allWeeks = Array.isArray(state.weeks) && state.weeks.length
    ? state.weeks
    : [state.week].filter(Boolean);
  const defaultAdminWeekId = state.entryWeek?.id || state.week?.id || allWeeks[0]?.id || '';
  const [selectedWeekId, setSelectedWeekId] = useState(defaultAdminWeekId);
  const selectedWeek =
    allWeeks.find(item => item.id === selectedWeekId) ||
    allWeeks.find(item => item.id === defaultAdminWeekId) ||
    state.week ||
    {};
  const selectedWeekKey = selectedWeek?.id || selectedWeekId || '';
  const fixturesByWeek = state.fixturesByWeek || {};
  const settingsByWeek = state.settingsByWeek || {};
  const selectedWeekFixtures =
    (selectedWeekKey && Array.isArray(fixturesByWeek[selectedWeekKey])
      ? fixturesByWeek[selectedWeekKey]
      : selectedWeekKey === state.week?.id
        ? state.fixtures
        : []) || [];
  const entriesByWeek = state.entriesByWeek || {};
  const selectedWeekEntries =
    (selectedWeekKey && Array.isArray(entriesByWeek[selectedWeekKey])
      ? entriesByWeek[selectedWeekKey]
      : selectedWeekKey === state.week?.id
        ? state.entries
        : []) || [];
  const selectedWeekSettings =
    (selectedWeekKey && settingsByWeek[selectedWeekKey]) ||
    (selectedWeekKey === state.week?.id ? state.settings : {}) ||
    {};
  const [settings, setSettings] = useState(mergeSettingsDraft({}, selectedWeekSettings));
  const [week, setWeek] = useState(mergeWeekDraft({}, selectedWeek));
  const fixtures = Array.isArray(selectedWeekFixtures) ? selectedWeekFixtures : [];
  const archives = Array.isArray(state.archives) ? state.archives : [];
  const historicArchives = archives.filter(archive => archive.saved_as_historic);
  const latestArchive = archives[0];
  const activeWeekId = state.week?.id || '';
  const currentWeekId = selectedWeekKey || settings.week_id || activeWeekId || '';
  const activeWeekLabel = state.week?.title || 'RIG Coupon';
  const editingActiveWeek = currentWeekId && currentWeekId === activeWeekId;
  const calendarDefaults = isoWeekInfo();
  const gamesPlayed = fixtures.filter(isFinishedFixture).length;
  const activeGamesPlayed = (state.fixtures || []).filter(isFinishedFixture).length;
  const selectedRanked = [...selectedWeekEntries]
    .map(entry => ({
      ...entry,
      pts: fixtures.reduce((sum, fixture) => sum + points(entry.predictions?.[fixture.id], fixture), 0),
      exact: fixtures.filter(fixture => points(entry.predictions?.[fixture.id], fixture) === 3).length,
    }))
    .sort(
      (a, b) =>
        b.pts - a.pts ||
        b.exact - a.exact ||
        String(a.name || '').localeCompare(String(b.name || ''))
    );
  const activeUnpaidEntries = ranked.filter(entry => !entry.paid);
  const leaderboardShareDensity =
    ranked.length > 28 ? 'shareUltraCompact' :
    ranked.length > 20 ? 'shareVeryCompact' :
    ranked.length > 14 ? 'shareCompact' :
    '';

  const [fixtureText, setFixtureText] = useState(fixturesToTsv(fixtures));
  const [fixturePreview, setFixturePreview] = useState(null);
  const [previewFilter, setPreviewFilter] = useState('all');
  const [fixtureApiMeta, setFixtureApiMeta] = useState(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [newCoupon, setNewCoupon] = useState({
    title: 'RIG Coupon – New Coupon',
    subtitle: '',
    saveHistoric: true,
  });
  const [newWeek, setNewWeek] = useState({
    calendar_year: calendarDefaults.year,
    calendar_week: calendarDefaults.week,
    special_name: '',
    subtitle: '',
  });
  const [confirmActivateWeekId, setConfirmActivateWeekId] = useState('');
  const [confirmCloseLiveCoupon, setConfirmCloseLiveCoupon] = useState(false);
  const [confirmNewCoupon, setConfirmNewCoupon] = useState(false);
  const [confirmDeleteWeekId, setConfirmDeleteWeekId] = useState('');
  const [confirmDeleteArchiveId, setConfirmDeleteArchiveId] = useState('');
  const [editingEntryId, setEditingEntryId] = useState(null);
  const [entryDraft, setEntryDraft] = useState(null);
  const [scoreDrafts, setScoreDrafts] = useState({});
  const [scoreSaveState, setScoreSaveState] = useState('idle');
  const [confirmClearResults, setConfirmClearResults] = useState(false);
  const scoreSaveTimer = useRef(null);
  const [fixtureSearch, setFixtureSearch] = useState({
    from: '',
    days: '7',
    leagues: '',
    season: String(new Date().getFullYear()),
  });
  const [fixtureSearchAllResults, setFixtureSearchAllResults] = useState([]);
  const [fixtureSearchResults, setFixtureSearchResults] = useState([]);
  const [selectedApiLeagues, setSelectedApiLeagues] = useState({});
  const [savedApiLeagues, setSavedApiLeagues] = useState([]);
  const [selectedApiFixtures, setSelectedApiFixtures] = useState({});
  const [fixtureSearchLoading, setFixtureSearchLoading] = useState(false);
  const fixtureSearchDays = Math.max(1, Math.min(31, Number(fixtureSearch.days) || 1));
  const fixtureSearchDates = fixtureSearchDateRange(fixtureSearch.from, fixtureSearchDays);
  const fixtureSearchTo = fixtureSearchDates[fixtureSearchDates.length - 1] || '';

  const [tsv, setTsv] = useState('');

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(SAVED_API_LEAGUES_KEY) || '[]');
      setSavedApiLeagues(Array.isArray(saved) ? saved : []);
    } catch {
      setSavedApiLeagues([]);
    }
  }, []);

  useEffect(() => {
    if (!selectedWeekId || !allWeeks.some(item => item.id === selectedWeekId)) {
      setSelectedWeekId(defaultAdminWeekId);
    }
  }, [allWeeks, defaultAdminWeekId, selectedWeekId]);

  useEffect(() => {
    setSettings(mergeSettingsDraft({}, selectedWeekSettings || { week_id: selectedWeekKey }));
    setWeek(mergeWeekDraft({}, selectedWeek || {}));
    setFixtureText(fixturesToTsv(fixtures));
    setFixturePreview(null);
    setFixtureApiMeta(null);
    setConfirmReplace(false);
    setConfirmClearResults(false);
    setConfirmActivateWeekId('');
    setConfirmDeleteWeekId('');
  }, [selectedWeekKey]);

  useEffect(() => {
    setScoreDrafts(
      Object.fromEntries(
        fixtures.map(fixture => [
          fixture.id,
          {
            home_score: fixture.home_score ?? '',
            away_score: fixture.away_score ?? '',
            ht_home_score: fixture.ht_home_score ?? '',
            ht_away_score: fixture.ht_away_score ?? '',
            status: fixture.status || 'NS',
          },
        ])
      )
    );
  }, [fixtures]);

  useEffect(
    () => () => {
      if (scoreSaveTimer.current) clearTimeout(scoreSaveTimer.current);
    },
    []
  );

  function normaliseScore(value) {
    return value === '' || value === null || value === undefined ? null : Number(value);
  }

  function resultPayloadFromDrafts(drafts = scoreDrafts) {
    return fixtures.map(fixture => {
      const draft = drafts[fixture.id] || {};
      const homeScore = normaliseScore(draft.home_score);
      const awayScore = normaliseScore(draft.away_score);

      return {
        id: fixture.id,
        home_score: homeScore,
        away_score: awayScore,
        ht_home_score: normaliseScore(draft.ht_home_score),
        ht_away_score: normaliseScore(draft.ht_away_score),
        status: draft.status || (homeScore !== null && awayScore !== null ? 'FT' : 'NS'),
      };
    });
  }

  async function saveScoreDrafts(drafts = scoreDrafts, silent = false) {
    if (!fixtures.length) return false;
    if (scoreSaveTimer.current) {
      clearTimeout(scoreSaveTimer.current);
      scoreSaveTimer.current = null;
    }

    setScoreSaveState('saving');
    const saved = await runAdminAction(
      'setResults',
      { fixtures: resultPayloadFromDrafts(drafts) },
      silent ? false : 'Results saved.'
    );
    setScoreSaveState(saved ? 'saved' : 'error');
    return saved;
  }

  async function clearAllResults() {
    if (!fixtures.length) {
      setMsg('No fixtures loaded to clear results from.');
      return;
    }

    if (!confirmClearResults) {
      setConfirmClearResults(true);
      setMsg(`Confirm clear: remove all entered scores and statuses from ${fixtures.length} fixture(s).`);
      return;
    }

    setConfirmClearResults(false);

    if (scoreSaveTimer.current) {
      clearTimeout(scoreSaveTimer.current);
      scoreSaveTimer.current = null;
    }

    const clearedDrafts = Object.fromEntries(
      fixtures.map(fixture => [
        fixture.id,
        {
          home_score: '',
          away_score: '',
          ht_home_score: '',
          ht_away_score: '',
          status: 'NS',
        },
      ])
    );

    setScoreDrafts(clearedDrafts);
    setScoreSaveState('saving');

    const cleared = await runAdminAction(
      'clearResults',
      { fixture_ids: fixtures.map(fixture => fixture.id) },
      'All fixture scores cleared.'
    );

    setScoreSaveState(cleared ? 'saved' : 'error');

    if (!cleared) {
      load();
    }
  }

  function updateScoreDraft(fixtureId, field, value) {
    setScoreDrafts(current => {
      const currentDraft = current[fixtureId] || {};
      const nextDraft = {
        ...currentDraft,
        [field]: value,
      };

      if (
        ['home_score', 'away_score'].includes(field) &&
        (nextDraft.status || 'NS') === 'NS' &&
        nextDraft.home_score !== '' &&
        nextDraft.home_score !== undefined &&
        nextDraft.away_score !== '' &&
        nextDraft.away_score !== undefined
      ) {
        nextDraft.status = 'FT';
      }

      const next = {
        ...current,
        [fixtureId]: nextDraft,
      };

      setMsg('');
      setConfirmClearResults(false);
      setScoreSaveState('pending');

      if (scoreSaveTimer.current) clearTimeout(scoreSaveTimer.current);
      scoreSaveTimer.current = setTimeout(() => {
        saveScoreDrafts(next, true);
      }, 900);

      return next;
    });
  }

  function fixturePreviewApiSummary(preview) {
    const rows = (preview?.rows || []).filter(row => !row.error);
    const matched = rows.filter(row => row.api_fixture_id).length;
    const rowsWithBadges = rows.filter(row => row.home_badge && row.away_badge).length;
    const rowsMissingBadges = rows.filter(row => !row.home_badge || !row.away_badge).length;
    const missing = Math.max(rows.length - matched, 0);

    return {
      complete: rows.length > 0 && missing === 0,
      matched,
      missing,
      rowsWithBadges,
      rowsMissingBadges,
      total: rows.length,
    };
  }

  function previewFixtures() {
    const parsed = parseFixtureRows(fixtureText);
    const summary = fixturePreviewApiSummary(parsed);
    setFixturePreview(parsed);
    setFixtureApiMeta(null);
    setPreviewFilter('all');
    setConfirmReplace(false);

    if (parsed.errors.length) {
      setMsg(`Fix ${parsed.errors.length} fixture import issue(s) before replacing fixtures.`);
      return;
    }

    if (!parsed.fixtures.length) {
      setMsg('Add at least one fixture before replacing fixtures.');
      return;
    }

    setMsg(
      `Preview ready: ${parsed.fixtures.length} fixture(s) parsed. ${summary.matched} have API IDs, ${summary.missing} can be kept as manual fixtures or matched via API.`
    );
  }

  function removePreviewFixture(row) {
    const lines = String(fixtureText || '').split('\n');
    const nextText = lines.filter((_, index) => index !== row.line - 1).join('\n');
    const nextPreview = parseFixtureRows(nextText);

    setFixtureText(nextText);
    setFixturePreview(nextPreview);
    setConfirmReplace(false);
    setMsg(
      nextPreview.fixtures.length
        ? `Removed row ${row.line}. ${nextPreview.fixtures.length} fixture(s) remain in preview.`
        : 'Removed row. Add at least one fixture before replacing fixtures.'
    );
  }

  function replacePreviewedFixtures() {
    const parsed = fixturePreview || parseFixtureRows(fixtureText);
    const summary = fixturePreviewApiSummary(parsed);

    if (parsed.errors.length) {
      setFixturePreview(parsed);
      setConfirmReplace(false);
      setMsg(`Fix ${parsed.errors.length} fixture import issue(s) before replacing fixtures.`);
      return;
    }

    if (!parsed.fixtures.length) {
      setConfirmReplace(false);
      setMsg('Add at least one fixture before replacing fixtures.');
      return;
    }

    if (!confirmReplace) {
      setConfirmReplace(true);
      setMsg(
        summary.missing
          ? `Warning: ${summary.missing} fixture(s) are manual-only with no API IDs. That is fine as long as the kick-off is entered correctly, but badges/live scores may not work for those rows. Confirm to replace ${fixtures.length} current fixture(s).`
          : `Confirm replacement: all ${summary.total} fixture(s) have API IDs. This will replace ${fixtures.length} current fixture(s).`
      );
      return;
    }

    setConfirmReplace(false);
    adminAction('replaceFixtures', {
      week_id: currentWeekId || undefined,
      fixtures: parsed.fixtures,
    });
  }

  async function fetchApiFixtures(searchPayload) {
    setFixtureSearchLoading(true);

    try {
      const response = await fetch('/api/fixture-search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-pass': admin,
        },
        body: JSON.stringify(searchPayload),
      });
      const json = await response.json().catch(() => ({}));

      if (!response.ok) {
        setMsg(json.error || 'Fixture search failed');
        return null;
      }

      return {
        fixtures: json.fixtures || [],
        meta: json.meta || {},
      };
    } finally {
      setFixtureSearchLoading(false);
    }
  }

  function weeklyFixtureSearchPayload(overrides = {}) {
    return {
      ...fixtureSearch,
      approved_competitions: [],
      ...overrides,
      to: fixtureSearchTo,
    };
  }

  function fixtureDateDiscoveryPayload(overrides = {}) {
    return {
      ...fixtureSearch,
      all_fixtures_by_date: true,
      approved_competitions: [],
      dates: fixtureSearchDates,
      from: fixtureSearch.from,
      leagues: '',
      to: fixtureSearchTo,
      ...overrides,
    };
  }

  function fixtureListSearchPayload(sourceFixtures, overrides = {}) {
    const dates = [
      ...new Set((sourceFixtures || []).map(fixture => fixtureKickoffIsoDate(fixture.kickoff)).filter(Boolean)),
    ].sort();

    return {
      ...fixtureSearch,
      all_fixtures_by_date: true,
      from: dates[0] || '',
      to: dates[dates.length - 1] || '',
      dates,
      team_names: fixtureTeamNames(sourceFixtures),
      leagues: '',
      approved_competitions: [],
      ...overrides,
    };
  }

  function listedFixtureSearchPayload(overrides = {}) {
    return fixtureListSearchPayload(fixtures, overrides);
  }

  function enrichFixturesWithApi(sourceFixtures, apiFixtures, badgeMap = {}) {
    const byApiId = new Map(apiFixtures.map(fixture => [String(fixture.api_fixture_id), fixture]));
    const byTeams = new Map(apiFixtures.map(fixture => [fixtureMatchKey(fixture), fixture]));
    let matched = 0;
    let badgeMatched = 0;
    const matchedFixtures = [];
    const enriched = sourceFixtures.map(fixture => {
      const apiFixture =
        (fixture.api_fixture_id && byApiId.get(String(fixture.api_fixture_id))) ||
        byTeams.get(fixtureMatchKey(fixture));

      const fallbackHomeBadge =
        badgeMap[normaliseMatchText(fixture.home_team)] || fixture.home_badge || '';
      const fallbackAwayBadge =
        badgeMap[normaliseMatchText(fixture.away_team)] || fixture.away_badge || '';

      if (!apiFixture) {
        const badgeOnlyFixture = {
          ...fixture,
          home_badge: fallbackHomeBadge,
          away_badge: fallbackAwayBadge,
        };

        if (
          badgeOnlyFixture.home_badge !== (fixture.home_badge || '') ||
          badgeOnlyFixture.away_badge !== (fixture.away_badge || '')
        ) {
          badgeMatched += 1;
          matchedFixtures.push(badgeOnlyFixture);
        }

        return badgeOnlyFixture;
      }

      matched += 1;
      const enrichedFixture = {
        ...fixture,
        api_fixture_id: apiFixture.api_fixture_id,
        kickoff: apiFixture.kickoff || fixture.kickoff || '',
        home_badge: apiFixture.home_badge || fallbackHomeBadge,
        away_badge: apiFixture.away_badge || fallbackAwayBadge,
        status: apiFixture.status || fixture.status || 'NS',
        home_score: apiFixture.home_score,
        away_score: apiFixture.away_score,
        ht_home_score: apiFixture.ht_home_score,
        ht_away_score: apiFixture.ht_away_score,
      };
      matchedFixtures.push(enrichedFixture);
      return enrichedFixture;
    });

    return { enriched, matched, badgeMatched, matchedFixtures };
  }

  function resetFixtureSearchDiscovery() {
    setFixtureSearchAllResults([]);
    setFixtureSearchResults([]);
    setSelectedApiLeagues({});
    setSelectedApiFixtures({});
  }

  async function findAvailableLeagues() {
    setSelectedApiFixtures({});
    setSelectedApiLeagues({});
    setFixtureSearchResults([]);

    if (!fixtureSearch.from || !fixtureSearchTo || !fixtureSearchDates.length) {
      setFixtureSearchAllResults([]);
      setMsg('Choose a fixture search start date and number of days first.');
      return;
    }

    const search = await fetchApiFixtures(fixtureDateDiscoveryPayload());
    if (!search) {
      setFixtureSearchAllResults([]);
      return;
    }

    const fixturesFound = search.fixtures;
    setFixtureSearchAllResults(fixturesFound);

    const leagueCount = new Set(fixturesFound.map(fixture => fixture.league_id).filter(Boolean)).size;
    const checkedDates = search.meta?.checked_dates?.length || 0;
    setMsg(
      `Found ${leagueCount} league/cup competition(s) with ${fixturesFound.length} fixture(s)${
        checkedDates ? ` across ${checkedDates} date(s)` : ''
      }. Select leagues, then press List Fixtures.`
    );
  }

  async function searchApiFixtures() {
    setSelectedApiFixtures({});
    setFixtureSearchAllResults([]);
    setSelectedApiLeagues({});

    if (!fixtureSearch.leagues.trim()) {
      setMsg('Enter a direct league ID or name before using Direct Fixture Search.');
      return;
    }

    const search = await fetchApiFixtures(weeklyFixtureSearchPayload());

    if (search) {
      const fixturesFound = search.fixtures;
      setFixtureSearchResults(fixturesFound);
      setMsgForFixtureSearch(fixturesFound, search.meta);
    }
  }

  function setMsgForFixtureSearch(fixturesFound, meta = {}) {
    const blockedSummary = formatBlockedDateSummary(meta.blocked_dates);
    const cachedSummary = formatCachedBadgeSummary(meta);

    if (fixturesFound.length) {
      setMsg(
        `Found ${fixturesFound.length} fixture(s).${blockedSummary ? ` ${blockedSummary}` : ''}${
          cachedSummary ? ` ${cachedSummary}` : ''
        }`
      );
    } else {
      const checkedDates = meta.checked_dates?.length;
      const resolvedLeagues = meta.resolved_league_ids?.length;
      const unresolved = meta.unresolved_competitions?.length;
      setMsg(
        `Found 0 fixture(s). Checked ${checkedDates || 'the selected'} date(s)${
          resolvedLeagues ? ` and ${resolvedLeagues} league ID(s)` : ''
        }${
          unresolved ? `. ${unresolved} approved competition(s) did not resolve for this season` : ''
        }.${blockedSummary ? ` ${blockedSummary}` : ' Try a wider date range, a numeric league ID, or a different season.'}${
          cachedSummary ? ` ${cachedSummary}` : ''
        }`
      );
    }
  }

  function toggleApiLeague(id) {
    setSelectedApiLeagues(current => ({
      ...current,
      [id]: !current[id],
    }));
  }

  function savedLeagueMatches(league, savedLeague) {
    if (!league || !savedLeague) return false;
    if (String(league.id) === String(savedLeague.id)) return true;

    const leagueName = normaliseMatchText(league.name);
    const savedName = normaliseMatchText(savedLeague.name);
    const leagueCountry = normaliseMatchText(league.country);
    const savedCountry = normaliseMatchText(savedLeague.country);

    return leagueName && leagueName === savedName && (!savedCountry || leagueCountry === savedCountry);
  }

  function selectedApiLeagueIds() {
    return Object.entries(selectedApiLeagues)
      .filter(([, selected]) => selected)
      .map(([id]) => id);
  }

  function saveCurrentLeagueSelections() {
    const selected = availableApiLeagues
      .filter(league => selectedApiLeagues[league.id])
      .map(league => ({
        id: league.id,
        name: league.name,
        country: league.country || '',
      }));

    if (!selected.length) {
      setMsg('Select at least one league or cup competition before saving.');
      return;
    }

    setSavedApiLeagues(selected);

    try {
      window.localStorage.setItem(SAVED_API_LEAGUES_KEY, JSON.stringify(selected));
    } catch {
      setMsg('Saved for this session, but this browser blocked permanent storage.');
      return;
    }

    setMsg(`Saved ${selected.length} league selection${selected.length === 1 ? '' : 's'}.`);
  }

  function listLeagueFixturesByIds(selectedLeagueIds, emptyMessage = 'Select at least one league or cup competition first.') {

    if (!selectedLeagueIds.length) {
      setMsg(emptyMessage);
      return;
    }

    const fixturesFound = fixtureSearchAllResults.filter(fixture =>
      selectedLeagueIds.includes(String(fixture.league_id || fixture.league_name || 'other'))
    );
    const selectedLeagueMap = selectedLeagueIds.reduce((selected, id) => {
      selected[id] = true;
      return selected;
    }, {});

    setFixtureSearchAllResults(fixturesFound);
    setSelectedApiLeagues(selectedLeagueMap);
    setSelectedApiFixtures({});
    setFixtureSearchResults(fixturesFound);
    setMsgForFixtureSearch(fixturesFound);
  }

  function listSelectedLeagueFixtures() {
    listLeagueFixturesByIds(selectedApiLeagueIds());
  }

  function listSavedLeagueFixtures() {
    if (!savedApiLeagues.length) {
      setMsg('No saved league selections yet. Tick leagues, then press Save Current Selections.');
      return;
    }

    const savedSelectionMap = availableApiLeagues.reduce((selected, league) => {
      if (savedApiLeagues.some(savedLeague => savedLeagueMatches(league, savedLeague))) {
        selected[league.id] = true;
      }
      return selected;
    }, {});
    const savedLeagueIds = Object.keys(savedSelectionMap);

    setSelectedApiLeagues(savedSelectionMap);
    listLeagueFixturesByIds(
      savedLeagueIds,
      'None of the saved leagues were found in the current search results. Run Search Leagues for the date range first.'
    );
  }

  function toggleApiFixture(id) {
    setSelectedApiFixtures(current => ({
      ...current,
      [id]: !current[id],
    }));
  }

  function useSelectedApiFixtures({ append = false } = {}) {
    const sourceFixtures = fixtureSearchResults.length ? fixtureSearchResults : fixtureSearchAllResults;
    const selected = sourceFixtures.filter(fixture => selectedApiFixtures[apiFixtureSelectionKey(fixture)]);

    if (!selected.length) {
      setMsg('Select at least one searched fixture first.');
      return;
    }

    const existing = append ? parseFixtureRows(fixtureText).fixtures : [];
    const previewFixtures = append && fixturePreview?.fixtures?.length ? fixturePreview.fixtures : existing;
    const fixtureKey = fixture =>
      fixture.api_fixture_id
        ? `api:${fixture.api_fixture_id}`
        : `teams:${fixtureMatchKey(fixture)}:${fixtureKickoffIsoDate(fixture.kickoff) || fixture.kickoff || ''}`;
    const existingKeys = new Set(previewFixtures.map(fixtureKey));
    const newFixtures = selected.filter(fixture => !existingKeys.has(fixtureKey(fixture)));
    const combinedFixtures = append ? [...previewFixtures, ...newFixtures] : selected;
    const text = fixturesToTsv(combinedFixtures);

    const preview = {
      fixtures: combinedFixtures.map(fixture => ({
        home_team: fixture.home_team,
        away_team: fixture.away_team,
        kickoff: fixture.kickoff,
        api_fixture_id: fixture.api_fixture_id,
        home_badge: fixture.home_badge || '',
        away_badge: fixture.away_badge || '',
        status: 'NS',
      })),
      errors: [],
      rows: combinedFixtures.map((fixture, index) => ({
        line: index + 1,
        raw: '',
        ...fixture,
        error: '',
      })),
    };

    setFixtureText(text);
    setFixturePreview(preview);
    setConfirmReplace(false);
    setMsg(
      append
        ? `Added ${newFixtures.length} fixture(s). Preview now has ${combinedFixtures.length} fixture(s).`
        : `${selected.length} searched fixture(s) loaded into the preview.`
    );
  }

  async function updateManualFixturesFromApi({ preferSavedFixtures = false } = {}) {
    const parsedText = parseFixtureRows(fixtureText);
    const previewReady = fixturePreview && !fixturePreview.errors.length && fixturePreview.fixtures.length;
    const textReady = !preferSavedFixtures && !parsedText.errors.length && parsedText.fixtures.length;
    const sourceFixtures = previewReady
      ? fixturePreview.fixtures
      : textReady
        ? parsedText.fixtures
        : fixtures;
    const sourceRows = previewReady ? fixturePreview.rows : parsedText.rows;
    const shouldUpdatePreview = previewReady || textReady;
    const sourceLabel = previewReady ? 'preview' : textReady ? 'TSV preview' : 'saved';

    if (!preferSavedFixtures && parsedText.errors.length) {
      setFixturePreview(parsedText);
      setConfirmReplace(false);
      setMsg(`Fix ${parsedText.errors.length} fixture import issue(s) before updating API data.`);
      return 0;
    }

    if (!sourceFixtures.length) {
      setMsg('Preview or save fixtures before updating API data.');
      return 0;
    }

    const searchPayload = shouldUpdatePreview
      ? fixtureListSearchPayload(sourceFixtures)
      : listedFixtureSearchPayload();

    if (!searchPayload.dates.length) {
      setMsg('Fixture rows need kick-off dates before API data can be matched.');
      return 0;
    }

    const search = await fetchApiFixtures(searchPayload);
    if (!search) return 0;

    const apiFixtures = search.fixtures || [];
    const blockedSummary = formatBlockedDateSummary(search.meta?.blocked_dates);
    const cachedSummary = formatCachedBadgeSummary(search.meta);
    setFixtureApiMeta(search.meta || null);
    const badgeMap = search.meta?.team_badges || {};
    const { enriched, matched, badgeMatched, matchedFixtures } = enrichFixturesWithApi(
      sourceFixtures,
      apiFixtures,
      badgeMap
    );

    if (!matched && !badgeMatched) {
      setFixtureSearchAllResults(apiFixtures);
      setFixtureSearchResults(apiFixtures);
      setPreviewFilter('missing-badges');
      setMsg(
        `Found ${apiFixtures.length} API fixture(s), but none matched the ${sourceLabel} fixtures.${
          blockedSummary ? ` ${blockedSummary}` : ''
        }${cachedSummary ? ` ${cachedSummary}` : ''}`
      );
      return 0;
    }

    const sortedEnriched = sortFixturesChronologically(enriched);

    if (shouldUpdatePreview) {
      const rows = sortedEnriched.map((fixture, index) => ({
        ...(sourceRows.find(row => fixtureMatchKey(row) === fixtureMatchKey(fixture)) || {}),
        ...fixture,
        line: index + 1,
        raw: fixturesToTsv([fixture]),
      }));

      setFixturePreview({
        fixtures: sortedEnriched,
        errors: [],
        rows,
      });
      setFixtureText(fixturesToTsv(sortedEnriched));
      setFixtureSearchAllResults(apiFixtures);
      setFixtureSearchResults(apiFixtures);
      setPreviewFilter('missing-badges');
      setConfirmReplace(false);
      setMsg(
        `Updated ${sourceLabel} API data for ${matched} fixture(s)${
          badgeMatched ? ` and badge-only data for ${badgeMatched} fixture(s)` : ''
        }.${
          blockedSummary ? ` ${blockedSummary}` : ''
        }${cachedSummary ? ` ${cachedSummary}` : ''} Replace previewed fixtures when ready.`
      );
      return matched;
    }

    const updated = await runAdminAction(
      'updateFixtureApiData',
      {
        fixtures: sortedEnriched.map((fixture, index) => ({
          ...fixture,
          id: fixture.id,
          sort_order: index + 1,
        })),
      },
      `Updated API data for ${matched} fixture(s).`
    );

    if (updated) {
      setFixtureSearchAllResults(apiFixtures);
      setFixtureSearchResults(apiFixtures);
      setMsg(
        `Updated saved fixture API data for ${matched} fixture(s)${
          badgeMatched ? ` and badge-only data for ${badgeMatched} fixture(s)` : ''
        }.${blockedSummary ? ` ${blockedSummary}` : ''}${cachedSummary ? ` ${cachedSummary}` : ''}`
      );
    }

    return updated ? matched + badgeMatched : 0;
  }

  async function runAdminAction(action, payload, successMessage) {
    const r = await fetch('/api/admin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-pass': admin,
      },
      body: JSON.stringify({ action, payload }),
    });
    const text = await r.text();
    let json = {};

    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { error: text };
    }

    if (!r.ok) {
      setMsg(json.error || `Admin action failed (${r.status})`);
      return false;
    }

    if (successMessage !== false) {
      setMsg(successMessage || 'Saved ✅');
      load();
    }
    return true;
  }

  async function createCouponWeek() {
    const calendarWeek = Number(newWeek.calendar_week || 0);
    const calendarYear = Number(newWeek.calendar_year || 0);

    if (!calendarYear || !calendarWeek) {
      setMsg('Enter a calendar year and week number before creating a coupon.');
      return;
    }

    const specialName = String(newWeek.special_name || '').trim();
    const title = specialName || `RIG Coupon Week ${calendarWeek}`;
    const created = await runAdminAction(
      'createWeek',
      {
        calendar_year: calendarYear,
        calendar_week: calendarWeek,
        special_name: specialName,
        title,
        subtitle: String(newWeek.subtitle || '').trim(),
      },
      `Created ${title}.`
    );

    if (created) {
      setNewWeek(current => ({
        ...current,
        calendar_week: Number(current.calendar_week || 0) + 1,
        special_name: '',
        subtitle: '',
      }));
    }
  }

  async function activateSelectedWeek() {
    if (!currentWeekId) {
      setMsg('Select a coupon week before making it live.');
      return;
    }

    if (editingActiveWeek) {
      setMsg(`${week.title || 'This coupon'} is already the live leaderboard week.`);
      return;
    }

    if (confirmActivateWeekId !== currentWeekId) {
      setConfirmActivateWeekId(currentWeekId);
      setMsg(
        `Confirm go live: this will archive ${activeWeekLabel}, save its historic winners snapshot, and make ${week.title || 'the selected coupon'} the live leaderboard.`
      );
      return;
    }

    setConfirmActivateWeekId('');
    await runAdminAction(
      'activateWeek',
      {
        week_id: currentWeekId,
        saveHistoric: true,
      },
      `${week.title || 'Selected coupon'} is now the live leaderboard week.`
    );
  }

  async function deleteSelectedDraftWeek() {
    if (!currentWeekId) {
      setMsg('Select a draft coupon before deleting.');
      return;
    }

    if (editingActiveWeek) {
      setMsg('The live leaderboard coupon cannot be deleted.');
      return;
    }

    const label = week.title || 'the selected draft coupon';

    if (confirmDeleteWeekId !== currentWeekId) {
      setConfirmDeleteWeekId(currentWeekId);
      setMsg(`Confirm delete: this will permanently remove ${label}, including any staged fixtures and entries.`);
      return;
    }

    setConfirmDeleteWeekId('');
    const deleted = await runAdminAction(
      'deleteDraftWeek',
      { week_id: currentWeekId },
      `${label} deleted.`
    );

    if (deleted) {
      setSelectedWeekId(activeWeekId || allWeeks.find(item => item.id !== currentWeekId)?.id || '');
    }
  }

  async function closeLiveCoupon() {
    const liveFixtures = Array.isArray(state.fixtures) ? state.fixtures : [];
    const liveEntries = Array.isArray(state.entries) ? state.entries : [];
    const finishedCount = liveFixtures.filter(isFinishedFixture).length;

    if (!activeWeekId) {
      setMsg('There is no live coupon to close.');
      return;
    }

    if (!liveFixtures.length || !liveEntries.length) {
      setMsg('Cannot close the live coupon until it has fixtures and entries.');
      return;
    }

    if (finishedCount !== liveFixtures.length) {
      setMsg(`Cannot close yet: ${finishedCount} of ${liveFixtures.length} fixture(s) are finished.`);
      return;
    }

    if (!confirmCloseLiveCoupon) {
      setConfirmCloseLiveCoupon(true);
      setMsg(
        `Confirm close: this will archive ${activeWeekLabel}, save the leaderboard to Historic Winners, and close public entries for that coupon.`
      );
      return;
    }

    setConfirmCloseLiveCoupon(false);
    await runAdminAction(
      'closeLiveCoupon',
      {},
      `${activeWeekLabel} closed and saved to Historic Winners.`
    );
  }

  function prepareNewCoupon() {
    const entryCount = selectedWeekEntries.length;

    if (!fixtures.length && !entryCount) {
      setConfirmNewCoupon(false);
      setMsg('Cannot start a new coupon because there are no fixtures or entries to archive.');
      return;
    }

    if (!confirmNewCoupon) {
      setConfirmNewCoupon(true);
      setMsg(
        `Confirm new coupon: this will archive then clear ${fixtures.length} fixture(s) and ${entryCount} entry/entries.`
      );
      return;
    }

    setConfirmNewCoupon(false);
    runAdminAction(
      'newCoupon',
      {
        week_id: currentWeekId || undefined,
        title: newCoupon.title,
        subtitle: newCoupon.subtitle,
        saveHistoric: newCoupon.saveHistoric,
      },
      'New coupon started. Previous coupon snapshot saved.'
    );
  }

  function restoreLatestArchive() {
    if (!latestArchive) {
      setMsg('No archive snapshot found to restore.');
      return;
    }

    runAdminAction(
      'restoreArchive',
      {},
      `Restored ${latestArchive.week_title || 'previous coupon'} from archive.`
    );
  }

  function deleteHistoricArchive(archive) {
    const archiveId = archive?.id || '';

    if (!archiveId) {
      setMsg('Historic winner record is missing an archive id.');
      return;
    }

    if (confirmDeleteArchiveId !== archiveId) {
      setConfirmDeleteArchiveId(archiveId);
      setMsg(`Confirm delete: remove ${archive.week_title || 'this historic winner page'} from Historic Winners.`);
      return;
    }

    setConfirmDeleteArchiveId('');
    runAdminAction(
      'deleteArchive',
      { archive_id: archiveId },
      `Removed ${archive.week_title || 'historic winner page'} from Historic Winners.`
    );
  }

  function updateArchivedEntryPayment(archive, entry, paid) {
    const archiveId = archive?.id || '';
    const entryId = entry?.id || '';

    if (!archiveId) {
      setMsg('Historic winner record is missing an archive id.');
      return;
    }

    if (!entryId) {
      setMsg('Archived entry is missing an entry id.');
      return;
    }

    runAdminAction(
      'updateArchivePayment',
      {
        archive_id: archiveId,
        entry_id: entryId,
        paid,
      },
      `${entry.name || 'Archived entry'} marked ${paid ? 'paid' : 'unpaid'} in archive.`
    );
  }

  function startEditEntry(entry) {
    setEditingEntryId(entry.id);
    setEntryDraft({
      name: entry.name || '',
      department: entry.department || '',
      predictions: JSON.parse(JSON.stringify(entry.predictions || {})),
    });
  }

  function updateEntryDraftPrediction(fixtureId, side, value) {
    setEntryDraft(current => ({
      ...current,
      predictions: {
        ...current.predictions,
        [fixtureId]: {
          ...(current.predictions?.[fixtureId] || {}),
          [side]: value,
        },
      },
    }));
  }

  function saveEntryDraft(entry) {
    const predictions = {};

    fixtures.forEach(fixture => {
      predictions[fixture.id] = {
        home: entryDraft.predictions?.[fixture.id]?.home ?? '',
        away: entryDraft.predictions?.[fixture.id]?.away ?? '',
      };
    });

    adminAction('updateEntry', {
      id: entry.id,
      name: entryDraft.name.trim(),
      department: entryDraft.department.trim(),
      predictions,
    });
    setEditingEntryId(null);
    setEntryDraft(null);
  }

  async function download(ref, name, options = {}) {
    const html2canvas = (await import('html2canvas')).default;
    const element = ref.current;
    if (!element) return;

    const previousMargin = element.style.margin;
    const previousBorderRadius = element.style.borderRadius;
    const width = Math.ceil(element.scrollWidth || element.getBoundingClientRect().width);
    const height = Math.ceil(element.scrollHeight || element.getBoundingClientRect().height);
    const maxPixels = isMobileAppleDevice() ? 9000000 : 18000000;
    const naturalScale = Math.min(2, window.devicePixelRatio || 2);
    const safeScale = Math.max(1, Math.min(naturalScale, Math.sqrt(maxPixels / Math.max(1, width * height))));

    if (options.flushToEdges) {
      element.style.margin = '0';
      element.style.borderRadius = '0';
    }

    try {
      const canvas = await html2canvas(element, {
        scale: safeScale,
        backgroundColor: options.backgroundColor || '#ffffff',
        useCORS: true,
        allowTaint: false,
        imageTimeout: 15000,
        logging: false,
        width,
        height,
        windowWidth: Math.max(document.documentElement.clientWidth, width),
        windowHeight: Math.max(document.documentElement.clientHeight, height),
        scrollX: 0,
        scrollY: -window.scrollY,
      });

      const blob = await canvasToBlob(canvas, options.type || 'image/png', options.quality || 1);
      saveGeneratedBlob(blob, name);
    } catch (error) {
      setMsg(error.message || 'Unable to create image download on this device.');
    } finally {
      element.style.margin = previousMargin;
      element.style.borderRadius = previousBorderRadius;
    }
  }

  function datedShareImageName(label) {
    const now = new Date();
    const pad = value => String(value).padStart(2, '0');
    const stamp = [
      now.getFullYear(),
      pad(now.getMonth() + 1),
      pad(now.getDate()),
    ].join('-');
    const time = `${pad(now.getHours())}-${pad(now.getMinutes())}`;

    return `${label} ${stamp} ${time}.jpg`;
  }

  function leaderboardDownloadName() {
    return datedShareImageName('Leaderboard');
  }

  function unpaidDownloadName() {
    return datedShareImageName('Yet to pay');
  }

  async function runLiveScoreSync({ quietMissingIds = false } = {}) {
    const res = await fetch('/api/live-scores', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-pass': admin,
      },
      body: JSON.stringify({ week_id: currentWeekId || undefined }),
    });
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      const error = json.error || 'Live score sync failed';
      if (!quietMissingIds || !/api fixture ids/i.test(error)) {
        setMsg(error);
      }
      return { ok: false, error };
    }

    setMsg(`Live score sync complete. Updated ${json.updated || 0} fixture(s).`);
    return { ok: true, updated: json.updated || 0 };
  }

  async function syncLiveScores() {
    const hasApiIds = fixtures.some(fixture => fixture.api_fixture_id);

    if (!hasApiIds) {
      setMsg('No API fixture IDs found. Updating fixture API data first...');
      const matched = await updateManualFixturesFromApi({ preferSavedFixtures: true });

      if (!matched) {
        setMsg('No API fixture IDs found. Use Update Fixture API Data after setting the coupon start date/season, or add API IDs in the TSV.');
        return;
      }
    }

    const firstSync = await runLiveScoreSync({ quietMissingIds: true });

    if (!firstSync.ok && /api fixture ids/i.test(firstSync.error || '')) {
      setMsg('Fixture API data was updated. Click Sync Live Scores again once the page reloads.');
    }
  }

  async function importTsv() {
    const lines = tsv
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean);

    if (!lines.length) {
      setMsg('Paste at least one TSV entry row.');
      return;
    }

    const parsed = lines.map((line, index) => {
      const parts = line.split(/\t/).map(part => part.trim());
      const rowNumber = index + 1;

      if (parts.length < 2 + fixtures.length) {
        return {
          rowNumber,
          error: `Row ${rowNumber} needs Name, Department, then ${fixtures.length} score(s).`,
        };
      }

      const predictions = {};

      fixtures.forEach((fixture, fixtureIndex) => {
        const m = (parts[fixtureIndex + 2] || '').match(/(\d+)\D+(\d+)/);

        predictions[fixture.id] = m
          ? { home: m[1], away: m[2] }
          : { home: '', away: '' };
      });

      return {
        rowNumber,
        entry: {
          week_id: currentWeekId || undefined,
          name: parts[0],
          department: parts[1],
          predictions,
          paid: false,
          payment_method: '',
        },
      };
    });

    const errors = parsed.filter(row => row.error).map(row => row.error);
    const missingNames = parsed
      .filter(row => !row.error && !row.entry.name)
      .map(row => `Row ${row.rowNumber} is missing a name.`);

    if (errors.length || missingNames.length) {
      setMsg([...errors, ...missingNames].slice(0, 3).join(' '));
      return;
    }

    const imported = await runAdminAction(
      'importEntries',
      { entries: parsed.map(row => row.entry) },
      `Imported ${parsed.length} TSV entr${parsed.length === 1 ? 'y' : 'ies'}.`
    );

    if (imported) setTsv('');
  }

  function exportEntriesTsv() {
    if (!selectedRanked.length) {
      setMsg('No submitted entries to export yet.');
      return;
    }

    const header = [
      'Name',
      'Department',
      ...fixtures.map((fixture, index) => `${index + 1}. ${fixture.home_team} v ${fixture.away_team}`),
      'Paid Status',
      'Payment Method',
      'Points',
    ].join('\t');
    const body = entriesToTsv(selectedRanked, fixtures);
    const blob = new Blob([`${header}\n${body}`], { type: 'text/tab-separated-values;charset=utf-8' });
    const safeTitle = String(week.title || 'rig-coupon-entries')
      .trim()
      .replace(/[\\/:*?"<>|]+/g, ' ')
      .replace(/\s+/g, '-');

    saveGeneratedBlob(blob, `${safeTitle || 'rig-coupon-entries'}-entries.tsv`);
    setMsg(`Exported ${selectedRanked.length} entr${selectedRanked.length === 1 ? 'y' : 'ies'} to TSV.`);
  }

  const fixtureSearchGroups = fixtureSearchResults.reduce((groups, fixture) => {
    const key = `${fixture.league_name || 'Other Fixtures'}${fixture.country ? ` (${fixture.country})` : ''}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(fixture);
    return groups;
  }, {});

  const availableApiLeagues = Object.values(
    fixtureSearchAllResults.reduce((leagues, fixture) => {
      const id = String(fixture.league_id || fixture.league_name || 'other');

      if (!leagues[id]) {
        leagues[id] = {
          id,
          name: fixture.league_name || 'Other Fixtures',
          country: fixture.country || '',
          season: fixture.season || '',
          priority: fixture.priority || 999,
          count: 0,
        };
      }

      leagues[id].count += 1;
      return leagues;
    }, {})
  ).sort(
    (a, b) =>
      Number(a.priority || 999) - Number(b.priority || 999) ||
      String(a.country || '').localeCompare(String(b.country || '')) ||
      String(a.name || '').localeCompare(String(b.name || ''))
  );
  const fixturePreviewSummary = fixturePreviewApiSummary(fixturePreview);
  const visiblePreviewRows = (fixturePreview?.rows || []).filter(row => {
    if (previewFilter === 'missing-badges') return !row.error && (!row.home_badge || !row.away_badge);
    if (previewFilter === 'missing-api') return !row.error && !row.api_fixture_id;
    if (previewFilter === 'errors') return !!row.error;
    return true;
  });
  const fixtureBadgeProvider = fixtureApiMeta?.badge_provider || '';
  const fixtureBadgeProviderError = fixtureApiMeta?.badge_provider_error || '';

  return (
    <div>
      <div className="adminWeekContext">
            <label>
              Editing coupon week
              <select
                value={currentWeekId}
                onChange={e => {
                  setSelectedWeekId(e.target.value);
                  setConfirmNewCoupon(false);
                }}
              >
                {allWeeks.map(item => (
                  <option key={item.id} value={item.id}>
                    {weekDisplayName(item)}
                  </option>
                ))}
              </select>
            </label>

            <div className="couponWeekStatus">
              <strong>{editingActiveWeek ? 'Live leaderboard week' : 'Staged / future coupon'}</strong>
              <span>
                Public leaderboard is using <b>{activeWeekLabel}</b>. Entries can still be prepared
                against a staged coupon before it goes live.
              </span>
            </div>

      </div>
      <AdminTabs>
        <section data-tab="setup" data-label="Coupon Setup">
          <h3>Coupon Weeks</h3>
          <div className="couponWeekManager">
            <div className="couponWeekActions">
              <button
                className={confirmActivateWeekId === currentWeekId ? 'dangerButton' : ''}
                disabled={!currentWeekId || editingActiveWeek}
                onClick={activateSelectedWeek}
              >
                {confirmActivateWeekId === currentWeekId ? 'Confirm Make Live' : 'Make Selected Week Live'}
              </button>

              <button
                className={confirmDeleteWeekId === currentWeekId ? 'dangerButton' : ''}
                disabled={!currentWeekId || editingActiveWeek}
                onClick={deleteSelectedDraftWeek}
              >
                {confirmDeleteWeekId === currentWeekId ? 'Confirm Delete Draft' : 'Delete Draft Coupon'}
              </button>
            </div>

            <div className="couponWeekCreate">
              <h4>Create Future Coupon</h4>
              <div className="grid2">
                <label>
                  Calendar year
                  <input
                    type="number"
                    value={newWeek.calendar_year}
                    onChange={e => setNewWeek({ ...newWeek, calendar_year: e.target.value })}
                  />
                </label>

                <label>
                  Calendar week
                  <input
                    type="number"
                    min="1"
                    max="53"
                    value={newWeek.calendar_week}
                    onChange={e => setNewWeek({ ...newWeek, calendar_week: e.target.value })}
                  />
                </label>
              </div>

              <input
                placeholder={`Special name optional, otherwise RIG Coupon Week ${newWeek.calendar_week || ''}`}
                value={newWeek.special_name}
                onChange={e => setNewWeek({ ...newWeek, special_name: e.target.value })}
              />

              <input
                placeholder="Subtitle / dates optional"
                value={newWeek.subtitle}
                onChange={e => setNewWeek({ ...newWeek, subtitle: e.target.value })}
              />

              <button onClick={createCouponWeek}>Create Coupon Week</button>
            </div>
          </div>

          <h3>Week Settings</h3>

          <input
            value={week.title || ''}
            onChange={e => setWeek({ ...week, title: e.target.value })}
          />

          <input
            value={week.subtitle || ''}
            onChange={e => setWeek({ ...week, subtitle: e.target.value })}
          />

          <div className="grid2">
            <label>
              Calendar year
              <input
                type="number"
                value={week.calendar_year || ''}
                onChange={e => setWeek({ ...week, calendar_year: e.target.value })}
              />
            </label>

            <label>
              Calendar week
              <input
                type="number"
                min="1"
                max="53"
                value={week.calendar_week || ''}
                onChange={e => setWeek({ ...week, calendar_week: e.target.value })}
              />
            </label>
          </div>

          <input
            placeholder="Special name optional"
            value={week.special_name || ''}
            onChange={e => setWeek({ ...week, special_name: e.target.value })}
          />

          <label>
            <input
              type="checkbox"
              checked={week.is_published !== false}
              onChange={e => setWeek({ ...week, is_published: e.target.checked })}
            />{' '}
            Published for entry
          </label>

          <button
            onClick={() => {
              const title = String(week.title || '').trim();

              if (!title) {
                setMsg('Week title is blank. Reload the admin page before saving week settings.');
                return;
              }

              adminAction('saveWeek', {
                ...week,
                id: currentWeekId || week.id,
                title,
                subtitle: String(week.subtitle || '').trim(),
                calendar_year: week.calendar_year ? Number(week.calendar_year) : null,
                calendar_week: week.calendar_week ? Number(week.calendar_week) : null,
                special_name: String(week.special_name || '').trim(),
                is_published: week.is_published !== false,
              });
            }}
          >
            Save Week
          </button>

          <h3>Coupon Settings</h3>

          <select
            value={settings.currency || 'GBP'}
            onChange={e => setSettings({ ...settings, currency: e.target.value })}
          >
            {CURRENCY_OPTIONS.map(c => (
              <option key={c}>{c}</option>
            ))}
          </select>

          <input
            type="number"
            value={settings.entry_fee || 10}
            onChange={e => setSettings({ ...settings, entry_fee: e.target.value })}
          />

          <label>
            Fixture time display
            <select
              value={String(settings.timezone_offset_minutes || 0)}
              onChange={e => {
                const option = TIMEZONE_OPTIONS.find(item => String(item.offset) === e.target.value);
                setSettings({
                  ...settings,
                  timezone_offset_minutes: Number(e.target.value),
                  timezone_label: option?.label || 'UK time only',
                });
              }}
            >
              {TIMEZONE_OPTIONS.map(option => (
                <option key={option.offset} value={option.offset}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <textarea
            value={settings.rules || DEFAULT_RULES_TEMPLATE}
            onChange={e => setSettings({ ...settings, rules: e.target.value })}
          />

          <label>
            <input
              type="checkbox"
              checked={!!settings.entries_released}
              onChange={e => setSettings({ ...settings, entries_released: e.target.checked })}
            />{' '}
            Release entries on leaderboard
          </label>

          <label className="settingCheckbox">
            <input
              type="checkbox"
              checked={!!settings.auto_live_scores}
              onChange={e => setSettings({ ...settings, auto_live_scores: e.target.checked })}
            />
            <span>
              <b>Automatic live score updates</b>
              <small>Checks live, half-time and full-time scores every five minutes for fixtures with API IDs.</small>
            </span>
          </label>

          <button
            onClick={() =>
              adminAction('saveSettings', {
                ...settings,
                week_id: currentWeekId || undefined,
                rules: settings.rules || DEFAULT_RULES_TEMPLATE,
              })
            }
          >
            Save Settings
          </button>

          <h3>Close Live Coupon</h3>
          <p>
            When all live fixtures are finished, archive the current leaderboard into Historic Winners and close
            the coupon.
          </p>

          <button
            className={confirmCloseLiveCoupon ? 'dangerButton' : ''}
            disabled={!activeWeekId}
            onClick={closeLiveCoupon}
          >
            {confirmCloseLiveCoupon ? 'Confirm Close Live Coupon' : 'Close Live Coupon'}
          </button>

          <h3>New Coupon</h3>
          <p>
            Saves a full snapshot first, optionally adds the winner to Historic Winners, then clears
            fixtures and entries for a fresh coupon.
          </p>

          <input
            placeholder="New coupon title"
            value={newCoupon.title}
            onChange={e => {
              setNewCoupon({ ...newCoupon, title: e.target.value });
              setConfirmNewCoupon(false);
            }}
          />

          <input
            placeholder="New coupon subtitle / dates"
            value={newCoupon.subtitle}
            onChange={e => {
              setNewCoupon({ ...newCoupon, subtitle: e.target.value });
              setConfirmNewCoupon(false);
            }}
          />

          <label>
            <input
              type="checkbox"
              checked={newCoupon.saveHistoric}
              onChange={e => setNewCoupon({ ...newCoupon, saveHistoric: e.target.checked })}
            />{' '}
            Save current leaderboard and predictions as Historic Winners
          </label>

          <button className={confirmNewCoupon ? 'dangerButton' : ''} onClick={prepareNewCoupon}>
            {confirmNewCoupon ? 'Confirm Start New Coupon' : 'Start New Coupon'}
          </button>

          <button disabled={!latestArchive} onClick={restoreLatestArchive}>
            Revert Last New Coupon
          </button>

        </section>
        <section data-tab="fixtures" data-label="Fixtures">
          <h3>Fixtures</h3>
          <p>
            Main workflow: paste fixtures from your FotMob picks, preview them, and replace the coupon directly.
            API data is optional and can be added afterwards for badges, corrected kick-off times, and live-score support.
          </p>

          <div className="tsvImportPanel">
            <h4>TSV / Screenshot Fixture Import</h4>
            <p>Paste: Home TAB Away TAB Kick-off TAB API Fixture ID optional</p>

            <textarea
              value={fixtureText}
              onChange={e => {
                setFixtureText(e.target.value);
                setFixturePreview(null);
                setConfirmReplace(false);
              }}
            />

            <div className="fixtureImportActions">
              <button onClick={previewFixtures}>Preview TSV Fixtures</button>
              <button onClick={updateManualFixturesFromApi} disabled={fixtureSearchLoading}>
                {fixtureSearchLoading ? 'Updating API Data...' : 'Update Preview API Data'}
              </button>
              <button
                className={confirmReplace ? 'dangerButton' : ''}
                disabled={!fixturePreview || fixturePreview.errors.length > 0}
                onClick={replacePreviewedFixtures}
              >
                {confirmReplace ? 'Confirm Replace Fixtures' : 'Replace Previewed Fixtures'}
              </button>
            </div>

            {fixturePreview && (
              <div className="fixturePreview">
                <div className={fixturePreview.errors.length ? 'previewStatus bad' : 'previewStatus good'}>
                  {fixturePreview.errors.length
                    ? `${fixturePreview.errors.length} issue(s) found`
                    : `${fixturePreview.fixtures.length} fixture(s) ready to import`}
                </div>

                {!fixturePreview.errors.length && (
                  <div
                    className={
                      fixturePreviewSummary.missing || fixturePreviewSummary.rowsMissingBadges
                        ? 'apiMatchSummary warning'
                        : 'apiMatchSummary good'
                    }
                  >
                    <span>
                      <strong>{fixturePreviewSummary.matched}</strong> API matched
                    </span>
                    <span>
                      <strong>{fixturePreviewSummary.missing}</strong> need API match
                    </span>
                    <span>
                      <strong>{fixturePreviewSummary.rowsMissingBadges}</strong> missing badges
                    </span>
                    <span>
                      <strong>{fixturePreviewSummary.total}</strong> total
                    </span>
                  </div>
                )}

                {!fixturePreview.errors.length && (
                  <div className="fixturePreviewTools">
                    <div className="previewFilterButtons">
                      <button
                        type="button"
                        className={previewFilter === 'all' ? 'on' : ''}
                        onClick={() => setPreviewFilter('all')}
                      >
                        All Rows
                      </button>
                      <button
                        type="button"
                        className={previewFilter === 'missing-badges' ? 'on' : ''}
                        onClick={() => setPreviewFilter('missing-badges')}
                      >
                        Missing Badges
                      </button>
                      <button
                        type="button"
                        className={previewFilter === 'missing-api' ? 'on' : ''}
                        onClick={() => setPreviewFilter('missing-api')}
                      >
                        Missing API
                      </button>
                    </div>

                    <div className="previewProviderStatus">
                      <span>
                        Badge source: <strong>{fixtureBadgeProvider || 'none yet'}</strong>
                      </span>
                      {fixtureBadgeProviderError && <small>{fixtureBadgeProviderError}</small>}
                    </div>
                  </div>
                )}

                <div className="scroll">
                  <table className="previewTable">
                    <thead>
                      <tr>
                        <th>Row</th>
                        <th>Home</th>
                        <th>Away</th>
                        <th>Kick-off</th>
                        <th>API ID</th>
                        <th>Badges</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visiblePreviewRows.map(row => (
                        <tr
                          className={
                            row.error
                              ? 'previewError'
                              : row.api_fixture_id && row.home_badge && row.away_badge
                                ? 'previewApiMatched'
                                : 'previewApiMissing'
                          }
                          key={`${row.line}-${row.raw}`}
                        >
                          <td>{row.line}</td>
                          <td>
                            <TeamLabel badge={row.home_badge} name={row.home_team || row.home || '-'} />
                          </td>
                          <td>
                            <TeamLabel badge={row.away_badge} name={row.away_team || row.away || '-'} />
                          </td>
                          <td>{row.kickoff || 'TBC'}</td>
                          <td>{row.api_fixture_id || '-'}</td>
                          <td>
                            {row.error
                              ? '-'
                              : row.home_badge && row.away_badge
                                ? 'Ready'
                                : 'Missing'}
                          </td>
                          <td>
                            {row.error
                              ? row.error
                              : row.api_fixture_id
                                ? row.home_badge && row.away_badge
                                  ? 'API + badges ready'
                                  : 'API matched, badges incomplete'
                                : row.home_badge || row.away_badge
                                  ? 'Badge-only fallback used'
                                  : 'Needs API match'}
                          </td>
                          <td>
                            <button
                              type="button"
                              className="removePreviewFixtureButton"
                              onClick={() => removePreviewFixture(row)}
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                      {!visiblePreviewRows.length && (
                        <tr>
                          <td colSpan="8">No rows match this preview filter.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          <h4>Optional API Fixture Search</h4>
          <p>Pick a start date and number of days. Search lists every league or cup with fixtures in that period, then choose leagues and list the fixtures.</p>

          <div className="fixtureSearchPanel">
            <div className="fixtureSearchStep">
              <b>1</b>
              <span>Choose search period</span>
            </div>

            <div className="fixtureSearchControls">
              <label>
                Starts
                <input
                  type="date"
                  value={fixtureSearch.from}
                  onChange={e => {
                    resetFixtureSearchDiscovery();
                    setFixtureSearch({
                      ...fixtureSearch,
                      from: e.target.value,
                    });
                  }}
                />
              </label>

              <label>
                Number of days
                <input
                  min="1"
                  max="31"
                  type="number"
                  value={fixtureSearch.days}
                  onChange={e => {
                    resetFixtureSearchDiscovery();
                    setFixtureSearch({ ...fixtureSearch, days: e.target.value });
                  }}
                />
              </label>

              <div className="fixtureSearchRangePreview">
                <small>Searches through</small>
                <strong>{fixtureSearchTo || 'Select start date'}</strong>
              </div>
            </div>

            <div className="fixtureSearchActions">
              <button onClick={findAvailableLeagues} disabled={fixtureSearchLoading}>
                {fixtureSearchLoading ? 'Searching...' : 'Search Leagues'}
              </button>
            </div>

            <details className="fixtureSearchAdvanced">
              <summary>Advanced search options</summary>

              <div className="fixtureSearchControls advancedFixtureControls">
                <label>
                  Season
                  <input
                    placeholder="2026"
                    value={fixtureSearch.season}
                    onChange={e => {
                      resetFixtureSearchDiscovery();
                      setFixtureSearch({ ...fixtureSearch, season: e.target.value });
                    }}
                  />
                </label>

                <label>
                  Direct league IDs or names
                  <input
                    placeholder="Optional override: World Cup, 1, 39"
                    value={fixtureSearch.leagues}
                    onChange={e => {
                      resetFixtureSearchDiscovery();
                      setFixtureSearch({ ...fixtureSearch, leagues: e.target.value });
                    }}
                  />
                </label>
              </div>

              <div className="fixtureSearchActions">
                <button onClick={searchApiFixtures} disabled={fixtureSearchLoading}>
                  Direct Fixture Search
                </button>
              </div>
            </details>

            {!!availableApiLeagues.length && (
              <div className="leaguePicker">
                <div className="fixtureSearchStep">
                  <b>2</b>
                  <span>Select leagues or cup competitions</span>
                </div>

                <div className="fixtureSearchSummary">
                  <strong>{availableApiLeagues.length} league(s) available</strong>
                  <span>
                    {Object.values(selectedApiLeagues).filter(Boolean).length} selected
                  </span>
                  <span>{savedApiLeagues.length} saved</span>
                  <div className="fixtureSearchSummaryActions">
                    <button type="button" onClick={saveCurrentLeagueSelections}>
                      Save Current Selections
                    </button>
                    <button type="button" onClick={listSavedLeagueFixtures}>
                      List Saved Fixtures
                    </button>
                  </div>
                </div>

                <div className="leaguePickerGrid">
                  {availableApiLeagues.map(league => {
                    return (
                      <div className="leaguePickerItem" key={league.id}>
                        <label className="leaguePickerHeader">
                          <input
                            type="checkbox"
                            checked={!!selectedApiLeagues[league.id]}
                            onChange={() => toggleApiLeague(league.id)}
                          />
                          <span>
                            <strong>{league.name}</strong>
                            <small>
                              {league.country || 'International'}
                              {league.season ? ` · ${league.season}` : ''} · {league.count} fixture{league.count === 1 ? '' : 's'}
                            </small>
                          </span>
                        </label>
                      </div>
                    );
                  })}
                </div>

                <div className="fixtureSearchActions">
                  <button
                    onClick={listSelectedLeagueFixtures}
                    disabled={!Object.values(selectedApiLeagues).some(Boolean)}
                  >
                    List Fixtures
                  </button>
                </div>
              </div>
            )}

            {!!fixtureSearchResults.length && (
              <div className="fixtureSearchResults">
                <div className="fixtureSearchStep">
                  <b>3</b>
                  <span>Select fixtures</span>
                </div>

                <div className="fixtureSearchSummary">
                  <strong>{fixtureSearchResults.length} fixture(s) found</strong>
                  <span>{Object.values(selectedApiFixtures).filter(Boolean).length} selected</span>
                  <div className="fixtureSearchSummaryActions">
                    <button
                      onClick={() => useSelectedApiFixtures()}
                      disabled={!Object.values(selectedApiFixtures).some(Boolean)}
                    >
                      Use Selected Fixtures
                    </button>
                    <button
                      onClick={() => useSelectedApiFixtures({ append: true })}
                      disabled={!Object.values(selectedApiFixtures).some(Boolean)}
                    >
                      Add Fixtures
                    </button>
                  </div>
                </div>

                <div className="apiFixtureGroups">
                  {Object.entries(fixtureSearchGroups).map(([group, groupFixtures]) => (
                    <section className="apiFixtureGroup" key={group}>
                      <h4>{group}</h4>

                      {groupFixtures.map(fixture => {
                        const selectionKey = apiFixtureSelectionKey(fixture);

                        return (
                        <label className="apiFixtureRow" key={selectionKey}>
                          <input
                            type="checkbox"
                            checked={!!selectedApiFixtures[selectionKey]}
                            onChange={() => toggleApiFixture(selectionKey)}
                          />

                          <TeamLabel
                            align="right"
                            badge={fixture.home_badge}
                            name={fixture.home_team}
                          />

                          <strong>{fixture.kickoff?.split(' ')[1] || 'TBC'}</strong>

                          <TeamLabel
                            badge={fixture.away_badge}
                            name={fixture.away_team}
                          />
                        </label>
                        );
                      })}
                    </section>
                  ))}
                </div>
              </div>
            )}
          </div>

        </section>
        <section data-tab="results" data-label="Results">
          <div className="fixtureApiActions">
            <button onClick={syncLiveScores}>Sync Live Scores</button>
            <button
              className={confirmClearResults ? 'dangerButton' : ''}
              onClick={clearAllResults}
            >
              {confirmClearResults ? 'Confirm Clear All Scores' : 'Clear All Scores'}
            </button>
          </div>

          <div className="scoreHeader">
            <h3>Live Scores / Results</h3>
            <span className={`scoreSaveState ${scoreSaveState}`}>
              {scoreSaveState === 'pending' && 'Autosave pending'}
              {scoreSaveState === 'saving' && 'Saving scores...'}
              {scoreSaveState === 'saved' && 'Scores saved'}
              {scoreSaveState === 'error' && 'Autosave failed'}
              {scoreSaveState === 'idle' && 'Autosave ready'}
            </span>
          </div>

          <div>
            {fixtures.map(f => {
              const draft = scoreDrafts[f.id] || {};

              return (
              <div className="fixture liveScoreFixture" key={f.id}>
                <span className="liveScoreTeams">
                  <strong>{f.home_team}</strong>
                  <small>v</small>
                  <strong>{f.away_team}</strong>
                </span>

                <label>
                  <small>Home</small>
                  <input
                    type="number"
                    min="0"
                    inputMode="numeric"
                    placeholder="H"
                    value={draft.home_score ?? ''}
                    onChange={e => updateScoreDraft(f.id, 'home_score', e.target.value)}
                  />
                </label>

                <span className="scoreDash">-</span>

                <label>
                  <small>Away</small>
                  <input
                    type="number"
                    min="0"
                    inputMode="numeric"
                    placeholder="A"
                    value={draft.away_score ?? ''}
                    onChange={e => updateScoreDraft(f.id, 'away_score', e.target.value)}
                  />
                </label>

                <label className="halfTimeScore">
                  <small>HT H</small>
                  <input
                    type="number"
                    min="0"
                    inputMode="numeric"
                    placeholder="HT H"
                    value={draft.ht_home_score ?? ''}
                    onChange={e => updateScoreDraft(f.id, 'ht_home_score', e.target.value)}
                  />
                </label>

                <label className="halfTimeScore">
                  <small>HT A</small>
                  <input
                    type="number"
                    min="0"
                    inputMode="numeric"
                    placeholder="HT A"
                    value={draft.ht_away_score ?? ''}
                    onChange={e => updateScoreDraft(f.id, 'ht_away_score', e.target.value)}
                  />
                </label>

                <label className="scoreStatus">
                  <small>Status</small>
                  <select
                    value={draft.status || 'NS'}
                    onChange={e => updateScoreDraft(f.id, 'status', e.target.value)}
                  >
                    <option value="NS">NS</option>
                    <option value="LIVE">LIVE</option>
                    <option value="HT">HT</option>
                    <option value="FT">FT</option>
                    <option value="AET">AET</option>
                    <option value="PEN">PEN</option>
                  </select>
                </label>
              </div>
              );
            })}
          </div>

          <button onClick={() => saveScoreDrafts(scoreDrafts)}>
            Save Results Now
          </button>
        </section>
        <section data-tab="entries" data-label="Entries & Payments">
      <h3>Entries / Payments</h3>
      <p>
        Showing entries for <strong>{week.title || 'selected coupon'}</strong>
        {editingActiveWeek ? ' (live leaderboard).' : ' (staged coupon).'}
      </p>

      <table className="adminEntriesTable">
        <thead>
          <tr>
            <th>Name</th>
            <th>Department</th>
            <th>Points</th>
            <th>Paid</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {selectedRanked.map(e => (
            <Fragment key={e.id}>
              <tr>
                <td>{e.name}</td>
                <td>{e.department}</td>
                <td>{e.pts}</td>
                <td>
                  <button
                    onClick={() =>
                      adminAction('updateEntry', {
                        id: e.id,
                        paid: !e.paid,
                      })
                    }
                  >
                    {e.paid ? 'Paid ✅' : 'Unpaid ❌'}
                  </button>
                </td>
                <td>
                  <button onClick={() => startEditEntry(e)}>Edit Scores</button>
                  <button onClick={() => adminAction('deleteEntry', { id: e.id })}>
                    Delete
                  </button>
                </td>
              </tr>

              {editingEntryId === e.id && entryDraft && (
                <tr className="entryEditorTableRow">
                  <td colSpan="5">
                    <div className="entryEditor">
                      <div className="grid2">
                        <input
                          value={entryDraft.name}
                          onChange={event =>
                            setEntryDraft(current => ({ ...current, name: event.target.value }))
                          }
                        />
                        <input
                          value={entryDraft.department}
                          onChange={event =>
                            setEntryDraft(current => ({
                              ...current,
                              department: event.target.value,
                            }))
                          }
                        />
                      </div>

                      <div className="entryPredictionEditor">
                        {fixtures.map(fixture => (
                          <div className="entryPredictionRow" key={fixture.id}>
                            <span>
                              {fixture.home_team} v {fixture.away_team}
                            </span>
                            <input
                              type="number"
                              min="0"
                              placeholder="H"
                              value={entryDraft.predictions?.[fixture.id]?.home ?? ''}
                              onChange={event =>
                                updateEntryDraftPrediction(fixture.id, 'home', event.target.value)
                              }
                            />
                            <b>-</b>
                            <input
                              type="number"
                              min="0"
                              placeholder="A"
                              value={entryDraft.predictions?.[fixture.id]?.away ?? ''}
                              onChange={event =>
                                updateEntryDraftPrediction(fixture.id, 'away', event.target.value)
                              }
                            />
                          </div>
                        ))}
                      </div>

                      <div className="entryEditorActions">
                        <button onClick={() => saveEntryDraft(e)}>Save Edited Entry</button>
                        <button
                          onClick={() => {
                            setEditingEntryId(null);
                            setEntryDraft(null);
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
          {!selectedRanked.length && (
            <tr>
              <td colSpan="5">No entries submitted for this selected coupon week yet.</td>
            </tr>
          )}
        </tbody>
      </table>

      <h3>TSV Paper Entry Import</h3>
      <p>One entry per line: Name TAB Department TAB 1-0 TAB 2-1 etc</p>

      <textarea value={tsv} onChange={e => setTsv(e.target.value)} />

      <button onClick={importTsv}>Import TSV Entries</button>
      <button onClick={exportEntriesTsv}>Export All Entries TSV</button>

        </section>
        <section data-tab="share" data-label="Share Images">
      <h3>Share Images</h3>

      <div className="adminPrintCoupon">
        <OldSchool key={`print-${selectedWeekKey}`} buttonOnly
          week={selectedWeek} fixtures={selectedWeekFixtures} settings={selectedWeekSettings}
          entryDeadline={entryDeadlineFor(selectedWeekFixtures)} />
        <p>Prints a blank PDF for <strong>{selectedWeek.title || 'the selected coupon week'}</strong> using its saved fixtures and settings. You can print future coupons before publishing them; printing does not release them online.</p>
        {!selectedWeekFixtures.length && <p>Add and save fixtures for this week to enable printing.</p>}
      </div>

      <FixtureImageExport key={selectedWeekKey} preview={fixturePreview}
        parseKickoff={parseKickoff} download={download} setMsg={setMsg} />

      <button
        onClick={() =>
          download(imgRef, leaderboardDownloadName(), {
            backgroundColor: '#07172d',
            flushToEdges: true,
            quality: 0.95,
            type: 'image/jpeg',
          })
        }
      >
        Download Mobile Leaderboard JPG
      </button>

      <button
        onClick={() =>
          download(unpaidImgRef, unpaidDownloadName(), {
            backgroundColor: '#07172d',
            flushToEdges: true,
            quality: 0.95,
            type: 'image/jpeg',
          })
        }
      >
        Download Yet To Pay JPG
      </button>

      <button onClick={() => download(entriesImgRef, 'released-entries.png')}>
        Download Entries Matrix PNG
      </button>

      <div className={`share leaderboardShare ${leaderboardShareDensity}`} ref={imgRef}>
        <div className="shareHeader">
          <span>RIG Football Coupon</span>
          <h1>{state.week.title}</h1>
          {state.week.subtitle && <p>{state.week.subtitle}</p>}
        </div>

        <div className="shareMeta">
          <div>
            <small>Prize Fund</small>
            <strong>
              {sym(state.settings?.currency || 'USD')}
              {pot}
            </strong>
          </div>
          <div>
            <small>Players</small>
            <strong>{ranked.length}</strong>
          </div>
          <div>
            <small>Games Played</small>
            <strong>
              {activeGamesPlayed}/{state.fixtures?.length || 0}
            </strong>
          </div>
        </div>

        <div className="shareRows">
          {ranked.map((e, i) => (
            <div className={leaderboardPosition(ranked, i) === 1 ? 'shareRow leader' : 'shareRow'} key={e.id}>
              <b>{leaderboardPosition(ranked, i)}</b>
              <span>
                <strong>{e.name}</strong>
                {e.department && <small>{e.department}</small>}
              </span>
              <em>{e.pts} pts</em>
            </div>
          ))}
        </div>

        <p className="shareFooter">Players on the same points share the same position.</p>
      </div>

      <div className="share paymentShare" ref={unpaidImgRef}>
        <div className="shareHeader">
          <span>RIG Football Coupon</span>
          <h1>Yet To Pay</h1>
          <p>{state.week.title}</p>
          {state.week.subtitle && <p>{state.week.subtitle}</p>}
        </div>

        <div className="shareMeta paymentMeta">
          <div>
            <small>Outstanding</small>
            <strong>{activeUnpaidEntries.length}</strong>
          </div>
          <div>
            <small>Paid</small>
            <strong>{ranked.length - activeUnpaidEntries.length}</strong>
          </div>
          <div>
            <small>Entry Fee</small>
            <strong>
              {sym(state.settings?.currency || 'USD')}
              {state.settings?.entry_fee || 10}
            </strong>
          </div>
        </div>

        <div className="shareRows">
          {activeUnpaidEntries.length ? (
            activeUnpaidEntries.map((entry, index) => (
              <div className="shareRow paymentRow" key={entry.id}>
                <b>{index + 1}</b>
                <span>
                  <strong>{entry.name}</strong>
                  {entry.department && <small>{entry.department}</small>}
                </span>
                <em>To pay</em>
              </div>
            ))
          ) : (
            <div className="shareEmpty">
              <strong>All paid</strong>
              <small>No outstanding entries</small>
            </div>
          )}
        </div>

        <p className="shareFooter">Marked paid in Admin once payment is received.</p>
      </div>

      <div className="entriesShare" ref={entriesImgRef}>
        <EntriesMatrixExport
          entries={ranked}
          fixtures={fixtures}
          settings={state.settings}
          week={state.week}
        />
      </div>
        </section>
        <section data-tab="history" data-label="History">
          <h3>Historic Winners Admin</h3>
          <p>View and remove saved winner pages from the Historic Winners section.</p>

          <div className="archiveAdminList">
            {historicArchives.length ? (
              historicArchives.map(archive => {
                const leaderboard = Array.isArray(archive.leaderboard) ? archive.leaderboard : [];
                const snapshotEntries = Array.isArray(archive.snapshot?.entries) ? archive.snapshot.entries : [];
                const paymentRows = leaderboard.length ? leaderboard : snapshotEntries;
                const unpaidRows = paymentRows.filter(entry => entry && entry.paid !== true);
                const winners = archiveWinners(archive, leaderboard);
                const winnerLabel = winners.length > 1
                  ? `Split: ${winners.map(entry => entry.name).join(', ')}`
                  : winners[0]?.name || 'No winner recorded';
                const winnerPoints = winners[0]?.pts ?? archive.winner_points ?? leaderboard[0]?.pts ?? 0;
                const isConfirmingDelete = confirmDeleteArchiveId === archive.id;

                return (
                  <div className="archiveAdminItem" key={archive.id}>
                    <div className="archiveAdminText">
                      <strong>{archive.week_title || 'RIG Coupon'}</strong>
                      <span>{archive.week_subtitle || formatArchiveDate(archive.created_at) || 'Historic winner page'}</span>
                      <small>{winnerLabel} • {winnerPoints} pts</small>

                      <div className={unpaidRows.length ? 'archiveUnpaidList' : 'archiveUnpaidList allPaid'}>
                        {unpaidRows.length ? (
                          <>
                            <b>{`Unpaid at archive: ${unpaidRows.length}`}</b>
                            <span>Tick entrants off here when they pay after the coupon has been archived.</span>
                          </>
                        ) : (
                          <b>ALL PAID!</b>
                        )}
                        {unpaidRows.length && paymentRows.length ? (
                          <div className="archivePaymentChecks">
                            {paymentRows.map(entry => (
                              <label key={entry.id || `${entry.name}-${entry.department}`}>
                                <input
                                  type="checkbox"
                                  checked={entry.paid === true}
                                  onChange={event => updateArchivedEntryPayment(archive, entry, event.target.checked)}
                                />
                                <span>
                                  {entry.name || 'Unnamed entry'}
                                  {entry.department ? ` (${entry.department})` : ''}
                                </span>
                              </label>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <button
                      className={isConfirmingDelete ? 'dangerButton' : ''}
                      onClick={() => deleteHistoricArchive(archive)}
                    >
                      {isConfirmingDelete ? 'Confirm Remove' : 'Remove'}
                    </button>
                  </div>
                );
              })
            ) : (
              <div className="archiveAdminEmpty">No historic winner pages saved yet.</div>
            )}
          </div>
        </section>
      </AdminTabs>
    </div>
  );
}
