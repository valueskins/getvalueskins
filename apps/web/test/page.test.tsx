import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import HomePage from '../app/page';

describe('HomePage', () => {
  it('renders ValueSkins', () => {
    render(<HomePage />);
    expect(screen.getByText('ValueSkins')).toBeInTheDocument();
  });
});
