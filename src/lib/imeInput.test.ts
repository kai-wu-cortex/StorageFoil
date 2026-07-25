import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldPublishImeInput } from './imeInput.ts';

test('does not publish intermediate IME composition text', () => {
  assert.equal(shouldPublishImeInput(true, true), false);
  assert.equal(shouldPublishImeInput(true, false), false);
  assert.equal(shouldPublishImeInput(false, true), false);
});

test('publishes ordinary typing and committed IME text', () => {
  assert.equal(shouldPublishImeInput(false, false), true);
});
