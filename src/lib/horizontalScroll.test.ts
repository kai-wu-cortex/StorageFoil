import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getHorizontalWheelDelta,
  hasHorizontalDragStarted,
} from './horizontalScroll';

test('converts a vertical mouse wheel gesture into horizontal movement', () => {
  assert.equal(getHorizontalWheelDelta({ deltaX: 0, deltaY: 120 }), 120);
  assert.equal(getHorizontalWheelDelta({ deltaX: 0, deltaY: -80 }), -80);
});

test('keeps a touchpad horizontal gesture on its native horizontal axis', () => {
  assert.equal(getHorizontalWheelDelta({ deltaX: 64, deltaY: 8 }), 64);
  assert.equal(getHorizontalWheelDelta({ deltaX: -42, deltaY: 4 }), -42);
});

test('starts drag scrolling only after a small movement threshold', () => {
  assert.equal(hasHorizontalDragStarted(100, 103), false);
  assert.equal(hasHorizontalDragStarted(100, 105), true);
  assert.equal(hasHorizontalDragStarted(100, 94), true);
});
