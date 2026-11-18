import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  CheckSquare,
  FileText,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Sun,
  Timer,
  WifiOff,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import { AnalyticsView } from './components/AnalyticsView';
import { BrandLogo } from './components/BrandLogo';
import { CalendarView } from './components/CalendarView';
import { PapersView } from './components/PapersView';
import { PWAInstallButton } from './components/PWAInstallButton';
import { SessionLogModal } from './components/SessionLogModal';
import { SettingsView } from './components/SettingsView';
import { SyllabusView } from './components/SyllabusView';
import { TasksView } from './components/TasksView';
import { TimerMiniPlayer } from './components/TimerMiniPlayer';
import { TimerView } from './components/TimerView';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import {
  DEFAULT_FIREBASE_CONFIG_JSON,
  initUserFirebase,
  pullStateFromFirestore,
  pushStateToFirestore,
  signInFirebaseEmail,
  signInFirebaseGoogle,
  signOutFirebase,
  signUpFirebaseEmail,
  subscribeFirebaseAuth,
  subscribeRemoteState,
  type FirebaseHandle,
} from './services/firebaseSyncService';
import {
  exportStateAsJson,
  loadAppState,
  parseImportedStateJson,
  resetAppState,
  saveAppState,
} from './services/storageService';
import type {
  ActiveTimerState,
  AppSettings,
  AppState,
  CalendarBlock,
  ExamCountdown,
  NavTab,
  PaperQuestion,
  PaperSubjectKey,
  PastPaper,
  StudySession,
  SubjectKey,
  SyllabusSubtopic,
  TaskItem,
} from './types/app';
import {
  createBlockWithLinkedTask,
  deleteBlockSynced,
  deleteTaskSynced,
  scheduleTaskToCalendar,
  toggleTaskSynced,
  updateBlockSynced,
  updateTaskSynced,
} from './utils/bidirectionalSync';
import { parseNaturalLanguageTask, toISODateLocal } from './utils/nlpTaskParser';
import { mergeAppState } from './utils/syncMerge';

const NAV_ITEMS: Array<{ id: NavTab; label: string; shortLabel: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'calendar', label: '24h Calendar', shortLabel: 'Calendar', icon: CalendarDays },
  { id: 'tasks', label: 'Smart Tasks', shortLabel: 'Tasks', icon: CheckSquare },
  { id: 'timer', label: 'Study Timer', shortLabel: 'Timer', icon: Timer },
  { id: 'papers', label: 'Past Papers', shortLabel: 'Papers', icon: FileText },
  { id: 'syllabus', label: 'A/L Syllabus', shortLabel: 'Syllabus', icon: BookOpen },
  { id: 'analytics', label: 'Analytics', shortLabel: 'Stats', icon: BarChart3 },
  { id: 'settings', label: 'Settings', shortLabel: 'Settings', icon: Settings },
];

export default function App() {
  const [state, setState] = useState<AppState>(() => loadAppState());
  const [activeTab, setActiveTab] = useState<NavTab>('calendar');
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [showLogModal, setShowLogModal] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('sankalpa_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('sankalpa_sidebar_collapsed', String(sidebarCollapsed));
    } catch {
      // Ignore storage errors
    }
  }, [sidebarCollapsed]);

  // Firebase optional sync state
  const firebaseRef = useRef<FirebaseHandle | null>(null);
  const [firebaseProjectId, setFirebaseProjectId] = useState<string | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [syncStatus, setSyncStatus] = useState<'offline_local' | 'connected' | 'syncing' | 'error'>('offline_local');
  const [syncError, setSyncError] = useState<string | null>(null);
  const isOnline = useOnlineStatus();

  // Apply .dark class to <html>
  useEffect(() => {
    const root = document.documentElement;
    if (state.settings.theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [state.settings.theme]);

  // Persist to localStorage whenever state updates
  useEffect(() => {
    saveAppState(state);
  }, [state]);

  // Timestamp-accurate timer ticker (recovers accurately after background/screen lock)
  useEffect(() => {
    if (!state.activeTimer.isRunning) return;
    setNowMs(Date.now());
    const interval = window.setInterval(() => {
      setNowMs(Date.now());
    }, 250);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        setNowMs(Date.now());
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [state.activeTimer.isRunning]);

  const elapsedMs = useMemo(() => {
    const t = state.activeTimer;
    if (!t.isRunning || t.startedAt === null) return t.accumulatedMs;
    return t.accumulatedMs + Math.max(0, nowMs - t.startedAt);
  }, [state.activeTimer, nowMs]);

  // Auto-open log modal if countdown target hits 0
  useEffect(() => {
    const t = state.activeTimer;
    if (t.isRunning && t.targetDurationMs !== null && elapsedMs >= t.targetDurationMs) {
      setState((prev) => ({
        ...prev,
        activeTimer: {
          ...prev.activeTimer,
          isRunning: false,
          startedAt: null,
          accumulatedMs: t.targetDurationMs ?? elapsedMs,
        },
      }));
      setShowLogModal(true);
    }
  }, [elapsedMs, state.activeTimer]);

  const authUnsubRef = useRef<(() => void) | null>(null);

  // Initialize Firebase (defaults to built-in sankalpa-45fda project)
  const initializeFirebaseInstance = useCallback(
    async (configJson: string, persistConfig: boolean) => {
      setSyncError(null);
      const effectiveJson = configJson.trim() || DEFAULT_FIREBASE_CONFIG_JSON;
      const handle = await initUserFirebase(effectiveJson);
      firebaseRef.current = handle;
      setFirebaseProjectId(handle.projectId);

      if (persistConfig) {
        const now = Date.now();
        setState((prev) => ({
          ...prev,
          settings: {
            ...prev.settings,
            firebaseConfigJson: effectiveJson,
            updatedAt: now,
          },
          lastModified: now,
        }));
      }

      authUnsubRef.current?.();
      authUnsubRef.current = subscribeFirebaseAuth(handle.auth, (user) => {
        setFirebaseUser(user);
        setSyncStatus(user ? 'connected' : 'offline_local');
      });
    },
    []
  );

  const connectFirebaseWithJson = useCallback(
    async (configJson: string) => {
      await initializeFirebaseInstance(configJson, true);
    },
    [initializeFirebaseInstance]
  );

  useEffect(() => {
    void initializeFirebaseInstance(
      state.settings.firebaseConfigJson || DEFAULT_FIREBASE_CONFIG_JSON,
      false
    ).catch(() => {
      // Ignore startup init error if offline/blocked; localStorage remains active
    });
    return () => {
      authUnsubRef.current?.();
      authUnsubRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Subscribe to remote Firestore doc when authenticated
  const lastRemoteTimestampRef = useRef<number>(0);

  useEffect(() => {
    const handle = firebaseRef.current;
    if (!handle || !firebaseUser) return;

    let active = true;
    void (async () => {
      try {
        setSyncStatus('syncing');
        const remote = await pullStateFromFirestore(handle.db, firebaseUser.uid);
        if (remote && active) {
          lastRemoteTimestampRef.current = remote.lastModified;
          setState((prev) => mergeAppState(prev, remote));
        } else if (active) {
          await pushStateToFirestore(handle.db, firebaseUser.uid, state);
        }
        if (active) setSyncStatus('connected');
      } catch (err) {
        if (active) {
          setSyncStatus('error');
          setSyncError(err instanceof Error ? err.message : 'Firestore sync error');
        }
      }
    })();

    const unsub = subscribeRemoteState(
      handle.db,
      firebaseUser.uid,
      (remoteState) => {
        lastRemoteTimestampRef.current = remoteState.lastModified;
        setState((prev) => mergeAppState(prev, remoteState));
      },
      (err) => {
        setSyncStatus('error');
        setSyncError(err.message);
      }
    );

    return () => {
      active = false;
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseUser?.uid, firebaseProjectId]);

  // Debounced push to Firestore on local changes while authenticated
  useEffect(() => {
    const handle = firebaseRef.current;
    if (!handle || !firebaseUser) return;
    if (state.lastModified === lastRemoteTimestampRef.current) return;
    const timer = window.setTimeout(() => {
      setSyncStatus('syncing');
      void pushStateToFirestore(handle.db, firebaseUser.uid, state)
        .then(() => setSyncStatus('connected'))
        .catch((err) => {
          setSyncStatus('error');
          setSyncError(err instanceof Error ? err.message : 'Firestore write failed');
        });
    }, 800);
    return () => window.clearTimeout(timer);
  }, [state, firebaseUser]);

  // ================= STATE MUTATIONS =================
  const mutateState = (updater: (prev: AppState) => AppState) => {
    setState((prev) => {
      const next = updater(prev);
      return { ...next, lastModified: Date.now() };
    });
  };

  const handleConfigureTimer = (patch: Partial<ActiveTimerState>) => {
    mutateState((prev) => ({
      ...prev,
      activeTimer: { ...prev.activeTimer, ...patch },
    }));
  };

  const handleToggleTimerRun = () => {
    const currentNow = Date.now();
    setNowMs(currentNow);
    mutateState((prev) => {
      const t = prev.activeTimer;
      if (t.isRunning && t.startedAt !== null) {
        return {
          ...prev,
          activeTimer: {
            ...t,
            isRunning: false,
            accumulatedMs: t.accumulatedMs + Math.max(0, currentNow - t.startedAt),
            startedAt: null,
          },
        };
      }
      return {
        ...prev,
        activeTimer: {
          ...t,
          isRunning: true,
          startedAt: currentNow,
        },
      };
    });
  };

  const handleResetTimer = () => {
    mutateState((prev) => ({
      ...prev,
      activeTimer: {
        ...prev.activeTimer,
        isRunning: false,
        startedAt: null,
        accumulatedMs: 0,
      },
    }));
  };

  const handleSaveSession = (rating: number, notes: string) => {
    const endTs = Date.now();
    const durationMinutes = Math.max(1, Math.round(elapsedMs / 60000));
    const startTs = endTs - durationMinutes * 60000;
    const t = state.activeTimer;
    const newSession: StudySession = {
      id: `ses_${endTs}_${Math.random().toString(36).slice(2, 6)}`,
      title: t.title.trim() || 'Focused Study Session',
      subject: t.subject,
      mode: t.mode,
      date: toISODateLocal(new Date(startTs)),
      startTimestamp: startTs,
      endTimestamp: endTs,
      durationMinutes,
      rating,
      notes,
      taskId: t.taskId,
      blockId: t.blockId,
      updatedAt: endTs,
    };
    mutateState((prev) => ({
      ...prev,
      sessions: [newSession, ...prev.sessions],
      activeTimer: {
        ...prev.activeTimer,
        isRunning: false,
        startedAt: null,
        accumulatedMs: 0,
      },
    }));
    setShowLogModal(false);
  };

  // Tasks
  const handleAddTask = (rawInput: string) => {
    const parsed = parseNaturalLanguageTask(rawInput);
    const now = Date.now();
    const newTask: TaskItem = {
      id: `tsk_${now}_${Math.random().toString(36).slice(2, 6)}`,
      title: parsed.title,
      subject: parsed.subject,
      durationMinutes: parsed.durationMinutes,
      priority: parsed.priority,
      dueDate: parsed.dueDate,
      recurrence: parsed.recurrence,
      completed: false,
      completedAt: null,
      notes: '',
      subtasks: [],
      scheduledBlockId: null,
      updatedAt: now,
    };
    mutateState((prev) => ({ ...prev, tasks: [newTask, ...prev.tasks] }));
  };

  const handleToggleTask = (taskId: string) => {
    setState((prev) => toggleTaskSynced(prev, taskId));
  };

  const handleUpdateTask = (taskId: string, patch: Partial<TaskItem>) => {
    setState((prev) => updateTaskSynced(prev, taskId, patch));
  };

  const handleDeleteTask = (taskId: string) => {
    setState((prev) => deleteTaskSynced(prev, taskId));
  };

  // Calendar Blocks & Bidirectional Task Linking
  const handleCreateBlock = (blockInput: Omit<CalendarBlock, 'id' | 'updatedAt'>) => {
    setState((prev) => createBlockWithLinkedTask(prev, blockInput));
  };

  const handleUpdateBlock = (blockId: string, patch: Partial<CalendarBlock>) => {
    setState((prev) => updateBlockSynced(prev, blockId, patch));
  };

  const handleDeleteBlock = (blockId: string) => {
    setState((prev) => deleteBlockSynced(prev, blockId));
  };

  const handleScheduleTaskOnCalendar = (taskId: string, date: string, startMinutes: number) => {
    setState((prev) => scheduleTaskToCalendar(prev, taskId, date, startMinutes));
  };

  // Launch Timer from Block or Task
  const handleStartTimerFromBlock = (block: CalendarBlock) => {
    const now = Date.now();
    setNowMs(now);
    mutateState((prev) => ({
      ...prev,
      activeTimer: {
        isRunning: true,
        mode: 'scheduled',
        phase: 'focus',
        startedAt: now,
        accumulatedMs: 0,
        targetDurationMs: block.durationMinutes * 60 * 1000,
        title: block.title,
        subject: block.subject,
        taskId: block.taskId,
        blockId: block.id,
      },
    }));
    setActiveTab('timer');
  };

  const handleStartTimerFromTask = (task: TaskItem) => {
    const now = Date.now();
    setNowMs(now);
    mutateState((prev) => ({
      ...prev,
      activeTimer: {
        isRunning: true,
        mode: 'scheduled',
        phase: 'focus',
        startedAt: now,
        accumulatedMs: 0,
        targetDurationMs: task.durationMinutes * 60 * 1000,
        title: task.title,
        subject: task.subject,
        taskId: task.id,
        blockId: task.scheduledBlockId,
      },
    }));
    setActiveTab('timer');
  };

  // Past Papers
  const handleAddPaper = (paper: PastPaper) => {
    mutateState((prev) => ({ ...prev, papers: [paper, ...prev.papers] }));
  };

  const handleDeletePaper = (paperId: string) => {
    mutateState((prev) => ({ ...prev, papers: prev.papers.filter((p) => p.id !== paperId) }));
  };

  const handleUpdateQuestion = (
    paperId: string,
    questionId: string,
    patch: Partial<PaperQuestion>
  ) => {
    const now = Date.now();
    mutateState((prev) => ({
      ...prev,
      papers: prev.papers.map((p) =>
        p.id === paperId
          ? {
              ...p,
              updatedAt: now,
              questions: p.questions.map((q) =>
                q.id === questionId ? { ...q, ...patch, updatedAt: now } : q
              ),
            }
          : p
      ),
    }));
  };

  const handleSendRedoToTask = (item: {
    paperId: string;
    questionId: string;
    label: string;
    paperTitle: string;
    subject: PaperSubjectKey;
    unitTag: string;
    mistakeNote: string;
  }) => {
    const now = Date.now();
    const newTask: TaskItem = {
      id: `tsk_${now}_${Math.random().toString(36).slice(2, 6)}`,
      title: `Redo: ${item.paperTitle} (${item.label})`,
      subject: item.subject,
      durationMinutes: 30,
      priority: 'high',
      dueDate: toISODateLocal(new Date()),
      recurrence: 'none',
      completed: false,
      completedAt: null,
      notes: [item.unitTag, item.mistakeNote].filter(Boolean).join(' — '),
      subtasks: [],
      scheduledBlockId: null,
      sourcePaperRef: {
        paperId: item.paperId,
        questionId: item.questionId,
        label: item.label,
      },
      updatedAt: now,
    };
    mutateState((prev) => ({ ...prev, tasks: [newTask, ...prev.tasks] }));
  };

  // Syllabus
  const handleUpdateSubtopic = (
    unitId: string,
    subtopicId: string,
    patch: Partial<SyllabusSubtopic>
  ) => {
    const now = Date.now();
    mutateState((prev) => ({
      ...prev,
      syllabus: prev.syllabus.map((unit) =>
        unit.id === unitId
          ? {
              ...unit,
              subtopics: unit.subtopics.map((s) =>
                s.id === subtopicId ? { ...s, ...patch, updatedAt: now } : s
              ),
            }
          : unit
      ),
    }));
  };

  const handleCreateRevisionTask = (subject: PaperSubjectKey, title: string) => {
    const now = Date.now();
    const newTask: TaskItem = {
      id: `tsk_${now}_${Math.random().toString(36).slice(2, 6)}`,
      title,
      subject,
      durationMinutes: 45,
      priority: 'medium',
      dueDate: toISODateLocal(new Date()),
      recurrence: 'none',
      completed: false,
      completedAt: null,
      notes: 'Created from Bilingual A/L Syllabus Tracker',
      subtasks: [],
      scheduledBlockId: null,
      updatedAt: now,
    };
    mutateState((prev) => ({ ...prev, tasks: [newTask, ...prev.tasks] }));
  };

  // Settings
  const handleUpdateSettings = (patch: Partial<AppSettings>) => {
    const now = Date.now();
    mutateState((prev) => ({
      ...prev,
      settings: { ...prev.settings, ...patch, updatedAt: now },
    }));
  };

  const handleUpdateSubjectColor = (subject: SubjectKey, color: string) => {
    mutateState((prev) => ({
      ...prev,
      subjects: {
        ...prev.subjects,
        [subject]: { ...prev.subjects[subject], color },
      },
    }));
  };

  const handleAddExamCountdown = (exam: Omit<ExamCountdown, 'id'>) => {
    const newExam: ExamCountdown = {
      ...exam,
      id: `ex_${Date.now()}`,
    };
    mutateState((prev) => ({
      ...prev,
      examCountdowns: [...prev.examCountdowns, newExam],
    }));
  };

  const handleDeleteExamCountdown = (id: string) => {
    mutateState((prev) => ({
      ...prev,
      examCountdowns: prev.examCountdowns.filter((e) => e.id !== id),
    }));
  };

  const handleExportJson = () => {
    const json = exportStateAsJson(state);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sankalpa-backup-${toISODateLocal(new Date())}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportJson = (jsonText: string) => {
    const imported = parseImportedStateJson(jsonText);
    setState((prev) => mergeAppState(prev, imported));
  };

  const toggleTheme = () => {
    handleUpdateSettings({ theme: state.settings.theme === 'dark' ? 'light' : 'dark' });
  };

  return (
    <div className="h-dvh w-full flex flex-col md:flex-row overflow-hidden bg-[#F7F7F5] dark:bg-[#0B0D11] text-[#141413] dark:text-[#F3F4F6]">
      {/* Desktop Collapsible Left Sidebar */}
      <aside
        data-collapsed={sidebarCollapsed ? 'true' : 'false'}
        className={`hidden md:flex shrink-0 flex-col border-r border-[#E5E5E0] dark:border-[#232834] bg-white dark:bg-[#13161D] transition-[width] duration-200 ease-out overflow-hidden ${
          sidebarCollapsed ? 'md:w-[68px]' : 'md:w-60'
        }`}
      >
        <div
          className={`border-b border-[#E5E5E0] dark:border-[#232834] flex ${
            sidebarCollapsed
              ? 'flex-col items-center gap-2 py-3 px-2'
              : 'items-center justify-between px-4 py-4'
          }`}
        >
          <BrandLogo compact={sidebarCollapsed} iconOnly={sidebarCollapsed} />
          <div className={`flex items-center ${sidebarCollapsed ? 'flex-col gap-1' : 'gap-0.5'}`}>
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={state.settings.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              title={state.settings.theme === 'dark' ? 'Light theme' : 'Dark theme'}
              className="p-2 rounded-lg text-[#5A5A55] dark:text-[#9CA3AF] hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
            >
              {state.settings.theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={() => setSidebarCollapsed((v) => !v)}
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-expanded={!sidebarCollapsed}
              title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="p-2 rounded-lg text-[#5A5A55] dark:text-[#9CA3AF] hover:bg-black/5 dark:hover:bg-white/5 hover:text-[#141413] dark:hover:text-[#F3F4F6] cursor-pointer"
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen className="w-4 h-4" />
              ) : (
                <PanelLeftClose className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        <nav
          className={`flex-1 min-h-0 overflow-y-auto py-4 space-y-1 ${
            sidebarCollapsed ? 'px-2' : 'px-3'
          }`}
          aria-label="Main workspace navigation"
        >
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                aria-current={active ? 'page' : undefined}
                aria-label={item.label}
                title={sidebarCollapsed ? item.label : undefined}
                className={`w-full py-2.5 rounded-xl text-sm font-medium flex items-center cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4338CA] ${
                  sidebarCollapsed ? 'justify-center px-0' : 'gap-3 px-3'
                } ${
                  active
                    ? 'bg-[#4338CA]/10 dark:bg-[#6366F1]/15 text-[#4338CA] dark:text-[#A5B4FC] font-semibold'
                    : 'text-[#5A5A55] dark:text-[#9CA3AF] hover:bg-black/5 dark:hover:bg-white/5 hover:text-[#141413] dark:hover:text-[#F3F4F6]'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {!sidebarCollapsed && <span>{item.label}</span>}
              </button>
            );
          })}
        </nav>

        <div
          className={`border-t border-[#E5E5E0] dark:border-[#232834] space-y-2.5 empty:hidden ${
            sidebarCollapsed ? 'p-2 flex flex-col items-center' : 'p-4'
          }`}
        >
          <PWAInstallButton variant={sidebarCollapsed ? 'icon' : 'sidebar'} />
          {!isOnline && (
            <div
              title="Offline mode active"
              className="flex items-center justify-center gap-2 text-xs text-amber-600 dark:text-amber-400"
            >
              <WifiOff className="w-3.5 h-3.5 shrink-0" />
              {!sidebarCollapsed && <span>Offline mode active</span>}
            </div>
          )}
        </div>
      </aside>

      {/* Mobile Compact Header (<= 52px to stay well inside 15% sticky cap) */}
      <header className="md:hidden shrink-0 h-13 px-4 border-b border-[#E5E5E0] dark:border-[#232834] bg-white/95 dark:bg-[#13161D]/95 backdrop-blur-md flex items-center justify-between gap-4">
        <BrandLogo compact />
        <div className="flex items-center gap-1.5">
          <PWAInstallButton variant="compact" />
          {!isOnline && (
            <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400 flex items-center gap-1 mr-1">
              <WifiOff className="w-3.5 h-3.5" /> Offline
            </span>
          )}
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={state.settings.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            className="w-10 h-10 rounded-lg flex items-center justify-center text-[#5A5A55] dark:text-[#9CA3AF] cursor-pointer"
          >
            {state.settings.theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            aria-label="Open workspace settings"
            className={`w-10 h-10 rounded-lg flex items-center justify-center cursor-pointer ${
              activeTab === 'settings'
                ? 'text-[#4338CA] dark:text-[#A5B4FC]'
                : 'text-[#5A5A55] dark:text-[#9CA3AF]'
            }`}
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Content Viewport */}
      <main className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden pb-14 md:pb-0">
        {activeTab === 'calendar' ? (
          <CalendarView
            blocks={state.blocks}
            sessions={state.sessions}
            tasks={state.tasks}
            subjects={state.subjects}
            examCountdowns={state.examCountdowns}
            onCreateBlock={handleCreateBlock}
            onUpdateBlock={handleUpdateBlock}
            onDeleteBlock={handleDeleteBlock}
            onScheduleTaskOnCalendar={handleScheduleTaskOnCalendar}
            onStartTimerFromBlock={handleStartTimerFromBlock}
          />
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto ios-scroll touch-pan-y">
            {activeTab === 'tasks' && (
              <TasksView
                tasks={state.tasks}
                subjects={state.subjects}
                onAddTask={handleAddTask}
                onToggleTask={handleToggleTask}
                onUpdateTask={handleUpdateTask}
                onDeleteTask={handleDeleteTask}
                onScheduleTask={handleScheduleTaskOnCalendar}
                onJumpToCalendar={() => setActiveTab('calendar')}
                onStartTimerFromTask={handleStartTimerFromTask}
              />
            )}
            {activeTab === 'timer' && (
              <TimerView
                timer={state.activeTimer}
                elapsedMs={elapsedMs}
                subjects={state.subjects}
                tasks={state.tasks.filter((t) => !t.deletedAt)}
                blocks={state.blocks.filter((b) => !b.deletedAt)}
                sessions={state.sessions}
                onConfigureTimer={handleConfigureTimer}
                onToggleRun={handleToggleTimerRun}
                onReset={handleResetTimer}
                onRequestLogStop={() => setShowLogModal(true)}
              />
            )}
            {activeTab === 'papers' && (
              <PapersView
                papers={state.papers}
                syllabus={state.syllabus}
                subjects={state.subjects}
                onAddPaper={handleAddPaper}
                onDeletePaper={handleDeletePaper}
                onUpdateQuestion={handleUpdateQuestion}
                onSendRedoToTask={handleSendRedoToTask}
              />
            )}
            {activeTab === 'syllabus' && (
              <SyllabusView
                syllabus={state.syllabus}
                subjects={state.subjects}
                medium={state.settings.medium}
                onChangeMedium={(medium) => handleUpdateSettings({ medium })}
                onUpdateSubtopic={handleUpdateSubtopic}
                onCreateRevisionTask={handleCreateRevisionTask}
              />
            )}
            {activeTab === 'analytics' && (
              <AnalyticsView
                blocks={state.blocks.filter((b) => !b.deletedAt)}
                sessions={state.sessions}
                papers={state.papers}
                syllabus={state.syllabus}
                subjects={state.subjects}
                dailyGoalMinutes={state.settings.dailyGoalMinutes}
              />
            )}
            {activeTab === 'settings' && (
              <SettingsView
                settings={state.settings}
                subjects={state.subjects}
                examCountdowns={state.examCountdowns}
                firebaseUser={firebaseUser}
                firebaseProjectId={firebaseProjectId}
                syncStatus={syncStatus}
                syncError={syncError}
                onUpdateSettings={handleUpdateSettings}
                onUpdateSubjectColor={handleUpdateSubjectColor}
                onAddExamCountdown={handleAddExamCountdown}
                onDeleteExamCountdown={handleDeleteExamCountdown}
                onExportJson={handleExportJson}
                onImportJson={handleImportJson}
                onResetAllData={() => setState(resetAppState())}
                onConnectFirebase={connectFirebaseWithJson}
                onDisconnectFirebase={async () => {
                  await initializeFirebaseInstance(DEFAULT_FIREBASE_CONFIG_JSON, true);
                }}
                onSignInGoogle={async () => {
                  if (!firebaseRef.current) return;
                  await signInFirebaseGoogle(firebaseRef.current.auth);
                }}
                onSignInEmail={async (email, password, isSignUp) => {
                  if (!firebaseRef.current) return;
                  if (isSignUp) {
                    await signUpFirebaseEmail(firebaseRef.current.auth, email, password);
                  } else {
                    await signInFirebaseEmail(firebaseRef.current.auth, email, password);
                  }
                }}
                onSignOutFirebase={async () => {
                  if (!firebaseRef.current) return;
                  await signOutFirebase(firebaseRef.current.auth);
                  setFirebaseUser(null);
                  setSyncStatus('offline_local');
                }}
                onForceSyncNow={async () => {
                  if (!firebaseRef.current || !firebaseUser) return;
                  setSyncStatus('syncing');
                  const remote = await pullStateFromFirestore(firebaseRef.current.db, firebaseUser.uid);
                  const merged = remote ? mergeAppState(state, remote) : state;
                  setState(merged);
                  await pushStateToFirestore(firebaseRef.current.db, firebaseUser.uid, merged);
                  setSyncStatus('connected');
                }}
              />
            )}
          </div>
        )}
      </main>

      {/* Mobile Fixed Bottom Tab Bar (Compact h-14 = 56px) */}
      <nav
        aria-label="Mobile bottom navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-30 h-14 bg-white/95 dark:bg-[#13161D]/95 backdrop-blur-md border-t border-[#E5E5E0] dark:border-[#232834] grid grid-cols-6 items-center"
      >
        {NAV_ITEMS.filter((item) => item.id !== 'settings').map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`h-full flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
                active
                  ? 'text-[#4338CA] dark:text-[#A5B4FC] font-semibold'
                  : 'text-[#5A5A55] dark:text-[#9CA3AF]'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="text-[10px] leading-none">{item.shortLabel}</span>
            </button>
          );
        })}
      </nav>

      {/* Persistent Cross-View Timer Mini-Player */}
      {activeTab !== 'timer' && (
        <TimerMiniPlayer
          timer={state.activeTimer}
          elapsedMs={elapsedMs}
          subjects={state.subjects}
          onToggleRun={handleToggleTimerRun}
          onRequestStop={() => setShowLogModal(true)}
          onOpenTimer={() => setActiveTab('timer')}
        />
      )}

      {/* Study Session Rating & Log Modal */}
      <SessionLogModal
        open={showLogModal}
        timer={state.activeTimer}
        elapsedMs={elapsedMs}
        subjects={state.subjects}
        onSave={handleSaveSession}
        onDiscard={() => {
          handleResetTimer();
          setShowLogModal(false);
        }}
        onCancel={() => setShowLogModal(false)}
      />
    </div>
  );
}
