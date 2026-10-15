'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import {
  maskVpa,
  mePayoutUpiSchema,
  PAYOUT_CONSENT_TEXT,
  UPI_NOT_VERIFIED_WARNING,
  UPI_VPA_REGEX,
} from '@valueskins/shared';
import { useSavePayoutUpi } from '@/lib/api/queries';
import { zodFieldErrors } from '@/lib/api/errors';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Checkbox, describedBy, Field, Input } from '@/components/ui/Field';
import { useFormErrors } from './useFormErrors';

const EXAMPLE_MASK = 'cr•••@okhdfcbank';

/** The per-field messages from the shared schema, for whatever has been typed so far. */
function liveErrors(vpa: string, name: string): { vpa?: string; name?: string } {
  const parsed = mePayoutUpiSchema.safeParse({ vpa, name, consent: true });
  if (parsed.success) return {};
  const byField = zodFieldErrors(parsed.error.issues);
  return {
    vpa: vpa.trim() ? byField.vpa : undefined,
    name: name.trim() ? byField.name : undefined,
  };
}

/**
 * The creator's UPI payout details (REPLACEMENT_PLAN 2.1). The typed UPI ID is
 * only ever in this input: after a save the API answers with the masked form.
 */
export function UpiForm({
  onSaved,
  secondary,
  vpaLabel = 'UPI ID',
  consentNote,
}: {
  onSaved: () => void;
  /** "Do this later" in onboarding, "Cancel" in settings. */
  secondary?: ReactNode;
  vpaLabel?: string;
  consentNote?: ReactNode;
}) {
  const save = useSavePayoutUpi();
  const errors = useFormErrors();
  const [vpa, setVpa] = useState('');
  const [name, setName] = useState('');
  const [consent, setConsent] = useState(false);

  const live = liveErrors(vpa, name);
  const vpaError = live.vpa ?? errors.fields.vpa;
  const nameError = live.name ?? errors.fields.name;
  const trimmed = vpa.trim().toLowerCase();
  const masked = UPI_VPA_REGEX.test(trimmed) ? maskVpa(trimmed) : EXAMPLE_MASK;

  let reason: string | null = null;
  if (!vpa.trim() || live.vpa) reason = 'Enter a valid UPI ID first';
  else if (!name.trim() || live.name) reason = 'Enter the name on the account';
  else if (!consent) reason = 'Tick the box to agree first';

  function submit(event: FormEvent) {
    event.preventDefault();
    if (reason) return;
    errors.clear();
    const parsed = mePayoutUpiSchema.safeParse({ vpa, name, consent });
    if (!parsed.success) {
      errors.setFields(zodFieldErrors(parsed.error.issues));
      return;
    }
    save.mutate(parsed.data, {
      onSuccess: () => {
        setVpa('');
        onSaved();
      },
      onError: (err) => errors.fromApi(err),
    });
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={submit} noValidate>
      <Field
        id="upi-vpa"
        label={vpaLabel}
        help={
          vpaError
            ? null
            : "The ID you get paid on, like name@okhdfcbank. Find it on your UPI app's profile."
        }
        error={vpaError}
      >
        <Input
          id="upi-vpa"
          mono
          value={vpa}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          invalid={Boolean(vpaError)}
          aria-describedby={describedBy('upi-vpa', !vpaError, vpaError)}
          onChange={(e) => setVpa(e.target.value)}
        />
      </Field>
      <Field
        id="upi-name"
        label="Name on the account"
        help={
          nameError
            ? null
            : 'Exactly as your UPI app shows it. Brands check this name before they pay.'
        }
        error={nameError}
      >
        <Input
          id="upi-name"
          value={name}
          autoComplete="name"
          invalid={Boolean(nameError)}
          aria-describedby={describedBy('upi-name', !nameError, nameError)}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Callout tone="wait">
        <p>{UPI_NOT_VERIFIED_WARNING}</p>
      </Callout>
      <div className="flex flex-col gap-1">
        <Checkbox
          label={PAYOUT_CONSENT_TEXT}
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
        />
        <p className="field-help pl-8">
          {consentNote ?? (
            <>
              Only that brand sees it in full, and only while a payment is due. Everyone else sees{' '}
              <span className="t-mono">{masked}</span>.
            </>
          )}
        </p>
      </div>
      {errors.form ? (
        <Callout tone="error" role="alert">
          <p>{errors.form}</p>
        </Callout>
      ) : null}
      <div className="flex flex-wrap items-start gap-3">
        <Button type="submit" loading={save.isPending} disabledReason={reason}>
          Save UPI ID
        </Button>
        {secondary}
      </div>
    </form>
  );
}
