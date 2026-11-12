import { useEffect, useState } from 'react';
function ProfileRow({ profile, admin }) {
  const [name,setName]=useState(profile.name);
  const [department,setDepartment]=useState(profile.department);
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  return <form className="playerProfileRow" onSubmit={async e=>{e.preventDefault();setBusy(true);setMessage('');try {
    const r=await fetch('/api/player-profile',{method:'PATCH',headers:{'Content-Type':'application/json','x-admin-pass':admin},body:JSON.stringify({user_id:profile.user_id,name,department})});
    const data=await r.json();if(!r.ok)throw new Error(data.error);setName(data.profile.name);setDepartment(data.profile.department);setMessage('Saved. Future entries will use these details.');
  } catch(e){setMessage(e.message);}finally{setBusy(false);}}}>
    <label>Name<input required maxLength={100} value={name} onChange={e=>setName(e.target.value)} /></label>
    <label>Department<input maxLength={100} value={department} onChange={e=>setDepartment(e.target.value)} /></label>
    <button disabled={busy}>{busy?'Saving…':'Save player details'}</button><p role="status">{message}</p>
  </form>;
}
export default function PlayerProfilesAdmin({admin}) {
  const [profiles,setProfiles]=useState([]);const [page,setPage]=useState(0);const [error,setError]=useState('');const [loading,setLoading]=useState(false);const [open,setOpen]=useState(false);
  useEffect(()=>{if(!open)return;let cancelled=false;setLoading(true);setError('');
    fetch(`/api/player-profile?page=${page}`,{headers:{'x-admin-pass':admin}}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error);if(!cancelled)setProfiles(d.profiles);}).catch(e=>{if(!cancelled)setError(e.message);}).finally(()=>{if(!cancelled)setLoading(false);});return()=>{cancelled=true;};
  },[admin,page,open]);
  return <section><h3>Player accounts</h3><p>Change the saved identity used for future signed-in entries. Existing entries are unchanged.</p>
    <button onClick={()=>setOpen(!open)}>{open?'Hide player accounts':'Load player accounts'}</button>
    {open && (loading ? <p>Loading…</p> : error ? <p role="alert">{error}</p> : <>
      {!profiles.length && <p>No player profiles on this page.</p>}
      {profiles.map(profile=><ProfileRow key={profile.user_id} profile={profile} admin={admin} />)}
      <button disabled={page===0} onClick={()=>setPage(p=>p-1)}>Previous</button><span> Page {page+1} </span><button disabled={profiles.length<50} onClick={()=>setPage(p=>p+1)}>Next</button>
    </>)}
  </section>;
}
