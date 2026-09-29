import { useRef, useState } from 'react';

const dateLabel = date => new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
}).format(date);
const dateKey = date => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(date);

function FixtureTeam({ name, badge }) {
  const [failed, setFailed] = useState(false);
  const initials = String(name || '?').replace(/[^\p{L}\p{N} ]/gu, '').split(/\s+/)
    .filter(Boolean).map(word => word[0]).join('').slice(0, 3).toUpperCase();
  return (
    <div className="fixtureImageTeam">
      {badge && !failed ? (
        <img src={badge} alt="" crossOrigin="anonymous" referrerPolicy="no-referrer"
          onError={() => setFailed(true)} />
      ) : <span className="fixtureImageInitials">{initials}</span>}
      <span>{name}</span>
    </div>
  );
}

export default function FixtureImageExport({ preview, parseKickoff, download, setMsg }) {
  const [open, setOpen] = useState(false);
  const [selection, setSelection] = useState('all');
  const [busy, setBusy] = useState(false);
  const imageRef = useRef(null);
  const ready = !!preview?.fixtures?.length && !preview?.errors?.length;
  const rows = (preview?.fixtures || []).map(fixture => {
    const parsed = parseKickoff(fixture.kickoff);
    const date = parsed && Number.isFinite(parsed.getTime()) ? parsed : null;
    return { fixture, date, key: date ? dateKey(date) : 'tbc' };
  }).sort((a, b) => (a.date?.getTime() ?? Infinity) - (b.date?.getTime() ?? Infinity));
  const days = [...new Set(rows.filter(row => row.date).map(row => row.key))];
  const selected = selection === 'all' || rows.some(row => row.key === selection) ? selection : 'all';
  const visible = selected === 'all' ? rows : rows.filter(row => row.key === selected);

  async function exportImage() {
    if (!ready || busy || !imageRef.current) return;
    setBusy(true);
    try {
      // Wait for badges and fonts before measuring and capturing the cards.
      await document.fonts.ready;
      await Promise.all(Array.from(imageRef.current.querySelectorAll('img')).map(img =>
        img.decode().catch(() => {})
      ));
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      await download(imageRef, `fixtures-${selected === 'all' ? 'full' : selected}.png`);
    } catch (error) {
      setMsg(error.message || 'Unable to export fixtures. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixtureImageExport">
      <button type="button" aria-expanded={open} aria-controls="fixture-image-options"
        onClick={() => { setOpen(!open); setSelection('all'); }} disabled={busy}>
        Export Fixtures Image
      </button>
      {open && (
        <div id="fixture-image-options" className="fixtureImageOptions">
          {!ready ? <p role="status">Preview your TSV fixtures first. Fix any preview errors before exporting.</p> : (
            <>
              <label htmlFor="fixture-image-day">Fixtures to export</label>
              <select id="fixture-image-day" value={selected} disabled={busy}
                onChange={event => setSelection(event.target.value)}>
                <option value="all">Full fixtures ({rows.length})</option>
                {days.map((day, index) => (
                  <option key={day} value={day}>
                    Day {index + 1} — {dateLabel(rows.find(row => row.key === day).date)}
                    {` (${rows.filter(row => row.key === day).length} fixtures)`}
                  </option>
                ))}
                {rows.some(row => !row.date) && <option value="tbc">Date to be confirmed</option>}
              </select>
              <p>Exports the current TSV preview. All kick-off times are UK time.</p>
              <button type="button" onClick={exportImage} disabled={busy}>
                {busy ? 'Creating image…' : 'Download Fixtures PNG'}
              </button>
              <div className="fixtureImageScroll" aria-label="Fixture image preview">
                <div className="fixtureImageCanvas" ref={imageRef}>
                  <div className="fixtureImageCards">
                    {visible.map(({ fixture, date }, index) => (
                      <div className="fixtureImageRow" key={`${fixture.home_team}-${fixture.away_team}-${index}`}>
                        <FixtureTeam key={`home-${fixture.home_badge}`} name={fixture.home_team} badge={fixture.home_badge} />
                        <div className="fixtureImageKickoff">
                          <strong>{date ? new Intl.DateTimeFormat('en-GB', {
                            timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
                          }).format(date) : 'TBC'}</strong>
                          <span>{date ? dateLabel(date) : 'Date to be confirmed'}</span>
                          <small>Kick-off · UK time</small>
                        </div>
                        <FixtureTeam key={`away-${fixture.away_badge}`} name={fixture.away_team} badge={fixture.away_badge} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
