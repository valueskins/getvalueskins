import { computeBreakdown, rupeesToPaise } from '@valueskins/shared';

/**
 * Made-up brands, creators and deals for the home page's product screens. Every handle starts with
 * "example." and every screen carries an "Example" label; nothing here is a real account.
 */

export interface ExampleDeal {
  title: string;
  brand: string;
  handle: string;
  /** Two letters for the brand's monogram tile. */
  initials: string;
  tone: 'saffron' | 'rose' | 'sand' | 'ink' | 'green' | 'plum';
  amountPaise: number;
  applyBy: string;
}

const d = (
  title: string,
  brand: string,
  handle: string,
  initials: string,
  tone: ExampleDeal['tone'],
  rupees: number,
  applyBy: string,
): ExampleDeal => ({
  title,
  brand,
  handle,
  initials,
  tone,
  amountPaise: rupeesToPaise(rupees),
  applyBy,
});

/** The deal the hero, How it works and the brand screens follow from start to finish. */
export const STORY_DEAL = d(
  'Festive kurta try-on reel',
  'Example Brand',
  'example.brand',
  'EB',
  'saffron',
  10_000,
  '18 Nov',
);
export const STORY_BREAKDOWN = computeBreakdown(STORY_DEAL.amountPaise);

export const EXAMPLE_DEALS: ExampleDeal[] = [
  STORY_DEAL,
  d('Street food city guide', 'Example Foods', 'example.foods', 'EF', 'rose', 8_000, '20 Nov'),
  d('Monsoon skincare routine', 'Example Skin', 'example.skin', 'ES', 'sand', 6_500, '21 Nov'),
  d('Sneaker unboxing reel', 'Example Kicks', 'example.kicks', 'EK', 'ink', 12_000, '22 Nov'),
  d(
    'Wedding season lookbook',
    'Example Weddings',
    'example.weddings',
    'EW',
    'plum',
    25_000,
    '24 Nov',
  ),
  d('Diwali gifting reel', 'Example Home', 'example.home', 'EH', 'green', 15_000, '25 Nov'),
  d(
    'Filter coffee brewing short',
    'Example Roasters',
    'example.roasters',
    'ER',
    'saffron',
    5_000,
    '27 Nov',
  ),
  d('Carry-on packing reel', 'Example Travel', 'example.travel', 'ET', 'rose', 9_000, '28 Nov'),
];

/** The deals already in the creator's feed before the new one slides in. */
export const FEED_DEALS = [EXAMPLE_DEALS[3]!, EXAMPLE_DEALS[1]!];

export interface ExampleApplicant {
  handle: string;
  name: string;
  followers: number;
  /** Percent, as the app gives it. */
  engagement: number;
}

export const STORY_CREATOR: ExampleApplicant = {
  handle: 'example.creator',
  name: 'Example Creator',
  followers: 48_250,
  engagement: 3.4,
};

export const OTHER_APPLICANTS: ExampleApplicant[] = [
  { handle: 'example.reels', name: 'Example Reels', followers: 31_900, engagement: 4.2 },
  { handle: 'example.styles', name: 'Example Styles', followers: 76_100, engagement: 2.6 },
];

export interface RecordDeal {
  title: string;
  amountPaise: number;
  withHandle: string;
  date: string;
}

const r = (title: string, rupees: number, withHandle: string, date: string): RecordDeal => ({
  title,
  amountPaise: rupeesToPaise(rupees),
  withHandle,
  date,
});

/** The example creator's record: the deals they finished, and with whom. */
export const RECORD_DEALS: RecordDeal[] = [
  r('Festive kurta try-on reel', 10_000, 'example.brand', '21 Oct 2026'),
  r('Sneaker unboxing reel', 12_000, 'example.kicks', '30 Sep 2026'),
  r('Street food city guide', 8_000, 'example.foods', '2 Sep 2026'),
  r('Monsoon skincare routine', 6_500, 'example.skin', '18 Jul 2026'),
];
export const RECORD_TOTAL_PAISE = RECORD_DEALS.reduce((sum, x) => sum + x.amountPaise, 0);
