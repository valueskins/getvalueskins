import { describe, expect, it } from 'vitest';
import { roleFromAccountType } from './accountType.js';

describe('roleFromAccountType', () => {
  it('maps a Business account to a brand and a Creator account to a creator', () => {
    expect(roleFromAccountType('BUSINESS')).toBe('BRAND');
    expect(roleFromAccountType('MEDIA_CREATOR')).toBe('CREATOR');
  });

  it('ignores letter case, as Meta lists the values as Business and Media_Creator', () => {
    expect(roleFromAccountType('Business')).toBe('BRAND');
    expect(roleFromAccountType('Media_Creator')).toBe('CREATOR');
  });

  it.each(['PERSONAL', 'CREATOR', '', ' BUSINESS', 'ADMIN', 'BUSINESS '])(
    'does not accept %j',
    (type) => {
      expect(roleFromAccountType(type)).toBeNull();
    },
  );

  it('does not accept a missing type', () => {
    expect(roleFromAccountType(undefined)).toBeNull();
    expect(roleFromAccountType(null)).toBeNull();
  });
});
