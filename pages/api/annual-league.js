import { randomUUID } from 'node:crypto';
import { supabaseAdmin, isAdmin } from '../../lib/supabase';
import { SEASON, changeLeague, standings } from '../../lib/annualLeague.mjs';

export default async function handler(req,res) {
  res.setHeader('Cache-Control','private, no-store');
  const admin=isAdmin(req);
  if(!['GET','POST'].includes(req.method)) return res.status(405).json({error:'Method not allowed'});
  if(req.method==='POST'&&!admin) return res.status(401).json({error:'Not authorised'});
  try {
    const db=supabaseAdmin();
    const result=await db.from('annual_league_seasons').select('*').eq('year',SEASON).single();
    if(result.error) {
      if(!admin&&req.method==='GET') return res.status(200).json({released:false});
      throw new Error('Annual League storage is unavailable. Run add_annual_league.sql in Supabase before using this section.');
    }
    const row=result.data;
    if(req.method==='GET') {
      if(admin) return res.status(200).json(row);
      if(!row.data.released) return res.status(200).json({released:false});
      return res.status(200).json({released:true,year:SEASON,pot:row.data.members.filter(m=>m.paid).length*100,weeks:Object.values(row.data.weeks).filter(w=>w.finalised).length,standings:standings(row.data).map(({name,entries,wins,seconds,points,position})=>({name,entries,wins,seconds,points,position}))});
    }
    const {action,payload={},revision}=req.body||{};
    if(revision!==row.revision) return res.status(409).json({error:'The league changed in another session. Reload before saving.'});
    let source;
    if(['saveWeek','finalise'].includes(action)) {
      const sourceId=String(payload.sourceId||'');
      if(sourceId.startsWith('archive:')) {
        const archive=await db.from('coupon_archives').select('snapshot').eq('id',sourceId.slice(8)).single();
        if(archive.error) throw new Error('Archived coupon not found.');
        source=archive.data.snapshot;
      } else {
        const [week,fixtures,entries]=await Promise.all([db.from('coupon_weeks').select('*').eq('id',sourceId).single(),db.from('fixtures').select('*').eq('week_id',sourceId),db.from('entries').select('*').eq('week_id',sourceId)]);
        if(week.error||fixtures.error||entries.error) throw new Error('Could not load the selected coupon.');
        source={week:week.data,fixtures:fixtures.data,entries:entries.data};
      }
    }
    let data;
    try { data=changeLeague(row.data,action,payload,{id:randomUUID(),now:new Date().toISOString(),source}); }
    catch(e) { return res.status(400).json({error:e.message}); }
    const updated=await db.from('annual_league_seasons').update({data,revision:row.revision+1}).eq('year',SEASON).eq('revision',row.revision).select().maybeSingle();
    if(updated.error) throw updated.error;
    if(!updated.data) return res.status(409).json({error:'Another admin saved changes. Reload before saving.'});
    return res.status(200).json(updated.data);
  } catch(e) {return res.status(500).json({error:e.message});}
}
