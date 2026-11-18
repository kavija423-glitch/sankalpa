import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeByTimestamp, rolloverRecurringTasks } from './syncMerge';
import type { TaskItem } from '../types/app';

test('mergeByTimestamp keeps the newer item by updatedAt', () => {
  const local = [
    { id: '1', title: 'Old Local', updatedAt: 100 },
    { id: '2', title: 'Newer Local', updatedAt: 500 },
  ];
  const remote = [
    { id: '1', title: 'Newer Remote', updatedAt: 200 },
    { id: '2', title: 'Stale Remote', updatedAt: 300 },
    { id: '3', title: 'Remote Only', updatedAt: 150 },
  ];
  const merged = mergeByTimestamp(local, remote);
  const byId = Object.fromEntries(merged.map((x) => [x.id, x]));
  assert.equal(merged.length, 3);
  assert.equal(byId['1'].title, 'Newer Remote');
  assert.equal(byId['2'].title, 'Newer Local');
  assert.equal(byId['3'].title, 'Remote Only');
});

test('rolloverRecurringTasks advances past-due incomplete weekday tasks to today', () => {
  const ref = new Date(2026, 10, 17, 9, 0, 0); // Tuesday 2026-11-17
  const tasks: TaskItem[] = [
    {
      id: 't1',
      title: 'Daily Physics MCQ',
      subject: 'physics',
      durationMinutes: 30,
      priority: 'high',
      dueDate: '2026-11-13', // Friday
      recurrence: 'weekdays',
      completed: false,
      completedAt: null,
      notes: '',
      subtasks: [],
      scheduledBlockId: null,
      updatedAt: 100,
    },
  ];
  const rolled = rolloverRecurringTasks(tasks, ref);
  assert.equal(rolled[0].dueDate, '2026-11-17');
});
