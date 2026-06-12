import { useEffect, useMemo, useRef, useState } from 'react';

const resultOf = (h, a) => (h > a ? 'H' : h < a ? 'A' : 'D');

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

const sym = c => ({ GBP: '£', USD: '$', EUR: '€', NAD: 'N$', ZAR: 'R' }[c] || c + ' ');

export default function Home() {
  const [state, setState] = useState(null);
  const [tab, setTab] = useState('home');
  const [admin, setAdmin] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [msg, setMsg] = useState('');
  const [now, setNow] = useState(new Date());
  const [form, setForm] = useState({
    name: '',
    department: '',
    predictions: {},
  });

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
        });
      });

 useEffect(() => {
  load();

  const timer = setInterval(() => {
    setNow(new Date());
  }, 1000);

  return () => clearInterval(timer);
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
        pts: state.fixtures.reduce(
          (s, f) => s + points(e.predictions?.[f.id], f),
          0
        ),
        exact: state.fixtures.filter(
          f => points(e.predictions?.[f.id], f) === 3
        ).length,
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

  const {
    week = {},
    fixtures = [],
    settings = {},
    entries = [],
  } = state || {};

  const maxPts = fixtures.length * 3;
  const pot = entries.filter(e => e.paid).length * Number(settings.entry_fee || 0);
const parseKickoff = kickoff => {
  if (!kickoff) return null;

  const [datePart, timePart] = String(kickoff).trim().split(' ');
  if (!datePart || !timePart) return null;

  const [day, month, year] = datePart.split('/').map(Number);
  const [hour, minute] = timePart.split(':').map(Number);

  if (!day || !month || !year) return null;

  return new Date(year, month - 1, day, hour || 0, minute || 0);
};

const firstKickoff = fixtures
  .map(f => parseKickoff(f.kickoff))
  .filter(Boolean)
  .sort((a, b) => a - b)[0];

const entryDeadline = firstKickoff
? new Date(firstKickoff.getTime() + 24 * 60 * 60 * 1000)
  : null;

const entriesOpen = entryDeadline
  ? now < entryDeadline
  : true;

const countdownMs = entryDeadline
  ? entryDeadline.getTime() - now.getTime()
  : null;

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

    const j = await r.json();

    if (!r.ok) {
      if (r.status === 401) {
        setIsAdmin(false);
        setAdmin('');
      }

      return setMsg(j.error || 'Admin action failed');
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
      return setMsg(j.error || 'Entry failed');
    }

    setMsg('Entry submitted ✅');
    setForm({ name: '', department: '', predictions: {} });
    load();
    setTab('leaderboard');
  }

  const nav = ['home', 'old school', 'enter coupon', 'leaderboard', 'admin'];

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
              {n === 'old school'
                ? 'Old School'
                : n.replace(/\b\w/g, m => m.toUpperCase())}
            </button>
          ))}
        </nav>
      </header>

      <main className="wrap">
        {msg && <div className="msg">{msg}</div>}

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
    {sym(settings.currency)}
    {pot}
  </b>{' '}
  pot
</div>
            {entryDeadline && (
  <p>
    {entriesOpen
  ? `⏰ Entries close in: ${countdownText}`
  : `🔒 Entries closed at ${entryDeadline.toLocaleString('en-GB')}`
}
</p>
)}
  <p>{settings.rules}</p>
          </section>
        )}

        {tab === 'old school' && (
          <OldSchool
            week={week}
            fixtures={fixtures}
            settings={settings}
            maxPts={maxPts}
          />
        )}

        {tab === 'enter coupon' && (
          <section className="card">
    {!entriesOpen ? (
      <>
        <h2>Entries Closed</h2>

        <p>
          Entries closed at{' '}
          {entryDeadline?.toLocaleString('en-GB')}
        </p>

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
              onChange={e =>
                setForm({
                  ...form,
                  name: e.target.value,
                })
              }
            />

            <input
              placeholder="Department"
              value={form.department}
              onChange={e =>
                setForm({
                  ...form,
                  department: e.target.value,
                })
              }
            />
          </div>

          <FixtureInputs
            fixtures={fixtures}
            predictions={form.predictions}
            setPredictions={p =>
              setForm({
                ...form,
                predictions: p,
              })
            }
          />

          {entryDeadline && (
            <p>
              Entries close:{' '}
              {entryDeadline.toLocaleString('en-GB')}
            </p>
          )}

          <button className="primary">
            Submit Entry
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
                />
              </>
            )}
          </section>
        )}
      </main>
    </>
  );
}

function FixtureInputs({ fixtures, predictions, setPredictions }) {
  return (
    <div>
      {fixtures.map(f => (
        <div className="fixture" key={f.id}>
          <span>
            {f.home_team} v {f.away_team}
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

function Leaderboard({ ranked, fixtures, settings, maxPts, pot }) {
  return (
    <section className="card">
      <h2>Leaderboard</h2>
      <p>
        Max points: {maxPts} | Pot: {sym(settings.currency)}
        {pot}
      </p>

      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Name</th>
            <th>Paid</th>
            <th>Exact</th>
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
              <td>{e.paid ? '✅' : '❌'}</td>
              <td>{e.exact}</td>
              <td>
                <b>{e.pts}</b>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {settings.entries_released && (
        <>
          <hr />
          <h3>Full Game Inputs</h3>
          <EntriesMatrix entries={ranked} fixtures={fixtures} />
        </>
      )}
    </section>
  );
}

function EntriesMatrix({ entries, fixtures }) {
  return (
    <div className="scroll">
      <table className="matrix">
        <thead>
          <tr>
            <th>Name</th>
            {fixtures.map(f => (
              <th key={f.id}>
                {f.home_team}
                <br />v<br />
                {f.away_team}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entries.map(e => (
            <tr key={e.id}>
              <td>{e.name}</td>
              {fixtures.map(f => (
                <td key={f.id}>
                  {e.predictions?.[f.id]?.home ?? ''}-
                  {e.predictions?.[f.id]?.away ?? ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OldSchool({ week, fixtures, settings, maxPts }) {
  return (
    <section className="paper">
      <h1>{week.title || 'DMI Coupon'}</h1>
      <p>{week.subtitle}</p>

      <div className="grid2">
        <p>Name: ___________________________</p>
        <p>Department: _____________________</p>
      </div>

      <p>Paid: □</p>

      <table>
        <tbody>
          {fixtures.map((f, i) => (
            <tr key={f.id}>
              <td>{i + 1}</td>
              <td>
                {f.home_team} v {f.away_team}
              </td>
              <td className="scorebox">___ : ___</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Rules</h3>
      <p>{settings.rules}</p>
      <p>
        <b>1 point</b> correct result | <b>3 points</b> correct score | Max {maxPts}
      </p>

      <div className="qrwrap">
        {settings.whatsapp_qr_url && (
          <div>
            <img src={settings.whatsapp_qr_url} />
            <b>WhatsApp Group</b>
          </div>
        )}

        {settings.payment_qr_url && (
          <div>
            <img src={settings.payment_qr_url} />
            <b>Payment</b>
          </div>
        )}
      </div>

      <button onClick={() => print()}>Print / Save PDF</button>
    </section>
  );
}

function Admin({
  state,
  adminAction,
  setMsg,
  ranked,
  pot,
  imgRef,
  entriesImgRef,
}) {
  const [settings, setSettings] = useState(state.settings || {});
  const [week, setWeek] = useState(state.week || {});
  const fixtures = Array.isArray(state.fixtures) ? state.fixtures : [];

  const [fixtureText, setFixtureText] = useState(
    fixtures.map(f => `${f.home_team}\t${f.away_team}\t${f.kickoff || ''}`).join('\n')
  );

  const [resultText, setResultText] = useState(
    fixtures
      .map(f => `${f.id}\t${f.home_score ?? ''}\t${f.away_score ?? ''}`)
      .join('\n')
  );

  const [tsv, setTsv] = useState('');

  async function download(ref, name) {
    const html2canvas = (await import('html2canvas')).default;
    const canvas = await html2canvas(ref.current, {
      scale: 2,
      backgroundColor: '#ffffff',
    });

    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = name;
    a.click();
  }

  function importTsv() {
    const parts = tsv.trim().split(/\t/);

    if (parts.length < 2 + fixtures.length) {
      return setMsg('TSV needs Name, Dept, then one score per fixture');
    }

    const predictions = {};

    fixtures.forEach((f, i) => {
      const m = (parts[i + 2] || '').match(/(\d+)\D+(\d+)/);

      predictions[f.id] = m
        ? { home: m[1], away: m[2] }
        : { home: '', away: '' };
    });

    adminAction('importEntry', {
      week_id: state.week.id,
      name: parts[0],
      department: parts[1],
      predictions,
      paid: false,
      payment_method: '',
    });
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

          <button onClick={() => adminAction('saveWeek', week)}>
            Save Week
          </button>

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

          <textarea
            value={settings.rules || ''}
            onChange={e => setSettings({ ...settings, rules: e.target.value })}
          />

          <input
            placeholder="WhatsApp QR image URL"
            value={settings.whatsapp_qr_url || ''}
            onChange={e =>
              setSettings({ ...settings, whatsapp_qr_url: e.target.value })
            }
          />

          <input
            placeholder="Payment QR image URL"
            value={settings.payment_qr_url || ''}
            onChange={e =>
              setSettings({ ...settings, payment_qr_url: e.target.value })
            }
          />

          <label>
            <input
              type="checkbox"
              checked={!!settings.entries_released}
              onChange={e =>
                setSettings({ ...settings, entries_released: e.target.checked })
              }
            />{' '}
            Release entries on leaderboard
          </label>

          <button onClick={() => adminAction('saveSettings', settings)}>
            Save Settings
          </button>
        </div>

        <div>
          <h3>Fixtures</h3>
          <p>Paste: Home TAB Away TAB Kick-off</p>

          <textarea
            value={fixtureText}
            onChange={e => setFixtureText(e.target.value)}
          />

          <button
            onClick={() =>
              adminAction('replaceFixtures', {
                week_id: state.week.id,
                fixtures: fixtureText
                  .split('\n')
                  .filter(Boolean)
                  .map(line => {
                    const [home_team, away_team, kickoff] = line.split('\t');
                    return { home_team, away_team, kickoff, status: 'NS' };
                  }),
              })
            }
          >
            Replace Fixtures
          </button>

          <h3>Results</h3>
          <p>Paste: FixtureID TAB HomeScore TAB AwayScore</p>

          <textarea
            value={resultText}
            onChange={e => setResultText(e.target.value)}
          />

          <button
            onClick={() =>
              adminAction('setResults', {
                fixtures: resultText
                  .split('\n')
                  .filter(Boolean)
                  .map(line => {
                    const [id, home_score, away_score] = line.split('\t');

                    return {
                      id,
                      home_score: home_score === '' ? null : Number(home_score),
                      away_score: away_score === '' ? null : Number(away_score),
                      status: 'FT',
                    };
                  }),
              })
            }
          >
            Save Results
          </button>
        </div>
      </div>

      <h3>Entries / Payments</h3>

      <table>
        <tbody>
          {ranked.map(e => (
            <tr key={e.id}>
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
                <button onClick={() => adminAction('deleteEntry', { id: e.id })}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>TSV Paper Entry Import</h3>
      <p>Name TAB Department TAB 1-0 TAB 2-1 etc</p>

      <textarea value={tsv} onChange={e => setTsv(e.target.value)} />

      <button onClick={importTsv}>Import TSV Entry</button>

      <h3>Share Images</h3>

      <button onClick={() => download(imgRef, 'leaderboard.png')}>
        Download Mobile Leaderboard PNG
      </button>

      <button onClick={() => download(entriesImgRef, 'released-entries.png')}>
        Download Entries Matrix PNG
      </button>

      <div className="share" ref={imgRef}>
        <h1>{state.week.title}</h1>
        <p>
          Pot: {sym(state.settings.currency)}
          {pot}
        </p>
        {ranked.slice(0, 12).map((e, i) => (
          <p key={e.id}>
            <b>
              {i + 1}. {e.name}
            </b>{' '}
            — {e.pts} pts
          </p>
        ))}
      </div>

      <div className="entriesShare" ref={entriesImgRef}>
        <h2>Released Entries</h2>
        <EntriesMatrix entries={ranked} fixtures={fixtures} />
      </div>
    </div>
  );
}
