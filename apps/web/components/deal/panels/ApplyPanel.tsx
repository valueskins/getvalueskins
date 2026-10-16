'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ADD_UPI_TO_APPLY, type DealDetail } from '@valueskins/shared';
import { useApply } from '@/lib/api/deals';
import { actionOf, at, reasonOf } from '@/lib/dealView';
import { longDate } from '@/lib/deadlines';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/Modal';
import { Money } from '@/components/ui/Money';
import { useDealAction } from '../useDealAction';

/**
 * Applying to an open deal (CrApplyStates). The state comes only from the
 * APPLY action (closed, or no UPI ID, with the API's reason) and `applied` on the deal.
 * A confirm comes first, because an application cannot be withdrawn.
 */
export function ApplyPanel({ deal }: { deal: DealDetail }) {
  const apply = actionOf(deal, 'APPLY');
  const reason = reasonOf(apply);
  const applied = deal.applied === true;
  const [open, setOpen] = useState(false);
  const mutation = useApply(deal.id);
  const run = useDealAction(deal.id);

  if (!apply) return null;
  const confirm = async () => {
    const done = await run(() => mutation.mutateAsync(), {
      success: { title: 'You applied', text: 'We email you when the brand picks a creator.' },
    });
    if (done) setOpen(false);
  };

  const button = applied ? (
    <Button variant="secondary" block disabledReason={reason}>
      <Icon name="check" />
      Applied
    </Button>
  ) : (
    <Button block disabledReason={reason} onClick={() => setOpen(true)}>
      Apply
    </Button>
  );

  return (
    <div className="flex flex-col gap-3.5">
      <div>
        <p className="t-small c-ink-2">You receive</p>
        {deal.creatorAmountPaise !== null ? (
          <Money paise={deal.creatorAmountPaise} size="l" />
        ) : null}
      </div>
      {button}
      {applied ? (
        <p className="t-small c-ink-2">We email you when the brand picks a creator.</p>
      ) : reason === ADD_UPI_TO_APPLY ? (
        <Link href="/settings#upi" className="btn btn-secondary btn-block">
          Add UPI ID
        </Link>
      ) : reason ? null : deal.applicationDeadline ? (
        <p className="t-small c-ink-2">
          Applications close {longDate(deal.applicationDeadline)}, 11:59 pm IST. You cannot withdraw
          an application.
        </p>
      ) : null}
      <Modal
        open={open}
        title={`Apply to ${deal.title ?? 'this deal'}?`}
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Not yet
            </Button>
            <Button onClick={confirm} loading={mutation.isPending}>
              Apply
            </Button>
          </>
        }
      >
        <p>
          You cannot withdraw an application. If {at(deal.brand.username)} confirms you, the content
          is due{' '}
          {deal.contentUploadDeadline
            ? longDate(deal.contentUploadDeadline)
            : 'on the date in the brief'}
          .
        </p>
        <p className="mt-3">
          They will see your profile, followers, engagement, past deals and contact email.
        </p>
      </Modal>
    </div>
  );
}
