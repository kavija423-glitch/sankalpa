import type { AppState, SyllabusUnit, TaskItem } from '../types/app';
import { addDaysISO, toISODateLocal } from './nlpTaskParser';

interface Timestamped {
  id: string;
  updatedAt: number;
}

export function mergeByTimestamp<T extends Timestamped>(localItems: T[], remoteItems: T[]): T[] {
  const map = new Map<string, T>();
  for (const item of localItems) {
    map.set(item.id, item);
  }
  for (const remote of remoteItems) {
    const existing = map.get(remote.id);
    if (!existing || remote.updatedAt >= existing.updatedAt) {
      map.set(remote.id, remote);
    }
  }
  return Array.from(map.values());
}

function mergeSyllabusUnits(localUnits: SyllabusUnit[], remoteUnits: SyllabusUnit[]): SyllabusUnit[] {
  const map = new Map<string, SyllabusUnit>();
  for (const unit of localUnits) {
    map.set(unit.id, unit);
  }
  for (const remoteUnit of remoteUnits) {
    const localUnit = map.get(remoteUnit.id);
    if (!localUnit) {
      map.set(remoteUnit.id, remoteUnit);
      continue;
    }
    map.set(remoteUnit.id, {
      ...localUnit,
      subtopics: mergeByTimestamp(localUnit.subtopics, remoteUnit.subtopics),
    });
  }
  return Array.from(map.values());
}

export function mergeAppState(local: AppState, remote: AppState): AppState {
  const newerSettings =
    remote.settings.updatedAt >= local.settings.updatedAt ? remote.settings : local.settings;

  const newerTimer =
    remote.lastModified > local.lastModified ? remote.activeTimer : local.activeTimer;

  return {
    version: Math.max(local.version, remote.version),
    subjects: remote.lastModified > local.lastModified ? remote.subjects : local.subjects,
    tasks: mergeByTimestamp(local.tasks, remote.tasks),
    blocks: mergeByTimestamp(local.blocks, remote.blocks),
    sessions: mergeByTimestamp(local.sessions, remote.sessions),
    papers: mergeByTimestamp(local.papers, remote.papers),
    syllabus: mergeSyllabusUnits(local.syllabus, remote.syllabus),
    examCountdowns:
      remote.lastModified > local.lastModified ? remote.examCountdowns : local.examCountdowns,
    settings: {
      ...newerSettings,
      // Preserve local firebaseConfigJson if remote doesn't carry one
      firebaseConfigJson: local.settings.firebaseConfigJson || remote.settings.firebaseConfigJson,
    },
    activeTimer: newerTimer,
    lastModified: Math.max(local.lastModified, remote.lastModified),
  };
}

export function nextOccurrenceISO(fromISO: string, rule: TaskItem['recurrence']): string {
  if (rule === 'daily') return addDaysISO(fromISO, 1);
  if (rule === 'weekly') return addDaysISO(fromISO, 7);
  if (rule === 'weekdays') {
    let candidate = addDaysISO(fromISO, 1);
    while (true) {
      const [y, m, d] = candidate.split('-').map(Number);
      const day = new Date(y, (m || 1) - 1, d || 1).getDay();
      if (day !== 0 && day !== 6) return candidate;
      candidate = addDaysISO(candidate, 1);
    }
  }
  return fromISO;
}

/**
 * Auto-rolls incomplete past-due recurring tasks up to today (or next weekday if weekday-only).
 */
export function rolloverRecurringTasks(tasks: TaskItem[], now: Date = new Date()): TaskItem[] {
  const todayISO = toISODateLocal(now);
  const nowMs = now.getTime();
  return tasks.map((task) => {
    if (task.recurrence === 'none' || task.completed) return task;
    if (task.dueDate >= todayISO) return task;

    let nextDate = task.dueDate;
    let safety = 0;
    while (nextDate < todayISO && safety < 400) {
      nextDate = nextOccurrenceISO(nextDate, task.recurrence);
      safety++;
    }
    return {
      ...task,
      dueDate: nextDate,
      updatedAt: nowMs,
    };
  });
}
