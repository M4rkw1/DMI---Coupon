import { isDeepStrictEqual } from 'node:util';
import { SEASON, calculateScores } from './annualLeague.mjs';

// Archives preserve entry/fixture IDs. Prefer live results over a snapshot of the same coupon.
export function annualSources({weeks,fixtures,entries,archives}) {
  const candidates=new Map();
  function add(sourceId,source,replace=false) {
    if(Number(source?.week?.calendar_year)!==SEASON || source.week.is_published===false || !source.fixtures?.length) return;
    const week=Number(source.week.calendar_week);
    if(!Number.isInteger(week)||week<1||week>52)return;
    const signature=`${source.week.id}:${week}:${source.fixtures.map(f=>f.id).sort().join(',')}`;
    if(replace||!candidates.has(signature)) candidates.set(signature,{sourceId,source,week});
  }
  for(const archive of archives) add(`archive:${archive.id}`,archive.snapshot);
  for(const week of weeks) add(week.id,{week,fixtures:fixtures.filter(f=>f.week_id===week.id),entries:entries.filter(e=>e.week_id===week.id)},true);
  return [...candidates.values()];
}

export function automaticAnnualData(data,sources,accountLinks,now) {
  const next=structuredClone(data),warnings=[];
  const byEntry=new Map(accountLinks.map(l=>[l.entry_id,l.user_id]));
  const grouped=new Map();
  for(const item of sources){if(!grouped.has(item.week))grouped.set(item.week,[]);grouped.get(item.week).push(item);}
  for(const [week,options] of grouped) {
    const saved=next.weeks[week];
    // Manual drafts, corrections and finalisations belong to the admin.
    if(saved && saved.automatic!==true) continue;
    if(options.length!==1){warnings.push(`Week ${week}: more than one coupon is assigned. Choose and finalise it in admin.`);continue;}
    const {sourceId,source}=options[0];
    const ordered=[...(source.entries||[])].sort((a,b)=>String(a.created_at||'').localeCompare(String(b.created_at||''))||String(a.id).localeCompare(String(b.id)));
    const eligible=new Set(saved?.eligibleMemberIds ?? next.members.filter(m=>m.paid&&m.userId).map(m=>m.id));
    const links=[];
    for(const member of next.members.filter(m=>m.userId&&eligible.has(m.id))) {
      const entry=ordered.find(e=>byEntry.get(e.id)===member.userId);
      if(entry)links.push({memberId:member.id,entryId:entry.id});
    }
    let finalised=false,scores=[];
    try {
      // Eligibility is frozen at first finalisation; later payments cannot add past points.
      scores=calculateScores({...next,members:next.members.map(m=>({...m,paid:eligible.has(m.id)}))},links,source);
      finalised=true;
    } catch { /* Incomplete fixtures/entries stay in draft and award no points. */ }
    const value={sourceId,sourceTitle:source.week.title,links,automatic:true,finalised,scores,
      finalisedAt:finalised?(saved?.finalisedAt||now):null};
    if(saved?.eligibleMemberIds) value.eligibleMemberIds=saved.eligibleMemberIds;
    else if(finalised)value.eligibleMemberIds=links.map(l=>l.memberId);
    if(isDeepStrictEqual(saved,value))continue;
    next.weeks[week]=value;
    next.audit.unshift({at:now,action:'automatic',detail:`Week ${week}: ${finalised?'points updated':'entries linked · awaiting final results'}`});
  }
  return {data:next,warnings,changed:!isDeepStrictEqual(data,next)};
}

async function allRows(db,table,columns='*') {
  const rows=[];
  for(let start=0;;start+=1000){
    const r=await db.from(table).select(columns).order(table==='player_entry_links'?'entry_id':'id').range(start,start+999);
    if(r.error)throw r.error;
    rows.push(...r.data);if(r.data.length<1000)return rows;
  }
}

export async function reconcileAnnualLeague(db) {
  // Reload the league and inputs on conflicts rather than overwriting an admin payment/correction.
  for(let attempt=0;attempt<3;attempt++) {
    const league=await db.from('annual_league_seasons').select('*').eq('year',SEASON).single();
    if(league.error)throw league.error;
    const [weeks,fixtures,entries,archives,links]=await Promise.all([
      allRows(db,'coupon_weeks'),allRows(db,'fixtures'),allRows(db,'entries'),
      allRows(db,'coupon_archives','id,created_at,snapshot'),allRows(db,'player_entry_links','entry_id,user_id'),
    ]);
    archives.sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
    const result=automaticAnnualData(league.data.data,annualSources({weeks,fixtures,entries,archives}),links,new Date().toISOString());
    if(!result.changed)return {...league.data,automationWarnings:result.warnings};
    const saved=await db.from('annual_league_seasons').update({data:result.data,revision:league.data.revision+1}).eq('year',SEASON).eq('revision',league.data.revision).select().maybeSingle();
    if(saved.error)throw saved.error;
    if(saved.data)return {...saved.data,automationWarnings:result.warnings};
  }
  throw new Error('Annual league is being updated in another session. Please reload.');
}

export async function reconcileAnnualLeagueSafely(db) {
  try {await reconcileAnnualLeague(db);}
  catch {console.error('Annual league automatic update failed; the next league refresh will retry.');}
}
