import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialAppState } from '../data/initialSeed';
import type { CalendarBlock, StudySession } from '../types/app';
import {
  aggregateDailySessions,
  buildMonthlyHeatmapGrid,
  buildYearlyHeatmapColumns,
  computeDailyPlanExecutionAccuracy,
  computeDailyTaskProgress,
  computeGoalConsistencyAndBestDay,
  computeLast7DaysPlannedVsActual,
  computePastPaperAnalytics,
  computePeakFocusHours,
  computePeriodComparison,
  computePlanExecutionAccuracy,
  computeRolling7DayAverage,
  computeSessionQualityAndRhythm,
  computeStreaks,
  computeSubjectBreakdown,
  computeSyllabusDepthStats,
  computeTaskBacklogStats,
  computeTodayFocusStats,
  computeWeakUnitsForAction,
  computeWeekdayRhythm,
  computeWeeklySubjectBalanceAlerts,
} from './analyticsMath';
import type { PastPaper, TaskItem } from '../types/app';

function makeSession(
  id: string,
  date: string,
  subject: StudySession['subject'],
  durationMinutes: number,
  startHour = 9,
  startMin = 0,
  blockId: string | null = null
): StudySession {
  const [y, m, d] = date.split('-').map(Number);
  const start = new Date(y, (m || 1) - 1, d || 1, startHour, startMin, 0).getTime();
  return {
    id,
    title: `Study ${id}`,
    subject,
    mode: 'pomodoro_25',
    date,
    startTimestamp: start,
    endTimestamp: start + durationMinutes * 60000,
    durationMinutes,
    rating: 4,
    notes: '',
    taskId: null,
    blockId,
    updatedAt: start,
  };
}

test('analytics math handles completely empty sessions and blocks gracefully', () => {
  const fresh = createInitialAppState();
  const daily = aggregateDailySessions(fresh.sessions);
  const streaks = computeStreaks(daily, '2026-11-18');
  const avg = computeRolling7DayAverage(daily, '2026-11-18');
  const accuracy = computePlanExecutionAccuracy(fresh.blocks, fresh.sessions, '2026-11-18');
  const dailyAcc = computeDailyPlanExecutionAccuracy(fresh.blocks, fresh.sessions, '2026-11-18');
  const todayStats = computeTodayFocusStats(daily, '2026-11-18', 180);
  const taskProgress = computeDailyTaskProgress(fresh.tasks, '2026-11-18');
  const comparison = computePeriodComparison(fresh.sessions, 'week', '2026-11-18');
  const alerts = computeWeeklySubjectBalanceAlerts(fresh.sessions, fresh.subjects, '2026-11-18');
  const hours = computePeakFocusHours(fresh.sessions);

  assert.equal(streaks.currentStreak, 0);
  assert.equal(streaks.bestStreak, 0);
  assert.equal(avg.averageMinutes, 0);
  assert.equal(accuracy.accuracyPercent, 0);
  assert.equal(dailyAcc.accuracyPercent, 0);
  assert.equal(dailyAcc.blockCount, 0);
  assert.equal(todayStats.todayMinutes, 0);
  assert.equal(todayStats.goalPercent, 0);
  assert.equal(taskProgress.dueTodayCount, 0);
  assert.equal(taskProgress.completionPercent, 0);
  assert.equal(comparison.currentMinutes, 0);
  assert.equal(comparison.percentChange, null);
  assert.equal(alerts.length, 0);
  assert.equal(hours.length, 24);
  assert.equal(hours.every((h) => h.minutes === 0 && !h.isPeak), true);
});

test('computeStreaks requires >= 30 mins per day and tracks current and best streaks', () => {
  const sessions: StudySession[] = [
    // Old 3-day streak: Nov 10, 11, 12
    makeSession('s1', '2026-11-10', 'physics', 45),
    makeSession('s2', '2026-11-11', 'maths', 30),
    makeSession('s3', '2026-11-12', 'ict', 60),
    // Nov 13 only 20 mins -> breaks streak
    makeSession('s4', '2026-11-13', 'physics', 20),
    // Current 2-day streak ending yesterday Nov 17
    makeSession('s5', '2026-11-16', 'physics', 35),
    makeSession('s6', '2026-11-17', 'maths', 15),
    makeSession('s7', '2026-11-17', 'ict', 20), // 35m total on Nov 17
  ];

  const daily = aggregateDailySessions(sessions);
  const streaks = computeStreaks(daily, '2026-11-18', 30);

  assert.equal(streaks.currentStreak, 2);
  assert.equal(streaks.bestStreak, 3);
  assert.equal(streaks.qualifiedDaysCount, 5);
});

test('KPI period comparison, rolling 7-day average, and plan execution accuracy compute accurately', () => {
  const fresh = createInitialAppState();
  const blocks: CalendarBlock[] = [
    {
      id: 'b1',
      title: 'Physics Mechanics',
      subject: 'physics',
      date: '2026-11-17',
      startMinutes: 480,
      durationMinutes: 60,
      taskId: null,
      completed: true,
      notes: '',
      updatedAt: 1000,
    },
    {
      id: 'b2',
      title: 'Maths Integration',
      subject: 'maths',
      date: '2026-11-18',
      startMinutes: 540,
      durationMinutes: 60,
      taskId: null,
      completed: false,
      notes: '',
      updatedAt: 1000,
    },
  ];
  const sessions: StudySession[] = [
    // Last week (Nov 11): 60m
    makeSession('p1', '2026-11-11', 'physics', 60),
    // This week (Nov 17 & 18): 90m + 30m logged toward b2 = 120m (+100% vs last week)
    makeSession('c1', '2026-11-17', 'physics', 90, 8, 30, 'b1'),
    makeSession('c2', '2026-11-18', 'maths', 30, 14, 0, 'b2'),
  ];

  const daily = aggregateDailySessions(sessions);
  const comp = computePeriodComparison(sessions, 'week', '2026-11-18');
  assert.equal(comp.currentMinutes, 120);
  assert.equal(comp.previousMinutes, 60);
  assert.equal(comp.percentChange, 100);

  const avg = computeRolling7DayAverage(daily, '2026-11-18');
  // Nov 12..18 contains Nov 17 (90) + Nov 18 (30) = 120m => 120/7 = 17m
  assert.equal(avg.total7DayMinutes, 120);
  assert.equal(avg.averageMinutes, 17);

  const acc = computePlanExecutionAccuracy(blocks, sessions, '2026-11-18');
  // b1 (60m completed) + b2 (30m logged of 60m) = 90/120 = 75%
  assert.equal(acc.accuracyPercent, 75);
  assert.equal(acc.completedMinutes, 90);
  assert.equal(acc.scheduledMinutes, 120);

  // Daily plan execution accuracy scoped strictly to Nov 18 (b2: 30m / 60m = 50%)
  const dailyAcc = computeDailyPlanExecutionAccuracy(blocks, sessions, '2026-11-18');
  assert.equal(dailyAcc.accuracyPercent, 50);
  assert.equal(dailyAcc.completedMinutes, 30);
  assert.equal(dailyAcc.scheduledMinutes, 60);
  assert.equal(dailyAcc.blockCount, 1);

  // Today focus stats (30m today vs 90m yesterday, 60m daily goal => 50%)
  const todayStats = computeTodayFocusStats(daily, '2026-11-18', 60);
  assert.equal(todayStats.todayMinutes, 30);
  assert.equal(todayStats.yesterdayMinutes, 90);
  assert.equal(todayStats.deltaFromYesterday, -60);
  assert.equal(todayStats.goalPercent, 50);
  assert.equal(todayStats.remainingMinutes, 30);

  // Daily task progress
  const completedTodayTs = new Date(2026, 10, 18, 11, 0, 0).getTime();
  const tasks: TaskItem[] = [
    {
      id: 't1',
      title: 'Finish Integration Sheet',
      subject: 'maths',
      durationMinutes: 45,
      priority: 'high',
      dueDate: '2026-11-18',
      recurrence: 'none',
      completed: true,
      completedAt: completedTodayTs,
      notes: '',
      subtasks: [],
      scheduledBlockId: null,
      updatedAt: completedTodayTs,
    },
    {
      id: 't2',
      title: 'Revise Wave Optics',
      subject: 'physics',
      durationMinutes: 30,
      priority: 'medium',
      dueDate: '2026-11-18',
      recurrence: 'none',
      completed: false,
      completedAt: null,
      notes: '',
      subtasks: [],
      scheduledBlockId: null,
      updatedAt: completedTodayTs,
    },
  ];
  const taskProgress = computeDailyTaskProgress(tasks, '2026-11-18');
  assert.equal(taskProgress.dueTodayCount, 2);
  assert.equal(taskProgress.completedDueTodayCount, 1);
  assert.equal(taskProgress.completionPercent, 50);

  const trend = computeLast7DaysPlannedVsActual(blocks, daily, '2026-11-18');
  assert.equal(trend.length, 7);
  assert.equal(trend[5].plannedMinutes, 60);
  assert.equal(trend[5].actualMinutes, 90);

  // Subject breakdown & balance alert: Physics 75%, Maths 25%, ICT 0% (<20%)
  const breakdown = computeSubjectBreakdown(sessions, fresh.subjects, 'week', '2026-11-18');
  assert.equal(breakdown.totalMinutes, 120);
  const alerts = computeWeeklySubjectBalanceAlerts(sessions, fresh.subjects, '2026-11-18');
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].subject, 'ict');
});

test('monthly & yearly heatmaps and peak focus hours bucket sessions across boundaries', () => {
  const sessions: StudySession[] = [
    // 08:30 -> 10:00 (90m: 30m in hour 8, 60m in hour 9)
    makeSession('h1', '2026-11-18', 'physics', 90, 8, 30),
    makeSession('h2', '2026-11-18', 'ict', 120, 20, 0), // 120m in hours 20 & 21 (60m each)
  ];

  const daily = aggregateDailySessions(sessions);
  const nov18 = daily.get('2026-11-18');
  assert.ok(nov18);
  assert.equal(nov18.totalMinutes, 210);
  assert.equal(nov18.topSubject, 'ict');
  assert.equal(nov18.intensity, 4); // >= 180m

  const monthCells = buildMonthlyHeatmapGrid(daily, 2026, 11);
  assert.equal(monthCells.length % 7, 0);
  const targetCell = monthCells.find((c) => c.date === '2026-11-18');
  assert.ok(targetCell);
  assert.equal(targetCell.totalMinutes, 210);
  assert.equal(targetCell.intensity, 4);

  const yearlyCols = buildYearlyHeatmapColumns(daily, '2026-11-18');
  assert.ok(yearlyCols.length >= 52);
  const foundYearDay = yearlyCols.flatMap((c) => c.days).find((d) => d.date === '2026-11-18');
  assert.ok(foundYearDay);
  assert.equal(foundYearDay.totalMinutes, 210);

  const hours = computePeakFocusHours(sessions);
  assert.equal(hours[8].minutes, 30);
  assert.equal(hours[9].minutes, 60);
  assert.equal(hours[20].minutes, 60);
  assert.equal(hours[21].minutes, 60);
  assert.equal(hours[9].isPeak, true);
});

test('session quality, weekday rhythm, 30d goal consistency, task backlog, paper & syllabus depth analytics compute accurately', () => {
  const fresh = createInitialAppState();

  const sessions: StudySession[] = [
    { ...makeSession('q1', '2026-11-18', 'physics', 60, 8, 0), rating: 5, mode: 'pomodoro_50' }, // Wed
    { ...makeSession('q2', '2026-11-18', 'ict', 30, 10, 0), rating: 3, mode: 'flowtime' }, // Wed
    { ...makeSession('q3', '2026-11-14', 'maths', 90, 14, 0), rating: 4, mode: 'manual', isManual: true }, // Sat
  ];

  const quality = computeSessionQualityAndRhythm(sessions);
  assert.equal(quality.totalSessions, 3);
  assert.equal(quality.avgRating, 4);
  assert.equal(quality.avgSessionMinutes, 60);
  assert.equal(quality.longestSessionMinutes, 90);
  assert.equal(quality.deepSessionsCount, 2); // 60m and 90m
  assert.equal(quality.liveMinutes, 90);
  assert.equal(quality.manualMinutes, 90);
  assert.equal(quality.modeBreakdown.length, 3);

  const weekdays = computeWeekdayRhythm(sessions);
  assert.equal(weekdays.length, 7);
  // Wed (idx 2) = 90m, Sat (idx 5) = 90m -> both tied for best
  assert.equal(weekdays[2].totalMinutes, 90);
  assert.equal(weekdays[5].totalMinutes, 90);
  assert.equal(weekdays[2].isBest, true);

  const daily = aggregateDailySessions(sessions);
  const goalStats = computeGoalConsistencyAndBestDay(daily, '2026-11-18', 90);
  assert.equal(goalStats.goalHitDays30, 2); // Nov 18 (90m) & Nov 14 (90m)
  assert.equal(goalStats.bestDayMinutes, 90);
  assert.equal(goalStats.bestDayDate, '2026-11-18'); // latest tie wins

  const tasks: TaskItem[] = [
    {
      id: 'tb1',
      title: 'Overdue High Task',
      subject: 'physics',
      durationMinutes: 45,
      priority: 'high',
      dueDate: '2026-11-16',
      recurrence: 'none',
      completed: false,
      completedAt: null,
      notes: '',
      subtasks: [],
      scheduledBlockId: null,
      updatedAt: 1,
    },
    {
      id: 'tb2',
      title: 'Completed Task',
      subject: 'ict',
      durationMinutes: 30,
      priority: 'low',
      dueDate: '2026-11-18',
      recurrence: 'none',
      completed: true,
      completedAt: 100,
      notes: '',
      subtasks: [],
      scheduledBlockId: null,
      updatedAt: 1,
    },
  ];
  const backlog = computeTaskBacklogStats(tasks, '2026-11-18');
  assert.equal(backlog.totalCount, 2);
  assert.equal(backlog.completedCount, 1);
  assert.equal(backlog.completionRatePercent, 50);
  assert.equal(backlog.overdueCount, 1);
  assert.equal(backlog.highPriorityOpenCount, 1);
  assert.equal(backlog.backlogMinutesRemaining, 45);

  const papers: PastPaper[] = [
    {
      id: 'pp1',
      year: 2024,
      subject: 'physics',
      paperType: 'official',
      sourceName: 'DoE',
      medium: 'english',
      title: '2024 Physics',
      createdAt: 1,
      updatedAt: 1,
      questions: [
        { id: 'pq1', paperId: 'pp1', label: 'MCQ 1', section: 'MCQ', number: 1, status: 'mastered', unitTag: 'Mechanics', mistakeNote: '', updatedAt: 1 },
        { id: 'pq2', paperId: 'pp1', label: 'MCQ 2', section: 'MCQ', number: 2, status: 'redo', unitTag: 'Optics', mistakeNote: 'Sign error', updatedAt: 1 },
        { id: 'pq3', paperId: 'pp1', label: 'MCQ 3', section: 'MCQ', number: 3, status: 'silly', unitTag: 'Optics', mistakeNote: 'Unit conversion', updatedAt: 1 },
        { id: 'pq4', paperId: 'pp1', label: 'MCQ 4', section: 'MCQ', number: 4, status: 'unattempted', unitTag: '', mistakeNote: '', updatedAt: 1 },
      ],
    },
  ];
  const paperStats = computePastPaperAnalytics(papers, fresh.subjects);
  assert.equal(paperStats.paperCount, 1);
  assert.equal(paperStats.totalQuestions, 4);
  assert.equal(paperStats.attemptedQuestions, 3);
  assert.equal(paperStats.masteredCount, 1);
  assert.equal(paperStats.redoCount, 1);
  assert.equal(paperStats.sillyCount, 1);
  assert.equal(paperStats.unattemptedCount, 1);
  assert.equal(paperStats.masteryRatePercent, 33);
  assert.equal(paperStats.topWeakUnits[0].unitTag, 'Optics');
  assert.equal(paperStats.topWeakUnits[0].totalIssues, 2);

  // Modify two subtopics in syllabus to test depth analytics
  const customSyllabus = fresh.syllabus.map((u, idx) =>
    idx === 0
      ? {
          ...u,
          subtopics: u.subtopics.map((st, sIdx) =>
            sIdx === 0
              ? { ...st, mastery: 'mastered' as const, confidence: 5, revisionCount: 4 }
              : sIdx === 1
              ? { ...st, mastery: 'learning' as const, confidence: 2, revisionCount: 1 }
              : st
          ),
        }
      : u
  );
  const syllabusDepth = computeSyllabusDepthStats(customSyllabus, fresh.subjects);
  assert.equal(syllabusDepth.mastered, 1);
  assert.equal(syllabusDepth.learning, 1);
  assert.equal(syllabusDepth.totalRevisions, 5);
  assert.equal(syllabusDepth.lowConfidenceCount, 1);

  // Pristine syllabus + no papers yields 0 weak action items
  assert.equal(computeWeakUnitsForAction(fresh.syllabus, [], fresh.subjects).length, 0);

  // Combining syllabus low confidence + past paper redo/silly tags ranks weak units accurately
  const weakActions = computeWeakUnitsForAction(customSyllabus, papers, fresh.subjects);
  assert.equal(weakActions.length, 2);
  assert.ok(weakActions.some((w) => w.title === 'Optics' && w.redoCount === 1 && w.sillyCount === 1));
  assert.ok(weakActions.some((w) => w.title === customSyllabus[0].titleEn && w.lowConfidenceCount === 1));
});



