import type { AppState, PastPaper } from '../types/app';
import { addDaysISO, toISODateLocal } from '../utils/nlpTaskParser';
import { generateALPaperStructure } from '../utils/paperGenerator';
import { buildBilingualSyllabusSeed } from './syllabusSeed';

export function createInitialAppState(nowDate: Date = new Date()): AppState {
  const todayISO = toISODateLocal(nowDate);
  const tomorrowISO = addDaysISO(todayISO, 1);
  const yesterdayISO = addDaysISO(todayISO, -1);
  const twoDaysAgoISO = addDaysISO(todayISO, -2);
  const nowMs = nowDate.getTime();

  // Seed two representative past papers with tagged redo items so Redo Queue is immediately useful
  const phy2024: PastPaper = generateALPaperStructure({
    id: 'seed_phy_2024',
    year: 2024,
    subject: 'physics',
    paperType: 'official',
    sourceName: 'Department of Examinations',
    medium: 'english',
    now: nowMs - 86400000,
  });
  phy2024.questions[0].status = 'mastered';
  phy2024.questions[1].status = 'mastered';
  phy2024.questions[2].status = 'mastered';
  phy2024.questions[11].status = 'redo';
  phy2024.questions[11].unitTag = 'Unit 2 · Mechanics';
  phy2024.questions[11].mistakeNote = 'Forgot to resolve normal reaction along inclined wedge acceleration.';
  phy2024.questions[11].updatedAt = nowMs - 3600000;

  phy2024.questions[27].status = 'silly';
  phy2024.questions[27].unitTag = 'Unit 8 · Current Electricity';
  phy2024.questions[27].mistakeNote = 'Used diameter instead of radius in wire resistance ratio.';
  phy2024.questions[27].updatedAt = nowMs - 7200000;

  phy2024.questions[51].status = 'redo';
  phy2024.questions[51].unitTag = 'Unit 3 · Oscillations & Waves';
  phy2024.questions[51].mistakeNote = 'End-correction term omitted for closed resonance tube fundamental mode.';
  phy2024.questions[51].updatedAt = nowMs - 1800000;

  const maths2023: PastPaper = generateALPaperStructure({
    id: 'seed_maths_2023',
    year: 2023,
    subject: 'maths',
    paperType: 'official',
    sourceName: 'Department of Examinations',
    medium: 'english',
    now: nowMs - 172800000,
  });
  maths2023.questions[0].status = 'mastered';
  maths2023.questions[4].status = 'redo';
  maths2023.questions[4].unitTag = 'Pure · Calculus';
  maths2023.questions[4].mistakeNote = 'Missed modulus inside ln|sec x + tan x| substitution limits.';
  maths2023.questions[4].updatedAt = nowMs - 5400000;

  const ict2024: PastPaper = generateALPaperStructure({
    id: 'seed_ict_2024',
    year: 2024,
    subject: 'ict',
    paperType: 'official',
    sourceName: 'Department of Examinations',
    medium: 'sinhala',
    now: nowMs - 259200000,
  });
  ict2024.questions[3].status = 'mastered';
  ict2024.questions[18].status = 'silly';
  ict2024.questions[18].unitTag = 'Unit 4 · Networking';
  ict2024.questions[18].mistakeNote = 'Subnet broadcast address off-by-one (/26 block = 64 hosts, 62 usable).';
  ict2024.questions[18].updatedAt = nowMs - 10800000;

  const block1Id = 'blk_seed_1';
  const block2Id = 'blk_seed_2';
  const block3Id = 'blk_seed_3';

  return {
    version: 1,
    subjects: {
      maths: {
        id: 'maths',
        label: 'Combined Maths',
        sinhalaLabel: 'සංයුක්ත ගණිතය',
        color: '#0284C7',
      },
      physics: {
        id: 'physics',
        label: 'Physics',
        sinhalaLabel: 'භෞතික විද්‍යාව',
        color: '#D97706',
      },
      ict: {
        id: 'ict',
        label: 'ICT',
        sinhalaLabel: 'තොරතුරු හා සන්නිවේදන තාක්ෂණය',
        color: '#059669',
      },
      general: {
        id: 'general',
        label: 'General Revision',
        sinhalaLabel: 'පොදු පුනරීක්ෂණ',
        color: '#6366F1',
      },
    },
    tasks: [
      {
        id: 'tsk_seed_1',
        title: '2024 Physics Paper I MCQs (Q1–Q25)',
        subject: 'physics',
        durationMinutes: 60,
        priority: 'high',
        dueDate: todayISO,
        recurrence: 'none',
        completed: false,
        completedAt: null,
        notes: 'Time strictly 1 hour; flag any Mechanics questions taking > 2.5 min.',
        subtasks: [
          { id: 'sub_1', title: 'Complete Q1–Q15 Mechanics & Waves', done: true },
          { id: 'sub_2', title: 'Complete Q16–Q25 Fields & Electricity', done: false },
        ],
        scheduledBlockId: block1Id,
        updatedAt: nowMs - 10000,
      },
      {
        id: 'tsk_seed_2',
        title: 'Integration by Parts & Definite Integrals Drill',
        subject: 'maths',
        durationMinutes: 90,
        priority: 'high',
        dueDate: todayISO,
        recurrence: 'weekdays',
        completed: false,
        completedAt: null,
        notes: 'Focus on reduction formulas from 2019–2024 Part B Pure Maths.',
        subtasks: [],
        scheduledBlockId: block2Id,
        updatedAt: nowMs - 20000,
      },
      {
        id: 'tsk_seed_3',
        title: 'SQL Joins & 3NF Normalization Past Questions',
        subject: 'ict',
        durationMinutes: 45,
        priority: 'medium',
        dueDate: todayISO,
        recurrence: 'none',
        completed: false,
        completedAt: null,
        notes: 'Review ER-to-Relational table mapping rules.',
        subtasks: [],
        scheduledBlockId: null,
        updatedAt: nowMs - 30000,
      },
      {
        id: 'tsk_seed_4',
        title: 'Relative Velocity Boat & Wind Vectors',
        subject: 'maths',
        durationMinutes: 60,
        priority: 'medium',
        dueDate: tomorrowISO,
        recurrence: 'none',
        completed: false,
        completedAt: null,
        notes: '',
        subtasks: [],
        scheduledBlockId: null,
        updatedAt: nowMs - 40000,
      },
    ],
    blocks: [
      {
        id: block1Id,
        title: '2024 Physics Paper I MCQs (Q1–Q25)',
        subject: 'physics',
        date: todayISO,
        startMinutes: 420, // 07:00
        durationMinutes: 60,
        taskId: 'tsk_seed_1',
        notes: 'Morning crisp focus slot',
        updatedAt: nowMs - 50000,
      },
      {
        id: block2Id,
        title: 'Integration by Parts & Definite Integrals Drill',
        subject: 'maths',
        date: todayISO,
        startMinutes: 540, // 09:00
        durationMinutes: 90,
        taskId: 'tsk_seed_2',
        notes: 'Pure Maths Part B practice',
        updatedAt: nowMs - 40000,
      },
      {
        id: block3Id,
        title: 'Python File I/O & Logic Gate K-Maps',
        subject: 'ict',
        date: todayISO,
        startMinutes: 960, // 16:00
        durationMinutes: 60,
        taskId: null,
        notes: '',
        updatedAt: nowMs - 30000,
      },
    ],
    sessions: [
      {
        id: 'ses_seed_1',
        title: '2024 Physics Paper I MCQs (Q1–Q25)',
        subject: 'physics',
        mode: 'pomodoro_50',
        date: todayISO,
        startTimestamp: new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate(), 7, 15).getTime(),
        endTimestamp: new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate(), 8, 5).getTime(),
        durationMinutes: 50,
        rating: 4,
        notes: 'Finished 21/25 on first pass; marked Q12 for Redo.',
        taskId: 'tsk_seed_1',
        blockId: block1Id,
        updatedAt: nowMs - 20000,
      },
      {
        id: 'ses_seed_2',
        title: 'Pure Maths Differentiation Limits',
        subject: 'maths',
        mode: 'pomodoro_50',
        date: yesterdayISO,
        startTimestamp: new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate() - 1, 18, 0).getTime(),
        endTimestamp: new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate() - 1, 19, 30).getTime(),
        durationMinutes: 90,
        rating: 5,
        notes: 'Strong session with L-Hopital check.',
        taskId: null,
        blockId: null,
        updatedAt: nowMs - 90000000,
      },
      {
        id: 'ses_seed_3',
        title: 'ICT Networking IPv4 Subnetting',
        subject: 'ict',
        mode: 'flowtime',
        date: twoDaysAgoISO,
        startTimestamp: new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate() - 2, 19, 0).getTime(),
        endTimestamp: new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate() - 2, 20, 15).getTime(),
        durationMinutes: 75,
        rating: 4,
        notes: 'Worked through 2022–2024 CIDR problems.',
        taskId: null,
        blockId: null,
        updatedAt: nowMs - 172800000,
      },
    ],
    papers: [phy2024, maths2023, ict2024],
    syllabus: buildBilingualSyllabusSeed(),
    examCountdowns: [
      {
        id: 'ex_1',
        title: 'G.C.E. A/L Final Examination',
        date: addDaysISO(todayISO, 260),
        subject: 'general',
      },
      {
        id: 'ex_2',
        title: 'Second Term School Evaluation',
        date: addDaysISO(todayISO, 38),
        subject: 'physics',
      },
    ],
    settings: {
      theme: 'light',
      medium: 'bilingual',
      dailyGoalMinutes: 240,
      firebaseConfigJson: '',
      updatedAt: nowMs,
    },
    activeTimer: {
      isRunning: false,
      mode: 'pomodoro_25',
      phase: 'focus',
      startedAt: null,
      accumulatedMs: 0,
      targetDurationMs: 25 * 60 * 1000,
      title: '2024 Physics Paper I MCQs',
      subject: 'physics',
      taskId: null,
      blockId: null,
    },
    lastModified: nowMs,
  };
}
