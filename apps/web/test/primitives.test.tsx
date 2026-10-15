import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Button } from '@/components/ui/Button';
import { InstagramSummary } from '@/components/onboarding/InstagramSummary';
import { makeMe } from './helpers/fixtures';

describe('Button', () => {
  it('shows the reason under a disabled button, word for word', () => {
    render(<Button disabledReason="Tick the box to agree first">Save UPI ID</Button>);
    const button = screen.getByRole('button', { name: 'Save UPI ID' });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription('Tick the box to agree first');
  });

  it('keeps the same button, and its focus, when the reason comes and goes', () => {
    const { rerender } = render(
      <Button disabledReason="Enter a username to sign in">Sign in</Button>,
    );
    const first = screen.getByRole('button');
    rerender(<Button disabledReason={null}>Sign in</Button>);
    const second = screen.getByRole('button');
    expect(second).toBe(first);
    second.focus();
    rerender(<Button disabledReason="Enter a username to sign in">Sign in</Button>);
    expect(screen.getByRole('button')).toBe(first);
  });

  it('blocks a second click while loading', () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Save
      </Button>,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
    expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true');
  });
});

describe('InstagramSummary', () => {
  it('leaves out the numbers block when Instagram gave none', () => {
    const me = makeMe({ role: 'BRAND' });
    const profile = {
      ...me.profile!,
      followersCount: null,
      mediaCount: null,
      engagementRate: null,
    };
    render(<InstagramSummary profile={profile} />);
    expect(screen.queryByText('Followers')).not.toBeInTheDocument();
    expect(screen.getByText('Business account')).toBeInTheDocument();
  });
});
