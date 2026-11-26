export function currentCoupon(weeks) {
  return weeks.find(w=>w.is_current===true) || null;
}
export function entryCandidates(weeks) {
  return currentCoupon(weeks) ? weeks.filter(w=>w.is_published===true) : [];
}
export async function closeCurrentCoupon(db,{expectedId,loadSnapshot,archive}) {
  const current=await db.from('coupon_weeks').select('id').eq('is_current',true).order('created_at',{ascending:false}).limit(1).maybeSingle();
  if(current.error)throw current.error;
  const id=current.data?.id;
  if(!id)throw new Error('No live coupon is currently active.');
  if(!expectedId || expectedId!==id)throw new Error('The live coupon changed. Reload before closing it.');
  const snapshot=await loadSnapshot(db,id);
  if(!snapshot.fixtures.length||!snapshot.entries.length)throw new Error('Cannot close coupon without fixtures and entries.');
  const final=new Set(['FT','AET','PEN','PST','CANC','ABD','AWD','WO']);
  const voids=new Set(['PST','CANC','ABD','AWD','WO']);
  if(!snapshot.fixtures.every(f=>final.has(String(f.status).toUpperCase())&&(voids.has(String(f.status).toUpperCase())||(f.home_score!=null&&f.away_score!=null))))throw new Error('Finish or void every fixture before closing the coupon.');
  const saved=await archive(db,id,true);
  if(!saved?.id)throw new Error('The coupon could not be archived. Nothing was deleted.');
  const removed=await db.from('coupon_weeks').delete().eq('id',id).eq('is_current',true).select('id');
  if(removed.error)throw removed.error;
  if(!removed.data?.length)throw new Error('The live coupon changed. Reload before closing it.');
  return {ok:true,archive_id:saved.id,closed_week_id:id};
}
