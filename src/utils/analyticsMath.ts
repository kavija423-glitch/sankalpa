import type {
  CalendarBlock,
  PaperSubjectKey,
  PastPaper,
  StudySession,
  SubjectConfig,
  SubjectKey,
  SyllabusUnit,
  TaskItem,
  TimerMode,
} from '../types/app';
import { getWeekDaysISO } from './calendarMath';
import { addDaysISO, toISODateLocal } from './nlpTaskParser';

export type AnalyticsTimeframe = 'week' | 'month' | 'year';

export type HeatmapIntensity = 0 | 1 | 2 | 3 | 4;

export interface DailyAggregate {
  date: string;
  totalMinutes: number;
  sessionCount: number;
  bySubject: Record<SubjectKey, number>;
  topSubject: SubjectKey | null;
  intensity: HeatmapIntensity;
}

export interface SubjectBreakdownItem {
  subject: SubjectKey;
  label: string;
  color: string;
  minutes: number;
  sessionCount: number;
  percentage: number;
}

export interface PeriodComparisonResult {
  currentMinutes: number;
  previousMinutes: number;
  sessionCount: number;
  percentChange: number | null; // null when both periods are 0 or previous is 0 with current > 0
  deltaLabel: string;
}

export interface StreakStats {
  currentStreak: number;
  bestStreak: number;
  qualifiedDaysCount: number;
}

export interface MonthlyHeatmapCell {
  date: string | null; // null for padding cells outside month
  dayNumber: number | null;
  inMonth: boolean;
  totalMinutes: number;
  sessionCount: number;
  topSubject: SubjectKey | null;
  intensity: HeatmapIntensity;
}

export interface YearlyHeatmapColumn {
  weekIndex: number;
  monthLabel: string | null;
  days: Array<{
    date: string;
    totalMinutes: number;
    sessionCount: number;
    topSubject: SubjectKey | null;
    intensity: HeatmapIntensity;
    inRange: boolean;
  }>;
}

export interface HourlyFocusDatum {
  hour: number;
  label: string;
  minutes: number;
  isPeak: boolean;
}

export interface DailyPlannedActualDatum {
  iso: string;
  label: string;
  plannedMinutes: number;
  actualMinutes: number;
}

export interface CoreSubjectBalanceAlert {
  subject: PaperSubjectKey;
  label: string;
  color: string;
  percentage: number;
  minutes: number;
}

export interface SyllabusSubjectSummary {
  subject: PaperSubjectKey;
  label: string;
  color: string;
  total: number;
  mastered: number;
  revisedOrMastered: number;
  percent: number;
}

export function getHeatmapIntensity(minutes: number): HeatmapIntensity {
  if (minutes <= 0) return 0;
  if (minutes < 30) return 1;
  if (minutes < 90) return 2;
  if (minutes < 180) return 3;
  return 4;
}

export function aggregateDailySessions(sessions: StudySession[]): Map<string, DailyAggregate> {
  const map = new Map<string, DailyAggregate>();

  for (const s of sessions) {
    if (s.deletedAt || s.durationMinutes <= 0) continue;
    let entry = map.get(s.date);
    if (!entry) {
      entry = {
        date: s.date,
        totalMinutes: 0,
        sessionCount: 0,
        bySubject: { maths: 0, physics: 0, ict: 0, general: 0 },
        topSubject: null,
        intensity: 0,
      };
      map.set(s.date, entry);
    }
    entry.totalMinutes += s.durationMinutes;
    entry.sessionCount += 1;
    entry.bySubject[s.subject] = (entry.bySubject[s.subject] ?? 0) + s.durationMinutes;
  }

  for (const entry of map.values()) {
    entry.intensity = getHeatmapIntensity(entry.totalMinutes);
    let bestSub: SubjectKey | null = null;
    let bestMins = 0;
    for (const key of Object.keys(entry.bySubject) as SubjectKey[]) {
      if (entry.bySubject[key] > bestMins) {
        bestMins = entry.bySubject[key];
        bestSub = key;
      }
    }
    entry.topSubject = bestSub;
  }

  return map;
}

/**
 * Computes current and best consecutive-day streaks where daily logged focus >= thresholdMinutes (default 30m).
 */
export function computeStreaks(
  dailyMap: Map<string, DailyAggregate>,
  todayISO: string,
  thresholdMinutes = 30
): StreakStats {
  const qualifiedDates = Array.from(dailyMap.values())
    .filter((d) => d.totalMinutes >= thresholdMinutes)
    .map((d) => d.date)
    .sort();

  const qualifiedSet = new Set(qualifiedDates);
  if (qualifiedSet.size === 0) {
    return { currentStreak: 0, bestStreak: 0, qualifiedDaysCount: 0 };
  }

  // Current streak ending today or yesterday
  let currentStreak = 0;
  let cursor = qualifiedSet.has(todayISO) ? todayISO : addDaysISO(todayISO, -1);
  while (qualifiedSet.has(cursor)) {
    currentStreak += 1;
    cursor = addDaysISO(cursor, -1);
  }

  // Best streak across all history
  let bestStreak = 0;
  let run = 0;
  let prevDate: string | null = null;
  for (const date of qualifiedDates) {
    if (prevDate && addDaysISO(prevDate, 1) === date) {
      run += 1;
    } else {
      run = 1;
    }
    if (run > bestStreak) {
      bestStreak = run;
    }
    prevDate = date;
  }

  return {
    currentStreak,
    bestStreak: Math.max(bestStreak, currentStreak),
    qualifiedDaysCount: qualifiedSet.size,
  };
}

/**
 * Rolling 7-day daily average minutes ([today-6 .. today] / 7).
 */
export function computeRolling7DayAverage(
  dailyMap: Map<string, DailyAggregate>,
  todayISO: string
): { averageMinutes: number; total7DayMinutes: number } {
  let total = 0;
  for (let i = 0; i < 7; i++) {
    const iso = addDaysISO(todayISO, -i);
    total += dailyMap.get(iso)?.totalMinutes ?? 0;
  }
  return {
    averageMinutes: Math.round(total / 7),
    total7DayMinutes: total,
  };
}

/**
 * % of scheduled block duration actually completed (via block.completed or logged sessions linked to blockId).
 */
export function computePlanExecutionAccuracy(
  blocks: CalendarBlock[],
  sessions: StudySession[],
  todayISO: string
): {
  accuracyPercent: number;
  completedMinutes: number;
  scheduledMinutes: number;
  blockCount: number;
} {
  const activeBlocks = blocks.filter((b) => !b.deletedAt);
  // Prefer blocks up to today so future planned blocks don't artificially deflate accuracy;
  // if only future blocks exist, inspect all active blocks.
  const pastAndToday = activeBlocks.filter((b) => b.date <= todayISO);
  const scopedBlocks = pastAndToday.length > 0 ? pastAndToday : activeBlocks;

  if (scopedBlocks.length === 0) {
    return { accuracyPercent: 0, completedMinutes: 0, scheduledMinutes: 0, blockCount: 0 };
  }

  const loggedByBlock = new Map<string, number>();
  for (const s of sessions) {
    if (!s.deletedAt && s.blockId && s.durationMinutes > 0) {
      loggedByBlock.set(s.blockId, (loggedByBlock.get(s.blockId) ?? 0) + s.durationMinutes);
    }
  }

  let scheduledMinutes = 0;
  let completedMinutes = 0;
  for (const b of scopedBlocks) {
    scheduledMinutes += b.durationMinutes;
    if (b.completed) {
      completedMinutes += b.durationMinutes;
    } else {
      const logged = loggedByBlock.get(b.id) ?? 0;
      completedMinutes += Math.min(b.durationMinutes, logged);
    }
  }

  const accuracyPercent =
    scheduledMinutes > 0
      ? Math.min(100, Math.round((completedMinutes / scheduledMinutes) * 100))
      : 0;

  return {
    accuracyPercent,
    completedMinutes,
    scheduledMinutes,
    blockCount: scopedBlocks.length,
  };
}

export interface TodayFocusStats {
  todayMinutes: number;
  todaySessions: number;
  yesterdayMinutes: number;
  deltaFromYesterday: number;
  goalPercent: number;
  goalBarPercent: number;
  remainingMinutes: number;
  extraMinutes: number;
}

export function computeTodayFocusStats(
  dailyMap: Map<string, DailyAggregate>,
  todayISO: string,
  dailyGoalMinutes: number
): TodayFocusStats {
  const todayAgg = dailyMap.get(todayISO);
  const yesterdayISO = addDaysISO(todayISO, -1);
  const yesterdayMinutes = dailyMap.get(yesterdayISO)?.totalMinutes ?? 0;
  const todayMinutes = todayAgg?.totalMinutes ?? 0;
  const todaySessions = todayAgg?.sessionCount ?? 0;
  const safeGoal = Math.max(1, dailyGoalMinutes);
  const goalPercent = Math.round((todayMinutes / safeGoal) * 100);

  return {
    todayMinutes,
    todaySessions,
    yesterdayMinutes,
    deltaFromYesterday: todayMinutes - yesterdayMinutes,
    goalPercent,
    goalBarPercent: Math.min(100, goalPercent),
    remainingMinutes: Math.max(0, safeGoal - todayMinutes),
    extraMinutes: Math.max(0, todayMinutes - safeGoal),
  };
}

export interface DailyPlanAccuracyResult {
  accuracyPercent: number;
  completedMinutes: number;
  scheduledMinutes: number;
  completedBlocksCount: number;
  blockCount: number;
}

export function computeDailyPlanExecutionAccuracy(
  blocks: CalendarBlock[],
  sessions: StudySession[],
  dateISO: string
): DailyPlanAccuracyResult {
  const todayBlocks = blocks.filter((b) => !b.deletedAt && b.date === dateISO);
  if (todayBlocks.length === 0) {
    return {
      accuracyPercent: 0,
      completedMinutes: 0,
      scheduledMinutes: 0,
      completedBlocksCount: 0,
      blockCount: 0,
    };
  }

  const loggedByBlock = new Map<string, number>();
  for (const s of sessions) {
    if (!s.deletedAt && s.blockId && s.durationMinutes > 0) {
      loggedByBlock.set(s.blockId, (loggedByBlock.get(s.blockId) ?? 0) + s.durationMinutes);
    }
  }

  let scheduledMinutes = 0;
  let completedMinutes = 0;
  let completedBlocksCount = 0;
  for (const b of todayBlocks) {
    scheduledMinutes += b.durationMinutes;
    if (b.completed) {
      completedMinutes += b.durationMinutes;
      completedBlocksCount += 1;
    } else {
      const logged = loggedByBlock.get(b.id) ?? 0;
      completedMinutes += Math.min(b.durationMinutes, logged);
      if (logged >= b.durationMinutes) {
        completedBlocksCount += 1;
      }
    }
  }

  const accuracyPercent =
    scheduledMinutes > 0
      ? Math.min(100, Math.round((completedMinutes / scheduledMinutes) * 100))
      : 0;

  return {
    accuracyPercent,
    completedMinutes,
    scheduledMinutes,
    completedBlocksCount,
    blockCount: todayBlocks.length,
  };
}

export interface DailyTaskProgressResult {
  dueTodayCount: number;
  completedDueTodayCount: number;
  completedTodayCount: number;
  completionPercent: number;
  pendingBacklogCount: number;
}

export function computeDailyTaskProgress(
  tasks: TaskItem[],
  todayISO: string
): DailyTaskProgressResult {
  const activeTasks = tasks.filter((t) => !t.deletedAt);
  const dueToday = activeTasks.filter((t) => t.dueDate === todayISO);
  const completedDueTodayCount = dueToday.filter((t) => t.completed).length;
  const completedTodayCount = activeTasks.filter(
    (t) =>
      t.completed &&
      t.completedAt !== null &&
      toISODateLocal(new Date(t.completedAt)) === todayISO
  ).length;
  const pendingBacklogCount = activeTasks.filter((t) => !t.completed).length;
  const completionPercent =
    dueToday.length > 0
      ? Math.round((completedDueTodayCount / dueToday.length) * 100)
      : completedTodayCount > 0
      ? 100
      : 0;

  return {
    dueTodayCount: dueToday.length,
    completedDueTodayCount,
    completedTodayCount,
    completionPercent,
    pendingBacklogCount,
  };
}

function getTimeframeBounds(
  timeframe: AnalyticsTimeframe,
  todayISO: string
): {
  start: string;
  end: string;
  prevStart: string;
  prevEnd: string;
} {
  if (timeframe === 'week') {
    const weekDays = getWeekDaysISO(todayISO);
    const start = weekDays[0];
    const end = weekDays[6];
    return {
      start,
      end,
      prevStart: addDaysISO(start, -7),
      prevEnd: addDaysISO(end, -7),
    };
  }

  const [yearNum, monthNum] = todayISO.split('-').map(Number);
  if (timeframe === 'month') {
    const start = `${String(yearNum).padStart(4, '0')}-${String(monthNum).padStart(2, '0')}-01`;
    const lastDay = new Date(yearNum, monthNum, 0).getDate();
    const end = `${String(yearNum).padStart(4, '0')}-${String(monthNum).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const prevMonthDate = new Date(yearNum, monthNum - 2, 1);
    const py = prevMonthDate.getFullYear();
    const pm = prevMonthDate.getMonth() + 1;
    const prevLastDay = new Date(py, pm, 0).getDate();
    return {
      start,
      end,
      prevStart: `${String(py).padStart(4, '0')}-${String(pm).padStart(2, '0')}-01`,
      prevEnd: `${String(py).padStart(4, '0')}-${String(pm).padStart(2, '0')}-${String(prevLastDay).padStart(2, '0')}`,
    };
  }

  // year
  const prevYear = yearNum - 1;
  return {
    start: `${String(yearNum).padStart(4, '0')}-01-01`,
    end: `${String(yearNum).padStart(4, '0')}-12-31`,
    prevStart: `${String(prevYear).padStart(4, '0')}-01-01`,
    prevEnd: `${String(prevYear).padStart(4, '0')}-12-31`,
  };
}

export function filterSessionsByTimeframe(
  sessions: StudySession[],
  timeframe: AnalyticsTimeframe,
  todayISO: string
): { current: StudySession[]; previous: StudySession[] } {
  const { start, end, prevStart, prevEnd } = getTimeframeBounds(timeframe, todayISO);
  return {
    current: sessions.filter((s) => !s.deletedAt && s.date >= start && s.date <= end && s.durationMinutes > 0),
    previous: sessions.filter((s) => !s.deletedAt && s.date >= prevStart && s.date <= prevEnd && s.durationMinutes > 0),
  };
}

export function computePeriodComparison(
  sessions: StudySession[],
  timeframe: AnalyticsTimeframe,
  todayISO: string
): PeriodComparisonResult {
  const { current, previous } = filterSessionsByTimeframe(sessions, timeframe, todayISO);
  const currentMinutes = current.reduce((acc, s) => acc + s.durationMinutes, 0);
  const previousMinutes = previous.reduce((acc, s) => acc + s.durationMinutes, 0);

  const periodNoun = timeframe === 'week' ? 'last week' : timeframe === 'month' ? 'last month' : 'last year';

  if (currentMinutes === 0 && previousMinutes === 0) {
    return {
      currentMinutes: 0,
      previousMinutes: 0,
      sessionCount: 0,
      percentChange: null,
      deltaLabel: `No activity vs ${periodNoun}`,
    };
  }

  if (previousMinutes === 0) {
    return {
      currentMinutes,
      previousMinutes: 0,
      sessionCount: current.length,
      percentChange: 100,
      deltaLabel: `+100% vs ${periodNoun}`,
    };
  }

  const pct = Math.round(((currentMinutes - previousMinutes) / previousMinutes) * 100);
  const sign = pct > 0 ? '+' : '';
  return {
    currentMinutes,
    previousMinutes,
    sessionCount: current.length,
    percentChange: pct,
    deltaLabel: `${sign}${pct}% vs ${periodNoun}`,
  };
}

export function computeSubjectBreakdown(
  sessions: StudySession[],
  subjects: Record<SubjectKey, SubjectConfig>,
  timeframe: AnalyticsTimeframe,
  todayISO: string
): {
  totalMinutes: number;
  items: SubjectBreakdownItem[];
} {
  const { current } = filterSessionsByTimeframe(sessions, timeframe, todayISO);
  const totals: Record<SubjectKey, { minutes: number; count: number }> = {
    physics: { minutes: 0, count: 0 },
    maths: { minutes: 0, count: 0 },
    ict: { minutes: 0, count: 0 },
    general: { minutes: 0, count: 0 },
  };

  let totalMinutes = 0;
  for (const s of current) {
    const slot = totals[s.subject] ?? totals.general;
    slot.minutes += s.durationMinutes;
    slot.count += 1;
    totalMinutes += s.durationMinutes;
  }

  const items: SubjectBreakdownItem[] = (Object.values(subjects) as SubjectConfig[]).map((sub) => {
    const bucket = totals[sub.id] ?? { minutes: 0, count: 0 };
    const percentage = totalMinutes > 0 ? Math.round((bucket.minutes / totalMinutes) * 100) : 0;
    return {
      subject: sub.id,
      label: sub.label,
      color: sub.color,
      minutes: bucket.minutes,
      sessionCount: bucket.count,
      percentage,
    };
  });

  // Sort highest focus first (keeping deterministic order on ties)
  items.sort((a, b) => b.minutes - a.minutes);

  return { totalMinutes, items };
}

/**
 * Flags core A/L subjects (Physics, Combined Maths, ICT) below 20% of total weekly focus time.
 */
export function computeWeeklySubjectBalanceAlerts(
  sessions: StudySession[],
  subjects: Record<SubjectKey, SubjectConfig>,
  todayISO: string,
  minSharePercent = 20
): CoreSubjectBalanceAlert[] {
  const { totalMinutes, items } = computeSubjectBreakdown(sessions, subjects, 'week', todayISO);
  if (totalMinutes <= 0) return [];

  const coreKeys: PaperSubjectKey[] = ['physics', 'maths', 'ict'];
  return coreKeys
    .map((key) => items.find((item) => item.subject === key))
    .filter((item): item is SubjectBreakdownItem => Boolean(item))
    .filter((item) => item.percentage < minSharePercent)
    .map((item) => ({
      subject: item.subject as PaperSubjectKey,
      label: item.label,
      color: item.color,
      percentage: item.percentage,
      minutes: item.minutes,
    }));
}

/**
 * Builds a Monday-first calendar grid for a given year and 1-based month.
 */
export function buildMonthlyHeatmapGrid(
  dailyMap: Map<string, DailyAggregate>,
  year: number,
  month1Based: number
): MonthlyHeatmapCell[] {
  const daysInMonth = new Date(year, month1Based, 0).getDate();
  const firstDayOfWeek = new Date(year, month1Based - 1, 1).getDay(); // 0=Sun..6=Sat
  const leadingEmpty = (firstDayOfWeek + 6) % 7; // Mon=0..Sun=6

  const cells: MonthlyHeatmapCell[] = [];
  for (let i = 0; i < leadingEmpty; i++) {
    cells.push({
      date: null,
      dayNumber: null,
      inMonth: false,
      totalMinutes: 0,
      sessionCount: 0,
      topSubject: null,
      intensity: 0,
    });
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${String(year).padStart(4, '0')}-${String(month1Based).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const agg = dailyMap.get(iso);
    cells.push({
      date: iso,
      dayNumber: d,
      inMonth: true,
      totalMinutes: agg?.totalMinutes ?? 0,
      sessionCount: agg?.sessionCount ?? 0,
      topSubject: agg?.topSubject ?? null,
      intensity: agg?.intensity ?? 0,
    });
  }

  while (cells.length % 7 !== 0) {
    cells.push({
      date: null,
      dayNumber: null,
      inMonth: false,
      totalMinutes: 0,
      sessionCount: 0,
      topSubject: null,
      intensity: 0,
    });
  }

  return cells;
}

/**
 * Builds a GitHub-style 52/53-week x 7-day rolling 365-day contribution matrix ending on todayISO.
 */
export function buildYearlyHeatmapColumns(
  dailyMap: Map<string, DailyAggregate>,
  todayISO: string
): YearlyHeatmapColumn[] {
  const rangeStart = addDaysISO(todayISO, -364); // 365 days inclusive
  const [sy, sm, sd] = rangeStart.split('-').map(Number);
  const startDt = new Date(sy, (sm || 1) - 1, sd || 1);
  const startMonOffset = (startDt.getDay() + 6) % 7;
  const gridStart = addDaysISO(rangeStart, -startMonOffset);

  const columns: YearlyHeatmapColumn[] = [];
  let cursor = gridStart;
  let weekIdx = 0;
  let lastLabeledMonth = '';
  let lastLabeledWeek = -3;

  while (cursor <= todayISO || weekIdx < 52) {
    const days: YearlyHeatmapColumn['days'] = [];
    let monthLabel: string | null = null;

    for (let dow = 0; dow < 7; dow++) {
      const iso = cursor;
      const inRange = iso >= rangeStart && iso <= todayISO;
      const agg = inRange ? dailyMap.get(iso) : undefined;
      const ym = iso.slice(0, 7);
      if (inRange && (iso.endsWith('-01') || (dow === 0 && ym !== lastLabeledMonth))) {
        const [yy, mm, dd] = iso.split('-').map(Number);
        const label = new Date(yy, (mm || 1) - 1, dd || 1).toLocaleDateString('en-US', {
          month: 'short',
        });
        if (ym !== lastLabeledMonth && weekIdx - lastLabeledWeek >= 3) {
          monthLabel = label;
          lastLabeledMonth = ym;
          lastLabeledWeek = weekIdx;
        }
      }

      days.push({
        date: iso,
        totalMinutes: agg?.totalMinutes ?? 0,
        sessionCount: agg?.sessionCount ?? 0,
        topSubject: agg?.topSubject ?? null,
        intensity: agg?.intensity ?? 0,
        inRange,
      });

      cursor = addDaysISO(cursor, 1);
    }

    columns.push({ weekIndex: weekIdx, monthLabel, days });
    weekIdx += 1;
    if (cursor > todayISO && weekIdx >= 52) break;
  }

  return columns;
}

/**
 * Distributes session minutes across 24 local hours (00:00..23:00) to reveal peak focus hours.
 */
export function computePeakFocusHours(sessions: StudySession[]): HourlyFocusDatum[] {
  const hourBuckets = Array.from({ length: 24 }, () => 0);

  for (const s of sessions) {
    if (s.deletedAt || s.durationMinutes <= 0) continue;
    let remaining = s.durationMinutes;
    let cursorMs = s.startTimestamp;

    // Walk hour boundaries cleanly
    while (remaining > 0) {
      const dt = new Date(cursorMs);
      const hour = dt.getHours();
      const minuteInHour = dt.getMinutes();
      const minsLeftInHour = 60 - minuteInHour;
      const slice = Math.min(remaining, minsLeftInHour);
      hourBuckets[hour] += slice;
      remaining -= slice;
      cursorMs += slice * 60000;
    }
  }

  const maxMinutes = Math.max(0, ...hourBuckets);
  return hourBuckets.map((minutes, hour) => ({
    hour,
    label: `${String(hour).padStart(2, '0')}:00`,
    minutes,
    isPeak: maxMinutes > 0 && minutes === maxMinutes,
  }));
}

export function computeLast7DaysPlannedVsActual(
  blocks: CalendarBlock[],
  dailyMap: Map<string, DailyAggregate>,
  todayISO: string
): DailyPlannedActualDatum[] {
  const activeBlocks = blocks.filter((b) => !b.deletedAt);
  const days = Array.from({ length: 7 }, (_, i) => addDaysISO(todayISO, i - 6));

  return days.map((iso) => {
    const plannedMinutes = activeBlocks
      .filter((b) => b.date === iso)
      .reduce((acc, b) => acc + b.durationMinutes, 0);
    const actualMinutes = dailyMap.get(iso)?.totalMinutes ?? 0;
    const [y, m, d] = iso.split('-').map(Number);
    const label = new Date(y, (m || 1) - 1, d || 1).toLocaleDateString('en-US', {
      weekday: 'short',
    });
    return { iso, label, plannedMinutes, actualMinutes };
  });
}

export function computeSyllabusMasterySummary(
  syllabus: SyllabusUnit[],
  subjects: Record<SubjectKey, SubjectConfig>
): SyllabusSubjectSummary[] {
  const keys: PaperSubjectKey[] = ['physics', 'maths', 'ict'];
  return keys.map((key) => {
    const subtopics = syllabus.filter((u) => u.subject === key).flatMap((u) => u.subtopics);
    const total = subtopics.length;
    const mastered = subtopics.filter((s) => s.mastery === 'mastered').length;
    const revisedOrMastered = subtopics.filter(
      (s) => s.mastery === 'mastered' || s.mastery === 'revised'
    ).length;
    const percent = total > 0 ? Math.round((mastered / total) * 100) : 0;
    return {
      subject: key,
      label: subjects[key]?.label ?? key,
      color: subjects[key]?.color ?? '#6366F1',
      total,
      mastered,
      revisedOrMastered,
      percent,
    };
  });
}

export interface ModeBreakdownItem {
  mode: TimerMode;
  label: string;
  minutes: number;
  count: number;
  percentage: number;
  avgRating: number;
}

export interface SessionQualityAndRhythmResult {
  totalSessions: number;
  avgRating: number;
  avgSessionMinutes: number;
  longestSessionMinutes: number;
  deepSessionsCount: number;
  liveMinutes: number;
  manualMinutes: number;
  liveCount: number;
  manualCount: number;
  modeBreakdown: ModeBreakdownItem[];
}

const MODE_LABELS: Record<TimerMode, string> = {
  pomodoro_25: 'Pomodoro 25m',
  pomodoro_50: 'Pomodoro 50m',
  flowtime: 'Flowtime',
  scheduled: 'Scheduled Block',
  manual: 'Manual Log',
};

export function computeSessionQualityAndRhythm(
  sessions: StudySession[]
): SessionQualityAndRhythmResult {
  const active = sessions.filter((s) => !s.deletedAt && s.durationMinutes > 0);
  if (active.length === 0) {
    return {
      totalSessions: 0,
      avgRating: 0,
      avgSessionMinutes: 0,
      longestSessionMinutes: 0,
      deepSessionsCount: 0,
      liveMinutes: 0,
      manualMinutes: 0,
      liveCount: 0,
      manualCount: 0,
      modeBreakdown: [],
    };
  }

  let ratingSum = 0;
  let totalMinutes = 0;
  let longestSessionMinutes = 0;
  let deepSessionsCount = 0;
  let liveMinutes = 0;
  let manualMinutes = 0;
  let liveCount = 0;
  let manualCount = 0;

  const modeBuckets = new Map<
    TimerMode,
    { minutes: number; count: number; ratingSum: number }
  >();

  for (const s of active) {
    const mins = s.durationMinutes;
    const rating = Math.max(1, Math.min(5, s.rating || 0));
    ratingSum += rating;
    totalMinutes += mins;
    if (mins > longestSessionMinutes) longestSessionMinutes = mins;
    if (mins >= 45) deepSessionsCount += 1;

    if (s.isManual || s.mode === 'manual') {
      manualMinutes += mins;
      manualCount += 1;
    } else {
      liveMinutes += mins;
      liveCount += 1;
    }

    const modeKey: TimerMode = s.isManual ? 'manual' : s.mode;
    const cur = modeBuckets.get(modeKey) ?? { minutes: 0, count: 0, ratingSum: 0 };
    cur.minutes += mins;
    cur.count += 1;
    cur.ratingSum += rating;
    modeBuckets.set(modeKey, cur);
  }

  const modeBreakdown: ModeBreakdownItem[] = Array.from(modeBuckets.entries())
    .map(([mode, bucket]) => ({
      mode,
      label: MODE_LABELS[mode] ?? mode,
      minutes: bucket.minutes,
      count: bucket.count,
      percentage: totalMinutes > 0 ? Math.round((bucket.minutes / totalMinutes) * 100) : 0,
      avgRating: bucket.count > 0 ? Math.round((bucket.ratingSum / bucket.count) * 10) / 10 : 0,
    }))
    .sort((a, b) => b.minutes - a.minutes);

  return {
    totalSessions: active.length,
    avgRating: Math.round((ratingSum / active.length) * 10) / 10,
    avgSessionMinutes: Math.round(totalMinutes / active.length),
    longestSessionMinutes,
    deepSessionsCount,
    liveMinutes,
    manualMinutes,
    liveCount,
    manualCount,
    modeBreakdown,
  };
}

export interface WeekdayRhythmDatum {
  weekdayIndex: number; // 0=Mon..6=Sun
  label: string;
  totalMinutes: number;
  sessionCount: number;
  activeDays: number;
  avgMinutesPerActiveDay: number;
  isBest: boolean;
}

const WEEKDAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function computeWeekdayRhythm(sessions: StudySession[]): WeekdayRhythmDatum[] {
  const active = sessions.filter((s) => !s.deletedAt && s.durationMinutes > 0);
  const buckets = WEEKDAY_NAMES.map((label, idx) => ({
    weekdayIndex: idx,
    label,
    totalMinutes: 0,
    sessionCount: 0,
    dates: new Set<string>(),
  }));

  for (const s of active) {
    const [y, m, d] = s.date.split('-').map(Number);
    if (!y || !m || !d) continue;
    const jsDay = new Date(y, m - 1, d).getDay(); // 0=Sun..6=Sat
    const monIdx = (jsDay + 6) % 7;
    buckets[monIdx].totalMinutes += s.durationMinutes;
    buckets[monIdx].sessionCount += 1;
    buckets[monIdx].dates.add(s.date);
  }

  const maxMinutes = Math.max(0, ...buckets.map((b) => b.totalMinutes));
  return buckets.map((b) => ({
    weekdayIndex: b.weekdayIndex,
    label: b.label,
    totalMinutes: b.totalMinutes,
    sessionCount: b.sessionCount,
    activeDays: b.dates.size,
    avgMinutesPerActiveDay: b.dates.size > 0 ? Math.round(b.totalMinutes / b.dates.size) : 0,
    isBest: maxMinutes > 0 && b.totalMinutes === maxMinutes,
  }));
}

export interface GoalConsistencyAndBestDayResult {
  goalHitDays30: number;
  activeDays30: number;
  goalHitPercent30: number;
  bestDayDate: string | null;
  bestDayMinutes: number;
}

export function computeGoalConsistencyAndBestDay(
  dailyMap: Map<string, DailyAggregate>,
  todayISO: string,
  dailyGoalMinutes: number
): GoalConsistencyAndBestDayResult {
  const safeGoal = Math.max(1, dailyGoalMinutes);
  let goalHitDays30 = 0;
  let activeDays30 = 0;
  for (let i = 0; i < 30; i++) {
    const iso = addDaysISO(todayISO, -i);
    const mins = dailyMap.get(iso)?.totalMinutes ?? 0;
    if (mins > 0) activeDays30 += 1;
    if (mins >= safeGoal) goalHitDays30 += 1;
  }

  let bestDayDate: string | null = null;
  let bestDayMinutes = 0;
  for (const agg of dailyMap.values()) {
    if (
      agg.totalMinutes > bestDayMinutes ||
      (agg.totalMinutes === bestDayMinutes && bestDayDate !== null && agg.date > bestDayDate)
    ) {
      bestDayMinutes = agg.totalMinutes;
      bestDayDate = agg.date;
    }
  }

  return {
    goalHitDays30,
    activeDays30,
    goalHitPercent30: Math.round((goalHitDays30 / 30) * 100),
    bestDayDate,
    bestDayMinutes,
  };
}

export interface TaskBacklogStatsResult {
  totalCount: number;
  completedCount: number;
  openCount: number;
  completionRatePercent: number;
  overdueCount: number;
  highPriorityOpenCount: number;
  backlogMinutesRemaining: number;
}

export function computeTaskBacklogStats(
  tasks: TaskItem[],
  todayISO: string
): TaskBacklogStatsResult {
  const active = tasks.filter((t) => !t.deletedAt);
  const completedCount = active.filter((t) => t.completed).length;
  const openTasks = active.filter((t) => !t.completed);
  const overdueCount = openTasks.filter((t) => t.dueDate && t.dueDate < todayISO).length;
  const highPriorityOpenCount = openTasks.filter((t) => t.priority === 'high').length;
  const backlogMinutesRemaining = openTasks.reduce(
    (acc, t) => acc + Math.max(0, t.durationMinutes),
    0
  );

  return {
    totalCount: active.length,
    completedCount,
    openCount: openTasks.length,
    completionRatePercent:
      active.length > 0 ? Math.round((completedCount / active.length) * 100) : 0,
    overdueCount,
    highPriorityOpenCount,
    backlogMinutesRemaining,
  };
}

export interface SubjectPaperAnalyticsItem {
  subject: PaperSubjectKey;
  label: string;
  color: string;
  paperCount: number;
  totalQuestions: number;
  attempted: number;
  mastered: number;
  redo: number;
  silly: number;
  masteryRatePercent: number;
}

export interface WeakUnitTagItem {
  unitTag: string;
  subject: PaperSubjectKey;
  redoCount: number;
  sillyCount: number;
  totalIssues: number;
}

export interface PastPaperAnalyticsResult {
  paperCount: number;
  totalQuestions: number;
  attemptedQuestions: number;
  masteredCount: number;
  redoCount: number;
  sillyCount: number;
  unattemptedCount: number;
  masteryRatePercent: number;
  bySubject: SubjectPaperAnalyticsItem[];
  topWeakUnits: WeakUnitTagItem[];
}

export function computePastPaperAnalytics(
  papers: PastPaper[],
  subjects: Record<SubjectKey, SubjectConfig>
): PastPaperAnalyticsResult {
  let totalQuestions = 0;
  let masteredCount = 0;
  let redoCount = 0;
  let sillyCount = 0;
  let unattemptedCount = 0;

  const subjectKeys: PaperSubjectKey[] = ['physics', 'maths', 'ict'];
  const subBuckets: Record<PaperSubjectKey, SubjectPaperAnalyticsItem> = {
    physics: {
      subject: 'physics',
      label: subjects.physics?.label ?? 'Physics',
      color: subjects.physics?.color ?? '#D97706',
      paperCount: 0,
      totalQuestions: 0,
      attempted: 0,
      mastered: 0,
      redo: 0,
      silly: 0,
      masteryRatePercent: 0,
    },
    maths: {
      subject: 'maths',
      label: subjects.maths?.label ?? 'Combined Maths',
      color: subjects.maths?.color ?? '#0284C7',
      paperCount: 0,
      totalQuestions: 0,
      attempted: 0,
      mastered: 0,
      redo: 0,
      silly: 0,
      masteryRatePercent: 0,
    },
    ict: {
      subject: 'ict',
      label: subjects.ict?.label ?? 'ICT',
      color: subjects.ict?.color ?? '#059669',
      paperCount: 0,
      totalQuestions: 0,
      attempted: 0,
      mastered: 0,
      redo: 0,
      silly: 0,
      masteryRatePercent: 0,
    },
  };

  const unitIssuesMap = new Map<string, WeakUnitTagItem>();

  for (const paper of papers) {
    const subBucket = subBuckets[paper.subject];
    if (subBucket) subBucket.paperCount += 1;

    for (const q of paper.questions) {
      totalQuestions += 1;
      if (subBucket) subBucket.totalQuestions += 1;

      if (q.status === 'mastered') {
        masteredCount += 1;
        if (subBucket) {
          subBucket.attempted += 1;
          subBucket.mastered += 1;
        }
      } else if (q.status === 'redo') {
        redoCount += 1;
        if (subBucket) {
          subBucket.attempted += 1;
          subBucket.redo += 1;
        }
      } else if (q.status === 'silly') {
        sillyCount += 1;
        if (subBucket) {
          subBucket.attempted += 1;
          subBucket.silly += 1;
        }
      } else {
        unattemptedCount += 1;
      }

      if ((q.status === 'redo' || q.status === 'silly') && q.unitTag.trim()) {
        const tag = q.unitTag.trim();
        const key = `${paper.subject}::${tag.toLowerCase()}`;
        const existing = unitIssuesMap.get(key) ?? {
          unitTag: tag,
          subject: paper.subject,
          redoCount: 0,
          sillyCount: 0,
          totalIssues: 0,
        };
        if (q.status === 'redo') existing.redoCount += 1;
        else existing.sillyCount += 1;
        existing.totalIssues += 1;
        unitIssuesMap.set(key, existing);
      }
    }
  }

  const bySubject = subjectKeys.map((k) => {
    const item = subBuckets[k];
    return {
      ...item,
      masteryRatePercent:
        item.attempted > 0 ? Math.round((item.mastered / item.attempted) * 100) : 0,
    };
  });

  const attemptedQuestions = masteredCount + redoCount + sillyCount;
  const topWeakUnits = Array.from(unitIssuesMap.values())
    .sort((a, b) => b.totalIssues - a.totalIssues || b.redoCount - a.redoCount)
    .slice(0, 4);

  return {
    paperCount: papers.length,
    totalQuestions,
    attemptedQuestions,
    masteredCount,
    redoCount,
    sillyCount,
    unattemptedCount,
    masteryRatePercent:
      attemptedQuestions > 0 ? Math.round((masteredCount / attemptedQuestions) * 100) : 0,
    bySubject,
    topWeakUnits,
  };
}

export interface SyllabusSubjectDepthItem {
  subject: PaperSubjectKey;
  label: string;
  color: string;
  total: number;
  notStarted: number;
  learning: number;
  revised: number;
  mastered: number;
  totalRevisions: number;
  avgConfidence: number;
  progressPercent: number;
}

export interface SyllabusDepthStatsResult {
  totalSubtopics: number;
  notStarted: number;
  learning: number;
  revised: number;
  mastered: number;
  totalRevisions: number;
  avgConfidence: number;
  lowConfidenceCount: number;
  overallProgressPercent: number;
  bySubject: SyllabusSubjectDepthItem[];
}

export function computeSyllabusDepthStats(
  syllabus: SyllabusUnit[],
  subjects: Record<SubjectKey, SubjectConfig>
): SyllabusDepthStatsResult {
  const keys: PaperSubjectKey[] = ['physics', 'maths', 'ict'];
  let totalSubtopics = 0;
  let notStarted = 0;
  let learning = 0;
  let revised = 0;
  let mastered = 0;
  let totalRevisions = 0;
  let confidenceSum = 0;
  let lowConfidenceCount = 0;

  const bySubject: SyllabusSubjectDepthItem[] = keys.map((key) => {
    const subs = syllabus.filter((u) => u.subject === key).flatMap((u) => u.subtopics);
    let sNotStarted = 0;
    let sLearning = 0;
    let sRevised = 0;
    let sMastered = 0;
    let sRevisions = 0;
    let sConfSum = 0;

    for (const st of subs) {
      totalSubtopics += 1;
      const conf = Math.max(1, Math.min(5, st.confidence || 1));
      sConfSum += conf;
      confidenceSum += conf;
      const revs = Math.max(0, st.revisionCount || 0);
      sRevisions += revs;
      totalRevisions += revs;

      if (st.mastery === 'mastered') {
        sMastered += 1;
        mastered += 1;
      } else if (st.mastery === 'revised') {
        sRevised += 1;
        revised += 1;
      } else if (st.mastery === 'learning') {
        sLearning += 1;
        learning += 1;
      } else {
        sNotStarted += 1;
        notStarted += 1;
      }

      if (st.mastery !== 'not_started' && conf <= 2) {
        lowConfidenceCount += 1;
      }
    }

    const total = subs.length;
    return {
      subject: key,
      label: subjects[key]?.label ?? key,
      color: subjects[key]?.color ?? '#6366F1',
      total,
      notStarted: sNotStarted,
      learning: sLearning,
      revised: sRevised,
      mastered: sMastered,
      totalRevisions: sRevisions,
      avgConfidence: total > 0 ? Math.round((sConfSum / total) * 10) / 10 : 0,
      progressPercent:
        total > 0 ? Math.round(((sRevised + sMastered) / total) * 100) : 0,
    };
  });

  return {
    totalSubtopics,
    notStarted,
    learning,
    revised,
    mastered,
    totalRevisions,
    avgConfidence: totalSubtopics > 0 ? Math.round((confidenceSum / totalSubtopics) * 10) / 10 : 0,
    lowConfidenceCount,
    overallProgressPercent:
      totalSubtopics > 0 ? Math.round(((revised + mastered) / totalSubtopics) * 100) : 0,
    bySubject,
  };
}
