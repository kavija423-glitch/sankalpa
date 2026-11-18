import type { PaperQuestion, PaperSubjectKey, PastPaper } from '../types/app';

export interface CreatePaperInput {
  id?: string;
  year: number;
  subject: PaperSubjectKey;
  paperType: 'official' | 'school' | 'model';
  sourceName: string;
  medium: 'english' | 'sinhala';
  now?: number;
}

/**
 * Generates exact Sri Lanka G.C.E. A/L paper question structures:
 * - Physics & ICT: 50 MCQs (Paper I) + 4 Structured Essay (Paper II Part A) + 6 Essay (Paper II Part B)
 * - Combined Maths: Pure Maths Part A (10 Qs) + Pure Maths Part B (7 Qs) + Applied Maths Part A (10 Qs) + Applied Maths Part B (7 Qs) — ZERO MCQs
 */
export function generateALPaperStructure(input: CreatePaperInput): PastPaper {
  const now = input.now ?? Date.now();
  const paperId = input.id ?? `paper_${input.subject}_${input.year}_${now}_${Math.random().toString(36).slice(2, 6)}`;
  const questions: PaperQuestion[] = [];

  if (input.subject === 'physics' || input.subject === 'ict') {
    for (let i = 1; i <= 50; i++) {
      questions.push({
        id: `${paperId}_mcq_${i}`,
        paperId,
        label: `MCQ ${String(i).padStart(2, '0')}`,
        section: 'Paper I · MCQ',
        number: i,
        status: 'unattempted',
        unitTag: '',
        mistakeNote: '',
        updatedAt: now,
      });
    }
    for (let i = 1; i <= 4; i++) {
      questions.push({
        id: `${paperId}_struct_${i}`,
        paperId,
        label: `Structured Q${i}`,
        section: 'Paper II · Part A (Structured)',
        number: i,
        status: 'unattempted',
        unitTag: '',
        mistakeNote: '',
        updatedAt: now,
      });
    }
    for (let i = 5; i <= 10; i++) {
      questions.push({
        id: `${paperId}_essay_${i}`,
        paperId,
        label: `Essay Q${i}`,
        section: 'Paper II · Part B (Essay)',
        number: i,
        status: 'unattempted',
        unitTag: '',
        mistakeNote: '',
        updatedAt: now,
      });
    }
  } else {
    // Combined Mathematics: Pure & Applied Parts A & B (no MCQs)
    for (let i = 1; i <= 10; i++) {
      questions.push({
        id: `${paperId}_pure_a_${i}`,
        paperId,
        label: `Pure A Q${i}`,
        section: 'Pure Maths · Part A',
        number: i,
        status: 'unattempted',
        unitTag: '',
        mistakeNote: '',
        updatedAt: now,
      });
    }
    for (let i = 11; i <= 17; i++) {
      questions.push({
        id: `${paperId}_pure_b_${i}`,
        paperId,
        label: `Pure B Q${i}`,
        section: 'Pure Maths · Part B',
        number: i,
        status: 'unattempted',
        unitTag: '',
        mistakeNote: '',
        updatedAt: now,
      });
    }
    for (let i = 1; i <= 10; i++) {
      questions.push({
        id: `${paperId}_applied_a_${i}`,
        paperId,
        label: `Applied A Q${i}`,
        section: 'Applied Maths · Part A',
        number: i,
        status: 'unattempted',
        unitTag: '',
        mistakeNote: '',
        updatedAt: now,
      });
    }
    for (let i = 11; i <= 17; i++) {
      questions.push({
        id: `${paperId}_applied_b_${i}`,
        paperId,
        label: `Applied B Q${i}`,
        section: 'Applied Maths · Part B',
        number: i,
        status: 'unattempted',
        unitTag: '',
        mistakeNote: '',
        updatedAt: now,
      });
    }
  }

  const subjectName =
    input.subject === 'physics'
      ? 'Physics'
      : input.subject === 'ict'
      ? 'ICT'
      : 'Combined Mathematics';

  const typeLabel =
    input.paperType === 'official'
      ? 'G.C.E. A/L'
      : input.paperType === 'school'
      ? 'Term / School'
      : 'Model';

  return {
    id: paperId,
    year: input.year,
    subject: input.subject,
    paperType: input.paperType,
    sourceName: input.sourceName.trim() || (input.paperType === 'official' ? 'Department of Examinations' : 'School / Model Paper'),
    medium: input.medium,
    title: `${input.year} ${subjectName} (${typeLabel})`,
    questions,
    createdAt: now,
    updatedAt: now,
  };
}

export interface RedoQueueItem {
  paperId: string;
  paperTitle: string;
  year: number;
  subject: PaperSubjectKey;
  medium: 'english' | 'sinhala';
  question: PaperQuestion;
}

export function extractRedoQueue(papers: PastPaper[]): RedoQueueItem[] {
  const queue: RedoQueueItem[] = [];
  for (const paper of papers) {
    for (const q of paper.questions) {
      if (q.status === 'redo' || q.status === 'silly') {
        queue.push({
          paperId: paper.id,
          paperTitle: paper.title,
          year: paper.year,
          subject: paper.subject,
          medium: paper.medium,
          question: q,
        });
      }
    }
  }
  return queue.sort((a, b) => {
    if (a.question.status !== b.question.status) {
      return a.question.status === 'redo' ? -1 : 1;
    }
    return b.question.updatedAt - a.question.updatedAt;
  });
}

export function computePaperStats(paper: PastPaper) {
  let mastered = 0;
  let redo = 0;
  let silly = 0;
  let unattempted = 0;
  for (const q of paper.questions) {
    if (q.status === 'mastered') mastered++;
    else if (q.status === 'redo') redo++;
    else if (q.status === 'silly') silly++;
    else unattempted++;
  }
  const total = paper.questions.length;
  const attempted = total - unattempted;
  return { total, attempted, mastered, redo, silly, unattempted };
}
