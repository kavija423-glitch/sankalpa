import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialAppState } from '../data/initialSeed';
import {
  buildManualStudySession,
  computeRangeFromDurationMode,
  computeTaskLoggedMinutesMap,
  draftFromExistingManualSession,
  getDefaultManualSessionWindow,
  validateManualSessionDraft,
} from './manualSession';

test('getDefaultManualSessionWindow produces a 1-hour block ending at current time', () => {
  const now = new Date(2026, 10, 18, 16, 40, 0, 0);
  const win = getDefaultManualSessionWindow(now);
  assert.equal(win.date, '2026-11-18');
  assert.equal(win.startTime, '15:40');
  assert.equal(win.endTime, '16:40');
  assert.equal(win.durationMinutes, 60);
  assert.equal(win.hours, 1);
  assert.equal(win.minutes, 0);
});

test('validateManualSessionDraft rejects future dates, <=0 duration, and end before start', () => {
  const base = {
    subject: 'physics' as const,
    title: 'Wave Optics',
    taskId: null,
    date: '2026-11-18',
    startTime: '14:00',
    endTime: '15:30',
    hours: 1,
    minutes: 30,
    timeMode: 'range' as const,
    durationAnchor: 'end' as const,
    notes: '',
  };

  assert.equal(validateManualSessionDraft(base, '2026-11-18').valid, true);
  assert.equal(validateManualSessionDraft(base, '2026-11-18').durationMinutes, 90);

  // Future date rejected
  assert.equal(
    validateManualSessionDraft({ ...base, date: '2026-11-19' }, '2026-11-18').valid,
    false
  );

  // End before start rejected
  assert.equal(
    validateManualSessionDraft({ ...base, startTime: '16:00', endTime: '15:00' }, '2026-11-18').valid,
    false
  );

  // Zero duration rejected in duration mode
  assert.equal(
    validateManualSessionDraft(
      { ...base, timeMode: 'duration', hours: 0, minutes: 0 },
      '2026-11-18'
    ).valid,
    false
  );

  // Missing subject rejected
  assert.equal(
    validateManualSessionDraft({ ...base, subject: '' }, '2026-11-18').valid,
    false
  );
});

test('computeRangeFromDurationMode computes start and end timestamps from end anchor', () => {
  const res = computeRangeFromDurationMode(1, 30, 'end', '16:40');
  assert.equal(res.error, null);
  assert.equal(res.durationMinutes, 90);
  assert.equal(res.endMinutes, 16 * 60 + 40);
  assert.equal(res.startMinutes, 15 * 60 + 10);
});

test('buildManualStudySession defaults blank title to subject label and sets canonical metadata', () => {
  const seed = createInitialAppState();
  const ses = buildManualStudySession(
    {
      subject: 'maths',
      title: '   ',
      taskId: 'tsk_123',
      date: '2026-11-17',
      startMinutes: 9 * 60 + 15,
      endMinutes: 10 * 60 + 45,
      notes: 'Completed Integration Q1-Q5',
    },
    seed.subjects,
    undefined,
    1700000000000
  );

  assert.equal(ses.isManual, true);
  assert.equal(ses.mode, 'manual');
  assert.equal(ses.title, 'Combined Maths');
  assert.equal(ses.subjectId, 'maths');
  assert.equal(ses.subjectName, 'Combined Maths');
  assert.equal(ses.durationMinutes, 90);
  assert.equal(ses.durationSeconds, 5400);
  assert.equal(ses.taskId, 'tsk_123');
  assert.equal(ses.createdAt, 1700000000000);
  assert.ok(ses.startTime && ses.endTime);

  const editedDraft = draftFromExistingManualSession(ses);
  assert.equal(editedDraft.startTime, '09:15');
  assert.equal(editedDraft.endTime, '10:45');
  assert.equal(editedDraft.hours, 1);
  assert.equal(editedDraft.minutes, 30);
});

test('computeTaskLoggedMinutesMap totals active linked sessions and ignores tombstoned sessions', () => {
  const seed = createInitialAppState();
  const s1 = buildManualStudySession(
    {
      subject: 'physics',
      title: 'Hydrostatics',
      taskId: 'tsk_p1',
      date: '2026-11-18',
      startMinutes: 600,
      endMinutes: 645,
      notes: '',
    },
    seed.subjects
  );
  const s2 = buildManualStudySession(
    {
      subject: 'physics',
      title: 'Hydrostatics part 2',
      taskId: 'tsk_p1',
      date: '2026-11-18',
      startMinutes: 700,
      endMinutes: 730,
      notes: '',
    },
    seed.subjects
  );
  s2.deletedAt = Date.now();

  const map = computeTaskLoggedMinutesMap([s1, s2]);
  assert.equal(map.get('tsk_p1'), 45);
});
