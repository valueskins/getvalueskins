'use client';

import {
  type MePayoutAccountResponse,
  PAYOUT_CONSENT_TEXT,
  SETTLEMENT_TIMING_NOTE,
  mePayoutAccountResponseSchema,
  mePayoutAccountSchema,
} from '@valueskins/shared';
import { useCallback, useEffect, useState } from 'react';
import { apiErrorMessage, apiFetch } from '../../../../lib/temporary/api';
import { errorClass, hintClass, inputClass, primaryButton, secondaryButton } from '../styles';
import { useAction } from '../useAction';

type PayoutAccount = NonNullable<MePayoutAccountResponse['payoutAccount']>;

const STATUS_TEXT: Record<PayoutAccount['status'], string> = {
  PENDING:
    'Razorpay is checking your details. This can take a few minutes. Use Refresh status to check.',
  ACTIVE: 'Your payout account is active. You can apply to deals.',
  NEEDS_CLARIFICATION:
    'Razorpay needs more information. Fix the items below and submit the form again.',
  SUSPENDED: 'Your payout account is suspended. Contact support.',
};

const EMPTY_FORM = {
  legalName: '',
  pan: '',
  phone: '',
  bankAccountNumber: '',
  ifsc: '',
  accountHolderName: '',
  consent: false,
};

export function PayoutSection() {
  const [account, setAccount] = useState<PayoutAccount | null | undefined>(undefined);
  const [values, setValues] = useState(EMPTY_FORM);
  const submitAction = useAction();
  const refreshAction = useAction();

  const apply = useCallback(async (response: Response): Promise<string | null> => {
    if (!response.ok) return apiErrorMessage(response, 'Something went wrong. Try again.');
    const parsed = mePayoutAccountResponseSchema.safeParse(await response.json());
    if (!parsed.success) return 'Unexpected answer from the server.';
    setAccount(parsed.data.payoutAccount);
    return null;
  }, []);

  useEffect(() => {
    apiFetch('/api/me/payout-account')
      .then(apply)
      .catch(() => setAccount(null));
  }, [apply]);

  const body = {
    legalName: values.legalName,
    pan: values.pan.trim().toUpperCase(),
    phone: values.phone,
    bankAccountNumber: values.bankAccountNumber.trim(),
    ifsc: values.ifsc.trim().toUpperCase(),
    accountHolderName: values.accountHolderName,
    consent: values.consent,
  };
  const valid = mePayoutAccountSchema.safeParse(body).success;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const ok = await submitAction.run(async () =>
      apply(
        await apiFetch('/api/me/payout-account', { method: 'POST', body: JSON.stringify(body) }),
      ),
    );
    // The personal details are not kept in the page once they are sent.
    if (ok) setValues(EMPTY_FORM);
  }

  async function refresh() {
    await refreshAction.run(async () =>
      apply(await apiFetch('/api/me/payout-account/refresh', { method: 'POST' })),
    );
  }

  if (account === undefined) return <p className={hintClass}>Loading payout details</p>;

  const needsForm =
    account === null || !account.setupComplete || account.status === 'NEEDS_CLARIFICATION';

  const text = (key: keyof typeof EMPTY_FORM, label: string, type = 'text') => (
    <label className="block space-y-2">
      <span>{label}</span>
      <input
        type={type}
        value={String(values[key])}
        onChange={(event) => setValues({ ...values, [key]: event.target.value })}
        autoComplete="off"
        className={inputClass}
      />
    </label>
  );

  return (
    <section className="space-y-6" aria-label="Payout setup">
      <h2 className="text-xl font-semibold">Payout setup</h2>

      {account ? (
        <div className="space-y-3 border-t border-line pt-4">
          <p>
            Status: <strong>{account.status}</strong>
          </p>
          <p className={hintClass}>{STATUS_TEXT[account.status]}</p>
          {account.status === 'ACTIVE' ? (
            <p className={hintClass}>{SETTLEMENT_TIMING_NOTE}</p>
          ) : null}
          {account.bankLast4 ? (
            <p className={hintClass}>
              Bank account ending {account.bankLast4}
              {account.ifsc ? `, IFSC ${account.ifsc}` : ''}
            </p>
          ) : null}
          {!account.setupComplete ? (
            <p className={hintClass}>Setup was interrupted. Submit the form again to finish it.</p>
          ) : null}
          {account.requirements.length > 0 ? (
            <ul className="list-disc space-y-1 pl-6 text-danger">
              {account.requirements.map((item) => (
                <li key={`${item.fieldReference}-${item.reasonCode}`}>
                  {item.fieldReference}: {item.reasonCode.replace(/_/g, ' ')}
                </li>
              ))}
            </ul>
          ) : null}
          {account.setupComplete ? (
            <button
              type="button"
              onClick={refresh}
              disabled={refreshAction.busy}
              className={secondaryButton}
            >
              Refresh status
            </button>
          ) : null}
          {refreshAction.error ? <p className={errorClass}>{refreshAction.error}</p> : null}
        </div>
      ) : null}

      {needsForm ? (
        <form onSubmit={submit} className="space-y-4">
          {text('legalName', 'Legal name (as on your PAN card)')}
          {text('pan', 'PAN')}
          {text('phone', 'Mobile number (sent to Razorpay, not stored by ValueSkins)', 'tel')}
          {text('bankAccountNumber', 'Bank account number')}
          {text('ifsc', 'IFSC')}
          {text('accountHolderName', 'Account holder name')}
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={values.consent}
              onChange={(event) => setValues({ ...values, consent: event.target.checked })}
              className="mt-1"
            />
            <span>{PAYOUT_CONSENT_TEXT}</span>
          </label>
          <button type="submit" disabled={!valid || submitAction.busy} className={primaryButton}>
            Submit payout details
          </button>
          {!valid ? (
            <p className={hintClass}>
              Fill in every field correctly (PAN of an individual, 10 digit mobile number, IFSC) and
              accept the consent text to continue.
            </p>
          ) : null}
          {submitAction.error ? <p className={errorClass}>{submitAction.error}</p> : null}
        </form>
      ) : null}
    </section>
  );
}
