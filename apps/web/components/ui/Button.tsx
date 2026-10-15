'use client';

import Link from 'next/link';
import { useId, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cx } from './cx';
import { Icon } from './Icon';

export type ButtonVariant =
  'primary' | 'secondary' | 'text' | 'ghost' | 'danger' | 'danger-outline';

interface Common {
  variant?: ButtonVariant;
  size?: 'md' | 'sm';
  block?: boolean;
  /** An icon-only button. Give it `aria-label`. */
  iconOnly?: boolean;
  className?: string;
  children?: ReactNode;
}

function classes({ variant = 'primary', size = 'md', block, iconOnly, className }: Common) {
  return cx(
    'btn',
    `btn-${variant}`,
    size === 'sm' && 'btn-sm',
    block && 'btn-block',
    iconOnly && 'btn-icon',
    className,
  );
}

interface ButtonProps extends Common, Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  /** Shows a spinner, keeps the width, and blocks a second click. */
  loading?: boolean;
  /**
   * Why the button cannot be used. When set, the button is disabled and the
   * reason is shown under it, word for word (DESIGN_HANDOFF: disabled controls).
   * Pass null (not undefined) for "can be used now": the button then keeps its
   * place in the DOM, and its focus, when a reason comes and goes.
   */
  disabledReason?: string | null;
}

export function Button({
  variant,
  size,
  block,
  iconOnly,
  className,
  loading = false,
  disabledReason,
  disabled,
  children,
  type = 'button',
  onClick,
  ...rest
}: ButtonProps) {
  const reasonId = useId();
  const isDisabled = Boolean(disabled || disabledReason);
  const button = (
    <button
      {...rest}
      type={type}
      className={classes({
        variant,
        size,
        block,
        iconOnly,
        className: cx(loading && 'is-loading', className),
      })}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      aria-describedby={disabledReason ? reasonId : rest['aria-describedby']}
      onClick={(event) => {
        if (loading) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
    >
      {loading ? <span className="spinner" aria-hidden="true" /> : null}
      {children}
    </button>
  );
  if (disabledReason === undefined) return button;
  return (
    <div className={block ? 'w-full' : undefined}>
      {button}
      {disabledReason ? (
        <p id={reasonId} className="reason">
          <Icon name="info" size={16} />
          {disabledReason}
        </p>
      ) : null}
    </div>
  );
}

interface LinkButtonProps extends Common {
  href: string;
  /** A plain <a> for links that leave the app, such as the API's Instagram sign-in. */
  external?: boolean;
  target?: string;
  rel?: string;
}

export function LinkButton({ href, external, target, rel, children, ...common }: LinkButtonProps) {
  if (external) {
    return (
      <a href={href} className={classes(common)} target={target} rel={rel}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={classes(common)}>
      {children}
    </Link>
  );
}
