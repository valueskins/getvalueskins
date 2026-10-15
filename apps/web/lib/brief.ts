export type BriefPart =
  { kind: 'item'; label: string; text: string } | { kind: 'text'; text: string };

/** A line written to the deal template: a short label, a colon, then the text. */
const LABELLED = /^([A-Z][A-Za-z ]{1,30}):\s*(.*)$/;

/**
 * Splits a description written to the template (SPEC 9) into labelled items
 * for the brief's definition list. Anything else stays as paragraphs, so a
 * free-form description still reads well.
 */
export function parseBrief(description: string): BriefPart[] {
  const parts: BriefPart[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) parts.push({ kind: 'text', text: paragraph.join('\n') });
    paragraph = [];
  };
  for (const raw of description.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trim();
    const match = LABELLED.exec(line);
    if (match && match[2]!.trim() !== '') {
      flush();
      parts.push({ kind: 'item', label: match[1]!, text: match[2]!.trim() });
    } else if (line === '') {
      flush();
    } else if (match) {
      // A label with nothing after it, like "Additional notes:", starts the next paragraph.
      flush();
      paragraph.push(line);
    } else {
      paragraph.push(line);
    }
  }
  flush();
  return parts;
}
