import { render } from '@testing-library/react';
import type { DealDetail } from '@valueskins/shared';
import { describe, expect, it } from 'vitest';
import { CreatorAmounts } from '@/components/deal/CreatorAmounts';

const deal = { advancePaise: 273_450, finalPaise: 638_050 } as DealDetail;

describe('CreatorAmounts', () => {
  it('puts the 30% in the soft lime and the 70% in the solid lime, and leaves the words alone', () => {
    const { container } = render(
      <p>
        <CreatorAmounts
          deal={deal}
          text="Pay @meera ₹2,734.50 by UPI, then the final ₹6,380.50 after approval."
        />
      </p>,
    );
    expect(container).toHaveTextContent(
      'Pay @meera ₹2,734.50 by UPI, then the final ₹6,380.50 after approval.',
    );
    const [advance, final] = [...container.querySelectorAll('.money-creator')];
    expect(advance).toHaveTextContent('₹2,734.50');
    expect(advance).toHaveClass('money-creator-soft');
    expect(final).toHaveTextContent('₹6,380.50');
    expect(final).not.toHaveClass('money-creator-soft');
  });

  it('matches whole figures only, and no other amount', () => {
    const { container } = render(
      <p>
        <CreatorAmounts deal={deal} text="Budget ₹12,734.50 and fee ₹885.00 and ₹2,734.505." />
      </p>,
    );
    expect(container.querySelectorAll('.money-creator')).toHaveLength(0);
  });
});
