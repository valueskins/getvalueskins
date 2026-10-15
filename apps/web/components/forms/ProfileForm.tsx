'use client';

import { useState, type FormEvent } from 'react';
import {
  ADULT_CONFIRMATION_TEXT,
  brandProfileSchema,
  creatorProfileSchema,
  PROFILE_PITCH_MAX,
  USER_GENDERS,
  type UserGender,
  type UserRole,
} from '@valueskins/shared';
import { useSaveProfile } from '@/lib/api/queries';
import { zodFieldErrors } from '@/lib/api/errors';
import { Button } from '@/components/ui/Button';
import { Callout, ErrorSummary } from '@/components/ui/Callout';
import { Checkbox, describedBy, Field, Input, Select, Textarea } from '@/components/ui/Field';
import { useFormErrors } from './useFormErrors';

export const GENDER_LABELS: Record<UserGender, string> = {
  MALE: 'Male',
  FEMALE: 'Female',
  OTHER: 'Other',
  PREFER_NOT_TO_SAY: 'Prefer not to say',
};

// Plain words for the two fields whose schema messages are generic.
const AGE_ERROR = 'Enter your age in years, from 18 to 99.';
const GENDER_ERROR = 'Choose one.';

const LABELS: Record<string, string> = {
  name: 'Full name',
  city: 'City',
  age: 'Age',
  gender: 'Gender',
  website: 'Website',
  pitch: 'Hiring pitch',
  adultConfirmed: '18 or older',
};

/** The profile step: saved once, then locked (REPLACEMENT_PLAN 2.4). The fields follow the session's role. */
export function ProfileForm({ role, onSaved }: { role: UserRole; onSaved: () => void }) {
  const save = useSaveProfile();
  const errors = useFormErrors();
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');
  const [website, setWebsite] = useState('');
  const [pitch, setPitch] = useState('');
  const [adult, setAdult] = useState(false);
  const isBrand = role === 'BRAND';

  function submit(event: FormEvent) {
    event.preventDefault();
    errors.clear();
    const parsed = isBrand
      ? brandProfileSchema.safeParse({ name, city, website, pitch, adultConfirmed: adult })
      : creatorProfileSchema.safeParse({
          name,
          city,
          age: age.trim() === '' ? Number.NaN : Number(age),
          gender: gender || undefined,
          adultConfirmed: adult,
        });
    if (!parsed.success) {
      const byField = zodFieldErrors(parsed.error.issues);
      if (byField.age) byField.age = AGE_ERROR;
      if (byField.gender) byField.gender = GENDER_ERROR;
      errors.setFields(byField);
      return;
    }
    save.mutate(parsed.data, { onSuccess: onSaved, onError: (err) => errors.fromApi(err) });
  }

  const f = errors.fields;
  const labels = isBrand ? { ...LABELS, name: 'Brand name' } : LABELS;
  const summary = Object.entries(f).map(([key, message]) => ({
    id: `profile-${key}`,
    message: `${labels[key] ?? key}: ${message}`,
  }));

  return (
    <form className="card flex flex-col gap-5 p-5 md:p-6" onSubmit={submit} noValidate>
      <ErrorSummary errors={summary} />
      <div className={isBrand ? 'grid gap-4 sm:grid-cols-2' : 'flex flex-col gap-5'}>
        <Field id="profile-name" label={isBrand ? 'Brand name' : 'Full name'} error={f.name}>
          <Input
            id="profile-name"
            value={name}
            autoComplete={isBrand ? 'organization' : 'name'}
            invalid={Boolean(f.name)}
            aria-describedby={describedBy('profile-name', null, f.name)}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        {isBrand ? (
          <Field id="profile-city" label="City" error={f.city}>
            <Input
              id="profile-city"
              value={city}
              autoComplete="address-level2"
              invalid={Boolean(f.city)}
              aria-describedby={describedBy('profile-city', null, f.city)}
              onChange={(e) => setCity(e.target.value)}
            />
          </Field>
        ) : null}
      </div>

      {isBrand ? (
        <>
          <Field
            id="profile-website"
            label="Website"
            help="Starts with http:// or https://."
            error={f.website}
          >
            <Input
              id="profile-website"
              type="url"
              value={website}
              autoComplete="url"
              invalid={Boolean(f.website)}
              aria-describedby={describedBy('profile-website', true, f.website)}
              onChange={(e) => setWebsite(e.target.value)}
            />
          </Field>
          <Field
            id="profile-pitch"
            label="Hiring pitch"
            optional
            help="What you make and the creators you like to work with. It shows on your profile."
            error={f.pitch}
            aside={
              <span className="counter" aria-live="polite">
                {pitch.length} / {PROFILE_PITCH_MAX}
              </span>
            }
          >
            <Textarea
              id="profile-pitch"
              value={pitch}
              maxLength={PROFILE_PITCH_MAX}
              invalid={Boolean(f.pitch)}
              aria-describedby={describedBy('profile-pitch', true, f.pitch)}
              onChange={(e) => setPitch(e.target.value)}
            />
          </Field>
        </>
      ) : (
        <>
          <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-4 sm:grid-cols-[minmax(0,1fr)_140px]">
            <Field id="profile-city" label="City" error={f.city}>
              <Input
                id="profile-city"
                value={city}
                autoComplete="address-level2"
                invalid={Boolean(f.city)}
                aria-describedby={describedBy('profile-city', null, f.city)}
                onChange={(e) => setCity(e.target.value)}
              />
            </Field>
            <Field id="profile-age" label="Age" error={f.age}>
              <Input
                id="profile-age"
                mono
                inputMode="numeric"
                value={age}
                invalid={Boolean(f.age)}
                aria-describedby={['profile-age-help', f.age ? 'profile-age-error' : '']
                  .filter(Boolean)
                  .join(' ')}
                onChange={(e) => setAge(e.target.value.replace(/[^\d]/g, '').slice(0, 2))}
              />
            </Field>
          </div>
          <p id="profile-age-help" className="field-help -mt-3">
            Age goes up by one each year on its own.
          </p>
          <Field id="profile-gender" label="Gender" error={f.gender}>
            <Select
              id="profile-gender"
              value={gender}
              invalid={Boolean(f.gender)}
              aria-describedby={describedBy('profile-gender', null, f.gender)}
              onChange={(e) => setGender(e.target.value)}
            >
              <option value="">Choose one</option>
              {USER_GENDERS.map((g) => (
                <option key={g} value={g}>
                  {GENDER_LABELS[g]}
                </option>
              ))}
            </Select>
          </Field>
        </>
      )}

      <div>
        <Checkbox
          id="profile-adultConfirmed"
          label={ADULT_CONFIRMATION_TEXT}
          checked={adult}
          invalid={Boolean(f.adultConfirmed)}
          onChange={(e) => setAdult(e.target.checked)}
        />
        {f.adultConfirmed ? <p className="field-error">{f.adultConfirmed}</p> : null}
      </div>

      <Callout tone="wait" title="Saved once.">
        <p>
          To correct it later, write to us.
          {isBrand ? null : ' Your followers and engagement keep updating from Instagram.'}
        </p>
      </Callout>

      {errors.form ? (
        <Callout tone="error" role="alert">
          <p>{errors.form}</p>
        </Callout>
      ) : null}

      <div>
        <Button type="submit" loading={save.isPending}>
          Save profile
        </Button>
      </div>
    </form>
  );
}
