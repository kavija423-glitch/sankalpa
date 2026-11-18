import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampDragCoordinates,
  computeNearestCorner,
  getCornerCoordinates,
} from './floatingTimerMath.ts';

test('computeNearestCorner snaps to the closest quadrant center', () => {
  assert.equal(computeNearestCorner(200, 120, 1440, 900), 'top-left');
  assert.equal(computeNearestCorner(1100, 120, 1440, 900), 'top-right');
  assert.equal(computeNearestCorner(200, 720, 1440, 900), 'bottom-left');
  assert.equal(computeNearestCorner(1100, 720, 1440, 900), 'bottom-right');
});

test('getCornerCoordinates respects 16px safe margin and clamps inside small viewports', () => {
  const br = getCornerCoordinates('bottom-right', 260, 48, 1440, 900, 16);
  assert.deepEqual(br, { left: 1164, top: 836 });

  const tl = getCornerCoordinates('top-left', 260, 48, 1440, 900, 16);
  assert.deepEqual(tl, { left: 16, top: 16 });

  const tiny = getCornerCoordinates('bottom-right', 300, 60, 250, 200, 16);
  assert.deepEqual(tiny, { left: 16, top: 124 });
});

test('clampDragCoordinates keeps floating widget strictly within viewport margins', () => {
  const clampedNegative = clampDragCoordinates(-50, -20, 240, 48, 1440, 900, 8);
  assert.deepEqual(clampedNegative, { left: 8, top: 8 });

  const clampedOverflow = clampDragCoordinates(1400, 890, 240, 48, 1440, 900, 8);
  assert.deepEqual(clampedOverflow, { left: 1192, top: 844 });
});
