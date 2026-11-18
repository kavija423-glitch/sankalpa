import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ActiveTimerState, SubjectConfig } from '../types/app';
import { formatClockTimer } from '../utils/calendarMath';

interface DocumentPictureInPictureAPI {
  requestWindow: (options?: {
    width?: number;
    height?: number;
    disallowReturnToOpener?: boolean;
  }) => Promise<Window>;
  window?: Window | null;
}

declare global {
  interface Window {
    documentPictureInPicture?: DocumentPictureInPictureAPI;
  }
}

export type PipMode = 'none' | 'document' | 'video';

interface UsePictureInPictureOptions {
  timer: ActiveTimerState;
  displayMs: number;
  subject: SubjectConfig;
  theme: 'light' | 'dark';
  onToggleRun: () => void;
}

interface UsePictureInPictureResult {
  isPipSupported: boolean;
  pipMode: PipMode;
  isPipOpen: boolean;
  pipContainer: HTMLElement | null;
  pipError: string | null;
  togglePip: () => Promise<void>;
  closePip: () => void;
  clearPipError: () => void;
}

function syncStylesToPipWindow(pipWin: Window): void {
  const srcDoc = document;
  const dstDoc = pipWin.document;

  dstDoc.title = 'Sankalpa — Focus Timer';

  // Copy html className (preserves Tailwind .dark selector)
  dstDoc.documentElement.className = srcDoc.documentElement.className;

  // Copy all computed CSS custom properties (--*) onto pip root
  const computed = window.getComputedStyle(srcDoc.documentElement);
  for (let i = 0; i < computed.length; i++) {
    const prop = computed[i];
    if (prop && prop.startsWith('--')) {
      dstDoc.documentElement.style.setProperty(prop, computed.getPropertyValue(prop));
    }
  }

  // Clone <style> and <link rel="stylesheet"> elements into pipWindow.document.head
  const headNodes = srcDoc.head.querySelectorAll('style, link[rel="stylesheet"]');
  headNodes.forEach((node) => {
    try {
      dstDoc.head.appendChild(node.cloneNode(true));
    } catch {
      // Ignore uncloneable stylesheet nodes
    }
  });
}

function drawCanvasTimerFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  opts: {
    clockText: string;
    title: string;
    subjectLabel: string;
    subjectColor: string;
    isRunning: boolean;
    theme: 'light' | 'dark';
    statusLabel: string;
  }
): void {
  const isDark = opts.theme === 'dark';
  ctx.clearRect(0, 0, width, height);

  // Background fill matching Sankalpa dark/light slate
  ctx.fillStyle = isDark ? '#13161D' : '#FFFFFF';
  ctx.fillRect(0, 0, width, height);

  // Subtle hairline frame
  ctx.strokeStyle = isDark ? '#232834' : '#E5E5E0';
  ctx.lineWidth = 2;
  ctx.strokeRect(2, 2, width - 4, height - 4);

  // Subject color dot
  ctx.fillStyle = opts.subjectColor || '#4338CA';
  ctx.beginPath();
  ctx.arc(38, 54, 10, 0, Math.PI * 2);
  ctx.fill();

  // Session title & status
  ctx.fillStyle = isDark ? '#F3F4F6' : '#141413';
  ctx.font = '600 26px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  const maxTitleWidth = width - 88;
  let titleText = opts.title || 'Focused Session';
  while (titleText.length > 3 && ctx.measureText(titleText).width > maxTitleWidth) {
    titleText = `${titleText.slice(0, -2)}…`;
  }
  ctx.fillText(titleText, 60, 54);

  ctx.fillStyle = isDark ? '#9CA3AF' : '#5A5A55';
  ctx.font = '500 20px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText(`${opts.subjectLabel} · ${opts.statusLabel}`, 30, 104);

  // Large tabular clock readout
  ctx.fillStyle = opts.isRunning
    ? isDark
      ? '#A5B4FC'
      : '#4338CA'
    : isDark
    ? '#F3F4F6'
    : '#141413';
  ctx.font = '700 62px "JetBrains Mono", ui-monospace, monospace';
  ctx.textAlign = 'right';
  ctx.fillText(opts.clockText, width - 28, 134);
  ctx.textAlign = 'left';
}

export function usePictureInPicture({
  timer,
  displayMs,
  subject,
  theme,
  onToggleRun,
}: UsePictureInPictureOptions): UsePictureInPictureResult {
  const [pipMode, setPipMode] = useState<PipMode>('none');
  const [pipContainer, setPipContainer] = useState<HTMLElement | null>(null);
  const [pipError, setPipError] = useState<string | null>(null);

  const pipWindowRef = useRef<Window | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const onToggleRunRef = useRef(onToggleRun);
  onToggleRunRef.current = onToggleRun;

  const supportsDocumentPip =
    typeof window !== 'undefined' &&
    typeof window.documentPictureInPicture?.requestWindow === 'function';

  const supportsVideoPip =
    typeof document !== 'undefined' &&
    Boolean(document.pictureInPictureEnabled) &&
    typeof HTMLVideoElement !== 'undefined' &&
    typeof HTMLVideoElement.prototype.requestPictureInPicture === 'function';

  const isPipSupported = supportsDocumentPip || supportsVideoPip;

  const cleanupVideoPip = useCallback(() => {
    if (document.pictureInPictureElement && document.pictureInPictureElement === videoRef.current) {
      void document.exitPictureInPicture().catch(() => {});
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current.remove();
      videoRef.current = null;
    }
    canvasRef.current = null;
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.setActionHandler('play', null);
        navigator.mediaSession.setActionHandler('pause', null);
      } catch {
        // Ignore browsers that reject clearing handlers
      }
    }
  }, []);

  const closePip = useCallback(() => {
    if (pipWindowRef.current) {
      try {
        pipWindowRef.current.close();
      } catch {
        // Ignore already-closed window
      }
      pipWindowRef.current = null;
    }
    cleanupVideoPip();
    setPipContainer(null);
    setPipMode('none');
  }, [cleanupVideoPip]);

  // Keep .dark class synced on open Document PiP window when user toggles theme
  useEffect(() => {
    const pipWin = pipWindowRef.current;
    if (!pipWin || pipWin.closed) return;
    pipWin.document.documentElement.className = document.documentElement.className;
  }, [theme]);

  // Re-paint Video PiP canvas whenever clock or timer metadata changes
  const clockText = useMemo(() => formatClockTimer(displayMs), [displayMs]);
  const statusLabel = timer.isRunning
    ? timer.phase === 'break'
      ? 'Break'
      : 'Focusing'
    : 'Paused';

  useEffect(() => {
    if (pipMode !== 'video' || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    drawCanvasTimerFrame(ctx, canvasRef.current.width, canvasRef.current.height, {
      clockText,
      title: timer.title || 'Focused Session',
      subjectLabel: subject.label,
      subjectColor: subject.color,
      isRunning: timer.isRunning,
      theme,
      statusLabel,
    });
    if (videoRef.current) {
      if (timer.isRunning && videoRef.current.paused) {
        void videoRef.current.play().catch(() => {});
      }
    }
  }, [pipMode, clockText, timer.title, timer.isRunning, subject.label, subject.color, theme, statusLabel]);

  useEffect(() => {
    return () => {
      closePip();
    };
  }, [closePip]);

  const togglePip = useCallback(async () => {
    setPipError(null);
    if (pipMode !== 'none') {
      closePip();
      return;
    }

    if (supportsDocumentPip && window.documentPictureInPicture) {
      try {
        const pipWin = await window.documentPictureInPicture.requestWindow({
          width: 288,
          height: 92,
          disallowReturnToOpener: false,
        });
        syncStylesToPipWindow(pipWin);
        pipWin.document.body.className =
          'm-0 p-0 overflow-hidden bg-[#F7F7F5] dark:bg-[#0B0D11] text-[#141413] dark:text-[#F3F4F6] select-none';

        const container = pipWin.document.createElement('div');
        container.className = 'w-full h-full';
        pipWin.document.body.appendChild(container);

        pipWindowRef.current = pipWin;
        setPipContainer(container);
        setPipMode('document');

        pipWin.addEventListener('pagehide', () => {
          pipWindowRef.current = null;
          setPipContainer(null);
          setPipMode('none');
        });
        return;
      } catch (err) {
        // If Document PiP fails or was blocked, try Video PiP fallback if available
        if (!supportsVideoPip) {
          setPipError(err instanceof Error ? err.message : 'Unable to open Picture-in-Picture window.');
          return;
        }
      }
    }

    if (supportsVideoPip) {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 576;
        canvas.height = 184;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas 2D context unavailable for PiP.');
        drawCanvasTimerFrame(ctx, canvas.width, canvas.height, {
          clockText,
          title: timer.title || 'Focused Session',
          subjectLabel: subject.label,
          subjectColor: subject.color,
          isRunning: timer.isRunning,
          theme,
          statusLabel,
        });

        const stream = canvas.captureStream(2);
        const video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        video.srcObject = stream;
        video.style.position = 'fixed';
        video.style.width = '1px';
        video.style.height = '1px';
        video.style.opacity = '0.001';
        video.style.pointerEvents = 'none';
        document.body.appendChild(video);

        await video.play();
        await video.requestPictureInPicture();

        canvasRef.current = canvas;
        videoRef.current = video;
        streamRef.current = stream;
        setPipMode('video');

        if ('mediaSession' in navigator) {
          try {
            navigator.mediaSession.setActionHandler('play', () => onToggleRunRef.current());
            navigator.mediaSession.setActionHandler('pause', () => onToggleRunRef.current());
          } catch {
            // Ignore unsupported action handlers
          }
        }

        video.addEventListener('leavepicturepicture', () => {
          cleanupVideoPip();
          setPipMode('none');
        });
      } catch (err) {
        cleanupVideoPip();
        setPipError(
          err instanceof Error
            ? err.message
            : 'Browser blocked Picture-in-Picture mode.'
        );
      }
      return;
    }

    setPipError('Picture-in-Picture is not supported by this browser.');
  }, [
    pipMode,
    closePip,
    supportsDocumentPip,
    supportsVideoPip,
    clockText,
    timer.title,
    timer.isRunning,
    subject.label,
    subject.color,
    theme,
    statusLabel,
    cleanupVideoPip,
  ]);

  return {
    isPipSupported,
    pipMode,
    isPipOpen: pipMode !== 'none',
    pipContainer,
    pipError,
    togglePip,
    closePip,
    clearPipError: () => setPipError(null),
  };
}
