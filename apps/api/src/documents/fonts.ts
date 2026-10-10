import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);

/**
 * DejaVu Sans, from the dejavu-fonts-ttf package. PDFKit's built-in fonts have no rupee
 * sign (U+20B9) and cannot show non-Latin names, so every document embeds this one.
 */
const FONT_DIR = join(dirname(require.resolve('dejavu-fonts-ttf/package.json')), 'ttf');

export const FONT_REGULAR_PATH = join(FONT_DIR, 'DejaVuSans.ttf');
export const FONT_BOLD_PATH = join(FONT_DIR, 'DejaVuSans-Bold.ttf');
