import { Fragment, useEffect, useMemo, useRef, useState } from 'react';

const resultOf = (h, a) => (h > a ? 'H' : h < a ? 'A' : 'D');
const hasScore = f =>
  f.home_score !== null &&
  f.home_score !== undefined &&
  f.away_score !== null &&
  f.away_score !== undefined;

function points(pred, fix) {
  if (
    fix.home_score === null ||
    fix.away_score === null ||
    fix.home_score === undefined ||
   fix.away_score === undefined
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

const sym = c => ({ GBP: '£', USD: '$', EUR: '€', NAD: 'N$', ZAR: 'R' }[c] || `${c} `);

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

const parseKickoff = kickoff => {
  if (!kickoff) return null;

  const value = String(kickoff).trim();
  const [datePart, timePart] = value.split(' ');

  if (datePart?.includes('/') && timePart) {
    const [day, month, year] = datePart.split('/').map(Number);
    const [hour, minute] = timePart.split(':').map(Number);

    if (day && month && year) {
      return new Date(year, month - 1, day, hour || 0, minute || 0);
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

const entryDeadlineFor = fixtures => {
  const firstKickoff = firstKickoffFor(fixtures);
  return firstKickoff ? new Date(firstKickoff.getTime() - 60 * 1000) : null;
};

const formatDateTime = date =>
  date.toLocaleString('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

const formatArchiveDate = value => {
  const date = value ? new Date(value) : null;

  if (!date || Number.isNaN(date.getTime())) return '';

  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

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

  if (selectedOnly) {
    return hasLocalTime ? `${formatDateTime(localDate)} (${label})` : `${formatDateTime(ukDate)} (UK)`;
  }

  if (hasLocalTime) {
    return `UK: ${formatDateTime(ukDate)} | ${label}: ${formatDateTime(localDate)}`;
  }

  return `UK: ${formatDateTime(ukDate)}`;
};

export default function Home() {
  const [state, setState] = useState(null);
  const [tab, setTab] = useState('home');
  const [admin, setAdmin] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [msg, setMsg] = useState('');
  const [now, setNow] = useState(new Date());
  const [form, setForm] = useState({ name: '', department: '', predictions: {} });

  const imgRef = useRef(null);
  const entriesImgRef = useRef(null);

  const load = () =>
    fetch('/api/state')
      .then(r => r.json())
      .then(data => {
        setState({
          week: data?.week || {},
          fixtures: Array.isArray(data?.fixtures) ? data.fixtures : [],
          entries: Array.isArray(data?.entries) ? data.entries : [],
          settings: data?.settings || {},
          archives: Array.isArray(data?.archives) ? data.archives : [],
        });
      })
      .catch(e => {
        setMsg(e.message);
        setState({
          week: { id: null, title: 'DMI Coupon', subtitle: '' },
          fixtures: [],
          entries: [],
          settings: {
            currency: 'GBP',
            entry_fee: 10,
            rules: '',
            entries_released: false,
          },
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
        <h1>DMI Coupon</h1>
        <p>Loading… {msg}</p>
      </main>
    );
  }

  const { week = {}, fixtures = [], settings = {}, entries = [], archives = [] } = state || {};

  const maxPts = fixtures.length * 3;
  const stake = Number(settings?.entry_fee || 10);
  const pot = entries.length * stake;

  const entryDeadline = entryDeadlineFor(fixtures);

  const entriesOpen = entryDeadline ? now < entryDeadline : true;

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

    const r = await fetch('/api/entry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, week_id: week.id }),
    });

    const j = await r.json();

    if (!r.ok) {
      setMsg(j.error || 'Entry failed');
      return;
    }

    setMsg('Entry submitted ✅');
    setForm({ name: '', department: '', predictions: {} });
    load();
    setTab('leaderboard');
  }

  const nav = ['home', 'old school', 'enter coupon', 'leaderboard', 'historic winners', 'admin'];

  return (
    <>
      <header>
        <b>{week.title || 'DMI Coupon'}</b>
        <nav>
          {nav.map(n => (
            <button
              className={tab === n ? 'on' : ''}
              onClick={() => setTab(n)}
              key={n}
            >
              {n === 'old school' ? 'Old School' : n.replace(/\b\w/g, m => m.toUpperCase())}
            </button>
          ))}
        </nav>
      </header>

      <main className="wrap">
        {msg && <div className="msg">{msg}</div>}

        <WinnerBanner ranked={ranked} fixtures={fixtures} />

        {tab === 'home' && (
          <section className="card">
            <h1>{week.title || 'DMI Coupon'}</h1>
            <p>{week.subtitle}</p>

            <div className="stats">
              <b>{fixtures.length}</b> fixtures
              <b>{entries.length}</b> entries
              <b>{entries.filter(e => e.paid).length}</b> paid
              <b>{maxPts}</b> max points
              <b>
                {sym(settings?.currency || 'USD')}
                {pot}
              </b>{' '}
              pot
            </div>

            {entryDeadline && (
              <p>
                {entriesOpen
                  ? `⏰ Entries close in: ${countdownText}`
                  : `🔒 Entries closed at ${entryDeadline.toLocaleString('en-GB')}`}
              </p>
            )}

            <p style={{ whiteSpace: 'pre-line' }}>{settings?.rules}</p>
          </section>
        )}

        {tab === 'old school' && (
          <OldSchool
            week={week}
            fixtures={fixtures}
            settings={settings}
            maxPts={maxPts}
            entryDeadline={entryDeadline}
          />
        )}

        {tab === 'enter coupon' && (
          <section className="card">
            {!entriesOpen ? (
              <>
                <h2>Entries Closed</h2>
                <p>Entries closed at {entryDeadline?.toLocaleString('en-GB')}</p>
                <p>Good luck everyone ⚽</p>
              </>
            ) : (
              <>
                <h2>Enter Coupon</h2>

                <form onSubmit={submitEntry}>
                  <div className="grid2">
                    <input
                      required
                      placeholder="Name"
                      value={form.name}
                      onChange={e => setForm({ ...form, name: e.target.value })}
                    />

                    <input
                      placeholder="Department"
                      value={form.department}
                      onChange={e => setForm({ ...form, department: e.target.value })}
                    />
                  </div>

                  <FixtureInputs
                    fixtures={fixtures}
                    predictions={form.predictions}
                    setPredictions={p => setForm({ ...form, predictions: p })}
                    settings={settings}
                  />

                  {entryDeadline && <p>Entries close: {entryDeadline.toLocaleString('en-GB')}</p>}

                  <button type="submit" className="primary" disabled={!entriesOpen}>
                    {entriesOpen ? 'Submit Entry' : 'Entries Closed'}
                  </button>
                </form>
              </>
            )}
          </section>
        )}

        {tab === 'leaderboard' && (
          <Leaderboard
            ranked={ranked}
            fixtures={fixtures}
            settings={settings}
            maxPts={maxPts}
            pot={pot}
          />
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
                  entriesImgRef={entriesImgRef}
                  admin={admin}
                  load={load}
                />
              </>
            )}
          </section>
        )}
      </main>
    </>
  );
}

function FixtureInputs({ fixtures, predictions, setPredictions, settings = {} }) {
  return (
    <div>
      {fixtures.map(f => (
        <div className="fixture" key={f.id}>
          <span>
            {f.home_team} v {f.away_team}
            {f.kickoff && <small className="fixtureKickoffDisplay">{formatKickoff(f.kickoff, settings)}</small>}
          </span>

          <input
            type="number"
            min="0"
            value={predictions[f.id]?.home || ''}
            onChange={e =>
              setPredictions({
                ...predictions,
                [f.id]: {
                  ...(predictions[f.id] || {}),
                  home: e.target.value,
                },
              })
            }
          />

          <b>-</b>

          <input
            type="number"
            min="0"
            value={predictions[f.id]?.away || ''}
            onChange={e =>
              setPredictions({
                ...predictions,
                [f.id]: {
                  ...(predictions[f.id] || {}),
                  away: e.target.value,
                },
              })
            }
          />
        </div>
      ))}
    </div>
  );
}

function Leaderboard({ ranked, fixtures, settings = {}, maxPts, pot }) {
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
  const stake = Number(settings?.entry_fee || 10);
  const fullPot = playersEntered * stake;

  return (
    <section className="card">
      <h2>DMI Coupon Dashboard</h2>

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
                  <td>{i + 1}</td>
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

      {!predictionsReleased && (
        <p>All predictions will be shown here once entries are released.</p>
      )}
    </section>
  );
}

function EntriesMatrix({ entries, fixtures, settings = {}, maxPts, pot }) {
  const fixtureResult = f => {
    if (
      f.home_score === null ||
      f.home_score === undefined ||
      f.away_score === null ||
      f.away_score === undefined
    ) {
      return '-';
    }

    if (f.home_score > f.away_score) return '1';
    if (f.home_score < f.away_score) return '2';
    return 'X';
  };

  const predictionClass = (entry, fixture) => {
    const pts = points(entry.predictions?.[fixture.id], fixture);

    if (pts === 3) return 'exactScore';
    if (pts === 1) return 'correctResult';
    return '';
  };

  const stake = Number(settings?.entry_fee || 10);
  const prizeFund = entries.length * stake;

  return (
    <div className="predictionLayout">
      <div className="predictionMain scroll">
        <table className="matrix resultsMatrix">
          <thead>
            <tr>
              <th className="nameHeader"></th>
              {fixtures.map(f => (
                <th key={f.id} className="angledHeader">
                  <span>
                    {f.home_team} v {f.away_team}
                  </span>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            <tr>
              <td><b>SCORE</b></td>
              {fixtures.map(f => (
                <td key={f.id}>
                  {f.home_score ?? '-'}-{f.away_score ?? '-'}
                </td>
              ))}
            </tr>

            <tr>
              <td><b>STATUS</b></td>
              {fixtures.map(f => (
                <td key={f.id}>
                  {f.status || 'NS'}
                  {f.ht_home_score !== null &&
                    f.ht_home_score !== undefined &&
                    f.ht_away_score !== null &&
                    f.ht_away_score !== undefined &&
                    ` HT ${f.ht_home_score}-${f.ht_away_score}`}
                </td>
              ))}
            </tr>

            <tr>
              <td><b>RESULT</b></td>
              {fixtures.map(f => (
                <td key={f.id}>{fixtureResult(f)}</td>
              ))}
            </tr>

            {entries.map(e => (
              <tr key={e.id}>
                <td>{e.name} {e.department}</td>
                {fixtures.map(f => (
                  <td key={f.id} className={predictionClass(e, f)}>
                    {e.predictions?.[f.id]?.home ?? ''}-
                    {e.predictions?.[f.id]?.away ?? ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <aside className="predictionSide">
        <h3>League Table</h3>

        <table className="miniLeague">
          <thead>
            <tr>
              <th>Pos.</th>
              <th>Player</th>
              <th>Points</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => (
              <tr key={e.id}>
                <td>{i + 1}</td>
                <td>{e.name} {e.department}</td>
                <td><b>{e.pts}</b></td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="legendBox greenBox">
          1 Point for correct result
        </div>

        <div className="legendBox blueBox">
          3 Points for correct score
        </div>

        <div className="prizeBox">
          <b>Prize Fund</b>
          <strong>{sym(settings?.currency || 'USD')}{prizeFund}</strong>
        </div>
      </aside>

    </div>
  );
}

function EntriesMatrixExport({ entries, fixtures, settings = {}, week = {} }) {
  return (
    <div className="entriesMatrixExport">
      <div className="entriesExportHeader">
        <div>
          <span>DMI Football Coupon</span>
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

function WinnerBanner({ ranked = [], fixtures = [] }) {
  const winner = ranked[0];
  const allGamesFinished = fixtures.length > 0 && fixtures.every(hasScore);

  if (!allGamesFinished || !winner) return null;

  return (
    <div className="winnerBanner">
      This week&apos;s prize goes to <strong>{winner.name}</strong>{' '}
      {winner.department ? `(${winner.department})` : ''} who finishes on{' '}
      <strong>{winner.pts}</strong> points. Congratulations and well played!
    </div>
  );
}

function OldSchool({ week, fixtures, settings = {}, maxPts, entryDeadline }) {
  const rules = String(settings?.rules || '')
    .split(/\d+\)/)
    .map(rule => rule.trim())
    .filter(Boolean);

  return (
    <section className="paper couponSheet">
      <div className="printButtonWrap">
        <button onClick={() => window.print()}>Print / Save PDF</button>
      </div>

      <div className="couponBox">
        <h1>
          <span>DMI</span> Football Coupon
        </h1>

        <div className="couponFixtures">
          {fixtures.map(f => (
            <div className="couponFixture" key={f.id}>
              <div className="couponFixtureLine">
                <div className="team home">{f.home_team}</div>
                <div className="scoreCell"></div>
                <div className="versus">v</div>
                <div className="scoreCell"></div>
                <div className="team away">{f.away_team}</div>
              </div>
              <small className="couponKickoff">{formatKickoff(f.kickoff, settings, true)}</small>
            </div>
          ))}
        </div>
      </div>

      <div className="couponMeta">
        <div>Match Date(s)</div>
        <div className="blueText">{week.subtitle}</div>

        <div>Entries Submitted By</div>
        <div className="redText">
          {entryDeadline ? entryDeadline.toLocaleString('en-GB') : 'TBC'}
        </div>

        <div>Name</div>
        <div className="line"></div>

        <div>Company / Department</div>
        <div className="line"></div>
      </div>

      <div className="couponRules">
        <h3>Coupon Rules</h3>

        <div className="rulesBox">
          {rules.map((rule, index) => (
            <div key={`${index}-${rule}`} className="ruleItem">
              <strong>{index + 1}.</strong>
              <span>{rule}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="summaryBox">
        <div>
          <strong>Scoring:</strong> 1 point for correct result
        </div>

        <div>
          <strong>Exact Score:</strong> 3 points
        </div>

        <div>
          <strong>Maximum Points:</strong> {maxPts}
        </div>

        <div>
          <strong>Winner:</strong> Highest score wins the prize fund
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
      const [home, away, kickoff = '', apiFixtureId = ''] = parts.map(part => part.trim());

      if (!home || !away) {
        const error = `Row ${index + 1}: use Home TAB Away TAB Kick-off`;
        errors.push(error);
        rows.push({ line: index + 1, raw, home, away, kickoff, api_fixture_id: apiFixtureId, error });
        return;
      }

      const fixture = {
        home_team: home,
        away_team: away,
        kickoff,
        api_fixture_id: apiFixtureId,
        status: 'NS',
      };

      fixtures.push(fixture);
      rows.push({ line: index + 1, raw, ...fixture, error: '' });
    });

  return { fixtures, errors, rows };
}

function HistoricWinners({ archives = [] }) {
  if (!archives.length) {
    return (
      <section className="card historicWinnersPage">
        <div className="sectionTitleRow">
          <div>
            <p className="eyebrow">Past Coupons</p>
            <h2>Historic Winners</h2>
          </div>
        </div>

        <div className="historicEmpty">
          <h3>No historic winners saved yet</h3>
          <p>Use New Coupon in admin and tick “Save current leaderboard” to add the first winner here.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="card historicWinnersPage">
      <div className="sectionTitleRow">
        <div>
          <p className="eyebrow">Past Coupons</p>
          <h2>Historic Winners</h2>
        </div>

        <strong>{archives.length} saved</strong>
      </div>

      <div className="historicGrid">
        {archives.map(archive => {
          const leaderboard = Array.isArray(archive.leaderboard) ? archive.leaderboard : [];
          const archiveDate = formatArchiveDate(archive.created_at);
          const winnerName = archive.winner_name || leaderboard[0]?.name || 'No winner recorded';
          const winnerDepartment = archive.winner_department || leaderboard[0]?.department || '';
          const winnerPoints = archive.winner_points ?? leaderboard[0]?.pts ?? 0;

          return (
            <article className="historicWinner" key={archive.id}>
              <div className="historicWinnerHeader">
                <div>
                  <small>{archive.week_subtitle || archiveDate || 'Archived coupon'}</small>
                  <h3>{archive.week_title || 'DMI Coupon'}</h3>
                </div>

                <span>{leaderboard.length} entr{leaderboard.length === 1 ? 'y' : 'ies'}</span>
              </div>

              <div className="winnerPanel">
                <p>Winner</p>
                <strong>{winnerName}</strong>
                {winnerDepartment && <span>{winnerDepartment}</span>}
                <b>{winnerPoints} pts</b>
              </div>

              {!!leaderboard.length && (
                <div className="historicStandings">
                  <h4>Top 5</h4>
                  <ol>
                    {leaderboard.slice(0, 5).map((entry, index) => (
                      <li key={entry.id || `${entry.name}-${index}`}>
                        <span>
                          <b>{index + 1}</b>
                          {entry.name}
                        </span>
                        <strong>{entry.pts} pts</strong>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function Admin({ state, adminAction, setMsg, ranked, pot, imgRef, entriesImgRef, admin, load }) {
  const [settings, setSettings] = useState(state.settings || {});
  const [week, setWeek] = useState(state.week || {});
  const fixtures = Array.isArray(state.fixtures) ? state.fixtures : [];
  const archives = Array.isArray(state.archives) ? state.archives : [];
  const latestArchive = archives[0];

  const [fixtureText, setFixtureText] = useState(
    fixtures
      .map(f => `${f.home_team}\t${f.away_team}\t${f.kickoff || ''}\t${f.api_fixture_id || ''}`)
      .join('\n')
  );
  const [fixturePreview, setFixturePreview] = useState(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [newCoupon, setNewCoupon] = useState({
    title: 'DMI Coupon – New Coupon',
    subtitle: '',
    saveHistoric: true,
  });
  const [confirmNewCoupon, setConfirmNewCoupon] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState(null);
  const [entryDraft, setEntryDraft] = useState(null);

  const [tsv, setTsv] = useState('');

  function previewFixtures() {
    const parsed = parseFixtureRows(fixtureText);
    setFixturePreview(parsed);
    setConfirmReplace(false);

    if (parsed.errors.length) {
      setMsg(`Fix ${parsed.errors.length} fixture import issue(s) before replacing fixtures.`);
      return;
    }

    if (!parsed.fixtures.length) {
      setMsg('Add at least one fixture before replacing fixtures.');
      return;
    }

    setMsg(`Preview ready: ${parsed.fixtures.length} fixture(s) parsed.`);
  }

  function replacePreviewedFixtures() {
    const parsed = fixturePreview || parseFixtureRows(fixtureText);

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
      setMsg(`Confirm replacement: this will replace ${fixtures.length} current fixture(s).`);
      return;
    }

    setConfirmReplace(false);
    adminAction('replaceFixtures', {
      week_id: state.week.id,
      fixtures: parsed.fixtures,
    });
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

    setMsg(successMessage || 'Saved ✅');
    load();
    return true;
  }

  function prepareNewCoupon() {
    const entryCount = state.entries?.length || 0;

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
        week_id: state.week.id,
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

  async function download(ref, name) {
    const html2canvas = (await import('html2canvas')).default;
    const element = ref.current;
    const canvas = await html2canvas(ref.current, {
      scale: 2,
      backgroundColor: '#ffffff',
      width: element.scrollWidth,
      height: element.scrollHeight,
      windowWidth: element.scrollWidth,
      windowHeight: element.scrollHeight,
    });

    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = name;
    a.click();
  }

  async function syncLiveScores() {
    const res = await fetch('/api/live-scores', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-pass': admin,
      },
      body: JSON.stringify({ week_id: state.week.id }),
    });
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setMsg(json.error || 'Live score sync failed');
      return;
    }

    setMsg(`Live score sync complete. Updated ${json.updated || 0} fixture(s).`);
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
          week_id: state.week.id,
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

  return (
    <div>
      <div className="adminGrid">
        <div>
          <h3>Week Settings</h3>

          <input
            value={week.title || ''}
            onChange={e => setWeek({ ...week, title: e.target.value })}
          />

          <input
            value={week.subtitle || ''}
            onChange={e => setWeek({ ...week, subtitle: e.target.value })}
          />

          <button onClick={() => adminAction('saveWeek', week)}>Save Week</button>

          <h3>Coupon Settings</h3>

          <select
            value={settings.currency || 'GBP'}
            onChange={e => setSettings({ ...settings, currency: e.target.value })}
          >
            {['GBP', 'USD', 'EUR', 'NAD', 'ZAR'].map(c => (
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
            value={settings.rules || ''}
            onChange={e => setSettings({ ...settings, rules: e.target.value })}
          />

          <input
            placeholder="WhatsApp QR image URL"
            value={settings.whatsapp_qr_url || ''}
            onChange={e => setSettings({ ...settings, whatsapp_qr_url: e.target.value })}
          />

          <input
            placeholder="Payment QR image URL"
            value={settings.payment_qr_url || ''}
            onChange={e => setSettings({ ...settings, payment_qr_url: e.target.value })}
          />

          <label>
            <input
              type="checkbox"
              checked={!!settings.entries_released}
              onChange={e => setSettings({ ...settings, entries_released: e.target.checked })}
            />{' '}
            Release entries on leaderboard
          </label>

          <button onClick={() => adminAction('saveSettings', settings)}>Save Settings</button>

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
        </div>

        <div>
          <h3>Fixtures</h3>
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
            <button onClick={previewFixtures}>Preview Fixtures</button>
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

              <div className="scroll">
                <table className="previewTable">
                  <thead>
                    <tr>
                      <th>Row</th>
                      <th>Home</th>
                      <th>Away</th>
                      <th>Kick-off</th>
                      <th>API ID</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fixturePreview.rows.map(row => (
                      <tr className={row.error ? 'previewError' : ''} key={`${row.line}-${row.raw}`}>
                        <td>{row.line}</td>
                        <td>{row.home_team || row.home || '-'}</td>
                        <td>{row.away_team || row.away || '-'}</td>
                        <td>{row.kickoff || 'TBC'}</td>
                        <td>{row.api_fixture_id || '-'}</td>
                        <td>{row.error || 'OK'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <button onClick={syncLiveScores}>Sync Live Scores</button>

          <h3>Live Scores / Results</h3>

          <div>
            {fixtures.map(f => (
              <div className="fixture liveScoreFixture" key={f.id}>
                <span>
                  {f.home_team} v {f.away_team}
                </span>

                <input
                  type="number"
                  min="0"
                  placeholder="H"
                  value={f.home_score ?? ''}
                  onChange={e => {
                    f.home_score = e.target.value;
                    setMsg('');
                  }}
                />

                <span>-</span>

                <input
                  type="number"
                  min="0"
                  placeholder="A"
                  value={f.away_score ?? ''}
                  onChange={e => {
                    f.away_score = e.target.value;
                    setMsg('');
                  }}
                />

                <input
                  type="number"
                  min="0"
                  placeholder="HT H"
                  value={f.ht_home_score ?? ''}
                  onChange={e => {
                    f.ht_home_score = e.target.value;
                    setMsg('');
                  }}
                />

                <input
                  type="number"
                  min="0"
                  placeholder="HT A"
                  value={f.ht_away_score ?? ''}
                  onChange={e => {
                    f.ht_away_score = e.target.value;
                    setMsg('');
                  }}
                />

                <select
                  value={f.status || 'NS'}
                  onChange={e => {
                    f.status = e.target.value;
                    setMsg('');
                  }}
                >
                  <option value="NS">NS</option>
                  <option value="LIVE">LIVE</option>
                  <option value="HT">HT</option>
                  <option value="FT">FT</option>
                </select>
              </div>
            ))}
          </div>

          <button
            onClick={() =>
              adminAction('setResults', {
                fixtures: fixtures.map(f => ({
                  id: f.id,
                  home_score:
                    f.home_score === '' || f.home_score == null ? null : Number(f.home_score),
                  away_score:
                    f.away_score === '' || f.away_score == null ? null : Number(f.away_score),
                  ht_home_score:
                    f.ht_home_score === '' || f.ht_home_score == null
                      ? null
                      : Number(f.ht_home_score),
                  ht_away_score:
                    f.ht_away_score === '' || f.ht_away_score == null
                      ? null
                      : Number(f.ht_away_score),
                  status: f.status || (hasScore(f) ? 'FT' : 'NS'),
                })),
              })
            }
          >
            Save Results
          </button>
        </div>
      </div>

      <h3>Entries / Payments</h3>

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
          {ranked.map(e => (
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
        </tbody>
      </table>

      <h3>TSV Paper Entry Import</h3>
      <p>One entry per line: Name TAB Department TAB 1-0 TAB 2-1 etc</p>

      <textarea value={tsv} onChange={e => setTsv(e.target.value)} />

      <button onClick={importTsv}>Import TSV Entries</button>

      <h3>Share Images</h3>

      <button onClick={() => download(imgRef, 'leaderboard.png')}>
        Download Mobile Leaderboard PNG
      </button>

      <button onClick={() => download(entriesImgRef, 'released-entries.png')}>
        Download Entries Matrix PNG
      </button>

      <div className="share" ref={imgRef}>
        <div className="shareHeader">
          <span>DMI Football Coupon</span>
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
        </div>

        <div className="shareRows">
          {ranked.slice(0, 12).map((e, i) => (
            <div className={i === 0 ? 'shareRow leader' : 'shareRow'} key={e.id}>
              <b>{i + 1}</b>
              <span>
                <strong>{e.name}</strong>
                {e.department && <small>{e.department}</small>}
              </span>
              <em>{e.pts} pts</em>
            </div>
          ))}
        </div>

        <p className="shareFooter">Exact scores beat result-only ties.</p>
      </div>

      <div className="entriesShare" ref={entriesImgRef}>
        <EntriesMatrixExport
          entries={ranked}
          fixtures={fixtures}
          settings={state.settings}
          week={state.week}
        />
      </div>
    </div>
  );
}
