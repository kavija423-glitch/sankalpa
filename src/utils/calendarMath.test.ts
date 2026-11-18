import test from 'node:test';
import assert from 'node:assert/strict';
import {
  snapMinutes,
  clampBlockDuration,
  formatTime24,
  formatClockTimer,
  computeOverlapLayout,
  getWeekDaysISO,
} from './calendarMath';

test('snaps minutes to 15-minute increments within 00:00-23:45', () => {
  assert.equal(snapMinutes(368), 375); // 06:08 -> 06:15
  assert.equal(snapMinutes(-10), 0);
  assert.equal(snapMinutes(1439), 1425);
  assert.equal(clampBlockDuration(1400, 90), 40);
});

test('formats 24h time and clock timer cleanly', () => {
  assert.equal(formatTime24(360), '06:00');
  assert.equal(formatTime24(1440), '24:00');
  assert.equal(formatClockTimer(1500_000), '25:00');
  assert.equal(formatClockTimer(3665_000), '01:01:05');
});

test('computes non-overlapping horizontal columns for concurrent blocks', () => {
  const laidOut = computeOverlapLayout([
    { id: 'a', startMinutes: 540, durationMinutes: 60 },
    { id: 'b', startMinutes: 570, durationMinutes: 60 },
    { id: 'c', startMinutes: 660, durationMinutes: 30 },
  ]);

  const byId = Object.fromEntries(laidOut.map((x) => [x.item.id, x]));
  assert.equal(byId.a.totalColumns, 2);
  assert.equal(byId.b.totalColumns, 2);
  assert.notEqual(byId.a.column, byId.b.column);
  assert.equal(byId.c.totalColumns, 1);
  assert.equal(byId.c.column, 0);
});

test('returns 7 Monday-Sunday ISO dates for a week', () => {
  const days = getWeekDaysISO('2026-11-17'); // Tuesday
  assert.equal(days.length, 7);
  assert.equal(days[0], '2026-11-16'); // Monday
  assert.equal(days[6], '2026-11-22'); // Sunday
});
