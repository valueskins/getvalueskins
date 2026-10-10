import { invoiceNumber, invoiceSeries, type InvoiceKind } from '@valueskins/shared';
import { sql } from 'drizzle-orm';
import type { db } from '../db/client.js';
import type { Tx } from '../deals/stateMachine.js';

export type Executor = typeof db | Tx;

/**
 * The next number in the series for this kind and financial year (SPEC 7.4). One upsert
 * takes the counter row's lock and holds it until the surrounding transaction ends, so
 * concurrent issues queue up, and a rollback undoes the increment: numbers have no gaps
 * and are never reused. Call it only inside the transaction that inserts the invoice.
 */
export async function nextInvoiceNumber(
  executor: Executor,
  kind: InvoiceKind,
  financialYear: string,
): Promise<{ number: string; sequence: number }> {
  const { counterKind } = invoiceSeries(kind);
  const result = await executor.execute<{ last_sequence: number }>(sql`
    insert into invoice_counters (kind, financial_year, last_sequence)
    values (${counterKind}, ${financialYear}, 1)
    on conflict (kind, financial_year)
    do update set last_sequence = invoice_counters.last_sequence + 1, updated_at = now()
    returning last_sequence
  `);
  const sequence = result.rows[0]?.last_sequence;
  if (sequence === undefined) throw new Error('invoice counter returned no row');
  return { number: invoiceNumber(kind, financialYear, sequence), sequence };
}
