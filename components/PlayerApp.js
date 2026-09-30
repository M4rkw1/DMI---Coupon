import { useEffect, useState } from 'react';
import { prefersDuoNavigation, navigationPreference } from '../lib/playerNavigation.mjs';

export function usePlayerNavigation() {
  const [preference, setPreference] = useState('auto');
  const [duo, setDuo] = useState(false);
  useEffect(() => {
    try { setPreference(navigationPreference(localStorage.getItem('rig-navigation'))); } catch {}
    const update = () => setDuo(prefersDuoNavigation({ userAgent: navigator.userAgent, width: screen.width, height: screen.height }));
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    window.addEventListener('pageshow', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      window.removeEventListener('pageshow', update);
    };
  }, []);
  function changePreference(value) {
    const next = navigationPreference(value);
    setPreference(next);
    try { localStorage.setItem('rig-navigation', next); } catch {}
  }
  return { preference, changePreference, right: preference === 'right' || (preference === 'auto' && duo) };
}

export function AppIcon({ name, size = 22 }) {
  const paths = {
    home: <><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z" /></>,
    coupon: <><path d="M5 3h14v18H5zM8 7h8M8 11h8M8 15h3" /><path d="m13 17 2 2 4-4" /></>,
    table: <><path d="M4 20V12h4v8M10 20V4h4v16M16 20V8h4v12" /></>,
    history: <><path d="M3 11a9 9 0 1 1 2 7M3 4v7h7M12 7v5l3 2" /></>,
    more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.coupon}</svg>;
}

export function RigMark() {
  return <svg className="rigMark" viewBox="0 0 48 56" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M18 38 23 4h3l6 34M20 24h10M21 16h7M18 32h14M21 16l9 8-12 8 14 6M6 38h36v6H6zM11 44v7m25-7v7M8 38V23l8 8M37 38V18l-5 8M3 53q6-5 12 0t12 0 12 0 6 0" /></svg>;
}

const navItems = [['home', 'Home', 'home'], ['enter coupon', 'Coupon', 'coupon'], ['leaderboard', 'Table', 'table'], ['historic winners', 'History', 'history']];
export function PlayerHeader({ tab, onNavigate, navigation }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [installEvent, setInstallEvent] = useState(null);
  const [installHelp, setInstallHelp] = useState(false);
  useEffect(() => {
    const ready = event => { event.preventDefault(); setInstallEvent(event); };
    const done = () => { setInstallEvent(null); setInstallHelp(false); };
    window.addEventListener('beforeinstallprompt', ready);
    window.addEventListener('appinstalled', done);
    return () => { window.removeEventListener('beforeinstallprompt', ready); window.removeEventListener('appinstalled', done); };
  }, []);
  useEffect(() => { setMenuOpen(false); setInstallHelp(false); }, [tab]);
  async function install() {
    if (installEvent) { await installEvent.prompt(); setInstallEvent(null); }
    else setInstallHelp(true);
  }
  return <>
    <header className="playerHeader">
      <button className="playerBrand" onClick={() => onNavigate('home')} aria-label="The Rig Coupon home"><RigMark /><span><strong>THE <em>RIG</em> COUPON</strong><small>OFFSHORE FOOTBALL PREDICTIONS</small></span></button>
      <nav className="desktopPlayerNav" aria-label="Main navigation">{navItems.map(([id, label]) => <button key={id} aria-current={tab === id ? 'page' : undefined} onClick={() => onNavigate(id)}>{label}</button>)}</nav>
      <div className="playerMenuWrap">
        <button className="playerMenuButton" aria-label="More options" aria-expanded={menuOpen} aria-controls="player-menu" onClick={() => setMenuOpen(!menuOpen)}><AppIcon name="more" /></button>
        {menuOpen && <div className="playerMenu" id="player-menu" onKeyDown={e => { if (e.key === 'Escape') setMenuOpen(false); }}>
          <button onClick={() => onNavigate('old school')}>Print coupon</button>
          <button onClick={install}>Add to home screen</button>
          <button onClick={() => onNavigate('admin')}>Admin</button>
          {navigation && <label className="playerNavSetting">Navigation position<select value={navigation.preference} onChange={e => navigation.changePreference(e.target.value)}><option value="auto">Automatic</option><option value="right">Right side</option><option value="standard">Standard layout</option></select></label>}
          {installHelp && <p>On iPhone or iPad, open this site in Safari, tap Share, then Add to Home Screen. On Android, use your browser menu and choose Install app or Add to Home screen.</p>}
        </div>}
      </div>
    </header>
  </>;
}

export function PlayerNavigation({ tab, onNavigate }) {
  return <nav className="playerBottomNav" aria-label="Main navigation">{navItems.map(([id, label, icon]) => <button key={id} aria-current={tab === id ? 'page' : undefined} onClick={() => onNavigate(id)}><AppIcon name={icon} /><span>{label}</span></button>)}</nav>;
}

function Badge({ src, name }) {
  const [failed, setFailed] = useState(false);
  return src && !failed ? <img src={src} alt="" onError={() => setFailed(true)} /> : <span className="playerInitials" aria-hidden="true">{(name || '?').split(' ').map(s => s[0]).slice(0, 2).join('')}</span>;
}
export function MatchList({ fixtures, formatKickoff, settings }) {
  return <div className="playerMatchList">{fixtures.length ? fixtures.map(f => <div className="playerMatch" key={f.id}>
    <div className="playerMatchTeams"><span><Badge src={f.home_badge} name={f.home_team} />{f.home_team}</span><b>{f.home_score != null && f.away_score != null ? `${f.home_score} – ${f.away_score}` : 'v'}</b><span>{f.away_team}<Badge src={f.away_badge} name={f.away_team} /></span></div>
    <small>{f.status && f.status !== 'NS' ? `${f.status} · ` : ''}{f.kickoff ? formatKickoff(f.kickoff, settings) : 'Kick-off to be confirmed'}</small>
  </div>) : <p className="playerEmpty">Fixtures will appear here when the next coupon is published.</p>}</div>;
}

export function PlayerHome({ week, fixtures, settings, ranked, liveWeek, entriesOpen, deadline, countdown, archives, onNavigate, formatKickoff, formatDate, position }) {
  return <div className="playerHome">
    <section className="playerHero">
      <img className="playerHeroImage" src="/dmi-background.jpeg" alt="Deepsea Mira offshore rig at sea" fetchPriority="high" />
      <div className="playerHeroContent"><p className="playerEyebrow">YOUR CREW. YOUR COUPON.</p><h1>{week.title || 'The Rig Coupon'}</h1><p>{week.subtitle || 'A new weekend. Everything to play for.'}</p><div className="playerHeroMeta"><span>{fixtures.length} fixtures</span><span>{fixtures.length * 3} points to play for</span></div><p className="playerDeadline"><AppIcon name="clock" size={17} />{deadline ? `${entriesOpen ? 'Closes' : 'Closed'} ${formatDate(deadline)}` : fixtures.length ? 'Deadline to be confirmed' : 'Next coupon coming soon'}</p><button className="playerGold" onClick={() => onNavigate(entriesOpen ? 'enter coupon' : 'leaderboard')}>{entriesOpen ? 'Make your predictions' : 'View the table'}<AppIcon name="arrow" size={19} /></button></div>
    </section>
    <div className="playerShortcuts"><button onClick={() => onNavigate('enter coupon')}><AppIcon name="coupon" /><span><small>This week’s coupon</small><strong>{entriesOpen ? 'Make your picks' : 'Entries closed'}</strong></span><AppIcon name="arrow" size={18} /></button><button onClick={() => onNavigate('historic winners')}><AppIcon name="history" /><span><small>Results & history</small><strong>{archives.length ? `${archives.length} past coupons` : 'Past weeks'}</strong></span><AppIcon name="arrow" size={18} /></button></div>
    <div className="playerHomeGrid">
      <section className="playerPanel"><div className="playerSectionHeading"><h2>Coupon fixtures</h2><button onClick={() => onNavigate('enter coupon')}>View coupon <span aria-hidden="true">→</span></button></div><MatchList fixtures={fixtures.slice(0, 5)} settings={settings} formatKickoff={formatKickoff} />{entriesOpen && countdown && <p className="playerSmallNote">Entries close in {countdown}</p>}</section>
      <section className="playerPanel"><div className="playerSectionHeading"><h2>Leaderboard</h2><button onClick={() => onNavigate('leaderboard')}>Full table <span aria-hidden="true">→</span></button></div><p className="playerSmallNote">{liveWeek.title || 'Current coupon'}</p>{ranked.length ? <ol className="playerMiniTable">{ranked.slice(0, 5).map((entry, i) => <li key={entry.id}><b>{position(ranked, i)}</b><span>{entry.name}<small>{entry.department}</small></span><strong>{entry.pts}<small>pts</small></strong></li>)}</ol> : <p className="playerEmpty">The leaderboard will appear when entries are received.</p>}</section>
    </div>
    <section className="playerPanel playerRules"><details><summary>How to play & coupon rules</summary><p>{settings.rules || 'Predict each score before entries close. An exact score earns 3 points; a correct result earns 1 point.'}</p><p>Entry: {({ GBP: '£', USD: '$', EUR: '€' }[settings.currency] || settings.currency || '$')}{settings.entry_fee ?? 10}</p><img src="/whatsapp-qr.png" alt="Scan to join the coupon WhatsApp group" width="120" height="120" /></details></section>
  </div>;
}
