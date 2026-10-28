'use client';

import { useState } from 'react';
import { ApiError } from '@/lib/api/client';
import { errorText, fieldErrors } from '@/lib/api/errors';

/**
 * Field errors and one form-level error. A VALIDATION_ERROR from the API is
 * spread onto the matching fields; anything else becomes the form error.
 */
export function useFormErrors() {
  const [fields, setFields] = useState<Record<string, string>>({});
  const [form, setForm] = useState<string | null>(null);

  function fromApi(err: unknown, overrides?: Record<string, string>) {
    if (err instanceof ApiError && err.code === 'VALIDATION_ERROR' && err.details.length) {
      const byField = fieldErrors(err.details);
      setFields(byField);
      setForm(Object.keys(byField).length ? null : errorText(err, overrides));
      return;
    }
    setFields({});
    setForm(errorText(err, overrides));
  }

  return {
    fields,
    form,
    setFields,
    setForm,
    fromApi,
    /** Removes one field's error, once the person starts correcting it. */
    clearField: (key: string) =>
      setFields((current) => {
        if (!(key in current)) return current;
        const next = { ...current };
        delete next[key];
        return next;
      }),
    clear: () => {
      setFields({});
      setForm(null);
    },
  };
}
