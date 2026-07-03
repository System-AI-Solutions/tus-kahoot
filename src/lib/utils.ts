export function formatTopic(slug: string | null | undefined): string {
  if (!slug) return '';

  return slug
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function formatExamSource(
  sourceFile: string | null | undefined,
  questionNumber: number | null | undefined
): string {
  const fileLabel = sourceFile
    ? sourceFile.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') ?? ''
    : '';
  const numberLabel =
    typeof questionNumber === 'number' && Number.isFinite(questionNumber)
      ? `Q${questionNumber}`
      : '';

  return [fileLabel, numberLabel].filter(Boolean).join(' · ');
}

export function calculateScore(timerOn: boolean, timeRemainingMs: number): number {
  if (!timerOn) return 1000;
  if (timeRemainingMs <= 0) return 1000;
  // timer ON = 1000 + (remaining_ms / 30000 * 200) bonus
  const bonus = (timeRemainingMs / 30000) * 200;
  return Math.round(1000 + bonus);
}

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}
