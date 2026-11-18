import { toISODateLocal, addDaysISO } from './nlpTaskParser';

export const MINUTES_PER_DAY = 1440;
export const SNAP_MINUTES = 15;
export const DEFAULT_SCROLL_HOUR = 6;

export function snapMinutes(minutes: number, step: number = SNAP_MINUTES): number {
  const clamped = Math.max(0, Math.min(MINUTES_PER_DAY - step, minutes));
  return Math.round(clamped / step) * step;
}

export function clampBlockDuration(startMinutes: number, durationMinutes: number): number {
  const minDur = SNAP_MINUTES;
  const maxDur = Math.max(minDur, MINUTES_PER_DAY - startMinutes);
  const snapped = Math.round(durationMinutes / SNAP_MINUTES) * SNAP_MINUTES;
  return Math.max(minDur, Math.min(maxDur, snapped));
}

export function formatTime24(minutesFromMidnight: number): string {
  const safe = Math.max(0, Math.min(MINUTES_PER_DAY, Math.round(minutesFromMidnight)));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function formatDurationLabel(minutes: number): string {
  const rounded = Math.max(0, Math.round(minutes));
  const h = Math.floor(rounded / 60);
  const m = rounded % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function formatClockTimer(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function getStartOfWeekISO(anchorISO: string): string {
  const [y, m, d] = anchorISO.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  const day = dt.getDay(); // 0=Sun..6=Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;
  dt.setDate(dt.getDate() + diffToMonday);
  return toISODateLocal(dt);
}

export function getWeekDaysISO(anchorISO: string): string[] {
  const monday = getStartOfWeekISO(anchorISO);
  return Array.from({ length: 7 }, (_, i) => addDaysISO(monday, i));
}

export function daysUntilISO(targetISO: string, fromDate: Date = new Date()): number {
  const today = toISODateLocal(fromDate);
  const [y1, m1, d1] = today.split('-').map(Number);
  const [y2, m2, d2] = targetISO.split('-').map(Number);
  const t1 = Date.UTC(y1, (m1 || 1) - 1, d1 || 1);
  const t2 = Date.UTC(y2, (m2 || 1) - 1, d2 || 1);
  return Math.round((t2 - t1) / 86400000);
}

export interface TimeSpanItem {
  id: string;
  startMinutes: number;
  durationMinutes: number;
}

export interface PositionedSpan<T extends TimeSpanItem> {
  item: T;
  column: number;
  totalColumns: number;
}

/**
 * Computes non-overlapping horizontal columns for concurrent blocks within a single day.
 */
export function computeOverlapLayout<T extends TimeSpanItem>(items: T[]): PositionedSpan<T>[] {
  if (items.length === 0) return [];
  const sorted = [...items].sort((a, b) =>
    a.startMinutes !== b.startMinutes
      ? a.startMinutes - b.startMinutes
      : b.durationMinutes - a.durationMinutes
  );

  // Partition into connected overlap clusters
  const clusters: T[][] = [];
  let currentCluster: T[] = [];
  let clusterEnd = -1;

  for (const item of sorted) {
    const end = item.startMinutes + item.durationMinutes;
    if (currentCluster.length === 0 || item.startMinutes < clusterEnd) {
      currentCluster.push(item);
      clusterEnd = Math.max(clusterEnd, end);
    } else {
      clusters.push(currentCluster);
      currentCluster = [item];
      clusterEnd = end;
    }
  }
  if (currentCluster.length > 0) clusters.push(currentCluster);

  const result: PositionedSpan<T>[] = [];
  for (const cluster of clusters) {
    const colEndTimes: number[] = [];
    const assignments: Array<{ item: T; col: number }> = [];

    for (const item of cluster) {
      let placedCol = colEndTimes.findIndex((endTime) => endTime <= item.startMinutes);
      if (placedCol === -1) {
        placedCol = colEndTimes.length;
        colEndTimes.push(item.startMinutes + item.durationMinutes);
      } else {
        colEndTimes[placedCol] = item.startMinutes + item.durationMinutes;
      }
      assignments.push({ item, col: placedCol });
    }

    const totalCols = Math.max(1, colEndTimes.length);
    for (const { item, col } of assignments) {
      result.push({ item, column: col, totalColumns: totalCols });
    }
  }

  return result;
}

export function isOffPeakHour(hour: number): boolean {
  return hour < 6 || hour >= 23;
}
