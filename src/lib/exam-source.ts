// Parses question source_file names (e.g. "2018TUS_1K.pdf") into structured
// exam metadata: year, 1st/2nd exam of that year, and track (K = Klinik /
// Clinical, T = Temel / Basic Sciences). Parsing is deliberately liberal —
// source files come from several naming conventions — and anything
// unparsable falls back to grouping by the raw file name.

export interface ExamSourceMeta {
  year: number | null;
  examNo: 1 | 2 | null;
  track: 'K' | 'T' | null;
  raw: string;
}

const TRACK_WORDS: Array<[RegExp, 'K' | 'T']> = [
  [/klinik|clinical/i, 'K'],
  [/temel|basic/i, 'T'],
];

const EXAM_NO_WORDS: Array<[RegExp, 1 | 2]> = [
  [/1st|first|nisan|april|ilkbahar|spring/i, 1],
  [/2nd|second|eyl[uü]l|september|sonbahar|autumn|fall/i, 2],
];

export function parseExamSource(sourceFile: string | null | undefined): ExamSourceMeta {
  const withoutPath = (sourceFile || '').split(/[\\/]/).pop() || '';
  const raw = withoutPath.replace(/\.[A-Za-z0-9]+$/, '').trim();

  const meta: ExamSourceMeta = { year: null, examNo: null, track: null, raw };
  if (!raw) return meta;

  const yearMatch = raw.match(/(?:19|20)\d{2}/);
  if (yearMatch) meta.year = Number(yearMatch[0]);

  // Remove the year so its digits can't be mistaken for an exam number
  // (e.g. the trailing "2" of "2012" in "2012K").
  const rest = yearMatch ? raw.replace(yearMatch[0], ' ') : raw;

  // Digit + letter pairs: "1K", "2_T", "K1", "T-2".
  const digitTrack = rest.match(/([12])\s*[_\-.\s]*([KT])(?![A-Za-z])/i);
  const trackDigit = rest.match(/(?<![A-Za-z])([KT])\s*[_\-.\s]*([12])(?!\d)/i);
  if (digitTrack) {
    meta.examNo = Number(digitTrack[1]) as 1 | 2;
    meta.track = digitTrack[2].toUpperCase() as 'K' | 'T';
  } else if (trackDigit) {
    meta.track = trackDigit[1].toUpperCase() as 'K' | 'T';
    meta.examNo = Number(trackDigit[2]) as 1 | 2;
  }

  if (!meta.track) {
    for (const [pattern, track] of TRACK_WORDS) {
      if (pattern.test(rest)) {
        meta.track = track;
        break;
      }
    }
  }
  if (!meta.track) {
    const lone = rest.match(/(?<![A-Za-z])([KT])(?![A-Za-z])/i);
    if (lone) meta.track = lone[1].toUpperCase() as 'K' | 'T';
  }

  if (!meta.examNo) {
    for (const [pattern, examNo] of EXAM_NO_WORDS) {
      if (pattern.test(rest)) {
        meta.examNo = examNo;
        break;
      }
    }
  }
  if (!meta.examNo) {
    const lone = rest.match(/(?<!\d)([12])(?!\d)/);
    if (lone) meta.examNo = Number(lone[1]) as 1 | 2;
  }

  return meta;
}

const EXAM_NO_LABELS: Record<1 | 2, string> = { 1: '1st Exam', 2: '2nd Exam' };
const TRACK_LABELS: Record<'K' | 'T', string> = {
  K: 'K (Clinical)',
  T: 'T (Basic Sciences)',
};

export function formatExamLabel(meta: ExamSourceMeta): string {
  const parts: string[] = [];
  if (meta.year) parts.push(`${meta.year} TUS`);
  if (meta.examNo) parts.push(EXAM_NO_LABELS[meta.examNo]);
  if (meta.track) parts.push(TRACK_LABELS[meta.track]);
  if (parts.length > 0) return parts.join(' • ');
  return meta.raw || 'Unknown source';
}

// One-line provenance for a single question: the exam paper it claims to come
// from plus the number it claims to hold in that paper. Pair it with the raw
// source_file in a title attribute so a suspicious claim can be checked against
// the original file.
export function formatExamProvenance(
  sourceFile: string | null | undefined,
  questionNumber: number | null | undefined
): string {
  const label = formatExamLabel(parseExamSource(sourceFile));
  const numberLabel =
    typeof questionNumber === 'number' && Number.isFinite(questionNumber)
      ? `#${questionNumber}`
      : '';

  return [label, numberLabel].filter(Boolean).join(' · ');
}

// Stable key so questions from the same exam paper group together even when
// their source_file strings differ cosmetically.
export function examGroupKey(meta: ExamSourceMeta): string {
  if (meta.year || meta.examNo || meta.track) {
    return `${meta.year ?? '????'}|${meta.examNo ?? '?'}|${meta.track ?? '?'}`;
  }
  return `raw|${meta.raw.toLowerCase()}`;
}

// Order: year asc (unknown last), 1st exam before 2nd (unknown last),
// T (Temel, morning session) before K (Klinik), unknown-source groups last.
export function compareExamMeta(a: ExamSourceMeta, b: ExamSourceMeta): number {
  const yearA = a.year ?? Number.MAX_SAFE_INTEGER;
  const yearB = b.year ?? Number.MAX_SAFE_INTEGER;
  if (yearA !== yearB) return yearA - yearB;

  const examA = a.examNo ?? 9;
  const examB = b.examNo ?? 9;
  if (examA !== examB) return examA - examB;

  const trackOrder = { T: 0, K: 1 } as const;
  const trackA = a.track ? trackOrder[a.track] : 9;
  const trackB = b.track ? trackOrder[b.track] : 9;
  if (trackA !== trackB) return trackA - trackB;

  return a.raw.localeCompare(b.raw);
}
