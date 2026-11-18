import test from 'node:test';
import assert from 'node:assert/strict';
import {
  snapMinutes,
  clampBlockDuration,
  computeDragSelectionRange,
  formatTime24,
  formatClockTimer,
  computeOverlapLayout,
  getWeekDaysISO,
  mergeRecordedSessionsForCalendar,
} from './calendarMath';
import type { StudySession } from '../types/app';

function makeSession(
  id: string,
  startHour: number,
  startMin: number,
  durationMinutes: number,
  subject: StudySession['subject'] = 'physics',
  deletedAt?: number
): StudySession {
  const startDt = new Date(2026, 10, 18, startHour, startMin, 0, 0);
  const startTimestamp = startDt.getTime();
  const endTimestamp = startTimestamp + durationMinutes * 60_000;
  return {
    id,
    title: `Session ${id}`,
    subject,
    mode: 'pomodoro_25',
    date: '2026-11-18',
    startTimestamp,
    endTimestamp,
    durationMinutes,
    rating: 4,
    notes: '',
    taskId: null,
    blockId: null,
    isManual: false,
    updatedAt: startTimestamp,
    ...(deletedAt ? { deletedAt } : {}),
  };
}

test('snaps minutes to 15-minute increments within 00:00-23:45', () => {
  assert.equal(snapMinutes(368), 375); // 06:08 -> 06:15
  assert.equal(snapMinutes(-10), 0);
  assert.equal(snapMinutes(1439), 1425);
  assert.equal(clampBlockDuration(1400, 90), 40);
});

test('computeDragSelectionRange supports downward, upward, and minimum 15m drags', () => {
  // Downward: 08:30 (510) -> 10:15 (615) => 1h 45m (105m)
  const down = computeDragSelectionRange(510, 615);
  assert.deepEqual(down, { startMinutes: 510, endMinutes: 615, durationMinutes: 105 });

  // Upward: 10:15 (615) -> 08:30 (510) => 08:30 - 10:15 (105m)
  const up = computeDragSelectionRange(615, 510);
  assert.deepEqual(up, { startMinutes: 510, endMinutes: 615, durationMinutes: 105 });

  // Single slot / zero movement enforces minimum 15m
  const min = computeDragSelectionRange(510, 512);
  assert.deepEqual(min, { startMinutes: 510, endMinutes: 525, durationMinutes: 15 });

  // Bottom of day clamp (23:45 -> 24:00)
  const endOfDay = computeDragSelectionRange(1425, 1455);
  assert.deepEqual(endOfDay, { startMinutes: 1425, endMinutes: 1440, durationMinutes: 15 });
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

test('mergeRecordedSessionsForCalendar merges adjacent (<=15m) and overlapping sessions chronologically', () => {
  // Out-of-order input: 24m (10:25-10:49), 4m (10:00-10:04), 13m (10:06-10:19)
  // Plus a session 16m later (11:05-11:20) that stays separate, and a soft-deleted session ignored
  const s1 = makeSession('s1', 10, 0, 4, 'physics');
  const s2 = makeSession('s2', 10, 6, 13, 'ict');
  const s3 = makeSession('s3', 10, 25, 24, 'ict');
  const s4 = makeSession('s4', 11, 5, 15, 'maths'); // gap = 16m > 15m
  const sDeleted = makeSession('sDel', 10, 10, 20, 'physics', Date.now());

  const groups = mergeRecordedSessionsForCalendar([s3, s4, s1, sDeleted, s2], 15);
  assert.equal(groups.length, 2);

  // Group 1: 10:00 -> 10:49, combined duration = 4 + 13 + 24 = 41m, primary subject = ict (37m vs 4m)
  assert.equal(groups[0].startMinutes, 600);
  assert.equal(groups[0].endMinutes, 649);
  assert.equal(groups[0].spanMinutes, 49);
  assert.equal(groups[0].totalDurationMinutes, 41);
  assert.equal(groups[0].primarySubject, 'ict');
  assert.deepEqual(
    groups[0].sessions.map((s) => s.id),
    ['s1', 's2', 's3']
  );

  // Group 2: 11:05 -> 11:20
  assert.equal(groups[1].startMinutes, 665);
  assert.equal(groups[1].totalDurationMinutes, 15);
  assert.equal(groups[1].sessions.length, 1);

  // Overlapping sessions merge and compute earliest start to latest end
  const o1 = makeSession('o1', 14, 0, 20, 'maths');
  const o2 = makeSession('o2', 14, 10, 25, 'maths');
  const overlapGroups = mergeRecordedSessionsForCalendar([o2, o1], 15);
  assert.equal(overlapGroups.length, 1);
  assert.equal(overlapGroups[0].startMinutes, 840);
  assert.equal(overlapGroups[0].endMinutes, 875);
  assert.equal(overlapGroups[0].totalDurationMinutes, 45);
});

