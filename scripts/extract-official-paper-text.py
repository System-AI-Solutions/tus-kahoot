# Extracts the text of an official OSYM exam booklet in true reading order:
# per page, the left column top-to-bottom, then the right column. Used by
# scripts/import-official-papers.mjs.
#
# The older booklets (2013-2017) carry a rebuilt text layer whose drawing
# order is scrambled and whose runs xpdf's pdftotext groups into corrupt
# lines, but the per-word coordinates are sound - so reading order is
# reconstructed from word boxes instead. Requires: pip install pymupdf
#
# Usage: python scripts/extract-official-paper-text.py <file.pdf> [--mode columns|rows]
#   columns (default): left column top-to-bottom, then right column - the
#     reading order for question pages.
#   rows: whole-page lines sorted by y then x - keeps "N. X" answer-key pairs
#     adjacent even when the key's own column grid straddles the page center.
# Output: UTF-8 text on stdout, pages separated by form feeds.

import sys

try:
    import pymupdf
except ImportError:  # older installs expose the same API as fitz
    import fitz as pymupdf

LINE_TOLERANCE = 3.0  # points: words within this vertical distance share a line


def group_lines(rows):
    lines = []
    current = []
    current_y = None
    for y0, x0, text in sorted(rows):
        if current_y is None or y0 - current_y <= LINE_TOLERANCE:
            current.append((x0, text))
            current_y = y0 if current_y is None else max(current_y, y0)
        else:
            lines.append(" ".join(t for _, t in sorted(current)))
            current = [(x0, text)]
            current_y = y0
    if current:
        lines.append(" ".join(t for _, t in sorted(current)))
    return lines


def order_words(words, mid_x, mode):
    entries = [
        ((x0 + x1) / 2, y0, x0, text)
        for x0, y0, x1, y1, text, *_ in words
        if text.strip()
    ]
    if mode == "rows":
        return group_lines([(y0, x0, text) for _, y0, x0, text in entries])

    lines = []
    for side in ("left", "right"):
        rows = [
            (y0, x0, text)
            for center, y0, x0, text in entries
            if (center < mid_x) == (side == "left")
        ]
        lines.extend(group_lines(rows))
    return lines


def main():
    args = []
    mode = "columns"
    argv = sys.argv[1:]
    index = 0
    while index < len(argv):
        if argv[index] == "--mode":
            mode = argv[index + 1] if index + 1 < len(argv) else ""
            index += 2
        else:
            args.append(argv[index])
            index += 1
    if len(args) != 1 or mode not in ("columns", "rows"):
        print("usage: extract-official-paper-text.py <file.pdf> [--mode columns|rows]", file=sys.stderr)
        return 1

    sys.stdout.reconfigure(encoding="utf-8")
    doc = pymupdf.open(args[0])
    pages = []
    for page in doc:
        mid_x = page.rect.width / 2
        pages.append("\n".join(order_words(page.get_text("words"), mid_x, mode)))
    sys.stdout.write("\f".join(pages))
    return 0


if __name__ == "__main__":
    sys.exit(main())
