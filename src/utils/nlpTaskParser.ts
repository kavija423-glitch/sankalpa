import type { PriorityLevel, RecurrenceRule, SubjectKey } from '../types/app';

export interface ParsedTaskInput {
  title: string;
  subject: SubjectKey;
  durationMinutes: number;
  priority: PriorityLevel;
  dueDate: string; // YYYY-MM-DD
  recurrence: RecurrenceRule;
}

export function toISODateLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addDaysISO(baseISO: string, days: number): string {
  const [y, m, d] = baseISO.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() + days);
  return toISODateLocal(dt);
}

const WEEKDAY_MAP: Record<string, number> = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tuesday: 2,
  wed: 3,
  wednesday: 3,
  thu: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
};

export function parseNaturalLanguageTask(rawInput: string, referenceDate: Date = new Date()): ParsedTaskInput {
  let working = rawInput.trim();
  const todayISO = toISODateLocal(referenceDate);

  // 1. Subject tag (#Physics, #Maths, #CombinedMaths, #ICT, #General)
  let subject: SubjectKey = 'general';
  const subjectRegex = /#(physics|phy|maths|math|combinedmaths|ict|cs|general)\b/i;
  const subjectMatch = working.match(subjectRegex);
  if (subjectMatch) {
    const token = subjectMatch[1].toLowerCase();
    if (token === 'physics' || token === 'phy') subject = 'physics';
    else if (token === 'maths' || token === 'math' || token === 'combinedmaths') subject = 'maths';
    else if (token === 'ict' || token === 'cs') subject = 'ict';
    else subject = 'general';
    working = working.replace(subjectRegex, ' ');
  }

  // 2. Duration (60m, 45min, 1.5h, 2h)
  let durationMinutes = 45;
  const durationRegex = /\b(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours|m|min|mins|minute|minutes)\b/i;
  const durationMatch = working.match(durationRegex);
  if (durationMatch) {
    const val = parseFloat(durationMatch[1]);
    const unit = durationMatch[2].toLowerCase();
    if (unit.startsWith('h')) {
      durationMinutes = Math.max(15, Math.round((val * 60) / 15) * 15);
    } else {
      durationMinutes = Math.max(15, Math.round(val / 15) * 15);
    }
    working = working.replace(durationRegex, ' ');
  }

  // 3. Priority (!high, !med, !medium, !low)
  let priority: PriorityLevel = 'medium';
  const priorityRegex = /!(high|med|medium|low)\b/i;
  const priorityMatch = working.match(priorityRegex);
  if (priorityMatch) {
    const p = priorityMatch[1].toLowerCase();
    if (p === 'high') priority = 'high';
    else if (p === 'low') priority = 'low';
    else priority = 'medium';
    working = working.replace(priorityRegex, ' ');
  }

  // 4. Recurrence (every weekday, every day, daily, weekly)
  let recurrence: RecurrenceRule = 'none';
  const recurrencePatterns: Array<[RegExp, RecurrenceRule]> = [
    [/\bevery\s+weekday(s)?\b/i, 'weekdays'],
    [/\bweekdays?\b/i, 'weekdays'],
    [/\bevery\s+day\b/i, 'daily'],
    [/\bdaily\b/i, 'daily'],
    [/\bevery\s+week\b/i, 'weekly'],
    [/\bweekly\b/i, 'weekly'],
  ];
  for (const [pattern, rule] of recurrencePatterns) {
    if (pattern.test(working)) {
      recurrence = rule;
      working = working.replace(pattern, ' ');
      break;
    }
  }

  // 5. Due date (@today, @tomorrow, @YYYY-MM-DD, @monday..@sunday)
  let dueDate = todayISO;
  const dateRegex = /@(today|tomorrow|tmr|\d{4}-\d{2}-\d{2}|sun(?:day)?|mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?)\b/i;
  const dateMatch = working.match(dateRegex);
  if (dateMatch) {
    const token = dateMatch[1].toLowerCase();
    if (token === 'today') {
      dueDate = todayISO;
    } else if (token === 'tomorrow' || token === 'tmr') {
      dueDate = addDaysISO(todayISO, 1);
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(token)) {
      dueDate = token;
    } else if (token in WEEKDAY_MAP) {
      const targetDay = WEEKDAY_MAP[token];
      const currentDay = referenceDate.getDay();
      let delta = targetDay - currentDay;
      if (delta <= 0) delta += 7;
      dueDate = addDaysISO(todayISO, delta);
    }
    working = working.replace(dateRegex, ' ');
  }

  const cleanTitle = working.replace(/\s+/g, ' ').trim();

  return {
    title: cleanTitle || 'Focused Study Session',
    subject,
    durationMinutes,
    priority,
    dueDate,
    recurrence,
  };
}
