/**
 * A document is a list of blocks: plain data describing what is on the page. Building the
 * blocks is pure, so tests read the text directly (text in an embedded font cannot be
 * searched in the PDF bytes), and one small function turns them into PDFKit calls.
 */
export type Block =
  | { kind: 'title'; text: string; subtitle?: string }
  | { kind: 'heading'; text: string }
  | { kind: 'row'; label: string; value: string }
  | { kind: 'text'; text: string }
  | { kind: 'table'; head: string[]; rows: string[][]; widths: number[]; alignRight?: number[] }
  | { kind: 'spacer' }
  | { kind: 'pageBreak' };

export const BLOCK_FONT = { regular: 'Regular', bold: 'Bold' } as const;

const LABEL_WIDTH = 190;
const BODY_SIZE = 10;
const CELL_PADDING = 4;

function ensureRoom(doc: PDFKit.PDFDocument, needed: number): void {
  if (doc.y + needed > doc.page.height - doc.page.margins.bottom) doc.addPage();
}

function drawTable(doc: PDFKit.PDFDocument, block: Extract<Block, { kind: 'table' }>): void {
  const left = doc.page.margins.left;
  const total = doc.page.width - left - doc.page.margins.right;
  const widths = block.widths.map((w) => w * total);
  const rightAligned = new Set(block.alignRight ?? []);

  const drawRow = (cells: string[], bold: boolean): void => {
    doc.font(bold ? BLOCK_FONT.bold : BLOCK_FONT.regular).fontSize(BODY_SIZE);
    const height =
      Math.max(
        ...cells.map((cell, i) =>
          doc.heightOfString(cell, { width: (widths[i] ?? total) - CELL_PADDING * 2 }),
        ),
      ) +
      CELL_PADDING * 2;
    ensureRoom(doc, height);
    const top = doc.y;
    let x = left;
    cells.forEach((cell, i) => {
      const width = widths[i] ?? 0;
      doc.text(cell, x + CELL_PADDING, top + CELL_PADDING, {
        width: width - CELL_PADDING * 2,
        align: rightAligned.has(i) ? 'right' : 'left',
      });
      x += width;
    });
    doc
      .moveTo(left, top + height)
      .lineTo(left + total, top + height)
      .lineWidth(0.5)
      .strokeColor('#000000')
      .stroke();
    doc.x = left;
    doc.y = top + height;
  };

  drawRow(block.head, true);
  for (const row of block.rows) drawRow(row, false);
  doc.moveDown(0.5);
}

/** Plain black on white (SPEC 7.4). */
export function drawBlocks(doc: PDFKit.PDFDocument, blocks: Block[]): void {
  const left = doc.page.margins.left;
  doc.fillColor('#000000').strokeColor('#000000');

  for (const block of blocks) {
    doc.x = left;
    switch (block.kind) {
      case 'title':
        ensureRoom(doc, 60);
        doc.font(BLOCK_FONT.bold).fontSize(18).text(block.text);
        if (block.subtitle) doc.font(BLOCK_FONT.regular).fontSize(11).text(block.subtitle);
        doc.moveDown(0.8);
        break;
      case 'heading':
        ensureRoom(doc, 40);
        doc.moveDown(0.4).font(BLOCK_FONT.bold).fontSize(12).text(block.text);
        doc.moveDown(0.3);
        break;
      case 'row': {
        const valueWidth = doc.page.width - left - doc.page.margins.right - LABEL_WIDTH;
        // The label is drawn bold, so it is measured bold: a wrapped label must not run into the next row.
        doc.font(BLOCK_FONT.bold).fontSize(BODY_SIZE);
        const labelHeight = doc.heightOfString(block.label, { width: LABEL_WIDTH - 8 });
        doc.font(BLOCK_FONT.regular);
        const height = Math.max(
          labelHeight,
          doc.heightOfString(block.value, { width: valueWidth }),
        );
        ensureRoom(doc, height + 4);
        const top = doc.y;
        doc.font(BLOCK_FONT.bold).text(block.label, left, top, { width: LABEL_WIDTH - 8 });
        doc
          .font(BLOCK_FONT.regular)
          .text(block.value, left + LABEL_WIDTH, top, { width: valueWidth });
        doc.x = left;
        doc.y = top + height + 4;
        break;
      }
      case 'text':
        doc.font(BLOCK_FONT.regular).fontSize(BODY_SIZE).text(block.text);
        doc.moveDown(0.4);
        break;
      case 'table':
        drawTable(doc, block);
        break;
      case 'spacer':
        doc.moveDown(1);
        break;
      case 'pageBreak':
        doc.addPage();
        break;
    }
  }
}
