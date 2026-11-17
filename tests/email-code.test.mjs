import test from 'node:test';
import assert from 'node:assert/strict';
import {requestEmailCode,verifyEmailCode} from '../lib/emailCode.mjs';

test('code request keeps legacy email-link redirect compatible',async()=>{
 let received;
 await requestEmailCode({signInWithOtp:async args=>{received=args;return {};}},' player@example.com ','https://coupon.example');
 assert.deepEqual(received,{email:'player@example.com',options:{emailRedirectTo:'https://coupon.example/account'}});
});
test('code is verified in the current app client using the matching email',async()=>{
 let received;
 await verifyEmailCode({verifyOtp:async args=>{received=args;return {};}},' player@example.com ','123 456');
 assert.deepEqual(received,{email:'player@example.com',token:'123456',type:'email'});
});
test('invalid code never contacts the auth provider',async()=>{
 for(const code of ['','123','abc123','12345678901'])await assert.rejects(verifyEmailCode({verifyOtp:()=>assert.fail('must not call')},'p@example.com',code),/numeric sign-in code/);
});
test('failed sends and expired codes are reported instead of implying success',async()=>{
 await assert.rejects(requestEmailCode({signInWithOtp:async()=>({error:new Error('Rate limited')})},'p@example.com','https://coupon.example'),/Rate limited/);
 await assert.rejects(verifyEmailCode({verifyOtp:async()=>({error:new Error('Expired')})},'p@example.com','123456'),/invalid or has expired/);
});
