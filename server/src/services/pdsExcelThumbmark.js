import fs from 'node:fs';
import JSZip from 'jszip';
import { getFilesRoot } from './settings.js';
import { absoluteFromRelative } from './files.js';

/**
 * C4 right-thumb box — merge K58:L64 on CS Form 212 Rev. 2025.
 * The printed label "Right Thumbmark" is K65:L65 and stays uncovered.
 * Offsets are EMUs: a ~0.03 in inset inside the merged box.
 * Column L is ~117 px wide and row 64 is 10.5 pt tall.
 */
const THUMB_FROM = { col: 10, row: 57, colOff: 28575, rowOff: 28575 };
const THUMB_TO = { col: 11, row: 63, colOff: 1085850, rowOff: 104775 };

function buildThumbmarkAnchorXml() {
  const { col: fc, row: fr, colOff: fColOff, rowOff: fRowOff } = THUMB_FROM;
  const { col: tc, row: tr, colOff: tColOff, rowOff: tRowOff } = THUMB_TO;
  return `<xdr:twoCellAnchor editAs="oneCell">
  <xdr:from><xdr:col>${fc}</xdr:col><xdr:colOff>${fColOff}</xdr:colOff><xdr:row>${fr}</xdr:row><xdr:rowOff>${fRowOff}</xdr:rowOff></xdr:from>
  <xdr:to><xdr:col>${tc}</xdr:col><xdr:colOff>${tColOff}</xdr:colOff><xdr:row>${tr}</xdr:row><xdr:rowOff>${tRowOff}</xdr:rowOff></xdr:to>
  <xdr:pic>
    <xdr:nvPicPr>
      <xdr:cNvPr id="99003" name="Employee Thumbmark"/>
      <xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr>
    </xdr:nvPicPr>
    <xdr:blipFill>
      <a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="rIdThumbmark"/>
      <a:stretch><a:fillRect/></a:stretch>
    </xdr:blipFill>
    <xdr:spPr bwMode="auto">
      <a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></a:xfrm>
      <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
    </xdr:spPr>
  </xdr:pic>
  <xdr:clientData/>
</xdr:twoCellAnchor>`;
}

function ensureContentType(xml, ext, contentType) {
  if (xml.includes(`Extension="${ext}"`)) return xml;
  const insert = `<Default Extension="${ext}" ContentType="${contentType}"/>`;
  return xml.replace(
    /<Types xmlns="http:\/\/schemas\.openxmlformats\.org\/package\/2006\/content-types">/,
    `$&${insert}`,
  );
}

function ensureDrawingRels(relsXml, mediaFile) {
  const relType =
    'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image';
  if (relsXml.includes('Id="rIdThumbmark"')) {
    return relsXml.replace(
      /(<Relationship[^>]*Id="rIdThumbmark"[^>]*Target=")[^"]+"/,
      `$1../media/${mediaFile}"`,
    );
  }
  const rel = `<Relationship Id="rIdThumbmark" Type="${relType}" Target="../media/${mediaFile}"/>`;
  if (relsXml) {
    return relsXml.replace('</Relationships>', `${rel}</Relationships>`);
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rel}</Relationships>`;
}

function injectThumbmarkDrawing(drawingXml, anchorXml) {
  if (drawingXml.includes('name="Employee Thumbmark"')) return drawingXml;
  let out = drawingXml;
  if (!out.includes('xmlns:r=')) {
    out = out.replace(
      '<xdr:wsDr ',
      '<xdr:wsDr xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ',
    );
  }
  return out.replace('</xdr:wsDr>', `${anchorXml}</xdr:wsDr>`);
}

/**
 * Embed the right-thumb PNG into C4 K58:L64 without rewriting via ExcelJS.
 * @param {Buffer} xlsxBuffer
 * @param {Buffer} thumbBuffer PNG bytes
 * @returns {Promise<Buffer>}
 */
export async function embedC4Thumbmark(xlsxBuffer, thumbBuffer) {
  if (!thumbBuffer?.length) return xlsxBuffer;

  const mediaFile = 'image3.png';
  const zip = await JSZip.loadAsync(xlsxBuffer);
  zip.file(`xl/media/${mediaFile}`, thumbBuffer);

  const ctPath = '[Content_Types].xml';
  const ct = await zip.file(ctPath).async('string');
  zip.file(ctPath, ensureContentType(ct, 'png', 'image/png'));

  const relsPath = 'xl/drawings/_rels/drawing2.xml.rels';
  const existingRels = zip.file(relsPath)
    ? await zip.file(relsPath).async('string')
    : '';
  zip.file(relsPath, ensureDrawingRels(existingRels, mediaFile));

  const drawingPath = 'xl/drawings/drawing2.xml';
  const drawing = await zip.file(drawingPath).async('string');
  zip.file(drawingPath, injectThumbmarkDrawing(drawing, buildThumbmarkAnchorXml()));

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

/**
 * @param {Buffer} xlsxBuffer
 * @param {{ thumbmarkPath?: string|null }} employee
 * @returns {Promise<Buffer>}
 */
export async function embedC4ThumbmarkFromEmployee(xlsxBuffer, employee) {
  const rel = employee?.thumbmarkPath;
  if (!rel) return xlsxBuffer;

  const root = await getFilesRoot();
  const abs = absoluteFromRelative(root, rel);
  if (!fs.existsSync(abs)) return xlsxBuffer;

  const thumbBuffer = fs.readFileSync(abs);
  return embedC4Thumbmark(xlsxBuffer, thumbBuffer);
}
