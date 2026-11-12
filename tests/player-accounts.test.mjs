import test from 'node:test';
import assert from 'node:assert/strict';
import { entryIdentity, verifiedPlayer } from '../lib/playerIdentity.mjs';
import { createProfileHandler } from '../lib/playerProfileApi.mjs';
function database(profile=null) {
 const db={profile, user:{id:'11111111-1111-1111-1111-111111111111',email_confirmed_at:'2026-01-01'}, auth:{async getUser(token){return token==='valid'?{data:{user:db.user}}:{error:new Error('Bad token')};}},from(table){assert.equal(table,'player_profiles');let action='select',body;
 const q={select(){return q;},eq(_k,id){assert.equal(id,db.user.id);return q;},insert(value){if(db.profile)return Promise.resolve({error:{code:'23505'}});db.profile=value;return Promise.resolve({});},update(value){action='update';body=value;return q;},async maybeSingle(){if(action==='update'&&db.profile)db.profile={...db.profile,...body};return {data:db.profile};}};return q;}};return db;
}
async function request(db,method,body={},admin=false,authorization='Bearer valid'){
 const res={code:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(v){this.body=v;return this;},end(){}};
 await createProfileHandler({supabaseAdmin:()=>db,isAdmin:()=>admin})({method,body,query:{},headers:{authorization}},res);return res;
}
test('guest entries still accept their own details',async()=>{
 assert.deepEqual(await entryIdentity(database(),undefined,{name:' Guest ',department:' Deck '}),{name:'Guest',department:'Deck'});
});
test('verified account identity overrides tampered form fields',async()=>{
 assert.deepEqual(await entryIdentity(database({name:'Saved',department:'Rig'}),'Bearer valid',{name:'Imposter',department:'Other'}),{name:'Saved',department:'Rig'});
});
test('invalid or unverified sessions cannot silently submit as guests',async()=>{
 await assert.rejects(entryIdentity(database(),'Bearer expired',{name:'Guest'}),{status:401});
 await assert.rejects(verifiedPlayer(database(),'garbage'),{status:401});
 const db=database();db.user.email_confirmed_at=null;
 await assert.rejects(verifiedPlayer(db,'Bearer valid'),{status:401});
});
test('verified accounts must create a profile before entering',async()=>{
 await assert.rejects(entryIdentity(database(),'Bearer valid',{name:'Guest'}),{status:409});
});
test('profile creation ignores supplied user ID and repeated setup cannot change identity',async()=>{
 const db=database();const first=await request(db,'POST',{name:'Mark',department:'Deck',user_id:'someone-else'});
 assert.equal(first.code,200);assert.equal(db.profile.user_id,db.user.id);
 const second=await request(db,'POST',{name:'Changed',department:'Other'});
 assert.equal(second.body.profile.name,'Mark');assert.equal(db.profile.department,'Deck');
});
test('players and guests cannot patch a profile; admin can',async()=>{
 const db=database({name:'Mark',department:'Deck'});const body={name:'Updated',department:'Mech',user_id:db.user.id};
 assert.equal((await request(db,'PATCH',body)).code,403);
 assert.equal((await request(db,'PATCH',body,false,null)).code,401);
 assert.equal(db.profile.name,'Mark');
 assert.equal((await request(db,'PATCH',body,true)).code,200);assert.equal(db.profile.name,'Updated');
});
test('bad profile data is rejected and responses are not cached',async()=>{
 const response=await request(database(),'POST',{name:' ',department:'Deck'});
 assert.equal(response.code,400);assert.equal(response.headers['Cache-Control'],'no-store');
});
