import test from 'node:test';
import assert from 'node:assert/strict';
import { generateALPaperStructure, extractRedoQueue, computePaperStats } from './paperGenerator';

test('Physics & ICT generate 50 MCQs + 4 Structured + 6 Essay questions', () => {
  const phy = generateALPaperStructure({
    year: 2024,
    subject: 'physics',
    paperType: 'official',
    sourceName: 'Department of Examinations',
    medium: 'english',
  });
  assert.equal(phy.questions.length, 60);
  assert.equal(phy.questions.filter((q) => q.section === 'Paper I · MCQ').length, 50);
  assert.equal(phy.questions.filter((q) => q.section.includes('Structured')).length, 4);
  assert.equal(phy.questions.filter((q) => q.section.includes('Essay')).length, 6);

  const ict = generateALPaperStructure({
    year: 2025,
    subject: 'ict',
    paperType: 'official',
    sourceName: 'Department of Examinations',
    medium: 'sinhala',
  });
  assert.equal(ict.questions.length, 60);
});

test('Combined Mathematics generates Pure & Applied Parts A & B with zero MCQs', () => {
  const maths = generateALPaperStructure({
    year: 2023,
    subject: 'maths',
    paperType: 'official',
    sourceName: 'Department of Examinations',
    medium: 'english',
  });
  assert.equal(maths.questions.length, 34); // 10 + 7 Pure + 10 + 7 Applied
  assert.equal(maths.questions.filter((q) => q.section.includes('MCQ')).length, 0);
  assert.equal(maths.questions.filter((q) => q.section === 'Pure Maths · Part A').length, 10);
  assert.equal(maths.questions.filter((q) => q.section === 'Pure Maths · Part B').length, 7);
  assert.equal(maths.questions.filter((q) => q.section === 'Applied Maths · Part A').length, 10);
  assert.equal(maths.questions.filter((q) => q.section === 'Applied Maths · Part B').length, 7);
});

test('extractRedoQueue aggregates redo & silly mistake questions across papers', () => {
  const paper = generateALPaperStructure({
    year: 2024,
    subject: 'physics',
    paperType: 'official',
    sourceName: 'DOE',
    medium: 'english',
    now: 1000,
  });
  paper.questions[0].status = 'mastered';
  paper.questions[1].status = 'redo';
  paper.questions[1].mistakeNote = 'Missed sign convention in Lenz Law';
  paper.questions[1].updatedAt = 2000;
  paper.questions[2].status = 'silly';
  paper.questions[2].updatedAt = 3000;

  const stats = computePaperStats(paper);
  assert.equal(stats.mastered, 1);
  assert.equal(stats.redo, 1);
  assert.equal(stats.silly, 1);
  assert.equal(stats.unattempted, 57);

  const queue = extractRedoQueue([paper]);
  assert.equal(queue.length, 2);
  assert.equal(queue[0].question.status, 'redo');
});
