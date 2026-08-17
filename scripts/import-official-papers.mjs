#!/usr/bin/env node
// Imports official OSYM TUS exam papers as reference text (issue #12).
//
// Reads PDF booklets named YYYYTUS_<1|2><T|K>.pdf from the intake folder
// (official-papers/ at the repo root, gitignored - OSYM copyright), parses
// every question plus the answer key printed at the back of each booklet,
// and writes rows for public.official_questions.
//
// Usage:
//   node scripts/import-official-papers.mjs [--dir <folder>] [--out <folder>] [--push]
//
//   --dir   intake folder with the PDFs        (default: ./official-papers)
//   --out   output folder for parsed artifacts (default: <dir>/parsed)
//   --push  also upsert the rows into Supabase. Needs SUPABASE_URL and
//           SUPABASE_SERVICE_ROLE_KEY in the environment (NEXT_PUBLIC_
//           SUPABASE_URL from .env.local works for the URL). Without --push
//           the script is fully offline.
//
// Outputs under --out (all inside the gitignored intake folder by default,
// because parsed question text is as copyrighted as the PDFs):
//   <paper>.json                one file per paper: rows + parse warnings
//   sql/<paper>.sql             idempotent upserts, safe to paste into the
//                               Supabase SQL editor one paper at a time
//   coverage.md                 which exams are loaded, counts, gaps
//
// Extraction prefers python + PyMuPDF (pip install pymupdf) via
// scripts/extract-official-paper-text.py and falls back to pdftotext
// (Xpdf or Poppler) on PATH when python is unavailable.
//
// Parsing notes, learned from the real booklets:
// - Question pages are two columns, and the 2013-2017 booklets carry a
//   rebuilt text layer whose drawing order is scrambled; only the per-word
//   coordinates are reliable. The PyMuPDF helper rebuilds reading order from
//   word boxes (left column, then right, per page). The pdftotext -layout
//   fallback splits pages at a detected whitespace gutter instead, which is
//   good enough for the cleanly-typeset 2018+ booklets only.
// - An OSYM watermark bleeds single letters (O/S/Y/M variants) into line
//   starts; they are stripped, at the small risk of eating a real leading
//   "M " token (accepted: downstream verification is fuzzy anyway).
// - The answer key at the back lists "N. X" pairs in a column grid, with
//   cancelled questions marked "Iptal" (sometimes with a stray watermark
//   letter inside the word).

import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

const PAPER_NAME = /^(\d{4})TUS_([12])([TK])\.pdf$/i;
const DEFAULT_EXPECTED = 120;
const WATERMARK = /[ÖSYM]/u;

function parseArgs(argv) {
  const args = { dir: 'official-papers', out: null, push: false };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dir') args.dir = argv[++i];
    else if (arg === '--out') args.out = argv[++i];
    else if (arg === '--push') args.push = true;
    else if (arg === '--help' || arg === '-h') {
      console.log('node scripts/import-official-papers.mjs [--dir <folder>] [--out <folder>] [--push]');
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(1);
    }
  }
  args.dir = resolve(args.dir);
  args.out = resolve(args.out ?? join(args.dir, 'parsed'));
  return args;
}

function pdfToText(pdfPath) {
  const result = spawnSync('pdftotext', ['-layout', '-enc', 'UTF-8', pdfPath, '-'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) {
    throw new Error(`pdftotext failed (is it on PATH?): ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`pdftotext exited ${result.status} for ${pdfPath}: ${result.stderr}`);
  }
  return result.stdout;
}

// Preferred extraction: word-coordinate reconstruction via PyMuPDF, which is
// the only reliable reading order for the 2013-2017 booklets. Returns null
// when python or pymupdf is missing so the caller can fall back.
function pyMuPdfText(pdfPath, mode) {
  for (const python of ['python', 'python3', 'py']) {
    const result = spawnSync(
      python,
      [join(SCRIPT_DIR, 'extract-official-paper-text.py'), pdfPath, '--mode', mode],
      {
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
      }
    );
    if (result.error) continue;
    if (result.status === 0 && result.stdout.trim().length > 0) return result.stdout;
    if (result.stderr?.includes('ImportError') || result.stderr?.includes('ModuleNotFoundError')) {
      return null;
    }
    if (result.status !== 0) {
      throw new Error(`extract-official-paper-text.py failed for ${pdfPath}: ${result.stderr}`);
    }
  }
  return null;
}

// Returns { columns, rows }: the column reading order for question parsing,
// and whole-page row order whose lines keep answer-key pairs adjacent.
function extractText(pdfPath, warnings) {
  const columns = pyMuPdfText(pdfPath, 'columns');
  if (columns !== null) {
    return { columns, rows: pyMuPdfText(pdfPath, 'rows') ?? columns };
  }

  warnings.push('PyMuPDF unavailable, used pdftotext -layout fallback (unreliable before 2018)');
  const raw = pdfToText(pdfPath);
  const ordered = raw
    .split('\f')
    .map((page) => pageToOrderedLines(page.split('\n')).join('\n'))
    .join('\f');
  return { columns: ordered, rows: raw };
}

// Finds a vertical whitespace gutter separating the two text columns of a
// page. Returns the split position, or null for single-column pages.
function findGutter(lines) {
  const textLines = lines.filter((line) => line.trim().length > 0);
  if (textLines.length < 6) return null;

  const width = Math.max(...textLines.map((line) => line.length));
  if (width < 60) return null;

  const from = Math.floor(width * 0.3);
  const to = Math.ceil(width * 0.7);
  let best = null;

  for (let start = from; start <= to; start += 1) {
    let end = start;
    while (end <= to) {
      const occupied = textLines.filter(
        (line) => line.length > end && !/\s/.test(line[end] ?? ' ')
      ).length;
      // Tolerate a couple of watermark letters sitting inside the gutter.
      if (occupied > 2) break;
      end += 1;
    }
    const gapWidth = end - start;
    if (gapWidth >= 4 && (!best || gapWidth > best.width)) {
      // Only a real gutter has substantial text on both sides.
      const split = start + Math.floor(gapWidth / 2);
      const left = textLines.filter((line) => line.slice(0, start).trim().length > 0).length;
      const right = textLines.filter((line) => line.slice(end).trim().length > 0).length;
      if (left >= textLines.length * 0.35 && right >= textLines.length * 0.35) {
        best = { width: gapWidth, split };
      }
    }
    if (gapWidth > 0) start = end;
  }

  return best ? best.split : null;
}

// One page of -layout text -> lines in true reading order (left column fully,
// then right column).
function pageToOrderedLines(pageText) {
  const lines = pageText.split('\n');
  const split = findGutter(lines);
  if (split === null) return lines;

  const left = [];
  const right = [];
  for (const line of lines) {
    left.push(line.slice(0, split));
    right.push(line.slice(split));
  }
  return [...left, ...right];
}

const FURNITURE_PATTERNS = [
  /Diğer sayfaya geçiniz/iu,
  /^\s*\d{1,2}\s*$/, // page numbers
  /^\s*\d{4}\s*-\s*TUS\b/iu, // running page header, e.g. "2018-TUS 1. Dönem/KTBT"
  /soru vardır/iu, // cover count line (captured separately before cleaning)
];

function cleanLine(rawLine) {
  let line = rawLine.replace(/\s+$/, '');
  if (line.trim().length === 0) return '';
  for (const pattern of FURNITURE_PATTERNS) {
    if (pattern.test(line)) return '';
  }
  // Watermark-only lines ("ÖSYM", "M Y S Ö", ...).
  if (/^[\sÖSYM]+$/u.test(line) && WATERMARK.test(line)) return '';
  line = line.trim();
  // Watermark letters glued to or prefixed before real content:
  // "ÖSY D)I ve III", "Ö25. A", "M kimyasal maddeler".
  line = line.replace(/^[ÖSYM]{2,4}(?=\s|\d|[A-E]\))/u, '');
  line = line.replace(/^[ÖSYM](?=\d)/u, '');
  line = line.replace(/^[ÖSYM]\s+/u, '');
  return line.trim();
}

function normalizeSpace(text) {
  return text
    .replace(/\s+/g, ' ')
    // Rejoin words the booklet hyphenated across a line break ("ay- rılmış").
    .replace(/(\p{Ll})- (\p{Ll})/gu, '$1$2')
    .trim();
}

const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E'];

// Splits one question block into stem + options. Option markers are "A)" ..
// "E)" appearing in order; anything before "A)" is the stem.
function splitBlock(blockText) {
  const markers = [];
  const markerPattern = /(?:^|\s)([A-E])\)/g;
  let match;
  while ((match = markerPattern.exec(blockText)) !== null) {
    const letter = match[1];
    const expectedIndex = markers.length;
    if (OPTION_LETTERS[expectedIndex] === letter) {
      markers.push({ letter, start: match.index + match[0].indexOf(letter), end: markerPattern.lastIndex });
    }
  }

  if (markers.length < 4) {
    return { stem: normalizeSpace(blockText), options: {}, note: `only_${markers.length}_option_markers` };
  }

  const stem = normalizeSpace(blockText.slice(0, markers[0].start));
  const options = {};
  markers.forEach((marker, index) => {
    const end = index + 1 < markers.length ? markers[index + 1].start : blockText.length;
    options[marker.letter] = normalizeSpace(blockText.slice(marker.end, end));
  });

  return { stem, options, note: markers.length === 4 ? 'option_e_missing' : null };
}

function isParsedQuestion(parsed) {
  return Boolean(parsed.stem) && Object.keys(parsed.options).length >= 4;
}

// The answer key at the back of the booklet: "N. X" pairs (X in A-E) or
// "N. İptal" for cancelled questions, tolerating watermark letters inside
// the word ("İBptal"). Returns Map<number, {answer, cancelled}>.
function parseAnswerKey(tailText, expected, warnings) {
  const key = new Map();
  const pairPattern = /(\d{1,3})\.\s*(İ\w{0,2}[Pp][Tt][Aa][Ll]|[A-E])(?![\p{L})])/gu;
  let match;
  while ((match = pairPattern.exec(tailText)) !== null) {
    const number = Number(match[1]);
    if (number < 1 || number > expected + 20) continue;
    const token = match[2];
    const entry = /[Pp][Tt][Aa][Ll]$/u.test(token)
      ? { answer: null, cancelled: true }
      : { answer: token, cancelled: false };
    const existing = key.get(number);
    if (existing && (existing.answer !== entry.answer || existing.cancelled !== entry.cancelled)) {
      warnings.push(`Answer key conflict for Q${number}: ${existing.answer ?? 'İptal'} vs ${entry.answer ?? 'İptal'}, dropped`);
      key.set(number, { answer: null, cancelled: false, conflict: true });
      continue;
    }
    key.set(number, entry);
  }
  return key;
}

function parsePaper(pdfPath) {
  const fileName = basename(pdfPath);
  const nameMatch = fileName.match(PAPER_NAME);
  if (!nameMatch) throw new Error(`Unexpected file name: ${fileName}`);
  const [, year, examNo, trackRaw] = nameMatch;
  const track = trackRaw.toUpperCase();
  const examGroupKey = `${year}|${examNo}|${track}`;
  const sourceFile = `${year}TUS_${examNo}${track}.pdf`;
  const warnings = [];

  const { columns: rawText, rows: rowsText } = extractText(pdfPath, warnings);

  const countMatch = rawText.match(/Bu testte\s+(\d{2,3})\s+soru vardır/iu)
    ?? rawText.match(/toplam\s+(\d{2,3})\s+soru/iu);
  const expected = countMatch ? Number(countMatch[1]) : DEFAULT_EXPECTED;
  if (!countMatch) warnings.push(`No question-count line found, assuming ${DEFAULT_EXPECTED}`);

  const text = rawText
    .split(/[\f\n]/)
    .map(cleanLine)
    .join('\n');

  // Candidate question starts: an in-range number at a line start. The rules
  // pages and shared-intro headers produce false candidates; those blocks
  // fail option validation below and are dropped.
  const candidates = [];
  const startPattern = /^(\d{1,3})\.\s+/gm;
  let match;
  while ((match = startPattern.exec(text)) !== null) {
    const number = Number(match[1]);
    if (number >= 1 && number <= expected) {
      candidates.push({ number, start: match.index, contentStart: match.index + match[0].length });
    }
  }

  const questions = new Map();
  const duplicates = [];
  candidates.forEach((candidate, index) => {
    const end = index + 1 < candidates.length ? candidates[index + 1].start : text.length;
    const parsed = splitBlock(text.slice(candidate.contentStart, end));
    const valid = isParsedQuestion(parsed);

    const existing = questions.get(candidate.number);
    if (existing?.valid && valid) {
      duplicates.push({ number: candidate.number, ...parsed, valid, start: candidate.start, end });
      warnings.push(`Q${candidate.number}: duplicate block, kept the first`);
      return;
    }
    if (existing?.valid) return;
    questions.set(candidate.number, { number: candidate.number, ...parsed, valid, start: candidate.start, end });
  });

  const appendNote = (note, extra) => [note, extra].filter(Boolean).join(', ');

  // Sequence repair: a text layer can misnumber a question as its neighbor
  // (2013TUS_2K prints question 8 as a second "9."), leaving one number with
  // two valid blocks and the number below it missing. Reading order settles
  // which block is which.
  for (let number = 1; number <= expected; number += 1) {
    if (questions.get(number)?.valid) continue;
    const kept = questions.get(number + 1);
    const dupes = duplicates.filter((d) => d.number === number + 1 && d.valid);
    if (!kept?.valid || dupes.length !== 1) continue;
    const dupe = dupes[0];
    const previous = questions.get(number - 1);
    if (previous?.valid && Math.min(kept.start, dupe.start) < previous.start) continue;

    const [first, second] = kept.start < dupe.start ? [kept, dupe] : [dupe, kept];
    questions.set(number, { ...first, number, note: appendNote(first.note, 'renumbered_by_reading_order') });
    questions.set(number + 1, { ...second, number: number + 1, note: appendNote(second.note, 'renumbered_by_reading_order') });
    warnings.push(`Q${number}/Q${number + 1}: text layer numbered both ${number + 1}, split by reading order`);
  }

  // Recovery pass: a table or list inside a stem can start lines with "1.",
  // "2." ..., and those false candidates truncate the real block before its
  // options. Re-extend a missing number's block to the next start that
  // validated as a real question.
  const validStarts = [...questions.values()]
    .filter((question) => question.valid)
    .map((question) => question.start)
    .sort((a, b) => a - b);
  for (let number = 1; number <= expected; number += 1) {
    if (questions.get(number)?.valid) continue;
    for (const candidate of candidates.filter((c) => c.number === number)) {
      const nextValid = validStarts.find((position) => position > candidate.start) ?? text.length;
      const end = Math.min(nextValid, candidate.contentStart + 6000);
      const parsed = splitBlock(text.slice(candidate.contentStart, end));
      if (isParsedQuestion(parsed)) {
        const note = [parsed.note, 'block_recovered_across_embedded_numbering'].filter(Boolean).join(', ');
        questions.set(number, { number, ...parsed, note, valid: true, start: candidate.start, end });
        warnings.push(`Q${number}: block recovered across embedded numbering`);
        break;
      }
    }
  }

  // The answer key lives after the end of the test. Parse it from the
  // rows-ordered text (pairs are adjacent there regardless of the key page's
  // own column grid), anchored at the last end-of-test marker.
  const anchors = [/TEST\s+BİTTİ/giu, /CEVAP\s+ANAHTARI/giu, /(?:TEMEL|KLİNİK)\s+TIP\s+BİLİMLERİ\s+TESTİ/giu];
  let keyStart = -1;
  for (const anchor of anchors) {
    let last = -1;
    while (anchor.exec(rowsText) !== null) last = anchor.lastIndex;
    if (last > -1) {
      keyStart = last;
      break;
    }
  }
  if (keyStart === -1) {
    warnings.push('No end-of-test marker found, scanning the last quarter for the answer key');
    keyStart = Math.floor(rowsText.length * 0.75);
  }
  const key = parseAnswerKey(rowsText.slice(keyStart), expected, warnings);

  const rows = [];
  for (let number = 1; number <= expected; number += 1) {
    const question = questions.get(number);
    if (!question || !question.valid) continue;
    const answer = key.get(number);
    const notes = [];
    if (question.note) notes.push(question.note);
    if (answer?.conflict) notes.push('answer_key_conflict');
    rows.push({
      exam_group_key: examGroupKey,
      source_file: sourceFile,
      question_number: number,
      stem: question.stem,
      option_a: question.options.A ?? null,
      option_b: question.options.B ?? null,
      option_c: question.options.C ?? null,
      option_d: question.options.D ?? null,
      option_e: question.options.E ?? null,
      correct_answer: answer?.answer ?? null,
      is_cancelled: answer?.cancelled ?? false,
      parse_note: notes.length > 0 ? notes.join(', ') : null,
    });
  }

  // OSYM removes a cancelled question's content from the published booklet
  // ("Bu soru iptal edilmiştir.") while the answer key lists it as İptal, so
  // a key-cancelled number with no parsed block is complete, not a gap.
  for (const [number, entry] of key) {
    if (!entry.cancelled || number > expected) continue;
    if (rows.some((row) => row.question_number === number)) continue;
    rows.push({
      exam_group_key: examGroupKey,
      source_file: sourceFile,
      question_number: number,
      stem: 'Bu soru iptal edilmiştir.',
      option_a: null,
      option_b: null,
      option_c: null,
      option_d: null,
      option_e: null,
      correct_answer: null,
      is_cancelled: true,
      parse_note: 'cancelled_question_removed_from_booklet',
    });
  }
  rows.sort((a, b) => a.question_number - b.question_number);

  const missing = [];
  for (let number = 1; number <= expected; number += 1) {
    if (!rows.some((row) => row.question_number === number)) missing.push(number);
  }
  for (const number of missing) {
    const best = questions.get(number);
    warnings.push(
      best
        ? `Q${number}: no valid block (${best.note ?? 'unparseable'})`
        : `Q${number}: no candidate start found in the text`
    );
  }
  const keyMisses = rows.filter((row) => row.correct_answer === null && !row.is_cancelled).length;
  if (keyMisses > 0) {
    warnings.push(`${keyMisses} parsed questions have no answer-key entry`);
  }
  if (key.size === 0) warnings.push('No answer key found');

  return {
    examGroupKey,
    sourceFile,
    expected,
    rows,
    missing,
    cancelled: rows.filter((row) => row.is_cancelled).length,
    answered: rows.filter((row) => row.correct_answer !== null).length,
    keyMisses,
    warnings,
  };
}

function sqlLiteral(value) {
  if (value === null) return 'null';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return `'${value.replace(/'/g, "''")}'`;
}

function toSql(paper) {
  const lines = [
    `-- ${paper.sourceFile}: ${paper.rows.length}/${paper.expected} questions, generated by scripts/import-official-papers.mjs`,
    'insert into public.official_questions',
    '  (exam_group_key, source_file, question_number, stem, option_a, option_b, option_c, option_d, option_e, correct_answer, is_cancelled, parse_note)',
    'values',
  ];
  const values = paper.rows.map((row) =>
    `  (${[
      sqlLiteral(row.exam_group_key),
      sqlLiteral(row.source_file),
      row.question_number,
      sqlLiteral(row.stem),
      sqlLiteral(row.option_a),
      sqlLiteral(row.option_b),
      sqlLiteral(row.option_c),
      sqlLiteral(row.option_d),
      sqlLiteral(row.option_e),
      sqlLiteral(row.correct_answer),
      sqlLiteral(row.is_cancelled),
      sqlLiteral(row.parse_note),
    ].join(', ')})`
  );
  lines.push(values.join(',\n'));
  lines.push('on conflict (exam_group_key, question_number) do update set');
  lines.push('  source_file = excluded.source_file,');
  lines.push('  stem = excluded.stem,');
  lines.push('  option_a = excluded.option_a,');
  lines.push('  option_b = excluded.option_b,');
  lines.push('  option_c = excluded.option_c,');
  lines.push('  option_d = excluded.option_d,');
  lines.push('  option_e = excluded.option_e,');
  lines.push('  correct_answer = excluded.correct_answer,');
  lines.push('  is_cancelled = excluded.is_cancelled,');
  lines.push('  parse_note = excluded.parse_note,');
  lines.push('  imported_at = now();');
  return lines.join('\n') + '\n';
}

function coverageMarkdown(papers) {
  const lines = [
    '# Official papers coverage',
    '',
    `Generated ${new Date().toISOString()} by scripts/import-official-papers.mjs`,
    '',
    '| Exam | Expected | Parsed | With answer | Cancelled | Missing numbers | Warnings |',
    '|------|----------|--------|-------------|-----------|-----------------|----------|',
  ];
  for (const paper of papers) {
    const missing = paper.missing.length > 0 ? paper.missing.join(', ') : '-';
    lines.push(
      `| ${paper.sourceFile} | ${paper.expected} | ${paper.rows.length} | ${paper.answered} | ${paper.cancelled} | ${missing} | ${paper.warnings.length} |`
    );
  }
  lines.push('');
  for (const paper of papers) {
    if (paper.warnings.length === 0) continue;
    lines.push(`## ${paper.sourceFile}`);
    for (const warning of paper.warnings) lines.push(`- ${warning}`);
    lines.push('');
  }
  return lines.join('\n');
}

async function pushRows(rows) {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('--push needs SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY in the environment.');
  }
  const endpoint = `${url.replace(/\/$/, '')}/rest/v1/official_questions?on_conflict=exam_group_key,question_number`;
  const batchSize = 200;
  for (let from = 0; from < rows.length; from += batchSize) {
    const batch = rows.slice(from, from + batchSize);
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(batch),
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Supabase upsert failed (${response.status}): ${body}`);
    }
    console.log(`  pushed ${Math.min(from + batchSize, rows.length)}/${rows.length}`);
  }
}

async function main() {
  const args = parseArgs(process.argv);
  if (!existsSync(args.dir)) {
    console.error(`Intake folder not found: ${args.dir}`);
    console.error('Drop the official papers there as YYYYTUS_<1|2><T|K>.pdf (see issue #12).');
    process.exit(1);
  }

  const pdfs = readdirSync(args.dir)
    .filter((name) => PAPER_NAME.test(name))
    .sort();
  if (pdfs.length === 0) {
    console.error(`No files matching YYYYTUS_<1|2><T|K>.pdf in ${args.dir}`);
    process.exit(1);
  }

  mkdirSync(join(args.out, 'sql'), { recursive: true });

  const papers = [];
  for (const name of pdfs) {
    process.stdout.write(`Parsing ${name} ... `);
    const paper = parsePaper(join(args.dir, name));
    papers.push(paper);
    console.log(
      `${paper.rows.length}/${paper.expected} questions, ${paper.answered} answered, ` +
      `${paper.cancelled} cancelled, ${paper.missing.length} missing, ${paper.warnings.length} warnings`
    );
    const stemName = name.replace(/\.pdf$/i, '');
    writeFileSync(join(args.out, `${stemName}.json`), JSON.stringify(paper, null, 2), 'utf8');
    writeFileSync(join(args.out, 'sql', `${stemName}.sql`), toSql(paper), 'utf8');
  }

  const coverage = coverageMarkdown(papers);
  writeFileSync(join(args.out, 'coverage.md'), coverage, 'utf8');

  const totalRows = papers.reduce((sum, paper) => sum + paper.rows.length, 0);
  const totalExpected = papers.reduce((sum, paper) => sum + paper.expected, 0);
  console.log(`\nTotal: ${totalRows}/${totalExpected} questions across ${papers.length} papers.`);
  console.log(`Artifacts in ${args.out} (gitignored - OSYM copyright, do not commit).`);

  if (args.push) {
    console.log('\nPushing to Supabase ...');
    for (const paper of papers) {
      console.log(`${paper.sourceFile}:`);
      await pushRows(paper.rows);
    }
    console.log('Push complete.');
  } else {
    console.log('\nDry run (no --push): rows were NOT written to Supabase.');
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
