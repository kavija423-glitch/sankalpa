export type SubjectKey = 'maths' | 'physics' | 'ict' | 'general';

export type PriorityLevel = 'low' | 'medium' | 'high';

export type RecurrenceRule = 'none' | 'daily' | 'weekdays' | 'weekly';

export type PaperSubjectKey = 'physics' | 'ict' | 'maths';

export type PaperQuestionStatus = 'unattempted' | 'mastered' | 'redo' | 'silly';

export type SyllabusMastery = 'not_started' | 'learning' | 'revised' | 'mastered';

export type TimerMode = 'pomodoro_25' | 'pomodoro_50' | 'flowtime' | 'scheduled' | 'manual';

export type NavTab = 'calendar' | 'tasks' | 'timer' | 'papers' | 'syllabus' | 'analytics' | 'settings';

export interface SubjectConfig {
  id: SubjectKey;
  label: string;
  sinhalaLabel: string;
  color: string;
}

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
}

export interface TaskItem {
  id: string;
  title: string;
  subject: SubjectKey;
  durationMinutes: number;
  priority: PriorityLevel;
  dueDate: string; // YYYY-MM-DD
  recurrence: RecurrenceRule;
  completed: boolean;
  completedAt: number | null;
  notes: string;
  subtasks: Subtask[];
  scheduledBlockId: string | null;
  sourcePaperRef?: {
    paperId: string;
    questionId: string;
    label: string;
  };
  deletedAt?: number;
  updatedAt: number;
}

export interface CalendarBlock {
  id: string;
  title: string;
  subject: SubjectKey;
  date: string; // YYYY-MM-DD
  startMinutes: number; // 0..1425
  durationMinutes: number; // >= 15
  taskId: string | null;
  completed?: boolean;
  notes: string;
  deletedAt?: number;
  updatedAt: number;
}

export interface StudySession {
  id: string;
  title: string;
  subject: SubjectKey;
  mode: TimerMode;
  date: string; // YYYY-MM-DD
  startTimestamp: number;
  endTimestamp: number;
  durationMinutes: number;
  rating: number; // 1..5
  notes: string;
  taskId: string | null;
  blockId: string | null;
  // Unified live + manual Firestore schema metadata
  isManual?: boolean;
  subjectId?: string;
  subjectName?: string;
  startTime?: string; // ISO 8601 string
  endTime?: string; // ISO 8601 string
  durationSeconds?: number;
  createdAt?: number;
  deletedAt?: number;
  updatedAt: number;
}

export interface ActiveTimerState {
  isRunning: boolean;
  mode: TimerMode;
  phase: 'focus' | 'break';
  startedAt: number | null; // Epoch ms when current run started
  accumulatedMs: number; // Elapsed ms before latest start
  targetDurationMs: number | null; // Null for flowtime
  title: string;
  subject: SubjectKey;
  taskId: string | null;
  blockId: string | null;
}

export interface ExamCountdown {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  subject: SubjectKey;
}

export interface PaperQuestion {
  id: string;
  paperId: string;
  label: string;
  section: string;
  number: number;
  status: PaperQuestionStatus;
  unitTag: string;
  mistakeNote: string;
  updatedAt: number;
}

export interface PastPaper {
  id: string;
  year: number;
  subject: PaperSubjectKey;
  paperType: 'official' | 'school' | 'model';
  sourceName: string;
  medium: 'english' | 'sinhala';
  title: string;
  questions: PaperQuestion[];
  createdAt: number;
  updatedAt: number;
}

export interface SyllabusSubtopic {
  id: string;
  code: string;
  titleEn: string;
  titleSi: string;
  mastery: SyllabusMastery;
  confidence: number; // 1..5
  revisionCount: number;
  notes: string;
  updatedAt: number;
}

export interface SyllabusUnit {
  id: string;
  subject: PaperSubjectKey;
  unitNumber: number;
  titleEn: string;
  titleSi: string;
  subtopics: SyllabusSubtopic[];
}

export interface AppSettings {
  theme: 'light' | 'dark';
  medium: 'english' | 'sinhala' | 'bilingual';
  dailyGoalMinutes: number;
  firebaseConfigJson: string;
  updatedAt: number;
}

export interface AppState {
  version: number;
  subjects: Record<SubjectKey, SubjectConfig>;
  tasks: TaskItem[];
  blocks: CalendarBlock[];
  sessions: StudySession[];
  papers: PastPaper[];
  syllabus: SyllabusUnit[];
  examCountdowns: ExamCountdown[];
  settings: AppSettings;
  activeTimer: ActiveTimerState;
  lastModified: number;
}
