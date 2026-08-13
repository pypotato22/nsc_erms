/**
 * Detect MIME type from file magic bytes (not client-declared Content-Type).
 */

const PDF = Buffer.from('%PDF');
const JPEG = Buffer.from([0xff, 0xd8, 0xff]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const OLE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

export const MIME = {
  PDF: 'application/pdf',
  JPEG: 'image/jpeg',
  PNG: 'image/png',
  WEBP: 'image/webp',
  DOC: 'application/msword',
  DOCX: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

function startsWith(buf, sig) {
  return buf.length >= sig.length && buf.subarray(0, sig.length).equals(sig);
}

/**
 * @param {Buffer} buffer
 * @returns {string|null} Canonical MIME or null if unknown
 */
export function sniffMime(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return null;

  if (startsWith(buffer, PDF)) return MIME.PDF;
  if (startsWith(buffer, JPEG)) return MIME.JPEG;
  if (startsWith(buffer, PNG)) return MIME.PNG;

  // RIFF....WEBP
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return MIME.WEBP;
  }

  if (startsWith(buffer, OLE)) return MIME.DOC;

  // DOCX is a ZIP; look for Word package markers in the early bytes
  if (startsWith(buffer, ZIP)) {
    const head = buffer.subarray(0, Math.min(buffer.length, 8192)).toString('binary');
    if (head.includes('word/') || head.includes('word\\')) {
      return MIME.DOCX;
    }
    // Other ZIP (xlsx, etc.) — not accepted as Word unless markers found
    return null;
  }

  return null;
}

export function normalizeDeclaredMime(declared) {
  const m = String(declared || '')
    .trim()
    .toLowerCase();
  if (m === 'image/jpg') return MIME.JPEG;
  return m || null;
}

/**
 * Resolve authoritative MIME from buffer. Declared type is ignored for trust;
 * sniffed type must be in `allowed`.
 * @returns {string} canonical MIME to store
 */
export function assertAllowedBuffer(buffer, allowed) {
  const allowedSet =
    allowed instanceof Set ? allowed : new Set(Array.isArray(allowed) ? allowed : []);
  // Treat image/jpg as jpeg in allowlists
  const normalizedAllowed = new Set(
    [...allowedSet].map((m) => (m === 'image/jpg' ? MIME.JPEG : m)),
  );

  const sniffed = sniffMime(buffer);
  if (!sniffed || !normalizedAllowed.has(sniffed)) {
    const err = new Error('File content does not match an allowed type');
    err.code = 'VALIDATION';
    throw err;
  }
  return sniffed;
}
