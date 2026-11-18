import React, { useState } from 'react';
import { Play, Pause, RotateCcw, Square, Star, Clock, CheckCircle2 } from 'lucide-react';
import type {
  ActiveTimerState,
  CalendarBlock,
  StudySession,
  SubjectConfig,
  SubjectKey,
  TaskItem,
  TimerMode,
} from '../types/app';
import { formatClockTimer, formatDurationLabel, formatTime24 } from '../utils/calendarMath';
import { toISODateLocal } from '../utils/nlpTaskParser';

interface TimerViewProps {
  timer: ActiveTimerState;
  elapsedMs: number;
  subjects: Record<SubjectKey, SubjectConfig>;
  tasks: TaskItem[];
  blocks: CalendarBlock[];
  sessions: StudySession[];
  onConfigureTimer: (patch: Partial<ActiveTimerState>) => void;
  onToggleRun: () => void;
  onReset: () => void;
  onRequestLogStop: () => void;
}

const MODES: Array<{ id: TimerMode; label: string; sub: string; durationMs: number | null }> = [
  { id: 'pomodoro_25', label: 'Pomodoro 25/5', sub: '25m focus', durationMs: 25 * 60 * 1000 },
  { id: 'pomodoro_50', label: 'Deep 50/10', sub: '50m focus', durationMs: 50 * 60 * 1000 },
  { id: 'flowtime', label: 'Flowtime', sub: 'Count up', durationMs: null },
  { id: 'scheduled', label: 'Block Countdown', sub: 'From schedule', durationMs: 60 * 60 * 1000 },
];

export const TimerView: React.FC<TimerViewProps> = ({
  timer,
  elapsedMs,
  subjects,
  tasks,
  blocks,
  sessions,
  onConfigureTimer,
  onToggleRun,
  onReset,
  onRequestLogStop,
}) => {
  const [showLinkPicker, setShowLinkPicker] = useState(false);
  const todayISO = toISODateLocal(new Date());

  const todayBlocks = blocks
    .filter((b) => b.date === todayISO)
    .sort((a, b) => a.startMinutes - b.startMinutes);
  const pendingTasks = tasks.filter((t) => !t.completed).slice(0, 8);
  const todaySessions = sessions
    .filter((s) => s.date === todayISO)
    .sort((a, b) => b.endTimestamp - a.endTimestamp);

  const activeSubject = subjects[timer.subject] ?? subjects.general;
  const isCountdown = timer.targetDurationMs !== null;
  const displayMs = isCountdown ? Math.max(0, (timer.targetDurationMs ?? 0) - elapsedMs) : elapsedMs;

  const progressRatio = isCountdown && timer.targetDurationMs
    ? Math.min(1, elapsedMs / timer.targetDurationMs)
    : Math.min(1, (elapsedMs % (60 * 60 * 1000)) / (60 * 60 * 1000));

  const ringRadius = 112;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const strokeOffset = ringCircumference * (1 - progressRatio);

  const handleSelectMode = (mode: TimerMode) => {
    const def = MODES.find((m) => m.id === mode);
    if (!def) return;
    onConfigureTimer({
      isRunning: false,
      startedAt: null,
      accumulatedMs: 0,
      phase: 'focus',
      mode,
      targetDurationMs: def.durationMs,
    });
  };

  const handleLinkBlock = (blk: CalendarBlock) => {
    onConfigureTimer({
      isRunning: false,
      startedAt: null,
      accumulatedMs: 0,
      mode: 'scheduled',
      phase: 'focus',
      targetDurationMs: blk.durationMinutes * 60 * 1000,
      title: blk.title,
      subject: blk.subject,
      blockId: blk.id,
      taskId: blk.taskId,
    });
    setShowLinkPicker(false);
  };

  const handleLinkTask = (tsk: TaskItem) => {
    onConfigureTimer({
      isRunning: false,
      startedAt: null,
      accumulatedMs: 0,
      phase: 'focus',
      targetDurationMs: timer.mode === 'flowtime' ? null : tsk.durationMinutes * 60 * 1000,
      title: tsk.title,
      subject: tsk.subject,
      taskId: tsk.id,
      blockId: tsk.scheduledBlockId,
    });
    setShowLinkPicker(false);
  };

  const totalTodayMinutes = todaySessions.reduce((acc, s) => acc + s.durationMinutes, 0);

  return (
    <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 py-5 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-[#E5E5E0] dark:border-[#232834] pb-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#141413] dark:text-[#F3F4F6]">
            Study Timer
          </h1>
          <p className="text-sm text-[#5A5A55] dark:text-[#9CA3AF] mt-1">
            Timestamp-accurate focus clock · Survives screen lock and tab switching
          </p>
        </div>
        <div className="text-sm text-[#5A5A55] dark:text-[#9CA3AF] tabular-nums">
          Logged today: <strong className="text-[#141413] dark:text-[#F3F4F6] font-mono">{formatDurationLabel(totalTodayMinutes)}</strong>
        </div>
      </div>

      {/* Mode Segmented Selector */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-1 rounded-xl bg-[#ECECE7] dark:bg-[#13161D] border border-[#E5E5E0] dark:border-[#232834]">
        {MODES.map((m) => {
          const active = timer.mode === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => handleSelectMode(m.id)}
              className={`px-3 py-2 rounded-lg text-left transition-colors cursor-pointer ${
                active
                  ? 'bg-white dark:bg-[#1F2430] text-[#141413] dark:text-[#F3F4F6] shadow-xs'
                  : 'text-[#5A5A55] dark:text-[#9CA3AF] hover:text-[#141413] dark:hover:text-[#F3F4F6]'
              }`}
            >
              <div className="text-xs font-semibold whitespace-nowrap">{m.label}</div>
              <div className="text-[11px] opacity-75 whitespace-nowrap">{m.sub}</div>
            </button>
          );
        })}
      </div>

      {/* Main Two-Column Timer Stage */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <section className="lg:col-span-7 rounded-2xl bg-white dark:bg-[#13161D] border border-[#E5E5E0] dark:border-[#232834] p-6 sm:p-8 flex flex-col items-center">
          {/* Session Title & Subject Controls */}
          <div className="w-full flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 mb-6">
            <input
              type="text"
              value={timer.title}
              onChange={(e) => onConfigureTimer({ title: e.target.value })}
              placeholder="What are you studying?"
              aria-label="Study session title"
              className="flex-1 min-w-0 px-3.5 py-2.5 text-sm rounded-lg bg-[#F7F7F5] dark:bg-[#0B0D11] border border-[#E5E5E0] dark:border-[#232834] text-[#141413] dark:text-[#F3F4F6] focus:outline-none focus:ring-2 focus:ring-[#4338CA] dark:focus:ring-[#6366F1]"
            />
            <select
              value={timer.subject}
              onChange={(e) => onConfigureTimer({ subject: e.target.value as SubjectKey })}
              aria-label="Study session subject"
              className="px-3 py-2.5 text-sm rounded-lg bg-[#F7F7F5] dark:bg-[#0B0D11] border border-[#E5E5E0] dark:border-[#232834] text-[#141413] dark:text-[#F3F4F6] cursor-pointer"
            >
              {Object.values(subjects).map((sub) => (
                <option key={sub.id} value={sub.id}>
                  {sub.label}
                </option>
              ))}
            </select>
          </div>

          {/* Phase Toggle for Pomodoro */}
          {(timer.mode === 'pomodoro_25' || timer.mode === 'pomodoro_50') && (
            <div className="flex items-center gap-2 mb-4 text-xs">
              <button
                type="button"
                onClick={() =>
                  onConfigureTimer({
                    isRunning: false,
                    startedAt: null,
                    accumulatedMs: 0,
                    phase: 'focus',
                    targetDurationMs: (timer.mode === 'pomodoro_25' ? 25 : 50) * 60 * 1000,
                  })
                }
                className={`px-3 py-1.5 rounded-md font-medium cursor-pointer ${
                  timer.phase === 'focus'
                    ? 'bg-[#141413] text-white dark:bg-[#F3F4F6] dark:text-[#141413]'
                    : 'text-[#5A5A55] dark:text-[#9CA3AF] hover:bg-black/5 dark:hover:bg-white/5'
                }`}
              >
                Focus ({timer.mode === 'pomodoro_25' ? '25m' : '50m'})
              </button>
              <button
                type="button"
                onClick={() =>
                  onConfigureTimer({
                    isRunning: false,
                    startedAt: null,
                    accumulatedMs: 0,
                    phase: 'break',
                    targetDurationMs: (timer.mode === 'pomodoro_25' ? 5 : 10) * 60 * 1000,
                  })
                }
                className={`px-3 py-1.5 rounded-md font-medium cursor-pointer ${
                  timer.phase === 'break'
                    ? 'bg-[#141413] text-white dark:bg-[#F3F4F6] dark:text-[#141413]'
                    : 'text-[#5A5A55] dark:text-[#9CA3AF] hover:bg-black/5 dark:hover:bg-white/5'
                }`}
              >
                Break ({timer.mode === 'pomodoro_25' ? '5m' : '10m'})
              </button>
            </div>
          )}

          {/* Crisp SVG Progress Ring */}
          <div className="relative w-64 h-64 flex items-center justify-center my-2">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 260 260" aria-hidden="true">
              <circle
                cx="130"
                cy="130"
                r={ringRadius}
                fill="none"
                strokeWidth="8"
                className="stroke-[#ECECE7] dark:stroke-[#1F2430]"
              />
              <circle
                cx="130"
                cy="130"
                r={ringRadius}
                fill="none"
                strokeWidth="8"
                strokeLinecap="round"
                stroke={activeSubject.color}
                strokeDasharray={ringCircumference}
                strokeDashoffset={strokeOffset}
                className="transition-[stroke-dashoffset] duration-300"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
              <span className="text-xs font-medium text-[#5A5A55] dark:text-[#9CA3AF]">
                {activeSubject.label} · {timer.phase === 'break' ? 'Break' : timer.mode === 'flowtime' ? 'Elapsed' : 'Remaining'}
              </span>
              <div
                data-testid="timer-clock-display"
                className="font-mono tabular-nums text-5xl font-semibold tracking-tight text-[#141413] dark:text-[#F3F4F6] mt-1"
              >
                {formatClockTimer(displayMs)}
              </div>
              <span className="text-xs text-[#5A5A55] dark:text-[#9CA3AF] mt-2">
                {timer.isRunning ? 'Clock active' : elapsedMs > 0 ? 'Paused' : 'Ready'}
              </span>
            </div>
          </div>

          {/* Primary Timer Actions */}
          <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
            <button
              type="button"
              onClick={onToggleRun}
              className="min-h-[44px] px-6 py-2.5 rounded-xl bg-[#4338CA] hover:bg-[#3730A3] dark:bg-[#6366F1] dark:hover:bg-[#4F46E5] text-white text-sm font-semibold flex items-center gap-2 transition-colors cursor-pointer"
            >
              {timer.isRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              <span>{timer.isRunning ? 'Pause' : elapsedMs > 0 ? 'Resume' : 'Start Focus'}</span>
            </button>

            <button
              type="button"
              onClick={onRequestLogStop}
              disabled={!timer.isRunning && timer.accumulatedMs === 0}
              className="min-h-[44px] px-4 py-2.5 rounded-xl border border-[#E5E5E0] dark:border-[#232834] text-[#141413] dark:text-[#F3F4F6] text-sm font-medium flex items-center gap-2 hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <Square className="w-4 h-4" />
              <span>Finish & Log</span>
            </button>

            <button
              type="button"
              onClick={onReset}
              aria-label="Reset timer"
              className="min-h-[44px] px-3.5 py-2.5 rounded-xl border border-[#E5E5E0] dark:border-[#232834] text-[#5A5A55] dark:text-[#9CA3AF] hover:text-[#141413] dark:hover:text-[#F3F4F6] flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span className="text-sm">Reset</span>
            </button>
          </div>
        </section>

        {/* Link Block / Task & Today's Session Log */}
        <section className="lg:col-span-5 space-y-5">
          <div className="rounded-2xl bg-white dark:bg-[#13161D] border border-[#E5E5E0] dark:border-[#232834] p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-base font-semibold text-[#141413] dark:text-[#F3F4F6]">
                Link Scheduled Block or Task
              </h2>
              <button
                type="button"
                onClick={() => setShowLinkPicker((v) => !v)}
                className="text-xs font-medium text-[#4338CA] dark:text-[#818CF8] hover:underline cursor-pointer"
              >
                {showLinkPicker ? 'Hide list' : 'Browse all'}
              </button>
            </div>

            {todayBlocks.length === 0 && pendingTasks.length === 0 ? (
              <p className="text-xs text-[#5A5A55] dark:text-[#9CA3AF]">
                No blocks scheduled today. Create a block in Calendar or add a task first.
              </p>
            ) : (
              <div className="space-y-2">
                {todayBlocks.slice(0, showLinkPicker ? 10 : 3).map((blk) => {
                  const sub = subjects[blk.subject] ?? subjects.general;
                  const isLinked = timer.blockId === blk.id;
                  return (
                    <button
                      key={blk.id}
                      type="button"
                      onClick={() => handleLinkBlock(blk)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors flex items-center justify-between gap-2 cursor-pointer ${
                        isLinked
                          ? 'border-[#4338CA] dark:border-[#6366F1] bg-indigo-50/60 dark:bg-indigo-950/30'
                          : 'border-[#E5E5E0] dark:border-[#232834] hover:bg-black/3 dark:hover:bg-white/3'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-[#141413] dark:text-[#F3F4F6] truncate">
                          {blk.title}
                        </div>
                        <div className="text-[11px] text-[#5A5A55] dark:text-[#9CA3AF] tabular-nums">
                          {sub.label} · {formatTime24(blk.startMinutes)} · {blk.durationMinutes}m
                        </div>
                      </div>
                      <Clock className="w-3.5 h-3.5 text-[#5A5A55] dark:text-[#9CA3AF] shrink-0" />
                    </button>
                  );
                })}

                {showLinkPicker &&
                  pendingTasks.map((tsk) => {
                    const sub = subjects[tsk.subject] ?? subjects.general;
                    return (
                      <button
                        key={tsk.id}
                        type="button"
                        onClick={() => handleLinkTask(tsk)}
                        className="w-full text-left px-3 py-2 rounded-lg border border-[#E5E5E0] dark:border-[#232834] hover:bg-black/3 dark:hover:bg-white/3 flex items-center justify-between gap-2 cursor-pointer"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-[#141413] dark:text-[#F3F4F6] truncate">
                            Task: {tsk.title}
                          </div>
                          <div className="text-[11px] text-[#5A5A55] dark:text-[#9CA3AF]">
                            {sub.label} · {tsk.durationMinutes}m
                          </div>
                        </div>
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#5A5A55] dark:text-[#9CA3AF] shrink-0" />
                      </button>
                    );
                  })}
              </div>
            )}
          </div>

          {/* Today's Completed Sessions */}
          <div className="rounded-2xl bg-white dark:bg-[#13161D] border border-[#E5E5E0] dark:border-[#232834] p-5">
            <h2 className="font-display text-base font-semibold text-[#141413] dark:text-[#F3F4F6] mb-3">
              Today’s Logged Sessions
            </h2>
            {todaySessions.length === 0 ? (
              <p className="text-xs text-[#5A5A55] dark:text-[#9CA3AF]">
                No sessions logged yet today. Start the timer to record actual focus time on your calendar Ghost Overlay.
              </p>
            ) : (
              <ul className="divide-y divide-[#E5E5E0] dark:divide-[#232834]">
                {todaySessions.map((ses) => {
                  const sub = subjects[ses.subject] ?? subjects.general;
                  const startDt = new Date(ses.startTimestamp);
                  const startMins = startDt.getHours() * 60 + startDt.getMinutes();
                  return (
                    <li key={ses.id} className="py-2.5 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-[#141413] dark:text-[#F3F4F6] truncate">
                          {ses.title}
                        </div>
                        <div className="text-[11px] text-[#5A5A55] dark:text-[#9CA3AF] tabular-nums">
                          {sub.label} · {formatTime24(startMins)} · {ses.durationMinutes}m
                        </div>
                        {ses.notes && (
                          <p className="text-[11px] text-[#5A5A55] dark:text-[#9CA3AF] mt-1 line-clamp-2">
                            {ses.notes}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0 text-amber-500" aria-label={`Rated ${ses.rating} out of 5`}>
                        <Star className="w-3.5 h-3.5 fill-current" />
                        <span className="font-mono text-xs tabular-nums text-[#141413] dark:text-[#F3F4F6]">
                          {ses.rating}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
