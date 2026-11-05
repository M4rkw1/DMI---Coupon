// Presentation only: awarded points still come from the existing coupon scorer.
const present = value => value !== null && value !== undefined && String(value).trim() !== '' && Number.isFinite(Number(value));
const complete = (home, away) => present(home) && present(away);
const finished = new Set(['FT', 'AET', 'PEN']);
const statusNames = {
  NS: 'Not started', TBD: 'Time to be confirmed', PST: 'Postponed', CANC: 'Cancelled',
  ABD: 'Abandoned', SUSP: 'Suspended', INT: 'Interrupted', HT: 'Half-time',
  BT: 'Break', '1H': 'First half', '2H': 'Second half', ET: 'Extra time',
  P: 'Penalties', LIVE: 'Live', FT: 'Full time', AET: 'After extra time', PEN: 'After penalties',
};
export function fixturePresentation(fixture) {
  const status = String(fixture.status || '').toUpperCase();
  const hasScore = complete(fixture.home_score, fixture.away_score);
  const isFinal = finished.has(status);
  return {
    score: hasScore ? `${fixture.home_score} – ${fixture.away_score}` : '—',
    status: statusNames[status] || (status ? status : hasScore ? 'Score update' : 'Not started'),
    scoreLabel: hasScore ? isFinal ? 'Final score' : 'Current score' : 'Actual score',
    hasScore,
    isFinal,
    halfTime: complete(fixture.ht_home_score, fixture.ht_away_score) ? `HT ${fixture.ht_home_score}–${fixture.ht_away_score}` : '',
    result: !hasScore ? '' : Number(fixture.home_score) === Number(fixture.away_score) ? 'Draw' : Number(fixture.home_score) > Number(fixture.away_score) ? 'Home win' : 'Away win',
  };
}
export function predictionPresentation(prediction, fixture, awardedPoints) {
  const actual = fixturePresentation(fixture);
  if (!complete(prediction?.home, prediction?.away)) return { score:'—', kind:'missing', label:'No pick' };
  const score = `${prediction.home} – ${prediction.away}`;
  if (!actual.hasScore) return { score, kind:'pending', label:actual.status };
  if (awardedPoints === 3) return { score, kind:'exact', label:'Exact · 3 pts' };
  if (awardedPoints === 1) return { score, kind:'result', label:'Result · 1 pt' };
  return { score, kind:'miss', label:'Miss · 0 pts' };
}
