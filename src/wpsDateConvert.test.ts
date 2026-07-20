import assert from 'node:assert/strict';
import test from 'node:test';
import { convertWpsDateValue } from './wpsDateConvert';

test('converts WPS date formats without falling back to today', () => {
  assert.equal(convertWpsDateValue('不是日期'), '');
  assert.equal(convertWpsDateValue('45672').slice(0, 10), '2025-01-15');
  assert.match(convertWpsDateValue('2026年7月20日 08时30分'), /^2026-07-20T/);
});
