import { formatInr } from '@valueskins/shared';
import { cx } from './cx';

/**
 * ₹10,000.00 with the paise a shade lighter. `creator` marks the creator's money, and only it, with
 * the lime fill under ink text: the soft 30% `advance`, the 70% `final`, or the creator's `total`.
 */
export function Money({
  paise,
  size,
  creator,
  className,
}: {
  paise: number;
  size?: 's' | 'm' | 'l';
  creator?: 'advance' | 'final' | 'total';
  className?: string;
}) {
  const text = formatInr(paise);
  const dot = text.lastIndexOf('.');
  return (
    <span
      className={cx(
        'money',
        size && `money-${size}`,
        creator && 'money-creator',
        creator === 'advance' && 'money-creator-soft',
        className,
      )}
    >
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
