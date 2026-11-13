import { useState } from 'react';
import { SEASON } from '../lib/annualLeague.mjs';

export default function AnnualAccountEnrolment({profile,league,busy,onSave}) {
  const member=league.data.members.find(m=>m.userId===profile.user_id);
  const [paid,setPaid]=useState(!!member?.paid);
  const [memberId,setMemberId]=useState('');
  const existing=league.data.members.filter(m=>!m.userId);
  return <div className="accountAnnualEnrolment">
    <h4>{SEASON} annual league</h4>
    <p><strong>{member?.paid?'Enrolled · $100 payment confirmed':member?'Payment not confirmed · Not eligible':'Not enrolled'}</strong></p>
    {!member && existing.length>0 && <label>Existing league membership
      <select value={memberId} disabled={busy} onChange={e=>setMemberId(e.target.value)}>
        <option value="">Create a new membership</option>
        {existing.map(m=><option key={m.id} value={m.id}>{m.name}{m.paid?' · $100 already paid':''}</option>)}
      </select>
    </label>}
    {!member && existing.length>0 && <p>If this player is already registered, select their membership to keep their existing points and avoid a duplicate.</p>}
    <label className="annualPaymentCheckbox"><input type="checkbox" checked={paid} disabled={busy} onChange={e=>setPaid(e.target.checked)} />
      $100 annual payment received — enrol in the {SEASON} league
    </label>
    <p>Records payment received separately; this does not charge the player. Weekly coupon fees are separate.</p>
    {member?.paid && !paid && <p>Saving will mark the annual payment unpaid. Previously finalised weeks are retained.</p>}
    <button type="button" disabled={busy || (member ? paid===member.paid : !paid)} onClick={()=>onSave({userId:profile.user_id,memberId:member?.id||memberId,paid})}>
      {member?'Save annual payment':'Confirm payment & enrol'}
    </button>
  </div>;
}
