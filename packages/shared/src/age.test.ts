import { describe, expect, it } from 'vitest';
import { currentAge } from './age.js';

const recorded = new Date('2026-03-10T09:00:00.000Z');

describe('currentAge', () => {
  it('is the age given on the day it was given', () => {
    expect(currentAge(25, recorded, recorded)).toBe(25);
  });

  it('stays the same until the first anniversary', () => {
    expect(currentAge(25, recorded, new Date('2027-03-10T08:59:59.999Z'))).toBe(25);
  });

  it('goes up by one on the anniversary', () => {
    expect(currentAge(25, recorded, new Date('2027-03-10T09:00:00.000Z'))).toBe(26);
  });

  it('goes up by one for each whole year', () => {
    expect(currentAge(25, recorded, new Date('2031-06-01T00:00:00.000Z'))).toBe(30);
  });

  it('is never below the age given, even if the clock is earlier', () => {
    expect(currentAge(25, recorded, new Date('2025-01-01T00:00:00.000Z'))).toBe(25);
  });

  it('handles a 29 February record', () => {
    const leap = new Date('2028-02-29T00:00:00.000Z');
    expect(currentAge(30, leap, new Date('2029-02-28T00:00:00.000Z'))).toBe(30);
    expect(currentAge(30, leap, new Date('2029-03-01T00:00:00.000Z'))).toBe(31);
  });
});
