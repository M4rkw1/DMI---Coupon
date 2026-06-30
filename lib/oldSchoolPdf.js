import { PDFDocument, StandardFonts, TextAlignment, rgb } from 'pdf-lib';

const A4_PORTRAIT = [595.28, 841.89];
const BLUE = rgb(0.09, 0.29, 0.55);
const INK = rgb(0.04, 0.12, 0.23);
const WHITE = rgb(1, 1, 1);

function cleanText(value) {
  return String(value || '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u20AC/g, 'EUR')
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
    borderWidth: options.borderWidth || 1.4,
    textColor: INK,
  });
  field.setFontSize(options.fontSize || 10);
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

function drawBackground(page, image, width, height) {
  if (!image) return;
  const scale = Math.max(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  page.drawImage(image, {
    x: (width - drawWidth) / 2,
    y: (height - drawHeight) / 2,
    width: drawWidth,
    height: drawHeight,
    opacity: 0.06,
  });
}

function wrapText(font, text, size, maxWidth) {
  const words = cleanText(text).split(' ');
  const lines = [];
  let line = '';

  words.forEach(word => {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  });

  if (line) lines.push(line);
  return lines;
}

function drawRules(page, rules, fonts, x, top, width, maxHeight) {
  const { regular, bold } = fonts;
  const lineHeight = 7.2;
  let y = top;

  page.drawText('Rules', { x, y, size: 9, font: bold, color: INK });
  y -= 13;

  rules.forEach((rule, index) => {
    if (y < top - maxHeight) return;

    page.drawText(`${index + 1}.`, { x: x + 6, y, size: 6.2, font: bold, color: INK });
    const lines = wrapText(regular, rule, 6.2, width - 32);
    lines.forEach((line, lineIndex) => {
      if (y < top - maxHeight) return;
      page.drawText(line, { x: x + 28, y, size: 6.2, font: regular, color: INK });
      if (lineIndex < lines.length - 1) y -= lineHeight;
    });
    y -= lineHeight + 1;
  });
}

function drawFixturePanel({ page, form, fonts, fixtures, values, x, y, width, height }) {
  const { bold, oblique } = fonts;
  page.drawRectangle({ x, y, width, height, borderColor: BLUE, borderWidth: 1.8 });

  const dmiWidth = bold.widthOfTextAtSize('DMI', 18);
  const couponWidth = oblique.widthOfTextAtSize('Football Coupon', 17);
  const titleX = x + (width - dmiWidth - couponWidth - 8) / 2;
  const titleY = y + height - 25;

  page.drawText('DMI', { x: titleX, y: titleY, size: 18, font: bold, color: BLUE });
  page.drawText('Football Coupon', { x: titleX + dmiWidth + 8, y: titleY, size: 17, font: oblique, color: INK });
  page.drawLine({ start: { x: x + 4, y: titleY - 8 }, end: { x: x + width - 4, y: titleY - 8 }, thickness: 1.5, color: BLUE });
  page.drawLine({ start: { x: x + 4, y: titleY - 11 }, end: { x: x + width - 4, y: titleY - 11 }, thickness: 0.7, color: BLUE });

  const fixtureTop = titleY - 27;
  const fixtureBottom = y + 24;
  const rowHeight = Math.min(22, Math.max(11.5, (fixtureTop - fixtureBottom) / Math.max(fixtures.length, 1)));
  const scoreWidth = Math.min(46, Math.max(34, rowHeight * 2.35));
  const scoreHeight = Math.min(17, Math.max(10, rowHeight - 3));
  const badgeSize = Math.min(13, Math.max(8, rowHeight - 4));
  const teamFontSize = Math.min(8.8, Math.max(5.6, rowHeight * 0.48));
  const center = x + width / 2;
  const homeScoreX = center - scoreWidth - 14;
  const awayScoreX = center + 14;
  const homeBadgeX = homeScoreX - badgeSize - 5;
  const awayBadgeX = awayScoreX + scoreWidth + 5;
  const homeNameRight = homeBadgeX - 4;
  const awayNameX = awayBadgeX + badgeSize + 4;

  fixtures.forEach((fixture, index) => {
    const rowTop = fixtureTop - index * rowHeight;
    const rowY = rowTop - rowHeight + (rowHeight - teamFontSize) / 2 + 1;
    const fieldY = rowTop - rowHeight + (rowHeight - scoreHeight) / 2;
    const homeName = cleanText(fixture.home_team);
    const awayName = cleanText(fixture.away_team);
    const homeSize = fitText(bold, homeName, homeNameRight - (x + 18), teamFontSize);
    const awaySize = fitText(bold, awayName, x + width - 18 - awayNameX, teamFontSize);
    const fieldId = fixture.id || fixture.api_fixture_id || index + 1;
    const fixtureValues = values?.scores?.[fixture.id] || {};

    drawRightAligned(page, bold, homeName, homeNameRight, rowY, homeSize);
    page.drawRectangle({ x: homeBadgeX, y: fieldY + (scoreHeight - badgeSize) / 2, width: badgeSize, height: badgeSize, borderColor: BLUE, borderWidth: 0.35, opacity: 0.28 });
    addTextField(form, page, `score.${fieldId}.home`, {
      x: homeScoreX,
      y: fieldY,
      width: scoreWidth,
      height: scoreHeight,
      fontSize: Math.max(8, scoreHeight - 2),
      maxLength: 2,
      alignment: TextAlignment.Center,
      value: fixtureValues.home,
    });
    page.drawText('v', { x: center - 2.4, y: rowY, size: teamFontSize, font: oblique, color: INK });
    addTextField(form, page, `score.${fieldId}.away`, {
      x: awayScoreX,
      y: fieldY,
      width: scoreWidth,
      height: scoreHeight,
      fontSize: Math.max(8, scoreHeight - 2),
      maxLength: 2,
      alignment: TextAlignment.Center,
      value: fixtureValues.away,
    });
    page.drawRectangle({ x: awayBadgeX, y: fieldY + (scoreHeight - badgeSize) / 2, width: badgeSize, height: badgeSize, borderColor: BLUE, borderWidth: 0.35, opacity: 0.28 });
    page.drawText(awayName, { x: awayNameX, y: rowY, size: awaySize, font: bold, color: INK });
  });

  page.drawText('OLD SCHOOL ENTRY', {
    x: x + width / 2 - bold.widthOfTextAtSize('OLD SCHOOL ENTRY', 6.2) / 2,
    y: y + 8,
    size: 6.2,
    font: bold,
    color: rgb(0.28, 0.38, 0.57),
  });
}

function drawEntryInfo({ page, form, fonts, week, fixtures, values, x, y, width, height }) {
  const { regular, bold, oblique } = fonts;
  const labelX = x + 4;
  const valueX = x + 145;
  const lineWidth = width - 154;
  let currentY = y + height - 16;

  page.drawText('Match Date(s)', { x: labelX, y: currentY, size: 9, font: regular, color: INK });
  page.drawText(cleanText(week.subtitle || ''), { x: valueX, y: currentY, size: 8.5, font: oblique, color: BLUE });
  currentY -= 18;

  page.drawText('Entries Submitted By', { x: labelX, y: currentY, size: 9, font: regular, color: INK });
  page.drawText(cleanText(values.deadline || 'TBC'), { x: valueX, y: currentY, size: 8.5, font: oblique, color: rgb(0.78, 0.08, 0.08) });
  currentY -= 23;

  page.drawText('Name', { x: labelX, y: currentY + 4, size: 9, font: regular, color: INK });
  addTextField(form, page, 'entrant.name', {
    x: valueX,
    y: currentY,
    width: lineWidth,
    height: 16,
    fontSize: 10,
    value: values.name,
    borderColor: INK,
    borderWidth: 0.8,
  });
  currentY -= 23;

  page.drawText('Company / Department', { x: labelX, y: currentY + 4, size: 9, font: regular, color: INK });
  addTextField(form, page, 'entrant.department', {
    x: valueX,
    y: currentY,
    width: lineWidth,
    height: 16,
    fontSize: 10,
    value: values.department,
    borderColor: INK,
    borderWidth: 0.8,
  });

  page.drawRectangle({ x: labelX, y: y + 112, width: width - 8, height: 20, borderColor: BLUE, borderWidth: 0.8 });
  page.drawText(`Scoring: 1 result point     Exact score: 3 points     Maximum: ${fixtures.length * 3}     Entry fee: ${cleanText(values.entryFee)}`, {
    x: labelX + 8,
    y: y + 119,
    size: 7,
    font: bold,
    color: INK,
  });

  drawRules(page, values.rules || [], fonts, labelX, y + 95, width - 8, 92);
}

export async function createOldSchoolPdf({
  week = {},
  fixtures = [],
  values = {},
  assets = {},
}) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage();
  page.setSize(A4_PORTRAIT[0], A4_PORTRAIT[1]);
  const form = pdf.getForm();
  const fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    oblique: await pdf.embedFont(StandardFonts.HelveticaOblique),
  };
  const background = await embedOptionalImage(pdf, assets.background, 'jpg');
  const [pageWidth, pageHeight] = A4_PORTRAIT;

  drawBackground(page, background, pageWidth, pageHeight);
  page.drawRectangle({ x: 10, y: 10, width: pageWidth - 20, height: pageHeight - 20, color: WHITE, opacity: 0.84 });

  const margin = 13;
  const panelHeight = fixtures.length > 28 ? 612 : fixtures.length > 24 ? 592 : 560;
  const panelY = pageHeight - margin - panelHeight;
  drawFixturePanel({
    page,
    form,
    fonts,
    fixtures,
    values,
    x: margin,
    y: panelY,
    width: pageWidth - margin * 2,
    height: panelHeight,
  });
  drawEntryInfo({
    page,
    form,
    fonts,
    week,
    fixtures,
    values: {
      ...values,
      rules: Array.isArray(values.rules) ? values.rules : [],
    },
    x: margin,
    y: margin,
    width: pageWidth - margin * 2,
    height: panelY - margin - 10,
  });
  form.updateFieldAppearances(fonts.regular);

  pdf.setTitle(cleanText(week.title || 'DMI Football Coupon'));
  pdf.setSubject('Fillable DMI Football Coupon entry form');
  pdf.setCreator('DMI Football Coupon');
  return pdf.save();
}
