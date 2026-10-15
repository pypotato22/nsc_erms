import { deflateSync } from 'node:zlib';

const FIR = Buffer.from([0x46, 0x49, 0x52, 0x00]);

const COMPRESSION = {
  0: 'none',
  1: 'bit-packed',
  2: 'WSQ',
  3: 'JPEG',
  4: 'JPEG 2000',
  5: 'PNG',
};

function crc32(buf) {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let i = 0; i < 8; i += 1) {
      c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
  }
  return ~c >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

export function contrastStretch(pixels) {
  let min = 255;
  let max = 0;
  for (const value of pixels) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  const span = max - min || 1;
  const out = Buffer.alloc(pixels.length);
  for (let i = 0; i < pixels.length; i += 1) {
    out[i] = Math.round(((pixels[i] - min) * 255) / span);
  }
  return out;
}

export function grayscaleToPng(width, height, pixels) {
  const raw = Buffer.alloc(height * (width + 1));
  for (let y = 0; y < height; y += 1) {
    const row = y * (width + 1);
    raw[row] = 0;
    pixels.copy(raw, row + 1, y * width, (y + 1) * width);
  }
  const compressed = deflateSync(raw);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 0;
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function sliceBlock(buf, size, offset) {
  if (!size || offset < 0 || offset >= buf.length) return Buffer.alloc(0);
  const end = Math.min(buf.length, offset + size);
  return buf.subarray(offset, end);
}

function tryRecord(buf, offset, depth, loose = false, headerBytes = 14) {
  if (offset < 0 || offset + headerBytes > buf.length) return null;
  const blockLength = buf.readUInt32LE(offset);
  const views = buf[offset + 9];
  const impression = buf[offset + 12];
  const pairs = [
    [buf.readUInt16LE(offset + 4), buf.readUInt16LE(offset + 6)],
    [buf.readUInt16BE(offset + 4), buf.readUInt16BE(offset + 6)],
  ];
  for (const [width, height] of pairs) {
    if (width < 32 || width > 2048 || height < 32 || height > 2048) continue;
    if (loose) {
      if (width < 100 || height < 100) continue;
    } else if (views !== 1 || impression > 9) {
      continue;
    }
    const bytesPerPixel = depth > 8 ? 2 : 1;
    const pixelsNeeded = width * height * bytesPerPixel;
    const dataStart = offset + headerBytes;
    if (dataStart + pixelsNeeded > buf.length) continue;
    const endExact = dataStart + pixelsNeeded === buf.length;
    const lengthExact = blockLength === pixelsNeeded + headerBytes
      || blockLength === pixelsNeeded + 14
      || blockLength === pixelsNeeded + 16;
    // The U.are.U 4500 WBF driver pads the record past the pixels (BlockLength runs to the block end).
    const lengthFits = blockLength >= pixelsNeeded + headerBytes && offset + blockLength <= buf.length;
    if (!endExact && !lengthExact && !lengthFits) continue;
    if (blockLength !== 0 && blockLength > buf.length - offset && !endExact) continue;
    let pixels;
    if (bytesPerPixel === 2) {
      pixels = Buffer.alloc(width * height);
      for (let i = 0; i < pixels.length; i += 1) {
        pixels[i] = buf[dataStart + i * 2 + 1];
      }
    } else {
      pixels = Buffer.from(buf.subarray(dataStart, dataStart + pixelsNeeded));
    }
    return { width, height, pixels };
  }
  return null;
}

const WINDOWS_FIR = 0x46495200;

function sliceBirBlock(buf, sizeAt, offsetAt) {
  if (buf.length < offsetAt + 8) return Buffer.alloc(0);
  const size = buf.readUInt32LE(sizeAt);
  const offset = buf.readUInt32LE(offsetAt);
  if (!size || offset < 0 || offset + size > buf.length) return Buffer.alloc(0);
  return buf.subarray(offset, offset + size);
}

function imageFromFormat(buf, formatAt) {
  const depth = buf[formatAt + 26];
  const compression = buf[formatAt + 27];
  const hRes = formatAt + 18 <= buf.length ? buf.readUInt16LE(formatAt + 16) : 0;
  const vRes = formatAt + 20 <= buf.length ? buf.readUInt16LE(formatAt + 18) : 0;
  if (depth < 1 || depth > 16) return null;
  if (compression !== 0 || depth < 8) {
    const compressionName = COMPRESSION[compression] || `code ${compression}`;
    return {
      image: null,
      note: `The reader returned a ${compressionName} fingerprint sample, so there is no raw preview.`,
    };
  }
  // MSVC pads the 38-byte header to 40 and the 14-byte record to 16.
  const layouts = [
    [formatAt + 32, 16],
    [formatAt + 32, 14],
    [formatAt + 30, 14],
    [formatAt + 30, 16],
  ];
  for (const [recordAt, headerBytes] of layouts) {
    const image = tryRecord(buf, recordAt, depth, false, headerBytes)
      || tryRecord(buf, recordAt, depth, true, headerBytes);
    if (image) return { image: { ...image, hRes, vRes, depth }, note: null };
  }
  return null;
}

/**
 * WinBio stores ANSI 381 as WINBIO_BDB_ANSI_381_HEADER.
 * FormatIdentifier is the little-endian value 0x46495200, not the ASCII bytes "FIR\0".
 * The finger record begins 30 bytes after that field.
 */
function imageFromWindowsBlock(block) {
  if (block.length < 44) return null;
  const layouts = [
    [32, 16],
    [32, 14],
    [30, 14],
    [30, 16],
  ];
  let note = null;
  for (const formatAt of [8, 6, 0]) {
    if (formatAt + 44 > block.length) continue;
    if (block.readUInt32LE(formatAt) !== WINDOWS_FIR) continue;
    const parsed = imageFromFormat(block, formatAt);
    if (parsed?.image) return parsed;
    if (parsed?.note) note = parsed;
    for (const [delta, headerBytes] of layouts) {
      const image = tryRecord(block, formatAt + delta, 8, true, headerBytes);
      if (image) return { image: { ...image, hRes: 0, vRes: 0, depth: 8 }, note: null };
    }
  }
  return note;
}

function imageFromBir(buf) {
  if (buf.length < 32) return null;
  const standard = sliceBirBlock(buf, 8, 12);
  const vendor = sliceBirBlock(buf, 16, 20);
  return imageFromWindowsBlock(standard) || imageFromWindowsBlock(vendor);
}

export function describeFingerprintSample(sample) {
  const buf = Buffer.isBuffer(sample) ? sample : Buffer.from(sample);
  if (buf.length < 32) return `sample ${buf.length} bytes`;
  const standardSize = buf.readUInt32LE(8);
  const standardOffset = buf.readUInt32LE(12);
  const vendorSize = buf.readUInt32LE(16);
  const vendorOffset = buf.readUInt32LE(20);
  let format = 'none';
  if (standardOffset + 12 <= buf.length) {
    format = `0x${buf.readUInt32LE(standardOffset + 8).toString(16)}`;
  }
  const head = buf.subarray(0, Math.min(48, buf.length)).toString('hex');
  return `sample ${buf.length} bytes, standard ${standardSize} at ${standardOffset}, vendor ${vendorSize} at ${vendorOffset}, format ${format}, head ${head}`;
}

function imageFromFir(buf) {
  let index = 0;
  while (index < buf.length) {
    const magic = buf.indexOf(FIR, index);
    if (magic === -1) return null;
    const depth = buf[magic + 26];
    const compression = buf[magic + 27];
    const hRes = magic + 18 <= buf.length ? buf.readUInt16LE(magic + 16) : 0;
    const vRes = magic + 20 <= buf.length ? buf.readUInt16LE(magic + 18) : 0;
    if (depth >= 1 && depth <= 16) {
      const compressionName = COMPRESSION[compression] || `code ${compression}`;
      if (compression !== 0 || depth < 8) {
        return {
          image: null,
          note: `The reader returned a ${compressionName} fingerprint sample, so there is no raw preview.`,
          hRes,
          vRes,
        };
      }
      for (const recordAt of [magic + 30, magic + 32]) {
        const image = tryRecord(buf, recordAt, depth);
        if (image) {
          return { image: { ...image, hRes, vRes, depth }, note: null };
        }
      }
    }
    index = magic + 4;
  }
  return null;
}

export function decodeFingerprint(sample) {
  const buf = Buffer.isBuffer(sample) ? sample : Buffer.from(sample);
  const result = {
    quality: null,
    dataFlags: null,
    image: null,
    note: null,
  };
  if (buf.length < 32) {
    result.note = 'The sample is too small to contain a fingerprint image.';
    return result;
  }

  const headerSize = buf.readUInt32LE(0);
  const headerOffset = buf.readUInt32LE(4);
  const header = sliceBlock(buf, headerSize, headerOffset);
  if (header.length >= 15) {
    result.dataFlags = header[4];
    const quality = header.readInt8(14);
    if (quality >= -2 && quality <= 100) result.quality = quality;
  }

  const found = imageFromBir(buf) || imageFromFir(buf);
  if (found?.image) {
    result.image = found.image;
    return result;
  }
  if (found?.note) {
    result.note = found.note;
    return result;
  }

  result.note = 'A sample was captured, but it did not include a previewable fingerprint image.';
  return result;
}
