'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import { meBillingSchema, type BillingView } from '@valueskins/shared';
import { useSaveBilling } from '@/lib/api/queries';
import { zodFieldErrors } from '@/lib/api/errors';
import { INDIAN_STATES } from '@/lib/indianStates';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { describedBy, Field, Input, Select, Textarea } from '@/components/ui/Field';
import { useFormErrors } from './useFormErrors';

const REQUIRED: Record<string, string> = {
  billingName: 'Enter the billing name.',
  billingAddress: 'Enter the billing address.',
  billingState: 'Choose a state or union territory.',
  gstin: 'Not a valid GSTIN. It has 15 characters, like 27ABCDE1234F1Z5.',
};

/** The brand's billing details for the fee's GST tax invoice. */
export function BillingForm({
  initial,
  submitLabel,
  onSaved,
  secondary,
}: {
  initial?: BillingView | null;
  submitLabel: string;
  onSaved: () => void;
  secondary?: ReactNode;
}) {
  const save = useSaveBilling();
  const errors = useFormErrors();
  const [billingName, setName] = useState(initial?.billingName ?? '');
  const [billingAddress, setAddress] = useState(initial?.billingAddress ?? '');
  const [billingState, setState] = useState(initial?.billingState ?? '');
  const [gstin, setGstin] = useState(initial?.gstin ?? '');

  function submit(event: FormEvent) {
    event.preventDefault();
    errors.clear();
    const input = {
      billingName: billingName.trim(),
      billingAddress: billingAddress.trim(),
      billingState,
      ...(gstin.trim() ? { gstin: gstin.trim().toUpperCase() } : {}),
    };
    const parsed = meBillingSchema.safeParse(input);
    if (!parsed.success) {
      const byField = zodFieldErrors(parsed.error.issues);
      for (const key of Object.keys(byField)) byField[key] = REQUIRED[key] ?? byField[key]!;
      errors.setFields(byField);
      return;
    }
    save.mutate(parsed.data, { onSuccess: onSaved, onError: (err) => errors.fromApi(err) });
  }

  const f = errors.fields;
  return (
    <form className="flex flex-col gap-5" onSubmit={submit} noValidate>
      <Field
        id="billing-name"
        label="Billing name"
        help="The legal name of the business, or your own name."
        error={f.billingName}
      >
        <Input
          id="billing-name"
          value={billingName}
          autoComplete="organization"
          invalid={Boolean(f.billingName)}
          aria-describedby={describedBy('billing-name', true, f.billingName)}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field
        id="billing-address"
        label="Billing address"
        help="Printed on your GST tax invoice."
        error={f.billingAddress}
      >
        <Textarea
          id="billing-address"
          value={billingAddress}
          autoComplete="street-address"
          invalid={Boolean(f.billingAddress)}
          aria-describedby={describedBy('billing-address', true, f.billingAddress)}
          onChange={(e) => setAddress(e.target.value)}
        />
      </Field>
      <Field
        id="billing-state"
        label="State or union territory"
        help="Decides how GST is split on your invoice."
        error={f.billingState}
      >
        <Select
          id="billing-state"
          value={billingState}
          invalid={Boolean(f.billingState)}
          aria-describedby={describedBy('billing-state', true, f.billingState)}
          onChange={(e) => setState(e.target.value)}
        >
          <option value="">Choose one</option>
          {INDIAN_STATES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        id="billing-gstin"
        label="GSTIN"
        optional
        help="15 characters. Leave it empty if you are not registered for GST."
        error={f.gstin}
      >
        <Input
          id="billing-gstin"
          mono
          value={gstin}
          maxLength={15}
          autoCapitalize="characters"
          invalid={Boolean(f.gstin)}
          aria-describedby={describedBy('billing-gstin', true, f.gstin)}
          onChange={(e) => setGstin(e.target.value.toUpperCase())}
        />
      </Field>
      {errors.form ? (
        <Callout tone="error" role="alert">
          <p>{errors.form}</p>
        </Callout>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" loading={save.isPending}>
          {submitLabel}
        </Button>
        {secondary}
      </div>
    </form>
  );
}
