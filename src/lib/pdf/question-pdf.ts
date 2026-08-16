import { jsPDF } from 'jspdf';
import {
  compareExamMeta,
  examGroupKey,
  formatExamLabel,
  parseExamSource,
  type ExamSourceMeta,
} from '@/lib/exam-source';
import { getOptionExplanation, type QuestionExplanation } from '@/lib/explanations';
import { ANSWER_LETTERS } from '@/lib/constants';

export interface PdfQuestionRow {
  question_number: number | null;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  option_e: string | null;
  correct_answer: 'A' | 'B' | 'C' | 'D' | 'E';
  source_file: string | null;
  explanation?: QuestionExplanation | null;
}

export interface QuestionPdfFonts {
  regular: string; // base64 TTF
  bold: string; // base64 TTF
}

export interface QuestionPdfOptions {
  filtersSummary?: string;
  includeAnswerKey: boolean;
  includeExplanations: boolean;
  fonts: QuestionPdfFonts;
}

interface ExamGroup {
  meta: ExamSourceMeta;
  label: string;
  questions: PdfQuestionRow[];
}

interface Cursor {
  y: number;
}

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN = 16;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const BOTTOM_LIMIT = PAGE_HEIGHT - 18;
const OPTION_INDENT = 8;
const STEM_INDENT = 11;
const STEM_LINE_HEIGHT = 5;
const OPTION_LINE_HEIGHT = 4.6;

// Nimo's study format: questions grouped by original exam paper
// (year / 1st-2nd exam / K-T), numbered as in the original exam, options
// printed plain with nothing marking the correct answer. The answer key, if
// requested, lives on its own pages at the end.
export function buildQuestionPdf(rows: PdfQuestionRow[], options: QuestionPdfOptions): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  doc.addFileToVFS('Roboto-Regular.ttf', options.fonts.regular);
  doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal');
  doc.addFileToVFS('Roboto-Bold.ttf', options.fonts.bold);
  doc.addFont('Roboto-Bold.ttf', 'Roboto', 'bold');
  doc.setFont('Roboto', 'normal');

  const groups = groupByExam(rows);
  const cursor: Cursor = { y: MARGIN };

  renderDocumentHeader(doc, cursor, rows.length, options);

  for (const group of groups) {
    renderGroupHeader(doc, cursor, group);
    for (const [index, question] of group.questions.entries()) {
      renderQuestion(doc, cursor, question, index);
    }
    cursor.y += 4;
  }

  if (options.includeAnswerKey) {
    renderAnswerKey(doc, cursor, groups);
  }

  if (options.includeExplanations) {
    renderExplanations(doc, cursor, groups);
  }

  addPageNumbers(doc);
  return doc;
}

function breakPageIfNeeded(doc: jsPDF, cursor: Cursor, neededHeight: number): void {
  if (cursor.y + neededHeight > BOTTOM_LIMIT) {
    doc.addPage();
    cursor.y = MARGIN;
  }
}

function groupByExam(rows: PdfQuestionRow[]): ExamGroup[] {
  const byKey = new Map<string, ExamGroup>();
  for (const row of rows) {
    const meta = parseExamSource(row.source_file);
    const key = examGroupKey(meta);
    let group = byKey.get(key);
    if (!group) {
      group = { meta, label: formatExamLabel(meta), questions: [] };
      byKey.set(key, group);
    }
    group.questions.push(row);
  }

  const groups = [...byKey.values()];
  groups.sort((a, b) => compareExamMeta(a.meta, b.meta));
  for (const group of groups) {
    group.questions.sort(
      (a, b) =>
        (a.question_number ?? Number.MAX_SAFE_INTEGER) -
        (b.question_number ?? Number.MAX_SAFE_INTEGER)
    );
  }
  return groups;
}

function renderDocumentHeader(
  doc: jsPDF,
  cursor: Cursor,
  questionCount: number,
  options: QuestionPdfOptions
): void {
  doc.setFont('Roboto', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(20);
  doc.text('TUS Question Bank', MARGIN, cursor.y + 6);
  cursor.y += 10;

  doc.setFont('Roboto', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(90);
  const generatedOn = new Date().toISOString().slice(0, 10);
  const summaryEntries = [
    options.filtersSummary || 'All questions',
    `${questionCount} question${questionCount === 1 ? '' : 's'} • generated ${generatedOn}`,
    options.includeAnswerKey ? 'Answer key: last pages' : 'Answer key: not included',
  ];
  if (options.includeExplanations) {
    summaryEntries.push('Explanations: after the answer key');
  }
  const summaryLines = doc.splitTextToSize(
    summaryEntries.join('\n'),
    CONTENT_WIDTH
  ) as string[];
  doc.text(summaryLines, MARGIN, cursor.y + 4);
  cursor.y += summaryLines.length * 4.5 + 6;

  doc.setDrawColor(200);
  doc.line(MARGIN, cursor.y, PAGE_WIDTH - MARGIN, cursor.y);
  cursor.y += 6;
}

function renderGroupHeader(doc: jsPDF, cursor: Cursor, group: ExamGroup): void {
  // Keep the header attached to at least the first lines of its group.
  breakPageIfNeeded(doc, cursor, 34);

  doc.setFillColor(235, 238, 245);
  doc.rect(MARGIN, cursor.y, CONTENT_WIDTH, 9, 'F');
  doc.setFont('Roboto', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(20);
  doc.text(group.label, MARGIN + 3, cursor.y + 6.2);
  doc.setFont('Roboto', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(110);
  doc.text(
    `${group.questions.length} question${group.questions.length === 1 ? '' : 's'}`,
    PAGE_WIDTH - MARGIN - 3,
    cursor.y + 6.2,
    { align: 'right' }
  );
  cursor.y += 13;
}

function questionOptions(question: PdfQuestionRow): Array<[string, string]> {
  const options: Array<[string, string]> = [
    ['A', question.option_a],
    ['B', question.option_b],
    ['C', question.option_c],
    ['D', question.option_d],
  ];
  if (question.option_e) options.push(['E', question.option_e]);
  return options;
}

function questionLabel(question: PdfQuestionRow, indexInGroup: number): string {
  return `${question.question_number ?? indexInGroup + 1}.`;
}

function renderQuestion(
  doc: jsPDF,
  cursor: Cursor,
  question: PdfQuestionRow,
  indexInGroup: number
): void {
  doc.setFontSize(11);
  const stemLines = doc.splitTextToSize(
    question.question_text,
    CONTENT_WIDTH - STEM_INDENT
  ) as string[];

  doc.setFontSize(10.5);
  const optionRows = questionOptions(question).map(
    ([letter, text]) =>
      doc.splitTextToSize(`${letter}) ${text}`, CONTENT_WIDTH - OPTION_INDENT) as string[]
  );

  const stemHeight = stemLines.length * STEM_LINE_HEIGHT;
  const optionsHeight = optionRows.reduce(
    (sum, lines) => sum + lines.length * OPTION_LINE_HEIGHT + 1,
    0
  );
  const blockHeight = stemHeight + 2 + optionsHeight;

  // Start the whole question on a new page when it fits there but not here;
  // very tall questions flow across pages line by line instead.
  const fitsOnFreshPage = blockHeight <= BOTTOM_LIMIT - MARGIN;
  breakPageIfNeeded(doc, cursor, fitsOnFreshPage ? blockHeight : 20);

  doc.setFont('Roboto', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(20);
  doc.text(questionLabel(question, indexInGroup), MARGIN, cursor.y + 4);

  doc.setFont('Roboto', 'normal');
  for (const line of stemLines) {
    breakPageIfNeeded(doc, cursor, STEM_LINE_HEIGHT);
    doc.text(line, MARGIN + STEM_INDENT, cursor.y + 4);
    cursor.y += STEM_LINE_HEIGHT;
  }
  cursor.y += 2;

  doc.setFontSize(10.5);
  doc.setTextColor(45);
  for (const lines of optionRows) {
    for (const line of lines) {
      breakPageIfNeeded(doc, cursor, OPTION_LINE_HEIGHT);
      doc.text(line, MARGIN + OPTION_INDENT, cursor.y + 4);
      cursor.y += OPTION_LINE_HEIGHT;
    }
    cursor.y += 1;
  }

  doc.setTextColor(20);
  cursor.y += 5;
}

function renderAnswerKey(doc: jsPDF, cursor: Cursor, groups: ExamGroup[]): void {
  doc.addPage();
  cursor.y = MARGIN;

  doc.setFont('Roboto', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(20);
  doc.text('Answer Key', MARGIN, cursor.y + 5);
  cursor.y += 12;

  const ANSWERS_PER_LINE = 6;
  for (const group of groups) {
    breakPageIfNeeded(doc, cursor, 18);
    doc.setFont('Roboto', 'bold');
    doc.setFontSize(11);
    doc.text(group.label, MARGIN, cursor.y + 4);
    cursor.y += 7;

    doc.setFont('Roboto', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(45);
    const entries = group.questions.map(
      (question, index) =>
        `${questionLabel(question, index).replace(/\.$/, '')} — ${question.correct_answer}`
    );
    for (let i = 0; i < entries.length; i += ANSWERS_PER_LINE) {
      breakPageIfNeeded(doc, cursor, 5.5);
      entries.slice(i, i + ANSWERS_PER_LINE).forEach((entry, column) => {
        doc.text(entry, MARGIN + column * (CONTENT_WIDTH / ANSWERS_PER_LINE), cursor.y + 4);
      });
      cursor.y += 5.5;
    }
    doc.setTextColor(20);
    cursor.y += 4;
  }
}

interface ExplanationBlock {
  heading: string | null;
  text: string;
}

interface ExplanationEntry {
  question: PdfQuestionRow;
  indexInGroup: number;
  blocks: ExplanationBlock[];
}

// Same rule as the on-screen panel: the authored explanation is the main text,
// falling back to the correct option's own note, and every other option note
// follows as "why not" lines.
function explanationBlocks(question: PdfQuestionRow): ExplanationBlock[] {
  const source = question.explanation;
  if (!source) return [];

  const authoredMain = source.explanation?.trim() || null;
  const correctNote = getOptionExplanation(source, question.correct_answer);
  const main = authoredMain ?? correctNote;

  const blocks: ExplanationBlock[] = [];
  if (main) {
    blocks.push({ heading: `Correct answer: ${question.correct_answer}`, text: main });
  }

  for (const letter of ANSWER_LETTERS) {
    if (letter === question.correct_answer && !authoredMain) continue;
    const note = getOptionExplanation(source, letter);
    if (!note) continue;
    blocks.push({ heading: null, text: `${letter}) ${note}` });
  }

  return blocks;
}

function renderExplanations(doc: jsPDF, cursor: Cursor, groups: ExamGroup[]): void {
  const groupsWithExplanations = groups
    .map((group) => ({
      label: group.label,
      entries: group.questions
        .map((question, indexInGroup) => ({
          question,
          indexInGroup,
          blocks: explanationBlocks(question),
        }))
        .filter((entry): entry is ExplanationEntry => entry.blocks.length > 0),
    }))
    .filter((group) => group.entries.length > 0);

  if (groupsWithExplanations.length === 0) return;

  doc.addPage();
  cursor.y = MARGIN;

  doc.setFont('Roboto', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(20);
  doc.text('Explanations', MARGIN, cursor.y + 5);
  cursor.y += 12;

  for (const group of groupsWithExplanations) {
    breakPageIfNeeded(doc, cursor, 20);
    doc.setFont('Roboto', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(20);
    doc.text(group.label, MARGIN, cursor.y + 4);
    cursor.y += 8;

    for (const entry of group.entries) {
      renderQuestionExplanation(doc, cursor, entry);
    }
    cursor.y += 3;
  }
}

function renderQuestionExplanation(doc: jsPDF, cursor: Cursor, entry: ExplanationEntry): void {
  breakPageIfNeeded(doc, cursor, 16);

  doc.setFont('Roboto', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(20);
  doc.text(questionLabel(entry.question, entry.indexInGroup), MARGIN, cursor.y + 4);

  doc.setFontSize(10);
  for (const block of entry.blocks) {
    if (block.heading) {
      breakPageIfNeeded(doc, cursor, OPTION_LINE_HEIGHT);
      doc.setFont('Roboto', 'bold');
      doc.setTextColor(20);
      doc.text(block.heading, MARGIN + STEM_INDENT, cursor.y + 4);
      cursor.y += OPTION_LINE_HEIGHT;
    }

    doc.setFont('Roboto', 'normal');
    doc.setTextColor(45);
    const lines = doc.splitTextToSize(block.text, CONTENT_WIDTH - STEM_INDENT) as string[];
    for (const line of lines) {
      breakPageIfNeeded(doc, cursor, OPTION_LINE_HEIGHT);
      doc.text(line, MARGIN + STEM_INDENT, cursor.y + 4);
      cursor.y += OPTION_LINE_HEIGHT;
    }
    cursor.y += 1.5;
  }

  doc.setTextColor(20);
  cursor.y += 3.5;
}

function addPageNumbers(doc: jsPDF): void {
  const pageCount = doc.getNumberOfPages();
  doc.setFont('Roboto', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(140);
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.text(`${page} / ${pageCount}`, PAGE_WIDTH / 2, PAGE_HEIGHT - 8, { align: 'center' });
  }
}

export function questionPdfFileName(filtersSummary: string | undefined): string {
  const slug = (filtersSummary || 'all-questions')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  const date = new Date().toISOString().slice(0, 10);
  return `tus-questions-${slug || 'all'}-${date}.pdf`;
}

let cachedFonts: QuestionPdfFonts | null = null;

async function fetchFontAsBase64(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load PDF font (${url})`);
  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export async function loadPdfFonts(): Promise<QuestionPdfFonts> {
  if (cachedFonts) return cachedFonts;
  const [regular, bold] = await Promise.all([
    fetchFontAsBase64('/fonts/Roboto-Regular.ttf'),
    fetchFontAsBase64('/fonts/Roboto-Bold.ttf'),
  ]);
  cachedFonts = { regular, bold };
  return cachedFonts;
}

export async function downloadQuestionPdf(
  rows: PdfQuestionRow[],
  options: Omit<QuestionPdfOptions, 'fonts'>
): Promise<void> {
  const fonts = await loadPdfFonts();
  const doc = buildQuestionPdf(rows, { ...options, fonts });
  doc.save(questionPdfFileName(options.filtersSummary));
}
