import { createInitialAppState } from '../data/initialSeed';
import type { AppState } from '../types/app';
import { rolloverRecurringTasks } from '../utils/syncMerge';

const STORAGE_KEY = 'sankalpa_al_workspace_v1';

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
    const hydrated: AppState = {
      ...fallback,
      ...parsed,
      subjects: { ...fallback.subjects, ...(parsed.subjects ?? {}) },
      settings: { ...fallback.settings, ...(parsed.settings ?? {}) },
      activeTimer: { ...fallback.activeTimer, ...(parsed.activeTimer ?? {}) },
      tasks: rolloverRecurringTasks(Array.isArray(parsed.tasks) ? parsed.tasks : fallback.tasks),
      blocks: Array.isArray(parsed.blocks) ? parsed.blocks : fallback.blocks,
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : fallback.sessions,
      papers: Array.isArray(parsed.papers) ? parsed.papers : fallback.papers,
      syllabus: Array.isArray(parsed.syllabus) && parsed.syllabus.length > 0 ? parsed.syllabus : fallback.syllabus,
      examCountdowns: Array.isArray(parsed.examCountdowns) ? parsed.examCountdowns : fallback.examCountdowns,
    };
    return hydrated;
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

export function exportStateAsJson(state: AppState): string {
  const sanitized: AppState = {
    ...state,
    settings: {
      ...state.settings,
      firebaseConfigJson: state.settings.firebaseConfigJson,
    },
  };
  return JSON.stringify(sanitized, null, 2);
}

export function parseImportedStateJson(jsonText: string): AppState {
  const parsed = JSON.parse(jsonText) as Partial<AppState>;
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.tasks) || !Array.isArray(parsed.papers)) {
    throw new Error('Invalid Sankalpa backup JSON structure.');
  }
  const fallback = createInitialAppState();
  return {
    ...fallback,
    ...parsed,
    subjects: { ...fallback.subjects, ...(parsed.subjects ?? {}) },
    settings: { ...fallback.settings, ...(parsed.settings ?? {}) },
    activeTimer: { ...fallback.activeTimer, ...(parsed.activeTimer ?? {}) },
    syllabus: Array.isArray(parsed.syllabus) && parsed.syllabus.length > 0 ? parsed.syllabus : fallback.syllabus,
    lastModified: Date.now(),
  };
}
