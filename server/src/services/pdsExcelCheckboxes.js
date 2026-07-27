/**
 * Graft ExcelJS-filled cell data back into the official PDS template so form
 * checkboxes survive, then tick C1 + C4 controls from PDS answers.
 *
 * ExcelJS strips form controls on write. Grafting sheetData/sharedStrings/styles
 * into the intact template keeps native checkboxes. Only write
 * checked="Checked" (omit attribute when off — "Unchecked" breaks Excel open).
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const TEMPLATE_PATH = path.join(projectRoot, 'assets/forms/CS-Form-212-Revised-2025.xlsx');

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

  const ticks = {
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
  return ticks;
}

/**
 * @param {Buffer} filledBuffer ExcelJS output (controls already stripped)
 * @param {object} pds normalized PDS
 * @returns {Promise<Buffer>}
 */
export async function applyPdsFormCheckboxes(filledBuffer, pds) {
  const templateZip = await JSZip.loadAsync(await fs.readFile(TEMPLATE_PATH));
  const filledZip = await JSZip.loadAsync(filledBuffer);

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

export { C1_CTRL, C4_YN, ynAnswer, isCtrlChecked, applyC1Checks };
