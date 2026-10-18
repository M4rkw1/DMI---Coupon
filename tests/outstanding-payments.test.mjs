import test from 'node:test';
import assert from 'node:assert/strict';
import { outstandingPayments, outstandingTotals } from '../lib/outstandingPayments.mjs';
const parse = value => value ? new Date(value) : null;
const now = new Date('2026-10-18');
const entry = (id,paid=false) => ({id,name:'Mark',department:'Deck',paid});
const archive = (id, rows, date='2026-10-10', fee=10) => ({id,created_at:date,week_title:'Week 41',leaderboard:rows,snapshot:{week:{id:'old'},settings:{currency:'GBP',entry_fee:fee},entries:rows}});
const base = () => ({week:{id:'current',title:'Week 42',is_current:true},entries:[entry('new')],settings:{entry_fee:10,currency:'GBP'},archives:[archive('a',[entry('old')])]});
test('includes previous unpaid coupon alongside current entry without combining people by name',()=>{
  const result=outstandingPayments(base(),parse,now);
  assert.equal(result.length,2);
  assert.equal(result.find(e=>e.id==='old').previous,true);
  assert.equal(result.find(e=>e.id==='new').previous,false);
  assert.equal(outstandingTotals(result),'GBP 20.00');
});
test('paid archive disappears and repeated snapshots cannot count an entry twice',()=>{
  const state=base(); state.archives.push(archive('b',[entry('old',true)],'2026-10-11'));
  assert.deepEqual(outstandingPayments(state,parse,now).map(e=>e.id),['new']);
});
test('closed coupon stays visible and paid archive overrides the retained live entry',()=>{
  const state=base(); state.week={id:'old',is_current:false};state.entries=[entry('old')];
  state.archives=[archive('a',[entry('old',true)])];
  state.fixtures=[{kickoff:'2026-10-10'}];
  assert.equal(outstandingPayments(state,parse,now).length,0);
});
test('future entries are excluded; past nonarchived entries are included',()=>{
  const state=base();state.weeks=[state.week,{id:'past',title:'Week 40'},{id:'future',title:'Week 43'}];
  state.entriesByWeek={past:[entry('past')],future:[entry('future')]};
  state.fixturesByWeek={past:[{kickoff:'2026-10-01'}],future:[{kickoff:'2026-10-25'}]};
  assert.deepEqual(new Set(outstandingPayments(state,parse,now).map(e=>e.id)),new Set(['new','old','past']));
});
test('uses each week’s fee and keeps different currencies separate, including zero fees',()=>{
 const state=base();state.settings={entry_fee:12.5,currency:'USD'};state.archives.push(archive('b',[entry('free')],'2026-10-11',0));
 const rows=outstandingPayments(state,parse,now);
 assert.equal(rows.find(e=>e.id==='free').amount,0);
 assert.match(outstandingTotals(rows),/GBP 10.00/);assert.match(outstandingTotals(rows),/USD 12.50/);
});
test('falls back to snapshot entries and current live payment wins over a stale snapshot',()=>{
 const state=base();state.archives[0].leaderboard=[];
 state.archives.push({...archive('b',[entry('new')]),snapshot:{week:state.week,settings:state.settings}});
 state.entries=[entry('new',true)];
 assert.deepEqual(outstandingPayments(state,parse,now).map(e=>e.id),['old']);
});
