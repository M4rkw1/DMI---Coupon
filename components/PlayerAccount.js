import { useEffect, useState } from 'react';
import { accountsEnabled, playerAuth, playerToken } from '../lib/playerAuth';

export function usePlayerAccount() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(accountsEnabled);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!accountsEnabled) return;
    let subscription;
    try {
      // INITIAL_SESSION also handles stored sessions and email-link callbacks.
      subscription = playerAuth().auth.onAuthStateChange((_event, next) => {
        setSession(next); setProfile(null); setError(''); setLoading(!!next);
      }).data.subscription;
    } catch (e) { setError(e.message); setLoading(false); }
    return () => subscription?.unsubscribe();
  }, []);
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const token = await playerToken();
        const r = await fetch('/api/player-profile', { headers: { Authorization: `Bearer ${token}` } });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        if (!cancelled) { setProfile(data.profile); setError(''); }
      } catch (e) { if (!cancelled) { setProfile(null); setError(e.message); } }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [session, revision]);
  return { session, profile, loading, error, reload: () => setRevision(n => n + 1) };
}

export default function PlayerAccount({ account }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [department, setDepartment] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function perform(action) {
    setBusy(true); setMessage('');
    try { await action(); } catch (e) { setMessage(e.message); }
    finally { setBusy(false); }
  }
  return <section className="card playerAccount">
    <h1>My account</h1>
    <p>Sign-in is optional. Your name and department will be remembered on each coupon.</p>
    {!accountsEnabled ? <p>Player sign-in is not enabled yet. You can still enter as a guest.</p> : account.loading ? <p role="status">Loading your account…</p> : account.session ? <>
      <p>Signed in as {account.session.user.email}</p>
      {account.error ? <><p role="alert">{account.error}</p><button onClick={account.reload}>Retry</button></> : account.profile ? <>
        <dl><dt>Entry name</dt><dd>{account.profile.name}</dd><dt>Department</dt><dd>{account.profile.department || 'Not set'}</dd></dl>
        <p>Only the coupon admin can change these details. Contact them if you need a correction.</p>
      </> : <form onSubmit={e => { e.preventDefault(); perform(async () => {
        const token = await playerToken();
        const r = await fetch('/api/player-profile', { method:'POST', headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({name,department}) });
        const data=await r.json(); if(!r.ok) throw new Error(data.error); account.reload();
      }); }}>
        <label>Entry name<input required maxLength={100} value={name} onChange={e=>setName(e.target.value)} autoComplete="name" /></label>
        <label>Department (optional)<input maxLength={100} value={department} onChange={e=>setDepartment(e.target.value)} /></label>
        <p>Check these details carefully. Once saved, only the admin can change them.</p>
        <button className="primary" disabled={busy}>Save my details</button>
      </form>}
      <button disabled={busy} onClick={()=>perform(async()=>{const {error}=await playerAuth().auth.signOut({scope:'local'});if(error)throw error;})}>Sign out</button>
    </> : <form onSubmit={e=>{e.preventDefault();perform(async()=>{
      const {error}=await playerAuth().auth.signInWithOtp({email:email.trim(),options:{emailRedirectTo:`${window.location.origin}/account`}});
      if(error) throw error;
      setMessage('Check your email for a sign-in link. You will stay signed in on this device.');
    });}}>
      {account.error && <p role="alert">{account.error}</p>}
      <label>Email address<input type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} /></label>
      <p>No password needed. Sign in once and we’ll keep you signed in on this device until you sign out or your session expires. On a shared device, sign out when finished.</p>
      <button className="primary" disabled={busy}>{busy?'Sending…':'Email me a sign-in link'}</button>
    </form>}
    {message && <p role="status">{message}</p>}
    <p><a href="/#enter%20coupon">{account.session ? 'Back to coupon' : 'Continue as a guest'}</a></p>
  </section>;
}
