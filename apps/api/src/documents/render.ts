import PDFDocument from 'pdfkit';
import { BLOCK_FONT, drawBlocks, type Block } from './blocks.js';
import { FONT_BOLD_PATH, FONT_REGULAR_PATH } from './fonts.js';

export interface RenderOptions {
  title: string;
  /** Goes into the PDF info. Always a stored time (the invoice's), never the clock, so re-renders are identical. */
  createdAt: Date;
}

/** Blocks to a PDF, in memory: documents are rendered on demand and never stored (SPEC 2). */
export function renderPdf(blocks: Block[], options: RenderOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 50,
      info: {
        Title: options.title,
        Author: 'Valueskins Private Limited',
        Creator: 'ValueSkins',
        Producer: 'ValueSkins',
        CreationDate: options.createdAt,
        ModDate: options.createdAt,
      },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    try {
      doc.registerFont(BLOCK_FONT.regular, FONT_REGULAR_PATH);
      doc.registerFont(BLOCK_FONT.bold, FONT_BOLD_PATH);
      drawBlocks(doc, blocks);
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
