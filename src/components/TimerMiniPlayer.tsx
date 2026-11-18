import React, { useEffect, useRef, useState } from 'react';
import {
  Eye,
  GripVertical,
  Maximize2,
  Pause,
  PictureInPicture2,
  Play,
  Square,
  X,
} from 'lucide-react';
import type { ActiveTimerState, SubjectConfig, SubjectKey } from '../types/app';
import { formatClockTimer } from '../utils/calendarMath';
import {
  clampDragCoordinates,
  computeNearestCorner,
  loadFloatingTimerPrefs,
  saveFloatingTimerPrefs,
  type FloatingCoords,
  type FloatingCorner,
  type FloatingTimerPrefs,
} from '../utils/floatingTimerMath';

interface TimerMiniPlayerProps {
  timer: ActiveTimerState;
  elapsedMs: number;
  subjects: Record<SubjectKey, SubjectConfig>;
  isPipSupported?: boolean;
  isPipOpen?: boolean;
  pipError?: string | null;
  onToggleRun: () => void;
  onRequestStop: () => void;
  onOpenTimer: () => void;
  onTogglePip?: () => void;
  onDismissPipError?: () => void;
}

const CORNER_POSITION_CLASSES: Record<FloatingCorner, string> = {
  'top-left': 'top-4 left-4',
  'top-right': 'top-4 right-4',
  'bottom-left': 'bottom-4 left-4',
  'bottom-right': 'bottom-4 right-4',
};

export const TimerMiniPlayer: React.FC<TimerMiniPlayerProps> = ({
  timer,
  elapsedMs,
  subjects,
  isPipSupported = false,
  isPipOpen = false,
  pipError = null,
  onToggleRun,
  onRequestStop,
  onOpenTimer,
  onTogglePip = () => {},
  onDismissPipError = () => {},
}) => {
  const hasProgress = timer.isRunning || timer.accumulatedMs > 0;

  const [prefs, setPrefs] = useState<FloatingTimerPrefs>(() => loadFloatingTimerPrefs());
  const [dragCoords, setDragCoords] = useState<FloatingCoords | null>(null);
  const [isInteracting, setIsInteracting] = useState(false);

  const desktopCardRef = useRef<HTMLDivElement | null>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      dragCleanupRef.current?.();
    };
  }, []);

  if (!hasProgress) return null;

  const subject = subjects[timer.subject] ?? subjects.general;
  const displayMs =
    timer.targetDurationMs !== null ? Math.max(0, timer.targetDurationMs - elapsedMs) : elapsedMs;
  const clockStr = formatClockTimer(displayMs);

  const isGhost = prefs.translucencyMode === 'ghost';
  const isDragging = dragCoords !== null;

  const handleToggleTranslucency = () => {
    const nextPrefs: FloatingTimerPrefs = {
      ...prefs,
      translucencyMode: prefs.translucencyMode === 'glass' ? 'ghost' : 'glass',
    };
    setPrefs(nextPrefs);
    saveFloatingTimerPrefs(nextPrefs);
  };

  const handlePointerDownDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button')) return;
    const el = desktopCardRef.current;
    if (!el) return;

    e.preventDefault();
    dragCleanupRef.current?.();

    const startRect = el.getBoundingClientRect();
    const offsetX = e.clientX - startRect.left;
    const offsetY = e.clientY - startRect.top;
    const widgetWidth = startRect.width;
    const widgetHeight = startRect.height;

    let latestCoords: FloatingCoords = { left: startRect.left, top: startRect.top };
    setDragCoords(latestCoords);

    const handleMove = (ev: PointerEvent) => {
      latestCoords = clampDragCoordinates(
        ev.clientX - offsetX,
        ev.clientY - offsetY,
        widgetWidth,
        widgetHeight,
        window.innerWidth,
        window.innerHeight,
        8
      );
      setDragCoords(latestCoords);
    };

    const cleanup = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
      if (dragCleanupRef.current === cleanup) {
        dragCleanupRef.current = null;
      }
    };

    const handleUp = () => {
      cleanup();
      const centerX = latestCoords.left + widgetWidth / 2;
      const centerY = latestCoords.top + widgetHeight / 2;
      const nearestCorner = computeNearestCorner(
        centerX,
        centerY,
        window.innerWidth,
        window.innerHeight
      );
      const nextPrefs: FloatingTimerPrefs = { ...prefs, corner: nearestCorner };
      setPrefs(nextPrefs);
      saveFloatingTimerPrefs(nextPrefs);
      setDragCoords(null);
    };

    dragCleanupRef.current = cleanup;
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
  };

  const surfaceClasses = isGhost
    ? 'bg-white/55 dark:bg-[#13161D]/55'
    : 'bg-white/75 dark:bg-[#13161D]/75';

  const isRightCorner = prefs.corner === 'top-right' || prefs.corner === 'bottom-right';
  const actionsOpen = isInteracting || isPipOpen;

  return (
    <>
      {/* Desktop Compact Translucent Floating Capsule with Magnetic 4-Corner Drag */}
      <div
        ref={desktopCardRef}
        data-testid="timer-mini-player"
        data-corner={prefs.corner}
        data-translucency={prefs.translucencyMode}
        onPointerDown={handlePointerDownDrag}
        onMouseEnter={() => setIsInteracting(true)}
        onMouseLeave={() => setIsInteracting(false)}
        onFocus={() => setIsInteracting(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setIsInteracting(false);
          }
        }}
        style={
          isDragging && dragCoords
            ? { transform: `translate3d(${dragCoords.left}px, ${dragCoords.top}px, 0)` }
            : undefined
        }
        className={`hidden sm:flex fixed z-[60] group items-center h-12 rounded-xl border border-[#E5E5E0]/80 dark:border-[#232834]/80 backdrop-blur-md backdrop-saturate-150 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.2),0_10px_28px_-6px_rgba(0,0,0,0.18)] px-2.5 gap-2 select-none ${surfaceClasses} ${
          isDragging
            ? 'top-0 left-0 cursor-grabbing opacity-100 transition-none'
            : `${CORNER_POSITION_CLASSES[prefs.corner]} cursor-grab transition-opacity duration-[180ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${
                actionsOpen
                  ? 'opacity-100'
                  : isGhost
                  ? 'opacity-70 hover:opacity-100 focus-within:opacity-100'
                  : 'opacity-80 hover:opacity-100 focus-within:opacity-100'
              }`
        }`}
      >
        {/* Stationary Core: Drag Handle, Subject Dot, Truncated Label & Live Clock */}
        <div
          className={`flex items-center gap-2 min-w-0 ${
            isRightCorner && !isDragging ? 'order-2' : 'order-1'
          }`}
        >
          <span
            data-testid="floating-timer-grip"
            className="text-[#5A5A55]/70 dark:text-[#9CA3AF]/70 flex items-center shrink-0"
            title="Drag to any corner"
            aria-hidden="true"
          >
            <GripVertical className="w-3.5 h-3.5" />
          </span>
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: subject.color }}
            title={subject.label}
            aria-hidden="true"
          />
          <span className="text-[11px] font-medium text-[#5A5A55] dark:text-[#9CA3AF] max-w-[90px] truncate">
            {timer.title.trim() || subject.label}
          </span>
          <span
            data-testid="floating-timer-clock"
            className="font-mono tabular-nums text-lg font-semibold tracking-tight text-[#141413] dark:text-[#F3F4F6] whitespace-nowrap"
          >
            {clockStr}
          </span>
        </div>

        {/* Progressive Disclosure Action Row (expands inward toward viewport center) */}
        <div
          className={`flex items-center gap-1 overflow-hidden transition-[max-width,opacity] duration-[150ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${
            isRightCorner && !isDragging ? 'order-1' : 'order-2'
          } ${
            actionsOpen
              ? 'max-w-[230px] opacity-100 pointer-events-auto'
              : 'max-w-0 opacity-0 pointer-events-none group-hover:max-w-[230px] group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:max-w-[230px] group-focus-within:opacity-100 group-focus-within:pointer-events-auto'
          }`}
        >
          <button
            type="button"
            onClick={onToggleRun}
            aria-label={timer.isRunning ? 'Pause study timer' : 'Resume study timer'}
            title={timer.isRunning ? 'Pause' : 'Resume'}
            className="w-9 h-9 rounded-lg bg-[#4338CA] dark:bg-[#6366F1] text-white flex items-center justify-center hover:opacity-90 transition-opacity shrink-0 cursor-pointer"
          >
            {timer.isRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={onRequestStop}
            aria-label="Finish and log session"
            title="Stop & log session"
            className="w-9 h-9 rounded-lg border border-[#E5E5E0]/90 dark:border-[#232834]/90 text-[#141413] dark:text-[#F3F4F6] flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 transition-colors shrink-0 cursor-pointer"
          >
            <Square className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={onOpenTimer}
            aria-label="Expand timer view"
            title="Open full Study Timer"
            className="w-9 h-9 rounded-lg text-[#5A5A55] dark:text-[#9CA3AF] flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 hover:text-[#141413] dark:hover:text-[#F3F4F6] transition-colors shrink-0 cursor-pointer"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>

          {isPipSupported && (
            <button
              type="button"
              onClick={onTogglePip}
              aria-pressed={isPipOpen}
              aria-label={
                isPipOpen
                  ? 'Close Always-on-Top Picture-in-Picture'
                  : 'Pin Always-on-Top (Picture-in-Picture)'
              }
              title={
                isPipOpen
                  ? 'Close Always-on-Top window'
                  : 'Pin Always-on-Top (stays above fullscreen video)'
              }
              className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors shrink-0 cursor-pointer ${
                isPipOpen
                  ? 'bg-[#4338CA]/15 dark:bg-[#6366F1]/25 text-[#4338CA] dark:text-[#A5B4FC]'
                  : 'text-[#5A5A55] dark:text-[#9CA3AF] hover:bg-black/5 dark:hover:bg-white/10 hover:text-[#141413] dark:hover:text-[#F3F4F6]'
              }`}
            >
              <PictureInPicture2 className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            type="button"
            onClick={handleToggleTranslucency}
            aria-pressed={isGhost}
            aria-label={
              isGhost
                ? 'Switch floating timer to frosted glass opacity'
                : 'Switch floating timer to subtle ghost opacity'
            }
            title={isGhost ? 'Ghost opacity (~55%)' : 'Frosted glass opacity (~75%)'}
            className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors shrink-0 cursor-pointer ${
              isGhost
                ? 'bg-black/5 dark:bg-white/10 text-[#141413] dark:text-[#F3F4F6]'
                : 'text-[#5A5A55] dark:text-[#9CA3AF] hover:bg-black/5 dark:hover:bg-white/10'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Inline PiP Error Notice (non-blocking) */}
        {pipError && (
          <div
            role="status"
            className="absolute -top-9 right-0 whitespace-nowrap rounded-lg bg-[#141413] dark:bg-[#1F2430] text-white text-[11px] px-2.5 py-1 flex items-center gap-1.5 shadow-md"
          >
            <span>{pipError}</span>
            <button
              type="button"
              onClick={onDismissPipError}
              aria-label="Dismiss PiP notice"
              className="opacity-75 hover:opacity-100 cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {/* Mobile Slim Centered Pill Docked Above Bottom Navigation Bar (h-11 = 44px) */}
      <div
        data-testid="timer-mini-player-mobile"
        className={`sm:hidden fixed bottom-16 left-1/2 -translate-x-1/2 z-[60] h-11 max-w-[calc(100vw-24px)] rounded-full border border-[#E5E5E0]/80 dark:border-[#232834]/80 backdrop-blur-md backdrop-saturate-150 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.2),0_8px_24px_-6px_rgba(0,0,0,0.18)] px-3 flex items-center gap-2 ${surfaceClasses}`}
      >
        <button
          type="button"
          onClick={onOpenTimer}
          aria-label="Open full study timer view"
          className="flex items-center gap-2 min-w-0 cursor-pointer"
        >
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: subject.color }}
            aria-hidden="true"
          />
          <span className="text-[11px] font-medium text-[#5A5A55] dark:text-[#9CA3AF] max-w-[72px] truncate">
            {timer.title.trim() || subject.label}
          </span>
          <span className="font-mono tabular-nums text-base font-semibold text-[#141413] dark:text-[#F3F4F6] whitespace-nowrap">
            {clockStr}
          </span>
        </button>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onToggleRun}
            aria-label={timer.isRunning ? 'Pause study timer' : 'Resume study timer'}
            className="w-9 h-9 rounded-full bg-[#4338CA] dark:bg-[#6366F1] text-white flex items-center justify-center cursor-pointer"
          >
            {timer.isRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={onRequestStop}
            aria-label="Finish and log session"
            className="w-9 h-9 rounded-full border border-[#E5E5E0]/90 dark:border-[#232834]/90 text-[#141413] dark:text-[#F3F4F6] flex items-center justify-center cursor-pointer"
          >
            <Square className="w-3.5 h-3.5" />
          </button>
          {isPipSupported && (
            <button
              type="button"
              onClick={onTogglePip}
              aria-label={isPipOpen ? 'Close PiP' : 'Open PiP'}
              className={`w-9 h-9 rounded-full flex items-center justify-center cursor-pointer ${
                isPipOpen
                  ? 'bg-[#4338CA]/15 dark:bg-[#6366F1]/25 text-[#4338CA] dark:text-[#A5B4FC]'
                  : 'text-[#5A5A55] dark:text-[#9CA3AF]'
              }`}
            >
              <PictureInPicture2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </>
  );
};
