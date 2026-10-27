import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const CONTENT_PAGES = ['terms', 'privacy', 'refunds', 'how-it-works'] as const;
export type ContentPage = (typeof CONTENT_PAGES)[number];

export type Segment = { kind: 'markdown'; text: string } | { kind: 'missing'; text: string };

export interface ParsedContent {
  title: string;
  /** The paragraph under the title, for example "Last updated 8 Oct 2026". */
  lede: string | null;
  sections: Array<{ id: string; title: string }>;
  segments: Segment[];
}

/** Server only: the markdown for one page, from apps/web/content. */
export function readContent(page: ContentPage): string {
  return readFileSync(join(process.cwd(), 'content', `${page}.md`), 'utf8');
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

const MISSING = /^:::missing[ \t]*\n([\s\S]*?)\n:::[ \t]*$/gm;

/**
 * Splits out the `:::missing` notes (content/README.md). Everything else stays
 * markdown, in order.
 */
export function splitMissing(markdown: string): Segment[] {
  const segments: Segment[] = [];
  let last = 0;
  for (const match of markdown.matchAll(MISSING)) {
    const before = markdown.slice(last, match.index);
    if (before.trim()) segments.push({ kind: 'markdown', text: before });
    segments.push({ kind: 'missing', text: match[1]!.trim() });
    last = match.index + match[0].length;
  }
  const rest = markdown.slice(last);
  if (rest.trim()) segments.push({ kind: 'markdown', text: rest });
  return segments;
}

/** The text of every `:::missing` note, in order. */
export function missingNotes(markdown: string): string[] {
  return splitMissing(markdown)
    .filter((s) => s.kind === 'missing')
    .map((s) => s.text);
}

export function parseContent(markdown: string): ParsedContent {
  const normalized = markdown.replace(/\r\n/g, '\n');
  const titleMatch = /^# (.+)$/m.exec(normalized);
  const title = titleMatch?.[1]?.trim() ?? '';
  let body = titleMatch ? normalized.slice(titleMatch.index + titleMatch[0].length) : normalized;

  // The first paragraph before any section is the lede.
  let lede: string | null = null;
  const ledeMatch = /^\s*([^\n#:][^\n]*)\n(?:\n|$)/.exec(body);
  if (ledeMatch && !body.trimStart().startsWith('##')) {
    lede = ledeMatch[1]!.trim();
    body = body.slice(ledeMatch[0].length);
  }

  const sections = [...body.matchAll(/^## (.+)$/gm)].map((m) => ({
    id: slugify(m[1]!.trim()),
    title: m[1]!.trim(),
  }));

  return { title, lede, sections, segments: splitMissing(body) };
}

export interface ContentPart {
  id: string;
  title: string;
  /** The markdown under the `###` heading. */
  body: string;
}

export interface ContentSection {
  id: string;
  title: string;
  /** The markdown under the `##` heading, before its first `###`. */
  intro: string;
  parts: ContentPart[];
}

/**
 * The page as `##` sections, each split into its `###` parts, for pages laid out by section rather
 * than read top to bottom (How it works). The text itself stays exactly as written.
 */
export function parseSections(markdown: string): {
  title: string;
  lede: string | null;
  sections: ContentSection[];
} {
  const { title, lede, segments } = parseContent(markdown);
  const body = segments.map((s) => s.text).join('\n\n');
  const sections: ContentSection[] = [];
  for (const chunk of body.split(/^## /m).slice(1)) {
    const [heading = '', ...rest] = chunk.split('\n');
    const [intro = '', ...parts] = rest.join('\n').split(/^### /m);
    sections.push({
      id: slugify(heading.trim()),
      title: heading.trim(),
      intro: intro.trim(),
      parts: parts.map((part) => {
        const [partTitle = '', ...lines] = part.split('\n');
        return {
          id: slugify(partTitle.trim()),
          title: partTitle.trim(),
          body: lines.join('\n').trim(),
        };
      }),
    });
  }
  return { title, lede, sections };
}
