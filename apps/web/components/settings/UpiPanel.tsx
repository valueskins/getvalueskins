'use client';

import { useState } from 'react';
import { formatDate } from '@/lib/format';
import { usePayoutUpi } from '@/lib/api/queries';
import { errorText } from '@/lib/api/errors';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { UpiForm } from '@/components/forms/UpiForm';
import { Panel, Row } from './Rows';

/** The creator's UPI details, masked everywhere here (REPLACEMENT_PLAN 2.1). */
export function UpiPanel() {
  const upi = usePayoutUpi(true);
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const current = upi.data?.payoutUpi ?? null;

  return (
    <Panel
      id="upi"
      title="Get paid by UPI"
      action={
        !editing && upi.isSuccess ? (
          <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
            {current ? 'Change' : 'Add UPI ID'}
          </Button>
        ) : null
      }
    >
      {upi.isPending ? <Skeleton className="h-24 w-full" /> : null}
      {upi.isError ? (
        <Callout tone="error" role="alert">
          <p>{errorText(upi.error)}</p>
        </Callout>
      ) : null}
      {upi.isSuccess && !current && !editing ? (
        <p className="t-body c-ink-2">No UPI ID yet. Add one to apply to deals.</p>
      ) : null}
      {current ? (
        <div>
          <Row k={editing ? 'Current' : 'UPI ID'}>
            <span className="upi-masked">{current.maskedVpa}</span>
          </Row>
          {editing ? null : (
            <>
              <Row k="Name on the account">{current.name}</Row>
              <Row k="Shown to brands">Agreed on {formatDate(current.consentAt)}</Row>
            </>
          )}
        </div>
      ) : null}
      {editing ? (
        <UpiForm
          vpaLabel={current ? 'New UPI ID' : 'UPI ID'}
          consentNote={
            current ? 'A brand sees the new UPI ID for any payment it has not made yet.' : undefined
          }
          onSaved={() => {
            setEditing(false);
            toast.show({ tone: 'ok', title: 'UPI ID saved' });
          }}
          secondary={
            <Button variant="text" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          }
        />
      ) : current ? (
        <p className="t-small c-ink-2">
          Only the brand confirmed on your deal sees your UPI ID in full, and only while a payment
          is due. It is hidden here too.
        </p>
      ) : null}
    </Panel>
  );
}
