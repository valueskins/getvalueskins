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
  payoutAccount?: {
    razorpayAccountId: string;
    razorpayStakeholderId: string;
    razorpayProductId: string;
  };
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
    payoutAccount: {
      razorpayAccountId: 'acc_seed_creator_1',
      razorpayStakeholderId: 'sth_seed_creator_1',
      razorpayProductId: 'prd_seed_creator_1',
    },
  },
  {
    instagramUserId: 'ig_creator_2',
    username: 'creator_two',
    name: 'Creator Two',
    payoutAccount: {
      razorpayAccountId: 'acc_seed_creator_2',
      razorpayStakeholderId: 'sth_seed_creator_2',
      razorpayProductId: 'prd_seed_creator_2',
    },
  },
  {
    instagramUserId: 'ig_creator_3',
    username: 'creator_three',
    name: 'Creator Three',
    payoutAccount: {
      razorpayAccountId: 'acc_seed_creator_3',
      razorpayStakeholderId: 'sth_seed_creator_3',
      razorpayProductId: 'prd_seed_creator_3',
    },
  },
  {
    // No payout account: applied to a deal but never confirmed, since
    // confirming requires an ACTIVE payout account (SPEC 5.2).
    instagramUserId: 'ig_creator_4',
    username: 'creator_four',
    name: 'Creator Four',
  },
];
