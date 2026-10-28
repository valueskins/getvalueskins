'use client';

import { useEffect, useState, type FormEvent } from 'react';
import {
  ADULT_CONFIRMATION_TEXT,
  brandProfileSchema,
  creatorProfileSchema,
  PROFILE_PITCH_MAX,
  USER_GENDERS,
  type BrandProfileInput,
  type CreatorProfileInput,
  type UserGender,
  type UserRole,
} from '@valueskins/shared';
import { useSaveProfile } from '@/lib/api/queries';
import type { ProfileDraft } from '@/lib/previewResume';
import { zodFieldErrors } from '@/lib/api/errors';
import { Button } from '@/components/ui/Button';
import { Callout, ErrorSummary } from '@/components/ui/Callout';
import { Checkbox, describedBy, Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
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

/**
 * The profile step: saved once, then locked (REPLACEMENT_PLAN 2.4). The fields follow the session's
 * role. A valid form asks for a confirm first, because it cannot be changed here afterwards.
 * `onChange` reports what is typed, for the live profile preview.
 */
export function ProfileForm({
  role,
  onSaved,
  onChange,
}: {
  role: UserRole;
  onSaved: () => void;
  onChange?: (draft: ProfileDraft) => void;
}) {
  const save = useSaveProfile();
  const [confirming, setConfirming] = useState<BrandProfileInput | CreatorProfileInput | null>(
    null,
  );
  const errors = useFormErrors();
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');
  const [website, setWebsite] = useState('');
  const [pitch, setPitch] = useState('');
  const [adult, setAdult] = useState(false);
  const isBrand = role === 'BRAND';

  useEffect(() => {
    const years = Number(age);
    onChange?.({
      name,
      city,
      age: age !== '' && years >= 18 && years <= 99 ? years : null,
      gender: (gender || null) as UserGender | null,
      website,
      pitch,
    });
  }, [onChange, name, city, age, gender, website, pitch]);

  function confirmSave() {
    if (!confirming) return;
    save.mutate(confirming, {
      onSuccess: () => {
        setConfirming(null);
        onSaved();
      },
      onError: (err) => {
        setConfirming(null);
        errors.fromApi(err);
      },
    });
  }

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
    setConfirming(parsed.data);
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
        <Field
          id="profile-name"
          label={isBrand ? 'Brand name' : 'Full name'}
          help="Shows on your profile and on every deal."
          error={f.name}
        >
          <Input
            id="profile-name"
            value={name}
            autoComplete={isBrand ? 'organization' : 'name'}
            invalid={Boolean(f.name)}
            aria-describedby={describedBy('profile-name', true, f.name)}
            onChange={(e) => {
              setName(e.target.value);
              errors.clearField('name');
            }}
          />
        </Field>
        {isBrand ? (
          <Field id="profile-city" label="City" help="Shows on your profile." error={f.city}>
            <Input
              id="profile-city"
              value={city}
              autoComplete="address-level2"
              invalid={Boolean(f.city)}
              aria-describedby={describedBy('profile-city', true, f.city)}
              onChange={(e) => {
                setCity(e.target.value);
                errors.clearField('city');
              }}
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
              onChange={(e) => {
                setWebsite(e.target.value);
                errors.clearField('website');
              }}
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
              onChange={(e) => {
                setPitch(e.target.value);
                errors.clearField('pitch');
              }}
            />
          </Field>
        </>
      ) : (
        <>
          <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-4 sm:grid-cols-[minmax(0,1fr)_140px]">
            <Field id="profile-city" label="City" help="Shows on your profile." error={f.city}>
              <Input
                id="profile-city"
                value={city}
                autoComplete="address-level2"
                invalid={Boolean(f.city)}
                aria-describedby={describedBy('profile-city', true, f.city)}
                onChange={(e) => {
                  setCity(e.target.value);
                  errors.clearField('city');
                }}
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
                onChange={(e) => {
                  setAge(e.target.value.replace(/[^\d]/g, '').slice(0, 2));
                  errors.clearField('age');
                }}
              />
            </Field>
          </div>
          <p id="profile-age-help" className="field-help -mt-3">
            Age goes up by one each year on its own.
          </p>
          <Field id="profile-gender" label="Gender" help="Shows on your profile." error={f.gender}>
            <Select
              id="profile-gender"
              value={gender}
              invalid={Boolean(f.gender)}
              aria-describedby={describedBy('profile-gender', true, f.gender)}
              onChange={(e) => {
                setGender(e.target.value);
                errors.clearField('gender');
              }}
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
          onChange={(e) => {
            setAdult(e.target.checked);
            errors.clearField('adultConfirmed');
          }}
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

      <Modal
        open={confirming !== null}
        title="Save your profile?"
        onClose={() => setConfirming(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(null)}>
              Check again
            </Button>
            <Button loading={save.isPending} onClick={confirmSave}>
              Yes, save it
            </Button>
          </>
        }
      >
        <p>Your profile is saved once. To correct it later, write to us.</p>
        {confirming ? (
          <dl className="kv mt-4">
            {profileRows(confirming, isBrand).map(([k, v]) => (
              <div key={k} className="contents">
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </Modal>
    </form>
  );
}

/** The values about to be saved, as the confirm lists them. */
function profileRows(
  input: BrandProfileInput | CreatorProfileInput,
  isBrand: boolean,
): Array<[string, string]> {
  if (isBrand) {
    const b = input as BrandProfileInput;
    const rows: Array<[string, string]> = [
      ['Brand name', b.name],
      ['City', b.city],
      ['Website', b.website],
    ];
    if (b.pitch) rows.push(['Hiring pitch', b.pitch]);
    return rows;
  }
  const c = input as CreatorProfileInput;
  return [
    ['Full name', c.name],
    ['City', c.city],
    ['Age', String(c.age)],
    ['Gender', GENDER_LABELS[c.gender]],
  ];
}
