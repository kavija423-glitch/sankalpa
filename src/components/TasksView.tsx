import React, { useMemo, useState } from 'react';
import {
  CalendarPlus,
  Check,
  ChevronDown,
  ChevronRight,
  Play,
  Plus,
  Repeat,
  Trash2,
} from 'lucide-react';
import type { StudySession, SubjectConfig, SubjectKey, TaskItem } from '../types/app';
import { formatDurationLabel } from '../utils/calendarMath';
import { computeTaskLoggedMinutesMap } from '../utils/manualSession';
import { parseNaturalLanguageTask, toISODateLocal } from '../utils/nlpTaskParser';

interface TasksViewProps {
  tasks: TaskItem[];
  sessions: StudySession[];
  subjects: Record<SubjectKey, SubjectConfig>;
  onAddTask: (rawOrStructured: string) => void;
  onToggleTask: (taskId: string) => void;
  onUpdateTask: (taskId: string, patch: Partial<TaskItem>) => void;
  onDeleteTask: (taskId: string) => void;
  onScheduleTask: (taskId: string, date: string, startMinutes: number) => void;
  onJumpToCalendar: () => void;
  onStartTimerFromTask: (task: TaskItem) => void;
}

export const TasksView: React.FC<TasksViewProps> = ({
  tasks,
  sessions,
  subjects,
  onAddTask,
  onToggleTask,
  onUpdateTask,
  onDeleteTask,
  onScheduleTask,
  onJumpToCalendar,
  onStartTimerFromTask,
}) => {
  const [quickInput, setQuickInput] = useState('');
  const [subjectFilter, setSubjectFilter] = useState<'all' | SubjectKey>('all');
  const [showCompleted, setShowCompleted] = useState(false);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [newSubtaskText, setNewSubtaskText] = useState('');
  const [schedulePromptTask, setSchedulePromptTask] = useState<TaskItem | null>(null);
  const [scheduleDate, setScheduleDate] = useState(toISODateLocal(new Date()));
  const [scheduleStart, setScheduleStart] = useState(540);

  const loggedMinutesByTask = useMemo(() => computeTaskLoggedMinutesMap(sessions), [sessions]);

  const livePreview = useMemo(() => {
    if (!quickInput.trim()) return null;
    return parseNaturalLanguageTask(quickInput);
  }, [quickInput]);

  const filteredTasks = useMemo(() => {
    return tasks
      .filter((t) => !t.deletedAt)
      .filter((t) => (subjectFilter === 'all' ? true : t.subject === subjectFilter))
      .filter((t) => (showCompleted ? true : !t.completed))
      .sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        const pOrder = { high: 0, medium: 1, low: 2 };
        if (a.priority !== b.priority) return pOrder[a.priority] - pOrder[b.priority];
        return a.dueDate.localeCompare(b.dueDate);
      });
  }, [tasks, subjectFilter, showCompleted]);

  const handleQuickSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickInput.trim()) return;
    onAddTask(quickInput.trim());
    setQuickInput('');
  };

  const handleAddSubtask = (task: TaskItem) => {
    if (!newSubtaskText.trim()) return;
    const next = [
      ...task.subtasks,
      {
        id: `sub_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        title: newSubtaskText.trim(),
        done: false,
      },
    ];
    onUpdateTask(task.id, { subtasks: next });
    setNewSubtaskText('');
  };

  return (
    <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 py-5 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 border-b border-[#DCE6F0] dark:border-[#1E2C40] pb-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#0F172A] dark:text-[#F1F5F9]">
            Smart Tasks
          </h1>
          <p className="text-sm text-[#475569] dark:text-[#94A3B8] mt-1">
            Natural-language capture · Recurring tasks auto-roll forward until done
          </p>
        </div>
        <div className="text-xs text-[#475569] dark:text-[#94A3B8] tabular-nums">
          {tasks.filter((t) => !t.deletedAt && !t.completed).length} active · {tasks.filter((t) => !t.deletedAt && t.completed).length} completed
        </div>
      </div>

      {/* Natural Language Quick-Add */}
      <form
        onSubmit={handleQuickSubmit}
        className="rounded-2xl bg-white dark:bg-[#0F1724] border border-[#DCE6F0] dark:border-[#1E2C40] p-4 space-y-2.5"
      >
        <div className="flex flex-col sm:flex-row gap-2.5">
          <input
            type="text"
            value={quickInput}
            onChange={(e) => setQuickInput(e.target.value)}
            placeholder="Try: #Physics Electromagnetism Essay 60m !high @tomorrow every weekday"
            aria-label="Quick-add task with natural language"
            className="flex-1 min-w-0 rounded-xl bg-[#F4F8FB] dark:bg-[#080E17] border border-[#DCE6F0] dark:border-[#1E2C40] px-3.5 py-2.5 text-sm text-[#0F172A] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-[#0EA5E9] dark:focus:ring-[#38BDF8]"
          />
          <button
            type="submit"
            className="min-h-[42px] px-5 py-2.5 rounded-xl bg-[#0284C7] hover:bg-[#0369A1] dark:bg-[#38BDF8] dark:hover:bg-[#7DD3FC] text-white dark:text-[#07131E] text-sm font-semibold flex items-center justify-center gap-1.5 hover:opacity-90 shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Task</span>
          </button>
        </div>

        {/* Live NLP Parse Preview */}
        {livePreview ? (
          <div className="text-xs text-[#475569] dark:text-[#94A3B8] flex flex-wrap items-center gap-x-2.5 gap-y-1 px-1">
            <span className="font-medium text-[#0F172A] dark:text-[#F1F5F9]">Parsed:</span>
            <span style={{ color: subjects[livePreview.subject].color }} className="font-semibold">
              {subjects[livePreview.subject].label}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">{livePreview.durationMinutes}m</span>
            <span aria-hidden="true">·</span>
            <span>Priority {livePreview.priority}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">{livePreview.dueDate}</span>
            {livePreview.recurrence !== 'none' && (
              <>
                <span aria-hidden="true">·</span>
                <span>Repeats {livePreview.recurrence}</span>
              </>
            )}
          </div>
        ) : (
          <div className="text-[11px] text-[#475569] dark:text-[#94A3B8] px-1">
            Tokens: <span className="font-mono">#Physics #Maths #ICT</span> ·{' '}
            <span className="font-mono">45m / 1.5h</span> ·{' '}
            <span className="font-mono">!high !med !low</span> ·{' '}
            <span className="font-mono">@today @tomorrow @monday</span> ·{' '}
            <span className="font-mono">every weekday</span>
          </div>
        )}
      </form>

      {/* Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-[#E6EEF5] dark:bg-[#0F1724] border border-[#DCE6F0] dark:border-[#1E2C40]">
          <button
            type="button"
            onClick={() => setSubjectFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer whitespace-nowrap ${
              subjectFilter === 'all'
                ? 'bg-white dark:bg-[#172233] text-[#0F172A] dark:text-[#F1F5F9] shadow-xs'
                : 'text-[#475569] dark:text-[#94A3B8]'
            }`}
          >
            All Subjects
          </button>
          {Object.values(subjects).map((sub) => (
            <button
              key={sub.id}
              type="button"
              onClick={() => setSubjectFilter(sub.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                subjectFilter === sub.id
                  ? 'bg-white dark:bg-[#172233] text-[#0F172A] dark:text-[#F1F5F9] shadow-xs'
                  : 'text-[#475569] dark:text-[#94A3B8]'
              }`}
            >
              <span className="w-2 h-2 rounded-xs shrink-0" style={{ backgroundColor: sub.color }} />
              <span>{sub.label}</span>
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-xs text-[#475569] dark:text-[#94A3B8] cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showCompleted}
            onChange={(e) => setShowCompleted(e.target.checked)}
            className="rounded border-[#DCE6F0] dark:border-[#1E2C40] accent-[#0284C7]"
          />
          <span>Show completed</span>
        </label>
      </div>

      {/* Task List */}
      <div className="rounded-2xl bg-white dark:bg-[#0F1724] border border-[#DCE6F0] dark:border-[#1E2C40] divide-y divide-[#DCE6F0] dark:divide-[#1E2C40]">
        {filteredTasks.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm font-medium text-[#0F172A] dark:text-[#F1F5F9]">No matching study tasks</p>
            <p className="text-xs text-[#475569] dark:text-[#94A3B8] mt-1">
              Use the quick-add bar above or send items from your Past Paper Redo Queue.
            </p>
          </div>
        ) : (
          filteredTasks.map((task) => {
            const sub = subjects[task.subject] ?? subjects.general;
            const expanded = expandedTaskId === task.id;
            const doneSubtasks = task.subtasks.filter((s) => s.done).length;

            return (
              <div key={task.id} className="p-4 transition-colors">
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    onClick={() => onToggleTask(task.id)}
                    aria-label={task.completed ? `Mark "${task.title}" incomplete` : `Mark "${task.title}" complete`}
                    className={`mt-0.5 w-6 h-6 rounded-md border flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
                      task.completed
                        ? 'bg-[#0284C7] dark:bg-[#38BDF8] border-transparent text-white dark:text-[#07131E]'
                        : 'border-[#CBD5E1] dark:border-[#3A4152] hover:border-[#0EA5E9]'
                    }`}
                  >
                    {task.completed && <Check className="w-3.5 h-3.5" />}
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setExpandedTaskId(expanded ? null : task.id)}
                        className="text-left flex items-center gap-1.5 min-w-0 cursor-pointer group"
                      >
                        {expanded ? (
                          <ChevronDown className="w-4 h-4 text-[#475569] shrink-0" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-[#475569] shrink-0" />
                        )}
                        <span
                          className={`text-sm font-semibold group-hover:underline ${
                            task.completed
                              ? 'line-through text-[#94A3B8]'
                              : 'text-[#0F172A] dark:text-[#F1F5F9]'
                          }`}
                        >
                          {task.title}
                        </span>
                      </button>

                      {/* Action Buttons */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => onStartTimerFromTask(task)}
                          aria-label={`Start timer for ${task.title}`}
                          className="px-2.5 py-1.5 rounded-lg border border-[#DCE6F0] dark:border-[#1E2C40] text-xs font-medium text-[#0F172A] dark:text-[#F1F5F9] hover:bg-black/5 dark:hover:bg-white/5 flex items-center gap-1 cursor-pointer whitespace-nowrap"
                        >
                          <Play className="w-3 h-3" />
                          <span>Focus</span>
                        </button>

                        {task.scheduledBlockId ? (
                          <button
                            type="button"
                            onClick={onJumpToCalendar}
                            className="px-2.5 py-1.5 rounded-lg bg-sky-50 dark:bg-sky-950/40 text-[#0284C7] dark:text-[#7DD3FC] text-xs font-medium cursor-pointer whitespace-nowrap"
                          >
                            On Calendar
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setSchedulePromptTask(task);
                              setScheduleDate(task.dueDate);
                            }}
                            aria-label={`Schedule ${task.title} on calendar`}
                            className="px-2.5 py-1.5 rounded-lg border border-[#DCE6F0] dark:border-[#1E2C40] text-xs font-medium text-[#0F172A] dark:text-[#F1F5F9] hover:bg-black/5 dark:hover:bg-white/5 flex items-center gap-1 cursor-pointer whitespace-nowrap"
                          >
                            <CalendarPlus className="w-3 h-3" />
                            <span>Schedule</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => onDeleteTask(task.id)}
                          aria-label={`Delete task ${task.title}`}
                          className="p-1.5 rounded-lg text-[#475569] dark:text-[#94A3B8] hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Clean Unboxed Metadata Line (Zero-Pill Discipline) */}
                    <div className="mt-1 pl-5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[#475569] dark:text-[#94A3B8]">
                      <span className="font-semibold" style={{ color: sub.color }}>
                        {sub.label}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">{task.durationMinutes}m</span>
                      <span aria-hidden="true">·</span>
                      <span
                        className={
                          task.priority === 'high'
                            ? 'text-rose-600 dark:text-rose-400 font-medium'
                            : task.priority === 'medium'
                            ? 'text-amber-600 dark:text-amber-400'
                            : ''
                        }
                      >
                        {task.priority === 'high' ? 'High priority' : task.priority === 'medium' ? 'Medium' : 'Low'}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">{task.dueDate}</span>
                      {task.recurrence !== 'none' && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="inline-flex items-center gap-1">
                            <Repeat className="w-3 h-3" />
                            {task.recurrence}
                          </span>
                        </>
                      )}
                      {task.subtasks.length > 0 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">
                            {doneSubtasks}/{task.subtasks.length} steps
                          </span>
                        </>
                      )}
                      {(loggedMinutesByTask.get(task.id) ?? 0) > 0 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span
                            data-testid={`task-logged-${task.id}`}
                            className="font-mono tabular-nums font-medium text-[#0284C7] dark:text-[#7DD3FC]"
                          >
                            Logged {formatDurationLabel(loggedMinutesByTask.get(task.id) ?? 0)}
                          </span>
                        </>
                      )}
                    </div>

                    {/* Expanded Subtasks, Metadata & Notes */}
                    {expanded && (
                      <div className="mt-3 pl-5 pt-3 border-t border-[#DCE6F0]/70 dark:border-[#1E2C40]/70 space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                          <input
                            type="text"
                            value={task.title}
                            onChange={(e) => onUpdateTask(task.id, { title: e.target.value })}
                            aria-label={`Edit title for ${task.title}`}
                            className="sm:col-span-2 rounded-lg bg-[#F4F8FB] dark:bg-[#080E17] border border-[#DCE6F0] dark:border-[#1E2C40] px-2.5 py-1.5 text-xs text-[#0F172A] dark:text-[#F1F5F9]"
                          />
                          <select
                            value={task.durationMinutes}
                            onChange={(e) =>
                              onUpdateTask(task.id, { durationMinutes: Number(e.target.value) })
                            }
                            aria-label={`Edit duration for ${task.title}`}
                            className="rounded-lg bg-[#F4F8FB] dark:bg-[#080E17] border border-[#DCE6F0] dark:border-[#1E2C40] px-2.5 py-1.5 text-xs font-mono text-[#0F172A] dark:text-[#F1F5F9]"
                          >
                            {[15, 30, 45, 60, 75, 90, 120, 150, 180].map((m) => (
                              <option key={m} value={m}>
                                {m}m
                              </option>
                            ))}
                          </select>
                          <input
                            type="date"
                            value={task.dueDate}
                            onChange={(e) => onUpdateTask(task.id, { dueDate: e.target.value })}
                            aria-label={`Edit due date for ${task.title}`}
                            className="rounded-lg bg-[#F4F8FB] dark:bg-[#080E17] border border-[#DCE6F0] dark:border-[#1E2C40] px-2.5 py-1.5 text-xs font-mono text-[#0F172A] dark:text-[#F1F5F9]"
                          />
                        </div>

                        <div>
                          <label
                            htmlFor={`notes_${task.id}`}
                            className="block text-[11px] font-medium text-[#475569] dark:text-[#94A3B8] mb-1"
                          >
                            Study Notes
                          </label>
                          <textarea
                            id={`notes_${task.id}`}
                            rows={2}
                            value={task.notes}
                            onChange={(e) => onUpdateTask(task.id, { notes: e.target.value })}
                            placeholder="Add formulas, paper refs, or reminders..."
                            className="w-full rounded-lg bg-[#F4F8FB] dark:bg-[#080E17] border border-[#DCE6F0] dark:border-[#1E2C40] px-3 py-2 text-xs text-[#0F172A] dark:text-[#F1F5F9]"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <span className="block text-[11px] font-medium text-[#475569] dark:text-[#94A3B8]">
                            Subtasks
                          </span>
                          {task.subtasks.map((st) => (
                            <div key={st.id} className="flex items-center gap-2 text-xs">
                              <input
                                type="checkbox"
                                checked={st.done}
                                onChange={() => {
                                  const next = task.subtasks.map((item) =>
                                    item.id === st.id ? { ...item, done: !item.done } : item
                                  );
                                  onUpdateTask(task.id, { subtasks: next });
                                }}
                                className="accent-[#0284C7]"
                              />
                              <span
                                className={
                                  st.done
                                    ? 'line-through text-[#94A3B8] flex-1'
                                    : 'text-[#0F172A] dark:text-[#F1F5F9] flex-1'
                                }
                              >
                                {st.title}
                              </span>
                            </div>
                          ))}
                          <div className="flex gap-2 mt-1.5">
                            <input
                              type="text"
                              value={newSubtaskText}
                              onChange={(e) => setNewSubtaskText(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleAddSubtask(task);
                                }
                              }}
                              placeholder="Add subtask step..."
                              className="flex-1 rounded-lg bg-[#F4F8FB] dark:bg-[#080E17] border border-[#DCE6F0] dark:border-[#1E2C40] px-2.5 py-1.5 text-xs text-[#0F172A] dark:text-[#F1F5F9]"
                            />
                            <button
                              type="button"
                              onClick={() => handleAddSubtask(task)}
                              className="px-3 py-1.5 rounded-lg border border-[#DCE6F0] dark:border-[#1E2C40] text-xs font-medium text-[#0F172A] dark:text-[#F1F5F9] cursor-pointer"
                            >
                              Add
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Quick Schedule Task Modal */}
      {schedulePromptTask && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="schedule-task-modal"
        >
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#0F1724] border border-[#DCE6F0] dark:border-[#1E2C40] p-6 space-y-4">
            <h2 id="schedule-task-modal" className="font-display text-lg font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
              Schedule on 24h Calendar
            </h2>
            <p className="text-xs text-[#475569] dark:text-[#94A3B8]">{schedulePromptTask.title}</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="sch-date" className="block text-xs font-medium mb-1">
                  Date
                </label>
                <input
                  id="sch-date"
                  type="date"
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  className="w-full rounded-lg bg-[#F4F8FB] dark:bg-[#080E17] border border-[#DCE6F0] dark:border-[#1E2C40] px-3 py-2 text-xs font-mono"
                />
              </div>
              <div>
                <label htmlFor="sch-time" className="block text-xs font-medium mb-1">
                  Start Time
                </label>
                <select
                  id="sch-time"
                  value={scheduleStart}
                  onChange={(e) => setScheduleStart(Number(e.target.value))}
                  className="w-full rounded-lg bg-[#F4F8FB] dark:bg-[#080E17] border border-[#DCE6F0] dark:border-[#1E2C40] px-3 py-2 text-xs font-mono"
                >
                  {Array.from({ length: 96 }, (_, i) => i * 15).map((m) => (
                    <option key={m} value={m}>
                      {String(Math.floor(m / 60)).padStart(2, '0')}:{String(m % 60).padStart(2, '0')}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSchedulePromptTask(null)}
                className="px-4 py-2 rounded-lg border border-[#DCE6F0] dark:border-[#1E2C40] text-xs font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onScheduleTask(schedulePromptTask.id, scheduleDate, scheduleStart);
                  setSchedulePromptTask(null);
                  onJumpToCalendar();
                }}
                className="px-4 py-2 rounded-lg bg-[#0284C7] hover:bg-[#0369A1] dark:bg-[#38BDF8] dark:hover:bg-[#7DD3FC] text-white dark:text-[#07131E] text-xs font-semibold cursor-pointer"
              >
                Place Block
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
