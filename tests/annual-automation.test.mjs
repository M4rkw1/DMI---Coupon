import test from 'node:test';
import assert from 'node:assert/strict';
import {automaticAnnualData,annualSources,reconcileAnnualLeague} from '../lib/annualAutomation.mjs';
import {emptyLeague,changeLeague,standings} from '../lib/annualLeague.mjs';

const seed=()=>({...emptyLeague(),members:[{id:'m1',userId:'u1',name:'One',paid:true},{id:'m2',userId:'u2',name:'Two',paid:true},{id:'m3',userId:'u3',name:'Three',paid:false}]});
const source=()=>({week:{id:'w',title:'Week 1',calendar_year:2027,calendar_week:1},fixtures:[{id:'f',week_id:'w',status:'FT',home_score:1,away_score:0}],entries:[
 {id:'e1',week_id:'w',created_at:'2027-01-01',predictions:{f:{home:1,away:0}}},
 {id:'e2',week_id:'w',created_at:'2027-01-01',predictions:{f:{home:2,away:0}}},
 {id:'e3',week_id:'w',created_at:'2027-01-01',predictions:{f:{home:1,away:0}}},
]});
const accounts=[{entry_id:'e1',user_id:'u1'},{entry_id:'e2',user_id:'u2'},{entry_id:'e3',user_id:'u3'}];
const run=(data=seed(),coupon=source(),links=accounts)=>automaticAnnualData(data,[{week:1,sourceId:'w',source:coupon}],links,'now');
test('signed-in paid members get participation and podium points once; JSON key order does not trigger writes',()=>{
 const first=run();assert.deepEqual(standings(first.data).map(m=>m.points),[6,3]);
 assert.equal(first.data.weeks[1].automatic,true);assert.equal(first.data.weeks[1].links.length,2);
 assert.equal(run(first.data).changed,false);
 const reordered=JSON.parse(JSON.stringify(first.data),(_k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
 assert.equal(run(reordered).changed,false);
});
test('unstarted/in-progress fixtures award no points; final void fixtures can complete the coupon',()=>{
 const coupon=source();coupon.fixtures[0].status='2H';
 const draft=run(seed(),coupon);assert.equal(draft.data.weeks[1].finalised,false);assert.deepEqual(standings(draft.data).map(m=>m.points),[0,0]);
 coupon.fixtures.push({id:'void',status:'PST'});coupon.fixtures[0].status='FT';
 assert.equal(run(draft.data,coupon).data.weeks[1].finalised,true);
});
test('first signed-in entry counts, guests with same name do not match and unpaid members do not earn',()=>{
 const coupon=source();coupon.entries.push({...coupon.entries[0],id:'later',created_at:'2027-01-02'});
 coupon.entries[0].name='Two';coupon.entries[0].predictions.f={home:0,away:3};
 const result=run(seed(),coupon,[...accounts,{entry_id:'later',user_id:'u1'}]);
 assert.equal(result.data.weeks[1].links.find(l=>l.memberId==='m1').entryId,'e1');
 assert.equal(standings(result.data).find(m=>m.id==='m1').points,1);
 const guest=run(seed(),coupon,[]);assert.equal(guest.data.weeks[1].scores.length,0);
});
test('payment after first finalisation does not award retrospective points',()=>{
 const first=run().data;first.members[2].paid=true;
 assert.equal(standings(run(first).data).find(m=>m.id==='m3').points,0);
});
test('corrected results recalculate automatic points; reopening keeps admin in control',()=>{
 const first=run().data,coupon=source();coupon.fixtures[0].home_score=2;
 const corrected=run(first,coupon).data;
 assert.equal(standings(corrected).find(m=>m.id==='m2').points,6);
 coupon.fixtures[0].status='NS';
 assert.equal(run(corrected,coupon).data.weeks[1].finalised,false);
 const manual=changeLeague(first,'reopen',{week:1},{now:'later'});
 assert.equal(run(manual).changed,false);assert.equal(manual.weeks[1].automatic,false);
});
test('manual draft and finalised records are not overwritten',()=>{
 const manual=seed();manual.weeks[1]={finalised:false,links:[],scores:[]};
 assert.equal(run(manual).changed,false);
 manual.weeks[1].finalised=true;assert.equal(run(manual).changed,false);
});
test('live/archive copies count once and archived account links still work',()=>{
 const s=source();const input={weeks:[s.week],fixtures:s.fixtures,entries:s.entries,archives:[{id:'a',snapshot:s}]};
 const sources=annualSources(input);assert.equal(sources.length,1);assert.equal(sources[0].sourceId,'w');
 const archived=annualSources({...input,weeks:[],fixtures:[],entries:[]});
 assert.equal(automaticAnnualData(seed(),archived,accounts,'now').data.weeks[1].scores.length,2);
 s.week.calendar_year=2026;assert.equal(annualSources(input).length,0);
 s.week.calendar_year=2027;s.week.is_published=false;assert.equal(annualSources(input).length,0);
});
test('multiple different coupons assigned to the same annual week require admin choice',()=>{
 const result=automaticAnnualData(seed(),[{week:1,sourceId:'w',source:source()},{week:1,sourceId:'other',source:source()}],accounts,'now');
 assert.equal(result.changed,false);assert.match(result.warnings[0],/more than one coupon/);
});
test('reconciliation retries revision conflicts and does not overwrite a concurrent manual correction',async()=>{
 const s=source();let row={data:seed(),revision:1},writes=0;
 const db={from(table){let body;const q={select(){return q;},eq(){return q;},order(){return q;},async single(){return {data:structuredClone(row)};},async range(){return {data:({coupon_weeks:[s.week],fixtures:s.fixtures,entries:s.entries,coupon_archives:[],player_entry_links:accounts})[table]};},update(value){body=value;return q;},async maybeSingle(){writes++;row={data:{...seed(),weeks:{1:{automatic:false,finalised:false,links:[],scores:[]}}},revision:2};return {data:null};}};return q;}};
 const result=await reconcileAnnualLeague(db);assert.equal(writes,1);assert.equal(result.revision,2);assert.equal(result.data.weeks[1].automatic,false);
});
