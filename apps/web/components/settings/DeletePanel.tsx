'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { MeResponse } from '@valueskins/shared';
import { useDealsInProgress, useDeleteAccount } from '@/lib/api/queries';
import { errorText } from '@/lib/api/errors';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { Panel } from './Rows';

/** What deleting removes. Brand billing rows are kept by the API for now (docs/WEB_API_GAPS.md). */
function removedText(me: MeResponse): string {
  return me.user.role === 'CREATOR'
    ? 'your profile, email, UPI ID and Instagram connection'
    : 'your profile, email, billing details and Instagram connection';
}

function InProgress({ open }: { open: boolean }) {
  const deals = useDealsInProgress(open);
  const items = deals.data?.items ?? [];
  if (deals.isError) {
    return (
      <Callout tone="wait" className="mt-4">
        <p>
          We could not check for deals in progress. Deleting does not cancel a deal you are part of.
        </p>
      </Callout>
    );
  }
  if (items.length === 0) return null;
  const first = items[0]!.title;
  const text =
    items.length === 1
      ? `You have 1 deal in progress, ${first}. Deleting does not cancel it.`
      : `You have ${items.length} deals in progress. Deleting does not cancel them.`;
  return (
    <Callout tone="wait" className="mt-4">
      <p>{text}</p>
    </Callout>
  );
}

export function DeletePanel({ me }: { me: MeResponse }) {
  const router = useRouter();
  const toast = useToast();
  const remove = useDeleteAccount();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function confirm() {
    setError(null);
    remove.mutate(undefined, {
      onSuccess: () => {
        setOpen(false);
        toast.show({ tone: 'info', title: 'Your account is deleted' });
        router.replace('/');
      },
      onError: (err) => setError(errorText(err)),
    });
  }

  return (
    <Panel id="delete" title="Delete account">
      <p className="t-body c-ink-2">
        This removes {removedText(me)}, and signs you out everywhere. Deals, payments and invoices
        stay as legal records and show &quot;Deleted user&quot;.
      </p>
      <p className="t-body c-ink-2">
        Deleting does not cancel a deal in progress. Finish or settle your deals first.
      </p>
      <div>
        <Button variant="danger-outline" onClick={() => setOpen(true)}>
          Delete account
        </Button>
      </div>
      <Modal
        open={open}
        title="Delete your account?"
        onClose={() => !remove.isPending && setOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={remove.isPending}>
              Keep my account
            </Button>
            <Button variant="danger" onClick={confirm} loading={remove.isPending}>
              Delete account
            </Button>
          </>
        }
      >
        <p>
          {removedText(me).replace(/^your/, 'Your')} are removed, and you are signed out everywhere.
          This cannot be undone.
        </p>
        <p className="mt-3">
          Deals, payments and invoices stay as legal records and show &quot;Deleted user&quot;.
        </p>
        <InProgress open={open} />
        {error ? (
          <Callout tone="error" role="alert" className="mt-4">
            <p>{error}</p>
          </Callout>
        ) : null}
      </Modal>
    </Panel>
  );
}
