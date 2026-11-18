import { useEffect } from 'react';

const WORKER_SCRIPT = `
  let timerId = null;
  self.onmessage = function (e) {
    if (e.data === 'start') {
      if (timerId !== null) clearInterval(timerId);
      timerId = setInterval(function () {
        self.postMessage(Date.now());
      }, 250);
    } else if (e.data === 'stop') {
      if (timerId !== null) {
        clearInterval(timerId);
        timerId = null;
      }
    }
  };
`;

/**
 * Drives timestamp-accurate timer ticks via an inline Blob Web Worker so background
 * browser tabs (e.g. while watching fullscreen lecture videos) do not throttle ticks.
 */
export function useBackgroundTimerTick(
  isRunning: boolean,
  onTick: (nowEpochMs: number) => void
): void {
  useEffect(() => {
    if (!isRunning) return;

    onTick(Date.now());

    let worker: Worker | null = null;
    let blobUrl: string | null = null;
    let fallbackInterval: number | null = null;

    if (typeof Worker !== 'undefined' && typeof Blob !== 'undefined') {
      try {
        const blob = new Blob([WORKER_SCRIPT], { type: 'application/javascript' });
        blobUrl = URL.createObjectURL(blob);
        worker = new Worker(blobUrl);
        worker.onmessage = (event: MessageEvent<number>) => {
          onTick(typeof event.data === 'number' ? event.data : Date.now());
        };
        worker.postMessage('start');
      } catch {
        worker = null;
      }
    }

    if (!worker) {
      fallbackInterval = window.setInterval(() => {
        onTick(Date.now());
      }, 250);
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        onTick(Date.now());
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      if (worker) {
        worker.postMessage('stop');
        worker.terminate();
      }
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
      if (fallbackInterval !== null) {
        window.clearInterval(fallbackInterval);
      }
    };
  }, [isRunning, onTick]);
}
