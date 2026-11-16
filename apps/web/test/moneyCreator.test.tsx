import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Money } from '@/components/ui/Money';

describe('Money', () => {
  it('marks only the creator money with the lime classes', () => {
    const { container } = render(
      <>
        <Money paise={300_000} creator="advance" />
        <Money paise={700_000} creator="final" />
        <Money paise={911_500} creator="total" />
        <Money paise={88_500} />
      </>,
    );
    const [advance, final, total, fee] = [...container.querySelectorAll('.money')];
    expect(advance).toHaveClass('money-creator', 'money-creator-soft');
    expect(final).toHaveClass('money-creator');
    expect(final).not.toHaveClass('money-creator-soft');
    expect(total).toHaveClass('money-creator');
    expect(fee).not.toHaveClass('money-creator');
    expect(advance).toHaveTextContent('₹3,000.00');
  });
});
