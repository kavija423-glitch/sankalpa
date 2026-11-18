import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialAppState } from '../data/initialSeed';
import type { CalendarBlock, StudySession } from '../types/app';
import {
  aggregateDailySessions,
  buildMonthlyHeatmapGrid,
  buildYearlyHeatmapColumns,
  computeLast7DaysPlannedVsActual,
  computePeakFocusHours,
  computePeriodComparison,
  computePlanExecutionAccuracy,
  computeRolling7DayAverage,
  computeStreaks,
  computeSubjectBreakdown,
  computeWeeklySubjectBalanceAlerts,
} from './analyticsMath';

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
  const comparison = computePeriodComparison(fresh.sessions, 'week', '2026-11-18');
  const alerts = computeWeeklySubjectBalanceAlerts(fresh.sessions, fresh.subjects, '2026-11-18');
  const hours = computePeakFocusHours(fresh.sessions);

  assert.equal(streaks.currentStreak, 0);
  assert.equal(streaks.bestStreak, 0);
  assert.equal(avg.averageMinutes, 0);
  assert.equal(accuracy.accuracyPercent, 0);
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
