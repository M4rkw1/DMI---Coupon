import test from 'node:test';
import assert from 'node:assert/strict';
import {changeLeague,emptyLeague,standings} from '../lib/annualLeague.mjs';
import {createAnnualLeagueHandler} from '../lib/annualLeagueApi.mjs';

const profile={user_id:'11111111-1111-1111-1111-111111111111',name:'Saved Player',department:'Deck'};
const context={id:'new-member',now:'2026-11-13T12:00:00Z',profile};
test('enrolment uses saved identity, confirms payment and stays private until release',()=>{
  const data=changeLeague(emptyLeague(),'enrolAccount',{paid:true,name:'Forged',userId:'forged'},context);
  assert.deepEqual(data.members,[{id:'new-member',userId:profile.user_id,name:profile.name,department:'Deck',paid:true}]);
  assert.equal(data.released,false);
  assert.equal(standings(data)[0].points,0);
  const again=changeLeague(data,'enrolAccount',{paid:true},context);
  assert.equal(again.members.length,1);
  assert.match(again.audit[0].detail,/\$100 paid/);
});
test('cannot enrol without a saved profile and confirmed payment',()=>{
  assert.throws(()=>changeLeague(emptyLeague(),'enrolAccount',{paid:true},{}),/account not found/);
  for(const paid of [false,undefined,'true']) assert.throws(()=>changeLeague(emptyLeague(),'enrolAccount',{paid},context),/payment/);
});
test('explicit legacy linking preserves membership ID and finalised points',()=>{
  const data={...emptyLeague(),members:[{id:'old',name:'Old display name',paid:true}],weeks:{1:{finalised:true,scores:[{memberId:'old',bonus:5}]}}};
  const next=changeLeague(data,'enrolAccount',{memberId:'old',paid:true},context);
  assert.equal(next.members.length,1);assert.equal(next.members[0].id,'old');
  assert.equal(standings(next)[0].points,6);
  assert.deepEqual(next.weeks,data.weeks);
  const unpaid=changeLeague(next,'enrolAccount',{paid:false},context);
  assert.equal(standings(unpaid).length,0);assert.deepEqual(unpaid.weeks,data.weeks);
});
test('same-name memberships require explicit linking; accounts cannot take over each other',()=>{
  const data={...emptyLeague(),members:[{id:'old',name:profile.name,paid:false}]};
  assert.throws(()=>changeLeague(data,'enrolAccount',{paid:true},context),/already exists/);
  data.members[0].userId='other-account';
  assert.throws(()=>changeLeague(data,'enrolAccount',{paid:true,memberId:'old'},context),/another account/);
  data.members[0].userId=profile.user_id;
  assert.throws(()=>changeLeague(data,'enrolAccount',{paid:true,memberId:'different'},context),/already linked/);
});

function database({savedProfile=profile,conflict=false}={}) {
  const db={row:{year:2027,revision:4,data:emptyLeague()},writes:0,from(table){
    let body;
    const q={select(){return q;},eq(){return q;},update(value){body=value;return q;},async single(){return {data:structuredClone(db.row)};},async maybeSingle(){
      if(table==='player_profiles') return {data:savedProfile};
      assert.equal(table,'annual_league_seasons');
      if(conflict)return {data:null};
      db.writes++;db.row={...db.row,...body};return {data:db.row};
    }};return q;
  }};return db;
}
async function request(db,{admin=true,method='POST',body={action:'enrolAccount',revision:4,payload:{userId:profile.user_id,paid:true,name:'Tampered',phone:'secret'}}}={}) {
  const res={code:200,setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
  await createAnnualLeagueHandler({supabaseAdmin:()=>db,isAdmin:()=>admin,reconcile:async()=>db.row})({method,body,headers:{authorization:'Bearer player'}},res);
  return res;
}
test('API rejects player enrolment and stale admin revisions without writes',async()=>{
  const db=database();assert.equal((await request(db,{admin:false})).code,401);
  assert.equal((await request(db,{body:{action:'enrolAccount',revision:3,payload:{userId:profile.user_id,paid:true}}})).code,409);
  assert.equal(db.writes,0);
});
test('API loads canonical profile and rejects missing profiles and conflicting saves',async()=>{
  const db=database();assert.equal((await request(db)).code,200);
  assert.equal(db.row.data.members[0].name,profile.name);
  assert.equal(db.row.data.members[0].phone,undefined);
  assert.equal((await request(database({savedProfile:null}))).code,404);
  assert.equal((await request(database({conflict:true}))).code,409);
});
test('public API never returns account IDs or department in annual standings',async()=>{
  const db=database();await request(db);
  assert.deepEqual((await request(db,{admin:false,method:'GET'})).body,{released:false});
  db.row.data.released=true;
  const res=await request(db,{admin:false,method:'GET'});
  assert.equal(res.body.pot,100);assert.equal(res.body.standings[0].name,profile.name);
  assert.equal(res.body.standings[0].userId,undefined);assert.equal(res.body.standings[0].department,undefined);
});
