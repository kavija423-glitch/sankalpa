import React, { useEffect, useMemo, useState } from 'react';
import { Clock, Trash2, X } from 'lucide-react';
import type { StudySession, SubjectConfig, SubjectKey, TaskItem } from '../types/app';
import { formatDurationLabel } from '../utils/calendarMath';
import {
  computeRangeFromDurationMode,
  draftFromExistingManualSession,
  getDefaultManualSessionWindow,
  minutesToHHMM,
  parseHHMMToMinutes,
  validateManualSessionDraft,
  type DurationAnchor,
  type ManualSessionDraft,
} from '../utils/manualSession';
import { toISODateLocal } from '../utils/nlpTaskParser';

interface ManualSessionModalProps {
  open: boolean;
  editingSession: StudySession | null;
  subjects: Record<SubjectKey, SubjectConfig>;
  tasks: TaskItem[];
  onSave: (
    input: {
      subject: SubjectKey;
      title: string;
      taskId: string | null;
      date: string;
      startMinutes: number;
      endMinutes: number;
      notes: string;
    },
    existingSession?: StudySession
  ) => void;
  onDelete?: (sessionId: string) => void;
  onClose: () => void;
}

const QUICK_DURATIONS: Array<{ minutes: number; label: string }> = [
  { minutes: 30, label: '30m' },
  { minutes: 45, label: '45m' },
  { minutes: 60, label: '1h' },
  { minutes: 90, label: '1.5h' },
  { minutes: 120, label: '2h' },
  { minutes: 180, label: '3h' },
];

function createInitialDraft(editingSession: StudySession | null): ManualSessionDraft {
  if (editingSession) {
    return draftFromExistingManualSession(editingSession);
  }
  const win = getDefaultManualSessionWindow(new Date());
  return {
    subject: 'physics',
    title: '',
    taskId: null,
    date: win.date,
    startTime: win.startTime,
    endTime: win.endTime,
    hours: win.hours,
    minutes: win.minutes,
    timeMode: 'range',
    durationAnchor: 'end',
    notes: '',
  };
}

export const ManualSessionModal: React.FC<ManualSessionModalProps> = ({
  open,
  editingSession,
  subjects,
  tasks,
  onSave,
  onDelete,
  onClose,
}) => {
  const todayISO = toISODateLocal(new Date());
  const [draft, setDraft] = useState<ManualSessionDraft>(() => createInitialDraft(editingSession));
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(createInitialDraft(editingSession));
      setConfirmingDelete(false);
    }
  }, [open, editingSession]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const subjectTasks = useMemo(() => {
    if (!draft.subject) return [];
    const twoWeeksAgoMs = Date.now() - 14 * 86400000;
    return tasks
      .filter((t) => !t.deletedAt && t.subject === draft.subject)
      .filter((t) => !t.completed || (t.completedAt ?? t.updatedAt) >= twoWeeksAgoMs)
      .sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        return b.updatedAt - a.updatedAt;
      });
  }, [tasks, draft.subject]);

  const validation = useMemo(
    () => validateManualSessionDraft(draft, todayISO),
    [draft, todayISO]
  );

  if (!open) return null;

  const syncFromTimeRange = (nextStart: string, nextEnd: string) => {
    const s = parseHHMMToMinutes(nextStart);
    const e = parseHHMMToMinutes(nextEnd);
    if (s !== null && e !== null && e > s) {
      const diff = e - s;
      setDraft((prev) => ({
        ...prev,
        startTime: nextStart,
        endTime: nextEnd,
        hours: Math.floor(diff / 60),
        minutes: diff % 60,
      }));
    } else {
      setDraft((prev) => ({
        ...prev,
        startTime: nextStart,
        endTime: nextEnd,
      }));
    }
  };

  const syncFromDuration = (
    nextHours: number,
    nextMinutes: number,
    nextAnchor: DurationAnchor = draft.durationAnchor,
    nextAnchorTime?: string
  ) => {
    const clampedH = Math.max(0, Math.min(12, Number.isFinite(nextHours) ? Math.floor(nextHours) : 0));
    const clampedM = Math.max(0, Math.min(59, Number.isFinite(nextMinutes) ? Math.floor(nextMinutes) : 0));
    const anchorHHMM =
      nextAnchorTime ?? (nextAnchor === 'end' ? draft.endTime : draft.startTime);

    const computed = computeRangeFromDurationMode(clampedH, clampedM, nextAnchor, anchorHHMM);
    setDraft((prev) => ({
      ...prev,
      hours: clampedH,
      minutes: clampedM,
      durationAnchor: nextAnchor,
      startTime:
        computed.error && nextAnchor === 'start'
          ? anchorHHMM
          : !computed.error
          ? minutesToHHMM(computed.startMinutes)
          : prev.startTime,
      endTime:
        computed.error && nextAnchor === 'end'
          ? anchorHHMM
          : !computed.error
          ? minutesToHHMM(computed.endMinutes)
          : prev.endTime,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validation.valid || !draft.subject) return;

    onSave(
      {
        subject: draft.subject,
        title: draft.title,
        taskId: draft.taskId,
        date: draft.date,
        startMinutes: validation.startMinutes,
        endMinutes: validation.endMinutes,
        notes: draft.notes,
      },
      editingSession ?? undefined
    );
    onClose();
  };

  const activeSubjectCfg = draft.subject ? subjects[draft.subject] : null;
  const activeTotalMinutes = draft.hours * 60 + draft.minutes;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="manual-session-modal-title"
      data-testid="manual-session-modal"
    >
      <form
        onSubmit={handleSubmit}
        className="w-full sm:max-w-lg max-h-[92dvh] overflow-y-auto ios-scroll rounded-t-2xl sm:rounded-2xl bg-white dark:bg-[#0F1724] border border-[#DCE6F0] dark:border-[#1E2C40] p-5 sm:p-6 space-y-4 shadow-xl"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2
              id="manual-session-modal-title"
              className="font-display text-lg font-bold text-[#0F172A] dark:text-[#F1F5F9]"
            >
              {editingSession ? 'Edit Manual Session' : 'Log Past Study Session'}
            </h2>
            <p className="text-xs text-[#475569] dark:text-[#94A3B8] mt-0.5">
              Records study time to calendar timeline, focus analytics & Firestore sync
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close log session modal"
            className="p-2 rounded-lg text-[#475569] dark:text-[#94A3B8] hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Subject Pill Selector (Required) */}
        <div>
          <span className="block text-xs font-medium text-[#0F172A] dark:text-[#F1F5F9] mb-1.5">
            Subject <span className="text-rose-500">*</span>
          </span>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Study subject">
            {Object.values(subjects).map((sub) => {
              const selected = draft.subject === sub.id;
              return (
                <button
                  key={sub.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  data-testid={`manual-subject-${sub.id}`}
                  onClick={() =>
                    setDraft((prev) => ({
                      ...prev,
                      subject: sub.id,
                      taskId:
                        prev.taskId &&
                        tasks.some((t) => t.id === prev.taskId && t.subject === sub.id)
                          ? prev.taskId
                          : null,
                    }))
                  }
                  style={
                    selected
                      ? {
                          borderColor: sub.color,
                          backgroundColor: `${sub.color}1A`,
                        }
                      : undefined
                  }
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-2 transition-colors cursor-pointer ${
                    selected
                      ? 'text-[#0F172A] dark:text-[#F1F5F9] font-semibold'
                      : 'border-[#DCE6F0] dark:border-[#1E2C40] bg-[#F4F8FB] dark:bg-[#080E17] text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F1F5F9]'
                  }`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: sub.color }}
                  />
                  <span>{sub.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Session Title / Topic (Optional) */}
        <div>
          <label
            htmlFor="manual-session-title"
            className="block text-xs font-medium text-[#0F172A] dark:text-[#F1F5F9] mb-1"
          >
            Session Title / Topic <span className="text-[#475569] dark:text-[#94A3B8] font-normal">(optional)</span>
          </label>
          <input
            id="manual-session-title"
            type="text"
            value={draft.title}
            onChange={(e) => setDraft((prev) => ({ ...prev, title: e.target.value }))}
            placeholder={
              activeSubjectCfg
                ? `e.g., Hydrostatics Past Paper 2023 (defaults to ${activeSubjectCfg.label})`
                : 'e.g., Hydrostatics Past Paper 2023'
            }
            className="w-full rounded-lg bg-[#F4F8FB] dark:bg-[#080E17] border border-[#DCE6F0] dark:border-[#1E2C40] px-3 py-2 text-sm text-[#0F172A] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-[#0EA5E9]"
          />
        </div>

        {/* Link to Existing Task (Optional) + Date (Required) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="manual-session-task"
              className="block text-xs font-medium text-[#0F172A] dark:text-[#F1F5F9] mb-1"
            >
              Link to Existing Task <span className="text-[#475569] dark:text-[#94A3B8] font-normal">(optional)</span>
            </label>
            <select
              id="manual-session-task"
              value={draft.taskId ?? ''}
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  taskId: e.target.value ? e.target.value : null,
                }))
              }
              className="w-full rounded-lg bg-[#F4F8FB] dark:bg-[#080E17] border border-[#DCE6F0] dark:border-[#1E2C40] px-3 py-2 text-xs sm:text-sm text-[#0F172A] dark:text-[#F1F5F9]"
            >
              <option value="">No linked task</option>
              {subjectTasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title} ({t.durationMinutes}m{t.completed ? ' · done' : ''})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="manual-session-date"
              className="block text-xs font-medium text-[#0F172A] dark:text-[#F1F5F9] mb-1"
            >
              Date <span className="text-rose-500">*</span>
            </label>
            <input
              id="manual-session-date"
              type="date"
              required
              max={todayISO}
              value={draft.date}
              onChange={(e) => setDraft((prev) => ({ ...prev, date: e.target.value }))}
              className="w-full rounded-lg bg-[#F4F8FB] dark:bg-[#080E17] border border-[#DCE6F0] dark:border-[#1E2C40] px-3 py-2 text-sm font-mono text-[#0F172A] dark:text-[#F1F5F9]"
            />
          </div>
        </div>

        {/* Time & Duration (Two Synced Modes) */}
        <div className="rounded-xl border border-[#DCE6F0] dark:border-[#1E2C40] bg-[#F4F8FB]/70 dark:bg-[#080E17]/70 p-3.5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-[#0F172A] dark:text-[#F1F5F9] flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-[#0EA5E9] dark:text-[#38BDF8]" />
              <span>Time & Duration</span>
            </span>

            <div
              role="tablist"
              aria-label="Time entry mode"
              className="flex items-center p-0.5 rounded-lg bg-[#E6EEF5] dark:bg-[#0F1724] border border-[#DCE6F0] dark:border-[#1E2C40]"
            >
              <button
                type="button"
                role="tab"
                aria-selected={draft.timeMode === 'range'}
                data-testid="manual-mode-range"
                onClick={() => setDraft((prev) => ({ ...prev, timeMode: 'range' }))}
                className={`px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer ${
                  draft.timeMode === 'range'
                    ? 'bg-white dark:bg-[#172233] text-[#0F172A] dark:text-[#F1F5F9] shadow-xs'
                    : 'text-[#475569] dark:text-[#94A3B8]'
                }`}
              >
                Time Range
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={draft.timeMode === 'duration'}
                data-testid="manual-mode-duration"
                onClick={() => setDraft((prev) => ({ ...prev, timeMode: 'duration' }))}
                className={`px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer ${
                  draft.timeMode === 'duration'
                    ? 'bg-white dark:bg-[#172233] text-[#0F172A] dark:text-[#F1F5F9] shadow-xs'
                    : 'text-[#475569] dark:text-[#94A3B8]'
                }`}
              >
                Duration
              </button>
            </div>
          </div>

          {draft.timeMode === 'range' ? (
            <div className="space-y-2.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="manual-start-time"
                    className="block text-[11px] font-medium text-[#475569] dark:text-[#94A3B8] mb-1"
                  >
                    Start Time
                  </label>
                  <input
                    id="manual-start-time"
                    type="time"
                    required
                    value={draft.startTime}
                    onChange={(e) => syncFromTimeRange(e.target.value, draft.endTime)}
                    className="w-full rounded-lg bg-white dark:bg-[#0F1724] border border-[#DCE6F0] dark:border-[#1E2C40] px-3 py-2 text-sm font-mono text-[#0F172A] dark:text-[#F1F5F9]"
                  />
                </div>
                <div>
                  <label
                    htmlFor="manual-end-time"
                    className="block text-[11px] font-medium text-[#475569] dark:text-[#94A3B8] mb-1"
                  >
                    End Time
                  </label>
                  <input
                    id="manual-end-time"
                    type="time"
                    required
                    value={draft.endTime}
                    onChange={(e) => syncFromTimeRange(draft.startTime, e.target.value)}
                    className="w-full rounded-lg bg-white dark:bg-[#0F1724] border border-[#DCE6F0] dark:border-[#1E2C40] px-3 py-2 text-sm font-mono text-[#0F172A] dark:text-[#F1F5F9]"
                  />
                </div>
              </div>
              <div
                data-testid="manual-duration-readout"
                className="text-xs text-[#475569] dark:text-[#94A3B8] flex items-center justify-between"
              >
                <span>Calculated duration</span>
                <strong className="font-mono tabular-nums text-[#0284C7] dark:text-[#7DD3FC]">
                  {validation.valid
                    ? formatDurationLabel(validation.durationMinutes)
                    : 'Invalid range'}
                </strong>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Quick-Select Duration Pills */}
              <div className="flex flex-wrap gap-1.5">
                {QUICK_DURATIONS.map((preset) => {
                  const active = activeTotalMinutes === preset.minutes;
                  return (
                    <button
                      key={preset.minutes}
                      type="button"
                      data-testid={`manual-pill-${preset.label}`}
                      onClick={() =>
                        syncFromDuration(
                          Math.floor(preset.minutes / 60),
                          preset.minutes % 60
                        )
                      }
                      className={`px-2.5 py-1 rounded-md border text-xs font-mono cursor-pointer ${
                        active
                          ? 'border-[#0EA5E9] dark:border-[#38BDF8] bg-[#0284C7] hover:bg-[#0369A1] dark:bg-[#38BDF8] dark:hover:bg-[#7DD3FC] text-white dark:text-[#07131E] font-semibold'
                          : 'border-[#DCE6F0] dark:border-[#1E2C40] bg-white dark:bg-[#0F1724] text-[#0F172A] dark:text-[#F1F5F9] hover:bg-black/5 dark:hover:bg-white/5'
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>

              {/* Hours, Minutes & Anchor Time */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div>
                  <label
                    htmlFor="manual-duration-hours"
                    className="block text-[11px] font-medium text-[#475569] dark:text-[#94A3B8] mb-1"
                  >
                    Hours (0–12)
                  </label>
                  <input
                    id="manual-duration-hours"
                    type="number"
                    min={0}
                    max={12}
                    value={draft.hours}
                    onChange={(e) => syncFromDuration(Number(e.target.value), draft.minutes)}
                    className="w-full rounded-lg bg-white dark:bg-[#0F1724] border border-[#DCE6F0] dark:border-[#1E2C40] px-2.5 py-1.5 text-sm font-mono text-[#0F172A] dark:text-[#F1F5F9]"
                  />
                </div>
                <div>
                  <label
                    htmlFor="manual-duration-minutes"
                    className="block text-[11px] font-medium text-[#475569] dark:text-[#94A3B8] mb-1"
                  >
                    Minutes (0–59)
                  </label>
                  <input
                    id="manual-duration-minutes"
                    type="number"
                    min={0}
                    max={59}
                    value={draft.minutes}
                    onChange={(e) => syncFromDuration(draft.hours, Number(e.target.value))}
                    className="w-full rounded-lg bg-white dark:bg-[#0F1724] border border-[#DCE6F0] dark:border-[#1E2C40] px-2.5 py-1.5 text-sm font-mono text-[#0F172A] dark:text-[#F1F5F9]"
                  />
                </div>
                <div className="col-span-2">
                  <div className="flex items-center justify-between mb-1">
                    <label
                      htmlFor="manual-anchor-time"
                      className="text-[11px] font-medium text-[#475569] dark:text-[#94A3B8]"
                    >
                      {draft.durationAnchor === 'end' ? 'End Time' : 'Start Time'}
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        const nextAnchor: DurationAnchor =
                          draft.durationAnchor === 'end' ? 'start' : 'end';
                        syncFromDuration(draft.hours, draft.minutes, nextAnchor);
                      }}
                      className="text-[10px] font-medium text-[#0284C7] dark:text-[#7DD3FC] hover:underline cursor-pointer"
                    >
                      Switch to {draft.durationAnchor === 'end' ? 'Start' : 'End'}
                    </button>
                  </div>
                  <input
                    id="manual-anchor-time"
                    type="time"
                    value={draft.durationAnchor === 'end' ? draft.endTime : draft.startTime}
                    onChange={(e) =>
                      syncFromDuration(
                        draft.hours,
                        draft.minutes,
                        draft.durationAnchor,
                        e.target.value
                      )
                    }
                    className="w-full rounded-lg bg-white dark:bg-[#0F1724] border border-[#DCE6F0] dark:border-[#1E2C40] px-2.5 py-1.5 text-sm font-mono text-[#0F172A] dark:text-[#F1F5F9]"
                  />
                </div>
              </div>

              <div className="text-xs text-[#475569] dark:text-[#94A3B8] flex items-center justify-between">
                <span>Computed window</span>
                <strong className="font-mono tabular-nums text-[#0284C7] dark:text-[#7DD3FC]">
                  {validation.valid
                    ? `${minutesToHHMM(validation.startMinutes)} – ${minutesToHHMM(validation.endMinutes)} (${formatDurationLabel(validation.durationMinutes)})`
                    : 'Adjust time or duration'}
                </strong>
              </div>
            </div>
          )}
        </div>

        {/* Notes (Optional) */}
        <div>
          <label
            htmlFor="manual-session-notes"
            className="block text-xs font-medium text-[#0F172A] dark:text-[#F1F5F9] mb-1"
          >
            Notes <span className="text-[#475569] dark:text-[#94A3B8] font-normal">(optional)</span>
          </label>
          <textarea
            id="manual-session-notes"
            rows={2}
            value={draft.notes}
            onChange={(e) => setDraft((prev) => ({ ...prev, notes: e.target.value }))}
            placeholder="Study reflections, formulas revised, or completed question numbers..."
            className="w-full rounded-lg bg-[#F4F8FB] dark:bg-[#080E17] border border-[#DCE6F0] dark:border-[#1E2C40] px-3 py-2 text-sm text-[#0F172A] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-[#0EA5E9]"
          />
        </div>

        {/* Inline Validation Error */}
        {!validation.valid && validation.error && (
          <p
            data-testid="manual-session-error"
            className="text-xs font-medium text-rose-600 dark:text-rose-400"
          >
            {validation.error}
          </p>
        )}

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#DCE6F0] dark:border-[#1E2C40]">
          {editingSession && onDelete ? (
            confirmingDelete ? (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  data-testid="confirm-delete-manual-session"
                  onClick={() => {
                    onDelete(editingSession.id);
                    onClose();
                  }}
                  className="px-3 py-2 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700 cursor-pointer"
                >
                  Confirm Delete
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  className="px-2.5 py-2 rounded-lg border border-[#DCE6F0] dark:border-[#1E2C40] text-xs font-medium text-[#475569] dark:text-[#94A3B8] cursor-pointer"
                >
                  Keep
                </button>
              </div>
            ) : (
              <button
                type="button"
                data-testid="delete-manual-session"
                onClick={() => setConfirmingDelete(true)}
                className="px-3 py-2 rounded-lg text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>
            )
          ) : (
            <span />
          )}

          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-[#DCE6F0] dark:border-[#1E2C40] text-xs font-medium text-[#0F172A] dark:text-[#F1F5F9] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              data-testid="save-manual-session"
              disabled={!validation.valid}
              className="px-4 py-2 rounded-lg bg-[#0284C7] hover:bg-[#0369A1] dark:bg-[#38BDF8] dark:hover:bg-[#7DD3FC] text-white dark:text-[#07131E] text-xs font-semibold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              {editingSession ? 'Save Changes' : 'Save Session'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
