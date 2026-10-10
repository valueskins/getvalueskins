'use client';

import {
  type PayoutUpiView,
  PAYOUT_CONSENT_TEXT,
  UPI_NOT_VERIFIED_WARNING,
  mePayoutUpiResponseSchema,
  mePayoutUpiSaveResponseSchema,
  mePayoutUpiSchema,
} from '@valueskins/shared';
import { useEffect, useState } from 'react';
import { apiErrorMessage, apiFetch } from '../../../../lib/temporary/api';
import { errorClass, hintClass, inputClass, primaryButton, secondaryButton } from '../styles';
import { useAction } from '../useAction';

const EMPTY_FORM = { vpa: '', name: '', consent: false };

function formatConsentDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
}

/** Creator payout details: a UPI ID, the name on the account and consent (REPLACEMENT_PLAN 2.1). */
export function PayoutSection() {
  const [saved, setSaved] = useState<PayoutUpiView | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState(EMPTY_FORM);
  const submitAction = useAction();

  useEffect(() => {
    apiFetch('/api/me/payout-upi')
      .then(async (response) => {
        const parsed = mePayoutUpiResponseSchema.safeParse(await response.json());
        setSaved(response.ok && parsed.success ? parsed.data.payoutUpi : null);
      })
      .catch(() => setSaved(null));
  }, []);

  const body = { vpa: values.vpa.trim(), name: values.name.trim(), consent: values.consent };
  const check = mePayoutUpiSchema.safeParse(body);
  const typedSomething = body.vpa !== '' || body.name !== '';
  const reason = check.success
    ? null
    : typedSomething
      ? (check.error.issues.find((issue) => issue.path.length > 0)?.message ??
        'Accept the consent text to continue.')
      : 'Enter your UPI ID and the name on the account, and accept the consent text.';

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const ok = await submitAction.run(async () => {
      const response = await apiFetch('/api/me/payout-upi', {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      if (!response.ok) return apiErrorMessage(response, 'Something went wrong. Try again.');
      const parsed = mePayoutUpiSaveResponseSchema.safeParse(await response.json());
      if (!parsed.success) return 'Unexpected answer from the server.';
      setSaved(parsed.data.payoutUpi);
      return null;
    });
    // The UPI ID is not kept in the page once it is saved: only the masked form comes back.
    if (ok) {
      setValues(EMPTY_FORM);
      setEditing(false);
    }
  }

  if (saved === undefined) return <p className={hintClass}>Loading payout details</p>;

  const showForm = saved === null || editing;

  return (
    <section className="space-y-6" aria-label="Payout setup">
      <h2 className="text-xl font-semibold">Payout setup</h2>

      {saved ? (
        <div className="space-y-3 border-t border-line pt-4">
          <p>
            UPI ID: <strong>{saved.maskedVpa}</strong>
          </p>
          <p>Name on the account: {saved.name}</p>
          <p className={hintClass}>Consent given on {formatConsentDate(saved.consentAt)}.</p>
          {!editing ? (
            <button type="button" onClick={() => setEditing(true)} className={secondaryButton}>
              Change UPI details
            </button>
          ) : null}
        </div>
      ) : (
        <p className={hintClass}>Add your UPI ID to apply to deals.</p>
      )}

      {showForm ? (
        <form onSubmit={submit} className="space-y-4">
          <label className="block space-y-2">
            <span>UPI ID</span>
            <input
              type="text"
              value={values.vpa}
              onChange={(event) => setValues({ ...values, vpa: event.target.value })}
              autoComplete="off"
              placeholder="name@bank"
              className={inputClass}
            />
          </label>
          <label className="block space-y-2">
            <span>Name on the account, as your UPI app shows it</span>
            <input
              type="text"
              value={values.name}
              onChange={(event) => setValues({ ...values, name: event.target.value })}
              autoComplete="off"
              className={inputClass}
            />
          </label>
          <p className={hintClass}>{UPI_NOT_VERIFIED_WARNING}</p>
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={values.consent}
              onChange={(event) => setValues({ ...values, consent: event.target.checked })}
              className="mt-1"
            />
            <span>{PAYOUT_CONSENT_TEXT}</span>
          </label>
          <button
            type="submit"
            disabled={!check.success || submitAction.busy}
            className={primaryButton}
          >
            Save UPI details
          </button>
          {reason ? <p className={hintClass}>{reason}</p> : null}
          {submitAction.error ? <p className={errorClass}>{submitAction.error}</p> : null}
        </form>
      ) : null}
    </section>
  );
}
