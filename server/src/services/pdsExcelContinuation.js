function cloneDeep(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function parseCellRef(ref) {
  const m = /^([A-Z]+)(\d+)$/.exec(ref || '');
  if (!m) return null;
  return { col: m[1], row: Number(m[2]) };
}

function remapRange(range, rowOffset) {
  const parts = String(range || '').split(':');
  if (parts.length === 1) {
    const cell = parseCellRef(parts[0]);
    return cell ? `${cell.col}${cell.row + rowOffset}` : null;
  }
  const start = parseCellRef(parts[0]);
  const end = parseCellRef(parts[1]);
  if (!start || !end) return null;
  return `${start.col}${start.row + rowOffset}:${end.col}${end.row + rowOffset}`;
}

function copySectionLayout(target, source, fromRow, toRow) {
  for (let col = 1; col <= source.columnCount; col++) {
    const srcCol = source.getColumn(col);
    const dstCol = target.getColumn(col);
    dstCol.width = srcCol.width;
    dstCol.hidden = srcCol.hidden;
    dstCol.style = cloneDeep(srcCol.style || {});
  }

  for (let srcRowNum = fromRow; srcRowNum <= toRow; srcRowNum++) {
    const dstRowNum = srcRowNum - fromRow + 1;
    const srcRow = source.getRow(srcRowNum);
    const dstRow = target.getRow(dstRowNum);
    dstRow.height = srcRow.height;
    dstRow.hidden = srcRow.hidden;
    dstRow.style = cloneDeep(srcRow.style || {});

    srcRow.eachCell({ includeEmpty: true }, (srcCell, colNumber) => {
      const dstCell = dstRow.getCell(colNumber);
      dstCell.value = cloneDeep(srcCell.value);
      dstCell.style = cloneDeep(srcCell.style || {});
      if (srcCell.numFmt) dstCell.numFmt = srcCell.numFmt;
      if (srcCell.note) dstCell.note = cloneDeep(srcCell.note);
    });
  }

  const merges = source.model?.merges || [];
  for (const range of merges) {
    const [startRef, endRef = startRef] = String(range).split(':');
    const start = parseCellRef(startRef);
    const end = parseCellRef(endRef);
    if (!start || !end) continue;
    if (start.row < fromRow || end.row > toRow) continue;
    const mapped = remapRange(range, 1 - fromRow);
    if (mapped) target.mergeCells(mapped);
  }

  target.pageSetup = {
    ...cloneDeep(source.pageSetup || {}),
    printArea: `A1:${target.getColumn(source.columnCount).letter}${toRow - fromRow + 1}`,
  };
  target.headerFooter = cloneDeep(source.headerFooter || {});
  target.properties = cloneDeep(source.properties || {});
  target.views = cloneDeep(source.views || []);
}

function defaultContinuationName(baseName, pageIndex) {
  return pageIndex === 0 ? `${baseName} Cont.` : `${baseName} Cont. ${pageIndex + 1}`;
}

/**
 * @typedef {{
 *  baseName: string,
 *  sourceSheetName: string,
 *  cloneFromRow: number,
 *  cloneToRow: number,
 *  dataStartRow: number,
 *  pageSize: number,
 *  fillRow: (ws: import('exceljs').Worksheet, rowNumber: number, item: any) => void,
 *  nameForPage?: (pageIndex: number) => string
 * }} ContinuationSectionDef
 */

/**
 * Create one or more continuation sheets for overflow rows.
 * @param {import('exceljs').Workbook} wb
 * @param {ContinuationSectionDef} def
 * @param {any[]} rows
 * @returns {string[]} created worksheet names
 */
export function addContinuationSheets(wb, def, rows) {
  const overflow = Array.isArray(rows) ? rows.filter(Boolean) : [];
  if (!overflow.length) return [];

  const source = wb.getWorksheet(def.sourceSheetName);
  if (!source) return [];

  const created = [];
  for (let offset = 0, pageIndex = 0; offset < overflow.length; offset += def.pageSize, pageIndex++) {
    const chunk = overflow.slice(offset, offset + def.pageSize);
    const sheetName = (def.nameForPage || ((i) => defaultContinuationName(def.baseName, i)))(pageIndex);
    const ws = wb.addWorksheet(sheetName);
    copySectionLayout(ws, source, def.cloneFromRow, def.cloneToRow);
    chunk.forEach((item, i) => def.fillRow(ws, def.dataStartRow + i, item));
    created.push(sheetName);
  }
  return created;
}

