import type { AppState, CalendarBlock, TaskItem } from '../types/app';
import { clampBlockDuration, snapMinutes } from './calendarMath';
import { nextOccurrenceISO } from './syncMerge';

export interface CreateBlockInput {
  title: string;
  subject: CalendarBlock['subject'];
  date: string;
  startMinutes: number;
  durationMinutes: number;
  notes?: string;
  completed?: boolean;
  taskId?: string | null;
}

function makeId(prefix: string, now: number): string {
  return `${prefix}_${now}_${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Creates a calendar block directly on the grid and automatically creates a linked task
 * (or links to an existing task if taskId is provided).
 */
export function createBlockWithLinkedTask(
  state: AppState,
  input: CreateBlockInput,
  now: number = Date.now()
): AppState {
  const startMinutes = snapMinutes(input.startMinutes);
  const durationMinutes = clampBlockDuration(startMinutes, input.durationMinutes);
  const title = input.title.trim() || 'Focused Study Block';
  const blockId = makeId('blk', now);

  let taskId = input.taskId ?? null;
  let nextTasks = state.tasks;

  if (taskId) {
    const existing = state.tasks.find((t) => t.id === taskId && !t.deletedAt);
    if (existing) {
      // Remove any stale duplicate block previously linked to this task
      const nextBlocksClean = state.blocks.map((b) =>
        b.taskId === taskId && !b.deletedAt ? { ...b, deletedAt: now, updatedAt: now } : b
      );
      const newBlock: CalendarBlock = {
        id: blockId,
        title: existing.title,
        subject: existing.subject,
        date: input.date,
        startMinutes,
        durationMinutes: clampBlockDuration(startMinutes, existing.durationMinutes),
        taskId: existing.id,
        completed: existing.completed,
        notes: existing.notes,
        updatedAt: now,
      };
      nextTasks = state.tasks.map((t) =>
        t.id === taskId
          ? { ...t, dueDate: input.date, scheduledBlockId: blockId, updatedAt: now }
          : t
      );
      return {
        ...state,
        blocks: [...nextBlocksClean, newBlock],
        tasks: nextTasks,
        lastModified: now,
      };
    }
    taskId = null;
  }

  // Create brand-new linked task matching this calendar block
  taskId = makeId('tsk', now);
  const newTask: TaskItem = {
    id: taskId,
    title,
    subject: input.subject,
    durationMinutes,
    priority: 'medium',
    dueDate: input.date,
    recurrence: 'none',
    completed: Boolean(input.completed),
    completedAt: input.completed ? now : null,
    notes: input.notes ?? '',
    subtasks: [],
    scheduledBlockId: blockId,
    updatedAt: now,
  };

  const newBlock: CalendarBlock = {
    id: blockId,
    title,
    subject: input.subject,
    date: input.date,
    startMinutes,
    durationMinutes,
    taskId,
    completed: Boolean(input.completed),
    notes: input.notes ?? '',
    updatedAt: now,
  };

  return {
    ...state,
    blocks: [...state.blocks, newBlock],
    tasks: [newTask, ...nextTasks],
    lastModified: now,
  };
}

/**
 * Schedules an existing task onto the calendar (creating a linked block, or moving an existing linked block)
 * and updates the task's dueDate to match the scheduled date.
 */
export function scheduleTaskToCalendar(
  state: AppState,
  taskId: string,
  date: string,
  startMinutes: number,
  now: number = Date.now()
): AppState {
  const task = state.tasks.find((t) => t.id === taskId && !t.deletedAt);
  if (!task) return state;

  const snapped = snapMinutes(startMinutes);
  const durationMinutes = clampBlockDuration(snapped, task.durationMinutes);

  // Check if task already has an active linked block
  const existingBlock = task.scheduledBlockId
    ? state.blocks.find((b) => b.id === task.scheduledBlockId && !b.deletedAt)
    : state.blocks.find((b) => b.taskId === task.id && !b.deletedAt);

  if (existingBlock) {
    return {
      ...state,
      blocks: state.blocks.map((b) =>
        b.id === existingBlock.id
          ? {
              ...b,
              date,
              startMinutes: snapped,
              durationMinutes,
              title: task.title,
              subject: task.subject,
              completed: task.completed,
              notes: task.notes,
              updatedAt: now,
            }
          : b
      ),
      tasks: state.tasks.map((t) =>
        t.id === task.id
          ? { ...t, dueDate: date, scheduledBlockId: existingBlock.id, updatedAt: now }
          : t
      ),
      lastModified: now,
    };
  }

  return createBlockWithLinkedTask(
    state,
    {
      title: task.title,
      subject: task.subject,
      date,
      startMinutes: snapped,
      durationMinutes,
      notes: task.notes,
      completed: task.completed,
      taskId: task.id,
    },
    now
  );
}

/**
 * Updates a calendar block and propagates title, subject, durationMinutes, date, notes, and completion
 * directly to its linked task.
 */
export function updateBlockSynced(
  state: AppState,
  blockId: string,
  patch: Partial<CalendarBlock>,
  now: number = Date.now()
): AppState {
  const target = state.blocks.find((b) => b.id === blockId && !b.deletedAt);
  if (!target) return state;

  const nextStart =
    patch.startMinutes !== undefined ? snapMinutes(patch.startMinutes) : target.startMinutes;
  const nextDur =
    patch.durationMinutes !== undefined
      ? clampBlockDuration(nextStart, patch.durationMinutes)
      : clampBlockDuration(nextStart, target.durationMinutes);

  const updatedBlock: CalendarBlock = {
    ...target,
    ...patch,
    startMinutes: nextStart,
    durationMinutes: nextDur,
    updatedAt: now,
  };

  let nextTasks = state.tasks;
  if (updatedBlock.taskId) {
    nextTasks = state.tasks.map((t) => {
      if (t.id !== updatedBlock.taskId || t.deletedAt) return t;
      const completedChanged =
        patch.completed !== undefined && patch.completed !== t.completed;
      return {
        ...t,
        title: updatedBlock.title,
        subject: updatedBlock.subject,
        durationMinutes: updatedBlock.durationMinutes,
        dueDate: updatedBlock.date,
        notes: updatedBlock.notes,
        completed: updatedBlock.completed ?? t.completed,
        completedAt: completedChanged
          ? updatedBlock.completed
            ? now
            : null
          : t.completedAt,
        updatedAt: now,
      };
    });
  }

  return {
    ...state,
    blocks: state.blocks.map((b) => (b.id === blockId ? updatedBlock : b)),
    tasks: nextTasks,
    lastModified: now,
  };
}

/**
 * Deletes (tombstones) a calendar block and also tombstones its linked task so deletions
 * propagate cleanly across devices via Firestore without orphaned records.
 */
export function deleteBlockSynced(
  state: AppState,
  blockId: string,
  now: number = Date.now()
): AppState {
  const target = state.blocks.find((b) => b.id === blockId);
  if (!target) return state;

  const nextBlocks = state.blocks.map((b) =>
    b.id === blockId ? { ...b, deletedAt: now, updatedAt: now } : b
  );
  const nextTasks = target.taskId
    ? state.tasks.map((t) =>
        t.id === target.taskId || t.scheduledBlockId === blockId
          ? { ...t, deletedAt: now, scheduledBlockId: null, updatedAt: now }
          : t
      )
    : state.tasks;

  return {
    ...state,
    blocks: nextBlocks,
    tasks: nextTasks,
    lastModified: now,
  };
}

/**
 * Updates a task and propagates title, subject, durationMinutes, dueDate, notes, and completion
 * directly to its linked calendar block(s).
 */
export function updateTaskSynced(
  state: AppState,
  taskId: string,
  patch: Partial<TaskItem>,
  now: number = Date.now()
): AppState {
  const target = state.tasks.find((t) => t.id === taskId && !t.deletedAt);
  if (!target) return state;

  const updatedTask: TaskItem = {
    ...target,
    ...patch,
    updatedAt: now,
  };

  const nextBlocks = state.blocks.map((b) => {
    if (b.deletedAt) return b;
    if (b.taskId !== taskId && b.id !== updatedTask.scheduledBlockId) return b;
    return {
      ...b,
      title: updatedTask.title,
      subject: updatedTask.subject,
      durationMinutes: clampBlockDuration(b.startMinutes, updatedTask.durationMinutes),
      date: updatedTask.dueDate,
      completed: updatedTask.completed,
      notes: updatedTask.notes,
      updatedAt: now,
    };
  });

  return {
    ...state,
    tasks: state.tasks.map((t) => (t.id === taskId ? updatedTask : t)),
    blocks: nextBlocks,
    lastModified: now,
  };
}

/**
 * Toggles a task's completion status, syncs to its linked calendar block, and spawns the next
 * occurrence if the task is recurring.
 */
export function toggleTaskSynced(
  state: AppState,
  taskId: string,
  now: number = Date.now()
): AppState {
  const target = state.tasks.find((t) => t.id === taskId && !t.deletedAt);
  if (!target) return state;

  const nowCompleted = !target.completed;
  const intermediate = updateTaskSynced(
    state,
    taskId,
    {
      completed: nowCompleted,
      completedAt: nowCompleted ? now : null,
    },
    now
  );

  if (nowCompleted && target.recurrence !== 'none') {
    const nextDue = nextOccurrenceISO(target.dueDate, target.recurrence);
    const nextTask: TaskItem = {
      ...target,
      id: makeId('tsk', now),
      dueDate: nextDue,
      completed: false,
      completedAt: null,
      scheduledBlockId: null,
      subtasks: target.subtasks.map((s) => ({ ...s, done: false })),
      updatedAt: now,
    };
    return {
      ...intermediate,
      tasks: [nextTask, ...intermediate.tasks],
      lastModified: now,
    };
  }

  return intermediate;
}

/**
 * Deletes (tombstones) a task and also tombstones its linked calendar block(s).
 */
export function deleteTaskSynced(
  state: AppState,
  taskId: string,
  now: number = Date.now()
): AppState {
  const target = state.tasks.find((t) => t.id === taskId);
  if (!target) return state;

  return {
    ...state,
    tasks: state.tasks.map((t) =>
      t.id === taskId ? { ...t, deletedAt: now, updatedAt: now } : t
    ),
    blocks: state.blocks.map((b) =>
      b.taskId === taskId || b.id === target.scheduledBlockId
        ? { ...b, deletedAt: now, updatedAt: now }
        : b
    ),
    lastModified: now,
  };
}

/**
 * Ensures bidirectional pointer integrity after multi-device merges:
 * - Deduplicates multiple blocks pointing to the same taskId (keeps latest updatedAt).
 * - Clears dangling scheduledBlockId pointers if the linked block was tombstoned.
 */
export function reconcileTaskBlockLinks(state: AppState): AppState {
  const activeBlockById = new Map<string, CalendarBlock>();
  const latestBlockByTaskId = new Map<string, CalendarBlock>();

  for (const b of state.blocks) {
    if (b.deletedAt) continue;
    activeBlockById.set(b.id, b);
    if (b.taskId) {
      const existing = latestBlockByTaskId.get(b.taskId);
      if (!existing || b.updatedAt >= existing.updatedAt) {
        latestBlockByTaskId.set(b.taskId, b);
      }
    }
  }

  const keepBlockIds = new Set(Array.from(latestBlockByTaskId.values()).map((b) => b.id));
  const cleanedBlocks = state.blocks.map((b) => {
    if (!b.deletedAt && b.taskId && !keepBlockIds.has(b.id)) {
      return { ...b, deletedAt: b.updatedAt };
    }
    return b;
  });

  const activeTaskIds = new Set(state.tasks.filter((t) => !t.deletedAt).map((t) => t.id));
  const finalBlocks = cleanedBlocks.map((b) => {
    if (!b.deletedAt && b.taskId && !activeTaskIds.has(b.taskId)) {
      return { ...b, deletedAt: b.updatedAt };
    }
    return b;
  });

  const activeFinalBlockIds = new Set(finalBlocks.filter((b) => !b.deletedAt).map((b) => b.id));
  const finalTasks = state.tasks.map((t) => {
    if (t.deletedAt) return t;
    const matched = latestBlockByTaskId.get(t.id);
    if (matched && activeFinalBlockIds.has(matched.id)) {
      return t.scheduledBlockId === matched.id ? t : { ...t, scheduledBlockId: matched.id };
    }
    if (t.scheduledBlockId && !activeFinalBlockIds.has(t.scheduledBlockId)) {
      return { ...t, scheduledBlockId: null };
    }
    return t;
  });

  return {
    ...state,
    blocks: finalBlocks,
    tasks: finalTasks,
  };
}
