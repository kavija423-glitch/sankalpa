import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNaturalLanguageTask, toISODateLocal, addDaysISO } from './nlpTaskParser';

test('parses #Physics 60m !high @tomorrow every weekday accurately', () => {
  const ref = new Date(2026, 10, 17, 10, 0, 0); // 2026-11-17
  const parsed = parseNaturalLanguageTask('#Physics Electromagnetism Essay Drill 60m !high @tomorrow every weekday', ref);

  assert.equal(parsed.title, 'Electromagnetism Essay Drill');
  assert.equal(parsed.subject, 'physics');
  assert.equal(parsed.durationMinutes, 60);
  assert.equal(parsed.priority, 'high');
  assert.equal(parsed.dueDate, '2026-11-18');
  assert.equal(parsed.recurrence, 'weekdays');
});

test('parses #Maths hours and explicit ISO date', () => {
  const ref = new Date(2026, 10, 17, 10, 0, 0);
  const parsed = parseNaturalLanguageTask('#Maths Integration by Parts 1.5h !low @2026-11-25 weekly', ref);

  assert.equal(parsed.title, 'Integration by Parts');
  assert.equal(parsed.subject, 'maths');
  assert.equal(parsed.durationMinutes, 90);
  assert.equal(parsed.priority, 'low');
  assert.equal(parsed.dueDate, '2026-11-25');
  assert.equal(parsed.recurrence, 'weekly');
});

test('applies sensible defaults when tokens omitted', () => {
  const ref = new Date(2026, 10, 17, 10, 0, 0);
  const parsed = parseNaturalLanguageTask('Revise Boolean Algebra Karnaugh Maps', ref);

  assert.equal(parsed.title, 'Revise Boolean Algebra Karnaugh Maps');
  assert.equal(parsed.subject, 'general');
  assert.equal(parsed.durationMinutes, 45);
  assert.equal(parsed.priority, 'medium');
  assert.equal(parsed.dueDate, toISODateLocal(ref));
  assert.equal(parsed.recurrence, 'none');
  assert.equal(addDaysISO('2026-11-30', 1), '2026-12-01');
});
