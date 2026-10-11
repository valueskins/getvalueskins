export interface BrandFixture {
  instagramUserId: string;
  username: string;
  name: string;
  billingName: string;
  billingAddress: string;
  billingState: string;
  gstin?: string;
  /** Profile details, locked (REPLACEMENT_PLAN 2.4). Obviously fake. */
  city: string;
  website: string;
  pitch?: string;
}

export interface CreatorFixture {
  instagramUserId: string;
  username: string;
  name: string;
  /** Profile details, locked (REPLACEMENT_PLAN 2.4). Obviously fake. */
  city: string;
  age: number;
  gender: 'MALE' | 'FEMALE' | 'OTHER' | 'PREFER_NOT_TO_SAY';
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
    city: 'Bengaluru',
    website: 'https://brand-one.example',
    pitch: 'We hire creators for short food videos.',
  },
  {
    instagramUserId: 'ig_brand_2',
    username: 'brand_two',
    name: 'Brand Two Pvt Ltd',
    billingName: 'Brand Two Private Limited',
    billingAddress: '2 Linking Road, Mumbai',
    billingState: 'Maharashtra',
    city: 'Mumbai',
    website: 'https://brand-two.example',
  },
];

export const CREATOR_FIXTURES: CreatorFixture[] = [
  {
    instagramUserId: 'ig_creator_1',
    username: 'creator_one',
    name: 'Creator One',
    city: 'Pune',
    age: 24,
    gender: 'FEMALE',
    payout: { vpa: 'seedcreator1@okaxis', name: 'Seed Creator One' },
  },
  {
    instagramUserId: 'ig_creator_2',
    username: 'creator_two',
    name: 'Creator Two',
    city: 'Delhi',
    age: 29,
    gender: 'MALE',
    payout: { vpa: 'seedcreator2@okaxis', name: 'Seed Creator Two' },
  },
  {
    instagramUserId: 'ig_creator_3',
    username: 'creator_three',
    name: 'Creator Three',
    city: 'Chennai',
    age: 22,
    gender: 'OTHER',
    payout: { vpa: 'seedcreator3@okaxis', name: 'Seed Creator Three' },
  },
  {
    // No UPI details: applied to a deal but never confirmed, since
    // confirming requires them (REPLACEMENT_PLAN 2.1).
    instagramUserId: 'ig_creator_4',
    username: 'creator_four',
    name: 'Creator Four',
    city: 'Kochi',
    age: 31,
    gender: 'PREFER_NOT_TO_SAY',
  },
];
