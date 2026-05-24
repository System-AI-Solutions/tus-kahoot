export const SECTIONS = [
  { id: 'all', label: 'All' },
  { id: 'basic_sciences', label: 'Basic Sciences' },
  { id: 'clinical_sciences', label: 'Clinical Sciences' },
] as const;

export const SUBTOPIC_TAGS = [
  'anatomy',
  'histology',
  'embryology',
  'physiology',
  'biochemistry',
  'microbiology',
  'immunology',
  'pathology',
  'pharmacology',
  'biostatistics',
  'public_health',
  'internal_medicine',
  'surgery',
  'pediatrics',
  'obstetrics_gynecology',
  'psychiatry',
  'neurology',
  'radiology',
  'orthopedics',
  'ophthalmology',
  'ent',
  'dermatology',
  'cardiology',
  'urology',
  'other',
] as const;

export type SubtopicTag = (typeof SUBTOPIC_TAGS)[number];

export function isSubtopicTag(value: unknown): value is SubtopicTag {
  return typeof value === 'string' && (SUBTOPIC_TAGS as readonly string[]).includes(value);
}

export const ANSWER_COLORS = {
  A: 'bg-[var(--color-answer-a)]',
  B: 'bg-[var(--color-answer-b)]',
  C: 'bg-[var(--color-answer-c)]',
  D: 'bg-[var(--color-answer-d)]',
  E: 'bg-[var(--color-answer-e)]',
} as const;

export const ANSWER_LETTERS = ['A', 'B', 'C', 'D', 'E'] as const;

export type AnswerLetter = (typeof ANSWER_LETTERS)[number];

export function isAnswerLetter(value: unknown): value is AnswerLetter {
  return typeof value === 'string' && (ANSWER_LETTERS as readonly string[]).includes(value);
}

export const TIMER_DURATION_MS = 30000;
export const MAX_QUESTIONS = 120;
