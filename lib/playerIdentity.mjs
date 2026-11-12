export function profileFields(body = {}) {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const department = typeof body.department === 'string' ? body.department.trim() : '';
  if (!name || name.length > 100 || department.length > 100) {
    throw Object.assign(new Error('Enter a name and department of up to 100 characters.'), { status: 400 });
  }
  return { name, department };
}
// Only private account profiles contain phone numbers; entry identities never do.
export function accountFields(body = {}) {
  const identity = profileFields(body);
  const raw = typeof body.phone === 'string' ? body.phone.trim() : '';
  const phone = raw.replace(/[\s().-]/g, '');
  if (raw.length > 40 || !/^\+[1-9]\d{7,14}$/.test(phone)) {
    throw Object.assign(new Error('Enter your WhatsApp phone number with its country code, for example +44 7700 900123.'), { status: 400 });
  }
  return { ...identity, phone };
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
