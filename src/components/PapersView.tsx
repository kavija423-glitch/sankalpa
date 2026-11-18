import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  FilePlus2,
  ListChecks,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import type {
  PaperQuestion,
  PaperQuestionStatus,
  PaperSubjectKey,
  PastPaper,
  SubjectConfig,
  SubjectKey,
  SyllabusUnit,
} from '../types/app';
import { computePaperStats, extractRedoQueue, generateALPaperStructure } from '../utils/paperGenerator';

interface PapersViewProps {
  papers: PastPaper[];
  syllabus: SyllabusUnit[];
  subjects: Record<SubjectKey, SubjectConfig>;
  onAddPaper: (paper: PastPaper) => void;
  onDeletePaper: (paperId: string) => void;
  onUpdateQuestion: (paperId: string, questionId: string, patch: Partial<PaperQuestion>) => void;
  onSendRedoToTask: (item: {
    paperId: string;
    questionId: string;
    label: string;
    paperTitle: string;
    subject: PaperSubjectKey;
    unitTag: string;
    mistakeNote: string;
  }) => void;
}

const STATUS_META: Record<
  PaperQuestionStatus,
  { label: string; short: string; className: string }
> = {
  unattempted: {
    label: 'Unattempted',
    short: '—',
    className: 'border-[#DCE6F0] dark:border-[#1E2C40] text-[#475569] dark:text-[#94A3B8] bg-[#F4F8FB] dark:bg-[#080E17]',
  },
  mastered: {
    label: 'Mastered',
    short: 'OK',
    className: 'border-emerald-500/50 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300',
  },
  redo: {
    label: 'Redo Required',
    short: 'RD',
    className: 'border-rose-500/60 bg-rose-500/12 text-rose-700 dark:text-rose-300',
  },
  silly: {
    label: 'Silly Mistake',
    short: 'SM',
    className: 'border-amber-500/60 bg-amber-500/12 text-amber-700 dark:text-amber-300',
  },
};

export const PapersView: React.FC<PapersViewProps> = ({
  papers,
  syllabus,
  subjects,
  onAddPaper,
  onDeletePaper,
  onUpdateQuestion,
  onSendRedoToTask,
}) => {
  const [subView, setSubView] = useState<'papers' | 'redo'>('papers');
  const [subjectFilter, setSubjectFilter] = useState<'all' | PaperSubjectKey>('all');
  const [selectedPaperId, setSelectedPaperId] = useState<string>(papers[0]?.id ?? '');
  const [editingQuestion, setEditingQuestion] = useState<{
    paperId: string;
    question: PaperQuestion;
  } | null>(null);

  // Add Paper Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newYear, setNewYear] = useState(2025);
  const [newSubject, setNewSubject] = useState<PaperSubjectKey>('physics');
  const [newType, setNewType] = useState<'official' | 'school' | 'model'>('official');
  const [newSource, setNewSource] = useState('Department of Examinations');
  const [newMedium, setNewMedium] = useState<'english' | 'sinhala'>('english');
  const [sentToast, setSentToast] = useState<string | null>(null);

  const filteredPapers = useMemo(
    () =>
      papers
        .filter((p) => (subjectFilter === 'all' ? true : p.subject === subjectFilter))
        .sort((a, b) => b.year - a.year || b.createdAt - a.createdAt),
    [papers, subjectFilter]
  );

  const activePaper = useMemo(
    () => filteredPapers.find((p) => p.id === selectedPaperId) ?? filteredPapers[0] ?? null,
    [filteredPapers, selectedPaperId]
  );

  const redoQueue = useMemo(() => {
    const all = extractRedoQueue(papers);
    return subjectFilter === 'all' ? all : all.filter((item) => item.subject === subjectFilter);
  }, [papers, subjectFilter]);

  const sectionsForActivePaper = useMemo(() => {
    if (!activePaper) return [];
    const groups = new Map<string, PaperQuestion[]>();
    for (const q of activePaper.questions) {
      const list = groups.get(q.section) ?? [];
      list.push(q);
      groups.set(q.section, list);
    }
    return Array.from(groups.entries());
  }, [activePaper]);

  const unitOptionsForSubject = (sub: PaperSubjectKey) =>
    syllabus.filter((u) => u.subject === sub).map((u) => `Unit ${u.unitNumber} · ${u.titleEn}`);

  const handleCreatePaper = (e: React.FormEvent) => {
    e.preventDefault();
    const created = generateALPaperStructure({
      year: newYear,
      subject: newSubject,
      paperType: newType,
      sourceName: newSource,
      medium: newMedium,
    });
    onAddPaper(created);
    setSelectedPaperId(created.id);
    setSubView('papers');
    setShowCreateModal(false);
  };

  return (
    <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 py-5 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-[#DCE6F0] dark:border-[#1E2C40] pb-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#0F172A] dark:text-[#F1F5F9]">
            G.C.E. A/L Past Papers
          </h1>
          <p className="text-sm text-[#475569] dark:text-[#94A3B8] mt-1">
            Official 2010–2026 & school papers · Exact Sri Lankan A/L structures + Redo Queue
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center p-1 rounded-xl bg-[#E6EEF5] dark:bg-[#0F1724] border border-[#DCE6F0] dark:border-[#1E2C40]">
            <button
              type="button"
              onClick={() => setSubView('papers')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                subView === 'papers'
                  ? 'bg-white dark:bg-[#172233] text-[#0F172A] dark:text-[#F1F5F9] shadow-xs'
                  : 'text-[#475569] dark:text-[#94A3B8]'
              }`}
            >
              <ListChecks className="w-3.5 h-3.5" />
              <span>Papers ({papers.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setSubView('redo')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                subView === 'redo'
                  ? 'bg-white dark:bg-[#172233] text-[#0F172A] dark:text-[#F1F5F9] shadow-xs'
                  : 'text-[#475569] dark:text-[#94A3B8]'
              }`}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Redo Queue ({redoQueue.length})</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="min-h-[38px] px-4 py-2 rounded-xl bg-[#0284C7] hover:bg-[#0369A1] dark:bg-[#38BDF8] dark:hover:bg-[#7DD3FC] text-white dark:text-[#07131E] text-xs font-semibold flex items-center gap-1.5 hover:opacity-90 cursor-pointer whitespace-nowrap"
          >
            <FilePlus2 className="w-3.5 h-3.5" />
            <span>Add Paper</span>
          </button>
        </div>
      </div>

      {/* Subject Filter */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-[#E6EEF5] dark:bg-[#0F1724] border border-[#DCE6F0] dark:border-[#1E2C40]">
          {(['all', 'physics', 'maths', 'ict'] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setSubjectFilter(key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer whitespace-nowrap ${
                subjectFilter === key
                  ? 'bg-white dark:bg-[#172233] text-[#0F172A] dark:text-[#F1F5F9] shadow-xs'
                  : 'text-[#475569] dark:text-[#94A3B8]'
              }`}
            >
              {key === 'all' ? 'All Papers' : subjects[key].label}
            </button>
          ))}
        </div>

        {sentToast && (
          <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
            {sentToast}
          </span>
        )}
      </div>

      {subView === 'papers' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Paper Selector List */}
          <div className="lg:col-span-4 space-y-2.5">
            {filteredPapers.length === 0 ? (
              <div className="rounded-2xl bg-white dark:bg-[#0F1724] border border-[#DCE6F0] dark:border-[#1E2C40] p-6 text-center">
                <p className="text-sm font-medium">No papers in this filter</p>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(true)}
                  className="mt-3 px-4 py-2 rounded-lg bg-[#0284C7] hover:bg-[#0369A1] text-white dark:bg-[#38BDF8] dark:text-[#07131E] text-xs font-semibold cursor-pointer"
                >
                  Generate A/L Paper
                </button>
              </div>
            ) : (
              filteredPapers.map((p) => {
                const stats = computePaperStats(p);
                const selected = activePaper?.id === p.id;
                const sub = subjects[p.subject];
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedPaperId(p.id)}
                    className={`w-full text-left rounded-xl border p-3.5 cursor-pointer ${
                      selected
                        ? 'bg-white dark:bg-[#0F1724] border-[#0EA5E9] dark:border-[#38BDF8]'
                        : 'bg-white dark:bg-[#0F1724] border-[#DCE6F0] dark:border-[#1E2C40] hover:border-[#CBD5E1]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-[#0F172A] dark:text-[#F1F5F9] truncate">
                          {p.title}
                        </div>
                        <div className="text-xs text-[#475569] dark:text-[#94A3B8] mt-0.5 truncate">
                          <span style={{ color: sub.color }} className="font-medium">
                            {sub.label}
                          </span>{' '}
                          · {p.medium === 'sinhala' ? 'Sinhala' : 'English'} · {p.sourceName}
                        </div>
                      </div>
                      <span className="font-mono tabular-nums text-xs font-semibold text-[#0F172A] dark:text-[#F1F5F9] shrink-0">
                        {stats.mastered}/{stats.total}
                      </span>
                    </div>

                    <div className="mt-2.5 flex items-center gap-3 text-[11px] font-mono tabular-nums text-[#475569] dark:text-[#94A3B8]">
                      <span className="text-emerald-600 dark:text-emerald-400">{stats.mastered} mastered</span>
                      <span className="text-rose-600 dark:text-rose-400">{stats.redo} redo</span>
                      <span className="text-amber-600 dark:text-amber-400">{stats.silly} silly</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Active Paper Question Structure Grid */}
          <div className="lg:col-span-8">
            {activePaper ? (
              <div className="rounded-2xl bg-white dark:bg-[#0F1724] border border-[#DCE6F0] dark:border-[#1E2C40] p-5 space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#DCE6F0] dark:border-[#1E2C40] pb-4">
                  <div>
                    <h2 className="font-display text-lg font-bold text-[#0F172A] dark:text-[#F1F5F9]">
                      {activePaper.title}
                    </h2>
                    <p className="text-xs text-[#475569] dark:text-[#94A3B8] mt-0.5">
                      {activePaper.sourceName} · {activePaper.medium === 'sinhala' ? 'Sinhala Medium' : 'English Medium'} · Click any question to log status, unit & mistake notes
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onDeletePaper(activePaper.id)}
                    aria-label={`Delete ${activePaper.title}`}
                    className="p-2 rounded-lg text-[#475569] hover:text-red-600 dark:text-[#94A3B8] dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Legend */}
                <div className="flex flex-wrap items-center gap-4 text-xs text-[#475569] dark:text-[#94A3B8]">
                  <span className="inline-flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Mastered (OK)
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <RotateCcw className="w-3.5 h-3.5 text-rose-600" /> Redo Required (RD)
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600" /> Silly Mistake (SM)
                  </span>
                </div>

                {/* Exact Question Structure Sections */}
                <div className="space-y-5">
                  {sectionsForActivePaper.map(([sectionName, sectionQuestions]) => (
                    <div key={sectionName} className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
                          {sectionName}
                        </h3>
                        <span className="font-mono text-[11px] tabular-nums text-[#475569] dark:text-[#94A3B8]">
                          {sectionQuestions.length} questions
                        </span>
                      </div>

                      <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5">
                        {sectionQuestions.map((q) => {
                          const meta = STATUS_META[q.status];
                          return (
                            <button
                              key={q.id}
                              type="button"
                              onClick={() =>
                                setEditingQuestion({ paperId: activePaper.id, question: q })
                              }
                              aria-label={`${q.label}: ${meta.label}`}
                              className={`min-h-[42px] rounded-lg border px-1.5 py-1 flex flex-col items-center justify-center text-center hover:brightness-95 cursor-pointer ${meta.className}`}
                            >
                              <span className="font-mono tabular-nums text-[11px] font-semibold leading-none">
                                {q.section.includes('MCQ')
                                  ? String(q.number).padStart(2, '0')
                                  : `Q${q.number}`}
                              </span>
                              <span className="font-mono text-[9px] mt-1 opacity-80 leading-none">
                                {meta.short}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        /* Cross-Paper Redo Queue */
        <div className="rounded-2xl bg-white dark:bg-[#0F1724] border border-[#DCE6F0] dark:border-[#1E2C40] divide-y divide-[#DCE6F0] dark:divide-[#1E2C40]">
          {redoQueue.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm font-medium text-[#0F172A] dark:text-[#F1F5F9]">
                Your Redo Queue is clear
              </p>
              <p className="text-xs text-[#475569] dark:text-[#94A3B8] mt-1">
                Mark challenging questions as Redo Required or Silly Mistake inside any paper to queue them here.
              </p>
            </div>
          ) : (
            redoQueue.map((item) => {
              const sub = subjects[item.subject];
              const isRedo = item.question.status === 'redo';
              return (
                <div
                  key={item.question.id}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`text-xs font-semibold ${
                          isRedo
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-amber-600 dark:text-amber-400'
                        }`}
                      >
                        {isRedo ? 'Redo Required' : 'Silly Mistake'}
                      </span>
                      <span aria-hidden="true" className="text-[#94A3B8]">·</span>
                      <span className="text-sm font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
                        {item.paperTitle} — {item.question.label}
                      </span>
                    </div>
                    <div className="text-xs text-[#475569] dark:text-[#94A3B8]">
                      <span style={{ color: sub.color }} className="font-medium">
                        {sub.label}
                      </span>
                      {item.question.unitTag && ` · ${item.question.unitTag}`}
                    </div>
                    {item.question.mistakeNote && (
                      <p className="text-xs text-[#0F172A] dark:text-[#D1D5DB] pt-0.5">
                        {item.question.mistakeNote}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateQuestion(item.paperId, item.question.id, { status: 'mastered' })
                      }
                      className="px-3 py-1.5 rounded-lg border border-[#DCE6F0] dark:border-[#1E2C40] text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 cursor-pointer whitespace-nowrap"
                    >
                      Mark Mastered
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onSendRedoToTask({
                          paperId: item.paperId,
                          questionId: item.question.id,
                          label: item.question.label,
                          paperTitle: item.paperTitle,
                          subject: item.subject,
                          unitTag: item.question.unitTag,
                          mistakeNote: item.question.mistakeNote,
                        });
                        setSentToast(`Added "${item.paperTitle} · ${item.question.label}" to Smart Tasks`);
                        window.setTimeout(() => setSentToast(null), 3500);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-[#0284C7] hover:bg-[#0369A1] dark:bg-[#38BDF8] dark:hover:bg-[#7DD3FC] text-white dark:text-[#07131E] text-xs font-semibold flex items-center gap-1 hover:opacity-90 cursor-pointer whitespace-nowrap"
                    >
                      <span>Send to Tasks</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Question Inspection / Edit Modal */}
      {editingQuestion && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-question-title"
        >
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#0F1724] border border-[#DCE6F0] dark:border-[#1E2C40] p-6 space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 id="edit-question-title" className="font-display text-lg font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
                  {editingQuestion.question.label}
                </h3>
                <p className="text-xs text-[#475569] dark:text-[#94A3B8]">
                  {editingQuestion.question.section}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingQuestion(null)}
                aria-label="Close question editor"
                className="p-2 rounded-lg text-[#475569] hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <span className="block text-xs font-medium mb-2">Status</span>
              <div className="grid grid-cols-2 gap-2">
                {(['mastered', 'redo', 'silly', 'unattempted'] as PaperQuestionStatus[]).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => {
                      const updated = { ...editingQuestion.question, status: st };
                      onUpdateQuestion(editingQuestion.paperId, editingQuestion.question.id, { status: st });
                      setEditingQuestion({ ...editingQuestion, question: updated });
                    }}
                    className={`px-3 py-2 rounded-lg border text-xs font-semibold text-left cursor-pointer ${
                      editingQuestion.question.status === st
                        ? 'ring-2 ring-[#0EA5E9] dark:ring-[#38BDF8] ' + STATUS_META[st].className
                        : STATUS_META[st].className
                    }`}
                  >
                    {STATUS_META[st].label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="q-unit-tag" className="block text-xs font-medium mb-1">
                Syllabus Unit Tag
              </label>
              <select
                id="q-unit-tag"
                value={editingQuestion.question.unitTag}
                onChange={(e) => {
                  const unitTag = e.target.value;
                  onUpdateQuestion(editingQuestion.paperId, editingQuestion.question.id, { unitTag });
                  setEditingQuestion({
                    ...editingQuestion,
                    question: { ...editingQuestion.question, unitTag },
                  });
                }}
                className="w-full rounded-lg bg-[#F4F8FB] dark:bg-[#080E17] border border-[#DCE6F0] dark:border-[#1E2C40] px-3 py-2 text-xs text-[#0F172A] dark:text-[#F1F5F9]"
              >
                <option value="">Select syllabus unit...</option>
                {activePaper &&
                  unitOptionsForSubject(activePaper.subject).map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label htmlFor="q-mistake-note" className="block text-xs font-medium mb-1">
                Mistake Note / Key Formula
              </label>
              <textarea
                id="q-mistake-note"
                rows={3}
                value={editingQuestion.question.mistakeNote}
                onChange={(e) => {
                  const mistakeNote = e.target.value;
                  onUpdateQuestion(editingQuestion.paperId, editingQuestion.question.id, { mistakeNote });
                  setEditingQuestion({
                    ...editingQuestion,
                    question: { ...editingQuestion.question, mistakeNote },
                  });
                }}
                placeholder="Why did you miss this or what insight solves it faster?"
                className="w-full rounded-lg bg-[#F4F8FB] dark:bg-[#080E17] border border-[#DCE6F0] dark:border-[#1E2C40] px-3 py-2 text-xs text-[#0F172A] dark:text-[#F1F5F9]"
              />
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => setEditingQuestion(null)}
                className="px-4 py-2 rounded-lg bg-[#0284C7] hover:bg-[#0369A1] dark:bg-[#38BDF8] dark:hover:bg-[#7DD3FC] text-white dark:text-[#07131E] text-xs font-semibold cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Past Paper Modal */}
      {showCreateModal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-paper-modal-title"
        >
          <form
            onSubmit={handleCreatePaper}
            className="w-full max-w-md rounded-2xl bg-white dark:bg-[#0F1724] border border-[#DCE6F0] dark:border-[#1E2C40] p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 id="add-paper-modal-title" className="font-display text-lg font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
                Add A/L Paper
              </h2>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                aria-label="Close add paper modal"
                className="p-2 rounded-lg text-[#475569] hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="paper-subject" className="block text-xs font-medium mb-1">
                  Subject
                </label>
                <select
                  id="paper-subject"
                  value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value as PaperSubjectKey)}
                  className="w-full rounded-lg bg-[#F4F8FB] dark:bg-[#080E17] border border-[#DCE6F0] dark:border-[#1E2C40] px-3 py-2 text-xs"
                >
                  <option value="physics">Physics (50 MCQ + Struct + Essay)</option>
                  <option value="maths">Combined Maths (Pure & Applied A/B)</option>
                  <option value="ict">ICT (50 MCQ + Struct + Essay)</option>
                </select>
              </div>
              <div>
                <label htmlFor="paper-year" className="block text-xs font-medium mb-1">
                  Year (2010–2026)
                </label>
                <select
                  id="paper-year"
                  value={newYear}
                  onChange={(e) => setNewYear(Number(e.target.value))}
                  className="w-full rounded-lg bg-[#F4F8FB] dark:bg-[#080E17] border border-[#DCE6F0] dark:border-[#1E2C40] px-3 py-2 text-xs font-mono"
                >
                  {Array.from({ length: 17 }, (_, i) => 2026 - i).map((yr) => (
                    <option key={yr} value={yr}>
                      {yr}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="paper-type" className="block text-xs font-medium mb-1">
                  Paper Type
                </label>
                <select
                  id="paper-type"
                  value={newType}
                  onChange={(e) => {
                    const t = e.target.value as 'official' | 'school' | 'model';
                    setNewType(t);
                    setNewSource(
                      t === 'official'
                        ? 'Department of Examinations'
                        : t === 'school'
                        ? 'Royal College Term Test'
                        : 'Zonal Model Paper'
                    );
                  }}
                  className="w-full rounded-lg bg-[#F4F8FB] dark:bg-[#080E17] border border-[#DCE6F0] dark:border-[#1E2C40] px-3 py-2 text-xs"
                >
                  <option value="official">Official G.C.E. A/L</option>
                  <option value="school">School / Term Test</option>
                  <option value="model">Model / Provincial</option>
                </select>
              </div>
              <div>
                <label htmlFor="paper-medium" className="block text-xs font-medium mb-1">
                  Medium
                </label>
                <select
                  id="paper-medium"
                  value={newMedium}
                  onChange={(e) => setNewMedium(e.target.value as 'english' | 'sinhala')}
                  className="w-full rounded-lg bg-[#F4F8FB] dark:bg-[#080E17] border border-[#DCE6F0] dark:border-[#1E2C40] px-3 py-2 text-xs"
                >
                  <option value="english">English</option>
                  <option value="sinhala">Sinhala (සිංහල)</option>
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="paper-source" className="block text-xs font-medium mb-1">
                Source / School Name
              </label>
              <input
                id="paper-source"
                type="text"
                value={newSource}
                onChange={(e) => setNewSource(e.target.value)}
                className="w-full rounded-lg bg-[#F4F8FB] dark:bg-[#080E17] border border-[#DCE6F0] dark:border-[#1E2C40] px-3 py-2 text-xs"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 rounded-lg border border-[#DCE6F0] dark:border-[#1E2C40] text-xs font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-[#0284C7] hover:bg-[#0369A1] dark:bg-[#38BDF8] dark:hover:bg-[#7DD3FC] text-white dark:text-[#07131E] text-xs font-semibold cursor-pointer"
              >
                Generate Paper Structure
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
