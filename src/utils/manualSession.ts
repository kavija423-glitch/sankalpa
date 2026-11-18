import type { StudySession, SubjectConfig, SubjectKey } from '../types/app';
import { toISODateLocal } from './nlpTaskParser';

export type ManualTimeEntryMode = 'range' | 'duration';
export type DurationAnchor = 'end' | 'start';

export interface ManualSessionDraft {
  subject: SubjectKey | '';
  title: string;
  taskId: string | null;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  hours: number;
  minutes: number;
  timeMode: ManualTimeEntryMode;
  durationAnchor: DurationAnchor;
  notes: string;
}

export interface ManualSessionValidationResult {
  valid: boolean;
  error: string | null;
  startMinutes: number;
  endMinutes: number;
  durationMinutes: number;
}

export function parseHHMMToMinutes(hhmm: string): number | null {
  const trimmed = hhmm.trim();
  const match = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    return null;
  }
  return h * 60 + m;
}

export function minutesToHHMM(totalMinutes: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(totalMinutes)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function combineDateAndMinutesLocal(dateISO: string, minutesFromMidnight: number): number {
  const [y, m, d] = dateISO.split('-').map(Number);
  const h = Math.floor(minutesFromMidnight / 60);
  const min = minutesFromMidnight % 60;
  return new Date(y, (m || 1) - 1, d || 1, h, min, 0, 0).getTime();
}

/**
 * Computes default 1-hour window ending at current local time (clamped within today 00:00..23:59).
 */
export function getDefaultManualSessionWindow(now: Date = new Date()): {
  date: string;
  startTime: string;
  endTime: string;
  hours: number;
  minutes: number;
  durationMinutes: number;
} {
  const date = toISODateLocal(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  let endMins = nowMinutes;
  let startMins = nowMinutes - 60;

  if (nowMinutes < 15) {
    startMins = 0;
    endMins = 60;
  } else if (startMins < 0) {
    startMins = 0;
    endMins = nowMinutes;
  }

  const durationMinutes = Math.max(1, endMins - startMins);
  return {
    date,
    startTime: minutesToHHMM(startMins),
    endTime: minutesToHHMM(endMins),
    hours: Math.floor(durationMinutes / 60),
    minutes: durationMinutes % 60,
    durationMinutes,
  };
}

export function computeRangeFromDurationMode(
  hours: number,
  minutes: number,
  anchor: DurationAnchor,
  anchorTimeHHMM: string
): { startMinutes: number; endMinutes: number; durationMinutes: number; error: string | null } {
  const safeHours = Number.isFinite(hours) ? Math.max(0, Math.min(12, Math.floor(hours))) : 0;
  const safeMinutes = Number.isFinite(minutes) ? Math.max(0, Math.min(59, Math.floor(minutes))) : 0;
  const durationMinutes = safeHours * 60 + safeMinutes;

  const anchorMins = parseHHMMToMinutes(anchorTimeHHMM);
  if (anchorMins === null) {
    return { startMinutes: 0, endMinutes: 0, durationMinutes, error: 'Enter a valid time (HH:MM).' };
  }

  if (durationMinutes <= 0) {
    return {
      startMinutes: anchorMins,
      endMinutes: anchorMins,
      durationMinutes: 0,
      error: 'Session duration must be greater than 0 minutes.',
    };
  }

  if (durationMinutes > 12 * 60) {
    return {
      startMinutes: anchorMins,
      endMinutes: anchorMins,
      durationMinutes,
      error: 'Session duration cannot exceed 12 hours.',
    };
  }

  if (anchor === 'end') {
    const startMinutes = anchorMins - durationMinutes;
    if (startMinutes < 0) {
      return {
        startMinutes,
        endMinutes: anchorMins,
        durationMinutes,
        error: 'Start time goes before 00:00 — pick a later End Time or use Start Time anchor.',
      };
    }
    return { startMinutes, endMinutes: anchorMins, durationMinutes, error: null };
  }

  const endMinutes = anchorMins + durationMinutes;
  if (endMinutes > 23 * 60 + 59) {
    return {
      startMinutes: anchorMins,
      endMinutes,
      durationMinutes,
      error: 'End time goes past 23:59 — pick an earlier Start Time or use End Time anchor.',
    };
  }
  return { startMinutes: anchorMins, endMinutes, durationMinutes, error: null };
}

export function validateManualSessionDraft(
  draft: ManualSessionDraft,
  todayISO: string = toISODateLocal(new Date())
): ManualSessionValidationResult {
  if (!draft.subject) {
    return {
      valid: false,
      error: 'Please select a subject.',
      startMinutes: 0,
      endMinutes: 0,
      durationMinutes: 0,
    };
  }

  if (!draft.date || !/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) {
    return {
      valid: false,
      error: 'Please select a valid date.',
      startMinutes: 0,
      endMinutes: 0,
      durationMinutes: 0,
    };
  }

  if (draft.date > todayISO) {
    return {
      valid: false,
      error: 'Future dates cannot be logged as past study sessions.',
      startMinutes: 0,
      endMinutes: 0,
      durationMinutes: 0,
    };
  }

  if (draft.timeMode === 'range') {
    const startMinutes = parseHHMMToMinutes(draft.startTime);
    const endMinutes = parseHHMMToMinutes(draft.endTime);
    if (startMinutes === null || endMinutes === null) {
      return {
        valid: false,
        error: 'Please enter valid Start and End times.',
        startMinutes: 0,
        endMinutes: 0,
        durationMinutes: 0,
      };
    }
    if (endMinutes <= startMinutes) {
      return {
        valid: false,
        error: 'End time must be after Start time.',
        startMinutes,
        endMinutes,
        durationMinutes: 0,
      };
    }
    const durationMinutes = endMinutes - startMinutes;
    return { valid: true, error: null, startMinutes, endMinutes, durationMinutes };
  }

  const anchorHHMM = draft.durationAnchor === 'end' ? draft.endTime : draft.startTime;
  const computed = computeRangeFromDurationMode(
    draft.hours,
    draft.minutes,
    draft.durationAnchor,
    anchorHHMM
  );
  if (computed.error || computed.durationMinutes <= 0 || computed.endMinutes <= computed.startMinutes) {
    return {
      valid: false,
      error: computed.error ?? 'Duration must be greater than 0 minutes.',
      startMinutes: computed.startMinutes,
      endMinutes: computed.endMinutes,
      durationMinutes: computed.durationMinutes,
    };
  }

  return {
    valid: true,
    error: null,
    startMinutes: computed.startMinutes,
    endMinutes: computed.endMinutes,
    durationMinutes: computed.durationMinutes,
  };
}

export function buildManualStudySession(
  input: {
    subject: SubjectKey;
    title: string;
    taskId: string | null;
    date: string;
    startMinutes: number;
    endMinutes: number;
    notes: string;
  },
  subjects: Record<SubjectKey, SubjectConfig>,
  existingSession?: StudySession,
  nowMs: number = Date.now()
): StudySession {
  const subjectConfig = subjects[input.subject] ?? subjects.general;
  const durationMinutes = Math.max(1, input.endMinutes - input.startMinutes);
  const startTimestamp = combineDateAndMinutesLocal(input.date, input.startMinutes);
  const endTimestamp = combineDateAndMinutesLocal(input.date, input.endMinutes);
  const resolvedTitle = input.title.trim() || subjectConfig.label;

  return {
    id:
      existingSession?.id ??
      `ses_manual_${nowMs}_${Math.random().toString(36).slice(2, 6)}`,
    title: resolvedTitle,
    subject: input.subject,
    mode: 'manual',
    date: input.date,
    startTimestamp,
    endTimestamp,
    durationMinutes,
    rating: existingSession?.rating ?? 5,
    notes: input.notes.trim(),
    taskId: input.taskId ?? null,
    blockId: existingSession?.blockId ?? null,
    isManual: true,
    subjectId: input.subject,
    subjectName: subjectConfig.label,
    startTime: new Date(startTimestamp).toISOString(),
    endTime: new Date(endTimestamp).toISOString(),
    durationSeconds: durationMinutes * 60,
    createdAt: existingSession?.createdAt ?? nowMs,
    updatedAt: nowMs,
  };
}

export function updateExistingStudySession(
  existingSession: StudySession,
  input: {
    subject: SubjectKey;
    title: string;
    taskId: string | null;
    date: string;
    startMinutes: number;
    endMinutes: number;
    notes: string;
  },
  subjects: Record<SubjectKey, SubjectConfig>,
  nowMs: number = Date.now()
): StudySession {
  const subjectConfig = subjects[input.subject] ?? subjects.general;
  const durationMinutes = Math.max(1, input.endMinutes - input.startMinutes);
  const startTimestamp = combineDateAndMinutesLocal(input.date, input.startMinutes);
  const endTimestamp = combineDateAndMinutesLocal(input.date, input.endMinutes);
  const resolvedTitle = input.title.trim() || subjectConfig.label;

  return {
    ...existingSession,
    title: resolvedTitle,
    subject: input.subject,
    date: input.date,
    startTimestamp,
    endTimestamp,
    durationMinutes,
    notes: input.notes.trim(),
    taskId: input.taskId ?? null,
    subjectId: input.subject,
    subjectName: subjectConfig.label,
    startTime: new Date(startTimestamp).toISOString(),
    endTime: new Date(endTimestamp).toISOString(),
    durationSeconds: durationMinutes * 60,
    updatedAt: nowMs,
  };
}

export function draftFromExistingManualSession(
  session: StudySession
): ManualSessionDraft {
  const startDt = new Date(session.startTimestamp);
  const endDt = new Date(session.endTimestamp);
  const startMins = startDt.getHours() * 60 + startDt.getMinutes();
  const endMins = Math.max(startMins + 1, endDt.getHours() * 60 + endDt.getMinutes());
  const dur = Math.max(1, session.durationMinutes || endMins - startMins);

  return {
    subject: session.subject,
    title: session.title,
    taskId: session.taskId ?? null,
    date: session.date,
    startTime: minutesToHHMM(startMins),
    endTime: minutesToHHMM(endMins),
    hours: Math.floor(dur / 60),
    minutes: dur % 60,
    timeMode: 'range',
    durationAnchor: 'end',
    notes: session.notes ?? '',
  };
}

export function computeTaskLoggedMinutesMap(sessions: StudySession[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const s of sessions) {
    if (s.deletedAt || !s.taskId || s.durationMinutes <= 0) continue;
    map.set(s.taskId, (map.get(s.taskId) ?? 0) + s.durationMinutes);
  }
  return map;
}
