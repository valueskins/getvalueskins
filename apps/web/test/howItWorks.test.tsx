import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { computeBreakdown, formatInr, rupeesToPaise } from '@valueskins/shared';
import { HowItWorksPage } from '@/components/public/HowItWorksPage';
import { parseSections, readContent } from '@/lib/content';
import { mockApi } from './helpers/api';
import { CONFIG } from './helpers/fixtures';
import { renderWithProviders } from './helpers/render';

const doc = parseSections(readContent('how-it-works'));

describe('/how-it-works', () => {
  it('splits the page into its sections and the ten steps, keeping the text as written', () => {
    expect(doc.sections.map((s) => s.title)).toEqual([
      'Step by step',
      'An example',
      'The rules',
      'What ValueSkins does not do yet',
      'If something goes wrong',
    ]);
    expect(doc.sections[0]!.parts).toHaveLength(10);
    expect(doc.sections[0]!.parts[0]!.title).toBe('Sign in with Instagram, then set up');
    expect(doc.sections[3]!.parts.map((p) => p.title)).toEqual([
      'Scope',
      'Money and tax',
      'Deals',
      'Profiles',
    ]);
  });

  it('shows every step beside a picture of the product, with example data and no images', () => {
    mockApi({ 'GET /config': CONFIG });
    const { container } = renderWithProviders(<HowItWorksPage doc={doc} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('How it works');
    for (const part of doc.sections[0]!.parts) {
      expect(screen.getByRole('heading', { level: 3, name: part.title })).toBeInTheDocument();
    }
    // Ten steps, ten pictures, each labelled as an example.
    const pictures = container.querySelectorAll('.hiw-show [role="img"]');
    expect(pictures).toHaveLength(10);
    for (const picture of pictures) {
      expect(picture.getAttribute('aria-label')).toMatch(/^Example/);
    }
    expect(container.querySelector('img')).toBeNull();
    // Every handle is made up. Email addresses and the masked UPI ID in the text are not handles.
    for (const handle of container.textContent!.match(/(?<![\w•])@[a-z0-9._]+/gi) ?? []) {
      expect(handle).toMatch(/^@example\./);
    }
  });

  it('uses the same figures as the home page: a ₹10,000 deal, ₹885 fee, 30% and 70%', () => {
    mockApi({ 'GET /config': CONFIG });
    renderWithProviders(<HowItWorksPage doc={doc} />);
    const b = computeBreakdown(rupeesToPaise(10_000));
    for (const paise of [b.commissionTotalPaise, b.advancePaise, b.finalPaise]) {
      expect(
        screen.getAllByText(new RegExp(formatInr(paise).replace('.', '\\.'))).length,
      ).toBeGreaterThan(0);
    }
    expect(screen.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute(
      'href',
      '/terms',
    );
  });
});
