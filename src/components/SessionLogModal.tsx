import React, { useState } from 'react';
import { Star, X } from 'lucide-react';
import type { ActiveTimerState, SubjectConfig, SubjectKey } from '../types/app';
import { formatDurationLabel } from '../utils/calendarMath';

interface SessionLogModalProps {
  open: boolean;
  timer: ActiveTimerState;
  elapsedMs: number;
  subjects: Record<SubjectKey, SubjectConfig>;
  onSave: (rating: number, notes: string) => void;
  onDiscard: () => void;
  onCancel: () => void;
}

export const SessionLogModal: React.FC<SessionLogModalProps> = ({
  open,
  timer,
  elapsedMs,
  subjects,
  onSave,
  onDiscard,
  onCancel,
}) => {
  const [rating, setRating] = useState(4);
  const [notes, setNotes] = useState('');

  if (!open) return null;

  const durationMinutes = Math.max(1, Math.round(elapsedMs / 60000));
  const subject = subjects[timer.subject] ?? subjects.general;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="log-session-title"
    >
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#0F1724] border border-[#DCE6F0] dark:border-[#1E2C40] p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="log-session-title" className="font-display text-lg font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
              Log Study Session
            </h2>
            <p className="text-xs text-[#475569] dark:text-[#94A3B8] mt-1 tabular-nums">
              {subject.label} · {timer.title || 'Focused Study'} · {formatDurationLabel(durationMinutes)}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Resume without logging"
            className="p-2 rounded-lg text-[#475569] dark:text-[#94A3B8] hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-5">
          <span className="block text-xs font-medium text-[#0F172A] dark:text-[#F1F5F9] mb-2">
            Focus Quality Rating
          </span>
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setRating(star)}
                aria-label={`Rate ${star} stars`}
                className={`w-10 h-10 rounded-lg border flex items-center justify-center transition-colors cursor-pointer ${
                  star <= rating
                    ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/30 text-amber-500'
                    : 'border-[#DCE6F0] dark:border-[#1E2C40] text-[#94A3B8]'
                }`}
              >
                <Star className={`w-4 h-4 ${star <= rating ? 'fill-current' : ''}`} />
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <label
            htmlFor="session-log-notes"
            className="block text-xs font-medium text-[#0F172A] dark:text-[#F1F5F9] mb-1.5"
          >
            Session Notes & Takeaways
          </label>
          <textarea
            id="session-log-notes"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Questions solved, concepts to revise, or blockers..."
            className="w-full rounded-lg bg-[#F4F8FB] dark:bg-[#080E17] border border-[#DCE6F0] dark:border-[#1E2C40] px-3 py-2 text-sm text-[#0F172A] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-[#0EA5E9]"
          />
        </div>

        <div className="mt-5 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => {
              setNotes('');
              onDiscard();
            }}
            className="px-3.5 py-2 rounded-lg text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
          >
            Discard
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 rounded-lg border border-[#DCE6F0] dark:border-[#1E2C40] text-xs font-medium text-[#0F172A] dark:text-[#F1F5F9] cursor-pointer"
            >
              Keep Running
            </button>
            <button
              type="button"
              onClick={() => {
                onSave(rating, notes.trim());
                setNotes('');
              }}
              className="px-4 py-2 rounded-lg bg-[#0284C7] hover:bg-[#0369A1] dark:bg-[#38BDF8] dark:hover:bg-[#7DD3FC] text-white dark:text-[#07131E] text-xs font-semibold hover:opacity-90 cursor-pointer"
            >
              Save Session
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
