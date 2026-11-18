import React from 'react';
import { Maximize2, Pause, Play, Square } from 'lucide-react';
import type { ActiveTimerState, SubjectConfig } from '../types/app';
import { formatClockTimer } from '../utils/calendarMath';

interface PipTimerContentProps {
  timer: ActiveTimerState;
  displayMs: number;
  subject: SubjectConfig;
  onToggleRun: () => void;
  onStopAndLog: () => void;
  onReturnToApp: () => void;
}

/**
 * Compact interactive timer card rendered inside the OS-level Document Picture-in-Picture window.
 */
export const PipTimerContent: React.FC<PipTimerContentProps> = ({
  timer,
  displayMs,
  subject,
  onToggleRun,
  onStopAndLog,
  onReturnToApp,
}) => {
  return (
    <div
      data-testid="pip-timer-window"
      className="w-full h-full px-3 py-2 flex items-center justify-between gap-2.5 bg-white/85 dark:bg-[#13161D]/90 backdrop-blur-md border border-[#E5E5E0] dark:border-[#232834]"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: subject.color }}
            aria-hidden="true"
          />
          <span className="text-[11px] font-medium text-[#5A5A55] dark:text-[#9CA3AF] truncate">
            {timer.title.trim() || subject.label}
          </span>
        </div>
        <div
          data-testid="pip-clock-display"
          className="font-mono tabular-nums text-2xl font-semibold tracking-tight text-[#141413] dark:text-[#F3F4F6] leading-tight mt-0.5"
        >
          {formatClockTimer(displayMs)}
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={onToggleRun}
          aria-label={timer.isRunning ? 'Pause timer' : 'Resume timer'}
          title={timer.isRunning ? 'Pause' : 'Resume'}
          className="w-9 h-9 rounded-lg bg-[#4338CA] dark:bg-[#6366F1] text-white flex items-center justify-center hover:opacity-90 cursor-pointer"
        >
          {timer.isRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </button>
        <button
          type="button"
          onClick={onStopAndLog}
          aria-label="Finish and log session"
          title="Finish & log"
          className="w-9 h-9 rounded-lg border border-[#E5E5E0] dark:border-[#232834] text-[#141413] dark:text-[#F3F4F6] flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
        >
          <Square className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={onReturnToApp}
          aria-label="Return to workspace"
          title="Return to Sankalpa"
          className="w-9 h-9 rounded-lg text-[#5A5A55] dark:text-[#9CA3AF] flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
