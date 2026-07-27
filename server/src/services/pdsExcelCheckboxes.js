/**
 * Graft ExcelJS-filled cell data back into the official PDS template so form
 * checkboxes survive, then tick C1 + C4 controls from PDS answers.
 *
 * ExcelJS strips form controls on write. Grafting sheetData/sharedStrings/styles
 * into the intact template keeps native checkboxes. Only write
 * checked="Checked" (omit attribute when off — "Unchecked" breaks Excel open).
 *
 * C1 Drop Down 31 (ctrlProp1) is the dual-citizenship *country* list (Q11:Q216),
 * not birth/naturalization (those are checkboxes).
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const TEMPLATE_PATH = path.join(projectRoot, 'assets/forms/CS-Form-212-Revised-2025.xlsx');

/** Drop Down 31 — dual citizenship country combo. */
const C1_COUNTRY_DROP = { prop: 1, listStartRow: 11, listEndRow: 216 };

/**
 * C1 personal checkboxes (ctrlProp N + VML shape id / Check Box N).
 * shapeId matches vmlDrawing1 id="_x0000_sNNNN"; boxN is Excel shape name number.
 */
const C1_CTRL = {
  filipino: { prop: 2, shapeId: 1045, box: 21 },
  dual: { prop: 3, shapeId: 1046, box: 22 },
  male: { prop: 4, shapeId: 1049, box: 25 },
  female: { prop: 5, shapeId: 1050, box: 26 },
  single: { prop: 6, shapeId: 1058, box: 34 },
  married: { prop: 7, shapeId: 1059, box: 35 },
  widowed: { prop: 8, shapeId: 1060, box: 36 },
  other: { prop: 9, shapeId: 1061, box: 37 },
  separated: { prop: 10, shapeId: 1062, box: 38 },
  byBirth: { prop: 11, shapeId: 1063, box: 39 },
  byNaturalization: { prop: 12, shapeId: 1064, box: 40 },
};

/** C4 Yes/No map: ctrlProp file numbers + Check Box numbers (vmlDrawing2). */
const C4_YN = {
  'q34.a': { yes: 13, no: 14, boxYes: 1, boxNo: 2 },
  'q34.b': { yes: 15, no: 16, boxYes: 3, boxNo: 4 },
  'q35.a': { yes: 17, no: 18, boxYes: 5, boxNo: 6 },
  'q35.b': { yes: 19, no: 20, boxYes: 7, boxNo: 8 },
  q36: { yes: 21, no: 22, boxYes: 9, boxNo: 10 },
  q37: { yes: 23, no: 24, boxYes: 11, boxNo: 12 },
  'q38.a': { yes: 34, no: 35, boxYes: 26, boxNo: 27 },
  'q38.b': { yes: 36, no: 37, boxYes: 28, boxNo: 29 },
  q39: { yes: 25, no: 26, boxYes: 13, boxNo: 14 },
  'q40.a': { yes: 27, no: 30, boxYes: 15, boxNo: 18 },
  'q40.b': { yes: 28, no: 31, boxYes: 16, boxNo: 19 },
  'q40.c': { yes: 29, no: 32, boxYes: 17, boxNo: 20 },
};

/** @type {string[]|null} */
let countryListCache = null;

function ynAnswer(answer) {
  const a = String(answer || '')
    .trim()
    .toLowerCase();
  if (a === 'yes' || a === 'true' || a === 'y') return 'yes';
  if (a === 'no' || a === 'false' || a === 'n') return 'no';
  return '';
}

function pickAnswer(otherInfo, key) {
  const o = otherInfo || {};
  if (key.includes('.')) {
    const [parent, child] = key.split('.');
    return o[parent]?.[child]?.answer;
  }
  return o[key]?.answer;
}

function swapSheetData(templateSheet, filledSheet) {
  const filledData = filledSheet.match(/<sheetData[\s\S]*?<\/sheetData>/)?.[0];
  if (!filledData) throw new Error('Filled worksheet missing sheetData');
  if (!/<sheetData[\s\S]*?<\/sheetData>/.test(templateSheet)) {
    throw new Error('Template worksheet missing sheetData');
  }
  return templateSheet.replace(/<sheetData[\s\S]*?<\/sheetData>/, filledData);
}

/** Only emit checked="Checked"; omitting the attribute means unchecked. */
function setCtrlPropChecked(xml, checked) {
  let out = xml.replace(/\schecked="[^"]*"/i, '');
  if (!checked) return out;
  return out.replace(
    /<formControlPr\b([^>]*)\/>/,
    (_m, attrs) => `<formControlPr${attrs} checked="Checked"/>`,
  );
}

/** Set Drop/combo selection (1-based sel; val is typically sel-1). */
function setFormDropSelection(xml, sel1Based) {
  const sel = Math.max(1, Number(sel1Based) || 1);
  const val = Math.max(0, sel - 1);
  return xml.replace(/<formControlPr\b([^>]*)\/>/, (_m, attrs) => {
    const cleaned = String(attrs)
      .replace(/\ssel="[^"]*"/gi, '')
      .replace(/\sval="[^"]*"/gi, '');
    return `<formControlPr${cleaned} sel="${sel}" val="${val}"/>`;
  });
}

function getFormDropSel(xml) {
  const m = /\ssel="(\d+)"/i.exec(xml);
  return m ? Number(m[1]) : null;
}

/**
 * Tick a VML checkbox by Check Box number and/or shape id (_x0000_sNNNN).
 */
function setVmlChecked(vml, { box, shapeId }, checked) {
  let idx = -1;
  if (box != null) {
    idx = vml.indexOf(`Check_x0020_Box_x0020_${box}"`);
  }
  if (idx < 0 && shapeId != null) {
    idx = vml.indexOf(`id="_x0000_s${shapeId}"`);
  }
  if (idx < 0) return vml;

  const clientStart = vml.indexOf('<x:ClientData', idx);
  if (clientStart < 0) return vml;
  const clientEnd = vml.indexOf('</x:ClientData>', clientStart);
  if (clientEnd < 0) return vml;

  let block = vml.slice(clientStart, clientEnd);
  block = block.replace(/<x:Checked>\s*\d+\s*<\/x:Checked>\s*/gi, '');
  if (checked) {
    block = block.replace(/(<x:ClientData[^>]*>)/i, `$1\n   <x:Checked>1</x:Checked>`);
  }
  return vml.slice(0, clientStart) + block + vml.slice(clientEnd);
}

function isCtrlChecked(xml) {
  return /checked="Checked"/i.test(xml);
}

/** Whether a VML checkbox ClientData block contains Checked=1. */
function isVmlChecked(vml, { box, shapeId }) {
  let idx = -1;
  if (box != null) idx = vml.indexOf(`Check_x0020_Box_x0020_${box}"`);
  if (idx < 0 && shapeId != null) idx = vml.indexOf(`id="_x0000_s${shapeId}"`);
  if (idx < 0) return false;
  const clientStart = vml.indexOf('<x:ClientData', idx);
  if (clientStart < 0) return false;
  const clientEnd = vml.indexOf('</x:ClientData>', clientStart);
  if (clientEnd < 0) return false;
  const block = vml.slice(clientStart, clientEnd);
  return /<x:Checked>\s*1\s*<\/x:Checked>/i.test(block);
}

async function tickCtrl(zip, propNum, checked) {
  const part = `xl/ctrlProps/ctrlProp${propNum}.xml`;
  const xml = await zip.file(part).async('string');
  zip.file(part, setCtrlPropChecked(xml, checked));
}

function applyC1Checks(personal) {
  const p = personal || {};
  const sex = String(p.sex || '')
    .trim()
    .toLowerCase();
  const civil = String(p.civilStatus || '')
    .trim()
    .toLowerCase();
  const dual = Boolean(p.dualCitizenship);
  const dualType = String(p.dualCitizenshipType || '')
    .trim()
    .toLowerCase();

  return {
    filipino: !dual,
    dual,
    male: sex === 'male',
    female: sex === 'female',
    single: civil === 'single',
    married: civil === 'married',
    widowed: civil === 'widowed',
    separated: civil === 'separated',
    other: civil === 'other',
    byBirth: dual && dualType.includes('birth'),
    byNaturalization: dual && dualType.includes('natural'),
  };
}

function parseSharedStrings(ssXml) {
  const out = [];
  for (const si of ssXml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    const texts = [...si[1].matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((m) => m[1]);
    out.push(texts.join(''));
  }
  return out;
}

function decodeXmlText(s) {
  return String(s || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}

/**
 * Load Drop Down 31 country list (1-based indices match Excel COM List).
 * @param {import('jszip')} templateZip
 */
async function loadCountryList(templateZip) {
  if (countryListCache) return countryListCache;
  const ssXml = await templateZip.file('xl/sharedStrings.xml').async('string');
  const strings = parseSharedStrings(ssXml);
  const sheet1 = await templateZip.file('xl/worksheets/sheet1.xml').async('string');
  const list = [];
  for (let r = C1_COUNTRY_DROP.listStartRow; r <= C1_COUNTRY_DROP.listEndRow; r++) {
    const rowMatch = sheet1.match(new RegExp(`<row[^>]* r="${r}"[^>]*>([\\s\\S]*?)</row>`));
    if (!rowMatch) {
      list.push('');
      continue;
    }
    const rowBody = rowMatch[1];
    if (new RegExp(`<c r="Q${r}"[^>]*/>`).test(rowBody)) {
      list.push('');
      continue;
    }
    const cellMatch = rowBody.match(new RegExp(`<c r="Q${r}"([^>]*)>([\\s\\S]*?)</c>`));
    if (!cellMatch) {
      list.push('');
      continue;
    }
    const attrs = cellMatch[1] || '';
    const body = cellMatch[2] || '';
    if (/\bt="s"/.test(attrs)) {
      const idx = Number(/<v>(\d+)<\/v>/.exec(body)?.[1] ?? -1);
      list.push(idx >= 0 ? decodeXmlText(strings[idx] || '') : '');
    } else {
      const inline = /<t[^>]*>([^<]*)<\/t>/.exec(body)?.[1];
      const v = /<v>([^<]*)<\/v>/.exec(body)?.[1];
      list.push(decodeXmlText(inline || v || ''));
    }
  }
  countryListCache = list;
  return list;
}

/** @returns {number} 1-based selection index for Drop Down 31 */
function findCountrySel(countries, countryName) {
  const rawNeedle = String(countryName || '').trim();
  if (!rawNeedle) return 1; // "Please indicate country:"

  const aliases = {
    usa: 'united states',
    'u.s.a.': 'united states',
    'u.s.': 'united states',
    'united states of america': 'united states',
    uk: 'united kingdom',
    'great britain': 'united kingdom',
    'korea, south': 'korea',
    'south korea': 'korea',
  };

  let needle = rawNeedle.toLowerCase();
  if (aliases[needle]) needle = aliases[needle];

  const exact = countries.findIndex((t) => t.toLowerCase() === needle);
  if (exact >= 0) return exact + 1;

  // Prefer longest partial match so "United" does not steal "United Kingdom"
  let best = -1;
  let bestLen = 0;
  countries.forEach((t, i) => {
    if (!t) return;
    const low = t.toLowerCase();
    if (low.includes(needle) || needle.includes(low)) {
      if (low.length > bestLen) {
        best = i;
        bestLen = low.length;
      }
    }
  });
  if (best >= 0) return best + 1;
  return 1;
}

/**
 * @param {Buffer} filledBuffer ExcelJS output (controls already stripped)
 * @param {object} pds normalized PDS
 * @returns {Promise<Buffer>}
 */
export async function applyPdsFormCheckboxes(filledBuffer, pds) {
  const templateZip = await JSZip.loadAsync(await fs.readFile(TEMPLATE_PATH));
  const filledZip = await JSZip.loadAsync(filledBuffer);

  const countries = await loadCountryList(templateZip);

  templateZip.file(
    'xl/sharedStrings.xml',
    await filledZip.file('xl/sharedStrings.xml').async('nodebuffer'),
  );
  templateZip.file('xl/styles.xml', await filledZip.file('xl/styles.xml').async('nodebuffer'));

  for (const sheet of ['sheet1.xml', 'sheet2.xml', 'sheet3.xml', 'sheet4.xml', 'sheet5.xml']) {
    const part = `xl/worksheets/${sheet}`;
    const templateSheet = await templateZip.file(part).async('string');
    const filledSheet = await filledZip.file(part).async('string');
    templateZip.file(part, swapSheetData(templateSheet, filledSheet));
  }

  // C1 sex / civil status / citizenship
  let vml1 = await templateZip.file('xl/drawings/vmlDrawing1.vml').async('string');
  const c1 = applyC1Checks(pds?.personal);
  for (const [key, meta] of Object.entries(C1_CTRL)) {
    const on = Boolean(c1[key]);
    await tickCtrl(templateZip, meta.prop, on);
    vml1 = setVmlChecked(vml1, meta, on);
  }
  templateZip.file('xl/drawings/vmlDrawing1.vml', vml1);

  // Dual-citizenship country dropdown (Drop Down 31 / ctrlProp1)
  const dual = Boolean(pds?.personal?.dualCitizenship);
  const countrySel = dual
    ? findCountrySel(countries, pds?.personal?.dualCitizenshipCountry)
    : 1;
  const dropPath = `xl/ctrlProps/ctrlProp${C1_COUNTRY_DROP.prop}.xml`;
  const dropXml = await templateZip.file(dropPath).async('string');
  templateZip.file(dropPath, setFormDropSelection(dropXml, countrySel));

  // C4 Yes/No
  let vml2 = await templateZip.file('xl/drawings/vmlDrawing2.vml').async('string');
  for (const [key, map] of Object.entries(C4_YN)) {
    const yn = ynAnswer(pickAnswer(pds?.otherInfo, key));
    const yesOn = yn === 'yes';
    const noOn = yn === 'no';
    await tickCtrl(templateZip, map.yes, yesOn);
    await tickCtrl(templateZip, map.no, noOn);
    vml2 = setVmlChecked(vml2, { box: map.boxYes }, yesOn);
    vml2 = setVmlChecked(vml2, { box: map.boxNo }, noOn);
  }
  templateZip.file('xl/drawings/vmlDrawing2.vml', vml2);

  const out = await templateZip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
  });
  return Buffer.from(out);
}

/** @deprecated use applyPdsFormCheckboxes */
export async function applyC4FormCheckboxes(filledBuffer, otherInfo) {
  return applyPdsFormCheckboxes(filledBuffer, { otherInfo });
}

export {
  C1_CTRL,
  C1_COUNTRY_DROP,
  C4_YN,
  ynAnswer,
  isCtrlChecked,
  isVmlChecked,
  getFormDropSel,
  findCountrySel,
  applyC1Checks,
};
