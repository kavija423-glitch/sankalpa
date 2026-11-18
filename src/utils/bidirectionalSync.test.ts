import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialAppState } from '../data/initialSeed';
import {
  createBlockWithLinkedTask,
  deleteBlockSynced,
  deleteTaskSynced,
  scheduleTaskToCalendar,
  toggleTaskSynced,
  updateBlockSynced,
  updateTaskSynced,
} from './bidirectionalSync';
import { mergeAppState } from './syncMerge';

test('initial state starts completely clean without seeded demo items', () => {
  const fresh = createInitialAppState();
  assert.equal(fresh.tasks.length, 0);
  assert.equal(fresh.blocks.length, 0);
  assert.equal(fresh.sessions.length, 0);
  assert.equal(fresh.papers.length, 0);
  assert.equal(fresh.examCountdowns.length, 0);
  assert.ok(fresh.syllabus.length > 0);
  for (const unit of fresh.syllabus) {
    for (const sub of unit.subtopics) {
      assert.equal(sub.mastery, 'not_started');
      assert.equal(sub.revisionCount, 0);
    }
  }
});

test('creating a calendar block automatically creates a linked task and syncs edits both ways', () => {
  let state = createInitialAppState();
  state = createBlockWithLinkedTask(
    state,
    {
      title: '2024 Physics Essay Practice',
      subject: 'physics',
      date: '2026-11-18',
      startMinutes: 510, // 08:30
      durationMinutes: 60,
    },
    1000
  );

  assert.equal(state.blocks.length, 1);
  assert.equal(state.tasks.length, 1);

  const block = state.blocks[0];
  const task = state.tasks[0];
  assert.equal(block.taskId, task.id);
  assert.equal(task.scheduledBlockId, block.id);
  assert.equal(task.dueDate, '2026-11-18');
  assert.equal(task.durationMinutes, 60);

  // Edit task -> updates linked block
  state = updateTaskSynced(
    state,
    task.id,
    { title: 'Physics Mechanics Essay', durationMinutes: 90, dueDate: '2026-11-19' },
    2000
  );
  assert.equal(state.blocks[0].title, 'Physics Mechanics Essay');
  assert.equal(state.blocks[0].durationMinutes, 90);
  assert.equal(state.blocks[0].date, '2026-11-19');

  // Edit/move/complete block -> updates linked task
  state = updateBlockSynced(
    state,
    block.id,
    { date: '2026-11-20', startMinutes: 600, durationMinutes: 75, completed: true },
    3000
  );
  assert.equal(state.tasks[0].dueDate, '2026-11-20');
  assert.equal(state.tasks[0].durationMinutes, 75);
  assert.equal(state.tasks[0].completed, true);
});

test('scheduling an existing task creates one linked block without duplicating on reschedule', () => {
  let state = createInitialAppState();
  state = {
    ...state,
    tasks: [
      {
        id: 't_1',
        title: 'ICT SQL Normalization',
        subject: 'ict',
        durationMinutes: 45,
        priority: 'high',
        dueDate: '2026-11-18',
        recurrence: 'none',
        completed: false,
        completedAt: null,
        notes: '',
        subtasks: [],
        scheduledBlockId: null,
        updatedAt: 1000,
      },
    ],
  };

  state = scheduleTaskToCalendar(state, 't_1', '2026-11-21', 540, 2000);
  assert.equal(state.blocks.filter((b) => !b.deletedAt).length, 1);
  assert.equal(state.tasks[0].dueDate, '2026-11-21');
  assert.ok(state.tasks[0].scheduledBlockId);

  // Rescheduling moves existing block instead of creating a duplicate
  state = scheduleTaskToCalendar(state, 't_1', '2026-11-22', 630, 3000);
  assert.equal(state.blocks.filter((b) => !b.deletedAt).length, 1);
  assert.equal(state.blocks[0].date, '2026-11-22');
  assert.equal(state.blocks[0].startMinutes, 630);
  assert.equal(state.tasks[0].dueDate, '2026-11-22');
});

test('deleting block tombstones linked task and merges cleanly across devices without resurrection', () => {
  const base = createInitialAppState();
  const deviceA = createBlockWithLinkedTask(
    base,
    {
      title: 'Combined Maths Pure Part B',
      subject: 'maths',
      date: '2026-11-18',
      startMinutes: 480,
      durationMinutes: 60,
    },
    1000
  );
  // Device B received the initial state
  const deviceB = structuredClone(deviceA);

  // Device A deletes the calendar block (which tombstones both block and linked task)
  const deviceAAfterDelete = deleteBlockSynced(deviceA, deviceA.blocks[0].id, 5000);
  assert.ok(deviceAAfterDelete.blocks[0].deletedAt);
  assert.ok(deviceAAfterDelete.tasks[0].deletedAt);

  // Device B syncs with Device A -> tombstones must win and leave 0 active tasks/blocks
  const merged = mergeAppState(deviceB, deviceAAfterDelete);
  assert.equal(merged.blocks.filter((b) => !b.deletedAt).length, 0);
  assert.equal(merged.tasks.filter((t) => !t.deletedAt).length, 0);

  // Also test deleting task tombstones linked block
  let s2 = createBlockWithLinkedTask(
    base,
    {
      title: 'Optics',
      subject: 'physics',
      date: '2026-11-18',
      startMinutes: 480,
      durationMinutes: 60,
    },
    1000
  );
  s2 = toggleTaskSynced(s2, s2.tasks[0].id, 2000);
  assert.equal(s2.blocks[0].completed, true);
  s2 = deleteTaskSynced(s2, s2.tasks[0].id, 3000);
  assert.ok(s2.blocks[0].deletedAt);
});
