import type { DealDetail, MeResponse } from '@valueskins/shared';
import { DealPage } from '@/components/deal/DealPage';
import { mockApi } from './api';
import { CONFIG, makeMe } from './fixtures';
import { BRAND, CREATOR, DEAL_ID } from './deals';
import { renderWithProviders } from './render';

export function meAs(who: 'brand' | 'creator' | 'other'): MeResponse {
  const role = who === 'brand' ? 'BRAND' : 'CREATOR';
  const base = makeMe({
    role,
    done: role === 'BRAND' ? ['email', 'profile', 'billing'] : ['email', 'profile', 'payout'],
  });
  const id = who === 'brand' ? BRAND.id : who === 'creator' ? CREATOR.id : base.user.id;
  return { ...base, user: { ...base.user, id } };
}

/** Renders /deals/[id] for one viewer, with GET routes answered from `deal`. */
export function renderDeal(
  deal: DealDetail,
  who: 'brand' | 'creator' | 'other',
  routes: Record<string, unknown> = {},
) {
  const api = mockApi({
    'GET /me': meAs(who),
    'GET /config': CONFIG,
    [`GET /deals/${DEAL_ID}`]: { deal },
    [`GET /deals/${DEAL_ID}/events`]: { items: [], nextCursor: null },
    [`GET /deals/${DEAL_ID}/emails`]: { items: [], nextCursor: null },
    ...routes,
  });
  const view = renderWithProviders(<DealPage id={DEAL_ID} />);
  return { api, ...view };
}
