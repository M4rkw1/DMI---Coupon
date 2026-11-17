import test from 'node:test';
import assert from 'node:assert/strict';
import {podiumAward,calculateScores,emptyLeague,standings} from '../lib/annualLeague.mjs';

test('every tied finisher receives the full 5, 3 or 2 point podium award',()=>{
  const points=[21,21,19,19,17,17,12];
  const levels=[...new Set(points)].sort((a,b)=>b-a);
  assert.deepEqual(points.map(p=>podiumAward(p,levels).bonus),[5,5,3,3,2,2,0]);
  assert.deepEqual(points.map(p=>podiumAward(p,levels).place),[1,1,2,2,3,3,4]);
});

test('full scoring retains participation and counts all tied podium finishes',()=>{
 const predictions=[[[1,0],[1,0]],[[1,0],[1,0]],[[1,0],[2,0]],[[1,0],[2,0]],[[1,0],[0,1]],[[1,0],[0,1]],[[2,0],[2,0]]];
 const data={...emptyLeague(),members:predictions.map((_,i)=>({id:`m${i}`,name:`Player ${i}`,paid:true}))};
 const source={fixtures:['f1','f2'].map(id=>({id,status:'FT',home_score:1,away_score:0})),entries:predictions.map((p,i)=>({id:`e${i}`,predictions:Object.fromEntries(p.map(([home,away],j)=>[`f${j+1}`,{home,away}]))}))};
 const links=data.members.map((m,i)=>({memberId:m.id,entryId:`e${i}`}));
 data.weeks[1]={finalised:true,scores:calculateScores(data,links,source)};
 assert.deepEqual(standings(data).map(m=>m.points),[6,6,4,4,3,3,1]);
 assert.deepEqual(standings(data).map(m=>[m.wins,m.seconds,m.thirds]),[[1,0,0],[1,0,0],[0,1,0],[0,1,0],[0,0,1],[0,0,1],[0,0,0]]);
});
