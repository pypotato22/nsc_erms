/**
 * The PDS right-thumb picture comes from the U.are.U 4500 only.
 * A laptop fingerprint sensor is ignored when the 4500 is present,
 * and it is not used when the 4500 is absent either.
 */
export function isUareu4500(sensor) {
  const id = String(sensor?.deviceInstanceId || '').toUpperCase();
  const description = String(sensor?.description || '');
  return id.includes('VID_05BA&PID_000A') || /U\.are\.U\s*4500/i.test(description);
}

export function chooseRightThumbSensor(sensors) {
  return (sensors || []).find(isUareu4500) || null;
}
