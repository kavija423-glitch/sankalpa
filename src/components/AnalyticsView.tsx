import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Award,
  BookOpen,
  Calendar as CalendarIcon,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  Flame,
  Pencil,
  Play,
  Plus,
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
  NavTab,
  PaperSubjectKey,
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
  type AnalyticsTimeframe,
  type HeatmapIntensity,
} from '../utils/analyticsMath';
import { daysUntilISO, formatDurationLabel, formatTime24 } from '../utils/calendarMath';
import { toISODateLocal } from '../utils/nlpTaskParser';
import { extractRedoQueue } from '../utils/paperGenerator';

export type AnalyticsSegment = 'overview' | 'execution' | 'readiness';

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
  onCreateWeakUnitTask?: (subject: PaperSubjectKey, unitTitle: string, reason?: string) => void;
  onStartWeakUnitFocus?: (subject: PaperSubjectKey, unitTitle: string) => void;
  onNavigateTab?: (tab: NavTab) => void;
}

const INTENSITY_CLASSES: Record<HeatmapIntensity, string> = {
  0: 'bg-[#EAF1F7] dark:bg-[#131E2E] text-[#64748B] dark:text-[#64748B]',
  1: 'bg-[#E0F2FE] dark:bg-[#0C2D48] text-[#0369A1] dark:text-[#BAE6FD]',
  2: 'bg-[#BAE6FD] dark:bg-[#075985] text-[#0C4A6E] dark:text-[#E0F2FE]',
  3: 'bg-[#38BDF8] dark:bg-[#0EA5E9] text-[#082F49] dark:text-[#07131E]',
  4: 'bg-[#0284C7] dark:bg-[#7DD3FC] text-white dark:text-[#07131E]',
};

const YEARLY_TILE_CLASSES: Record<HeatmapIntensity, string> = {
  0: 'bg-[#E6EEF5] dark:bg-[#131E2E]',
  1: 'bg-[#BAE6FD] dark:bg-[#0C2D48]',
  2: 'bg-[#7DD3FC] dark:bg-[#0369A1]',
  3: 'bg-[#0EA5E9] dark:bg-[#38BDF8]',
  4: 'bg-[#0284C7] dark:bg-[#7DD3FC]',
};

const TIMEFRAME_OPTIONS: Array<{ id: AnalyticsTimeframe; label: string }> = [
  { id: 'week', label: 'This Week' },
  { id: 'month', label: 'This Month' },
  { id: 'year', label: 'This Year' },
];

const SEGMENT_TABS: Array<{ id: AnalyticsSegment; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'execution', label: 'Time & Execution' },
  { id: 'readiness', label: 'Exam Readiness' },
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
  onCreateWeakUnitTask,
  onStartWeakUnitFocus,
  onNavigateTab,
}) => {
  const todayISO = toISODateLocal(new Date());
  const [todayYear, todayMonth] = todayISO.split('-').map(Number);

  const [activeSegment, setActiveSegment] = useState<AnalyticsSegment>('overview');
  const [timeframe, setTimeframe] = useState<AnalyticsTimeframe>('week');
  const [historyFilter, setHistoryFilter] = useState<'all' | 'manual' | 'live'>('all');
  const [showAllHistory, setShowAllHistory] = useState(false);
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
  const [addedWeakKeys, setAddedWeakKeys] = useState<Record<string, boolean>>({});
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
    if (activeSegment === 'overview' && yearlyScrollRef.current) {
      yearlyScrollRef.current.scrollLeft = yearlyScrollRef.current.scrollWidth;
    }
  }, [yearlyColumns.length, activeSegment]);

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
  const weakSyllabusUnits = useMemo(
    () => computeWeakUnitsForAction(syllabus, papers, subjects, 6),
    [syllabus, papers, subjects]
  );
  const redoCount = useMemo(() => extractRedoQueue(papers).length, [papers]);

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

  const handleTriggerWeakTask = (
    key: string,
    subject: PaperSubjectKey,
    title: string,
    reason: string
  ) => {
    onCreateWeakUnitTask?.(subject, title, reason);
    setAddedWeakKeys((prev) => ({ ...prev, [key]: true }));
  };

  return (
    <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 py-5 space-y-6">
      {/* Page Header & 3-Segment Switcher */}
      <div className="space-y-4 border-b border-[#DCE6F0] dark:border-[#1E2C40] pb-4">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#0F172A] dark:text-[#F1F5F9]">
              Focus Analytics
            </h1>
            <p className="text-sm text-[#475569] dark:text-[#94A3B8] mt-1">
              Focus momentum, execution timing &amp; A/L exam readiness
            </p>
          </div>

          <button
            type="button"
            onClick={onOpenLogSession}
            data-testid="analytics-log-session-btn"
            className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-[#0284C7] hover:bg-[#0369A1] dark:bg-[#38BDF8] dark:hover:bg-[#7DD3FC] text-white dark:text-[#07131E] text-xs font-semibold inline-flex items-center gap-1.5 hover:opacity-90 whitespace-nowrap shrink-0 self-start sm:self-end cursor-pointer"
          >
            <Clock className="w-3.5 h-3.5" />
            <span>+ Log Session</span>
          </button>
        </div>

        {/* 3-Segment Pill Switcher */}
        <div
          role="tablist"
          aria-label="Analytics categories"
          data-testid="analytics-segment-tabs"
          className="inline-flex w-full sm:w-auto items-center p-1 rounded-xl bg-[#E6EEF5] dark:bg-[#080E17] border border-[#DCE6F0] dark:border-[#1E2C40] gap-1 overflow-x-auto ios-scroll"
        >
          {SEGMENT_TABS.map((tab) => {
            const isActive = activeSegment === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                data-testid={`analytics-tab-${tab.id}`}
                onClick={() => setActiveSegment(tab.id)}
                className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
                  isActive
                    ? 'bg-white dark:bg-[#172233] text-[#0F172A] dark:text-[#F1F5F9] shadow-xs'
                    : 'text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F1F5F9]'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ================================================================= */}
      {/* TAB 1: OVERVIEW                                                   */}
      {/* ================================================================= */}
      {activeSegment === 'overview' && (
        <div className="space-y-6" data-testid="analytics-panel-overview">
          {/* Overview 4-Card KPI Row */}
          <div
            data-testid="overview-kpi-row"
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4"
          >
            {/* Card 1: Today's Focus vs. Goal */}
            <div
              data-testid="kpi-today-focus"
              className="rounded-2xl bg-white dark:bg-[#0F1724] border border-[#DCE6F0] dark:border-[#1E2C40] p-4 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between text-xs text-[#475569] dark:text-[#94A3B8]">
                  <span>Today&apos;s Focus vs. Goal</span>
                  <Target className="w-4 h-4 text-[#0EA5E9] dark:text-[#38BDF8]" />
                </div>
                <div className="font-mono tabular-nums text-2xl font-bold text-[#0F172A] dark:text-[#F1F5F9] mt-2">
                  {formatDurationLabel(todayStats.todayMinutes)}{' '}
                  <span className="text-sm font-semibold text-[#475569] dark:text-[#94A3B8]">
                    ({todayStats.goalPercent}%)
                  </span>
                </div>
                <div className="text-[11px] text-[#475569] dark:text-[#94A3B8] mt-1 font-mono tabular-nums">
                  Goal: {formatDurationLabel(dailyGoalMinutes)} ·{' '}
                  {todayStats.remainingMinutes > 0
                    ? `${formatDurationLabel(todayStats.remainingMinutes)} left`
                    : todayStats.extraMinutes > 0
                    ? `+${formatDurationLabel(todayStats.extraMinutes)} extra`
                    : 'Target reached'}
                </div>
              </div>
              <div className="mt-2.5 h-1.5 w-full rounded-full bg-[#E6EEF5] dark:bg-[#172233] overflow-hidden">
                <div
                  className="h-full rounded-full bg-[#0EA5E9] dark:bg-[#38BDF8]"
                  style={{ width: `${todayStats.goalBarPercent}%` }}
                />
              </div>
            </div>

            {/* Card 2: Current Streak & Best Streak (>= 30m/day) */}
            <div
              data-testid="kpi-streak"
              className="rounded-2xl bg-white dark:bg-[#0F1724] border border-[#DCE6F0] dark:border-[#1E2C40] p-4 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between text-xs text-[#475569] dark:text-[#94A3B8]">
                  <span>Study Streak</span>
                  <Flame className="w-4 h-4 text-amber-500" />
                </div>
                <div className="font-mono tabular-nums text-2xl font-bold text-[#0F172A] dark:text-[#F1F5F9] mt-2">
                  {streaks.currentStreak} {streaks.currentStreak === 1 ? 'day' : 'days'}
                </div>
                <div className="text-[11px] text-[#475569] dark:text-[#94A3B8] mt-1 font-mono tabular-nums">
                  Best streak:{' '}
                  <strong className="text-[#0F172A] dark:text-[#F1F5F9]">{streaks.bestStreak}d</strong>
                </div>
              </div>
              <div className="text-[11px] text-[#475569] dark:text-[#94A3B8] mt-1 tabular-nums">
                Requires ≥ 30m logged/day
              </div>
            </div>

            {/* Card 3: Period Comparison (Week / Month / Year) */}
            <div
              data-testid="kpi-period-comparison"
              className="rounded-2xl bg-white dark:bg-[#0F1724] border border-[#DCE6F0] dark:border-[#1E2C40] p-4 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between text-xs text-[#475569] dark:text-[#94A3B8]">
                  <span>
                    Focus ({timeframe === 'week' ? 'Week' : timeframe === 'month' ? 'Month' : 'Year'})
                  </span>
                  <Clock className="w-4 h-4 text-[#0EA5E9] dark:text-[#38BDF8]" />
                </div>
                <div className="font-mono tabular-nums text-2xl font-bold text-[#0F172A] dark:text-[#F1F5F9] mt-2">
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
                        ? 'text-[#475569] dark:text-[#94A3B8]'
                        : periodComparison.percentChange >= 0
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-rose-600 dark:text-rose-400'
                    }
                  >
                    {periodComparison.deltaLabel}
                  </span>
                </div>
              </div>
              <div className="text-[11px] text-[#475569] dark:text-[#94A3B8] mt-1 font-mono tabular-nums">
                All-time: {formatDurationLabel(allTimeMinutes)} · {activeSessions.length}{' '}
                {activeSessions.length === 1 ? 'session' : 'sessions'}
              </div>
            </div>

            {/* Card 4: 30-Day Goal Consistency & Rolling 7-Day Avg */}
            <div
              data-testid="kpi-goal-consistency"
              className="rounded-2xl bg-white dark:bg-[#0F1724] border border-[#DCE6F0] dark:border-[#1E2C40] p-4 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between text-xs text-[#475569] dark:text-[#94A3B8]">
                  <span>30-Day Goal Consistency</span>
                  <Trophy className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="font-mono tabular-nums text-2xl font-bold text-[#0F172A] dark:text-[#F1F5F9] mt-2">
                  {goalConsistency.goalHitDays30}/30d{' '}
                  <span className="text-sm font-semibold text-[#475569] dark:text-[#94A3B8]">
                    ({goalConsistency.goalHitPercent30}%)
                  </span>
                </div>
                <div className="text-[11px] text-[#475569] dark:text-[#94A3B8] mt-1 font-mono tabular-nums truncate">
                  7d avg: {formatDurationLabel(rolling7.averageMinutes)}/d
                  {goalConsistency.bestDayDate
                    ? ` · Best: ${formatDurationLabel(goalConsistency.bestDayMinutes)}`
                    : ''}
                </div>
              </div>
              <div className="mt-2.5 h-1.5 w-full rounded-full bg-[#E6EEF5] dark:bg-[#172233] overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-600 dark:bg-emerald-400"
                  style={{ width: `${goalConsistency.goalHitPercent30}%` }}
                />
              </div>
            </div>
          </div>

          {/* Period Comparison (Week | Month | Year), Subject Share & Balance Alerts */}
          <section className="rounded-2xl bg-white dark:bg-[#0F1724] border border-[#DCE6F0] dark:border-[#1E2C40] p-5 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-base font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
                  Period Focus &amp; Core Subject Balance
                </h2>
                <p className="text-xs text-[#475569] dark:text-[#94A3B8] mt-0.5">
                  Subject share, session counts &amp; weekly core balance (&ge; 20% target)
                </p>
              </div>

              <div
                role="tablist"
                aria-label="Subject distribution timeframe"
                className="flex items-center p-1 rounded-xl bg-[#E6EEF5] dark:bg-[#080E17] border border-[#DCE6F0] dark:border-[#1E2C40]"
              >
                {TIMEFRAME_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    role="tab"
                    aria-selected={timeframe === opt.id}
                    onClick={() => setTimeframe(opt.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer whitespace-nowrap shrink-0 ${
                      timeframe === opt.id
                        ? 'bg-white dark:bg-[#172233] text-[#0F172A] dark:text-[#F1F5F9] shadow-xs'
                        : 'text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F1F5F9]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {weeklyBalanceAlerts.length > 0 && (
              <div
                data-testid="subject-balance-warning"
                className="inline-flex flex-wrap items-center gap-2 rounded-xl border border-amber-300/80 dark:border-amber-700/60 bg-amber-50/80 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-900 dark:text-amber-200"
              >
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <span className="font-semibold">Subject balance alert:</span>
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
                      className="text-[#E6EEF5] dark:text-[#172233]"
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
                    <span className="text-[11px] font-medium text-[#475569] dark:text-[#94A3B8] truncate max-w-full">
                      {focusedDonutSubject
                        ? focusedDonutSubject.label
                        : timeframe === 'week'
                        ? 'This Week'
                        : timeframe === 'month'
                        ? 'This Month'
                        : 'This Year'}
                    </span>
                    <span className="font-mono tabular-nums text-xl font-bold text-[#0F172A] dark:text-[#F1F5F9] mt-0.5">
                      {formatDurationLabel(
                        focusedDonutSubject
                          ? focusedDonutSubject.minutes
                          : subjectBreakdown.totalMinutes
                      )}
                    </span>
                    <span className="text-[11px] font-mono tabular-nums text-[#475569] dark:text-[#94A3B8]">
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
              <div className="md:col-span-7 space-y-3">
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
                        isHighlighted ? 'bg-[#F4F8FB] dark:bg-[#080E17]' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="w-2.5 h-2.5 rounded-xs shrink-0"
                            style={{ backgroundColor: item.color }}
                          />
                          <span className="font-semibold text-[#0F172A] dark:text-[#F1F5F9] truncate">
                            {item.label}
                          </span>
                          <span className="text-[11px] text-[#475569] dark:text-[#94A3B8] tabular-nums">
                            ({item.sessionCount} {item.sessionCount === 1 ? 'session' : 'sessions'})
                          </span>
                        </div>
                        <span className="font-mono tabular-nums text-[#0F172A] dark:text-[#F1F5F9] shrink-0">
                          {formatDurationLabel(item.minutes)}{' '}
                          <span className="text-[#475569] dark:text-[#94A3B8]">
                            ({item.percentage}%)
                          </span>
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-[#E6EEF5] dark:bg-[#172233] overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${item.percentage}%`, backgroundColor: item.color }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          {/* Dual Contribution Heatmaps (Monthly & Yearly) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Monthly Calendar Heatmap */}
            <section className="lg:col-span-5 rounded-2xl bg-white dark:bg-[#0F1724] border border-[#DCE6F0] dark:border-[#1E2C40] p-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="font-display text-base font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
                    Monthly Contribution
                  </h2>
                  <p className="text-xs text-[#475569] dark:text-[#94A3B8]">{monthHeading}</p>
                </div>
                <div className="flex items-center rounded-lg border border-[#DCE6F0] dark:border-[#1E2C40] bg-[#F4F8FB] dark:bg-[#080E17]">
                  <button
                    type="button"
                    onClick={() => shiftMonth(-1)}
                    aria-label="Previous month"
                    className="p-1.5 text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F1F5F9] cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => shiftMonth(1)}
                    aria-label="Next month"
                    className="p-1.5 text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F1F5F9] cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-7 gap-1.5 text-center text-[10px] font-medium text-[#475569] dark:text-[#94A3B8]">
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
                      } ${isSelected ? 'ring-2 ring-[#0EA5E9] dark:ring-[#38BDF8]' : ''} ${
                        isToday && !isSelected ? 'ring-1 ring-[#0F172A]/40 dark:ring-white/40' : ''
                      }`}
                    >
                      {cell.dayNumber}
                    </button>
                  );
                })}
              </div>

              <div className="pt-2 border-t border-[#DCE6F0] dark:border-[#1E2C40] text-xs flex flex-wrap items-center justify-between gap-2 min-h-[28px]">
                {activeMonthCell ? (
                  <>
                    <span className="font-mono tabular-nums font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
                      {activeMonthCell.date}
                    </span>
                    <span className="text-[#475569] dark:text-[#94A3B8] tabular-nums">
                      {formatDurationLabel(activeMonthCell.totalMinutes)}
                      {activeMonthCell.topSubject
                        ? ` · Top: ${subjects[activeMonthCell.topSubject]?.label ?? activeMonthCell.topSubject}`
                        : ' · Rest day'}
                    </span>
                  </>
                ) : (
                  <span className="text-[#475569] dark:text-[#94A3B8]">
                    Hover or tap any day to inspect hours &amp; top subject
                  </span>
                )}
              </div>
            </section>

            {/* Yearly Contribution Heatmap (52-week x 7-day) */}
            <section className="lg:col-span-7 rounded-2xl bg-white dark:bg-[#0F1724] border border-[#DCE6F0] dark:border-[#1E2C40] p-5 flex flex-col justify-between space-y-4 min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-display text-base font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
                    Contribution Heatmap
                  </h2>
                  <p className="text-xs text-[#475569] dark:text-[#94A3B8] tabular-nums">
                    Rolling 365 days · {formatDurationLabel(yearlyStats.totalMinutes)} across{' '}
                    {yearlyStats.activeDays} active {yearlyStats.activeDays === 1 ? 'day' : 'days'}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-[#475569] dark:text-[#94A3B8]">
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
                  <div className="flex items-center pl-7 gap-[3px] h-4">
                    {yearlyColumns.map((col) => (
                      <div
                        key={`m_${col.weekIndex}`}
                        className="w-[11px] text-[10px] text-[#475569] dark:text-[#94A3B8] overflow-visible whitespace-nowrap"
                      >
                        {col.monthLabel ?? ''}
                      </div>
                    ))}
                  </div>

                  <div className="flex items-start gap-1.5">
                    <div className="grid grid-rows-7 gap-[3px] text-[10px] text-[#475569] dark:text-[#94A3B8] pr-1 leading-[11px]">
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
                                } ${isSelected ? 'ring-1 ring-[#0F172A] dark:ring-white' : ''}`}
                              />
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-[#DCE6F0] dark:border-[#1E2C40] text-xs flex flex-wrap items-center justify-between gap-2 min-h-[28px]">
                {activeYearCell ? (
                  <>
                    <span className="font-mono tabular-nums font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
                      {activeYearCell.date}
                    </span>
                    <span className="text-[#475569] dark:text-[#94A3B8] tabular-nums">
                      {formatDurationLabel(activeYearCell.totalMinutes)} logged ·{' '}
                      {activeYearCell.sessionCount}{' '}
                      {activeYearCell.sessionCount === 1 ? 'session' : 'sessions'}
                    </span>
                  </>
                ) : (
                  <span className="text-[#475569] dark:text-[#94A3B8]">
                    Hover or tap any square to inspect exact date and focus duration
                  </span>
                )}
              </div>
            </section>
          </div>

          {/* Recent Session History (Compact with expand toggle) */}
          <section
            data-testid="analytics-session-history"
            className="rounded-2xl bg-white dark:bg-[#0F1724] border border-[#DCE6F0] dark:border-[#1E2C40] p-5 space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-base font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
                  Recent Session History
                </h2>
                <p className="text-xs text-[#475569] dark:text-[#94A3B8] mt-0.5">
                  Live timer sessions and manually logged study entries
                </p>
              </div>

              <div
                role="tablist"
                aria-label="Session history filter"
                className="flex items-center p-1 rounded-xl bg-[#E6EEF5] dark:bg-[#080E17] border border-[#DCE6F0] dark:border-[#1E2C40]"
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
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer whitespace-nowrap shrink-0 ${
                      historyFilter === opt.id
                        ? 'bg-white dark:bg-[#172233] text-[#0F172A] dark:text-[#F1F5F9] shadow-xs'
                        : 'text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F1F5F9]'
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
                  <div className="rounded-xl border border-dashed border-[#DCE6F0] dark:border-[#1E2C40] p-6 text-center text-xs text-[#475569] dark:text-[#94A3B8]">
                    No study sessions recorded yet. Start a timer or click{' '}
                    <button
                      type="button"
                      onClick={onOpenLogSession}
                      className="font-semibold text-[#0284C7] dark:text-[#7DD3FC] hover:underline cursor-pointer"
                    >
                      + Log Session
                    </button>{' '}
                    to record past study hours.
                  </div>
                );
              }

              const visibleItems = showAllHistory
                ? sortedHistory.slice(0, 40)
                : sortedHistory.slice(0, 6);

              return (
                <>
                  <ul className="divide-y divide-[#DCE6F0] dark:divide-[#1E2C40]">
                    {visibleItems.map((ses) => {
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
                              ? 'cursor-pointer hover:bg-[#F4F8FB] dark:hover:bg-[#080E17] px-2.5 -mx-2.5 rounded-xl transition-colors'
                              : ''
                          }`}
                        >
                          <div className="min-w-0 space-y-0.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className="w-2.5 h-2.5 rounded-xs shrink-0"
                                style={{ backgroundColor: sub.color }}
                              />
                              <span className="text-sm font-semibold text-[#0F172A] dark:text-[#F1F5F9] truncate">
                                {ses.title}
                              </span>
                              {ses.isManual && (
                                <span
                                  data-testid="history-manual-badge"
                                  className="text-[11px] font-medium text-[#475569] dark:text-[#94A3B8]"
                                >
                                  · Manual
                                </span>
                              )}
                              {linkedTaskTitle && (
                                <span className="text-[11px] text-[#0284C7] dark:text-[#7DD3FC] truncate">
                                  · {linkedTaskTitle}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-[#475569] dark:text-[#94A3B8] tabular-nums pl-4.5">
                              <span style={{ color: sub.color }} className="font-medium">
                                {sub.label}
                              </span>{' '}
                              · <span className="font-mono">{ses.date}</span> ·{' '}
                              <span className="font-mono">
                                {formatTime24(startMins)} – {formatTime24(endMins)}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 pl-4.5 sm:pl-0 shrink-0">
                            <span className="font-mono tabular-nums text-xs font-bold text-[#0F172A] dark:text-[#F1F5F9]">
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
                                className="p-1.5 rounded-lg border border-[#DCE6F0] dark:border-[#1E2C40] text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F1F5F9] cursor-pointer"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>

                  {sortedHistory.length > 6 && (
                    <div className="pt-2 border-t border-[#DCE6F0] dark:border-[#1E2C40] flex justify-center">
                      <button
                        type="button"
                        onClick={() => setShowAllHistory((v) => !v)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium text-[#0284C7] dark:text-[#7DD3FC] hover:bg-[#F4F8FB] dark:hover:bg-[#080E17] cursor-pointer whitespace-nowrap"
                      >
                        {showAllHistory
                          ? 'Show fewer sessions'
                          : `Show all ${Math.min(40, sortedHistory.length)} sessions`}
                      </button>
                    </div>
                  )}
                </>
              );
            })()}
          </section>
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB 2: TIME & EXECUTION                                           */}
      {/* ================================================================= */}
      {activeSegment === 'execution' && (
        <div className="space-y-6" data-testid="analytics-panel-execution">
          {/* Execution 4-Card KPI Row */}
          <div
            data-testid="execution-kpi-row"
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4"
          >
            {/* Card 1: Overall Plan Execution Accuracy */}
            <div
              data-testid="kpi-overall-plan-accuracy"
              className="rounded-2xl bg-white dark:bg-[#0F1724] border border-[#DCE6F0] dark:border-[#1E2C40] p-4 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between text-xs text-[#475569] dark:text-[#94A3B8]">
                  <span>Plan Execution Accuracy</span>
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="font-mono tabular-nums text-2xl font-bold text-[#0F172A] dark:text-[#F1F5F9] mt-2">
                  {planAccuracy.accuracyPercent}%
                </div>
                <div className="text-[11px] text-[#475569] dark:text-[#94A3B8] mt-1 font-mono tabular-nums">
                  {planAccuracy.scheduledMinutes > 0
                    ? `${formatDurationLabel(planAccuracy.completedMinutes)} / ${formatDurationLabel(
                        planAccuracy.scheduledMinutes
                      )} blocks`
                    : 'No blocks scheduled yet'}
                </div>
              </div>
              <div className="mt-2.5 h-1.5 w-full rounded-full bg-[#E6EEF5] dark:bg-[#172233] overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-600 dark:bg-emerald-400"
                  style={{ width: `${planAccuracy.accuracyPercent}%` }}
                />
              </div>
            </div>

            {/* Card 2: Today's Plan Accuracy */}
            <div
              data-testid="kpi-daily-plan-accuracy"
              className="rounded-2xl bg-white dark:bg-[#0F1724] border border-[#DCE6F0] dark:border-[#1E2C40] p-4 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between text-xs text-[#475569] dark:text-[#94A3B8]">
                  <span>Today&apos;s Plan Accuracy</span>
                  <CalendarIcon className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                </div>
                <div className="font-mono tabular-nums text-2xl font-bold text-[#0F172A] dark:text-[#F1F5F9] mt-2">
                  {dailyPlanAccuracy.accuracyPercent}%
                </div>
                <div className="text-[11px] text-[#475569] dark:text-[#94A3B8] mt-1 font-mono tabular-nums">
                  {dailyPlanAccuracy.scheduledMinutes > 0
                    ? `${dailyPlanAccuracy.completedBlocksCount}/${dailyPlanAccuracy.blockCount} blocks (${formatDurationLabel(
                        dailyPlanAccuracy.completedMinutes
                      )})`
                    : 'No blocks scheduled today'}
                </div>
              </div>
              <div className="mt-2.5 h-1.5 w-full rounded-full bg-[#E6EEF5] dark:bg-[#172233] overflow-hidden">
                <div
                  className="h-full rounded-full bg-sky-600 dark:bg-sky-400"
                  style={{ width: `${dailyPlanAccuracy.accuracyPercent}%` }}
                />
              </div>
            </div>

            {/* Card 3: Avg Focus Quality Rating */}
            <div
              data-testid="kpi-focus-quality"
              className="rounded-2xl bg-white dark:bg-[#0F1724] border border-[#DCE6F0] dark:border-[#1E2C40] p-4 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between text-xs text-[#475569] dark:text-[#94A3B8]">
                  <span>Avg Focus Quality</span>
                  <Star className="w-4 h-4 text-amber-500" />
                </div>
                <div className="font-mono tabular-nums text-2xl font-bold text-[#0F172A] dark:text-[#F1F5F9] mt-2">
                  {sessionQuality.totalSessions > 0 ? `${sessionQuality.avgRating.toFixed(1)} / 5` : '—'}
                </div>
                <div className="text-[11px] text-[#475569] dark:text-[#94A3B8] mt-1 font-mono tabular-nums">
                  {sessionQuality.totalSessions > 0
                    ? `Across ${sessionQuality.totalSessions} ${
                        sessionQuality.totalSessions === 1 ? 'session' : 'sessions'
                      }`
                    : 'No rated sessions yet'}
                </div>
              </div>
              <div className="mt-2.5 grid grid-cols-5 gap-1">
                {[1, 2, 3, 4, 5].map((step) => (
                  <div
                    key={step}
                    className={`h-1.5 rounded-full ${
                      sessionQuality.avgRating >= step - 0.25 && sessionQuality.totalSessions > 0
                        ? 'bg-amber-500'
                        : 'bg-[#E6EEF5] dark:bg-[#172233]'
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Card 4: Avg Session Length & Deep Work */}
            <div
              data-testid="kpi-session-depth"
              className="rounded-2xl bg-white dark:bg-[#0F1724] border border-[#DCE6F0] dark:border-[#1E2C40] p-4 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between text-xs text-[#475569] dark:text-[#94A3B8]">
                  <span>Avg Session Length</span>
                  <Timer className="w-4 h-4 text-[#0EA5E9] dark:text-[#38BDF8]" />
                </div>
                <div className="font-mono tabular-nums text-2xl font-bold text-[#0F172A] dark:text-[#F1F5F9] mt-2">
                  {formatDurationLabel(sessionQuality.avgSessionMinutes)}
                </div>
                <div className="text-[11px] text-[#475569] dark:text-[#94A3B8] mt-1 font-mono tabular-nums">
                  Longest: {formatDurationLabel(sessionQuality.longestSessionMinutes)} ·{' '}
                  {sessionQuality.deepSessionsCount} deep (≥ 45m)
                </div>
              </div>
              <div className="text-[11px] text-[#475569] dark:text-[#94A3B8] mt-1 font-mono tabular-nums">
                Tasks: {taskBacklog.completedCount}/{taskBacklog.totalCount} done ({taskBacklog.overdueCount}{' '}
                overdue)
              </div>
            </div>
          </div>

          {/* Last 7 Days Planned vs. Actual & 24-Hour Peak Focus Hours */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Planned vs. Actual Comparison (Last 7 Days) */}
            <section className="lg:col-span-6 rounded-2xl bg-white dark:bg-[#0F1724] border border-[#DCE6F0] dark:border-[#1E2C40] p-5 flex flex-col justify-between space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-display text-base font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
                    Last 7 Days Planned vs. Actual
                  </h2>
                  <p className="text-xs text-[#475569] dark:text-[#94A3B8]">
                    Scheduled block duration vs. completed focus minutes
                  </p>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-[#475569] dark:text-[#94A3B8]">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-xs bg-[#CBD5E1] dark:bg-[#334155]" /> Planned
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-xs bg-[#0EA5E9] dark:bg-[#38BDF8]" /> Actual
                  </span>
                </div>
              </div>

              <div
                className="h-44 flex items-end justify-between gap-2 pt-4 border-b border-[#DCE6F0] dark:border-[#1E2C40] pb-2"
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
                        isSelected ? 'bg-[#F4F8FB] dark:bg-[#080E17]' : ''
                      }`}
                    >
                      <div className="w-full flex items-end justify-center gap-1 h-32">
                        <div
                          title={`${day.iso} Planned: ${day.plannedMinutes}m`}
                          style={{
                            height: `${Math.max(day.plannedMinutes > 0 ? 6 : 0, plannedH)}%`,
                          }}
                          className="w-3 sm:w-4 rounded-t-sm bg-[#CBD5E1] dark:bg-[#334155] transition-all"
                        />
                        <div
                          title={`${day.iso} Actual: ${day.actualMinutes}m`}
                          style={{
                            height: `${Math.max(day.actualMinutes > 0 ? 6 : 0, actualH)}%`,
                          }}
                          className="w-3 sm:w-4 rounded-t-sm bg-[#0EA5E9] dark:bg-[#38BDF8] transition-all"
                        />
                      </div>
                      <div
                        className={`text-[11px] font-medium ${
                          isToday
                            ? 'text-[#0EA5E9] dark:text-[#38BDF8] font-bold'
                            : 'text-[#475569] dark:text-[#94A3B8]'
                        }`}
                      >
                        {day.label}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="text-xs text-[#475569] dark:text-[#94A3B8] flex items-center justify-between tabular-nums min-h-[20px]">
                {inspectedTrend ? (
                  <>
                    <span className="font-mono font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
                      {inspectedTrend.iso}
                    </span>
                    <span className="font-mono">
                      Planned: {formatDurationLabel(inspectedTrend.plannedMinutes)} · Actual:{' '}
                      {formatDurationLabel(inspectedTrend.actualMinutes)}
                    </span>
                  </>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <Award className="w-3.5 h-3.5 text-[#0EA5E9] dark:text-[#38BDF8]" />
                    Hover or tap a day bar for exact planned vs. actual minutes
                  </span>
                )}
              </div>
            </section>

            {/* 24-Hour Peak Focus Hours */}
            <section className="lg:col-span-6 rounded-2xl bg-white dark:bg-[#0F1724] border border-[#DCE6F0] dark:border-[#1E2C40] p-5 flex flex-col justify-between space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-display text-base font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
                    24-Hour Peak Focus Hours
                  </h2>
                  <p className="text-xs text-[#475569] dark:text-[#94A3B8]">
                    Completed focus minutes distributed across 00:00–23:00
                  </p>
                </div>
                {inspectedHour && inspectedHour.minutes > 0 ? (
                  <span className="text-xs font-mono tabular-nums font-semibold text-[#0284C7] dark:text-[#7DD3FC]">
                    {inspectedHour.label}: {formatDurationLabel(inspectedHour.minutes)}
                  </span>
                ) : (
                  <span className="text-xs text-[#475569] dark:text-[#94A3B8]">No data yet</span>
                )}
              </div>

              <div
                className="h-44 flex items-end gap-1 pt-4 border-b border-[#DCE6F0] dark:border-[#1E2C40] pb-1"
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
                            ? 'bg-[#E6EEF5] dark:bg-[#172233]'
                            : h.isPeak || isSelected
                            ? 'bg-[#0EA5E9] dark:bg-[#38BDF8]'
                            : 'bg-[#BAE6FD] dark:bg-[#0C4A6E] group-hover:bg-[#0EA5E9]'
                        }`}
                      />
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center justify-between text-[10px] font-mono tabular-nums text-[#475569] dark:text-[#94A3B8]">
                <span>00:00</span>
                <span>04:00</span>
                <span>08:00</span>
                <span>12:00</span>
                <span>16:00</span>
                <span>20:00</span>
                <span>23:00</span>
              </div>
            </section>
          </div>

          {/* Weekday Rhythm & Timer Mode Quality Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Weekday Study Rhythm (Mon–Sun) */}
            <section
              data-testid="weekday-rhythm-section"
              className="lg:col-span-6 rounded-2xl bg-white dark:bg-[#0F1724] border border-[#DCE6F0] dark:border-[#1E2C40] p-5 flex flex-col justify-between space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-display text-base font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
                    Weekday Rhythm
                  </h2>
                  <p className="text-xs text-[#475569] dark:text-[#94A3B8]">
                    Total focus minutes by day of week (Mon–Sun)
                  </p>
                </div>
                {inspectedWeekday && inspectedWeekday.totalMinutes > 0 ? (
                  <span className="text-xs font-mono tabular-nums font-semibold text-[#0284C7] dark:text-[#7DD3FC]">
                    {inspectedWeekday.label}: {formatDurationLabel(inspectedWeekday.totalMinutes)} (avg{' '}
                    {formatDurationLabel(inspectedWeekday.avgMinutesPerActiveDay)})
                  </span>
                ) : (
                  <span className="text-xs text-[#475569] dark:text-[#94A3B8]">No data yet</span>
                )}
              </div>

              <div
                className="h-40 flex items-end justify-between gap-2 pt-4 border-b border-[#DCE6F0] dark:border-[#1E2C40] pb-2"
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
                              ? 'bg-[#E6EEF5] dark:bg-[#172233]'
                              : day.isBest || isSelected
                              ? 'bg-[#0EA5E9] dark:bg-[#38BDF8]'
                              : 'bg-[#BAE6FD] dark:bg-[#0C4A6E] group-hover:bg-[#0EA5E9]'
                          }`}
                        />
                      </div>
                      <span
                        className={`text-[11px] font-medium ${
                          day.isBest && day.totalMinutes > 0
                            ? 'text-[#0EA5E9] dark:text-[#38BDF8] font-bold'
                            : 'text-[#475569] dark:text-[#94A3B8]'
                        }`}
                      >
                        {day.label}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="text-xs text-[#475569] dark:text-[#94A3B8] flex flex-wrap items-center justify-between gap-2 tabular-nums">
                <span>
                  Live Timer:{' '}
                  <strong className="font-mono text-[#0F172A] dark:text-[#F1F5F9]">
                    {formatDurationLabel(sessionQuality.liveMinutes)}
                  </strong>{' '}
                  ({sessionQuality.liveCount})
                </span>
                <span>
                  Manual Logs:{' '}
                  <strong className="font-mono text-[#0F172A] dark:text-[#F1F5F9]">
                    {formatDurationLabel(sessionQuality.manualMinutes)}
                  </strong>{' '}
                  ({sessionQuality.manualCount})
                </span>
              </div>
            </section>

            {/* Timer Mode Quality Breakdown */}
            <section
              data-testid="focus-mode-mix-section"
              className="lg:col-span-6 rounded-2xl bg-white dark:bg-[#0F1724] border border-[#DCE6F0] dark:border-[#1E2C40] p-5 flex flex-col justify-between space-y-4"
            >
              <div>
                <h2 className="font-display text-base font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
                  Timer Mode Quality Breakdown
                </h2>
                <p className="text-xs text-[#475569] dark:text-[#94A3B8]">
                  Time share, session count &amp; average focus rating by study mode
                </p>
              </div>

              {sessionQuality.modeBreakdown.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[#DCE6F0] dark:border-[#1E2C40] p-6 text-center text-xs text-[#475569] dark:text-[#94A3B8]">
                  Complete or log study sessions to compare Pomodoro, Flowtime, Scheduled, and Manual sessions.
                </div>
              ) : (
                <div className="space-y-3 flex-1">
                  {sessionQuality.modeBreakdown.map((item) => (
                    <div key={item.mode} className="space-y-1">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
                          {item.label}{' '}
                          <span className="font-normal text-[#475569] dark:text-[#94A3B8] font-mono tabular-nums">
                            · {item.count} {item.count === 1 ? 'session' : 'sessions'} · ★{' '}
                            {item.avgRating.toFixed(1)}
                          </span>
                        </span>
                        <span className="font-mono tabular-nums text-[#0F172A] dark:text-[#F1F5F9]">
                          {formatDurationLabel(item.minutes)}{' '}
                          <span className="text-[#475569] dark:text-[#94A3B8]">
                            ({item.percentage}%)
                          </span>
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-[#E6EEF5] dark:bg-[#172233] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[#0EA5E9] dark:bg-[#38BDF8]"
                          style={{ width: `${item.percentage}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="pt-2 border-t border-[#DCE6F0] dark:border-[#1E2C40] text-xs text-[#475569] dark:text-[#94A3B8] flex items-center justify-between tabular-nums">
                <span>Overall Focus Quality</span>
                <span className="font-mono font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
                  {sessionQuality.totalSessions > 0 ? `★ ${sessionQuality.avgRating.toFixed(1)} / 5.0` : '—'}
                </span>
              </div>
            </section>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB 3: EXAM READINESS                                             */}
      {/* ================================================================= */}
      {activeSegment === 'readiness' && (
        <div className="space-y-6" data-testid="analytics-panel-readiness">
          {/* Readiness 4-Card KPI Row */}
          <div
            data-testid="readiness-kpi-row"
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4"
          >
            {/* Card 1: Syllabus Progression */}
            <div
              data-testid="kpi-syllabus-progression"
              className="rounded-2xl bg-white dark:bg-[#0F1724] border border-[#DCE6F0] dark:border-[#1E2C40] p-4 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between text-xs text-[#475569] dark:text-[#94A3B8]">
                  <span>Syllabus Mastery</span>
                  <BookOpen className="w-4 h-4 text-[#0EA5E9] dark:text-[#38BDF8]" />
                </div>
                <div className="font-mono tabular-nums text-2xl font-bold text-[#0F172A] dark:text-[#F1F5F9] mt-2">
                  {syllabusDepth.overallProgressPercent}%
                </div>
                <div className="text-[11px] text-[#475569] dark:text-[#94A3B8] mt-1 font-mono tabular-nums">
                  {syllabusDepth.revised + syllabusDepth.mastered}/{syllabusDepth.totalSubtopics} revised
                  or mastered
                </div>
              </div>
              <div className="mt-2.5 h-1.5 w-full rounded-full bg-[#E6EEF5] dark:bg-[#172233] overflow-hidden">
                <div
                  className="h-full rounded-full bg-[#0EA5E9] dark:bg-[#38BDF8]"
                  style={{ width: `${syllabusDepth.overallProgressPercent}%` }}
                />
              </div>
            </div>

            {/* Card 2: Syllabus Confidence */}
            <div
              data-testid="kpi-syllabus-confidence"
              className="rounded-2xl bg-white dark:bg-[#0F1724] border border-[#DCE6F0] dark:border-[#1E2C40] p-4 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between text-xs text-[#475569] dark:text-[#94A3B8]">
                  <span>Avg Syllabus Confidence</span>
                  <Star className="w-4 h-4 text-amber-500" />
                </div>
                <div className="font-mono tabular-nums text-2xl font-bold text-[#0F172A] dark:text-[#F1F5F9] mt-2">
                  {syllabusDepth.avgConfidence.toFixed(1)} / 5
                </div>
                <div className="text-[11px] text-[#475569] dark:text-[#94A3B8] mt-1 font-mono tabular-nums">
                  {syllabusDepth.totalRevisions} revisions · {syllabusDepth.lowConfidenceCount} low-conf
                </div>
              </div>
              <div className="mt-2.5 grid grid-cols-5 gap-1">
                {[1, 2, 3, 4, 5].map((step) => (
                  <div
                    key={step}
                    className={`h-1.5 rounded-full ${
                      syllabusDepth.avgConfidence >= step - 0.25
                        ? 'bg-amber-500'
                        : 'bg-[#E6EEF5] dark:bg-[#172233]'
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Card 3: Past Paper Mastery Rate */}
            <div
              data-testid="kpi-paper-mastery"
              className="rounded-2xl bg-white dark:bg-[#0F1724] border border-[#DCE6F0] dark:border-[#1E2C40] p-4 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between text-xs text-[#475569] dark:text-[#94A3B8]">
                  <span>Past Paper Mastery Rate</span>
                  <FileText className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="font-mono tabular-nums text-2xl font-bold text-[#0F172A] dark:text-[#F1F5F9] mt-2">
                  {paperAnalytics.attemptedQuestions > 0
                    ? `${paperAnalytics.masteryRatePercent}%`
                    : '—'}
                </div>
                <div className="text-[11px] text-[#475569] dark:text-[#94A3B8] mt-1 font-mono tabular-nums">
                  {paperAnalytics.attemptedQuestions}/{paperAnalytics.totalQuestions} questions across{' '}
                  {paperAnalytics.paperCount} {paperAnalytics.paperCount === 1 ? 'paper' : 'papers'}
                </div>
              </div>
              <div className="mt-2.5 h-1.5 w-full rounded-full bg-[#E6EEF5] dark:bg-[#172233] overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-600 dark:bg-emerald-400"
                  style={{ width: `${paperAnalytics.masteryRatePercent}%` }}
                />
              </div>
            </div>

            {/* Card 4: Active Redo Queue */}
            <div
              data-testid="kpi-redo-queue"
              className="rounded-2xl bg-white dark:bg-[#0F1724] border border-[#DCE6F0] dark:border-[#1E2C40] p-4 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between text-xs text-[#475569] dark:text-[#94A3B8]">
                  <span>Redo &amp; Mistake Queue</span>
                  <AlertTriangle className="w-4 h-4 text-rose-500" />
                </div>
                <div className="font-mono tabular-nums text-2xl font-bold text-[#0F172A] dark:text-[#F1F5F9] mt-2">
                  {redoCount}
                </div>
                <div className="text-[11px] text-[#475569] dark:text-[#94A3B8] mt-1 font-mono tabular-nums">
                  {paperAnalytics.redoCount} conceptual redo · {paperAnalytics.sillyCount} silly
                </div>
              </div>
              <div className="text-[11px] text-[#475569] dark:text-[#94A3B8] mt-1 font-mono tabular-nums">
                {weakSyllabusUnits.length}{' '}
                {weakSyllabusUnits.length === 1 ? 'unit needs' : 'units need'} focus
              </div>
            </div>
          </div>

          {/* Syllabus Mastery & Confidence + Past Paper Mastery Rate Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Syllabus Mastery & Confidence Progression */}
            <section
              data-testid="syllabus-depth-section"
              className="lg:col-span-6 rounded-2xl bg-white dark:bg-[#0F1724] border border-[#DCE6F0] dark:border-[#1E2C40] p-5 flex flex-col justify-between space-y-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="font-display text-base font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
                    Syllabus Mastery &amp; Confidence
                  </h2>
                  <p className="text-xs text-[#475569] dark:text-[#94A3B8] tabular-nums">
                    Stage distribution (Mastered / Revised / Learning) across A/L subjects
                  </p>
                </div>
                {onNavigateTab && (
                  <button
                    type="button"
                    onClick={() => onNavigateTab('syllabus')}
                    className="inline-flex items-center gap-1 text-xs font-medium text-[#0284C7] dark:text-[#7DD3FC] hover:underline cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <span>Open Syllabus</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="space-y-3.5">
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
                          <span className="font-semibold text-[#0F172A] dark:text-[#F1F5F9] truncate">
                            {sy.label}
                          </span>
                          <span className="text-[11px] font-mono tabular-nums text-[#475569] dark:text-[#94A3B8]">
                            ★ {sy.avgConfidence.toFixed(1)} · {sy.totalRevisions} rev
                          </span>
                        </div>
                        <span className="font-mono tabular-nums text-[#0F172A] dark:text-[#F1F5F9] shrink-0">
                          {sy.progressPercent}%{' '}
                          <span className="text-[#475569] dark:text-[#94A3B8]">
                            ({sy.mastered}M / {sy.revised}R / {sy.learning}L)
                          </span>
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-[#E6EEF5] dark:bg-[#172233] overflow-hidden flex">
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

              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono tabular-nums text-[#475569] dark:text-[#94A3B8] pt-2 border-t border-[#DCE6F0] dark:border-[#1E2C40]">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-xs bg-emerald-500" /> Mastered
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-xs bg-sky-500" /> Revised
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-xs bg-amber-400" /> Learning
                  </span>
                </div>
                <span>Not started: {syllabusDepth.notStarted}</span>
              </div>

              {examCountdowns.length > 0 && (
                <div className="pt-2 border-t border-[#DCE6F0] dark:border-[#1E2C40] space-y-1.5">
                  <div className="text-[11px] font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
                    Exam Pace Projection ({formatDurationLabel(rolling7.averageMinutes)}/day 7d avg)
                  </div>
                  <div className="divide-y divide-[#DCE6F0] dark:divide-[#1E2C40]">
                    {examCountdowns.slice(0, 3).map((ex) => {
                      const daysLeft = Math.max(0, daysUntilISO(ex.date));
                      const projectedHours = Math.round(
                        (daysLeft * rolling7.averageMinutes) / 60
                      );
                      return (
                        <div
                          key={ex.id}
                          className="flex items-center justify-between gap-2 py-1.5 text-[11px]"
                        >
                          <span className="truncate font-medium text-[#0F172A] dark:text-[#F1F5F9]">
                            {ex.title}
                          </span>
                          <span className="font-mono tabular-nums text-[#0284C7] dark:text-[#7DD3FC] shrink-0">
                            {daysLeft}d left · ~{projectedHours}h capacity
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>

            {/* Past Paper Mastery Rate Breakdown */}
            <section
              data-testid="past-paper-analytics-section"
              className="lg:col-span-6 rounded-2xl bg-white dark:bg-[#0F1724] border border-[#DCE6F0] dark:border-[#1E2C40] p-5 flex flex-col justify-between space-y-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="font-display text-base font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
                    Past Paper Mastery Rate
                  </h2>
                  <p className="text-xs text-[#475569] dark:text-[#94A3B8] tabular-nums">
                    {paperAnalytics.paperCount} {paperAnalytics.paperCount === 1 ? 'paper' : 'papers'} ·{' '}
                    {paperAnalytics.attemptedQuestions}/{paperAnalytics.totalQuestions} attempted
                  </p>
                </div>
                {onNavigateTab && (
                  <button
                    type="button"
                    onClick={() => onNavigateTab('papers')}
                    className="inline-flex items-center gap-1 text-xs font-medium text-[#0284C7] dark:text-[#7DD3FC] hover:underline cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <span>Open Papers</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {paperAnalytics.totalQuestions === 0 ? (
                <div className="rounded-xl border border-dashed border-[#DCE6F0] dark:border-[#1E2C40] p-6 text-center space-y-3">
                  <p className="text-xs text-[#475569] dark:text-[#94A3B8]">
                    Add past papers in Past Papers to track your mastery percentage, conceptual redo items, and silly errors.
                  </p>
                  {onNavigateTab && (
                    <button
                      type="button"
                      onClick={() => onNavigateTab('papers')}
                      className="px-3.5 py-1.5 rounded-lg bg-[#0284C7] hover:bg-[#0369A1] dark:bg-[#38BDF8] dark:hover:bg-[#7DD3FC] text-white dark:text-[#07131E] text-xs font-semibold cursor-pointer whitespace-nowrap"
                    >
                      Log Past Paper
                    </button>
                  )}
                </div>
              ) : (
                <>
                  {/* Stacked Question Status Bar */}
                  <div className="space-y-2">
                    <div className="h-2.5 w-full rounded-full bg-[#E6EEF5] dark:bg-[#172233] overflow-hidden flex">
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

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-mono tabular-nums text-[#475569] dark:text-[#94A3B8]">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-xs bg-emerald-500" />
                        Mastered:{' '}
                        <strong className="text-[#0F172A] dark:text-[#F1F5F9]">
                          {paperAnalytics.masteredCount}
                        </strong>
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-xs bg-amber-500" />
                        Silly:{' '}
                        <strong className="text-[#0F172A] dark:text-[#F1F5F9]">
                          {paperAnalytics.sillyCount}
                        </strong>
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-xs bg-rose-500" />
                        Redo:{' '}
                        <strong className="text-[#0F172A] dark:text-[#F1F5F9]">
                          {paperAnalytics.redoCount}
                        </strong>
                      </span>
                      <span>Unattempted: {paperAnalytics.unattemptedCount}</span>
                    </div>
                  </div>

                  {/* Per-Subject Paper Accuracy Rows (Clean divide-y instead of nested cards) */}
                  <div className="divide-y divide-[#DCE6F0] dark:divide-[#1E2C40] border-t border-[#DCE6F0] dark:border-[#1E2C40]">
                    {paperAnalytics.bySubject.map((sub) => (
                      <div
                        key={sub.subject}
                        className="py-2.5 flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="w-2.5 h-2.5 rounded-xs shrink-0"
                            style={{ backgroundColor: sub.color }}
                          />
                          <span className="font-semibold text-[#0F172A] dark:text-[#F1F5F9] truncate">
                            {sub.label}
                          </span>
                          <span className="font-mono tabular-nums text-[11px] text-[#475569] dark:text-[#94A3B8]">
                            · {sub.paperCount} {sub.paperCount === 1 ? 'paper' : 'papers'}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 font-mono tabular-nums shrink-0">
                          <span className="text-[11px] text-[#475569] dark:text-[#94A3B8]">
                            {sub.redo} redo · {sub.silly} silly
                          </span>
                          <span className="font-bold text-[#0F172A] dark:text-[#F1F5F9] w-10 text-right">
                            {sub.attempted > 0 ? `${sub.masteryRatePercent}%` : '—'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </section>
          </div>

          {/* Top Weak Syllabus Units with One-Click Action Buttons */}
          <section
            data-testid="weak-units-action-section"
            className="rounded-2xl bg-white dark:bg-[#0F1724] border border-[#DCE6F0] dark:border-[#1E2C40] p-5 space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-base font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
                  Top Weak Syllabus Units
                </h2>
                <p className="text-xs text-[#475569] dark:text-[#94A3B8] mt-0.5">
                  Prioritized from past paper redo/silly flags and low-confidence syllabus topics
                </p>
              </div>
              {weakSyllabusUnits.length > 0 && (
                <span className="text-xs font-mono tabular-nums text-[#475569] dark:text-[#94A3B8]">
                  Top {weakSyllabusUnits.length}{' '}
                  {weakSyllabusUnits.length === 1 ? 'priority' : 'priorities'}
                </span>
              )}
            </div>

            {weakSyllabusUnits.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#DCE6F0] dark:border-[#1E2C40] p-6 text-center space-y-3">
                <p className="text-xs text-[#475569] dark:text-[#94A3B8]">
                  No weak units flagged yet. Mark topic confidence in A/L Syllabus or tag mistakes in Past Papers to surface targeted one-click actions.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {onNavigateTab && (
                    <>
                      <button
                        type="button"
                        onClick={() => onNavigateTab('syllabus')}
                        className="px-3.5 py-1.5 rounded-lg border border-[#DCE6F0] dark:border-[#1E2C40] text-xs font-semibold text-[#0F172A] dark:text-[#F1F5F9] hover:bg-[#F4F8FB] dark:hover:bg-[#080E17] cursor-pointer whitespace-nowrap"
                      >
                        Rate Syllabus Topics
                      </button>
                      <button
                        type="button"
                        onClick={() => onNavigateTab('papers')}
                        className="px-3.5 py-1.5 rounded-lg bg-[#0284C7] hover:bg-[#0369A1] dark:bg-[#38BDF8] dark:hover:bg-[#7DD3FC] text-white dark:text-[#07131E] text-xs font-semibold cursor-pointer whitespace-nowrap"
                      >
                        Review Past Papers
                      </button>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <ul className="divide-y divide-[#DCE6F0] dark:divide-[#1E2C40]">
                {weakSyllabusUnits.map((unit) => {
                  const isAdded = Boolean(addedWeakKeys[unit.key]);
                  return (
                    <li
                      key={unit.key}
                      data-testid={`weak-unit-${unit.subject}`}
                      className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="w-2.5 h-2.5 rounded-xs shrink-0"
                            style={{ backgroundColor: unit.subjectColor }}
                          />
                          <span className="text-sm font-semibold text-[#0F172A] dark:text-[#F1F5F9] truncate">
                            {unit.title}
                          </span>
                        </div>
                        <div className="text-xs text-[#475569] dark:text-[#94A3B8] pl-4.5 font-mono tabular-nums">
                          <span style={{ color: unit.subjectColor }} className="font-sans font-medium">
                            {unit.subjectLabel}
                          </span>{' '}
                          · {unit.reason}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pl-4.5 sm:pl-0 shrink-0">
                        <button
                          type="button"
                          data-testid={`weak-unit-add-task-${unit.subject}`}
                          onClick={() =>
                            handleTriggerWeakTask(unit.key, unit.subject, unit.title, unit.reason)
                          }
                          className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer border transition-colors ${
                            isAdded
                              ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300'
                              : 'border-[#DCE6F0] dark:border-[#1E2C40] text-[#0F172A] dark:text-[#F1F5F9] hover:bg-[#F4F8FB] dark:hover:bg-[#080E17]'
                          }`}
                        >
                          {isAdded ? (
                            <>
                              <Check className="w-3.5 h-3.5" />
                              <span>Added to Tasks</span>
                            </>
                          ) : (
                            <>
                              <Plus className="w-3.5 h-3.5" />
                              <span>Revise Task</span>
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          data-testid={`weak-unit-focus-${unit.subject}`}
                          onClick={() => onStartWeakUnitFocus?.(unit.subject, unit.title)}
                          className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[#0284C7] hover:bg-[#0369A1] dark:bg-[#38BDF8] dark:hover:bg-[#7DD3FC] text-white dark:text-[#07131E] text-xs font-semibold inline-flex items-center gap-1.5 hover:opacity-90 whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <Play className="w-3.5 h-3.5" />
                          <span>Focus 45m</span>
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
};
