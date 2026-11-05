import test from 'node:test';
import assert from 'node:assert/strict';
import { fixturePresentation, predictionPresentation } from '../lib/predictionPresentation.mjs';

test('unstarted fixtures never mark predictions as misses', () => {
  assert.deepEqual(predictionPresentation({home:0,away:0},{home_score:null,away_score:null,status:'NS'},0),{score:'0 – 0',kind:'pending',label:'Not started'});
});
test('zero scores are valid and awarded points determine the label', () => {
  const f={home_score:0,away_score:0,status:'FT'};
  assert.equal(fixturePresentation(f).score,'0 – 0');
  assert.equal(predictionPresentation({home:0,away:0},f,3).kind,'exact');
  assert.equal(predictionPresentation({home:1,away:1},f,1).kind,'result');
  assert.equal(predictionPresentation({home:1,away:0},f,0).kind,'miss');
});
test('missing and partial predictions have no pick rather than a fabricated zero score', () => {
  for(const p of [undefined,{home:'',away:''},{home:2},{home:null,away:0}]) assert.equal(predictionPresentation(p,{home_score:2,away_score:1,status:'FT'},0).label,'No pick');
});
test('current, final and postponed matches are distinguished', () => {
  assert.equal(fixturePresentation({home_score:1,away_score:0,status:'2H'}).scoreLabel,'Current score');
  assert.equal(fixturePresentation({home_score:1,away_score:0,status:'FT'}).scoreLabel,'Final score');
  assert.equal(predictionPresentation({home:1,away:0},{home_score:null,away_score:null,status:'PST'},0).label,'Postponed');
});
test('string scores compare numerically and halftime zero is retained', () => {
  const f=fixturePresentation({home_score:'10',away_score:'2',status:'FT',ht_home_score:0,ht_away_score:0});
  assert.equal(f.result,'Home win');assert.equal(f.halfTime,'HT 0–0');
});
