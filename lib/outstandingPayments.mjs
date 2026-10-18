// One debt per entry, not per name: different people may share a name.
// Newest archived payment status wins for closed entries, even when paid.
export function outstandingPayments(state, parseKickoff, now = new Date()) {
  const records = new Map();
  const currentId = state.week?.id;
  const add = (entry, week, settings, archiveId = null) => {
    if (!entry?.id) return;
    const fee = Number(settings?.entry_fee ?? 10);
    records.set(String(entry.id), {
      ...entry, weekId: week?.id, weekTitle: week?.title || 'Previous coupon',
      currency: settings?.currency || 'USD', amount: Number.isFinite(fee) ? fee : 10,
      archiveId, previous: !!archiveId || week?.id !== currentId || week?.is_current === false,
    });
  };
  for (const archive of [...(state.archives || [])].sort((a,b) => String(a.created_at).localeCompare(String(b.created_at)))) {
    const snapshot = archive.snapshot || {};
    const week = { ...snapshot.week, title: archive.week_title || snapshot.week?.title };
    const rows = Array.isArray(archive.leaderboard) && archive.leaderboard.length ? archive.leaderboard : snapshot.entries || [];
    rows.forEach(entry => add(entry, week, snapshot.settings, archive.id));
  }
  const weeks = state.weeks?.length ? state.weeks : [state.week].filter(Boolean);
  for (const week of weeks) {
    const fixtures = state.fixturesByWeek?.[week.id] || (week.id === currentId ? state.fixtures : []) || [];
    const dates = fixtures.map(f => parseKickoff(f.kickoff)).filter(d => d && Number.isFinite(d.getTime()));
    const started = dates.length && Math.min(...dates.map(Number)) <= Number(now);
    const current = week.id === currentId && week.is_current !== false;
    if (!current && !started) continue; // Never include future drafts/open future coupons.
    const entries = state.entriesByWeek?.[week.id] || (week.id === currentId ? state.entries : []) || [];
    const settings = state.settingsByWeek?.[week.id] || (week.id === currentId ? state.settings : {}) || {};
    for (const entry of entries) {
      if (current || !records.has(String(entry.id))) add(entry, week, settings);
    }
  }
  return [...records.values()].filter(entry => entry.paid !== true)
    .sort((a,b) => String(a.name).localeCompare(String(b.name)) || a.weekTitle.localeCompare(b.weekTitle));
}

export function outstandingTotals(entries) {
  const totals = new Map();
  for (const entry of entries) totals.set(entry.currency, (totals.get(entry.currency) || 0) + Math.round(entry.amount * 100));
  return [...totals].map(([currency, cents]) => `${currency} ${(cents / 100).toFixed(2)}`).join(' · ') || '0.00';
}
