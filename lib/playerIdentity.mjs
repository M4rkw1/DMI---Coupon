export function profileFields(body = {}) {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const department = typeof body.department === 'string' ? body.department.trim() : '';
  if (!name || name.length > 100 || department.length > 100) {
    throw Object.assign(new Error('Enter a name and department of up to 100 characters.'), { status: 400 });
  }
  return { name, department };
}
export async function verifiedPlayer(db, authorization) {
  if (!authorization) return null;
  const match = /^Bearer (\S+)$/i.exec(authorization);
  if (!match) throw Object.assign(new Error('Please sign in again.'), { status: 401 });
  const { data, error } = await db.auth.getUser(match[1]);
  if (error || !data?.user?.id || !data.user.email_confirmed_at) {
    throw Object.assign(new Error('Please verify your email and sign in again.'), { status: 401 });
  }
  return data.user;
}
export async function entryIdentity(db, authorization, body) {
  const user = await verifiedPlayer(db, authorization);
  if (!user) return profileFields(body);
  const { data, error } = await db.from('player_profiles').select('name,department').eq('user_id', user.id).maybeSingle();
  if (error) throw error;
  if (!data) throw Object.assign(new Error('Save your player details in My account before entering.'), { status: 409 });
  return profileFields(data);
}
