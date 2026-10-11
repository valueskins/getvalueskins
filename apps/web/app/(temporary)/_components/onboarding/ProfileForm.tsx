'use client';

import {
  ADULT_CONFIRMATION_TEXT,
  type UserRole,
  USER_GENDERS,
  brandProfileSchema,
  creatorProfileSchema,
} from '@valueskins/shared';
import { useState } from 'react';
import { apiErrorMessage, apiFetch } from '../../../../lib/temporary/api';
import { errorClass, hintClass, inputClass, primaryButton } from '../styles';
import { useAction } from '../useAction';

const GENDER_LABEL: Record<(typeof USER_GENDERS)[number], string> = {
  MALE: 'Male',
  FEMALE: 'Female',
  OTHER: 'Other',
  PREFER_NOT_TO_SAY: 'Prefer not to say',
};

/** Profile details, saved once and then locked (REPLACEMENT_PLAN 2.4). The fields depend on the role. */
export function ProfileForm({ role, onDone }: { role: UserRole; onDone: () => void }) {
  const [values, setValues] = useState({
    name: '',
    city: '',
    age: '',
    gender: '',
    website: '',
    pitch: '',
    adultConfirmed: false,
  });
  const { busy, error, run } = useAction();

  const body =
    role === 'CREATOR'
      ? {
          name: values.name.trim(),
          city: values.city.trim(),
          age: Number(values.age),
          gender: values.gender,
          adultConfirmed: values.adultConfirmed,
        }
      : {
          name: values.name.trim(),
          city: values.city.trim(),
          website: values.website.trim(),
          ...(values.pitch.trim() ? { pitch: values.pitch.trim() } : {}),
          adultConfirmed: values.adultConfirmed,
        };
  const valid = (role === 'CREATOR' ? creatorProfileSchema : brandProfileSchema).safeParse(
    body,
  ).success;

  const text = (key: 'name' | 'city' | 'age' | 'website', label: string) => (
    <label className="block space-y-2">
      <span>{label}</span>
      <input
        value={values[key]}
        onChange={(event) => setValues({ ...values, [key]: event.target.value })}
        inputMode={key === 'age' ? 'numeric' : undefined}
        className={inputClass}
      />
    </label>
  );

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const ok = await run(async () => {
      const response = await apiFetch('/api/me/profile', {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      return response.ok ? null : apiErrorMessage(response, 'Could not save your profile.');
    });
    if (ok) onDone();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <h2 className="text-xl font-semibold">Your profile</h2>
      <p className={hintClass}>
        You can save these details once. To correct them later, write to us.
      </p>
      {text('name', role === 'CREATOR' ? 'Your name' : 'Brand name')}
      {text('city', 'City')}
      {role === 'CREATOR' ? (
        <>
          {text('age', 'Age (18 to 99)')}
          <label className="block space-y-2">
            <span>Gender</span>
            <select
              value={values.gender}
              onChange={(event) => setValues({ ...values, gender: event.target.value })}
              className={inputClass}
            >
              <option value="">Choose</option>
              {USER_GENDERS.map((gender) => (
                <option key={gender} value={gender}>
                  {GENDER_LABEL[gender]}
                </option>
              ))}
            </select>
          </label>
        </>
      ) : (
        <>
          {text('website', 'Website (starts with https://)')}
          <label className="block space-y-2">
            <span>What you hire for (optional, up to 1,000 characters)</span>
            <textarea
              value={values.pitch}
              onChange={(event) => setValues({ ...values, pitch: event.target.value })}
              rows={4}
              className={inputClass}
            />
          </label>
        </>
      )}
      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={values.adultConfirmed}
          onChange={(event) => setValues({ ...values, adultConfirmed: event.target.checked })}
        />
        <span>{ADULT_CONFIRMATION_TEXT}</span>
      </label>
      <button type="submit" disabled={!valid || busy} className={primaryButton}>
        Save profile
      </button>
      {!valid ? (
        <p className={hintClass}>Fill in every field and tick the box to continue.</p>
      ) : null}
      {error ? <p className={errorClass}>{error}</p> : null}
    </form>
  );
}
