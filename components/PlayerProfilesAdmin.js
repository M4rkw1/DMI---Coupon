import { useEffect, useState } from 'react';
import AnnualAccountEnrolment from './AnnualAccountEnrolment';
function ProfileRow({ profile, admin }) {
  const [name,setName]=useState(profile.name);
  const [department,setDepartment]=useState(profile.department);
  const [phone,setPhone]=useState(profile.phone || '');
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  return <form className="playerProfileRow" onSubmit={async e=>{e.preventDefault();setBusy(true);setMessage('');try {
    const r=await fetch('/api/player-profile',{method:'PATCH',headers:{'Content-Type':'application/json','x-admin-pass':admin},body:JSON.stringify({user_id:profile.user_id,name,department,phone})});
    const data=await r.json();if(!r.ok)throw new Error(data.error);setName(data.profile.name);setDepartment(data.profile.department);setPhone(data.profile.phone);setMessage('Saved. Future entries will use these details.');
  } catch(e){setMessage(e.message);}finally{setBusy(false);}}}>
    <label>Name<input required maxLength={100} value={name} onChange={e=>setName(e.target.value)} /></label>
    <label>Department<input maxLength={100} value={department} onChange={e=>setDepartment(e.target.value)} /></label>
    <label>WhatsApp phone number<input type="tel" required maxLength={40} placeholder="+44 7700 900123" value={phone} onChange={e=>setPhone(e.target.value)} /></label>
    <p>Private contact number for matching players in the WhatsApp group. Self-reported; not verified by WhatsApp.</p>
    <button disabled={busy}>{busy?'Saving…':'Save player details'}</button><p role="status">{message}</p>
  </form>;
}
export default function PlayerProfilesAdmin({admin}) {
  const [league,setLeague]=useState(null),[leagueError,setLeagueError]=useState(''),[leagueBusy,setLeagueBusy]=useState(false),[leagueMessage,setLeagueMessage]=useState('');
  const [profiles,setProfiles]=useState([]);const [page,setPage]=useState(0);const [error,setError]=useState('');const [loading,setLoading]=useState(false);const [open,setOpen]=useState(false);
  useEffect(()=>{if(!open)return;let cancelled=false;setLoading(true);setError('');
    fetch(`/api/player-profile?page=${page}`,{headers:{'x-admin-pass':admin}}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error);if(!cancelled)setProfiles(d.profiles);}).catch(e=>{if(!cancelled)setError(e.message);}).finally(()=>{if(!cancelled)setLoading(false);});return()=>{cancelled=true;};
  },[admin,page,open]);
  async function loadLeague(){
    setLeagueBusy(true);setLeagueError('');
    try {const r=await fetch('/api/annual-league',{headers:{'x-admin-pass':admin},cache:'no-store'});const d=await r.json();if(!r.ok)throw Error(d.error);setLeague(d);}
    catch(e){setLeague(null);setLeagueError(e.message);}finally{setLeagueBusy(false);}
  }
  useEffect(()=>{if(open)loadLeague();},[admin,open]);
  async function saveEnrolment(payload){
    setLeagueBusy(true);setLeagueError('');setLeagueMessage('');
    try {const r=await fetch('/api/annual-league',{method:'POST',headers:{'Content-Type':'application/json','x-admin-pass':admin},body:JSON.stringify({action:'enrolAccount',payload,revision:league.revision})});const d=await r.json();if(!r.ok)throw Error(d.error);setLeague(d);setLeagueMessage(payload.paid?'Annual payment confirmed. Player enrolled in the 2027 league.':'Annual payment marked unpaid.');}
    catch(e){setLeagueError(e.message);}finally{setLeagueBusy(false);}
  }
  return <section><h3>Player accounts</h3><p>Change the saved identity used for future signed-in entries. Existing entries are unchanged.</p>
    <button onClick={()=>setOpen(!open)}>{open?'Hide player accounts':'Load player accounts'}</button>
    {open && (loading ? <p>Loading…</p> : error ? <p role="alert">{error}</p> : <>
      {!profiles.length && <p>No player profiles on this page.</p>}
      <p>Enrol saved players in the 2027 annual league after receiving their separate $100 annual payment. Weekly coupon entries still need verification in Winners League.</p>
      <button disabled={leagueBusy} onClick={loadLeague}>Reload annual payments</button>
      {leagueError && <p role="alert">{leagueError}</p>}
      {leagueMessage && <p role="status">{leagueMessage}</p>}
      {profiles.map(profile=>{const member=league?.data.members.find(m=>m.userId===profile.user_id);return <section className="playerAccountAdminCard" key={profile.user_id}>
        <ProfileRow profile={profile} admin={admin} />
        {league ? <AnnualAccountEnrolment key={`${profile.user_id}:${member?.id}:${member?.paid}`} profile={profile} league={league} busy={leagueBusy} onSave={saveEnrolment} /> : <p>{leagueBusy?'Loading annual membership…':'Reload annual payments to enrol this player.'}</p>}
      </section>})}
      <button disabled={page===0} onClick={()=>setPage(p=>p-1)}>Previous</button><span> Page {page+1} </span><button disabled={profiles.length<50} onClick={()=>setPage(p=>p+1)}>Next</button>
    </>)}
  </section>;
}
