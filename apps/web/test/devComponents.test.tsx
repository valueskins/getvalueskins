import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import DevComponentsPage from '@/app/dev/components/page';
import { mockApi } from './helpers/api';
import { CONFIG } from './helpers/fixtures';
import { renderWithProviders } from './helpers/render';

describe('/dev/components', () => {
  it('is a 404 unless NEXT_PUBLIC_ENABLE_DEV_LOGIN is "true"', () => {
    expect(() => DevComponentsPage()).toThrow('NEXT_NOT_FOUND');
    vi.stubEnv('NEXT_PUBLIC_ENABLE_DEV_LOGIN', 'false');
    expect(() => DevComponentsPage()).toThrow('NEXT_NOT_FOUND');
  });

  it('shows every deal status, and opens the modal from the keyboard', () => {
    vi.stubEnv('NEXT_PUBLIC_ENABLE_DEV_LOGIN', 'true');
    mockApi({ 'GET /config': CONFIG });
    renderWithProviders(<DevComponentsPage />);
    const badges = screen.getByRole('region', { name: 'Badges and deal status' });
    for (const label of [
      'Draft',
      'Open',
      'Confirmed',
      'Fee paid',
      'Advance confirmed',
      'Content shared',
      'Changes requested',
      'Approved',
      'Completed',
      'Cancelled',
    ]) {
      expect(within(badges).getAllByText(label).length).toBeGreaterThan(0);
    }
    fireEvent.click(screen.getByRole('button', { name: 'Open the modal' }));
    const dialog = screen.getByRole('dialog', { name: 'Cancel this deal?' });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(dialog).not.toBeInTheDocument();
  });
});
