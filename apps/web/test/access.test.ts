import { describe, expect, it } from 'vitest';
import { decideAccess, homePathFor } from '@/lib/access';
import { makeMe } from './helpers/fixtures';

const creatorDone = makeMe({ role: 'CREATOR', done: ['email', 'profile'] });
const brandDone = makeMe({ role: 'BRAND', done: ['email', 'profile', 'billing'] });
const brandHalfway = makeMe({ role: 'BRAND', done: ['email'] });
const emailOnly = makeMe({ role: null, done: ['email'] });

describe('decideAccess', () => {
  it('lets anyone open public pages', () => {
    expect(decideAccess(null, 'public')).toEqual({ kind: 'ok' });
    expect(decideAccess(brandDone, 'public')).toEqual({ kind: 'ok' });
  });

  it('sends a signed-in user from the home page to where they start', () => {
    expect(decideAccess(null, 'home')).toEqual({ kind: 'ok' });
    expect(decideAccess(creatorDone, 'home')).toEqual({ kind: 'redirect', to: '/deals' });
    expect(decideAccess(brandDone, 'home')).toEqual({ kind: 'redirect', to: '/campaigns' });
    expect(decideAccess(brandHalfway, 'home')).toEqual({ kind: 'redirect', to: '/onboarding' });
  });

  it('sends a signed-out user home from every signed-in page', () => {
    for (const need of ['setup', 'app', 'CREATOR', 'BRAND'] as const) {
      expect(decideAccess(null, need)).toEqual({ kind: 'redirect', to: '/' });
    }
  });

  it('lets any signed-in user set up', () => {
    expect(decideAccess(emailOnly, 'setup')).toEqual({ kind: 'ok' });
    expect(decideAccess(brandHalfway, 'setup')).toEqual({ kind: 'ok' });
  });

  it('sends unfinished onboarding and accounts with no role to /onboarding', () => {
    expect(decideAccess(brandHalfway, 'app')).toEqual({ kind: 'redirect', to: '/onboarding' });
    expect(decideAccess(brandHalfway, 'BRAND')).toEqual({ kind: 'redirect', to: '/onboarding' });
    expect(decideAccess(emailOnly, 'CREATOR')).toEqual({ kind: 'redirect', to: '/onboarding' });
  });

  it('treats a creator without a UPI ID as onboarded', () => {
    expect(creatorDone.onboarding.completed).toBe(true);
    expect(decideAccess(creatorDone, 'CREATOR')).toEqual({ kind: 'ok' });
  });

  it('gives the wrong role a 404', () => {
    expect(decideAccess(creatorDone, 'BRAND')).toEqual({ kind: 'notFound' });
    expect(decideAccess(brandDone, 'CREATOR')).toEqual({ kind: 'notFound' });
  });

  it('lets both roles open shared signed-in pages', () => {
    expect(decideAccess(creatorDone, 'app')).toEqual({ kind: 'ok' });
    expect(decideAccess(brandDone, 'app')).toEqual({ kind: 'ok' });
  });

  it('starts each role on its own home', () => {
    expect(homePathFor(creatorDone)).toBe('/deals');
    expect(homePathFor(brandDone)).toBe('/campaigns');
  });
});
