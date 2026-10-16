import { describe, expect, it } from 'vitest';
import { brandProfileSchema, creatorProfileSchema, INVALID_BRAND_NAME } from './profile.js';

const creator = {
  name: 'Asha Rao',
  city: 'Pune',
  age: 24,
  gender: 'FEMALE',
  adultConfirmed: true,
};

const brand = {
  name: 'Acme Foods',
  city: 'Mumbai',
  website: 'https://acme.example',
  adultConfirmed: true,
};

describe('creatorProfileSchema', () => {
  it('accepts a valid creator profile and trims text', () => {
    const result = creatorProfileSchema.safeParse({ ...creator, name: '  Asha Rao ' });
    expect(result.success && result.data.name).toBe('Asha Rao');
  });

  it.each([17, 18, 99, 100, 24.5, -1])('age %s', (age) => {
    const ok = age >= 18 && age <= 99 && Number.isInteger(age);
    expect(creatorProfileSchema.safeParse({ ...creator, age }).success).toBe(ok);
  });

  it('needs every field and the 18 or older tick', () => {
    for (const key of Object.keys(creator)) {
      const rest: Record<string, unknown> = { ...creator };
      delete rest[key];
      expect(creatorProfileSchema.safeParse(rest).success).toBe(false);
    }
    expect(creatorProfileSchema.safeParse({ ...creator, adultConfirmed: false }).success).toBe(
      false,
    );
  });

  it('rejects a gender outside the list', () => {
    expect(creatorProfileSchema.safeParse({ ...creator, gender: 'MALE' }).success).toBe(true);
    expect(
      creatorProfileSchema.safeParse({ ...creator, gender: 'PREFER_NOT_TO_SAY' }).success,
    ).toBe(true);
    expect(creatorProfileSchema.safeParse({ ...creator, gender: 'other' }).success).toBe(false);
  });

  it('rejects brand fields, a role and unknown fields', () => {
    expect(
      creatorProfileSchema.safeParse({ ...creator, website: 'https://a.example' }).success,
    ).toBe(false);
    expect(creatorProfileSchema.safeParse({ ...creator, pitch: 'Hire me' }).success).toBe(false);
    expect(creatorProfileSchema.safeParse({ ...creator, role: 'BRAND' }).success).toBe(false);
  });

  it('rejects a name that is a number or has symbols', () => {
    expect(creatorProfileSchema.safeParse({ ...creator, name: '12345' }).success).toBe(false);
    expect(creatorProfileSchema.safeParse({ ...creator, name: 'A' }).success).toBe(false);
    expect(creatorProfileSchema.safeParse({ ...creator, name: 'आशा राव' }).success).toBe(true);
  });
});

describe('brandProfileSchema', () => {
  it('accepts a brand name with digits, also at the start', () => {
    for (const name of ['Studio 9', '21st Street', 'Brew 2 Go']) {
      expect(brandProfileSchema.safeParse({ ...brand, name }).success).toBe(true);
    }
  });

  it('still refuses symbols in a brand name, with the brand message', () => {
    const result = brandProfileSchema.safeParse({ ...brand, name: 'Acme @ Home' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(INVALID_BRAND_NAME);
  });

  it('keeps digits out of a creator name', () => {
    expect(creatorProfileSchema.safeParse({ ...creator, name: 'Studio 9' }).success).toBe(false);
    expect(creatorProfileSchema.safeParse({ ...creator, name: '21st Street' }).success).toBe(false);
  });

  it('accepts a brand with no pitch, and leaves it out', () => {
    const result = brandProfileSchema.safeParse(brand);
    expect(result.success && result.data.pitch).toBeUndefined();
  });

  it('treats a blank pitch as no pitch', () => {
    const result = brandProfileSchema.safeParse({ ...brand, pitch: '   ' });
    expect(result.success && result.data.pitch).toBeUndefined();
  });

  it('allows a pitch of exactly 1,000 characters and refuses 1,001', () => {
    expect(brandProfileSchema.safeParse({ ...brand, pitch: 'a'.repeat(1000) }).success).toBe(true);
    expect(brandProfileSchema.safeParse({ ...brand, pitch: 'a'.repeat(1001) }).success).toBe(false);
  });

  it.each([
    ['https://acme.example', true],
    ['http://acme.example/path?x=1', true],
    ['acme.example', false],
    ['javascript:alert(1)', false],
    ['ftp://acme.example', false],
    ['', false],
  ])('website %j', (website, ok) => {
    expect(brandProfileSchema.safeParse({ ...brand, website }).success).toBe(ok);
  });

  it('rejects creator fields and unknown fields', () => {
    expect(brandProfileSchema.safeParse({ ...brand, age: 30 }).success).toBe(false);
    expect(brandProfileSchema.safeParse({ ...brand, gender: 'MALE' }).success).toBe(false);
    expect(brandProfileSchema.safeParse({ ...brand, profileLockedAt: 'x' }).success).toBe(false);
  });

  it('needs the 18 or older tick', () => {
    expect(brandProfileSchema.safeParse({ ...brand, adultConfirmed: false }).success).toBe(false);
  });
});
