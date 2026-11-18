import { DEFAULT_FIREBASE_CONFIG_JSON } from '../data/firebaseDefaultConfig';
import { createInitialAppState } from '../data/initialSeed';
import type { AppState } from '../types/app';
import { reconcileTaskBlockLinks } from '../utils/bidirectionalSync';
import { rolloverRecurringTasks } from '../utils/syncMerge';

const STORAGE_KEY = 'sankalpa_al_workspace_v2';

export function loadAppState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const seed = createInitialAppState();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
      return seed;
    }
    const parsed = JSON.parse(raw) as Partial<AppState>;
    const fallback = createInitialAppState();
    const mergedSettings = { ...fallback.settings, ...(parsed.settings ?? {}) };
    if (!mergedSettings.firebaseConfigJson?.trim()) {
      mergedSettings.firebaseConfigJson = DEFAULT_FIREBASE_CONFIG_JSON;
    }
    const hydrated: AppState = {
      ...fallback,
      ...parsed,
      subjects: {
        ...fallback.subjects,
        ...(parsed.subjects ?? {}),
        general: {
          ...fallback.subjects.general,
          ...(parsed.subjects?.general ?? {}),
          color:
            parsed.subjects?.general?.color === '#6366F1'
              ? '#06B6D4'
              : parsed.subjects?.general?.color ?? fallback.subjects.general.color,
        },
      },
      settings: mergedSettings,
      activeTimer: { ...fallback.activeTimer, ...(parsed.activeTimer ?? {}) },
      tasks: rolloverRecurringTasks(Array.isArray(parsed.tasks) ? parsed.tasks : []),
      blocks: Array.isArray(parsed.blocks) ? parsed.blocks : [],
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      papers: Array.isArray(parsed.papers) ? parsed.papers : [],
      syllabus: Array.isArray(parsed.syllabus) && parsed.syllabus.length > 0 ? parsed.syllabus : fallback.syllabus,
      examCountdowns: Array.isArray(parsed.examCountdowns) ? parsed.examCountdowns : [],
    };
    return reconcileTaskBlockLinks(hydrated);
  } catch {
    return createInitialAppState();
  }
}

export function saveAppState(state: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore quota errors cleanly without crashing UI
  }
}

export function resetAppState(): AppState {
  const clean = createInitialAppState();
  saveAppState(clean);
  return clean;
}

export function exportStateAsJson(state: AppState): string {
  return JSON.stringify(state, null, 2);
}

export function parseImportedStateJson(jsonText: string): AppState {
  const parsed = JSON.parse(jsonText) as Partial<AppState>;
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.tasks) || !Array.isArray(parsed.papers)) {
    throw new Error('Invalid Sankalpa backup JSON structure.');
  }
  const fallback = createInitialAppState();
  const mergedSettings = { ...fallback.settings, ...(parsed.settings ?? {}) };
  if (!mergedSettings.firebaseConfigJson?.trim()) {
    mergedSettings.firebaseConfigJson = DEFAULT_FIREBASE_CONFIG_JSON;
  }
  return reconcileTaskBlockLinks({
    ...fallback,
    ...parsed,
    subjects: {
      ...fallback.subjects,
      ...(parsed.subjects ?? {}),
      general: {
        ...fallback.subjects.general,
        ...(parsed.subjects?.general ?? {}),
        color:
          parsed.subjects?.general?.color === '#6366F1'
            ? '#06B6D4'
            : parsed.subjects?.general?.color ?? fallback.subjects.general.color,
      },
    },
    settings: mergedSettings,
    activeTimer: { ...fallback.activeTimer, ...(parsed.activeTimer ?? {}) },
    syllabus: Array.isArray(parsed.syllabus) && parsed.syllabus.length > 0 ? parsed.syllabus : fallback.syllabus,
    lastModified: Date.now(),
  });
}
