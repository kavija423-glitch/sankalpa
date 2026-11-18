import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Award,
  BookOpen,
  Calendar as CalendarIcon,
  CheckCircle2,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  Flame,
  ListTodo,
  Pencil,
  Star,
  Target,
  Timer,
  TrendingDown,
  TrendingUp,
  Trophy,
} from 'lucide-react';
import type {
  CalendarBlock,
  ExamCountdown,
  PastPaper,
  StudySession,
  SubjectConfig,
  SubjectKey,
  SyllabusUnit,
  TaskItem,
} from '../types/app';
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
  computeSyllabusMasterySummary,
  computeWeekdayRhythm,
  computeWeeklySubjectBalanceAlerts,
  type AnalyticsTimeframe,
  type HeatmapIntensity,
} from '../utils/analyticsMath';
import { daysUntilISO, formatDurationLabel, formatTime24 } from '../utils/calendarMath';
import { toISODateLocal } from '../utils/nlpTaskParser';
import { extractRedoQueue } from '../utils/paperGenerator';

interface AnalyticsViewProps {
  blocks: CalendarBlock[];
  sessions: StudySession[];
  tasks: TaskItem[];
  papers: PastPaper[];
  syllabus: SyllabusUnit[];
  subjects: Record<SubjectKey, SubjectConfig>;
  dailyGoalMinutes: number;
  examCountdowns?: ExamCountdown[];
  onOpenLogSession: () => void;
  onEditManualSession: (session: StudySession) => void;
}

const INTENSITY_CLASSES: Record<HeatmapIntensity, string> = {
  0: 'bg-[#F0F0EC] dark:bg-[#191D26] text-[#9CA3AF] dark:text-[#6B7280]',
  1: 'bg-[#E0E7FF] dark:bg-[#1E2547] text-[#3730A3] dark:text-[#C7D2FE]',
  2: 'bg-[#A5B4FC] dark:bg-[#312E81] text-[#1E1B4B] dark:text-[#E0E7FF]',
  3: 'bg-[#6366F1] dark:bg-[#4F46E5] text-white',
  4: 'bg-[#3730A3] dark:bg-[#818CF8] text-white dark:text-[#0B0D11]',
};

const YEARLY_TILE_CLASSES: Record<HeatmapIntensity, string> = {
  0: 'bg-[#ECECE7] dark:bg-[#191D26]',
  1: 'bg-[#C7D2FE] dark:bg-[#1E2547]',
  2: 'bg-[#818CF8] dark:bg-[#3730A3]',
  3: 'bg-[#4F46E5] dark:bg-[#6366F1]',
  4: 'bg-[#312E81] dark:bg-[#A5B4FC]',
};

const TIMEFRAME_OPTIONS: Array<{ id: AnalyticsTimeframe; label: string }> = [
  { id: 'week', label: 'This Week' },
  { id: 'month', label: 'This Month' },
  { id: 'year', label: 'This Year' },
];

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({
  blocks,
  sessions,
  tasks,
  papers,
  syllabus,
  subjects,
  dailyGoalMinutes,
  examCountdowns = [],
  onOpenLogSession,
  onEditManualSession,
}) => {
  const todayISO = toISODateLocal(new Date());
  const [todayYear, todayMonth] = todayISO.split('-').map(Number);

  const [timeframe, setTimeframe] = useState<AnalyticsTimeframe>('week');
  const [historyFilter, setHistoryFilter] = useState<'all' | 'manual' | 'live'>('all');
  const [hoveredSubject, setHoveredSubject] = useState<SubjectKey | null>(null);
  const [monthCursor, setMonthCursor] = useState<{ year: number; month: number }>({
    year: todayYear,
    month: todayMonth,
  });
  const [activeMonthCell, setActiveMonthCell] = useState<{
    date: string;
    totalMinutes: number;
    sessionCount: number;
    topSubject: SubjectKey | null;
  } | null>(null);
  const [activeYearCell, setActiveYearCell] = useState<{
    date: string;
    totalMinutes: number;
    sessionCount: number;
    topSubject: SubjectKey | null;
  } | null>(null);
  const [activeHourIndex, setActiveHourIndex] = useState<number | null>(null);
  const [activeTrendDay, setActiveTrendDay] = useState<string | null>(null);
  const [activeWeekdayIndex, setActiveWeekdayIndex] = useState<number | null>(null);
  const yearlyScrollRef = useRef<HTMLDivElement | null>(null);

  const activeSessions = useMemo(
    () => sessions.filter((s) => !s.deletedAt && s.durationMinutes > 0),
    [sessions]
  );

  const taskTitleMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of tasks) {
      map.set(t.id, t.title);
    }
    return map;
  }, [tasks]);

  const dailyMap = useMemo(() => aggregateDailySessions(activeSessions), [activeSessions]);

  const streaks = useMemo(() => computeStreaks(dailyMap, todayISO, 30), [dailyMap, todayISO]);
  const rolling7 = useMemo(() => computeRolling7DayAverage(dailyMap, todayISO), [dailyMap, todayISO]);
  const planAccuracy = useMemo(
    () => computePlanExecutionAccuracy(blocks, activeSessions, todayISO),
    [blocks, activeSessions, todayISO]
  );
  const todayStats = useMemo(
    () => computeTodayFocusStats(dailyMap, todayISO, dailyGoalMinutes),
    [dailyMap, todayISO, dailyGoalMinutes]
  );
  const dailyPlanAccuracy = useMemo(
    () => computeDailyPlanExecutionAccuracy(blocks, activeSessions, todayISO),
    [blocks, activeSessions, todayISO]
  );
  const dailyTaskProgress = useMemo(
    () => computeDailyTaskProgress(tasks, todayISO),
    [tasks, todayISO]
  );
  const periodComparison = useMemo(
    () => computePeriodComparison(activeSessions, timeframe, todayISO),
    [activeSessions, timeframe, todayISO]
  );
  const allTimeMinutes = useMemo(
    () => activeSessions.reduce((acc, s) => acc + Math.max(0, s.durationMinutes), 0),
    [activeSessions]
  );

  const subjectBreakdown = useMemo(
    () => computeSubjectBreakdown(activeSessions, subjects, timeframe, todayISO),
    [activeSessions, subjects, timeframe, todayISO]
  );
  const weeklyBalanceAlerts = useMemo(
    () => computeWeeklySubjectBalanceAlerts(activeSessions, subjects, todayISO, 20),
    [activeSessions, subjects, todayISO]
  );

  const monthlyCells = useMemo(
    () => buildMonthlyHeatmapGrid(dailyMap, monthCursor.year, monthCursor.month),
    [dailyMap, monthCursor.year, monthCursor.month]
  );
  const yearlyColumns = useMemo(
    () => buildYearlyHeatmapColumns(dailyMap, todayISO),
    [dailyMap, todayISO]
  );
  const yearlyStats = useMemo(() => {
    let totalMinutes = 0;
    let activeDays = 0;
    for (const col of yearlyColumns) {
      for (const d of col.days) {
        if (d.inRange && d.totalMinutes > 0) {
          totalMinutes += d.totalMinutes;
          activeDays += 1;
        }
      }
    }
    return { totalMinutes, activeDays };
  }, [yearlyColumns]);

  useEffect(() => {
    if (yearlyScrollRef.current) {
      yearlyScrollRef.current.scrollLeft = yearlyScrollRef.current.scrollWidth;
    }
  }, [yearlyColumns.length]);

  const peakHours = useMemo(() => computePeakFocusHours(activeSessions), [activeSessions]);
  const peakHourDatum = useMemo(
    () => peakHours.find((h) => h.isPeak && h.minutes > 0) ?? null,
    [peakHours]
  );
  const maxHourMinutes = Math.max(30, ...peakHours.map((h) => h.minutes));

  const trend7Days = useMemo(
    () => computeLast7DaysPlannedVsActual(blocks, dailyMap, todayISO),
    [blocks, dailyMap, todayISO]
  );
  const maxTrendMinutes = Math.max(
    60,
    ...trend7Days.flatMap((d) => [d.plannedMinutes, d.actualMinutes])
  );

  const syllabusSummary = useMemo(
    () => computeSyllabusMasterySummary(syllabus, subjects),
    [syllabus, subjects]
  );
  const sessionQuality = useMemo(
    () => computeSessionQualityAndRhythm(activeSessions),
    [activeSessions]
  );
  const weekdayRhythm = useMemo(
    () => computeWeekdayRhythm(activeSessions),
    [activeSessions]
  );
  const bestWeekdayDatum = useMemo(
    () => weekdayRhythm.find((d) => d.isBest && d.totalMinutes > 0) ?? null,
    [weekdayRhythm]
  );
  const maxWeekdayMinutes = Math.max(30, ...weekdayRhythm.map((d) => d.totalMinutes));
  const inspectedWeekday =
    activeWeekdayIndex !== null ? weekdayRhythm[activeWeekdayIndex] : bestWeekdayDatum;

  const goalConsistency = useMemo(
    () => computeGoalConsistencyAndBestDay(dailyMap, todayISO, dailyGoalMinutes),
    [dailyMap, todayISO, dailyGoalMinutes]
  );
  const taskBacklog = useMemo(
    () => computeTaskBacklogStats(tasks, todayISO),
    [tasks, todayISO]
  );
  const paperAnalytics = useMemo(
    () => computePastPaperAnalytics(papers, subjects),
    [papers, subjects]
  );
  const syllabusDepth = useMemo(
    () => computeSyllabusDepthStats(syllabus, subjects),
    [syllabus, subjects]
  );
  const redoCount = useMemo(() => extractRedoQueue(papers).length, [papers]);
  const todayMinutes = dailyMap.get(todayISO)?.totalMinutes ?? 0;
  const todayGoalPct = Math.min(100, Math.round((todayMinutes / Math.max(1, dailyGoalMinutes)) * 100));

  // SVG Donut Geometry
  const donutRadius = 70;
  const donutCircumference = 2 * Math.PI * donutRadius;
  const donutSegments = useMemo(() => {
    if (subjectBreakdown.totalMinutes <= 0) return [];
    let offsetAcc = 0;
    return subjectBreakdown.items
      .filter((item) => item.minutes > 0)
      .map((item) => {
        const fraction = item.minutes / subjectBreakdown.totalMinutes;
        const length = fraction * donutCircumference;
        const seg = {
          ...item,
          dashArray: `${length} ${donutCircumference}`,
          dashOffset: -offsetAcc,
        };
        offsetAcc += length;
        return seg;
      });
  }, [subjectBreakdown, donutCircumference]);

  const focusedDonutSubject = hoveredSubject
    ? subjectBreakdown.items.find((i) => i.subject === hoveredSubject) ?? null
    : null;

  const monthHeading = useMemo(() => {
    const dt = new Date(monthCursor.year, monthCursor.month - 1, 1);
    return dt.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }, [monthCursor]);

  const shiftMonth = (delta: -1 | 1) => {
    setActiveMonthCell(null);
    setMonthCursor((prev) => {
      const next = new Date(prev.year, prev.month - 1 + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() + 1 };
    });
  };

  const inspectedHour =
    activeHourIndex !== null ? peakHours[activeHourIndex] : peakHourDatum;

  const inspectedTrend =
    activeTrendDay !== null
      ? trend7Days.find((d) => d.iso === activeTrendDay) ?? null
      : null;

  return (
    <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 py-5 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 border-b border-[#E5E5E0] dark:border-[#232834] pb-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#141413] dark:text-[#F3F4F6]">
            Focus Analytics
          </h1>
          <p className="text-sm text-[#5A5A55] dark:text-[#9CA3AF] mt-1">
            Study streaks, subject distribution, heatmaps & planned-vs-actual adherence
          </p>
        </div>
        <div className="flex flex-col sm:items-end gap-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#5A5A55] dark:text-[#9CA3AF] tabular-nums">
            <span>
              Today’s Target:{' '}
              <strong className="font-mono text-[#141413] dark:text-[#F3F4F6]">
                {formatDurationLabel(todayMinutes)} / {formatDurationLabel(dailyGoalMinutes)} ({todayGoalPct}%)
              </strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Redo Queue:{' '}
              <strong className="font-mono text-[#141413] dark:text-[#F3F4F6]">{redoCount}</strong>
            </span>
          </div>
          <button
            type="button"
            onClick={onOpenLogSession}
            data-testid="analytics-log-session-btn"
            className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-[#4338CA] dark:bg-[#6366F1] text-white text-xs font-semibold flex items-center gap-1.5 hover:opacity-90 whitespace-nowrap self-start sm:self-end cursor-pointer"
          >
            <Clock className="w-3.5 h-3.5" />
            <span>+ Log Session</span>
          </button>
        </div>
      </div>

      {/* 1. Top KPI Summary Row (4 Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Card 1: Total Focus Time + % change vs prev period */}
        <div className="rounded-2xl bg-white dark:bg-[#13161D] border border-[#E5E5E0] dark:border-[#232834] p-4">
          <div className="flex items-center justify-between text-xs text-[#5A5A55] dark:text-[#9CA3AF]">
            <span>
              Focus Time ({timeframe === 'week' ? 'Week' : timeframe === 'month' ? 'Month' : 'Year'})
            </span>
            <Clock className="w-4 h-4 text-[#4338CA] dark:text-[#818CF8]" />
          </div>
          <div className="font-mono tabular-nums text-2xl font-bold text-[#141413] dark:text-[#F3F4F6] mt-2">
            {formatDurationLabel(periodComparison.currentMinutes)}
          </div>
          <div className="mt-1 flex items-center gap-1 text-[11px] font-medium tabular-nums">
            {periodComparison.percentChange !== null && periodComparison.percentChange >= 0 ? (
              <TrendingUp className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            ) : periodComparison.percentChange !== null ? (
              <TrendingDown className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
            ) : null}
            <span
              className={
                periodComparison.percentChange === null
                  ? 'text-[#5A5A55] dark:text-[#9CA3AF]'
                  : periodComparison.percentChange >= 0
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-rose-600 dark:text-rose-400'
              }
            >
              {periodComparison.deltaLabel}
            </span>
          </div>
          <div className="text-[11px] text-[#5A5A55] dark:text-[#9CA3AF] mt-0.5 font-mono tabular-nums">
            All-time: {formatDurationLabel(allTimeMinutes)} · {activeSessions.length}{' '}
            {activeSessions.length === 1 ? 'session' : 'sessions'}
          </div>
        </div>

        {/* Card 2: Current Streak & Best Streak (>= 30m/day) */}
        <div className="rounded-2xl bg-white dark:bg-[#13161D] border border-[#E5E5E0] dark:border-[#232834] p-4">
          <div className="flex items-center justify-between text-xs text-[#5A5A55] dark:text-[#9CA3AF]">
            <span>Study Streak</span>
            <Flame className="w-4 h-4 text-amber-500" />
          </div>
          <div className="font-mono tabular-nums text-2xl font-bold text-[#141413] dark:text-[#F3F4F6] mt-2">
            {streaks.currentStreak} {streaks.currentStreak === 1 ? 'day' : 'days'}
          </div>
          <div className="text-[11px] text-[#5A5A55] dark:text-[#9CA3AF] mt-1 font-mono tabular-nums">
            Best streak: <strong className="text-[#141413] dark:text-[#F3F4F6]">{streaks.bestStreak}d</strong>
          </div>
          <div className="text-[11px] text-[#5A5A55] dark:text-[#9CA3AF] mt-0.5 tabular-nums">
            Requires ≥ 30m logged/day
          </div>
        </div>

        {/* Card 3: Daily Focus Average (Rolling 7-Day) */}
        <div className="rounded-2xl bg-white dark:bg-[#13161D] border border-[#E5E5E0] dark:border-[#232834] p-4">
          <div className="flex items-center justify-between text-xs text-[#5A5A55] dark:text-[#9CA3AF]">
            <span>Daily Focus Average</span>
            <CalendarIcon className="w-4 h-4 text-sky-600 dark:text-sky-400" />
          </div>
          <div className="font-mono tabular-nums text-2xl font-bold text-[#141413] dark:text-[#F3F4F6] mt-2">
            {formatDurationLabel(rolling7.averageMinutes)}
          </div>
          <div className="text-[11px] text-[#5A5A55] dark:text-[#9CA3AF] mt-1 font-mono tabular-nums">
            Rolling 7-day average
          </div>
          <div className="text-[11px] text-[#5A5A55] dark:text-[#9CA3AF] mt-0.5 font-mono tabular-nums">
            7-day total: {formatDurationLabel(rolling7.total7DayMinutes)}
          </div>
        </div>

        {/* Card 4: Plan Execution Accuracy */}
        <div className="rounded-2xl bg-white dark:bg-[#13161D] border border-[#E5E5E0] dark:border-[#232834] p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-[#5A5A55] dark:text-[#9CA3AF]">
              <span>Plan Execution Accuracy</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="font-mono tabular-nums text-2xl font-bold text-[#141413] dark:text-[#F3F4F6] mt-2">
              {planAccuracy.accuracyPercent}%
            </div>
            <div className="text-[11px] text-[#5A5A55] dark:text-[#9CA3AF] mt-1 font-mono tabular-nums">
              {planAccuracy.scheduledMinutes > 0
                ? `${formatDurationLabel(planAccuracy.completedMinutes)} / ${formatDurationLabel(planAccuracy.scheduledMinutes)} blocks`
                : 'No blocks scheduled yet'}
            </div>
          </div>
          <div className="mt-2 h-1.5 w-full rounded-full bg-[#ECECE7] dark:bg-[#1F2430] overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-600 dark:bg-emerald-400"
              style={{ width: `${planAccuracy.accuracyPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* 1b. Daily KPI Row (4 Symmetrical Today Cards) */}
      <div
        data-testid="daily-kpi-row"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4"
      >
        {/* Daily Card 1: Today's Focus Time Total */}
        <div
          data-testid="kpi-today-focus"
          className="rounded-2xl bg-white dark:bg-[#13161D] border border-[#E5E5E0] dark:border-[#232834] p-4 flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between text-xs text-[#5A5A55] dark:text-[#9CA3AF]">
              <span>Today&apos;s Focus Time</span>
              <Clock className="w-4 h-4 text-[#4338CA] dark:text-[#818CF8]" />
            </div>
            <div className="font-mono tabular-nums text-2xl font-bold text-[#141413] dark:text-[#F3F4F6] mt-2">
              {formatDurationLabel(todayStats.todayMinutes)}
            </div>
            <div className="mt-1 flex items-center gap-1 text-[11px] font-medium tabular-nums">
              {todayStats.deltaFromYesterday > 0 ? (
                <TrendingUp className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              ) : todayStats.deltaFromYesterday < 0 ? (
                <TrendingDown className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
              ) : null}
              <span
                className={
                  todayStats.deltaFromYesterday > 0
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : todayStats.deltaFromYesterday < 0
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-[#5A5A55] dark:text-[#9CA3AF]'
                }
              >
                {todayStats.todayMinutes === 0 && todayStats.yesterdayMinutes === 0
                  ? 'No sessions logged yet'
                  : todayStats.deltaFromYesterday === 0
                  ? 'Same as yesterday'
                  : `${todayStats.deltaFromYesterday > 0 ? '+' : '-'}${formatDurationLabel(
                      Math.abs(todayStats.deltaFromYesterday)
                    )} vs yesterday`}
              </span>
            </div>
          </div>
          <div className="text-[11px] text-[#5A5A55] dark:text-[#9CA3AF] mt-1 font-mono tabular-nums">
            {todayStats.todaySessions}{' '}
            {todayStats.todaySessions === 1 ? 'session' : 'sessions'} today · Yesterday:{' '}
            {formatDurationLabel(todayStats.yesterdayMinutes)}
          </div>
        </div>

        {/* Daily Card 2: Daily Goal Completion % */}
        <div
          data-testid="kpi-daily-goal"
          className="rounded-2xl bg-white dark:bg-[#13161D] border border-[#E5E5E0] dark:border-[#232834] p-4 flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between text-xs text-[#5A5A55] dark:text-[#9CA3AF]">
              <span>Daily Goal Completion</span>
              <Target className="w-4 h-4 text-[#4338CA] dark:text-[#818CF8]" />
            </div>
            <div className="font-mono tabular-nums text-2xl font-bold text-[#141413] dark:text-[#F3F4F6] mt-2">
              {todayStats.goalPercent}%
            </div>
            <div className="text-[11px] text-[#5A5A55] dark:text-[#9CA3AF] mt-1 font-mono tabular-nums">
              {formatDurationLabel(todayStats.todayMinutes)} /{' '}
              {formatDurationLabel(dailyGoalMinutes)} ·{' '}
              {todayStats.remainingMinutes > 0
                ? `${formatDurationLabel(todayStats.remainingMinutes)} left`
                : todayStats.extraMinutes > 0
                ? `+${formatDurationLabel(todayStats.extraMinutes)} extra`
                : 'Target reached'}
            </div>
          </div>
          <div className="mt-2 h-1.5 w-full rounded-full bg-[#ECECE7] dark:bg-[#1F2430] overflow-hidden">
            <div
              className="h-full rounded-full bg-[#4338CA] dark:bg-[#6366F1]"
              style={{ width: `${todayStats.goalBarPercent}%` }}
            />
          </div>
        </div>

        {/* Daily Card 3: Daily Plan Execution Accuracy */}
        <div
          data-testid="kpi-daily-plan-accuracy"
          className="rounded-2xl bg-white dark:bg-[#13161D] border border-[#E5E5E0] dark:border-[#232834] p-4 flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between text-xs text-[#5A5A55] dark:text-[#9CA3AF]">
              <span>Daily Plan Accuracy</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="font-mono tabular-nums text-2xl font-bold text-[#141413] dark:text-[#F3F4F6] mt-2">
              {dailyPlanAccuracy.accuracyPercent}%
            </div>
            <div className="text-[11px] text-[#5A5A55] dark:text-[#9CA3AF] mt-1 font-mono tabular-nums">
              {dailyPlanAccuracy.scheduledMinutes > 0
                ? `${formatDurationLabel(dailyPlanAccuracy.completedMinutes)} / ${formatDurationLabel(
                    dailyPlanAccuracy.scheduledMinutes
                  )} (${dailyPlanAccuracy.completedBlocksCount}/${dailyPlanAccuracy.blockCount} blocks)`
                : 'No blocks scheduled today'}
            </div>
          </div>
          <div className="mt-2 h-1.5 w-full rounded-full bg-[#ECECE7] dark:bg-[#1F2430] overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-600 dark:bg-emerald-400"
              style={{ width: `${dailyPlanAccuracy.accuracyPercent}%` }}
            />
          </div>
        </div>

        {/* Daily Card 4: Today's Tasks Completed (Symmetrical 4th Card) */}
        <div
          data-testid="kpi-daily-tasks"
          className="rounded-2xl bg-white dark:bg-[#13161D] border border-[#E5E5E0] dark:border-[#232834] p-4 flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between text-xs text-[#5A5A55] dark:text-[#9CA3AF]">
              <span>Today&apos;s Tasks</span>
              <CheckSquare className="w-4 h-4 text-sky-600 dark:text-sky-400" />
            </div>
            <div className="font-mono tabular-nums text-2xl font-bold text-[#141413] dark:text-[#F3F4F6] mt-2">
              {dailyTaskProgress.dueTodayCount > 0
                ? `${dailyTaskProgress.completedDueTodayCount}/${dailyTaskProgress.dueTodayCount}`
                : `${dailyTaskProgress.completedTodayCount} done`}
            </div>
            <div className="text-[11px] text-[#5A5A55] dark:text-[#9CA3AF] mt-1 font-mono tabular-nums">
              {dailyTaskProgress.dueTodayCount > 0
                ? `${dailyTaskProgress.completionPercent}% of due today · ${dailyTaskProgress.pendingBacklogCount} open`
                : `No due tasks · ${dailyTaskProgress.pendingBacklogCount} open in backlog`}
            </div>
          </div>
          <div className="mt-2 h-1.5 w-full rounded-full bg-[#ECECE7] dark:bg-[#1F2430] overflow-hidden">
            <div
              className="h-full rounded-full bg-sky-600 dark:bg-sky-400"
              style={{ width: `${dailyTaskProgress.completionPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* 2. Focus Distribution Across Subjects + Syllabus Mastery */}
      <section className="rounded-2xl bg-white dark:bg-[#13161D] border border-[#E5E5E0] dark:border-[#232834] p-5 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold text-[#141413] dark:text-[#F3F4F6]">
              Focus Distribution Across Subjects
            </h2>
            <p className="text-xs text-[#5A5A55] dark:text-[#9CA3AF] mt-0.5">
              Hours, sessions & share across Physics, Combined Maths, ICT & General Revision
            </p>
          </div>

          <div
            role="tablist"
            aria-label="Subject distribution timeframe"
            className="flex items-center p-1 rounded-xl bg-[#ECECE7] dark:bg-[#0B0D11] border border-[#E5E5E0] dark:border-[#232834]"
          >
            {TIMEFRAME_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                role="tab"
                aria-selected={timeframe === opt.id}
                onClick={() => setTimeframe(opt.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer whitespace-nowrap ${
                  timeframe === opt.id
                    ? 'bg-white dark:bg-[#1F2430] text-[#141413] dark:text-[#F3F4F6] shadow-xs'
                    : 'text-[#5A5A55] dark:text-[#9CA3AF] hover:text-[#141413] dark:hover:text-[#F3F4F6]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Subject Balance Warning Badge if any core A/L subject < 20% weekly */}
        {weeklyBalanceAlerts.length > 0 && (
          <div
            data-testid="subject-balance-warning"
            className="inline-flex flex-wrap items-center gap-2 rounded-xl border border-amber-300/80 dark:border-amber-700/60 bg-amber-50/80 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-900 dark:text-amber-200"
          >
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span className="font-semibold">Subject balance warning:</span>
            <span>
              {weeklyBalanceAlerts.map((a) => `${a.label} (${a.percentage}%)`).join(', ')}{' '}
              {weeklyBalanceAlerts.length === 1 ? 'is' : 'are'} below 20% of this week’s focus time.
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
          {/* Interactive SVG Donut Chart */}
          <div className="md:col-span-5 flex flex-col items-center justify-center">
            <div className="relative w-48 h-48">
              <svg
                viewBox="0 0 200 200"
                className="w-full h-full -rotate-90"
                role="img"
                aria-label="Subject focus distribution donut chart"
              >
                <circle
                  cx="100"
                  cy="100"
                  r={donutRadius}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="24"
                  className="text-[#ECECE7] dark:text-[#1F2430]"
                />
                {donutSegments.map((seg) => {
                  const isActive = hoveredSubject === seg.subject;
                  return (
                    <circle
                      key={seg.subject}
                      cx="100"
                      cy="100"
                      r={donutRadius}
                      fill="none"
                      stroke={seg.color}
                      strokeWidth={isActive ? 28 : 24}
                      strokeDasharray={seg.dashArray}
                      strokeDashoffset={seg.dashOffset}
                      className="cursor-pointer transition-all duration-150"
                      opacity={hoveredSubject && !isActive ? 0.45 : 1}
                      onMouseEnter={() => setHoveredSubject(seg.subject)}
                      onMouseLeave={() => setHoveredSubject(null)}
                      onClick={() =>
                        setHoveredSubject((prev) => (prev === seg.subject ? null : seg.subject))
                      }
                    />
                  );
                })}
              </svg>

              <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 pointer-events-none">
                <span className="text-[11px] font-medium text-[#5A5A55] dark:text-[#9CA3AF] truncate max-w-full">
                  {focusedDonutSubject
                    ? focusedDonutSubject.label
                    : timeframe === 'week'
                    ? 'This Week'
                    : timeframe === 'month'
                    ? 'This Month'
                    : 'This Year'}
                </span>
                <span className="font-mono tabular-nums text-xl font-bold text-[#141413] dark:text-[#F3F4F6] mt-0.5">
                  {formatDurationLabel(
                    focusedDonutSubject
                      ? focusedDonutSubject.minutes
                      : subjectBreakdown.totalMinutes
                  )}
                </span>
                <span className="text-[11px] font-mono tabular-nums text-[#5A5A55] dark:text-[#9CA3AF]">
                  {focusedDonutSubject
                    ? `${focusedDonutSubject.percentage}% · ${focusedDonutSubject.sessionCount} sess`
                    : subjectBreakdown.totalMinutes > 0
                    ? `${periodComparison.sessionCount} ${periodComparison.sessionCount === 1 ? 'session' : 'sessions'}`
                    : 'No sessions yet'}
                </span>
              </div>
            </div>
          </div>

          {/* Horizontal Progress Breakdown List */}
          <div className="md:col-span-7 space-y-3.5">
            {subjectBreakdown.items.map((item) => {
              const isHighlighted = hoveredSubject === item.subject;
              return (
                <button
                  key={item.subject}
                  type="button"
                  onMouseEnter={() => setHoveredSubject(item.subject)}
                  onMouseLeave={() => setHoveredSubject(null)}
                  onClick={() =>
                    setHoveredSubject((prev) => (prev === item.subject ? null : item.subject))
                  }
                  className={`w-full text-left space-y-1.5 rounded-xl p-2 -mx-2 cursor-pointer transition-colors ${
                    isHighlighted ? 'bg-[#F7F7F5] dark:bg-[#0B0D11]' : ''
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-xs shrink-0"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="font-semibold text-[#141413] dark:text-[#F3F4F6] truncate">
                        {item.label}
                      </span>
                      <span className="text-[11px] text-[#5A5A55] dark:text-[#9CA3AF] tabular-nums">
                        ({item.sessionCount} {item.sessionCount === 1 ? 'session' : 'sessions'})
                      </span>
                    </div>
                    <span className="font-mono tabular-nums text-[#141413] dark:text-[#F3F4F6] shrink-0">
                      {formatDurationLabel(item.minutes)}{' '}
                      <span className="text-[#5A5A55] dark:text-[#9CA3AF]">({item.percentage}%)</span>
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-[#ECECE7] dark:bg-[#1F2430] overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${item.percentage}%`, backgroundColor: item.color }}
                    />
                  </div>
                </button>
              );
            })}

            {/* Syllabus Mastery Integration Row */}
            <div className="pt-3 border-t border-[#E5E5E0] dark:border-[#232834] grid grid-cols-3 gap-2">
              {syllabusSummary.map((sy) => (
                <div
                  key={sy.subject}
                  className="rounded-xl bg-[#F7F7F5] dark:bg-[#0B0D11] border border-[#E5E5E0] dark:border-[#232834] px-3 py-2"
                >
                  <div className="flex items-center gap-1.5 text-[11px] font-medium text-[#5A5A55] dark:text-[#9CA3AF] truncate">
                    <span
                      className="w-2 h-2 rounded-xs shrink-0"
                      style={{ backgroundColor: sy.color }}
                    />
                    <span className="truncate">{sy.label}</span>
                  </div>
                  <div className="font-mono tabular-nums text-xs font-bold text-[#141413] dark:text-[#F3F4F6] mt-0.5">
                    {sy.mastered}/{sy.total} mastered
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 3. Dual Activity Heatmaps (Monthly & Yearly) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Monthly Calendar Heatmap */}
        <section className="lg:col-span-5 rounded-2xl bg-white dark:bg-[#13161D] border border-[#E5E5E0] dark:border-[#232834] p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-base font-semibold text-[#141413] dark:text-[#F3F4F6]">
                Monthly Activity
              </h2>
              <p className="text-xs text-[#5A5A55] dark:text-[#9CA3AF]">{monthHeading}</p>
            </div>
            <div className="flex items-center rounded-lg border border-[#E5E5E0] dark:border-[#232834] bg-[#F7F7F5] dark:bg-[#0B0D11]">
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                aria-label="Previous month"
                className="p-1.5 text-[#5A5A55] dark:text-[#9CA3AF] hover:text-[#141413] dark:hover:text-[#F3F4F6] cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => shiftMonth(1)}
                aria-label="Next month"
                className="p-1.5 text-[#5A5A55] dark:text-[#9CA3AF] hover:text-[#141413] dark:hover:text-[#F3F4F6] cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1.5 text-center text-[10px] font-medium text-[#5A5A55] dark:text-[#9CA3AF]">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1.5" data-testid="monthly-heatmap-grid">
            {monthlyCells.map((cell, idx) => {
              if (!cell.inMonth || !cell.date) {
                return <div key={`empty_${idx}`} className="aspect-square rounded-lg" />;
              }
              const isSelected = activeMonthCell?.date === cell.date;
              const isToday = cell.date === todayISO;
              const topSubLabel = cell.topSubject ? subjects[cell.topSubject]?.label : 'None';

              return (
                <button
                  key={cell.date}
                  type="button"
                  title={`${cell.date}: ${formatDurationLabel(cell.totalMinutes)} (${topSubLabel})`}
                  aria-label={`${cell.date}, ${formatDurationLabel(cell.totalMinutes)} studied`}
                  onMouseEnter={() =>
                    setActiveMonthCell({
                      date: cell.date!,
                      totalMinutes: cell.totalMinutes,
                      sessionCount: cell.sessionCount,
                      topSubject: cell.topSubject,
                    })
                  }
                  onClick={() =>
                    setActiveMonthCell({
                      date: cell.date!,
                      totalMinutes: cell.totalMinutes,
                      sessionCount: cell.sessionCount,
                      topSubject: cell.topSubject,
                    })
                  }
                  className={`aspect-square rounded-lg text-[11px] font-mono tabular-nums font-semibold flex items-center justify-center cursor-pointer transition-transform ${
                    INTENSITY_CLASSES[cell.intensity]
                  } ${isSelected ? 'ring-2 ring-[#4338CA] dark:ring-[#818CF8]' : ''} ${
                    isToday && !isSelected ? 'ring-1 ring-[#141413]/40 dark:ring-white/40' : ''
                  }`}
                >
                  {cell.dayNumber}
                </button>
              );
            })}
          </div>

          {/* Interactive Tooltip Readout */}
          <div className="rounded-xl bg-[#F7F7F5] dark:bg-[#0B0D11] border border-[#E5E5E0] dark:border-[#232834] px-3 py-2 text-xs flex flex-wrap items-center justify-between gap-2 min-h-[36px]">
            {activeMonthCell ? (
              <>
                <span className="font-mono tabular-nums font-semibold text-[#141413] dark:text-[#F3F4F6]">
                  {activeMonthCell.date}
                </span>
                <span className="text-[#5A5A55] dark:text-[#9CA3AF] tabular-nums">
                  {formatDurationLabel(activeMonthCell.totalMinutes)}
                  {activeMonthCell.topSubject
                    ? ` · Top: ${subjects[activeMonthCell.topSubject]?.label ?? activeMonthCell.topSubject}`
                    : ' · Rest day'}
                </span>
              </>
            ) : (
              <span className="text-[#5A5A55] dark:text-[#9CA3AF]">
                Hover or tap any day to inspect hours & top subject
              </span>
            )}
          </div>
        </section>

        {/* Yearly Contribution Heatmap (52-week x 7-day) */}
        <section className="lg:col-span-7 rounded-2xl bg-white dark:bg-[#13161D] border border-[#E5E5E0] dark:border-[#232834] p-5 flex flex-col justify-between space-y-4 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-base font-semibold text-[#141413] dark:text-[#F3F4F6]">
                Yearly Study Consistency
              </h2>
              <p className="text-xs text-[#5A5A55] dark:text-[#9CA3AF] tabular-nums">
                Rolling 365 days · {formatDurationLabel(yearlyStats.totalMinutes)} across{' '}
                {yearlyStats.activeDays} active {yearlyStats.activeDays === 1 ? 'day' : 'days'}
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-[#5A5A55] dark:text-[#9CA3AF]">
              <span>Less</span>
              {([0, 1, 2, 3, 4] as HeatmapIntensity[]).map((lvl) => (
                <span
                  key={lvl}
                  className={`w-3 h-3 rounded-[3px] ${YEARLY_TILE_CLASSES[lvl]}`}
                  aria-hidden="true"
                />
              ))}
              <span>More</span>
            </div>
          </div>

          <div
            ref={yearlyScrollRef}
            className="overflow-x-auto ios-scroll pb-1"
            data-testid="yearly-heatmap-scroll"
          >
            <div className="min-w-max inline-flex flex-col gap-1.5">
              {/* Month Labels Row */}
              <div className="flex items-center pl-7 gap-[3px] h-4">
                {yearlyColumns.map((col) => (
                  <div
                    key={`m_${col.weekIndex}`}
                    className="w-[11px] text-[10px] text-[#5A5A55] dark:text-[#9CA3AF] overflow-visible whitespace-nowrap"
                  >
                    {col.monthLabel ?? ''}
                  </div>
                ))}
              </div>

              {/* 52-week x 7-day Matrix */}
              <div className="flex items-start gap-1.5">
                <div className="grid grid-rows-7 gap-[3px] text-[10px] text-[#5A5A55] dark:text-[#9CA3AF] pr-1 leading-[11px]">
                  <span>Mon</span>
                  <span aria-hidden="true" />
                  <span>Wed</span>
                  <span aria-hidden="true" />
                  <span>Fri</span>
                  <span aria-hidden="true" />
                  <span aria-hidden="true" />
                </div>

                <div className="flex gap-[3px]">
                  {yearlyColumns.map((col) => (
                    <div key={`w_${col.weekIndex}`} className="grid grid-rows-7 gap-[3px]">
                      {col.days.map((day) => {
                        if (!day.inRange) {
                          return <div key={day.date} className="w-[11px] h-[11px]" />;
                        }
                        const isSelected = activeYearCell?.date === day.date;
                        return (
                          <button
                            key={day.date}
                            type="button"
                            title={`${day.date}: ${formatDurationLabel(day.totalMinutes)}`}
                            aria-label={`${day.date}: ${formatDurationLabel(day.totalMinutes)}`}
                            onMouseEnter={() =>
                              setActiveYearCell({
                                date: day.date,
                                totalMinutes: day.totalMinutes,
                                sessionCount: day.sessionCount,
                                topSubject: day.topSubject,
                              })
                            }
                            onClick={() =>
                              setActiveYearCell({
                                date: day.date,
                                totalMinutes: day.totalMinutes,
                                sessionCount: day.sessionCount,
                                topSubject: day.topSubject,
                              })
                            }
                            className={`w-[11px] h-[11px] rounded-[2px] cursor-pointer ${
                              YEARLY_TILE_CLASSES[day.intensity]
                            } ${isSelected ? 'ring-1 ring-[#141413] dark:ring-white' : ''}`}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl bg-[#F7F7F5] dark:bg-[#0B0D11] border border-[#E5E5E0] dark:border-[#232834] px-3 py-2 text-xs flex flex-wrap items-center justify-between gap-2 min-h-[36px]">
            {activeYearCell ? (
              <>
                <span className="font-mono tabular-nums font-semibold text-[#141413] dark:text-[#F3F4F6]">
                  {activeYearCell.date}
                </span>
                <span className="text-[#5A5A55] dark:text-[#9CA3AF] tabular-nums">
                  {formatDurationLabel(activeYearCell.totalMinutes)} logged · {activeYearCell.sessionCount}{' '}
                  {activeYearCell.sessionCount === 1 ? 'session' : 'sessions'}
                </span>
              </>
            ) : (
              <span className="text-[#5A5A55] dark:text-[#9CA3AF]">
                Hover or tap any square to see exact date and focus duration
              </span>
            )}
          </div>
        </section>
      </div>

      {/* 4. Peak Productivity & Planned vs. Actual Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Peak Focus Hours (24h Bar Chart) */}
        <section className="lg:col-span-6 rounded-2xl bg-white dark:bg-[#13161D] border border-[#E5E5E0] dark:border-[#232834] p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-base font-semibold text-[#141413] dark:text-[#F3F4F6]">
                Peak Focus Hours (00:00–23:00)
              </h2>
              <p className="text-xs text-[#5A5A55] dark:text-[#9CA3AF]">
                Completed focus minutes distributed across hours of the day
              </p>
            </div>
            {inspectedHour && inspectedHour.minutes > 0 ? (
              <span className="text-xs font-mono tabular-nums font-semibold text-[#4338CA] dark:text-[#A5B4FC]">
                {inspectedHour.label}: {formatDurationLabel(inspectedHour.minutes)}
              </span>
            ) : (
              <span className="text-xs text-[#5A5A55] dark:text-[#9CA3AF]">No data yet</span>
            )}
          </div>

          <div
            className="h-44 flex items-end gap-1 pt-4 border-b border-[#E5E5E0] dark:border-[#232834] pb-1"
            data-testid="peak-hours-chart"
          >
            {peakHours.map((h) => {
              const pct = Math.round((h.minutes / maxHourMinutes) * 100);
              const isSelected = activeHourIndex === h.hour;
              return (
                <button
                  key={h.hour}
                  type="button"
                  title={`${h.label} – ${String(h.hour).padStart(2, '0')}:59 · ${formatDurationLabel(h.minutes)}`}
                  aria-label={`${h.label}: ${formatDurationLabel(h.minutes)}`}
                  onMouseEnter={() => setActiveHourIndex(h.hour)}
                  onMouseLeave={() => setActiveHourIndex(null)}
                  onClick={() =>
                    setActiveHourIndex((prev) => (prev === h.hour ? null : h.hour))
                  }
                  className="flex-1 h-full flex flex-col justify-end items-center cursor-pointer group"
                >
                  <div
                    style={{ height: `${Math.max(h.minutes > 0 ? 6 : 2, pct)}%` }}
                    className={`w-full rounded-t-xs transition-all ${
                      h.minutes === 0
                        ? 'bg-[#ECECE7] dark:bg-[#1F2430]'
                        : h.isPeak || isSelected
                        ? 'bg-[#4338CA] dark:bg-[#6366F1]'
                        : 'bg-[#A5B4FC] dark:bg-[#3730A3] group-hover:bg-[#6366F1]'
                    }`}
                  />
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between text-[10px] font-mono tabular-nums text-[#5A5A55] dark:text-[#9CA3AF]">
            <span>00:00</span>
            <span>04:00</span>
            <span>08:00</span>
            <span>12:00</span>
            <span>16:00</span>
            <span>20:00</span>
            <span>23:00</span>
          </div>
        </section>

        {/* Planned vs. Actual Comparison (Last 7 Days) */}
        <section className="lg:col-span-6 rounded-2xl bg-white dark:bg-[#13161D] border border-[#E5E5E0] dark:border-[#232834] p-5 flex flex-col justify-between space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-base font-semibold text-[#141413] dark:text-[#F3F4F6]">
                7-Day Planned vs. Actual
              </h2>
              <p className="text-xs text-[#5A5A55] dark:text-[#9CA3AF]">
                Scheduled block duration vs. completed timer minutes
              </p>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-[#5A5A55] dark:text-[#9CA3AF]">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-[#CBD5E1] dark:bg-[#334155]" /> Planned
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-[#4338CA] dark:bg-[#6366F1]" /> Actual
              </span>
            </div>
          </div>

          <div
            className="h-44 flex items-end justify-between gap-2 pt-4 border-b border-[#E5E5E0] dark:border-[#232834] pb-2"
            data-testid="planned-vs-actual-chart"
          >
            {trend7Days.map((day) => {
              const plannedH = Math.round((day.plannedMinutes / maxTrendMinutes) * 100);
              const actualH = Math.round((day.actualMinutes / maxTrendMinutes) * 100);
              const isToday = day.iso === todayISO;
              const isSelected = activeTrendDay === day.iso;
              return (
                <button
                  key={day.iso}
                  type="button"
                  onMouseEnter={() => setActiveTrendDay(day.iso)}
                  onMouseLeave={() => setActiveTrendDay(null)}
                  onClick={() =>
                    setActiveTrendDay((prev) => (prev === day.iso ? null : day.iso))
                  }
                  aria-label={`${day.iso}: Planned ${day.plannedMinutes}m, Actual ${day.actualMinutes}m`}
                  className={`flex-1 flex flex-col items-center gap-1.5 h-full justify-end rounded-lg px-0.5 cursor-pointer ${
                    isSelected ? 'bg-[#F7F7F5] dark:bg-[#0B0D11]' : ''
                  }`}
                >
                  <div className="w-full flex items-end justify-center gap-1 h-32">
                    <div
                      title={`${day.iso} Planned: ${day.plannedMinutes}m`}
                      style={{ height: `${Math.max(day.plannedMinutes > 0 ? 6 : 0, plannedH)}%` }}
                      className="w-3 sm:w-4 rounded-t-sm bg-[#CBD5E1] dark:bg-[#334155] transition-all"
                    />
                    <div
                      title={`${day.iso} Actual: ${day.actualMinutes}m`}
                      style={{ height: `${Math.max(day.actualMinutes > 0 ? 6 : 0, actualH)}%` }}
                      className="w-3 sm:w-4 rounded-t-sm bg-[#4338CA] dark:bg-[#6366F1] transition-all"
                    />
                  </div>
                  <div
                    className={`text-[11px] font-medium ${
                      isToday
                        ? 'text-[#4338CA] dark:text-[#818CF8] font-bold'
                        : 'text-[#5A5A55] dark:text-[#9CA3AF]'
                    }`}
                  >
                    {day.label}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="text-xs text-[#5A5A55] dark:text-[#9CA3AF] flex items-center justify-between tabular-nums min-h-[20px]">
            {inspectedTrend ? (
              <>
                <span className="font-mono font-semibold text-[#141413] dark:text-[#F3F4F6]">
                  {inspectedTrend.iso}
                </span>
                <span className="font-mono">
                  Planned: {formatDurationLabel(inspectedTrend.plannedMinutes)} · Actual:{' '}
                  {formatDurationLabel(inspectedTrend.actualMinutes)}
                </span>
              </>
            ) : (
              <span className="flex items-center gap-1.5">
                <Award className="w-3.5 h-3.5 text-[#4338CA] dark:text-[#818CF8]" />
                Hover or tap a day bar for exact planned vs. actual minutes
              </span>
            )}
          </div>
        </section>
      </div>

      {/* 4b. Session Quality, Focus Rhythm & Goal Consistency (4 Symmetrical Cards) */}
      <div
        data-testid="extended-kpi-row"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4"
      >
        {/* Avg Focus Quality Rating */}
        <div
          data-testid="kpi-focus-quality"
          className="rounded-2xl bg-white dark:bg-[#13161D] border border-[#E5E5E0] dark:border-[#232834] p-4 flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between text-xs text-[#5A5A55] dark:text-[#9CA3AF]">
              <span>Avg Focus Quality</span>
              <Star className="w-4 h-4 text-amber-500" />
            </div>
            <div className="font-mono tabular-nums text-2xl font-bold text-[#141413] dark:text-[#F3F4F6] mt-2">
              {sessionQuality.totalSessions > 0 ? `${sessionQuality.avgRating.toFixed(1)} / 5` : '—'}
            </div>
            <div className="text-[11px] text-[#5A5A55] dark:text-[#9CA3AF] mt-1 font-mono tabular-nums">
              {sessionQuality.totalSessions > 0
                ? `Across ${sessionQuality.totalSessions} ${
                    sessionQuality.totalSessions === 1 ? 'session' : 'sessions'
                  }`
                : 'No rated sessions yet'}
            </div>
          </div>
          <div className="mt-2 grid grid-cols-5 gap-1">
            {[1, 2, 3, 4, 5].map((step) => (
              <div
                key={step}
                className={`h-1.5 rounded-full ${
                  sessionQuality.avgRating >= step - 0.25 && sessionQuality.totalSessions > 0
                    ? 'bg-amber-500'
                    : 'bg-[#ECECE7] dark:bg-[#1F2430]'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Session Length & Deep Work */}
        <div
          data-testid="kpi-session-depth"
          className="rounded-2xl bg-white dark:bg-[#13161D] border border-[#E5E5E0] dark:border-[#232834] p-4 flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between text-xs text-[#5A5A55] dark:text-[#9CA3AF]">
              <span>Avg Session Length</span>
              <Timer className="w-4 h-4 text-[#4338CA] dark:text-[#818CF8]" />
            </div>
            <div className="font-mono tabular-nums text-2xl font-bold text-[#141413] dark:text-[#F3F4F6] mt-2">
              {formatDurationLabel(sessionQuality.avgSessionMinutes)}
            </div>
            <div className="text-[11px] text-[#5A5A55] dark:text-[#9CA3AF] mt-1 font-mono tabular-nums">
              Longest: {formatDurationLabel(sessionQuality.longestSessionMinutes)}
            </div>
          </div>
          <div className="text-[11px] text-[#5A5A55] dark:text-[#9CA3AF] mt-1 font-mono tabular-nums">
            {sessionQuality.deepSessionsCount} deep{' '}
            {sessionQuality.deepSessionsCount === 1 ? 'session' : 'sessions'} (≥ 45m)
          </div>
        </div>

        {/* 30-Day Goal Hit Rate & Personal Best Day */}
        <div
          data-testid="kpi-goal-consistency"
          className="rounded-2xl bg-white dark:bg-[#13161D] border border-[#E5E5E0] dark:border-[#232834] p-4 flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between text-xs text-[#5A5A55] dark:text-[#9CA3AF]">
              <span>30-Day Goal Hit Rate</span>
              <Trophy className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="font-mono tabular-nums text-2xl font-bold text-[#141413] dark:text-[#F3F4F6] mt-2">
              {goalConsistency.goalHitDays30}/30d{' '}
              <span className="text-sm font-semibold text-[#5A5A55] dark:text-[#9CA3AF]">
                ({goalConsistency.goalHitPercent30}%)
              </span>
            </div>
            <div className="text-[11px] text-[#5A5A55] dark:text-[#9CA3AF] mt-1 font-mono tabular-nums truncate">
              {goalConsistency.bestDayDate
                ? `Best: ${formatDurationLabel(goalConsistency.bestDayMinutes)} · ${new Date(
                    `${goalConsistency.bestDayDate}T12:00:00`
                  ).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                : 'No study days logged yet'}
            </div>
          </div>
          <div className="mt-2 h-1.5 w-full rounded-full bg-[#ECECE7] dark:bg-[#1F2430] overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-600 dark:bg-emerald-400"
              style={{ width: `${goalConsistency.goalHitPercent30}%` }}
            />
          </div>
        </div>

        {/* Task Completion & Backlog Health */}
        <div
          data-testid="kpi-task-backlog"
          className="rounded-2xl bg-white dark:bg-[#13161D] border border-[#E5E5E0] dark:border-[#232834] p-4 flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between text-xs text-[#5A5A55] dark:text-[#9CA3AF]">
              <span>Task Backlog Health</span>
              <ListTodo className="w-4 h-4 text-sky-600 dark:text-sky-400" />
            </div>
            <div className="font-mono tabular-nums text-2xl font-bold text-[#141413] dark:text-[#F3F4F6] mt-2">
              {taskBacklog.completionRatePercent}%
            </div>
            <div className="text-[11px] text-[#5A5A55] dark:text-[#9CA3AF] mt-1 font-mono tabular-nums">
              {taskBacklog.completedCount}/{taskBacklog.totalCount} done · {taskBacklog.overdueCount}{' '}
              overdue
            </div>
          </div>
          <div className="text-[11px] text-[#5A5A55] dark:text-[#9CA3AF] mt-1 font-mono tabular-nums">
            {taskBacklog.openCount} open ({formatDurationLabel(taskBacklog.backlogMinutesRemaining)}) ·{' '}
            {taskBacklog.highPriorityOpenCount} high
          </div>
        </div>
      </div>

      {/* 4c. Weekday Study Rhythm */}
      <section
        data-testid="weekday-rhythm-section"
        className="rounded-2xl bg-white dark:bg-[#13161D] border border-[#E5E5E0] dark:border-[#232834] p-5 flex flex-col justify-between space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-base font-semibold text-[#141413] dark:text-[#F3F4F6]">
              Day-of-Week Study Rhythm
            </h2>
            <p className="text-xs text-[#5A5A55] dark:text-[#9CA3AF]">
              Total focus minutes by weekday (Mon–Sun)
            </p>
          </div>
          {inspectedWeekday && inspectedWeekday.totalMinutes > 0 ? (
            <span className="text-xs font-mono tabular-nums font-semibold text-[#4338CA] dark:text-[#A5B4FC]">
              {inspectedWeekday.label}: {formatDurationLabel(inspectedWeekday.totalMinutes)} (avg{' '}
              {formatDurationLabel(inspectedWeekday.avgMinutesPerActiveDay)})
            </span>
          ) : (
            <span className="text-xs text-[#5A5A55] dark:text-[#9CA3AF]">No data yet</span>
          )}
        </div>

        <div
          className="h-40 flex items-end justify-between gap-2 pt-4 border-b border-[#E5E5E0] dark:border-[#232834] pb-2"
          data-testid="weekday-rhythm-chart"
        >
          {weekdayRhythm.map((day) => {
            const pct = Math.round((day.totalMinutes / maxWeekdayMinutes) * 100);
            const isSelected = activeWeekdayIndex === day.weekdayIndex;
            return (
              <button
                key={day.label}
                type="button"
                onMouseEnter={() => setActiveWeekdayIndex(day.weekdayIndex)}
                onMouseLeave={() => setActiveWeekdayIndex(null)}
                onClick={() =>
                  setActiveWeekdayIndex((prev) =>
                    prev === day.weekdayIndex ? null : day.weekdayIndex
                  )
                }
                aria-label={`${day.label}: ${formatDurationLabel(day.totalMinutes)}`}
                className="flex-1 h-full flex flex-col items-center justify-end gap-1.5 cursor-pointer group"
              >
                <div className="w-full flex items-end justify-center h-28">
                  <div
                    style={{ height: `${Math.max(day.totalMinutes > 0 ? 8 : 3, pct)}%` }}
                    className={`w-6 sm:w-8 rounded-t-md transition-all ${
                      day.totalMinutes === 0
                        ? 'bg-[#ECECE7] dark:bg-[#1F2430]'
                        : day.isBest || isSelected
                        ? 'bg-[#4338CA] dark:bg-[#6366F1]'
                        : 'bg-[#A5B4FC] dark:bg-[#3730A3] group-hover:bg-[#6366F1]'
                    }`}
                  />
                </div>
                <span
                  className={`text-[11px] font-medium ${
                    day.isBest && day.totalMinutes > 0
                      ? 'text-[#4338CA] dark:text-[#818CF8] font-bold'
                      : 'text-[#5A5A55] dark:text-[#9CA3AF]'
                  }`}
                >
                  {day.label}
                </span>
              </button>
            );
          })}
        </div>

        <div className="text-xs text-[#5A5A55] dark:text-[#9CA3AF] flex flex-wrap items-center justify-between gap-2 tabular-nums">
          <span>
            Live Timer:{' '}
            <strong className="font-mono text-[#141413] dark:text-[#F3F4F6]">
              {formatDurationLabel(sessionQuality.liveMinutes)}
            </strong>{' '}
            ({sessionQuality.liveCount})
          </span>
          <span>
            Manual Logs:{' '}
            <strong className="font-mono text-[#141413] dark:text-[#F3F4F6]">
              {formatDurationLabel(sessionQuality.manualMinutes)}
            </strong>{' '}
            ({sessionQuality.manualCount})
          </span>
        </div>
      </section>

      {/* 4d. A/L Past Paper Mistake Breakdown & Syllabus Confidence Depth */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Past Paper Performance & Mistake Breakdown */}
        <section
          data-testid="past-paper-analytics-section"
          className="lg:col-span-6 rounded-2xl bg-white dark:bg-[#13161D] border border-[#E5E5E0] dark:border-[#232834] p-5 space-y-4"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="font-display text-base font-semibold text-[#141413] dark:text-[#F3F4F6]">
                Past Paper Mastery &amp; Mistakes
              </h2>
              <p className="text-xs text-[#5A5A55] dark:text-[#9CA3AF] tabular-nums">
                {paperAnalytics.paperCount} {paperAnalytics.paperCount === 1 ? 'paper' : 'papers'} ·{' '}
                {paperAnalytics.attemptedQuestions}/{paperAnalytics.totalQuestions} questions attempted
              </p>
            </div>
            <div className="flex items-center gap-1.5 font-mono tabular-nums text-sm font-bold text-[#141413] dark:text-[#F3F4F6]">
              <FileText className="w-4 h-4 text-[#4338CA] dark:text-[#818CF8]" />
              <span>{paperAnalytics.masteryRatePercent}% accuracy</span>
            </div>
          </div>

          {paperAnalytics.totalQuestions === 0 ? (
            <div className="rounded-xl border border-dashed border-[#E5E5E0] dark:border-[#232834] p-6 text-center text-xs text-[#5A5A55] dark:text-[#9CA3AF]">
              Add past papers in the Past Papers tab to track mastered questions, conceptual redo gaps, and silly mistakes.
            </div>
          ) : (
            <>
              {/* Stacked Question Status Bar */}
              <div className="space-y-2">
                <div className="h-2.5 w-full rounded-full bg-[#ECECE7] dark:bg-[#1F2430] overflow-hidden flex">
                  {paperAnalytics.masteredCount > 0 && (
                    <div
                      className="h-full bg-emerald-500"
                      style={{
                        width: `${(paperAnalytics.masteredCount / paperAnalytics.totalQuestions) * 100}%`,
                      }}
                    />
                  )}
                  {paperAnalytics.sillyCount > 0 && (
                    <div
                      className="h-full bg-amber-500"
                      style={{
                        width: `${(paperAnalytics.sillyCount / paperAnalytics.totalQuestions) * 100}%`,
                      }}
                    />
                  )}
                  {paperAnalytics.redoCount > 0 && (
                    <div
                      className="h-full bg-rose-500"
                      style={{
                        width: `${(paperAnalytics.redoCount / paperAnalytics.totalQuestions) * 100}%`,
                      }}
                    />
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-mono tabular-nums text-[#5A5A55] dark:text-[#9CA3AF]">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-xs bg-emerald-500" />
                    Mastered: <strong className="text-[#141413] dark:text-[#F3F4F6]">{paperAnalytics.masteredCount}</strong>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-xs bg-amber-500" />
                    Silly: <strong className="text-[#141413] dark:text-[#F3F4F6]">{paperAnalytics.sillyCount}</strong>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-xs bg-rose-500" />
                    Redo: <strong className="text-[#141413] dark:text-[#F3F4F6]">{paperAnalytics.redoCount}</strong>
                  </span>
                  <span>
                    Unattempted: {paperAnalytics.unattemptedCount}
                  </span>
                </div>
              </div>

              {/* Per-Subject Paper Accuracy */}
              <div className="grid grid-cols-3 gap-2 pt-1">
                {paperAnalytics.bySubject.map((sub) => (
                  <div
                    key={sub.subject}
                    className="rounded-xl bg-[#F7F7F5] dark:bg-[#0B0D11] border border-[#E5E5E0] dark:border-[#232834] p-2.5 space-y-0.5"
                  >
                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-[#5A5A55] dark:text-[#9CA3AF] truncate">
                      <span
                        className="w-2 h-2 rounded-xs shrink-0"
                        style={{ backgroundColor: sub.color }}
                      />
                      <span className="truncate">{sub.label}</span>
                    </div>
                    <div className="font-mono tabular-nums text-xs font-bold text-[#141413] dark:text-[#F3F4F6]">
                      {sub.attempted > 0 ? `${sub.masteryRatePercent}%` : '—'}
                    </div>
                    <div className="font-mono tabular-nums text-[10px] text-[#5A5A55] dark:text-[#9CA3AF]">
                      {sub.redo} redo · {sub.silly} silly
                    </div>
                  </div>
                ))}
              </div>

              {/* Weakest Tagged Units */}
              {paperAnalytics.topWeakUnits.length > 0 && (
                <div className="pt-2 border-t border-[#E5E5E0] dark:border-[#232834] space-y-1.5">
                  <div className="text-[11px] font-semibold text-[#141413] dark:text-[#F3F4F6]">
                    Most Flagged Units (Redo &amp; Silly Mistakes)
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {paperAnalytics.topWeakUnits.map((unit) => (
                      <div
                        key={`${unit.subject}_${unit.unitTag}`}
                        className="flex items-center justify-between gap-2 rounded-lg bg-[#F7F7F5] dark:bg-[#0B0D11] px-2.5 py-1.5 text-[11px]"
                      >
                        <span className="truncate font-medium text-[#141413] dark:text-[#F3F4F6]">
                          {unit.unitTag}
                        </span>
                        <span className="font-mono tabular-nums text-[#5A5A55] dark:text-[#9CA3AF] shrink-0">
                          {unit.redoCount}R · {unit.sillyCount}S
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </section>

        {/* Syllabus Depth, Confidence & Exam Pace */}
        <section
          data-testid="syllabus-depth-section"
          className="lg:col-span-6 rounded-2xl bg-white dark:bg-[#13161D] border border-[#E5E5E0] dark:border-[#232834] p-5 space-y-4"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="font-display text-base font-semibold text-[#141413] dark:text-[#F3F4F6]">
                Syllabus Depth &amp; Confidence
              </h2>
              <p className="text-xs text-[#5A5A55] dark:text-[#9CA3AF] tabular-nums">
                {syllabusDepth.revised + syllabusDepth.mastered}/{syllabusDepth.totalSubtopics} revised
                or mastered · {syllabusDepth.totalRevisions} revisions logged
              </p>
            </div>
            <div className="flex items-center gap-1.5 font-mono tabular-nums text-sm font-bold text-[#141413] dark:text-[#F3F4F6]">
              <BookOpen className="w-4 h-4 text-[#4338CA] dark:text-[#818CF8]" />
              <span>★ {syllabusDepth.avgConfidence.toFixed(1)}/5</span>
            </div>
          </div>

          <div className="space-y-3">
            {syllabusDepth.bySubject.map((sy) => {
              const total = Math.max(1, sy.total);
              return (
                <div key={sy.subject} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-xs shrink-0"
                        style={{ backgroundColor: sy.color }}
                      />
                      <span className="font-semibold text-[#141413] dark:text-[#F3F4F6] truncate">
                        {sy.label}
                      </span>
                      <span className="text-[11px] font-mono tabular-nums text-[#5A5A55] dark:text-[#9CA3AF]">
                        ★ {sy.avgConfidence.toFixed(1)} · {sy.totalRevisions} rev
                      </span>
                    </div>
                    <span className="font-mono tabular-nums text-[#141413] dark:text-[#F3F4F6] shrink-0">
                      {sy.progressPercent}%{' '}
                      <span className="text-[#5A5A55] dark:text-[#9CA3AF]">
                        ({sy.mastered}M / {sy.revised}R / {sy.learning}L)
                      </span>
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-[#ECECE7] dark:bg-[#1F2430] overflow-hidden flex">
                    {sy.mastered > 0 && (
                      <div
                        className="h-full bg-emerald-500"
                        style={{ width: `${(sy.mastered / total) * 100}%` }}
                      />
                    )}
                    {sy.revised > 0 && (
                      <div
                        className="h-full bg-sky-500"
                        style={{ width: `${(sy.revised / total) * 100}%` }}
                      />
                    )}
                    {sy.learning > 0 && (
                      <div
                        className="h-full bg-amber-400"
                        style={{ width: `${(sy.learning / total) * 100}%` }}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono tabular-nums text-[#5A5A55] dark:text-[#9CA3AF] pt-1">
            <span>
              Low-confidence topics (★ ≤ 2):{' '}
              <strong className="text-[#141413] dark:text-[#F3F4F6]">
                {syllabusDepth.lowConfidenceCount}
              </strong>
            </span>
            <span>
              Not started:{' '}
              <strong className="text-[#141413] dark:text-[#F3F4F6]">
                {syllabusDepth.notStarted}
              </strong>
            </span>
          </div>

          {examCountdowns.length > 0 && (
            <div className="pt-2 border-t border-[#E5E5E0] dark:border-[#232834] space-y-1.5">
              <div className="text-[11px] font-semibold text-[#141413] dark:text-[#F3F4F6]">
                Exam Pace Projection (at {formatDurationLabel(rolling7.averageMinutes)}/day avg)
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {examCountdowns.slice(0, 4).map((ex) => {
                  const daysLeft = Math.max(0, daysUntilISO(ex.date));
                  const projectedHours = Math.round(
                    (daysLeft * rolling7.averageMinutes) / 60
                  );
                  return (
                    <div
                      key={ex.id}
                      className="flex items-center justify-between gap-2 rounded-lg bg-[#F7F7F5] dark:bg-[#0B0D11] px-2.5 py-1.5 text-[11px]"
                    >
                      <span className="truncate font-medium text-[#141413] dark:text-[#F3F4F6]">
                        {ex.title}
                      </span>
                      <span className="font-mono tabular-nums text-[#4338CA] dark:text-[#A5B4FC] shrink-0">
                        {daysLeft}d · ~{projectedHours}h
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* 5. Session History List (Live Timer + Manual Logs) */}
      <section
        data-testid="analytics-session-history"
        className="rounded-2xl bg-white dark:bg-[#13161D] border border-[#E5E5E0] dark:border-[#232834] p-5 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold text-[#141413] dark:text-[#F3F4F6]">
              Session History
            </h2>
            <p className="text-xs text-[#5A5A55] dark:text-[#9CA3AF] mt-0.5">
              Unified timeline of live focus sessions and manually logged study records
            </p>
          </div>

          <div
            role="tablist"
            aria-label="Session history filter"
            className="flex items-center p-1 rounded-xl bg-[#ECECE7] dark:bg-[#0B0D11] border border-[#E5E5E0] dark:border-[#232834]"
          >
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'manual', label: 'Manual' },
                { id: 'live', label: 'Live Timer' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                role="tab"
                aria-selected={historyFilter === opt.id}
                onClick={() => setHistoryFilter(opt.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer whitespace-nowrap ${
                  historyFilter === opt.id
                    ? 'bg-white dark:bg-[#1F2430] text-[#141413] dark:text-[#F3F4F6] shadow-xs'
                    : 'text-[#5A5A55] dark:text-[#9CA3AF] hover:text-[#141413] dark:hover:text-[#F3F4F6]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {(() => {
          const sortedHistory = [...activeSessions]
            .filter((s) =>
              historyFilter === 'manual'
                ? Boolean(s.isManual)
                : historyFilter === 'live'
                ? !s.isManual
                : true
            )
            .sort((a, b) => b.endTimestamp - a.endTimestamp);

          if (sortedHistory.length === 0) {
            return (
              <div className="rounded-xl border border-dashed border-[#E5E5E0] dark:border-[#232834] p-6 text-center text-xs text-[#5A5A55] dark:text-[#9CA3AF]">
                No study sessions recorded yet. Start a live timer or click{' '}
                <button
                  type="button"
                  onClick={onOpenLogSession}
                  className="font-semibold text-[#4338CA] dark:text-[#A5B4FC] hover:underline cursor-pointer"
                >
                  + Log Session
                </button>{' '}
                to record past study hours.
              </div>
            );
          }

          return (
            <ul className="divide-y divide-[#E5E5E0] dark:divide-[#232834]">
              {sortedHistory.slice(0, 40).map((ses) => {
                const sub = subjects[ses.subject] ?? subjects.general;
                const startDt = new Date(ses.startTimestamp);
                const endDt = new Date(ses.endTimestamp);
                const startMins = startDt.getHours() * 60 + startDt.getMinutes();
                const endMins = endDt.getHours() * 60 + endDt.getMinutes();
                const linkedTaskTitle = ses.taskId ? taskTitleMap.get(ses.taskId) : null;

                return (
                  <li
                    key={ses.id}
                    data-testid={`history-session-${ses.id}`}
                    onClick={ses.isManual ? () => onEditManualSession(ses) : undefined}
                    className={`py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                      ses.isManual
                        ? 'cursor-pointer hover:bg-[#F7F7F5] dark:hover:bg-[#0B0D11] px-2.5 -mx-2.5 rounded-xl transition-colors'
                        : ''
                    }`}
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-xs shrink-0"
                          style={{ backgroundColor: sub.color }}
                        />
                        <span className="text-sm font-semibold text-[#141413] dark:text-[#F3F4F6] truncate">
                          {ses.title}
                        </span>
                        {ses.isManual && (
                          <span
                            data-testid="history-manual-badge"
                            className="inline-flex items-center rounded px-1.5 py-0.2 text-[10px] font-semibold uppercase tracking-wide border"
                            style={{
                              color: sub.color,
                              borderColor: `${sub.color}66`,
                              backgroundColor: `${sub.color}14`,
                            }}
                          >
                            Manual
                          </span>
                        )}
                        {linkedTaskTitle && (
                          <span className="text-[11px] text-[#4338CA] dark:text-[#A5B4FC] truncate">
                            → {linkedTaskTitle}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-[#5A5A55] dark:text-[#9CA3AF] tabular-nums pl-4.5">
                        <span style={{ color: sub.color }} className="font-medium">
                          {sub.label}
                        </span>{' '}
                        · <span className="font-mono">{ses.date}</span> ·{' '}
                        <span className="font-mono">
                          {formatTime24(startMins)} – {formatTime24(endMins)}
                        </span>
                      </div>
                      {ses.notes && (
                        <p className="text-xs text-[#5A5A55] dark:text-[#9CA3AF] pl-4.5 line-clamp-2">
                          {ses.notes}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 pl-4.5 sm:pl-0 shrink-0">
                      <span className="font-mono tabular-nums text-xs font-bold text-[#141413] dark:text-[#F3F4F6]">
                        {formatDurationLabel(ses.durationMinutes)}
                      </span>
                      {ses.isManual && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditManualSession(ses);
                          }}
                          aria-label={`Edit manual session ${ses.title}`}
                          className="p-1.5 rounded-lg border border-[#E5E5E0] dark:border-[#232834] text-[#5A5A55] dark:text-[#9CA3AF] hover:text-[#141413] dark:hover:text-[#F3F4F6] cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          );
        })()}
      </section>
    </div>
  );
};
