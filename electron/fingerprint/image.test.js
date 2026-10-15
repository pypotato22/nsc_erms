import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeFingerprint } from './image.js';

/** WinBio BIR shaped like a U.are.U 4500 WBF raw sample: the record's BlockLength runs past the pixels. */
function u4500Sample(width, height, padding) {
  const pixels = width * height;
  const standardSize = 40 + 16 + pixels + padding;
  const buf = Buffer.alloc(80 + standardSize);
  buf.writeUInt32LE(48, 0);
  buf.writeUInt32LE(32, 4);
  buf.writeUInt32LE(standardSize, 8);
  buf.writeUInt32LE(80, 12);
  buf[32 + 4] = 0x20;

  const bdb = 80;
  buf.writeUInt32LE(standardSize, bdb);
  buf.writeUInt32LE(0x46495200, bdb + 8);
  buf.writeUInt16LE(508, bdb + 24);
  buf.writeUInt16LE(508, bdb + 26);
  buf[bdb + 34] = 8;
  buf[bdb + 35] = 0;

  const record = bdb + 40;
  buf.writeUInt32LE(standardSize - 40, record);
  buf.writeUInt16LE(width, record + 4);
  buf.writeUInt16LE(height, record + 6);
  buf[record + 9] = 1;
  buf[record + 10] = 1;
  buf[record + 11] = 0xfe;
  for (let i = 0; i < pixels; i += 1) buf[record + 16 + i] = i % 251;
  buf.fill(0xff, record + 16 + pixels);
  return buf;
}

test('decodes a 4500 sample whose record is padded past the pixels', () => {
  const result = decodeFingerprint(u4500Sample(64, 72, 128));
  assert.equal(result.note, null);
  assert.equal(result.image.width, 64);
  assert.equal(result.image.height, 72);
  assert.equal(result.image.hRes, 508);
  assert.equal(result.image.pixels[70], 70);
});

test('still decodes an unpadded sample', () => {
  const result = decodeFingerprint(u4500Sample(64, 72, 0));
  assert.equal(result.image.width, 64);
});
