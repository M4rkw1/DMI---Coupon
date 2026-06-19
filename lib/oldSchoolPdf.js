import { PDFDocument, StandardFonts, TextAlignment, rgb } from 'pdf-lib';

const A4_LANDSCAPE = [841.89, 595.28];
const BLUE = rgb(0.09, 0.29, 0.55);
const INK = rgb(0.04, 0.12, 0.23);
const WHITE = rgb(1, 1, 1);
const PALE_BLUE = rgb(0.96, 0.98, 1);

function cleanText(value) {
  return String(value || '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[^\x20-\x7E\xA3]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function fitText(font, text, maxWidth, preferredSize, minimumSize = 5) {
  let size = preferredSize;
  while (size > minimumSize && font.widthOfTextAtSize(text, size) > maxWidth) size -= 0.25;
  return size;
}

function drawRightAligned(page, font, text, right, y, size, color = INK) {
  const width = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: right - width, y, size, font, color });
}

function addTextField(form, page, name, options) {
  const field = form.createTextField(name);
  if (options.maxLength) field.setMaxLength(options.maxLength);
  if (options.alignment) field.setAlignment(options.alignment);
  if (options.value !== undefined && options.value !== null && String(options.value) !== '') {
    field.setText(String(options.value));
  }
  field.addToPage(page, {
    x: options.x,
    y: options.y,
    width: options.width,
    height: options.height,
    borderColor: options.borderColor || BLUE,
    backgroundColor: options.backgroundColor || WHITE,
    borderWidth: options.borderWidth || 1.2,
    textColor: INK,
  });
  field.setFontSize(options.fontSize || 9);
  return field;
}

async function embedOptionalImage(pdf, bytes, type) {
  if (!bytes) return null;
  try {
    return type === 'jpg' ? await pdf.embedJpg(bytes) : await pdf.embedPng(bytes);
  } catch {
    return null;
  }
}

async function fetchBadge(pdf, url, cache) {
  if (!url) return null;
  if (cache.has(url)) return cache.get(url);

  let image = null;
  try {
    const response = await fetch(url, {
      signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout
        ? AbortSignal.timeout(4000)
        : undefined,
    });
    if (response.ok) {
      const type = response.headers.get('content-type') || '';
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (/png/i.test(type) || /\.png(?:\?|$)/i.test(url)) image = await pdf.embedPng(bytes);
      if (/jpe?g/i.test(type) || /\.jpe?g(?:\?|$)/i.test(url)) image = await pdf.embedJpg(bytes);
    }
  } catch {
    image = null;
  }

  cache.set(url, image);
  return image;
}

function drawImageContained(page, image, x, y, width, height, opacity = 1) {
  if (!image) return;
  const scale = Math.min(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  page.drawImage(image, {
    x: x + (width - drawWidth) / 2,
    y: y + (height - drawHeight) / 2,
    width: drawWidth,
    height: drawHeight,
    opacity,
  });
}

function drawRules(page, rules, fonts, x, top, width, maxHeight) {
  const { regular, bold } = fonts;
  page.drawText('Rules', { x, y: top, size: 7, font: bold, color: INK });
  const textTop = top - 10;
  const lineHeight = 5.8;
  let y = textTop;

  rules.forEach((rule, index) => {
    if (y < textTop - maxHeight) return;
    const prefix = `${index + 1}.`;
    page.drawText(prefix, { x, y, size: 4.8, font: bold, color: INK });
    const words = cleanText(rule).split(' ');
    const lines = [];
    let line = '';
    words.forEach(word => {
      const candidate = line ? `${line} ${word}` : word;
      if (regular.widthOfTextAtSize(candidate, 4.8) <= width - 13) line = candidate;
      else {
        if (line) lines.push(line);
        line = word;
      }
    });
    if (line) lines.push(line);

    lines.forEach((text, lineIndex) => {
      if (y < textTop - maxHeight) return;
      page.drawText(text, { x: x + 13, y, size: 4.8, font: regular, color: INK });
      y -= lineHeight;
    });
    y -= 1.2;
  });
}

async function drawCouponCopy({
  pdf,
  page,
  form,
  fonts,
  badgeCache,
  fixtures,
  week,
  settings,
  values,
  copyKey,
  copyLabel,
  x,
  y,
  width,
  height,
  whatsappQr,
  paymentQr,
}) {
  const { regular, bold, oblique } = fonts;
  const fixturePanelY = y + 154;
  const fixturePanelHeight = height - 154;
  page.drawRectangle({ x, y: fixturePanelY, width, height: fixturePanelHeight, borderColor: BLUE, borderWidth: 1.3 });

  const titleY = y + height - 19;
  const dmiWidth = bold.widthOfTextAtSize('DMI', 12);
  const couponWidth = oblique.widthOfTextAtSize('Football Coupon', 11);
  const titleX = x + (width - dmiWidth - couponWidth - 5) / 2;
  page.drawText('DMI', { x: titleX, y: titleY, size: 12, font: bold, color: BLUE });
  page.drawText('Football Coupon', { x: titleX + dmiWidth + 5, y: titleY, size: 11, font: oblique, color: INK });
  page.drawLine({ start: { x: x + 3, y: titleY - 4 }, end: { x: x + width - 3, y: titleY - 4 }, thickness: 1.5, color: BLUE });
  page.drawLine({ start: { x: x + 3, y: titleY - 6.5 }, end: { x: x + width - 3, y: titleY - 6.5 }, thickness: 0.55, color: BLUE });

  const fixtureTop = titleY - 16;
  const fixtureBottom = fixturePanelY + 13;
  const rowHeight = Math.min(14, Math.max(8.2, (fixtureTop - fixtureBottom) / Math.max(fixtures.length, 1)));
  const scoreWidth = rowHeight > 11 ? 30 : 26;
  const scoreHeight = Math.max(7.5, rowHeight - 2.5);
  const center = x + width / 2;
  const homeScoreX = center - scoreWidth - 7;
  const awayScoreX = center + 7;
  const badgeSize = Math.min(10, rowHeight - 2);
  const teamFontSize = Math.min(7.4, rowHeight * 0.55);

  for (let index = 0; index < fixtures.length; index += 1) {
    const fixture = fixtures[index];
    const rowY = fixtureTop - (index + 1) * rowHeight + (rowHeight - teamFontSize) / 2 + 1;
    const fieldY = fixtureTop - (index + 1) * rowHeight + (rowHeight - scoreHeight) / 2;
    const homeName = cleanText(fixture.home_team);
    const awayName = cleanText(fixture.away_team);
    const homeBadge = await fetchBadge(pdf, fixture.home_badge, badgeCache);
    const awayBadge = await fetchBadge(pdf, fixture.away_badge, badgeCache);
    const homeBadgeX = homeScoreX - badgeSize - 4;
    const awayBadgeX = awayScoreX + scoreWidth + 4;
    const homeNameWidth = homeBadgeX - (x + 6) - 3;
    const awayNameX = awayBadgeX + badgeSize + 3;
    const awayNameWidth = x + width - 6 - awayNameX;
    const homeSize = fitText(bold, homeName, homeNameWidth, teamFontSize);
    const awaySize = fitText(bold, awayName, awayNameWidth, teamFontSize);

    drawRightAligned(page, bold, homeName, homeBadgeX - 3, rowY, homeSize);
    page.drawText(awayName, { x: awayNameX, y: rowY, size: awaySize, font: bold, color: INK });
    drawImageContained(page, homeBadge, homeBadgeX, fieldY, badgeSize, badgeSize);
    drawImageContained(page, awayBadge, awayBadgeX, fieldY, badgeSize, badgeSize);
    page.drawText('v', { x: center - 1.8, y: rowY, size: teamFontSize, font: oblique, color: INK });

    const fixtureValues = values?.scores?.[fixture.id] || {};
    addTextField(form, page, `${copyKey}.score.${fixture.id}.home`, {
      x: homeScoreX,
      y: fieldY,
      width: scoreWidth,
      height: scoreHeight,
      fontSize: Math.max(7, scoreHeight - 2),
      maxLength: 2,
      alignment: TextAlignment.Center,
      value: fixtureValues.home,
    });
    addTextField(form, page, `${copyKey}.score.${fixture.id}.away`, {
      x: awayScoreX,
      y: fieldY,
      width: scoreWidth,
      height: scoreHeight,
      fontSize: Math.max(7, scoreHeight - 2),
      maxLength: 2,
      alignment: TextAlignment.Center,
      value: fixtureValues.away,
    });
  }

  page.drawText(copyLabel.toUpperCase(), {
    x: x + width / 2 - bold.widthOfTextAtSize(copyLabel.toUpperCase(), 5) / 2,
    y: fixturePanelY + 4,
    size: 5,
    font: bold,
    color: rgb(0.28, 0.38, 0.57),
  });

  const metaTop = y + 141;
  const labelWidth = 83;
  const valueX = x + labelWidth + 8;
  page.drawText('Match Date(s)', { x: x + 4, y: metaTop, size: 6.5, font: regular, color: INK });
  page.drawText(cleanText(week.subtitle || ''), { x: valueX, y: metaTop, size: 6.5, font: oblique, color: BLUE });
  page.drawText('Entries Submitted By', { x: x + 4, y: metaTop - 14, size: 6.5, font: regular, color: INK });
  page.drawText(cleanText(values.deadline || 'TBC'), { x: valueX, y: metaTop - 14, size: 6.2, font: oblique, color: rgb(0.78, 0.08, 0.08) });

  page.drawText('Name', { x: x + 4, y: metaTop - 31, size: 6.5, font: regular, color: INK });
  addTextField(form, page, `${copyKey}.name`, {
    x: valueX,
    y: metaTop - 36,
    width: width - labelWidth - 12,
    height: 13,
    fontSize: 8,
    value: values.name,
    borderColor: INK,
    borderWidth: 0.8,
  });
  page.drawText('Company / Department', { x: x + 4, y: metaTop - 50, size: 6.5, font: regular, color: INK });
  addTextField(form, page, `${copyKey}.department`, {
    x: valueX,
    y: metaTop - 55,
    width: width - labelWidth - 12,
    height: 13,
    fontSize: 8,
    value: values.department,
    borderColor: INK,
    borderWidth: 0.8,
  });

  if (copyKey === 'office') {
    drawRules(page, values.rules || [], fonts, x + 4, metaTop - 68, width - 8, 62);
  } else {
    page.drawRectangle({ x: x + 4, y: y + 58, width: width - 8, height: 24, borderColor: BLUE, borderWidth: 0.8, color: PALE_BLUE });
    page.drawText(`Scoring: 1 result point     Exact score: 3 points`, { x: x + 10, y: y + 71, size: 5.5, font: bold, color: INK });
    page.drawText(`Maximum: ${fixtures.length * 3}     Entry fee: ${cleanText(values.entryFee)}`, { x: x + 10, y: y + 62, size: 5.5, font: bold, color: INK });
    drawImageContained(page, whatsappQr, x + 42, y + 3, 52, 52);
    drawImageContained(page, paymentQr, x + width - 94, y + 3, 52, 52);
  }
}

export async function createOldSchoolPdf({
  week = {},
  fixtures = [],
  settings = {},
  values = {},
  assets = {},
}) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage();
  page.setSize(A4_LANDSCAPE[0], A4_LANDSCAPE[1]);
  const form = pdf.getForm();
  const fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    oblique: await pdf.embedFont(StandardFonts.HelveticaOblique),
  };
  const background = await embedOptionalImage(pdf, assets.background, 'jpg');
  const whatsappQr = await embedOptionalImage(pdf, assets.whatsappQr, 'png');
  const paymentQr = await embedOptionalImage(pdf, assets.paymentQr, 'png');
  const [pageWidth, pageHeight] = A4_LANDSCAPE;

  if (background) {
    page.drawImage(background, { x: 0, y: 0, width: pageWidth, height: pageHeight, opacity: 0.08 });
  }
  page.drawRectangle({ x: 8, y: 8, width: pageWidth - 16, height: pageHeight - 16, color: WHITE, opacity: 0.82 });

  const margin = 12;
  const gap = 16;
  const copyWidth = (pageWidth - margin * 2 - gap) / 2;
  const copyHeight = pageHeight - margin * 2;
  const rules = Array.isArray(values.rules) ? values.rules : [];
  const badgeCache = new Map();
  const badgeUrls = [...new Set(
    fixtures.flatMap(fixture => [fixture.home_badge, fixture.away_badge]).filter(Boolean)
  )];
  await Promise.all(badgeUrls.map(url => fetchBadge(pdf, url, badgeCache)));
  const shared = {
    pdf,
    page,
    form,
    fonts,
    badgeCache,
    fixtures,
    week,
    settings,
    values: { ...values, rules },
    y: margin,
    width: copyWidth,
    height: copyHeight,
    whatsappQr,
    paymentQr,
  };

  await drawCouponCopy({ ...shared, copyKey: 'office', copyLabel: 'Office Copy', x: margin });
  await drawCouponCopy({ ...shared, copyKey: 'entrant', copyLabel: 'Entrant Copy', x: margin + copyWidth + gap });
  form.updateFieldAppearances(fonts.regular);

  pdf.setTitle(cleanText(week.title || 'DMI Football Coupon'));
  pdf.setSubject('Fillable DMI Football Coupon entry form');
  pdf.setCreator('DMI Football Coupon');
  return pdf.save();
}
