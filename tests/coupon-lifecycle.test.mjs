import test from 'node:test';
import assert from 'node:assert/strict';
import {currentCoupon,entryCandidates,closeCurrentCoupon} from '../lib/couponLifecycle.mjs';

const snapshot={fixtures:[{status:'FT',home_score:1,away_score:0}],entries:[{id:'entry'}]};
function setup(){
 const weeks=[{id:'live',is_current:true,is_published:true},{id:'future',is_current:false,is_published:true},{id:'draft',is_current:false,is_published:false}];
 const events=[];
 const db={from(table){assert.equal(table,'coupon_weeks');let deleting=false;const filters={};const q={select(){return q;},eq(k,v){filters[k]=v;return q;},order(){return q;},limit(){return q;},delete(){deleting=true;return q;},async maybeSingle(){return {data:weeks.find(w=>w.is_current)||null};},then(resolve){assert.equal(deleting,true);events.push('delete');const index=weeks.findIndex(w=>w.id===filters.id&&w.is_current===filters.is_current);const data=index<0?[]:weeks.splice(index,1);return Promise.resolve({data}).then(resolve);}};return q;}};
 return {weeks,events,db,options:{expectedId:'live',loadSnapshot:async()=>snapshot,archive:async()=>{events.push('archive');return {id:'historic'};}}};
}
test('close archives then deletes only the live coupon; no other coupon opens',async()=>{
 const s=setup(),others=structuredClone(s.weeks.slice(1));
 const result=await closeCurrentCoupon(s.db,s.options);
 assert.deepEqual(s.events,['archive','delete']);assert.deepEqual(s.weeks,others);
 assert.equal(result.archive_id,'historic');assert.equal(currentCoupon(s.weeks),null);assert.deepEqual(entryCandidates(s.weeks),[]);
});
test('archive failure prevents deletion',async()=>{
 const s=setup();await assert.rejects(closeCurrentCoupon(s.db,{...s.options,archive:async()=>null}),/Nothing was deleted/);
 assert.equal(s.weeks.length,3);assert.deepEqual(s.events,[]);
});
test('stale close and unfinished results cannot delete a coupon',async()=>{
 const s=setup();await assert.rejects(closeCurrentCoupon(s.db,{...s.options,expectedId:'old'}),/changed/);
 await assert.rejects(closeCurrentCoupon(s.db,{...s.options,loadSnapshot:async()=>({...snapshot,fixtures:[{status:'2H',home_score:1,away_score:0}]})}),/Finish or void/);
 assert.equal(s.weeks.length,3);assert.deepEqual(s.events,[]);
});
test('empty inventory and remaining drafts are valid closed states',()=>{
 for(const weeks of [[],[{id:'draft',is_current:false,is_published:false}],[{id:'published',is_current:false,is_published:true}]]){
  assert.equal(currentCoupon(weeks),null);assert.deepEqual(entryCandidates(weeks),[]);
 }
});
test('explicit activation enables only published entry candidates',()=>{
 const s=setup();s.weeks.shift();s.weeks[0].is_current=true;
 assert.equal(currentCoupon(s.weeks).id,'future');assert.deepEqual(entryCandidates(s.weeks).map(w=>w.id),['future']);
});
