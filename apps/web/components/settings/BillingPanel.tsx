'use client';

import { useState } from 'react';
import { useBilling } from '@/lib/api/queries';
import { errorText } from '@/lib/api/errors';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { BillingForm } from '@/components/forms/BillingForm';
import { Panel, Row } from './Rows';

export function BillingPanel() {
  const billing = useBilling(true);
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const current = billing.data?.billing ?? null;

  return (
    <Panel
      id="billing"
      title="Billing details"
      action={
        !editing && billing.isSuccess ? (
          <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
            {current ? 'Edit' : 'Add'}
          </Button>
        ) : null
      }
    >
      {billing.isPending ? <Skeleton className="h-24 w-full" /> : null}
      {billing.isError ? (
        <Callout tone="error" role="alert">
          <p>{errorText(billing.error)}</p>
        </Callout>
      ) : null}
      {editing ? (
        <BillingForm
          initial={current}
          submitLabel="Save billing details"
          onSaved={() => {
            setEditing(false);
            toast.show({ tone: 'ok', title: 'Billing details saved' });
          }}
          secondary={
            <Button variant="text" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          }
        />
      ) : current ? (
        <div>
          <Row k="Billing name">{current.billingName}</Row>
          <Row k="Address">
            <span className="whitespace-pre-line">{current.billingAddress}</span>
          </Row>
          <Row k="State">{current.billingState}</Row>
          {current.gstin ? (
            <Row k="GSTIN">
              <span className="t-mono">{current.gstin}</span>
            </Row>
          ) : null}
        </div>
      ) : billing.isSuccess ? (
        <p className="t-body c-ink-2">No billing details yet. You need them to publish a deal.</p>
      ) : null}
      {editing ? null : (
        <p className="t-small c-ink-2">
          Used on the GST tax invoice for each ValueSkins fee. A change applies to fees you pay from
          now on.
        </p>
      )}
    </Panel>
  );
}
