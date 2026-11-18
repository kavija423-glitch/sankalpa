import React, { useMemo } from 'react';
import { Flame, Target, Clock, Award } from 'lucide-react';
import type {
  CalendarBlock,
  PastPaper,
  StudySession,
  SubjectConfig,
  SubjectKey,
} from '../types/app';
import { formatDurationLabel } from '../utils/calendarMath';
import { addDaysISO, toISODateLocal } from '../utils/nlpTaskParser';
import { extractRedoQueue } from '../utils/paperGenerator';

interface AnalyticsViewProps {
  blocks: CalendarBlock[];
  sessions: StudySession[];
  papers: PastPaper[];
  subjects: Record<SubjectKey, SubjectConfig>;
  dailyGoalMinutes: number;
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({
  blocks,
  sessions,
  papers,
  subjects,
  dailyGoalMinutes,
}) => {
  const todayISO = toISODateLocal(new Date());

  const stats = useMemo(() => {
    const todayMinutes = sessions
      .filter((s) => s.date === todayISO)
      .reduce((acc, s) => acc + s.durationMinutes, 0);

    const totalMinutes = sessions.reduce((acc, s) => acc + s.durationMinutes, 0);

    // Consecutive day streak ending today or yesterday
    const activeDates = new Set(sessions.filter((s) => s.durationMinutes > 0).map((s) => s.date));
    let streak = 0;
    let cursor = activeDates.has(todayISO) ? todayISO : addDaysISO(todayISO, -1);
    while (activeDates.has(cursor)) {
      streak++;
      cursor = addDaysISO(cursor, -1);
    }

    // Subject distribution
    const bySubject: Record<SubjectKey, number> = {
      physics: 0,
      maths: 0,
      ict: 0,
      general: 0,
    };
    for (const s of sessions) {
      bySubject[s.subject] = (bySubject[s.subject] ?? 0) + s.durationMinutes;
    }

    // Last 7 days Planned vs Actual
    const last7Days = Array.from({ length: 7 }, (_, i) => addDaysISO(todayISO, i - 6));
    const trend = last7Days.map((iso) => {
      const planned = blocks
        .filter((b) => b.date === iso)
        .reduce((acc, b) => acc + b.durationMinutes, 0);
      const actual = sessions
        .filter((s) => s.date === iso)
        .reduce((acc, s) => acc + s.durationMinutes, 0);
      const [y, m, d] = iso.split('-').map(Number);
      const label = new Date(y, (m || 1) - 1, d || 1).toLocaleDateString('en-US', {
        weekday: 'short',
      });
      return { iso, label, planned, actual };
    });

    const redoCount = extractRedoQueue(papers).length;

    return {
      todayMinutes,
      totalMinutes,
      streak,
      bySubject,
      trend,
      redoCount,
    };
  }, [blocks, sessions, papers, todayISO]);

  const goalPct = Math.min(100, Math.round((stats.todayMinutes / Math.max(1, dailyGoalMinutes)) * 100));
  const maxTrendMinutes = Math.max(
    60,
    ...stats.trend.flatMap((d) => [d.planned, d.actual])
  );

  return (
    <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 py-5 space-y-6">
      <div className="border-b border-[#E5E5E0] dark:border-[#232834] pb-4">
        <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#141413] dark:text-[#F3F4F6]">
          Focus Analytics
        </h1>
        <p className="text-sm text-[#5A5A55] dark:text-[#9CA3AF] mt-1">
          Study consistency, daily target progress, subject balance & planned-vs-actual adherence
        </p>
      </div>

      {/* Top 4 KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="rounded-2xl bg-white dark:bg-[#13161D] border border-[#E5E5E0] dark:border-[#232834] p-4">
          <div className="flex items-center justify-between text-xs text-[#5A5A55] dark:text-[#9CA3AF]">
            <span>Study Streak</span>
            <Flame className="w-4 h-4 text-amber-500" />
          </div>
          <div className="font-mono tabular-nums text-2xl font-bold text-[#141413] dark:text-[#F3F4F6] mt-2">
            {stats.streak} {stats.streak === 1 ? 'day' : 'days'}
          </div>
        </div>

        <div className="rounded-2xl bg-white dark:bg-[#13161D] border border-[#E5E5E0] dark:border-[#232834] p-4">
          <div className="flex items-center justify-between text-xs text-[#5A5A55] dark:text-[#9CA3AF]">
            <span>Today’s Goal</span>
            <Target className="w-4 h-4 text-[#4338CA] dark:text-[#818CF8]" />
          </div>
          <div className="font-mono tabular-nums text-2xl font-bold text-[#141413] dark:text-[#F3F4F6] mt-2">
            {goalPct}%
          </div>
          <div className="text-[11px] font-mono tabular-nums text-[#5A5A55] dark:text-[#9CA3AF] mt-0.5">
            {formatDurationLabel(stats.todayMinutes)} / {formatDurationLabel(dailyGoalMinutes)}
          </div>
        </div>

        <div className="rounded-2xl bg-white dark:bg-[#13161D] border border-[#E5E5E0] dark:border-[#232834] p-4">
          <div className="flex items-center justify-between text-xs text-[#5A5A55] dark:text-[#9CA3AF]">
            <span>Total Logged</span>
            <Clock className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="font-mono tabular-nums text-2xl font-bold text-[#141413] dark:text-[#F3F4F6] mt-2">
            {formatDurationLabel(stats.totalMinutes)}
          </div>
          <div className="text-[11px] text-[#5A5A55] dark:text-[#9CA3AF] mt-0.5 tabular-nums">
            Across {sessions.length} sessions
          </div>
        </div>

        <div className="rounded-2xl bg-white dark:bg-[#13161D] border border-[#E5E5E0] dark:border-[#232834] p-4">
          <div className="flex items-center justify-between text-xs text-[#5A5A55] dark:text-[#9CA3AF]">
            <span>Redo Queue</span>
            <Award className="w-4 h-4 text-rose-500" />
          </div>
          <div className="font-mono tabular-nums text-2xl font-bold text-[#141413] dark:text-[#F3F4F6] mt-2">
            {stats.redoCount}
          </div>
          <div className="text-[11px] text-[#5A5A55] dark:text-[#9CA3AF] mt-0.5">
            Questions flagged to master
          </div>
        </div>
      </div>

      {/* Daily Goal Progress Bar + Subject Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-5 rounded-2xl bg-white dark:bg-[#13161D] border border-[#E5E5E0] dark:border-[#232834] p-5 space-y-5">
          <div>
            <div className="flex items-center justify-between text-sm font-semibold text-[#141413] dark:text-[#F3F4F6]">
              <span>Daily Focus Target</span>
              <span className="font-mono tabular-nums">{goalPct}%</span>
            </div>
            <div className="mt-2.5 h-3 w-full rounded-full bg-[#ECECE7] dark:bg-[#1F2430] overflow-hidden">
              <div
                className="h-full rounded-full bg-[#4338CA] dark:bg-[#6366F1] transition-all"
                style={{ width: `${goalPct}%` }}
              />
            </div>
          </div>

          <div className="pt-2 border-t border-[#E5E5E0] dark:border-[#232834] space-y-3">
            <h2 className="font-display text-base font-semibold text-[#141413] dark:text-[#F3F4F6]">
              Subject Time Distribution
            </h2>
            {Object.values(subjects).map((sub) => {
              const mins = stats.bySubject[sub.id] ?? 0;
              const pct = stats.totalMinutes > 0 ? Math.round((mins / stats.totalMinutes) * 100) : 0;
              return (
                <div key={sub.id} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-[#141413] dark:text-[#F3F4F6]">{sub.label}</span>
                    <span className="font-mono tabular-nums text-[#5A5A55] dark:text-[#9CA3AF]">
                      {formatDurationLabel(mins)} ({pct}%)
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-[#ECECE7] dark:bg-[#1F2430] overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${pct}%`, backgroundColor: sub.color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* 7-Day Planned vs Actual Focus Chart */}
        <section className="lg:col-span-7 rounded-2xl bg-white dark:bg-[#13161D] border border-[#E5E5E0] dark:border-[#232834] p-5 flex flex-col justify-between">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div>
              <h2 className="font-display text-base font-semibold text-[#141413] dark:text-[#F3F4F6]">
                7-Day Planned vs. Actual Focus
              </h2>
              <p className="text-xs text-[#5A5A55] dark:text-[#9CA3AF]">
                Calendar scheduled minutes compared with logged timer sessions
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

          <div className="h-56 flex items-end justify-between gap-2 pt-6 border-b border-[#E5E5E0] dark:border-[#232834] pb-2">
            {stats.trend.map((day) => {
              const plannedH = Math.round((day.planned / maxTrendMinutes) * 100);
              const actualH = Math.round((day.actual / maxTrendMinutes) * 100);
              const isToday = day.iso === todayISO;
              return (
                <div key={day.iso} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                  <div className="w-full flex items-end justify-center gap-1 h-40">
                    <div
                      title={`${day.iso} Planned: ${day.planned}m`}
                      style={{ height: `${Math.max(day.planned > 0 ? 6 : 0, plannedH)}%` }}
                      className="w-3 sm:w-4 rounded-t-sm bg-[#CBD5E1] dark:bg-[#334155] transition-all"
                    />
                    <div
                      title={`${day.iso} Actual: ${day.actual}m`}
                      style={{ height: `${Math.max(day.actual > 0 ? 6 : 0, actualH)}%` }}
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
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
};
