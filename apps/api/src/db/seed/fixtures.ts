export interface BrandFixture {
  instagramUserId: string;
  username: string;
  name: string;
  billingName: string;
  billingAddress: string;
  billingState: string;
  gstin?: string;
}

export interface CreatorFixture {
  instagramUserId: string;
  username: string;
  name: string;
  /** Obviously fake UPI details (REPLACEMENT_PLAN 2.1). Absent for the creator who has not added any. */
  payout?: { vpa: string; name: string };
}

export const BRAND_FIXTURES: BrandFixture[] = [
  {
    instagramUserId: 'ig_brand_1',
    username: 'brand_one',
    name: 'Brand One Pvt Ltd',
    billingName: 'Brand One Private Limited',
    billingAddress: '1 MG Road, Bengaluru',
    billingState: 'Karnataka',
    gstin: '29ABCDE1234F1Z5',
  },
  {
    instagramUserId: 'ig_brand_2',
    username: 'brand_two',
    name: 'Brand Two Pvt Ltd',
    billingName: 'Brand Two Private Limited',
    billingAddress: '2 Linking Road, Mumbai',
    billingState: 'Maharashtra',
  },
];

export const CREATOR_FIXTURES: CreatorFixture[] = [
  {
    instagramUserId: 'ig_creator_1',
    username: 'creator_one',
    name: 'Creator One',
    payout: { vpa: 'seedcreator1@okaxis', name: 'Seed Creator One' },
  },
  {
    instagramUserId: 'ig_creator_2',
    username: 'creator_two',
    name: 'Creator Two',
    payout: { vpa: 'seedcreator2@okaxis', name: 'Seed Creator Two' },
  },
  {
    instagramUserId: 'ig_creator_3',
    username: 'creator_three',
    name: 'Creator Three',
    payout: { vpa: 'seedcreator3@okaxis', name: 'Seed Creator Three' },
  },
  {
    // No UPI details: applied to a deal but never confirmed, since
    // confirming requires them (REPLACEMENT_PLAN 2.1).
    instagramUserId: 'ig_creator_4',
    username: 'creator_four',
    name: 'Creator Four',
  },
];
