const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function worker(fetch) {
  const listeners = {};
  const cached = [];
  const context = {
    URL, fetch,
    self:{ location:{origin:'https://coupon.example'}, addEventListener:(name,fn)=>listeners[name]=fn, skipWaiting:async()=>{}, clients:{claim:async()=>{}} },
    caches:{open:async()=>({add:async url=>cached.push(url)}),keys:async()=>[],match:async url=>({offline:url})},
  };
  vm.runInNewContext(fs.readFileSync('public/sw.js','utf8'),context);
  return {listeners,cached};
}
test('installation caches only the offline page',async()=>{
  const {listeners,cached}=worker(); let pending;
  listeners.install({waitUntil:p=>pending=p}); await pending;
  assert.deepEqual(cached,['/offline.html']);
});
test('API reads and writes bypass the worker',()=>{
  const {listeners}=worker(()=>{throw new Error('Should not fetch');});
  for(const [method,mode,url] of [['GET','cors','https://coupon.example/api/state'],['POST','cors','https://coupon.example/api/entry'],['POST','navigate','https://coupon.example/api/admin'],['GET','navigate','https://other.example/']]) {
    listeners.fetch({request:{method,mode,url},respondWith:()=>assert.fail('Intercepted private or non-navigation request')});
  }
});
test('navigation uses network response when available',async()=>{
  const {listeners}=worker(async()=>({network:true})); let result;
  listeners.fetch({request:{method:'GET',mode:'navigate',url:'https://coupon.example/'},respondWith:p=>result=p});
  assert.deepEqual(await result,{network:true});
});
test('failed navigation returns offline guidance instead of stale scores',async()=>{
  const {listeners}=worker(async()=>{throw new Error('Offline');});let result;
  listeners.fetch({request:{method:'GET',mode:'navigate',url:'https://coupon.example/'},respondWith:p=>result=p});
  assert.deepEqual(await result,{offline:'/offline.html'});
});
