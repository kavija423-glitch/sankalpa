export type FloatingCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export type TranslucencyMode = 'glass' | 'ghost';

export interface FloatingTimerPrefs {
  corner: FloatingCorner;
  translucencyMode: TranslucencyMode;
}

export interface FloatingCoords {
  left: number;
  top: number;
}

const PREFS_STORAGE_KEY = 'sankalpa_floating_timer_prefs_v1';

export const DEFAULT_FLOATING_PREFS: FloatingTimerPrefs = {
  corner: 'bottom-right',
  translucencyMode: 'glass',
};

export function clampDragCoordinates(
  left: number,
  top: number,
  widgetWidth: number,
  widgetHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  margin: number = 8
): FloatingCoords {
  const maxLeft = Math.max(margin, viewportWidth - widgetWidth - margin);
  const maxTop = Math.max(margin, viewportHeight - widgetHeight - margin);
  return {
    left: Math.round(Math.max(margin, Math.min(maxLeft, left))),
    top: Math.round(Math.max(margin, Math.min(maxTop, top))),
  };
}

export function computeNearestCorner(
  centerX: number,
  centerY: number,
  viewportWidth: number,
  viewportHeight: number
): FloatingCorner {
  const isRight = centerX >= viewportWidth / 2;
  const isBottom = centerY >= viewportHeight / 2;
  if (isBottom && isRight) return 'bottom-right';
  if (isBottom && !isRight) return 'bottom-left';
  if (!isBottom && isRight) return 'top-right';
  return 'top-left';
}

export function getCornerCoordinates(
  corner: FloatingCorner,
  widgetWidth: number,
  widgetHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  margin: number = 16
): FloatingCoords {
  const safeMaxLeft = Math.max(margin, viewportWidth - widgetWidth - margin);
  const safeMaxTop = Math.max(margin, viewportHeight - widgetHeight - margin);

  switch (corner) {
    case 'top-left':
      return { left: margin, top: margin };
    case 'top-right':
      return { left: Math.round(safeMaxLeft), top: margin };
    case 'bottom-left':
      return { left: margin, top: Math.round(safeMaxTop) };
    case 'bottom-right':
    default:
      return { left: Math.round(safeMaxLeft), top: Math.round(safeMaxTop) };
  }
}

export function loadFloatingTimerPrefs(): FloatingTimerPrefs {
  try {
    const raw = localStorage.getItem(PREFS_STORAGE_KEY);
    if (!raw) return DEFAULT_FLOATING_PREFS;
    const parsed = JSON.parse(raw) as Partial<FloatingTimerPrefs>;
    const validCorner: FloatingCorner =
      parsed.corner === 'top-left' ||
      parsed.corner === 'top-right' ||
      parsed.corner === 'bottom-left' ||
      parsed.corner === 'bottom-right'
        ? parsed.corner
        : DEFAULT_FLOATING_PREFS.corner;
    const validMode: TranslucencyMode =
      parsed.translucencyMode === 'ghost' || parsed.translucencyMode === 'glass'
        ? parsed.translucencyMode
        : DEFAULT_FLOATING_PREFS.translucencyMode;
    return { corner: validCorner, translucencyMode: validMode };
  } catch {
    return DEFAULT_FLOATING_PREFS;
  }
}

export function saveFloatingTimerPrefs(prefs: FloatingTimerPrefs): void {
  try {
    localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore storage quota or private-mode errors
  }
}
