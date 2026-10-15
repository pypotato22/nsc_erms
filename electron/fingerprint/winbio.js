import koffi from 'koffi';
import { acquireReaderFocus } from './focus.js';
import { contrastStretch, decodeFingerprint, describeFingerprintSample, grayscaleToPng } from './image.js';
import { chooseRightThumbSensor } from './choose.js';

const WINBIO_TYPE_FINGERPRINT = 0x00000008;
const WINBIO_POOL_SYSTEM = 1;
const WINBIO_FLAG_DEFAULT = 0;
const WINBIO_FLAG_RAW = 0x0001;
const WINBIO_DATA_FLAG_RAW = 0x20;
const WINBIO_NO_PURPOSE_AVAILABLE = 0;
const SCHEMA_SIZE = 2588;
const MAX_SAMPLE_BYTES = 8_000_000;

const REJECT = {
  1: 'Move your finger down a little.',
  2: 'Move your finger up a little.',
  3: 'Move your finger right a little.',
  4: 'Move your finger left a little.',
  5: 'You moved too quickly. Hold still.',
  6: 'You moved too slowly.',
  7: 'The print was too faint. Press your finger flat and hold it still.',
  8: 'Lay your finger flatter on the glass.',
  9: 'The swipe was too short.',
  10: 'The reader could not assemble the print. Try again.',
};

const FRIENDLY = {
  0x80098004: 'The capture was canceled before a finger was read.',
  0x80098008: 'The reader saw a finger, but the print was not usable.',
  0x80098010: 'The reader is busy in another app.',
  0x8009802a: 'Windows gave the reader to another window. Leave the fingerprint prompt in front, then try again.',
  0x80098032: 'The Windows Biometric Framework is disabled.',
  0x80098034: 'The fingerprint sensor is unavailable.',
  0x80098036: 'The fingerprint reader reported a hardware failure.',
  0x80070005: 'Windows denied access to the reader. Close other apps using it, then try again from an Administrator terminal if it still fails.',
  0x800706ba: 'The Windows Biometric Service is not running.',
};

const winbio = koffi.load('winbio.dll');
const kernel32 = koffi.load('kernel32.dll');

const WinBioEnumBiometricUnits = winbio.func(
  'int32 WinBioEnumBiometricUnits(uint32 factor, _Out_ void **units, _Out_ uint64 *count)',
);
const WinBioOpenSession = winbio.func(
  'int32 WinBioOpenSession(uint32 factor, uint32 pool, uint32 flags, void *units, uint64 unitCount, void *database, _Out_ uint32 *session)',
);
const WinBioCaptureSample = winbio.func(
  'int32 WinBioCaptureSample(uint32 session, uint8 purpose, uint8 flags, _Out_ uint32 *unitId, _Out_ void **sample, _Out_ uint64 *sampleSize, _Out_ uint32 *rejectDetail)',
);
const WinBioFree = winbio.func('int32 WinBioFree(void *address)');
const WinBioCloseSession = winbio.func('int32 WinBioCloseSession(uint32 session)');
const WinBioCancel = winbio.func('int32 WinBioCancel(uint32 session)');
const WinBioLocateSensor = winbio.func(
  'int32 WinBioLocateSensor(uint32 session, _Out_ uint32 *unitId)',
);
const FormatMessageW = kernel32.func(
  'uint32 FormatMessageW(uint32 flags, void *source, uint32 messageId, uint32 languageId, void *buffer, uint32 size, void *args)',
);
const GetModuleHandleW = kernel32.func('void *GetModuleHandleW(str16 moduleName)');

const FORMAT_MESSAGE_FROM_SYSTEM = 0x00001000;
const FORMAT_MESSAGE_FROM_HMODULE = 0x00000800;
const FORMAT_MESSAGE_IGNORE_INSERTS = 0x00000200;

export function failed(hr) {
  return (hr >>> 0) >= 0x80000000;
}

function systemMessage(code) {
  const buffer = Buffer.alloc(1024);
  let count = FormatMessageW(
    FORMAT_MESSAGE_FROM_SYSTEM | FORMAT_MESSAGE_IGNORE_INSERTS,
    null,
    code,
    0,
    buffer,
    512,
    null,
  );
  if (!count) {
    const module = GetModuleHandleW('winbio.dll');
    if (module) {
      count = FormatMessageW(
        FORMAT_MESSAGE_FROM_HMODULE | FORMAT_MESSAGE_IGNORE_INSERTS,
        module,
        code,
        0,
        buffer,
        512,
        null,
      );
    }
  }
  if (!count) return '';
  return buffer.toString('utf16le', 0, count * 2).replace(/\s+/g, ' ').trim();
}

export function formatHresult(hr) {
  const code = hr >>> 0;
  if (code === 0) return 'The operation succeeded.';
  const hex = `0x${code.toString(16).padStart(8, '0')}`;
  return FRIENDLY[code] || systemMessage(code) || `Windows biometric error ${hex}`;
}

function readUtf16(buf, offset) {
  let text = '';
  for (let i = 0; i < 256; i += 1) {
    const code = buf.readUInt16LE(offset + i * 2);
    if (code === 0) break;
    text += String.fromCharCode(code);
  }
  return text;
}

function parseSchema(buf) {
  let offset = 20;
  const deviceInstanceId = readUtf16(buf, offset);
  offset += 512;
  const description = readUtf16(buf, offset);
  offset += 512;
  const manufacturer = readUtf16(buf, offset);
  offset += 512;
  const model = readUtf16(buf, offset);
  offset += 512;
  const serialNumber = readUtf16(buf, offset);
  offset += 512;
  return {
    unitId: buf.readUInt32LE(0),
    poolType: buf.readUInt32LE(4),
    factor: buf.readUInt32LE(8),
    sensorSubType: buf.readUInt32LE(12),
    capabilities: buf.readUInt32LE(16),
    deviceInstanceId,
    description,
    manufacturer,
    model,
    serialNumber,
    firmware: `${buf.readUInt32LE(offset)}.${buf.readUInt32LE(offset + 4)}`,
  };
}

function decodePointerBytes(pointer, size) {
  if (!pointer || size <= 0) return Buffer.alloc(0);
  return Buffer.from(koffi.decode(pointer, koffi.array('uint8', size)));
}

export function enumerateSensors() {
  const units = [null];
  const countOut = [0];
  const hr = WinBioEnumBiometricUnits(WINBIO_TYPE_FINGERPRINT, units, countOut);
  const code = hr >>> 0;
  if (failed(hr)) {
    return { ok: false, hresult: code, message: formatHresult(hr), sensors: [] };
  }

  const count = Number(countOut[0] ?? 0);
  const sensors = [];
  try {
    if (count > 0 && units[0]) {
      const bytes = decodePointerBytes(units[0], count * SCHEMA_SIZE);
      for (let i = 0; i < count; i += 1) {
        sensors.push(parseSchema(bytes.subarray(i * SCHEMA_SIZE, (i + 1) * SCHEMA_SIZE)));
      }
    }
  } finally {
    if (units[0]) WinBioFree(units[0]);
  }
  return { ok: true, hresult: code, message: 'Sensors enumerated.', sensors };
}

const ACCESS_DENIED = 0x80070005;
const LOCK_VIOLATION = 0x8009802a;

function openPool(flags) {
  const session = [0];
  const hr = WinBioOpenSession(
    WINBIO_TYPE_FINGERPRINT,
    WINBIO_POOL_SYSTEM,
    flags,
    null,
    0,
    null,
    session,
  );
  return { hr, handle: failed(hr) ? 0 : session[0] };
}

function closeSession(handle) {
  if (!handle) return;
  try { WinBioCloseSession(handle); } catch { /* already closed */ }
}

export function cancelSession(handle) {
  if (handle == null) return;
  try {
    WinBioCancel(handle);
  } catch {
    // The session may already have finished.
  }
}

function attemptRawCapture(unitId, onSession) {
  const opened = openPool(WINBIO_FLAG_RAW);
  if (failed(opened.hr)) {
    if ((opened.hr >>> 0) === ACCESS_DENIED) return null;
    return {
      ok: false,
      stage: 'open',
      hresult: opened.hr >>> 0,
      message: formatHresult(opened.hr),
      unitId,
      image: null,
      rawSession: true,
    };
  }

  const handle = opened.handle;
  onSession?.(handle);
  const capturedUnit = [0];
  const samplePtr = [null];
  const sampleSize = [0];
  const reject = [0];
  let hr = 0;
  let sampleBytes = 0;
  let quality = null;
  let image = null;
  let note = null;

  try {
    hr = WinBioCaptureSample(
      handle,
      WINBIO_NO_PURPOSE_AVAILABLE,
      WINBIO_DATA_FLAG_RAW,
      capturedUnit,
      samplePtr,
      sampleSize,
      reject,
    );
    if ((hr >>> 0) === ACCESS_DENIED) return null;

    const size = Number(sampleSize[0] ?? 0);
    if (!failed(hr) && samplePtr[0] && size > 0 && size <= MAX_SAMPLE_BYTES) {
      const bytes = decodePointerBytes(samplePtr[0], size);
      sampleBytes = bytes.length;
      const decoded = decodeFingerprint(bytes);
      quality = decoded.quality;
      note = decoded.note;
      if (!decoded.image) console.warn('[thumb]', note || 'no image', describeFingerprintSample(bytes));
      if (decoded.image) {
        const png = grayscaleToPng(
          decoded.image.width,
          decoded.image.height,
          contrastStretch(decoded.image.pixels),
        );
        image = {
          width: decoded.image.width,
          height: decoded.image.height,
          dpi: decoded.image.hRes || null,
          png: png.toString('base64'),
        };
      }
    }
  } finally {
    if (samplePtr[0]) {
      try { WinBioFree(samplePtr[0]); } catch { /* already released */ }
    }
    closeSession(handle);
  }

  const code = hr >>> 0;
  const ok = !failed(hr);
  const reason = Number(reject[0] ?? 0) & 0xffff;
  return {
    ok,
    stage: 'capture',
    hresult: code,
    message: ok ? 'Fingerprint captured.' : (REJECT[reason] || formatHresult(hr)),
    unitId: capturedUnit[0] || unitId,
    rejectDetail: reason,
    sampleBytes,
    quality,
    image,
    note,
    rawSession: true,
  };
}

function locateFinger(unitId, onSession) {
  const opened = openPool(WINBIO_FLAG_DEFAULT);
  if (failed(opened.hr)) {
    return {
      ok: false,
      stage: 'open',
      hresult: opened.hr >>> 0,
      message: formatHresult(opened.hr),
    };
  }

  const handle = opened.handle;
  onSession?.(handle);
  const detected = [0];
  let hr = 0;
  try {
    hr = WinBioLocateSensor(handle, detected);
  } finally {
    closeSession(handle);
  }

  const code = hr >>> 0;
  const ok = !failed(hr);
  return {
    ok,
    stage: 'locate',
    hresult: code,
    message: ok ? 'The reader detected your finger.' : formatHresult(hr),
    unitId: detected[0] || unitId,
    sampleBytes: 0,
    quality: null,
    image: null,
    note: ok
      ? 'Windows blocked the fingerprint picture for this account. The sensor still responded. Start the app from an Administrator terminal if you want the image as well.'
      : null,
    rawSession: false,
  };
}

const BLOCKED_PICTURE =
  'Windows only shares the thumb picture with an Administrator. Stop NSC-ERMS, start it again from an Administrator PowerShell with npm start, then capture the right thumb.';

/**
 * Foreground prompt first, then a system-pool raw capture of the U.are.U 4500.
 * A locate-only result is never treated as a saved thumb picture.
 */
export function captureRightThumbOnReader(onSession) {
  const focus = acquireReaderFocus();
  try {
    focus.nudge();
    const listed = enumerateSensors();
    if (!listed.ok) {
      return {
        ok: false,
        stage: 'enumerate',
        hresult: listed.hresult ?? null,
        message: listed.message,
        image: null,
      };
    }

    const sensor = chooseRightThumbSensor(listed.sensors);
    if (!sensor) {
      return {
        ok: false,
        stage: 'select',
        message: listed.sensors.length
          ? 'The U.are.U 4500 was not found. Another fingerprint sensor was left unused.'
          : 'Windows Biometric Framework does not see a U.are.U 4500 fingerprint reader.',
        image: null,
      };
    }

    focus.nudge();
    let raw = attemptRawCapture(sensor.unitId, onSession);
    if (raw && (raw.hresult >>> 0) === LOCK_VIOLATION) {
      focus.nudge();
      raw = attemptRawCapture(sensor.unitId, onSession);
    }
    if (!raw) {
      focus.nudge();
      const located = locateFinger(sensor.unitId, onSession);
      return {
        ok: false,
        stage: 'locate',
        hresult: located.ok ? ACCESS_DENIED : located.hresult,
        message: located.ok
          ? BLOCKED_PICTURE
          : `${BLOCKED_PICTURE} ${located.message || ''}`.trim(),
        unitId: located.unitId || sensor.unitId,
        image: null,
        rawSession: false,
      };
    }

    if (raw.ok && raw.image?.png) return raw;
    return {
      ...raw,
      ok: false,
      image: null,
      message: raw.ok
        ? (raw.note || 'The reader did not return a thumb picture.')
        : raw.message,
    };
  } finally {
    focus.release();
  }
}
