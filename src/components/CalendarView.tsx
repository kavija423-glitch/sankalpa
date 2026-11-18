import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Play,
  Plus,
  Trash2,
  X,
  Calendar as CalendarIcon,
  Clock,
  GripVertical,
  Check,
} from 'lucide-react';
import type {
  CalendarBlock,
  ExamCountdown,
  StudySession,
  SubjectConfig,
  SubjectKey,
  TaskItem,
} from '../types/app';
import {
  clampBlockDuration,
  computeDragSelectionRange,
  computeOverlapLayout,
  daysUntilISO,
  DEFAULT_SCROLL_HOUR,
  formatDurationLabel,
  formatTime24,
  getWeekDaysISO,
  isOffPeakHour,
  snapEdgeMinutes,
  snapMinutes,
} from '../utils/calendarMath';
import { addDaysISO, toISODateLocal } from '../utils/nlpTaskParser';

interface CalendarViewProps {
  blocks: CalendarBlock[];
  sessions: StudySession[];
  tasks: TaskItem[];
  subjects: Record<SubjectKey, SubjectConfig>;
  examCountdowns: ExamCountdown[];
  onCreateBlock: (block: Omit<CalendarBlock, 'id' | 'updatedAt'>) => void;
  onUpdateBlock: (blockId: string, patch: Partial<CalendarBlock>) => void;
  onDeleteBlock: (blockId: string) => void;
  onScheduleTaskOnCalendar: (taskId: string, date: string, startMinutes: number) => void;
  onStartTimerFromBlock: (block: CalendarBlock) => void;
  onOpenLogSession: () => void;
  onEditManualSession: (session: StudySession) => void;
}

interface ActiveDragPayload {
  kind: 'task' | 'block';
  id: string;
  title: string;
  subject: SubjectKey;
  durationMinutes: number;
}

interface DropPreviewState {
  date: string;
  startMinutes: number;
  durationMinutes: number;
  title: string;
  subject: SubjectKey;
}

interface DragSelectState {
  date: string;
  anchorMinutes: number;
  startMinutes: number;
  endMinutes: number;
  durationMinutes: number;
  isActive: boolean;
}

const HOUR_HEIGHT = 52; // px per hour => 1248px total for 24h; 15m = 13px
const HOURS = Array.from({ length: 24 }, (_, i) => i);

export const CalendarView: React.FC<CalendarViewProps> = ({
  blocks,
  sessions,
  tasks,
  subjects,
  examCountdowns,
  onCreateBlock,
  onUpdateBlock,
  onDeleteBlock,
  onScheduleTaskOnCalendar,
  onStartTimerFromBlock,
  onOpenLogSession,
  onEditManualSession,
}) => {
  const todayISO = toISODateLocal(new Date());
  const [anchorDate, setAnchorDate] = useState(todayISO);
  const [viewMode, setViewMode] = useState<'week' | 'day'>(() =>
    typeof window !== 'undefined' && window.innerWidth < 768 ? 'day' : 'week'
  );
  const [showGhostOverlay, setShowGhostOverlay] = useState(true);
  const [showTaskDrawer, setShowTaskDrawer] = useState(false);

  // Drag & Drop Shadow Preview State (shared by HTML5 Drag + Touch/Pointer Drag)
  const [activeDrag, setActiveDrag] = useState<ActiveDragPayload | null>(null);
  const [dropPreview, setDropPreview] = useState<DropPreviewState | null>(null);
  const activeDragRef = useRef<ActiveDragPayload | null>(null);
  const dropPreviewRef = useRef<DropPreviewState | null>(null);

  const setDragState = (drag: ActiveDragPayload | null, preview: DropPreviewState | null) => {
    activeDragRef.current = drag;
    dropPreviewRef.current = preview;
    setActiveDrag(drag);
    setDropPreview(preview);
  };

  // Drag-to-Select New Block State
  const [dragSelection, setDragSelection] = useState<DragSelectState | null>(null);
  const dragSelectionCleanupRef = useRef<(() => void) | null>(null);

  // Block Resize State
  const [resizingBlock, setResizingBlock] = useState<{
    block: CalendarBlock;
    startY: number;
    initialDuration: number;
  } | null>(null);

  // Modal state for creating or editing a block
  const [editingBlock, setEditingBlock] = useState<{
    id?: string;
    title: string;
    subject: SubjectKey;
    date: string;
    startMinutes: number;
    durationMinutes: number;
    completed: boolean;
    notes: string;
    taskId: string | null;
  } | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const hasScrolledRef = useRef(false);

  useEffect(() => {
    return () => {
      dragSelectionCleanupRef.current?.();
    };
  }, []);

  // Auto-scroll to 06:00 on mount
  useEffect(() => {
    if (scrollRef.current && !hasScrolledRef.current) {
      scrollRef.current.scrollTop = DEFAULT_SCROLL_HOUR * HOUR_HEIGHT;
      hasScrolledRef.current = true;
    }
  }, []);

  const visibleDays = useMemo(() => {
    if (viewMode === 'day') return [anchorDate];
    return getWeekDaysISO(anchorDate);
  }, [anchorDate, viewMode]);

  const activeBlocks = useMemo(() => blocks.filter((b) => !b.deletedAt), [blocks]);

  const unscheduledTasks = useMemo(
    () => tasks.filter((t) => !t.deletedAt && !t.completed && !t.scheduledBlockId),
    [tasks]
  );

  // Current time indicator minutes
  const [nowMinutes, setNowMinutes] = useState(() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  });
  useEffect(() => {
    const id = window.setInterval(() => {
      const d = new Date();
      setNowMinutes(d.getHours() * 60 + d.getMinutes());
    }, 60000);
    return () => window.clearInterval(id);
  }, []);

  // Touch / Pointer Drag Handler (enables smooth drag + shadow preview on iOS/mobile & touch)
  const startPointerDrag = (
    e: React.PointerEvent,
    payload: ActiveDragPayload
  ) => {
    if (e.pointerType === 'mouse') {
      // Mouse uses native HTML5 drag-and-drop cleanly; keep pointer for touch/pen
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    setDragState(payload, null);

    const handleMove = (ev: PointerEvent) => {
      const els = document.elementsFromPoint(ev.clientX, ev.clientY);
      const colEl = els.find((el) => el instanceof HTMLElement && el.dataset.dayColumn) as
        | HTMLElement
        | undefined;
      if (!colEl || !colEl.dataset.dayColumn) {
        dropPreviewRef.current = null;
        setDropPreview(null);
        return;
      }
      const rect = colEl.getBoundingClientRect();
      const offsetY = ev.clientY - rect.top;
      const snapped = snapMinutes((offsetY / HOUR_HEIGHT) * 60);
      const durationMinutes = clampBlockDuration(snapped, payload.durationMinutes);
      const nextPreview: DropPreviewState = {
        date: colEl.dataset.dayColumn,
        startMinutes: snapped,
        durationMinutes,
        title: payload.title,
        subject: payload.subject,
      };
      dropPreviewRef.current = nextPreview;
      setDropPreview(nextPreview);
    };

    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);

      const finalPreview = dropPreviewRef.current;
      const finalDrag = activeDragRef.current;
      if (finalPreview && finalDrag) {
        if (finalDrag.kind === 'task') {
          onScheduleTaskOnCalendar(finalDrag.id, finalPreview.date, finalPreview.startMinutes);
        } else {
          onUpdateBlock(finalDrag.id, {
            date: finalPreview.date,
            startMinutes: finalPreview.startMinutes,
          });
        }
      }
      setDragState(null, null);
    };

    window.addEventListener('pointermove', handleMove, { passive: false });
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
  };

  // Bottom-edge Block Resize Effect
  useEffect(() => {
    if (!resizingBlock) return;
    const handleMove = (ev: PointerEvent) => {
      const deltaY = ev.clientY - resizingBlock.startY;
      const deltaMins = (deltaY / HOUR_HEIGHT) * 60;
      const nextDuration = clampBlockDuration(
        resizingBlock.block.startMinutes,
        resizingBlock.initialDuration + deltaMins
      );
      if (nextDuration !== resizingBlock.block.durationMinutes) {
        onUpdateBlock(resizingBlock.block.id, { durationMinutes: nextDuration });
      }
    };
    const handleUp = () => {
      setResizingBlock(null);
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
    };
  }, [resizingBlock, onUpdateBlock]);

  const handleNavigate = (dir: -1 | 1) => {
    setAnchorDate((prev) => addDaysISO(prev, dir * (viewMode === 'week' ? 7 : 1)));
  };

  const closeModal = () => {
    setEditingBlock(null);
    setDragSelection(null);
  };

  const openCreateModalForRange = (
    date: string,
    startMinutes: number,
    durationMinutes: number
  ) => {
    setDragSelection({
      date,
      anchorMinutes: startMinutes,
      startMinutes,
      endMinutes: startMinutes + durationMinutes,
      durationMinutes,
      isActive: false,
    });
    setEditingBlock({
      title: '',
      subject: 'physics',
      date,
      startMinutes,
      durationMinutes,
      completed: false,
      notes: '',
      taskId: null,
    });
  };

  const handleColumnPointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    date: string
  ) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-calendar-block="true"], button')) return;
    if (activeDragRef.current || resizingBlock || editingBlock) return;

    const colEl = e.currentTarget;
    const initialRect = colEl.getBoundingClientRect();
    const anchorMinutes = snapMinutes(((e.clientY - initialRect.top) / HOUR_HEIGHT) * 60);
    const downClientX = e.clientX;
    const downClientY = e.clientY;
    const isMouse = e.pointerType === 'mouse';

    dragSelectionCleanupRef.current?.();

    let selectionActivated = isMouse;
    let hasDragged = false;
    let cancelled = false;
    let scrolledBeforeHold = false;
    let holdTimer: number | null = null;
    let currentRange = computeDragSelectionRange(anchorMinutes, anchorMinutes, 15);

    if (isMouse) {
      e.preventDefault();
      setDragSelection({
        date,
        anchorMinutes,
        startMinutes: currentRange.startMinutes,
        endMinutes: currentRange.endMinutes,
        durationMinutes: currentRange.durationMinutes,
        isActive: true,
      });
    } else {
      holdTimer = window.setTimeout(() => {
        if (cancelled || scrolledBeforeHold) return;
        selectionActivated = true;
        setDragSelection({
          date,
          anchorMinutes,
          startMinutes: currentRange.startMinutes,
          endMinutes: currentRange.endMinutes,
          durationMinutes: currentRange.durationMinutes,
          isActive: true,
        });
      }, 220);
    }

    const cleanup = () => {
      if (holdTimer !== null) {
        window.clearTimeout(holdTimer);
        holdTimer = null;
      }
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleCancel);
      window.removeEventListener('keydown', handleKeyDown);
      if (dragSelectionCleanupRef.current === cleanup) {
        dragSelectionCleanupRef.current = null;
      }
    };

    const handleKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        cancelled = true;
        cleanup();
        setDragSelection(null);
      }
    };

    const handleMove = (ev: PointerEvent) => {
      if (cancelled) return;
      const distY = Math.abs(ev.clientY - downClientY);
      const distX = Math.abs(ev.clientX - downClientX);

      if (!selectionActivated) {
        if (distY > 8 || distX > 8) {
          scrolledBeforeHold = true;
          cleanup();
        }
        return;
      }

      if (ev.cancelable) ev.preventDefault();

      const colRect = colEl.getBoundingClientRect();
      const rawMinutes = ((ev.clientY - colRect.top) / HOUR_HEIGHT) * 60;
      const snappedEdge = snapEdgeMinutes(rawMinutes);

      if (distY >= 6 || distX >= 6 || snappedEdge !== anchorMinutes) {
        hasDragged = true;
      }

      currentRange = computeDragSelectionRange(anchorMinutes, rawMinutes, 15);
      setDragSelection({
        date,
        anchorMinutes,
        startMinutes: currentRange.startMinutes,
        endMinutes: currentRange.endMinutes,
        durationMinutes: currentRange.durationMinutes,
        isActive: true,
      });
    };

    const handleCancel = () => {
      cancelled = true;
      cleanup();
      setDragSelection(null);
    };

    const handleUp = () => {
      cleanup();
      if (cancelled || scrolledBeforeHold) {
        setDragSelection(null);
        return;
      }

      if (!hasDragged) {
        const defaultDuration = clampBlockDuration(anchorMinutes, 30);
        openCreateModalForRange(date, anchorMinutes, defaultDuration);
        return;
      }

      openCreateModalForRange(
        date,
        currentRange.startMinutes,
        currentRange.durationMinutes
      );
    };

    dragSelectionCleanupRef.current = cleanup;
    window.addEventListener('pointermove', handleMove, { passive: false });
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleCancel);
    window.addEventListener('keydown', handleKeyDown);
  };

  const handleDragOverDay = (e: React.DragEvent, date: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    const snapped = snapMinutes((offsetY / HOUR_HEIGHT) * 60);

    const drag = activeDragRef.current;
    const fallbackDuration = drag?.durationMinutes ?? 60;
    const durationMinutes = clampBlockDuration(snapped, fallbackDuration);

    const nextPreview: DropPreviewState = {
      date,
      startMinutes: snapped,
      durationMinutes,
      title: drag?.title ?? 'Scheduled Study Block',
      subject: drag?.subject ?? 'general',
    };

    const prev = dropPreviewRef.current;
    if (
      !prev ||
      prev.date !== nextPreview.date ||
      prev.startMinutes !== nextPreview.startMinutes ||
      prev.durationMinutes !== nextPreview.durationMinutes
    ) {
      dropPreviewRef.current = nextPreview;
      setDropPreview(nextPreview);
    }
  };

  const handleDropOnDay = (e: React.DragEvent, date: string) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    const snapped = snapMinutes((offsetY / HOUR_HEIGHT) * 60);

    const taskId =
      e.dataTransfer.getData('text/sankalpa-task-id') ||
      (activeDragRef.current?.kind === 'task' ? activeDragRef.current.id : '');
    const blockId =
      e.dataTransfer.getData('text/sankalpa-block-id') ||
      (activeDragRef.current?.kind === 'block' ? activeDragRef.current.id : '');

    if (taskId) {
      onScheduleTaskOnCalendar(taskId, date, snapped);
    } else if (blockId) {
      onUpdateBlock(blockId, { date, startMinutes: snapped });
    }
    setDragState(null, null);
  };

  const formatDayHeader = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(y, (m || 1) - 1, d || 1);
    return {
      weekday: dt.toLocaleDateString('en-US', { weekday: 'short' }),
      dayNum: String(d).padStart(2, '0'),
      month: dt.toLocaleDateString('en-US', { month: 'short' }),
    };
  };

  const handleSaveModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBlock) return;
    const title = editingBlock.title.trim() || 'Focused Study Block';
    const startMinutes = snapMinutes(editingBlock.startMinutes);
    const durationMinutes = clampBlockDuration(startMinutes, editingBlock.durationMinutes);

    if (editingBlock.id) {
      onUpdateBlock(editingBlock.id, {
        title,
        subject: editingBlock.subject,
        date: editingBlock.date,
        startMinutes,
        durationMinutes,
        completed: editingBlock.completed,
        notes: editingBlock.notes,
      });
    } else {
      onCreateBlock({
        title,
        subject: editingBlock.subject,
        date: editingBlock.date,
        startMinutes,
        durationMinutes,
        completed: editingBlock.completed,
        taskId: editingBlock.taskId,
        notes: editingBlock.notes,
      });
    }
    closeModal();
  };

  const isSelectingSlot = Boolean(dragSelection?.isActive);

  const durationOptions = useMemo(() => {
    if (!editingBlock) return [15, 30, 45, 60];
    const maxAllowed = Math.max(15, 1440 - editingBlock.startMinutes);
    const cap = Math.min(maxAllowed, Math.max(480, editingBlock.durationMinutes));
    const opts: number[] = [];
    for (let m = 15; m <= cap; m += 15) {
      opts.push(m);
    }
    return opts;
  }, [editingBlock]);

  const endTimeOptions = useMemo(() => {
    if (!editingBlock) return [];
    const opts: number[] = [];
    for (let m = editingBlock.startMinutes + 15; m <= 1440; m += 15) {
      opts.push(m);
    }
    return opts;
  }, [editingBlock]);

  return (
    <div className={`flex flex-col h-full min-h-0 w-full ${isSelectingSlot ? 'select-none' : ''}`}>
      {/* Top Calendar Toolbar & Exam Countdowns */}
      <div className="shrink-0 px-4 sm:px-6 pt-4 pb-3 border-b border-[#E5E5E0] dark:border-[#232834] bg-[#F7F7F5] dark:bg-[#0B0D11] space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-[#141413] dark:text-[#F3F4F6] whitespace-nowrap">
              24h Time-Block
            </h1>
            <div className="flex items-center rounded-lg border border-[#E5E5E0] dark:border-[#232834] bg-white dark:bg-[#13161D]">
              <button
                type="button"
                onClick={() => handleNavigate(-1)}
                aria-label="Previous period"
                className="p-2 text-[#5A5A55] dark:text-[#9CA3AF] hover:text-[#141413] dark:hover:text-[#F3F4F6] cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setAnchorDate(todayISO)}
                className="px-2.5 py-1.5 text-xs font-semibold text-[#141413] dark:text-[#F3F4F6] hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer whitespace-nowrap"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => handleNavigate(1)}
                aria-label="Next period"
                className="p-2 text-[#5A5A55] dark:text-[#9CA3AF] hover:text-[#141413] dark:hover:text-[#F3F4F6] cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Ghost Overlay Toggle */}
            <button
              type="button"
              onClick={() => setShowGhostOverlay((v) => !v)}
              aria-pressed={showGhostOverlay}
              className={`min-h-[38px] px-3 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                showGhostOverlay
                  ? 'border-[#4338CA] dark:border-[#6366F1] bg-indigo-50/70 dark:bg-indigo-950/40 text-[#4338CA] dark:text-[#A5B4FC]'
                  : 'border-[#E5E5E0] dark:border-[#232834] bg-white dark:bg-[#13161D] text-[#5A5A55] dark:text-[#9CA3AF]'
              }`}
            >
              {showGhostOverlay ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              <span>Actual Ghost</span>
            </button>

            {/* Week / Day Switcher */}
            <div className="flex items-center p-0.5 rounded-lg bg-[#ECECE7] dark:bg-[#13161D] border border-[#E5E5E0] dark:border-[#232834]">
              <button
                type="button"
                onClick={() => setViewMode('day')}
                className={`px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer whitespace-nowrap ${
                  viewMode === 'day'
                    ? 'bg-white dark:bg-[#1F2430] text-[#141413] dark:text-[#F3F4F6] shadow-xs'
                    : 'text-[#5A5A55] dark:text-[#9CA3AF]'
                }`}
              >
                Day
              </button>
              <button
                type="button"
                onClick={() => setViewMode('week')}
                className={`px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer whitespace-nowrap ${
                  viewMode === 'week'
                    ? 'bg-white dark:bg-[#1F2430] text-[#141413] dark:text-[#F3F4F6] shadow-xs'
                    : 'text-[#5A5A55] dark:text-[#9CA3AF]'
                }`}
              >
                Week
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowTaskDrawer((v) => !v)}
              className="min-h-[38px] px-3 py-1.5 rounded-lg border border-[#E5E5E0] dark:border-[#232834] bg-white dark:bg-[#13161D] text-xs font-medium text-[#141413] dark:text-[#F3F4F6] hover:bg-black/5 dark:hover:bg-white/5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              Queue ({unscheduledTasks.length})
            </button>

            <button
              type="button"
              onClick={onOpenLogSession}
              data-testid="calendar-log-session-btn"
              className="min-h-[38px] px-3 py-1.5 rounded-lg border border-[#E5E5E0] dark:border-[#232834] bg-white dark:bg-[#13161D] text-xs font-semibold text-[#141413] dark:text-[#F3F4F6] hover:bg-black/5 dark:hover:bg-white/5 flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Clock className="w-3.5 h-3.5 text-[#4338CA] dark:text-[#818CF8]" />
              <span>+ Log Session</span>
            </button>

            <button
              type="button"
              onClick={() =>
                setEditingBlock({
                  title: '',
                  subject: 'physics',
                  date: anchorDate,
                  startMinutes: 480,
                  durationMinutes: 60,
                  completed: false,
                  notes: '',
                  taskId: null,
                })
              }
              className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-[#4338CA] dark:bg-[#6366F1] text-white text-xs font-semibold flex items-center gap-1.5 hover:opacity-90 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Block</span>
            </button>
          </div>
        </div>

        {/* Exam Countdowns & Drag Hint */}
        {(examCountdowns.length > 0 || activeDrag) && (
          <div className="flex items-center gap-x-4 overflow-x-auto no-scrollbar text-xs text-[#5A5A55] dark:text-[#9CA3AF] whitespace-nowrap">
            {examCountdowns.map((ex) => {
              const remaining = daysUntilISO(ex.date);
              return (
                <div key={ex.id} className="flex items-center gap-1.5 tabular-nums shrink-0">
                  <CalendarIcon className="w-3.5 h-3.5 text-[#4338CA] dark:text-[#818CF8]" />
                  <span className="font-medium text-[#141413] dark:text-[#F3F4F6]">{ex.title}:</span>
                  <span className="font-mono font-semibold text-[#4338CA] dark:text-[#A5B4FC]">
                    {remaining >= 0 ? `${remaining}d left` : 'Completed'}
                  </span>
                </div>
              );
            })}
            {activeDrag && dropPreview && (
              <span className="font-mono font-semibold text-[#4338CA] dark:text-[#A5B4FC]">
                Drop preview: {dropPreview.date} · {formatTime24(dropPreview.startMinutes)} –{' '}
                {formatTime24(dropPreview.startMinutes + dropPreview.durationMinutes)}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Main Split: Calendar Grid + Optional Unscheduled Task Drawer */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Scrollable 24h Calendar */}
        <div className="flex-1 min-w-0 min-h-0 flex flex-col">
          {/* Sticky Day Column Headers */}
          <div
            className="shrink-0 grid border-b border-[#E5E5E0] dark:border-[#232834] bg-white dark:bg-[#13161D]"
            style={{ gridTemplateColumns: `56px repeat(${visibleDays.length}, minmax(0, 1fr))` }}
          >
            <div className="py-2.5 text-center text-[10px] font-mono text-[#5A5A55] dark:text-[#9CA3AF] border-r border-[#E5E5E0] dark:border-[#232834]">
              24H
            </div>
            {visibleDays.map((iso) => {
              const { weekday, dayNum, month } = formatDayHeader(iso);
              const isToday = iso === todayISO;
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => setAnchorDate(iso)}
                  className={`py-2 px-2 text-center border-r last:border-r-0 border-[#E5E5E0] dark:border-[#232834] cursor-pointer ${
                    isToday ? 'bg-indigo-50/70 dark:bg-indigo-950/30' : ''
                  }`}
                >
                  <div className="text-[11px] font-medium text-[#5A5A55] dark:text-[#9CA3AF]">
                    {weekday}
                  </div>
                  <div
                    className={`font-mono tabular-nums text-sm font-semibold mt-0.5 ${
                      isToday
                        ? 'text-[#4338CA] dark:text-[#818CF8]'
                        : 'text-[#141413] dark:text-[#F3F4F6]'
                    }`}
                  >
                    {dayNum} {viewMode === 'day' ? month : ''}
                  </div>
                </button>
              );
            })}
          </div>

          {/* 00:00–24:00 Time Grid */}
          <div
            ref={scrollRef}
            data-testid="calendar-scroll-viewport"
            className={`flex-1 min-h-0 overflow-y-auto ios-scroll bg-white dark:bg-[#0F1218] ${
              isSelectingSlot ? 'touch-none select-none' : 'touch-pan-y'
            }`}
          >
            <div
              className="relative grid"
              style={{
                height: `${24 * HOUR_HEIGHT}px`,
                gridTemplateColumns: `56px repeat(${visibleDays.length}, minmax(0, 1fr))`,
              }}
            >
              {/* Left Hour Gutter */}
              <div className="relative border-r border-[#E5E5E0] dark:border-[#232834] bg-[#FAFAF8] dark:bg-[#0B0D11]">
                {HOURS.map((hour) => (
                  <div
                    key={hour}
                    style={{ height: `${HOUR_HEIGHT}px` }}
                    className="relative border-b border-[#E5E5E0]/70 dark:border-[#232834]/70 pr-2 text-right"
                  >
                    <span className="font-mono tabular-nums text-[10px] text-[#5A5A55] dark:text-[#9CA3AF] top-1 relative">
                      {String(hour).padStart(2, '0')}:00
                    </span>
                  </div>
                ))}
              </div>

              {/* Day Columns */}
              {visibleDays.map((iso) => {
                const dayBlocks = activeBlocks.filter((b) => b.date === iso);
                const laidOutBlocks = computeOverlapLayout(dayBlocks);

                const activeDaySessions = sessions.filter((s) => !s.deletedAt && s.date === iso);
                const dayManualSpans = activeDaySessions
                  .filter((s) => Boolean(s.isManual))
                  .map((s) => {
                    const dt = new Date(s.startTimestamp);
                    const startMinutes = dt.getHours() * 60 + dt.getMinutes();
                    return {
                      id: s.id,
                      startMinutes,
                      durationMinutes: Math.max(15, s.durationMinutes),
                      session: s,
                    };
                  });
                const laidOutManualSessions = computeOverlapLayout(dayManualSpans);

                const daySessions = showGhostOverlay
                  ? activeDaySessions
                      .filter((s) => !s.isManual)
                      .map((s) => {
                        const dt = new Date(s.startTimestamp);
                        const startMinutes = dt.getHours() * 60 + dt.getMinutes();
                        return {
                          id: s.id,
                          startMinutes,
                          durationMinutes: Math.max(15, s.durationMinutes),
                          session: s,
                        };
                      })
                  : [];

                const isToday = iso === todayISO;
                const colDropPreview = dropPreview && dropPreview.date === iso ? dropPreview : null;
                const colDragSelection =
                  dragSelection && dragSelection.date === iso ? dragSelection : null;

                return (
                  <div
                    key={iso}
                    data-day-column={iso}
                    onDragOver={(e) => handleDragOverDay(e, iso)}
                    onDragLeave={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                        if (dropPreviewRef.current?.date === iso) {
                          dropPreviewRef.current = null;
                          setDropPreview(null);
                        }
                      }
                    }}
                    onDrop={(e) => handleDropOnDay(e, iso)}
                    onPointerDown={(e) => handleColumnPointerDown(e, iso)}
                    className="relative border-r last:border-r-0 border-[#E5E5E0] dark:border-[#232834] cursor-crosshair"
                  >
                    {/* Hour Background Cells with Off-Peak Shading */}
                    {HOURS.map((hour) => (
                      <div
                        key={hour}
                        data-hour-cell="true"
                        style={{ height: `${HOUR_HEIGHT}px` }}
                        className={`border-b border-[#E5E5E0]/60 dark:border-[#232834]/60 ${
                          isOffPeakHour(hour)
                            ? 'bg-[#F0F0EC]/75 dark:bg-[#080A0E]/85'
                            : 'bg-transparent'
                        }`}
                      />
                    ))}

                    {/* Current Time Indicator */}
                    {isToday && (
                      <div
                        style={{ top: `${(nowMinutes / 60) * HOUR_HEIGHT}px` }}
                        className="absolute left-0 right-0 z-20 pointer-events-none flex items-center"
                      >
                        <span className="w-2 h-2 rounded-full bg-rose-500 -ml-1" />
                        <div className="flex-1 h-[1.5px] bg-rose-500" />
                      </div>
                    )}

                    {/* Drag-to-Select Ghost Range Preview (15-min snapped) */}
                    {colDragSelection && (
                      <div
                        data-testid="calendar-drag-select-ghost"
                        style={{
                          top: `${(colDragSelection.startMinutes / 60) * HOUR_HEIGHT}px`,
                          height: `${Math.max(24, (colDragSelection.durationMinutes / 60) * HOUR_HEIGHT)}px`,
                        }}
                        className="absolute left-[2%] right-[2%] z-30 rounded-lg border-2 border-[#4338CA] dark:border-[#6366F1] bg-indigo-500/20 dark:bg-indigo-400/25 px-1.5 py-1 pointer-events-none flex items-start shadow-sm backdrop-blur-[1px] overflow-hidden"
                      >
                        <span
                          data-testid="calendar-drag-select-badge"
                          className="inline-flex items-center rounded-md bg-[#4338CA] dark:bg-[#6366F1] text-white px-1.5 py-0.5 text-[10px] font-mono tabular-nums font-semibold shadow-xs whitespace-nowrap max-w-full truncate"
                        >
                          {formatTime24(colDragSelection.startMinutes)} –{' '}
                          {formatTime24(colDragSelection.endMinutes)} (
                          {formatDurationLabel(colDragSelection.durationMinutes)})
                        </span>
                      </div>
                    )}

                    {/* Real-Time Drop-Target Shadow Preview (15-min snapped) */}
                    {colDropPreview && (
                      <div
                        data-testid="calendar-drop-preview"
                        style={{
                          top: `${(colDropPreview.startMinutes / 60) * HOUR_HEIGHT}px`,
                          height: `${Math.max(24, (colDropPreview.durationMinutes / 60) * HOUR_HEIGHT)}px`,
                          borderColor: (subjects[colDropPreview.subject] ?? subjects.general).color,
                          backgroundColor: `${(subjects[colDropPreview.subject] ?? subjects.general).color}24`,
                        }}
                        className="absolute left-[2%] right-[2%] z-30 rounded-lg border-2 border-dashed px-2 py-1 pointer-events-none flex flex-col justify-between backdrop-blur-[1px]"
                      >
                        <div className="text-[11px] font-semibold text-[#141413] dark:text-[#F3F4F6] truncate">
                          {colDropPreview.title}
                        </div>
                        <div className="text-[10px] font-mono tabular-nums font-bold text-[#141413] dark:text-[#F3F4F6]">
                          {formatTime24(colDropPreview.startMinutes)} –{' '}
                          {formatTime24(colDropPreview.startMinutes + colDropPreview.durationMinutes)}
                        </div>
                      </div>
                    )}

                    {/* Planned vs Actual Ghost Overlay (Actual Logged Sessions in dedicated right lane) */}
                    {daySessions.map(({ id, startMinutes, durationMinutes, session }) => {
                      const sub = subjects[session.subject] ?? subjects.general;
                      const top = (startMinutes / 60) * HOUR_HEIGHT;
                      const height = Math.max(20, (durationMinutes / 60) * HOUR_HEIGHT);
                      return (
                        <div
                          key={`ghost_${id}`}
                          data-testid="calendar-ghost-session"
                          style={{
                            top: `${top}px`,
                            height: `${height}px`,
                            borderColor: sub.color,
                            backgroundColor: `${sub.color}18`,
                          }}
                          title={`Actual: ${session.title} (${session.durationMinutes}m)`}
                          className="absolute right-1 left-[59%] z-10 rounded-md border border-dashed px-1.5 py-0.5 pointer-events-none overflow-hidden"
                        >
                          <div className="text-[10px] font-mono font-semibold truncate" style={{ color: sub.color }}>
                            Actual · {session.durationMinutes}m
                          </div>
                        </div>
                      );
                    })}

                    {/* Manually Logged Recorded Session Blocks */}
                    {laidOutManualSessions.map(({ item: ms, column, totalColumns }) => {
                      const ses = ms.session;
                      const sub = subjects[ses.subject] ?? subjects.general;
                      const exactDuration = Math.max(1, ses.durationMinutes);
                      const top = (ms.startMinutes / 60) * HOUR_HEIGHT;
                      const height = Math.max(24, (exactDuration / 60) * HOUR_HEIGHT);
                      const overlapsPlanned = dayBlocks.some(
                        (blk) =>
                          blk.startMinutes < ms.startMinutes + ms.durationMinutes &&
                          blk.startMinutes + blk.durationMinutes > ms.startMinutes
                      );
                      const laneWidth = overlapsPlanned ? 39 / totalColumns : 96 / totalColumns;
                      const laneLeft = overlapsPlanned ? 59 + column * laneWidth : 2 + column * laneWidth;

                      return (
                        <button
                          key={`manual_${ses.id}`}
                          type="button"
                          data-calendar-block="true"
                          data-testid="calendar-manual-session"
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditManualSession(ses);
                          }}
                          style={{
                            top: `${top}px`,
                            height: `${height}px`,
                            left: `${laneLeft}%`,
                            width: `${laneWidth - 1}%`,
                            backgroundColor: `${sub.color}1F`,
                            borderColor: sub.color,
                          }}
                          title={`Manual: ${ses.title} (${formatDurationLabel(exactDuration)}) — Click to edit`}
                          className="absolute z-15 rounded-lg border px-2 py-1 text-left overflow-hidden cursor-pointer hover:brightness-95 transition-all"
                        >
                          <div className="flex items-center justify-between gap-1">
                            <div className="flex items-center gap-1 min-w-0">
                              <span
                                className="w-3.5 h-3.5 rounded-xs flex items-center justify-center shrink-0 text-white"
                                style={{ backgroundColor: sub.color }}
                              >
                                <Check className="w-2.5 h-2.5" />
                              </span>
                              <span className="text-[11px] font-semibold text-[#141413] dark:text-[#F3F4F6] truncate leading-tight">
                                {ses.title}
                              </span>
                            </div>
                            <span
                              className="shrink-0 rounded px-1 py-0.2 text-[9px] font-semibold uppercase tracking-wide border"
                              style={{
                                color: sub.color,
                                borderColor: `${sub.color}66`,
                                backgroundColor: `${sub.color}14`,
                              }}
                            >
                              Manual
                            </span>
                          </div>
                          {height >= 36 && (
                            <div className="text-[10px] font-mono tabular-nums text-[#5A5A55] dark:text-[#D1D5DB] truncate mt-0.5">
                              {formatTime24(ms.startMinutes)} – {formatTime24(ms.startMinutes + exactDuration)} · {formatDurationLabel(exactDuration)}
                            </div>
                          )}
                        </button>
                      );
                    })}

                    {/* Scheduled Planned Blocks */}
                    {laidOutBlocks.map(({ item: blk, column, totalColumns }) => {
                      const sub = subjects[blk.subject] ?? subjects.general;
                      const top = (blk.startMinutes / 60) * HOUR_HEIGHT;
                      const height = Math.max(24, (blk.durationMinutes / 60) * HOUR_HEIGHT);
                      const hasGhostOverlap =
                        daySessions.some(
                          (gs) =>
                            gs.startMinutes < blk.startMinutes + blk.durationMinutes &&
                            gs.startMinutes + gs.durationMinutes > blk.startMinutes
                        ) ||
                        dayManualSpans.some(
                          (ms) =>
                            ms.startMinutes < blk.startMinutes + blk.durationMinutes &&
                            ms.startMinutes + ms.durationMinutes > blk.startMinutes
                        );
                      const widthPct = hasGhostOverlap ? 55 / totalColumns : 96 / totalColumns;
                      const leftPct = 2 + column * widthPct;
                      const isBeingDragged =
                        activeDrag?.kind === 'block' && activeDrag.id === blk.id;

                      return (
                        <div
                          key={blk.id}
                          data-calendar-block="true"
                          draggable
                          onDragStart={(e) => {
                            const payload: ActiveDragPayload = {
                              kind: 'block',
                              id: blk.id,
                              title: blk.title,
                              subject: blk.subject,
                              durationMinutes: blk.durationMinutes,
                            };
                            e.dataTransfer.setData('text/sankalpa-block-id', blk.id);
                            e.dataTransfer.effectAllowed = 'move';
                            setDragState(payload, null);
                          }}
                          onDragEnd={() => setDragState(null, null)}
                          onPointerDown={(e) => {
                            if ((e.target as HTMLElement).closest('button')) return;
                            startPointerDrag(e, {
                              kind: 'block',
                              id: blk.id,
                              title: blk.title,
                              subject: blk.subject,
                              durationMinutes: blk.durationMinutes,
                            });
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingBlock({
                              id: blk.id,
                              title: blk.title,
                              subject: blk.subject,
                              date: blk.date,
                              startMinutes: blk.startMinutes,
                              durationMinutes: blk.durationMinutes,
                              completed: Boolean(blk.completed),
                              notes: blk.notes,
                              taskId: blk.taskId,
                            });
                          }}
                          style={{
                            top: `${top}px`,
                            height: `${height}px`,
                            left: `${leftPct}%`,
                            width: `${widthPct - 1}%`,
                            backgroundColor: `${sub.color}1F`,
                            borderColor: sub.color,
                          }}
                          className={`absolute z-10 rounded-lg border px-2 py-1 overflow-hidden cursor-pointer hover:brightness-95 group ${
                            isBeingDragged ? 'opacity-40' : blk.completed ? 'opacity-65' : ''
                          }`}
                        >
                          <div className="flex items-start justify-between gap-1">
                            <div className="flex items-center gap-1 min-w-0">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onUpdateBlock(blk.id, { completed: !blk.completed });
                                }}
                                aria-label={
                                  blk.completed
                                    ? `Mark block ${blk.title} incomplete`
                                    : `Mark block ${blk.title} complete`
                                }
                                className={`w-3.5 h-3.5 rounded-xs border flex items-center justify-center shrink-0 cursor-pointer ${
                                  blk.completed
                                    ? 'bg-[#141413] dark:bg-[#F3F4F6] border-transparent text-white dark:text-[#141413]'
                                    : 'border-current/40 bg-white/70 dark:bg-black/30'
                                }`}
                              >
                                {blk.completed && <Check className="w-2.5 h-2.5" />}
                              </button>
                              <span
                                className={`text-[11px] font-semibold text-[#141413] dark:text-[#F3F4F6] truncate leading-tight ${
                                  blk.completed ? 'line-through' : ''
                                }`}
                              >
                                {blk.title}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onStartTimerFromBlock(blk);
                              }}
                              aria-label={`Start timer for ${blk.title}`}
                              className="opacity-80 hover:opacity-100 p-0.5 rounded bg-white/80 dark:bg-black/40 text-[#141413] dark:text-[#F3F4F6] shrink-0 cursor-pointer"
                            >
                              <Play className="w-2.5 h-2.5" />
                            </button>
                          </div>
                          {height >= 36 && (
                            <div className="text-[10px] font-mono tabular-nums text-[#5A5A55] dark:text-[#D1D5DB] truncate mt-0.5">
                              {formatTime24(blk.startMinutes)} – {formatTime24(blk.startMinutes + blk.durationMinutes)}
                            </div>
                          )}

                          {/* Bottom Resize Handle */}
                          <div
                            onPointerDown={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              setResizingBlock({
                                block: blk,
                                startY: e.clientY,
                                initialDuration: blk.durationMinutes,
                              });
                            }}
                            onClick={(e) => e.stopPropagation()}
                            title="Drag bottom edge to resize"
                            className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize opacity-0 group-hover:opacity-100 bg-black/10 dark:bg-white/10"
                          />
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Unscheduled Tasks Drawer (Drag & Drop or Tap to Schedule) */}
        {showTaskDrawer && (
          <aside className="w-72 sm:w-80 shrink-0 border-l border-[#E5E5E0] dark:border-[#232834] bg-[#F7F7F5] dark:bg-[#13161D] flex flex-col min-h-0">
            <div className="p-4 border-b border-[#E5E5E0] dark:border-[#232834] flex items-center justify-between">
              <div>
                <h2 className="font-display text-sm font-semibold text-[#141413] dark:text-[#F3F4F6]">
                  Task Backlog
                </h2>
                <p className="text-[11px] text-[#5A5A55] dark:text-[#9CA3AF]">
                  Drag onto grid for snapped preview
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowTaskDrawer(false)}
                aria-label="Close task queue drawer"
                className="p-1.5 rounded-lg text-[#5A5A55] dark:text-[#9CA3AF] hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto ios-scroll p-3 space-y-2">
              {unscheduledTasks.length === 0 ? (
                <p className="text-xs text-[#5A5A55] dark:text-[#9CA3AF] p-2">
                  No unscheduled tasks. Add tasks in Smart Tasks or click any calendar slot to create a linked block + task.
                </p>
              ) : (
                unscheduledTasks.map((t) => {
                  const sub = subjects[t.subject] ?? subjects.general;
                  return (
                    <div
                      key={t.id}
                      draggable
                      data-testid={`backlog-task-${t.id}`}
                      onDragStart={(e) => {
                        const payload: ActiveDragPayload = {
                          kind: 'task',
                          id: t.id,
                          title: t.title,
                          subject: t.subject,
                          durationMinutes: t.durationMinutes,
                        };
                        e.dataTransfer.setData('text/sankalpa-task-id', t.id);
                        e.dataTransfer.effectAllowed = 'move';
                        setDragState(payload, null);
                      }}
                      onDragEnd={() => setDragState(null, null)}
                      onPointerDown={(e) =>
                        startPointerDrag(e, {
                          kind: 'task',
                          id: t.id,
                          title: t.title,
                          subject: t.subject,
                          durationMinutes: t.durationMinutes,
                        })
                      }
                      className="rounded-xl bg-white dark:bg-[#0B0D11] border border-[#E5E5E0] dark:border-[#232834] p-3 space-y-2 cursor-grab active:cursor-grabbing select-none"
                    >
                      <div className="flex items-start gap-2">
                        <span className="touch-none pt-0.5 shrink-0" title="Drag to calendar">
                          <GripVertical className="w-3.5 h-3.5 text-[#9CA3AF]" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold text-[#141413] dark:text-[#F3F4F6] leading-snug">
                            {t.title}
                          </div>
                          <div className="text-[11px] text-[#5A5A55] dark:text-[#9CA3AF] mt-0.5 tabular-nums">
                            <span style={{ color: sub.color }} className="font-medium">
                              {sub.label}
                            </span>{' '}
                            · {t.durationMinutes}m · {t.dueDate}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onScheduleTaskOnCalendar(t.id, anchorDate, 480)}
                        className="w-full py-1.5 rounded-lg border border-[#E5E5E0] dark:border-[#232834] text-[11px] font-medium text-[#141413] dark:text-[#F3F4F6] hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
                      >
                        Schedule on {anchorDate === todayISO ? 'Today' : anchorDate} (08:00)
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </aside>
        )}
      </div>

      {/* Block Create / Edit Modal */}
      {editingBlock && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="block-modal-title"
        >
          <form
            onSubmit={handleSaveModal}
            className="w-full max-w-md rounded-2xl bg-white dark:bg-[#13161D] border border-[#E5E5E0] dark:border-[#232834] p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 id="block-modal-title" className="font-display text-lg font-semibold text-[#141413] dark:text-[#F3F4F6]">
                {editingBlock.id ? 'Edit Time Block' : 'Schedule Study Block'}
              </h2>
              <button
                type="button"
                onClick={closeModal}
                aria-label="Close block modal"
                className="p-2 rounded-lg text-[#5A5A55] dark:text-[#9CA3AF] hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label htmlFor="blk-title" className="block text-xs font-medium text-[#141413] dark:text-[#F3F4F6] mb-1">
                Block Title (synced with linked task)
              </label>
              <input
                id="blk-title"
                type="text"
                required
                value={editingBlock.title}
                onChange={(e) => setEditingBlock({ ...editingBlock, title: e.target.value })}
                placeholder="e.g., 2024 Physics Essay Q6–Q8"
                className="w-full rounded-lg bg-[#F7F7F5] dark:bg-[#0B0D11] border border-[#E5E5E0] dark:border-[#232834] px-3 py-2 text-sm text-[#141413] dark:text-[#F3F4F6]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="blk-subject" className="block text-xs font-medium text-[#141413] dark:text-[#F3F4F6] mb-1">
                  Subject
                </label>
                <select
                  id="blk-subject"
                  value={editingBlock.subject}
                  onChange={(e) => setEditingBlock({ ...editingBlock, subject: e.target.value as SubjectKey })}
                  className="w-full rounded-lg bg-[#F7F7F5] dark:bg-[#0B0D11] border border-[#E5E5E0] dark:border-[#232834] px-3 py-2 text-sm text-[#141413] dark:text-[#F3F4F6]"
                >
                  {Object.values(subjects).map((sub) => (
                    <option key={sub.id} value={sub.id}>
                      {sub.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="blk-date" className="block text-xs font-medium text-[#141413] dark:text-[#F3F4F6] mb-1">
                  Date
                </label>
                <input
                  id="blk-date"
                  type="date"
                  value={editingBlock.date}
                  onChange={(e) => setEditingBlock({ ...editingBlock, date: e.target.value })}
                  className="w-full rounded-lg bg-[#F7F7F5] dark:bg-[#0B0D11] border border-[#E5E5E0] dark:border-[#232834] px-3 py-2 text-sm font-mono text-[#141413] dark:text-[#F3F4F6]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label htmlFor="blk-start" className="block text-xs font-medium text-[#141413] dark:text-[#F3F4F6] mb-1">
                  Start Time
                </label>
                <select
                  id="blk-start"
                  value={editingBlock.startMinutes}
                  onChange={(e) => {
                    const nextStart = Number(e.target.value);
                    const nextDuration = clampBlockDuration(nextStart, editingBlock.durationMinutes);
                    setEditingBlock({
                      ...editingBlock,
                      startMinutes: nextStart,
                      durationMinutes: nextDuration,
                    });
                  }}
                  className="w-full rounded-lg bg-[#F7F7F5] dark:bg-[#0B0D11] border border-[#E5E5E0] dark:border-[#232834] px-3 py-2 text-sm font-mono text-[#141413] dark:text-[#F3F4F6]"
                >
                  {Array.from({ length: 96 }, (_, i) => i * 15).map((m) => (
                    <option key={m} value={m}>
                      {formatTime24(m)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="blk-end" className="block text-xs font-medium text-[#141413] dark:text-[#F3F4F6] mb-1">
                  End Time
                </label>
                <select
                  id="blk-end"
                  value={Math.min(1440, editingBlock.startMinutes + editingBlock.durationMinutes)}
                  onChange={(e) => {
                    const nextEnd = Number(e.target.value);
                    const nextDuration = clampBlockDuration(
                      editingBlock.startMinutes,
                      nextEnd - editingBlock.startMinutes
                    );
                    setEditingBlock({ ...editingBlock, durationMinutes: nextDuration });
                  }}
                  className="w-full rounded-lg bg-[#F7F7F5] dark:bg-[#0B0D11] border border-[#E5E5E0] dark:border-[#232834] px-3 py-2 text-sm font-mono text-[#141413] dark:text-[#F3F4F6]"
                >
                  {endTimeOptions.map((m) => (
                    <option key={m} value={m}>
                      {formatTime24(m)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="blk-duration" className="block text-xs font-medium text-[#141413] dark:text-[#F3F4F6] mb-1">
                  Duration
                </label>
                <select
                  id="blk-duration"
                  value={editingBlock.durationMinutes}
                  onChange={(e) =>
                    setEditingBlock({
                      ...editingBlock,
                      durationMinutes: clampBlockDuration(
                        editingBlock.startMinutes,
                        Number(e.target.value)
                      ),
                    })
                  }
                  className="w-full rounded-lg bg-[#F7F7F5] dark:bg-[#0B0D11] border border-[#E5E5E0] dark:border-[#232834] px-3 py-2 text-sm font-mono text-[#141413] dark:text-[#F3F4F6]"
                >
                  {durationOptions.map((d) => (
                    <option key={d} value={d}>
                      {formatDurationLabel(d)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {editingBlock.id && (
              <label className="flex items-center gap-2 text-xs font-medium text-[#141413] dark:text-[#F3F4F6] cursor-pointer">
                <input
                  type="checkbox"
                  checked={editingBlock.completed}
                  onChange={(e) => setEditingBlock({ ...editingBlock, completed: e.target.checked })}
                  className="accent-[#4338CA]"
                />
                <span>Mark block & linked task completed</span>
              </label>
            )}

            <div>
              <label htmlFor="blk-notes" className="block text-xs font-medium text-[#141413] dark:text-[#F3F4F6] mb-1">
                Notes
              </label>
              <textarea
                id="blk-notes"
                rows={2}
                value={editingBlock.notes}
                onChange={(e) => setEditingBlock({ ...editingBlock, notes: e.target.value })}
                placeholder="Goals or specific questions..."
                className="w-full rounded-lg bg-[#F7F7F5] dark:bg-[#0B0D11] border border-[#E5E5E0] dark:border-[#232834] px-3 py-2 text-sm text-[#141413] dark:text-[#F3F4F6]"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              {editingBlock.id ? (
                <button
                  type="button"
                  onClick={() => {
                    onDeleteBlock(editingBlock.id!);
                    closeModal();
                  }}
                  className="px-3 py-2 rounded-lg text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete</span>
                </button>
              ) : (
                <span />
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 rounded-lg border border-[#E5E5E0] dark:border-[#232834] text-xs font-medium text-[#141413] dark:text-[#F3F4F6] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-[#4338CA] dark:bg-[#6366F1] text-white text-xs font-semibold hover:opacity-90 cursor-pointer"
                >
                  {editingBlock.id ? 'Save Changes' : 'Add Block'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
