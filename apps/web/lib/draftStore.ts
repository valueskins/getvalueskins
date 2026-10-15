// The post-a-deal form keeps a copy on this device (DESIGN_HANDOFF: post a
// deal), every 30 seconds and on blur. localStorage can be missing or throw, so
// every access is guarded and the form works without it.

export interface DraftFields {
  title: string;
  description: string;
  /** Digits only, whole rupees. */
  budget: string;
  applicationDeadline: string | null;
  contentUploadDeadline: string | null;
  dealDeadline: string | null;
}

export interface StoredDraft {
  fields: DraftFields;
  savedAt: string;
}

export const AUTOSAVE_MS = 30_000;

function key(draftId: string | null): string {
  return `vs:deal-draft:${draftId ?? 'new'}`;
}

export function readDraft(draftId: string | null): StoredDraft | null {
  try {
    const raw = window.localStorage.getItem(key(draftId));
    return raw ? (JSON.parse(raw) as StoredDraft) : null;
  } catch {
    return null;
  }
}

export function writeDraft(
  draftId: string | null,
  fields: DraftFields,
  now: Date,
): StoredDraft | null {
  const stored = { fields, savedAt: now.toISOString() };
  try {
    window.localStorage.setItem(key(draftId), JSON.stringify(stored));
    return stored;
  } catch {
    return null;
  }
}

export function clearDraft(draftId: string | null): void {
  try {
    window.localStorage.removeItem(key(draftId));
  } catch {
    // Nothing to clear.
  }
}

export function sameFields(a: DraftFields, b: DraftFields): boolean {
  return (Object.keys(a) as Array<keyof DraftFields>).every(
    (k) => (a[k] ?? null) === (b[k] ?? null),
  );
}

/** "10000" as "10,000" (en-IN grouping, so 100000 is "1,00,000"). */
export function groupRupees(digits: string): string {
  if (!digits) return '';
  return Number(digits).toLocaleString('en-IN');
}
