import type { ReactNode } from 'react';
import { formatInr, type DealDetail } from '@valueskins/shared';

/**
 * A sentence with the creator's 30% advance and 70% final in it: each amount gets the lime fill
 * under ink text (docs/DESIGN.md), the soft one for the advance. The words are unchanged. Amounts
 * are matched as whole figures, so ₹3,334.50 is not found inside ₹13,334.50.
 */
export function CreatorAmounts({ text, deal }: { text: string; deal: DealDetail }) {
  const known: Array<[string, string]> = [];
  if (deal.advancePaise !== null)
    known.push([formatInr(deal.advancePaise), 'money money-creator money-creator-soft']);
  if (deal.finalPaise !== null) known.push([formatInr(deal.finalPaise), 'money money-creator']);
  if (known.length === 0) return <>{text}</>;
  const escaped = known.map(([amount]) => amount.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`(?<![\\d,])(${escaped.join('|')})(?![\\d,])`, 'g');
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const at = match.index ?? 0;
    if (at > last) parts.push(text.slice(last, at));
    const cls = known.find(([amount]) => amount === match[1])![1];
    parts.push(
      <span key={at} className={cls}>
        {match[1]}
      </span>,
    );
    last = at + match[1]!.length;
  }
  if (last === 0) return <>{text}</>;
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}
