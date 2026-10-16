import { describe, expect, it } from 'vitest';
import { isLaunchOpen, LAUNCH_MODES } from './launch.js';

describe('isLaunchOpen', () => {
  it('lists the three modes', () => {
    expect([...LAUNCH_MODES]).toEqual(['off', 'admins', 'on']);
  });

  it('off is closed for everyone', () => {
    expect(isLaunchOpen('off', false)).toBe(false);
    expect(isLaunchOpen('off', true)).toBe(false);
  });

  it('admins is open for admins only', () => {
    expect(isLaunchOpen('admins', true)).toBe(true);
    expect(isLaunchOpen('admins', false)).toBe(false);
  });

  it('on is open for everyone', () => {
    expect(isLaunchOpen('on', false)).toBe(true);
    expect(isLaunchOpen('on', true)).toBe(true);
  });
});
