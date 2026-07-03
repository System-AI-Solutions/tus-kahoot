import type { AnswerRecord } from '@/lib/stores/quiz-store';
import { formatExamSource, formatTopic } from '@/lib/utils';

export interface PdfQuestion {
  join_key: string;
  question_number: number | null;
  question_text: string | null;
  option_a: string | null;
  option_b: string | null;
  option_c: string | null;
  option_d: string | null;
  option_e: string | null;
  correct_answer: string | null;
  source_file: string | null;
  topic: string | null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderOption(
  letter: 'A' | 'B' | 'C' | 'D' | 'E',
  text: string | null,
  correctLetter: string | null,
  userLetter: string | null | undefined
): string {
  if (typeof text !== 'string' || text.trim().length === 0) return '';

  const isCorrect = letter === correctLetter;
  const isUserWrong = letter === userLetter && !isCorrect;
  const classes = ['option', isCorrect && 'correct', isUserWrong && 'wrong']
    .filter(Boolean)
    .join(' ');
  const marker = isCorrect ? ' ✓' : isUserWrong ? ' ✗' : '';

  return `<li class="${classes}"><span class="letter">${letter})</span> ${escapeHtml(text)}${marker}</li>`;
}

function renderQuestion(
  question: PdfQuestion,
  index: number,
  answer: AnswerRecord | undefined
): string {
  const source = formatExamSource(question.source_file, question.question_number);
  const topic = formatTopic(question.topic);
  const badges = [source, topic]
    .filter(Boolean)
    .map((badge) => `<span class="badge">${escapeHtml(badge)}</span>`)
    .join(' ');

  const options = (['A', 'B', 'C', 'D', 'E'] as const)
    .map((letter) =>
      renderOption(
        letter,
        question[`option_${letter.toLowerCase()}` as 'option_a'],
        question.correct_answer,
        answer?.userAnswer
      )
    )
    .join('');

  const verdict = answer
    ? answer.userAnswer
      ? `Your answer: ${escapeHtml(answer.userAnswer)} — ${answer.isCorrect ? 'Correct' : `Wrong (correct: ${escapeHtml(question.correct_answer ?? '?')})`}`
      : `Skipped (correct: ${escapeHtml(question.correct_answer ?? '?')})`
    : '';

  return `
    <article class="question">
      <header>
        <span class="number">${index + 1}.</span>
        ${badges}
      </header>
      <p class="stem">${escapeHtml(question.question_text ?? 'Question text unavailable')}</p>
      <ol class="options">${options}</ol>
      ${verdict ? `<p class="verdict ${answer?.isCorrect ? 'ok' : 'bad'}">${verdict}</p>` : ''}
    </article>`;
}

/**
 * Opens a print-formatted copy of the quiz in a new tab and triggers the
 * browser print dialog, where the user can save it as a PDF. Browser printing
 * is used instead of a PDF library so Turkish characters render correctly
 * without bundling fonts.
 *
 * Returns false when the popup was blocked.
 */
export function openQuizPdf({
  title,
  questions,
  answersByJoinKey,
}: {
  title: string;
  questions: PdfQuestion[];
  answersByJoinKey?: Map<string, AnswerRecord>;
}): boolean {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return false;

  const body = questions
    .map((question, index) => renderQuestion(question, index, answersByJoinKey?.get(question.join_key)))
    .join('');

  const answerKey = questions
    .map((question, index) => {
      const source = formatExamSource(question.source_file, question.question_number);
      return `<tr><td>${index + 1}</td><td>${escapeHtml(source)}</td><td>${escapeHtml(question.correct_answer ?? '?')}</td></tr>`;
    })
    .join('');

  printWindow.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Georgia, 'Times New Roman', serif; color: #111; margin: 32px auto; max-width: 760px; padding: 0 16px; }
  h1 { font-size: 20px; border-bottom: 2px solid #111; padding-bottom: 8px; }
  .meta { color: #555; font-size: 12px; margin-bottom: 24px; }
  .question { margin-bottom: 20px; break-inside: avoid; }
  .question header { display: flex; align-items: baseline; gap: 8px; margin-bottom: 4px; }
  .number { font-weight: bold; }
  .badge { font-size: 11px; background: #eee; border: 1px solid #ccc; border-radius: 4px; padding: 1px 6px; }
  .stem { margin: 4px 0 8px; font-weight: 600; }
  .options { list-style: none; margin: 0; padding-left: 16px; }
  .option { margin: 2px 0; }
  .option .letter { font-weight: bold; }
  .option.correct { font-weight: bold; }
  .option.wrong { text-decoration: line-through; }
  .verdict { font-size: 12px; margin: 6px 0 0 16px; }
  .verdict.ok { color: #14652d; }
  .verdict.bad { color: #a31212; }
  .answer-key { margin-top: 32px; page-break-before: always; }
  .answer-key table { border-collapse: collapse; width: 100%; font-size: 13px; }
  .answer-key th, .answer-key td { border: 1px solid #999; padding: 4px 8px; text-align: left; }
  .print-button { position: fixed; top: 12px; right: 12px; padding: 8px 16px; font-size: 14px; cursor: pointer; }
  @media print { .print-button { display: none; } }
</style>
</head>
<body>
<button class="print-button" onclick="window.print()">Print / Save as PDF</button>
<h1>${escapeHtml(title)}</h1>
<p class="meta">${questions.length} questions · Correct options are marked with ✓ and shown in bold.</p>
${body}
<section class="answer-key">
  <h1>Answer Key</h1>
  <table>
    <thead><tr><th>#</th><th>Source</th><th>Answer</th></tr></thead>
    <tbody>${answerKey}</tbody>
  </table>
</section>
<script>
  window.addEventListener('load', function () {
    setTimeout(function () { window.print(); }, 300);
  });
</script>
</body>
</html>`);
  printWindow.document.close();

  return true;
}
