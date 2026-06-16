import { supabaseAdmin, isAdmin } from '../../lib/supabase';

const resultOf = (h, a) => (h > a ? 'H' : h < a ? 'A' : 'D');
const normaliseNullableScore = value =>
  value === null || value === undefined || value === '' ? null : Number(value);

function points(pred, fix) {
  if (
    fix.home_score === null ||
    fix.away_score === null ||
    fix.home_score === undefined ||
    fix.away_score === undefined
  ) {
    return 0;
  }

  const ph = Number(pred?.home);
  const pa = Number(pred?.away);

  if (Number.isNaN(ph) || Number.isNaN(pa)) return 0;

  if (ph === Number(fix.home_score) && pa === Number(fix.away_score)) return 3;

  return resultOf(ph, pa) === resultOf(Number(fix.home_score), Number(fix.away_score)) ? 1 : 0;
}

function rankedEntries(entries, fixtures) {
  return [...entries]
    .map(entry => ({
      ...entry,
      pts: fixtures.reduce((sum, fixture) => sum + points(entry.predictions?.[fixture.id], fixture), 0),
      exact: fixtures.filter(fixture => points(entry.predictions?.[fixture.id], fixture) === 3).length,
    }))
    .sort(
      (a, b) =>
        b.pts - a.pts ||
        b.exact - a.exact ||
        String(a.name || '').localeCompare(String(b.name || ''))
    );
}

function stripRuntimeFields(row) {
  const { created_at, ...rest } = row;
  return rest;
}

function archiveHasCouponData(archive) {
  const snapshot = archive?.snapshot || {};
  return Boolean(snapshot.week?.id && (snapshot.fixtures?.length || snapshot.entries?.length));
}

async function insertFixtures(db, rows) {
  const result = await db.from('fixtures').insert(rows);

  if (result.error && /(api_fixture_id|home_badge|away_badge)/i.test(result.error.message || '')) {
    const fallbackRows = rows.map(({ api_fixture_id, home_badge, away_badge, ...row }) => row);
    return db.from('fixtures').insert(fallbackRows);
  }

  return result;
}

async function resolveCurrentWeekId(db) {
  const current = await db
    .from('coupon_weeks')
    .select('id')
    .eq('is_current', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (current.error) throw current.error;
  if (current.data?.id) return current.data.id;

  const latest = await db
    .from('coupon_weeks')
    .select('id')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latest.error) throw latest.error;
  if (latest.data?.id) return latest.data.id;

  const created = await db
    .from('coupon_weeks')
    .insert({
      title: 'DMI Coupon',
      subtitle: '',
      is_current: true,
    })
    .select('id')
    .single();

  if (created.error) throw created.error;
  return created.data.id;
}

async function loadSnapshotData(db, weekId) {
  const [week, fixtures, entries, settings] = await Promise.all([
    db.from('coupon_weeks').select('*').eq('id', weekId).single(),
    db.from('fixtures').select('*').eq('week_id', weekId).order('sort_order'),
    db.from('entries').select('*').eq('week_id', weekId).order('created_at'),
    db.from('coupon_settings').select('*').eq('week_id', weekId).limit(1).maybeSingle(),
  ]);

  if (week.error) throw week.error;
  if (fixtures.error) throw fixtures.error;
  if (entries.error) throw entries.error;
  if (settings.error) throw settings.error;

  return {
    week: week.data,
    fixtures: fixtures.data || [],
    entries: entries.data || [],
    settings: settings.data || { week_id: weekId },
  };
}

async function createArchive(db, weekId, saveHistoric) {
  const snapshot = await loadSnapshotData(db, weekId);

  if (!snapshot.fixtures.length && !snapshot.entries.length) {
    throw new Error('Cannot start a new coupon because there are no fixtures or entries to archive.');
  }

  const ranked = rankedEntries(snapshot.entries, snapshot.fixtures);
  const winner = ranked[0] || {};

  const { data, error } = await db
    .from('coupon_archives')
    .insert({
      week_id: weekId,
      week_title: snapshot.week.title || '',
      week_subtitle: snapshot.week.subtitle || '',
      saved_as_historic: !!saveHistoric,
      winner_name: winner.name || '',
      winner_department: winner.department || '',
      winner_points: Number(winner.pts || 0),
      leaderboard: ranked.map(entry => ({
        id: entry.id,
        name: entry.name,
        department: entry.department,
        paid: entry.paid,
        pts: entry.pts,
        exact: entry.exact,
      })),
      snapshot,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export default async function handler(req, res) {
  if (!isAdmin(req)) return res.status(401).json({ error: 'Not authorised' });

  try {
    const db = supabaseAdmin();
    const { action, payload } = req.body;
    if (action === 'saveSettings') {
      const { id, week_id, ...fields } = payload;
      const targetWeekId = week_id || (await resolveCurrentWeekId(db));
      let targetId = id;

      if (!targetId && targetWeekId) {
        const existing = await db
          .from('coupon_settings')
          .select('id')
          .eq('week_id', targetWeekId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (existing.error) throw existing.error;
        targetId = existing.data?.id || null;
      }

      if (targetId) {
        const { error } = await db.from('coupon_settings').update(fields).eq('id', targetId);
        if (error && /timezone_(label|offset_minutes)/i.test(error.message || '')) {
          const { timezone_label, timezone_offset_minutes, ...fallbackFields } = fields;
          const fallback = await db.from('coupon_settings').update(fallbackFields).eq('id', targetId);
          if (fallback.error) throw fallback.error;
        } else if (error) {
          throw error;
        }
      } else {
        const insertPayload = {
          ...fields,
          week_id: targetWeekId,
        };
        const { error } = await db.from('coupon_settings').insert(insertPayload);
        if (error && /timezone_(label|offset_minutes)/i.test(error.message || '')) {
          const { timezone_label, timezone_offset_minutes, ...fallbackFields } = insertPayload;
          const fallback = await db.from('coupon_settings').insert(fallbackFields);
          if (fallback.error) throw fallback.error;
        } else if (error) {
          throw error;
        }
      }
    }
    if (action === 'saveWeek') {
      const { id, ...fields } = payload;
      let targetId = id;

      if (!targetId) {
        targetId = await resolveCurrentWeekId(db);
      }

      if (!targetId) {
        return res.status(400).json({ error: 'Missing current week id' });
      }

      const weekFields = { ...fields };

      if ('title' in weekFields) {
        weekFields.title = String(weekFields.title || '').trim();
      }

      if (!weekFields.title) {
        return res.status(400).json({ error: 'Week title is blank. Reload the admin page before saving week settings.' });
      }

      if ('subtitle' in weekFields) {
        weekFields.subtitle = String(weekFields.subtitle || '').trim();
      }

      const { error } = await db.from('coupon_weeks').update(weekFields).eq('id', targetId);
      if (error) throw error;
    }
    if (action === 'replaceFixtures') {
      const { week_id, fixtures } = payload;
      const targetWeekId = week_id || (await resolveCurrentWeekId(db));
      if (!targetWeekId) return res.status(400).json({ error: 'Missing week id' });
      if (!Array.isArray(fixtures) || fixtures.length === 0) {
        return res.status(400).json({ error: 'No fixtures supplied' });
      }

      const rows = fixtures.map((f, i) => ({
        week_id: targetWeekId,
        sort_order: i + 1,
        home_team: String(f.home_team || '').trim(),
        away_team: String(f.away_team || '').trim(),
        kickoff: String(f.kickoff || '').trim(),
        api_fixture_id: String(f.api_fixture_id || '').trim() || null,
        home_badge: String(f.home_badge || '').trim() || null,
        away_badge: String(f.away_badge || '').trim() || null,
        status: f.status || 'NS',
      }));
      const badRow = rows.findIndex(f => !f.home_team || !f.away_team || !f.kickoff);
      if (badRow >= 0) {
        return res.status(400).json({ error: `Fixture row ${badRow + 1} is missing a team or kick-off` });
      }

      const existingFixtures = await db
        .from('fixtures')
        .select('id, sort_order')
        .eq('week_id', targetWeekId)
        .order('sort_order');
      if (existingFixtures.error) throw existingFixtures.error;

      const existingRows = existingFixtures.data || [];
      const rowsToUpdate = rows.slice(0, existingRows.length);
      const rowsToInsert = rows.slice(existingRows.length);
      const rowsToDelete = existingRows.slice(rows.length);

      for (let index = 0; index < rowsToUpdate.length; index += 1) {
        const currentFixture = existingRows[index];
        const nextFixture = rowsToUpdate[index];

        const result = await db.from('fixtures').update(nextFixture).eq('id', currentFixture.id);
        if (result.error && /(api_fixture_id|home_badge|away_badge)/i.test(result.error.message || '')) {
          const { api_fixture_id, home_badge, away_badge, ...fallbackFixture } = nextFixture;
          const fallback = await db.from('fixtures').update(fallbackFixture).eq('id', currentFixture.id);
          if (fallback.error) throw fallback.error;
        } else if (result.error) {
          throw result.error;
        }
      }

      if (rowsToInsert.length) {
        const { error } = await insertFixtures(db, rowsToInsert);
        if (error) throw error;
      }

      for (const staleFixture of rowsToDelete) {
        const result = await db.from('fixtures').delete().eq('id', staleFixture.id);
        if (result.error) throw result.error;
      }
    }
    if (action === 'setResults') {
      for (const f of payload.fixtures) {
        const update = {
          home_score: f.home_score,
          away_score: f.away_score,
          status: f.status || 'FT',
        };
        const liveUpdate = {
          ...update,
          ht_home_score: f.ht_home_score,
          ht_away_score: f.ht_away_score,
        };

        const result = await db.from('fixtures').update(liveUpdate).eq('id', f.id);
        if (result.error && /ht_(home|away)_score/i.test(result.error.message || '')) {
          const fallback = await db.from('fixtures').update(update).eq('id', f.id);
          if (fallback.error) throw fallback.error;
        } else if (result.error) {
          throw result.error;
        }
      }
    }
    if (action === 'updateFixtureApiData') {
      const rows = Array.isArray(payload?.fixtures) ? payload.fixtures : [];

      if (!rows.length) {
        return res.status(400).json({ error: 'No matched fixtures supplied' });
      }

      for (const f of rows) {
        if (!f.id) continue;

        const update = {
          api_fixture_id: String(f.api_fixture_id || '').trim() || null,
          home_badge: String(f.home_badge || '').trim() || null,
          away_badge: String(f.away_badge || '').trim() || null,
          kickoff: String(f.kickoff || '').trim(),
          status: f.status || 'NS',
          home_score: normaliseNullableScore(f.home_score),
          away_score: normaliseNullableScore(f.away_score),
          ht_home_score: normaliseNullableScore(f.ht_home_score),
          ht_away_score: normaliseNullableScore(f.ht_away_score),
        };
        const fallbackUpdate = {
          api_fixture_id: update.api_fixture_id,
          kickoff: update.kickoff,
          status: update.status,
          home_score: update.home_score,
          away_score: update.away_score,
        };

        const result = await db.from('fixtures').update(update).eq('id', f.id);
        if (result.error && /(api_fixture_id|home_badge|away_badge|ht_(home|away)_score)/i.test(result.error.message || '')) {
          const fallback = await db.from('fixtures').update(fallbackUpdate).eq('id', f.id);
          if (fallback.error) throw fallback.error;
        } else if (result.error) {
          throw result.error;
        }
      }

      return res.status(200).json({ ok: true, updated: rows.length });
    }
    if (action === 'updateEntry') {
      const { id, ...fields } = payload;
      const { error } = await db.from('entries').update(fields).eq('id', id);
      if (error) throw error;
    }
    if (action === 'deleteEntry') {
      const { error } = await db.from('entries').delete().eq('id', payload.id);
      if (error) throw error;
    }
    if (action === 'importEntry') {
      const entry = {
        ...payload,
        week_id: payload?.week_id || (await resolveCurrentWeekId(db)),
      };
      const { error } = await db.from('entries').insert(entry);
      if (error) throw error;
    }
    if (action === 'importEntries') {
      const rows = Array.isArray(payload?.entries) ? payload.entries : [];

      if (!rows.length) {
        return res.status(400).json({ error: 'No entries supplied' });
      }

      const targetWeekId = rows.find(row => row.week_id)?.week_id || (await resolveCurrentWeekId(db));
      const { error } = await db.from('entries').insert(rows.map(row => ({ ...row, week_id: targetWeekId })));
      if (error) throw error;

      return res.status(200).json({ ok: true, imported: rows.length });
    }
    if (action === 'newCoupon') {
      const { week_id, title, subtitle, saveHistoric } = payload;
      const targetWeekId = week_id || (await resolveCurrentWeekId(db));
      if (!targetWeekId) return res.status(400).json({ error: 'Missing week id' });

      const archive = await createArchive(db, targetWeekId, saveHistoric);

      const deleteEntries = await db.from('entries').delete().eq('week_id', targetWeekId);
      if (deleteEntries.error) throw deleteEntries.error;

      const deleteFixtures = await db.from('fixtures').delete().eq('week_id', targetWeekId);
      if (deleteFixtures.error) throw deleteFixtures.error;

      const { error: weekError } = await db
        .from('coupon_weeks')
        .update({
          title: title || 'DMI Coupon – New Coupon',
          subtitle: subtitle || '',
        })
        .eq('id', targetWeekId);
      if (weekError) throw weekError;

      const { error: settingsError } = await db
        .from('coupon_settings')
        .update({ entries_released: false })
        .eq('week_id', targetWeekId);
      if (settingsError) throw settingsError;

      return res.status(200).json({ ok: true, archive_id: archive.id });
    }
    if (action === 'restoreArchive') {
      const archiveId = payload?.archive_id;
      let archive;
      let archiveError;

      if (archiveId) {
        const result = await db.from('coupon_archives').select('*').eq('id', archiveId).single();
        archive = result.data;
        archiveError = result.error;
      } else {
        const result = await db
          .from('coupon_archives')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(100);

        archiveError = result.error;
        archive = (result.data || []).find(archiveHasCouponData);
      }

      if (archiveError) throw archiveError;
      if (!archive?.snapshot?.week?.id) return res.status(400).json({ error: 'Archive snapshot is incomplete' });
      if (!archiveHasCouponData(archive)) {
        return res.status(400).json({ error: 'No restorable coupon archive was found.' });
      }

      const snapshot = archive.snapshot;
      const weekId = snapshot.week.id;

      const deleteEntries = await db.from('entries').delete().eq('week_id', weekId);
      if (deleteEntries.error) throw deleteEntries.error;

      const deleteFixtures = await db.from('fixtures').delete().eq('week_id', weekId);
      if (deleteFixtures.error) throw deleteFixtures.error;

      const { id: weekRowId, created_at: weekCreatedAt, ...weekFields } = snapshot.week;
      const { error: weekError } = await db.from('coupon_weeks').update(weekFields).eq('id', weekRowId);
      if (weekError) throw weekError;

      if (snapshot.settings?.id) {
        const { id: settingsId, created_at: settingsCreatedAt, ...settingsFields } = snapshot.settings;
        const { error: settingsError } = await db
          .from('coupon_settings')
          .update(settingsFields)
          .eq('id', settingsId);
        if (settingsError) throw settingsError;
      }

      if (snapshot.fixtures?.length) {
        const { error: fixtureError } = await insertFixtures(
          db,
          snapshot.fixtures.map(stripRuntimeFields)
        );
        if (fixtureError) throw fixtureError;
      }

      if (snapshot.entries?.length) {
        const { error: entryError } = await db
          .from('entries')
          .insert(snapshot.entries.map(stripRuntimeFields));
        if (entryError) throw entryError;
      }

      return res.status(200).json({ ok: true, restored_archive_id: archive.id });
    }
    res.status(200).json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
}
