'use client';

import { meBillingSchema } from '@valueskins/shared';
import { useState } from 'react';
import { apiErrorMessage, apiFetch } from '../../../../lib/temporary/api';
import { errorClass, hintClass, inputClass, primaryButton } from '../styles';
import { useAction } from '../useAction';

export function BillingForm({ onDone }: { onDone: () => void }) {
  const [values, setValues] = useState({
    billingName: '',
    billingAddress: '',
    billingState: '',
    gstin: '',
  });
  const { busy, error, run } = useAction();

  const body = {
    billingName: values.billingName.trim(),
    billingAddress: values.billingAddress.trim(),
    billingState: values.billingState.trim(),
    ...(values.gstin.trim() ? { gstin: values.gstin.trim().toUpperCase() } : {}),
  };
  const valid = meBillingSchema.safeParse(body).success;

  const field = (key: keyof typeof values, label: string, optional = false) => (
    <label className="block space-y-2">
      <span>
        {label}
        {optional ? ' (optional)' : ''}
      </span>
      <input
        value={values[key]}
        onChange={(event) => setValues({ ...values, [key]: event.target.value })}
        className={inputClass}
      />
    </label>
  );

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const ok = await run(async () => {
      const response = await apiFetch('/api/me/billing', {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      return response.ok ? null : apiErrorMessage(response, 'Could not save billing details.');
    });
    if (ok) onDone();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <h2 className="text-xl font-semibold">Billing details</h2>
      {field('billingName', 'Billing name')}
      {field('billingAddress', 'Billing address')}
      {field('billingState', 'Billing state')}
      {field('gstin', 'GSTIN', true)}
      <button type="submit" disabled={!valid || busy} className={primaryButton}>
        Save billing details
      </button>
      {!valid ? (
        <p className={hintClass}>
          Fill in the name, address and state. A GSTIN, if you add one, must be a valid 15 character
          GSTIN.
        </p>
      ) : null}
      {error ? <p className={errorClass}>{error}</p> : null}
    </form>
  );
}
