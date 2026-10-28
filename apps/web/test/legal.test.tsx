import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ContentPage } from '@/components/content/ContentPage';
import {
  CONTENT_PAGES,
  missingNotes,
  parseContent,
  readContent,
  splitMissing,
} from '@/lib/content';

describe('content pages', () => {
  it('has a title and sections for every page', () => {
    for (const page of CONTENT_PAGES) {
      const doc = parseContent(readContent(page));
      expect(doc.title, page).not.toBe('');
      expect(doc.sections.length, page).toBeGreaterThan(2);
    }
  });

  it('numbers legal sections and lists them', () => {
    render(<ContentPage markdown={readContent('terms')} numbered showMissing={false} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Terms of Service' })).toBeInTheDocument();
    expect(screen.getByText('Last updated 23 Oct 2026')).toBeInTheDocument();
    const toc = screen.getByRole('navigation', { name: 'Sections' });
    expect(
      within(toc).getByRole('link', { name: /^1\s?Agreement to these terms$/ }),
    ).toHaveAttribute('href', '#agreement-to-these-terms');
    expect(
      screen.getByRole('heading', { level: 2, name: /^1\s?Agreement to these terms$/ }),
    ).toHaveAttribute('id', 'agreement-to-these-terms');
  });

  it('turns :::missing blocks into review notes, kept apart from the text', () => {
    const md =
      '# T\n\nIntro.\n\n## A\n\nWe do X.\n\n:::missing\nX is not built.\n:::\n\nMore text.\n';
    expect(splitMissing(md).map((s) => s.kind)).toEqual(['markdown', 'missing', 'markdown']);
    expect(missingNotes(md)).toEqual(['X is not built.']);
  });

  it('shows the notes on a staging build and leaves them out of a production build', () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api-staging.valueskins.com');
    const staging = render(<ContentPage markdown={readContent('terms')} numbered />);
    expect(
      screen.getAllByRole('complementary', { name: 'Not in this version' }).length,
    ).toBeGreaterThan(0);
    staging.unmount();

    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.valueskins.com');
    render(<ContentPage markdown={readContent('terms')} numbered />);
    expect(
      screen.queryByRole('complementary', { name: 'Not in this version' }),
    ).not.toBeInTheDocument();
    // The passage itself stays.
    expect(screen.getByText(/We may suspend or close your account/)).toBeInTheDocument();
  });

  it('lists every passage marked as not in this version', () => {
    // Adding or removing a note changes this list, so it shows up in review.
    const notes = Object.fromEntries(
      CONTENT_PAGES.map((page) => [page, missingNotes(readContent(page))]),
    );
    expect(notes).toMatchInlineSnapshot(`
      {
        "how-it-works": [],
        "privacy": [
          "The only cookies are the session cookie and a short-lived cookie that protects the Instagram sign-in. Forms are protected by an Origin check, not a cookie.",
        ],
        "refunds": [
          "There is no way to suspend an account in this version.",
        ],
        "terms": [
          "There is no way to suspend an account in this version. An account ends only when its owner deletes it, or when Meta sends a data deletion request.",
          "This version cannot email every user or show a notice on the site, and it does not record which version of these terms a deal was posted under.",
        ],
      }
    `);
  });
});
