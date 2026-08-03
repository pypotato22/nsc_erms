import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import { getFilesRoot } from './settings.js';
import { absoluteFromRelative } from './files.js';

const SIGNATURE_EXT = {
  '.jpg': { ext: 'jpeg', contentType: 'image/jpeg' },
  '.jpeg': { ext: 'jpeg', contentType: 'image/jpeg' },
  '.png': { ext: 'png', contentType: 'image/png' },
  '.gif': { ext: 'gif', contentType: 'image/gif' },
  '.webp': { ext: 'png', contentType: 'image/png' },
};

/**
 * C4 signature box — merge F60:I62 on CS Form 212 Rev. 2025.
 * Anchors are 0-based OOXML indices with ~0.03 in inset so the image
 * stays inside the printed frame without covering the F63 label.
 */
const SIGNATURE_FROM = { col: 5, row: 59, colOff: 28575, rowOff: 28575 };
const SIGNATURE_TO = { col: 8, row: 61, colOff: 171450, rowOff: 85725 };

function signatureMetaFromPath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return SIGNATURE_EXT[ext] || SIGNATURE_EXT['.png'];
}

function buildSignatureAnchorXml() {
  const { col: fc, row: fr, colOff: fColOff, rowOff: fRowOff } = SIGNATURE_FROM;
  const { col: tc, row: tr, colOff: tColOff, rowOff: tRowOff } = SIGNATURE_TO;
  return `<xdr:twoCellAnchor editAs="oneCell">
  <xdr:from><xdr:col>${fc}</xdr:col><xdr:colOff>${fColOff}</xdr:colOff><xdr:row>${fr}</xdr:row><xdr:rowOff>${fRowOff}</xdr:rowOff></xdr:from>
  <xdr:to><xdr:col>${tc}</xdr:col><xdr:colOff>${tColOff}</xdr:colOff><xdr:row>${tr}</xdr:row><xdr:rowOff>${tRowOff}</xdr:rowOff></xdr:to>
  <xdr:pic>
    <xdr:nvPicPr>
      <xdr:cNvPr id="99002" name="Employee Signature"/>
      <xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr>
    </xdr:nvPicPr>
    <xdr:blipFill>
      <a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="rIdSignature"/>
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
  if (relsXml.includes('Id="rIdSignature"')) {
    return relsXml.replace(
      /(<Relationship[^>]*Id="rIdSignature"[^>]*Target=")[^"]+"/,
      `$1../media/${mediaFile}"`,
    );
  }
  const rel = `<Relationship Id="rIdSignature" Type="${relType}" Target="../media/${mediaFile}"/>`;
  if (relsXml) {
    return relsXml.replace('</Relationships>', `${rel}</Relationships>`);
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rel}</Relationships>`;
}

function injectSignatureDrawing(drawingXml, anchorXml) {
  if (drawingXml.includes('name="Employee Signature"')) return drawingXml;
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
 * Embed employee signature into C4 F60:I62 without rewriting via ExcelJS
 * (ExcelJS write strips form controls).
 * @param {Buffer} xlsxBuffer grafted workbook from applyPdsFormCheckboxes
 * @param {Buffer} signatureBuffer image bytes
 * @param {string} [originalName] used to pick media extension
 * @returns {Promise<Buffer>}
 */
export async function embedC4Signature(
  xlsxBuffer,
  signatureBuffer,
  originalName = 'signature.png',
) {
  if (!signatureBuffer?.length) return xlsxBuffer;

  const meta = signatureMetaFromPath(originalName);
  const mediaFile = `image2.${meta.ext}`;
  const zip = await JSZip.loadAsync(xlsxBuffer);

  zip.file(`xl/media/${mediaFile}`, signatureBuffer);

  const ctPath = '[Content_Types].xml';
  const ct = await zip.file(ctPath).async('string');
  zip.file(ctPath, ensureContentType(ct, meta.ext, meta.contentType));

  const relsPath = 'xl/drawings/_rels/drawing2.xml.rels';
  const existingRels = zip.file(relsPath)
    ? await zip.file(relsPath).async('string')
    : '';
  zip.file(relsPath, ensureDrawingRels(existingRels, mediaFile));

  const drawingPath = 'xl/drawings/drawing2.xml';
  const drawing = await zip.file(drawingPath).async('string');
  zip.file(drawingPath, injectSignatureDrawing(drawing, buildSignatureAnchorXml()));

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

/**
 * @param {Buffer} xlsxBuffer
 * @param {{ signaturePath?: string|null }} employee
 * @returns {Promise<Buffer>}
 */
export async function embedC4SignatureFromEmployee(xlsxBuffer, employee) {
  const rel = employee?.signaturePath;
  if (!rel) return xlsxBuffer;

  const root = await getFilesRoot();
  const abs = absoluteFromRelative(root, rel);
  if (!fs.existsSync(abs)) return xlsxBuffer;

  const signatureBuffer = fs.readFileSync(abs);
  return embedC4Signature(xlsxBuffer, signatureBuffer, path.basename(abs));
}
