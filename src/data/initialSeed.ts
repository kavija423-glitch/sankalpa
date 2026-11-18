import type { AppState } from '../types/app';
import { DEFAULT_FIREBASE_CONFIG_JSON } from './firebaseDefaultConfig';
import { buildBilingualSyllabusSeed } from './syllabusSeed';

export function createInitialAppState(nowDate: Date = new Date()): AppState {
  const nowMs = nowDate.getTime();

  return {
    version: 2,
    subjects: {
      maths: {
        id: 'maths',
        label: 'Combined Maths',
        sinhalaLabel: 'සංයුක්ත ගණිතය',
        color: '#0284C7',
      },
      physics: {
        id: 'physics',
        label: 'Physics',
        sinhalaLabel: 'භෞතික විද්‍යාව',
        color: '#D97706',
      },
      ict: {
        id: 'ict',
        label: 'ICT',
        sinhalaLabel: 'තොරතුරු හා සන්නිවේදන තාක්ෂණය',
        color: '#059669',
      },
      general: {
        id: 'general',
        label: 'General Revision',
        sinhalaLabel: 'පොදු පුනරීක්ෂණ',
        color: '#06B6D4',
      },
    },
    tasks: [],
    blocks: [],
    sessions: [],
    papers: [],
    syllabus: buildBilingualSyllabusSeed(),
    examCountdowns: [],
    settings: {
      theme: 'light',
      medium: 'bilingual',
      dailyGoalMinutes: 240,
      firebaseConfigJson: DEFAULT_FIREBASE_CONFIG_JSON,
      updatedAt: nowMs,
    },
    activeTimer: {
      isRunning: false,
      mode: 'pomodoro_25',
      phase: 'focus',
      startedAt: null,
      accumulatedMs: 0,
      targetDurationMs: 25 * 60 * 1000,
      title: '',
      subject: 'physics',
      taskId: null,
      blockId: null,
    },
    lastModified: nowMs,
  };
}
