import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import PrivacyPage from '../app/(temporary)/privacy/page';
import TermsPage from '../app/(temporary)/terms/page';
import { readFileSync } from 'node:fs';
import path from 'node:path';

describe('/privacy and /terms', () => {
  it('render the markdown content and mark it as a draft', () => {
    render(<PrivacyPage />);
    expect(screen.getByRole('heading', { name: 'Privacy policy', level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/DRAFT/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Deleting your data' })).toBeInTheDocument();
  });

  it('renders the terms the same way', () => {
    render(<TermsPage />);
    expect(screen.getByRole('heading', { name: 'Terms of service', level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/DRAFT/)).toBeInTheDocument();
  });

  it('keeps the placeholder text within the copy rules (no em dashes, no marketing words)', () => {
    for (const file of ['privacy.md', 'terms.md']) {
      const text = readFileSync(path.join(process.cwd(), 'content', file), 'utf8');
      expect(text).not.toMatch(/—/);
      expect(text).not.toMatch(/\b(unlock|seamless|powered by|effortless|supercharge)\b/i);
    }
  });
});
