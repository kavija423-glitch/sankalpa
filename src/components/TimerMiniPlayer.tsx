import React from 'react';
import { Pause, Play, Square, Maximize2 } from 'lucide-react';
import type { ActiveTimerState, SubjectConfig, SubjectKey } from '../types/app';
import { formatClockTimer } from '../utils/calendarMath';

interface TimerMiniPlayerProps {
  timer: ActiveTimerState;
  elapsedMs: number;
  subjects: Record<SubjectKey, SubjectConfig>;
  onToggleRun: () => void;
  onRequestStop: () => void;
  onOpenTimer: () => void;
}

export const TimerMiniPlayer: React.FC<TimerMiniPlayerProps> = ({
  timer,
  elapsedMs,
  subjects,
  onToggleRun,
  onRequestStop,
  onOpenTimer,
}) => {
  const hasProgress = timer.isRunning || timer.accumulatedMs > 0;
  if (!hasProgress) return null;

  const subject = subjects[timer.subject] ?? subjects.general;
  const displayMs =
    timer.targetDurationMs !== null ? Math.max(0, timer.targetDurationMs - elapsedMs) : elapsedMs;

  return (
    <div
      data-testid="timer-mini-player"
      className="fixed bottom-16 md:bottom-4 right-3 left-3 md:left-auto md:w-96 z-40 rounded-xl bg-white/95 dark:bg-[#13161D]/95 backdrop-blur-md border border-[#E5E5E0] dark:border-[#232834] shadow-lg px-3.5 py-2.5 flex items-center justify-between gap-3"
    >
      <button
        type="button"
        onClick={onOpenTimer}
        className="flex items-center gap-2.5 min-w-0 text-left flex-1 cursor-pointer group"
        aria-label="Open full study timer view"
      >
        <span
          className="w-2.5 h-2.5 rounded-xs shrink-0"
          style={{ backgroundColor: subject.color }}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-[#141413] dark:text-[#F3F4F6] truncate group-hover:underline">
            {timer.title || 'Focused Session'}
          </div>
          <div className="text-[11px] text-[#5A5A55] dark:text-[#9CA3AF] truncate">
            {subject.label} · {timer.phase === 'break' ? 'Break' : timer.mode === 'flowtime' ? 'Flowtime' : 'Focus'}
          </div>
        </div>
      </button>

      <div className="flex items-center gap-1.5 shrink-0">
        <span className="font-mono tabular-nums text-sm font-semibold text-[#141413] dark:text-[#F3F4F6] mr-1">
          {formatClockTimer(displayMs)}
        </span>
        <button
          type="button"
          onClick={onToggleRun}
          aria-label={timer.isRunning ? 'Pause study timer' : 'Resume study timer'}
          className="w-9 h-9 rounded-lg bg-[#4338CA] dark:bg-[#6366F1] text-white flex items-center justify-center hover:opacity-90 transition-opacity cursor-pointer"
        >
          {timer.isRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </button>
        <button
          type="button"
          onClick={onRequestStop}
          aria-label="Finish and log session"
          className="w-9 h-9 rounded-lg border border-[#E5E5E0] dark:border-[#232834] text-[#141413] dark:text-[#F3F4F6] flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
        >
          <Square className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={onOpenTimer}
          aria-label="Expand timer"
          className="hidden sm:flex w-8 h-9 rounded-lg text-[#5A5A55] dark:text-[#9CA3AF] items-center justify-center hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
