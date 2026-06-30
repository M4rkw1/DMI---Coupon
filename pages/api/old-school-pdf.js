import fs from 'node:fs/promises';
import path from 'node:path';
import { createOldSchoolPdf } from '../../lib/oldSchoolPdf';
import { supabaseAdmin } from '../../lib/supabase';

function parseRules(value) {
  return String(value || '')
    .replace(/\r/g, '')
    .trim()
    .replace(/\n(?=\d+[.)]\s*)/g, '\n\n')
    .split(/\n\s*\n/)
    .map(rule => rule.replace(/^\s*\d+[.)]\s*/, '').trim())
    .filter(Boolean);
}

async function readPublicAsset(fileName) {
  try {
    return await fs.readFile(path.join(process.cwd(), 'public', fileName));
  } catch {
    return null;
  }
}

function safeFileName(value) {
  return String(value || 'DMI Football Coupon')
    .replace(/[\u2013\u2014]/g, '-')
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseJsonField(value, fallback) {
  if (value && typeof value === 'object') return value;
  if (typeof value !== 'string' || !value.trim()) return fallback;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const weekId = String(req.body?.week_id || '').trim();
    if (!weekId) return res.status(400).json({ error: 'Missing coupon week id' });

    const db = supabaseAdmin();
    const [weekResult, fixturesResult, settingsResult, background] = await Promise.all([
      db.from('coupon_weeks').select('*').eq('id', weekId).single(),
      db.from('fixtures').select('*').eq('week_id', weekId).order('sort_order'),
      db.from('coupon_settings').select('*').eq('week_id', weekId).limit(1).maybeSingle(),
      readPublicAsset('dmi-background.jpeg'),
    ]);

    if (weekResult.error) throw weekResult.error;
    if (fixturesResult.error) throw fixturesResult.error;
    if (settingsResult.error) throw settingsResult.error;

    const week = weekResult.data || {};
    const fixtures = fixturesResult.data || [];
    const settings = settingsResult.data || {};
    if (!fixtures.length) return res.status(400).json({ error: 'This coupon has no fixtures' });

    const pdfBytes = await createOldSchoolPdf({
      week,
      fixtures,
      settings,
      values: {
        scores: parseJsonField(req.body?.scores, {}),
        name: String(req.body?.name || ''),
        department: String(req.body?.department || ''),
        deadline: String(req.body?.deadline || 'TBC'),
        entryFee: String(req.body?.entry_fee || ''),
        rules: parseRules(settings.rules),
      },
      assets: { background },
    });
    const fileName = `${safeFileName(week.title)} Fillable.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', pdfBytes.length);
    return res.status(200).send(Buffer.from(pdfBytes));
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Unable to create fillable PDF' });
  }
}
