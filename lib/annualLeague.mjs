export const SEASON = 2027;
export function emptyLeague() { return { released: false, members: [], weeks: {}, audit: [] }; }
export function standings(data) {
  return data.members.filter(m => m.paid).map(m => {
    const totals = { ...m, entries: 0, wins: 0, seconds: 0, points: 0 };
    Object.values(data.weeks).filter(w => w.finalised).forEach(w => {
      const r = w.scores.find(s => s.memberId === m.id);
      if (r) { totals.entries++; totals.wins += r.bonus === 5 ? 1 : 0; totals.seconds += r.bonus === 2 ? 1 : 0; totals.points += 1 + r.bonus; }
    });
    return totals;
  }).sort((a,b) => b.points-a.points || a.name.localeCompare(b.name)).map((m,i,all) => ({...m, position: all.findIndex(x => x.points === m.points)+1}));
}
export function calculateScores(data, links, source) {
  if (!source.fixtures.length || !source.entries.length) throw new Error('The selected coupon needs fixtures and entries.');
  if (!source.fixtures.every(f => ['FT','AET','PEN','PST','CANC','ABD','AWD','WO'].includes(String(f.status).toUpperCase()) && (['PST','CANC','ABD','AWD','WO'].includes(String(f.status).toUpperCase()) || (f.home_score != null && f.away_score != null)))) throw new Error('Finish or void every fixture before finalising annual points.');
  const voids = new Set(['PST','CANC','ABD','AWD','WO']);
  const ranked = source.entries.map(e => ({...e, points: source.fixtures.reduce((sum,f) => {
    const p=e.predictions?.[f.id];
    if (voids.has(String(f.status).toUpperCase()) || p?.home == null || p?.away == null || String(p.home).trim()==='' || String(p.away).trim()==='') return sum;
    const h=Number(p.home), a=Number(p.away); if (!Number.isFinite(h)||!Number.isFinite(a)) return sum;
    return sum + (h===Number(f.home_score)&&a===Number(f.away_score)?3:Math.sign(h-a)===Math.sign(Number(f.home_score)-Number(f.away_score))?1:0);
  },0)}));
  const levels=[...new Set(ranked.map(e=>e.points))].sort((a,b)=>b-a);
  const used=new Set();
  return links.map(link => {
    const member=data.members.find(m=>m.id===link.memberId);
    const entry=ranked.find(e=>e.id===link.entryId);
    if (!member || !entry) throw new Error('Each verified member must link to an entry on the selected coupon.');
    if (used.has(entry.id) || used.has(member.id)) throw new Error('Each member and coupon entry can only be verified once per week.');
    used.add(entry.id); used.add(member.id);
    return {memberId:member.id, entryId:entry.id, eligible:member.paid, couponPoints:entry.points, bonus:entry.points===levels[0]?5:entry.points===levels[1]?2:0};
  }).filter(s=>s.eligible);
}
export function changeLeague(data, action, payload, {id, now, source, profile}={}) {
  const next=structuredClone(data);
  const name=String(payload?.name||'').trim();
  if(action==='enrolAccount') {
    if (!profile?.user_id || !profile.name?.trim()) throw new Error('Saved player account not found.');
    if (typeof payload.paid !== 'boolean') throw new Error('Confirm whether the $100 annual payment has been received.');
    let member=next.members.find(m=>m.userId===profile.user_id);
    if (member && payload.memberId && payload.memberId!==member.id) throw new Error('This account is already linked to another member.');
    if (!member && payload.memberId) {
      member=next.members.find(m=>m.id===payload.memberId);
      if (!member || member.userId) throw new Error('Choose an existing member that is not linked to another account.');
    }
    if (!member) {
      if (!payload.paid) throw new Error('Confirm the annual payment before enrolling this player.');
      if (next.members.some(m=>m.name.trim().toLowerCase()===profile.name.trim().toLowerCase())) throw new Error('A member with this name already exists. Select their existing membership to avoid a duplicate.');
      member={id};next.members.push(member);
    }
    Object.assign(member,{userId:profile.user_id,name:profile.name.trim(),department:profile.department||'',paid:payload.paid});
    next.audit.unshift({at:now,action,detail:`${member.id}: ${payload.paid?'account enrolled · $100 paid':'annual payment marked unpaid'}`});
    return next;
  } else if(action==='register') {
    if (!name || name.length>80) throw new Error('Enter a member name (up to 80 characters).');
    if(next.members.some(m=>m.name.toLowerCase()===name.toLowerCase())) throw new Error('That member is already registered.');
    next.members.push({id,name,paid:false});
  } else if(action==='payment') {
    const member=next.members.find(m=>m.id===payload.memberId); if(!member) throw new Error('Member not found.');
    if(typeof payload.paid!=='boolean') throw new Error('Invalid payment status.');
    member.paid=payload.paid;
  } else if(action==='saveWeek' || action==='finalise') {
    const week=Number(payload.week);
    if(!Number.isInteger(week)||week<1||week>52) throw new Error('Choose a week between 1 and 52.');
    if(next.weeks[week]?.finalised) throw new Error('Reopen this week before changing finalised points.');
    if(!source || Number(source.week.calendar_year)!==SEASON || Number(source.week.calendar_week)!==week) throw new Error('Choose a coupon assigned to this calendar week in 2027. Set its year and week in Coupon Setup first.');
    if(Object.entries(next.weeks).some(([k,w])=>Number(k)!==week&&w.sourceId===payload.sourceId)) throw new Error('This coupon is already assigned to another annual week.');
    const links=Array.isArray(payload.links)?payload.links:[];
    const seenMembers=new Set(), seenEntries=new Set();
    links.forEach(l=>{if(!next.members.some(m=>m.id===l.memberId)||!source.entries.some(e=>e.id===l.entryId)||seenMembers.has(l.memberId)||seenEntries.has(l.entryId)) throw new Error('Verify a unique coupon entry for each member.');seenMembers.add(l.memberId);seenEntries.add(l.entryId);});
    next.weeks[week]={sourceId:payload.sourceId,sourceTitle:source.week.title,links,finalised:action==='finalise',scores:action==='finalise'?calculateScores(next,links,source):[],finalisedAt:action==='finalise'?now:null};
  } else if(action==='reopen') {
    const w=next.weeks[payload.week]; if(!w?.finalised) throw new Error('Week is not finalised.');
    w.finalised=false;w.scores=[];w.finalisedAt=null;
  } else if(action==='release') {
    if(typeof payload.released!=='boolean') throw new Error('Invalid visibility setting.');
    next.released=payload.released;
  } else throw new Error('Unknown annual league action.');
  next.audit.unshift({at:now,action,detail:action==='register'?name:action==='payment'?`${payload.memberId}: ${payload.paid?'$100 paid':'unpaid'}`:action==='release'?(payload.released?'Public History released':'Hidden from public History'):`Week ${payload.week}`});
  return next;
}
