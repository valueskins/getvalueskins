import { formatInr } from '@valueskins/shared';
import { cx } from './cx';

/** ₹10,000.00 in mono, with the paise a shade lighter. */
export function Money({
  paise,
  size,
  className,
}: {
  paise: number;
  size?: 's' | 'm' | 'l';
  className?: string;
}) {
  const text = formatInr(paise);
  const dot = text.lastIndexOf('.');
  return (
    <span className={cx('money', size && `money-${size}`, className)}>
      {dot === -1 ? (
        text
      ) : (
        <>
          {text.slice(0, dot)}
          <span className="paise">{text.slice(dot)}</span>
        </>
      )}
    </span>
  );
}
