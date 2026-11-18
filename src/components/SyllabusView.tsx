import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Plus, RotateCw, Star } from 'lucide-react';
import type {
  PaperSubjectKey,
  SubjectConfig,
  SubjectKey,
  SyllabusMastery,
  SyllabusSubtopic,
  SyllabusUnit,
} from '../types/app';

interface SyllabusViewProps {
  syllabus: SyllabusUnit[];
  subjects: Record<SubjectKey, SubjectConfig>;
  medium: 'english' | 'sinhala' | 'bilingual';
  onChangeMedium: (medium: 'english' | 'sinhala' | 'bilingual') => void;
  onUpdateSubtopic: (unitId: string, subtopicId: string, patch: Partial<SyllabusSubtopic>) => void;
  onCreateRevisionTask: (subject: PaperSubjectKey, title: string) => void;
}

const MASTERY_LABELS: Record<SyllabusMastery, string> = {
  not_started: 'Not Started',
  learning: 'Learning',
  revised: 'Revised',
  mastered: 'Mastered',
};

export const SyllabusView: React.FC<SyllabusViewProps> = ({
  syllabus,
  subjects,
  medium,
  onChangeMedium,
  onUpdateSubtopic,
  onCreateRevisionTask,
}) => {
  const [selectedSubject, setSelectedSubject] = useState<PaperSubjectKey>('physics');
  const [expandedUnitIds, setExpandedUnitIds] = useState<Record<string, boolean>>({
    phy_u1: true,
    phy_u2: true,
    math_u1: true,
    ict_u1: true,
  });
  const [taskToast, setTaskToast] = useState<string | null>(null);

  const units = useMemo(
    () =>
      syllabus
        .filter((u) => u.subject === selectedSubject)
        .sort((a, b) => a.unitNumber - b.unitNumber),
    [syllabus, selectedSubject]
  );

  const subjectSummary = useMemo(() => {
    const allSubtopics = units.flatMap((u) => u.subtopics);
    const mastered = allSubtopics.filter((s) => s.mastery === 'mastered').length;
    const revised = allSubtopics.filter((s) => s.mastery === 'revised').length;
    return { total: allSubtopics.length, mastered, revised };
  }, [units]);

  const toggleUnit = (id: string) => {
    setExpandedUnitIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 py-5 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-[#E5E5E0] dark:border-[#232834] pb-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#141413] dark:text-[#F3F4F6]">
            Bilingual A/L Syllabus
          </h1>
          <p className="text-sm text-[#5A5A55] dark:text-[#9CA3AF] mt-1">
            English & සිංහල unit tracker · Track mastery, confidence stars, revisions & spawn tasks
          </p>
        </div>

        {/* Medium Toggle */}
        <div className="flex items-center p-1 rounded-xl bg-[#ECECE7] dark:bg-[#13161D] border border-[#E5E5E0] dark:border-[#232834]">
          {(['bilingual', 'english', 'sinhala'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onChangeMedium(m)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize cursor-pointer whitespace-nowrap ${
                medium === m
                  ? 'bg-white dark:bg-[#1F2430] text-[#141413] dark:text-[#F3F4F6] shadow-xs'
                  : 'text-[#5A5A55] dark:text-[#9CA3AF]'
              }`}
            >
              {m === 'sinhala' ? 'සිංහල' : m}
            </button>
          ))}
        </div>
      </div>

      {/* Subject Switcher + Progress Summary */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-[#ECECE7] dark:bg-[#13161D] border border-[#E5E5E0] dark:border-[#232834]">
          {(['physics', 'maths', 'ict'] as PaperSubjectKey[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setSelectedSubject(key)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 cursor-pointer whitespace-nowrap ${
                selectedSubject === key
                  ? 'bg-white dark:bg-[#1F2430] text-[#141413] dark:text-[#F3F4F6] shadow-xs'
                  : 'text-[#5A5A55] dark:text-[#9CA3AF]'
              }`}
            >
              <span
                className="w-2 h-2 rounded-xs"
                style={{ backgroundColor: subjects[key].color }}
              />
              <span>{subjects[key].label}</span>
            </button>
          ))}
        </div>

        <div className="text-xs text-[#5A5A55] dark:text-[#9CA3AF] font-mono tabular-nums">
          {subjectSummary.mastered}/{subjectSummary.total} mastered · {subjectSummary.revised} revised
        </div>
      </div>

      {taskToast && (
        <div className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
          {taskToast}
        </div>
      )}

      {/* Units Accordion */}
      <div className="space-y-3">
        {units.map((unit) => {
          const isOpen = !!expandedUnitIds[unit.id];
          const masteredCount = unit.subtopics.filter((s) => s.mastery === 'mastered').length;

          return (
            <div
              key={unit.id}
              className="rounded-2xl bg-white dark:bg-[#13161D] border border-[#E5E5E0] dark:border-[#232834] overflow-hidden"
            >
              <button
                type="button"
                onClick={() => toggleUnit(unit.id)}
                aria-expanded={isOpen}
                className="w-full px-4 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-black/2 dark:hover:bg-white/2 cursor-pointer"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {isOpen ? (
                    <ChevronDown className="w-4 h-4 text-[#5A5A55] shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-[#5A5A55] shrink-0" />
                  )}
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-[#141413] dark:text-[#F3F4F6]">
                      Unit {unit.unitNumber} ·{' '}
                      {medium === 'sinhala'
                        ? unit.titleSi
                        : medium === 'english'
                        ? unit.titleEn
                        : `${unit.titleEn} / ${unit.titleSi}`}
                    </div>
                  </div>
                </div>
                <span className="font-mono tabular-nums text-xs text-[#5A5A55] dark:text-[#9CA3AF] shrink-0">
                  {masteredCount}/{unit.subtopics.length}
                </span>
              </button>

              {isOpen && (
                <div className="border-t border-[#E5E5E0] dark:border-[#232834] divide-y divide-[#E5E5E0]/70 dark:divide-[#232834]/70">
                  {unit.subtopics.map((sub) => (
                    <div key={sub.id} className="p-4 space-y-3">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-[#141413] dark:text-[#F3F4F6]">
                            <span className="font-mono text-xs text-[#5A5A55] dark:text-[#9CA3AF] mr-2">
                              {sub.code}
                            </span>
                            {medium === 'sinhala' ? sub.titleSi : sub.titleEn}
                          </div>
                          {medium === 'bilingual' && (
                            <div className="text-xs text-[#5A5A55] dark:text-[#9CA3AF] mt-0.5">
                              {sub.titleSi}
                            </div>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          {/* Mastery Dropdown */}
                          <select
                            value={sub.mastery}
                            aria-label={`Mastery level for ${sub.titleEn}`}
                            onChange={(e) =>
                              onUpdateSubtopic(unit.id, sub.id, {
                                mastery: e.target.value as SyllabusMastery,
                              })
                            }
                            className="px-2.5 py-1.5 rounded-lg bg-[#F7F7F5] dark:bg-[#0B0D11] border border-[#E5E5E0] dark:border-[#232834] text-xs font-medium text-[#141413] dark:text-[#F3F4F6] cursor-pointer"
                          >
                            {Object.entries(MASTERY_LABELS).map(([k, label]) => (
                              <option key={k} value={k}>
                                {label}
                              </option>
                            ))}
                          </select>

                          {/* Confidence Stars */}
                          <div className="flex items-center gap-0.5" role="group" aria-label={`Confidence rating for ${sub.titleEn}`}>
                            {[1, 2, 3, 4, 5].map((star) => (
                              <button
                                key={star}
                                type="button"
                                onClick={() =>
                                  onUpdateSubtopic(unit.id, sub.id, { confidence: star })
                                }
                                aria-label={`Set confidence ${star} of 5`}
                                className="p-1 cursor-pointer"
                              >
                                <Star
                                  className={`w-3.5 h-3.5 ${
                                    star <= sub.confidence
                                      ? 'text-amber-500 fill-current'
                                      : 'text-[#C7C7C0] dark:text-[#3A4152]'
                                  }`}
                                />
                              </button>
                            ))}
                          </div>

                          {/* Revision Counter */}
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateSubtopic(unit.id, sub.id, {
                                revisionCount: sub.revisionCount + 1,
                              })
                            }
                            aria-label={`Increment revision count for ${sub.titleEn}`}
                            className="px-2.5 py-1.5 rounded-lg border border-[#E5E5E0] dark:border-[#232834] text-xs font-mono tabular-nums text-[#141413] dark:text-[#F3F4F6] hover:bg-black/5 dark:hover:bg-white/5 flex items-center gap-1 cursor-pointer"
                          >
                            <RotateCw className="w-3 h-3" />
                            <span>{sub.revisionCount}x</span>
                          </button>

                          {/* One-Click Revision Task */}
                          <button
                            type="button"
                            onClick={() => {
                              onCreateRevisionTask(
                                selectedSubject,
                                `Revise ${sub.code} ${sub.titleEn}`
                              );
                              setTaskToast(`Created revision task for "${sub.titleEn}"`);
                              window.setTimeout(() => setTaskToast(null), 3000);
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-[#4338CA] dark:bg-[#6366F1] text-white text-xs font-semibold flex items-center gap-1 hover:opacity-90 cursor-pointer whitespace-nowrap"
                          >
                            <Plus className="w-3 h-3" />
                            <span>Task</span>
                          </button>
                        </div>
                      </div>

                      <input
                        type="text"
                        value={sub.notes}
                        onChange={(e) =>
                          onUpdateSubtopic(unit.id, sub.id, { notes: e.target.value })
                        }
                        placeholder="Quick subtopic notes, equations, or textbook page refs..."
                        aria-label={`Notes for ${sub.titleEn}`}
                        className="w-full rounded-lg bg-[#F7F7F5] dark:bg-[#0B0D11] border border-[#E5E5E0] dark:border-[#232834] px-3 py-1.5 text-xs text-[#141413] dark:text-[#F3F4F6]"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
