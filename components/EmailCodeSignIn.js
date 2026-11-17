import {useEffect,useState} from 'react';
import {playerAuth} from '../lib/playerAuth';
import {requestEmailCode,verifyEmailCode} from '../lib/emailCode.mjs';

export default function EmailCodeSignIn({accountError}) {
  const [email,setEmail]=useState(''),[code,setCode]=useState(''),[enterCode,setEnterCode]=useState(false);
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
  const [cooldown,setCooldown]=useState(false);
  useEffect(()=>{try {const pending=sessionStorage.getItem('rig-pending-sign-in-email');if(pending){setEmail(pending);setEnterCode(true);}}catch{}},[]);
  useEffect(()=>{if(!cooldown)return;const timer=setTimeout(()=>setCooldown(false),60000);return()=>clearTimeout(timer);},[cooldown]);
  async function send(){
    setBusy(true);setError('');setMessage('');
    try {
      await requestEmailCode(playerAuth().auth,email,window.location.origin);
      setEnterCode(true);setCode('');setCooldown(true);
      try{sessionStorage.setItem('rig-pending-sign-in-email',email.trim());}catch{}
      setMessage('Code sent. Check your email, then return here to enter it.');
    }catch(e){setError(e.message);}finally{setBusy(false);}
  }
  async function verify(){
    setBusy(true);setError('');setMessage('');
    try {
      await verifyEmailCode(playerAuth().auth,email,code);
      setCode('');try{sessionStorage.removeItem('rig-pending-sign-in-email');}catch{}
    }catch(e){setError(e.message);}finally{setBusy(false);}
  }
  return <form onSubmit={e=>{e.preventDefault();enterCode?verify():send();}}>
    {accountError&&<p role="alert">{accountError}</p>}
    <label>Email address<input type="email" required autoComplete="email" value={email} disabled={busy} onChange={e=>{setEmail(e.target.value);setCode('');}} /></label>
    <p>Using the home-screen app? Request your code here, check your email, then reopen the app from its home-screen icon and enter the code here. You do not need to open an email link.</p>
    {enterCode&&<label>Sign-in code<input type="text" inputMode="numeric" autoComplete="one-time-code" required pattern="[0-9 ]{6,12}" maxLength={12} value={code} disabled={busy} onChange={e=>setCode(e.target.value)} /></label>}
    <button className="primary" disabled={busy||(!enterCode&&cooldown)}>{busy?'Please wait…':enterCode?'Sign in':'Email me a sign-in code'}</button>
    {enterCode ? <button type="button" disabled={busy||cooldown||!email.trim()} onClick={send}>{cooldown?'Wait a minute to resend':'Send a new code'}</button> : <button type="button" disabled={busy} onClick={()=>{setEnterCode(true);setMessage('Enter your email address and the code from your latest email.');}}>I already have a code</button>}
    {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
    <p>No password needed. You’ll stay signed in here until you sign out or your session expires. On a shared device, sign out when finished.</p>
    <details><summary>Home-screen icon opens Safari?</summary><p>Open the coupon in Safari, choose Share → Add to Home Screen and turn on “Open as Web App” if offered. Then open that icon and sign in with your email code. Browser sign-in and app sign-in can be separate.</p></details>
  </form>;
}
