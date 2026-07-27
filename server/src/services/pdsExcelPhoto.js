import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import { getFilesRoot } from './settings.js';
import { absoluteFromRelative } from './files.js';

const PHOTO_EXT = {
  '.jpg': { ext: 'jpeg', contentType: 'image/jpeg' },
  '.jpeg': { ext: 'jpeg', contentType: 'image/jpeg' },
  '.png': { ext: 'png', contentType: 'image/png' },
  '.gif': { ext: 'gif', contentType: 'image/gif' },
  '.webp': { ext: 'png', contentType: 'image/png' },
};

/** C4 PHOTO box — merged J50:M55 (+ adjacent rows) on CS Form 212 Rev. 2025. */
const PHOTO_FROM = { col: 9, row: 49 }; // J50
const PHOTO_TO = { col: 12, row: 56 }; // M57

function photoMetaFromPath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return PHOTO_EXT[ext] || PHOTO_EXT['.jpg'];
}

function buildPhotoAnchorXml() {
  const { col: fc, row: fr } = PHOTO_FROM;
  const { col: tc, row: tr } = PHOTO_TO;
  return `<xdr:twoCellAnchor editAs="oneCell">
  <xdr:from><xdr:col>${fc}</xdr:col><xdr:colOff>28575</xdr:colOff><xdr:row>${fr}</xdr:row><xdr:rowOff>28575</xdr:rowOff></xdr:from>
  <xdr:to><xdr:col>${tc}</xdr:col><xdr:colOff>9525</xdr:colOff><xdr:row>${tr}</xdr:row><xdr:rowOff>9525</xdr:rowOff></xdr:to>
  <xdr:pic>
    <xdr:nvPicPr>
      <xdr:cNvPr id="99001" name="Employee Photo"/>
      <xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr>
    </xdr:nvPicPr>
    <xdr:blipFill>
      <a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="rIdPhoto"/>
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

function ensureDrawingRels(relsXml, mediaFile, contentType) {
  const relType =
    'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image';
  if (relsXml.includes('Id="rIdPhoto"')) {
    return relsXml.replace(
      /Target="\.\.\/media\/[^"]+"/,
      `Target="../media/${mediaFile}"`,
    );
  }
  const rel = `<Relationship Id="rIdPhoto" Type="${relType}" Target="../media/${mediaFile}"/>`;
  if (relsXml) {
    return relsXml.replace('</Relationships>', `${rel}</Relationships>`);
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rel}</Relationships>`;
}

function injectPhotoDrawing(drawingXml, anchorXml) {
  if (drawingXml.includes('name="Employee Photo"')) return drawingXml;
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
 * Embed employee profile photo into C4 PHOTO region without rewriting via ExcelJS
 * (ExcelJS write strips form controls).
 * @param {Buffer} xlsxBuffer grafted workbook from applyPdsFormCheckboxes
 * @param {Buffer} photoBuffer image bytes
 * @param {string} [originalName] used to pick media extension
 * @returns {Promise<Buffer>}
 */
export async function embedC4Photo(xlsxBuffer, photoBuffer, originalName = 'photo.jpg') {
  if (!photoBuffer?.length) return xlsxBuffer;

  const meta = photoMetaFromPath(originalName);
  const mediaFile = `image1.${meta.ext}`;
  const zip = await JSZip.loadAsync(xlsxBuffer);

  zip.file(`xl/media/${mediaFile}`, photoBuffer);

  const ctPath = '[Content_Types].xml';
  const ct = await zip.file(ctPath).async('string');
  zip.file(ctPath, ensureContentType(ct, meta.ext, meta.contentType));

  const relsPath = 'xl/drawings/_rels/drawing2.xml.rels';
  const existingRels = zip.file(relsPath)
    ? await zip.file(relsPath).async('string')
    : '';
  zip.file(relsPath, ensureDrawingRels(existingRels, mediaFile, meta.contentType));

  const drawingPath = 'xl/drawings/drawing2.xml';
  const drawing = await zip.file(drawingPath).async('string');
  zip.file(drawingPath, injectPhotoDrawing(drawing, buildPhotoAnchorXml()));

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

/**
 * @param {Buffer} xlsxBuffer
 * @param {{ profilePicturePath?: string|null }} employee
 * @returns {Promise<Buffer>}
 */
export async function embedC4PhotoFromEmployee(xlsxBuffer, employee) {
  const rel = employee?.profilePicturePath;
  if (!rel) return xlsxBuffer;

  const root = await getFilesRoot();
  const abs = absoluteFromRelative(root, rel);
  if (!fs.existsSync(abs)) return xlsxBuffer;

  const photoBuffer = fs.readFileSync(abs);
  return embedC4Photo(xlsxBuffer, photoBuffer, path.basename(abs));
}
