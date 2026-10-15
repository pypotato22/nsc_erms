import assert from 'node:assert/strict';
import test from 'node:test';
import { chooseRightThumbSensor } from './choose.js';

test('uses the U.are.U 4500 when a laptop sensor is also listed', () => {
  const chosen = chooseRightThumbSensor([
    {
      unitId: 1,
      deviceInstanceId: 'ACPI\\ELAN0C00\\1',
      description: 'ELAN Fingerprint',
    },
    {
      unitId: 2,
      deviceInstanceId: 'USB\\VID_05BA&PID_000A&REV_0103\\6&ABC',
      description: 'U.are.U 4500 Fingerprint Reader (WBF)',
    },
  ]);
  assert.equal(chosen.unitId, 2);
});

test('does not select a laptop sensor when the 4500 is unplugged', () => {
  const chosen = chooseRightThumbSensor([
    {
      unitId: 1,
      deviceInstanceId: 'ACPI\\ELAN0C00\\1',
      description: 'ELAN Fingerprint',
    },
  ]);
  assert.equal(chosen, null);
});

test('matches a 4500 description when the instance id is not USB-shaped', () => {
  const chosen = chooseRightThumbSensor([
    {
      unitId: 4,
      deviceInstanceId: 'SWD\\SENSOR\\1',
      description: 'DigitalPersona U.are.U 4500',
    },
  ]);
  assert.equal(chosen.unitId, 4);
});
