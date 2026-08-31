import { supabaseAdmin } from '../../lib/supabase';

const UK_TIME_ZONE = 'Europe/London';
function getTimeZoneOffsetMs(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const asUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second)
  );

  return asUtc - date.getTime();
}

function zonedTimeToUtc({ year, month, day, hour = 0, minute = 0 }, timeZone = UK_TIME_ZONE) {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const firstPass = new Date(utcGuess.getTime() - getTimeZoneOffsetMs(utcGuess, timeZone));

  return new Date(utcGuess.getTime() - getTimeZoneOffsetMs(firstPass, timeZone));
}

function parseKickoff(kickoff) {
  if (!kickoff) return null;

  const value = String(kickoff).trim();
  const [datePart, timePart] = value.split(' ');

  if (datePart?.includes('/') && timePart) {
    const [day, month, year] = datePart.split('/').map(Number);
    const [hour, minute] = timePart.split(':').map(Number);

    if (day && month && year) {
      return zonedTimeToUtc({ year, month, day, hour: hour || 0, minute: minute || 0 });
    }
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { week_id, name, department, predictions } = req.body;

    if (!week_id || !name || !predictions) {
      return res.status(400).json({ error: 'Missing entry details' });
    }

    const db = supabaseAdmin();

    const weekResult = await db
      .from('coupon_weeks')
      .select('id, is_published')
      .eq('id', week_id)
      .maybeSingle();

    if (weekResult.error && !/is_published/i.test(weekResult.error.message || '')) {
      throw weekResult.error;
    }

    if (!weekResult.error) {
      if (!weekResult.data?.id) {
        return res.status(404).json({ error: 'Coupon week not found' });
      }

      if (weekResult.data.is_published === false) {
        return res.status(403).json({ error: 'Entries are not open for this coupon yet' });
      }
    }

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
