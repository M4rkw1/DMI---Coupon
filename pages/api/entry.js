import { supabaseAdmin } from '../../lib/supabase';

function parseKickoff(kickoff) {
  if (!kickoff) return null;

  const [datePart, timePart] = String(kickoff).trim().split(' ');
  if (!datePart || !timePart) return null;

  const [day, month, year] = datePart.split('/').map(Number);
  const [hour, minute] = timePart.split(':').map(Number);

  if (!day || !month || !year) return null;

  return new Date(year, month - 1, day, hour || 0, minute || 0);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { week_id, name, department, predictions } = req.body;

    if (!week_id || !name || !predictions) {
      return res.status(400).json({ error: 'Missing entry details' });
    }

    const db = supabaseAdmin();

    const { data: fixtures, error: fixtureError } = await db
      .from('fixtures')
      .select('kickoff')
      .eq('week_id', week_id);

    if (fixtureError) throw fixtureError;

    const firstKickoff = (fixtures || [])
      .map(f => parseKickoff(f.kickoff))
      .filter(Boolean)
      .sort((a, b) => a - b)[0];

    const entryDeadline = firstKickoff
      ? new Date(firstKickoff.getTime() - 60 * 1000)
      : null;

    if (entryDeadline && new Date() >= entryDeadline) {
      return res.status(403).json({
        error: 'Entries are now closed for this coupon',
      });
    }

    const { data, error } = await db
      .from('entries')
      .insert({
        week_id,
        name: name.trim(),
        department: (department || '').trim(),
        predictions,
        paid: false,
        payment_method: '',
      })
      .select()
      .single();

    if (error) throw error;

    res.status(200).json({ entry: data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
