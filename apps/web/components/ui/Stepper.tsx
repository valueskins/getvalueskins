import { cx } from './cx';
import { Icon } from './Icon';

export interface StepperItem {
  label: string;
  state: 'done' | 'current' | 'todo';
  /** A short tag at the right, for example "To apply". */
  tag?: string;
}

/** The onboarding steps, numbered, with a tick on finished ones. */
export function Stepper({ items, label }: { items: StepperItem[]; label: string }) {
  return (
    <ol className="stepper" aria-label={label}>
      {items.map((item, i) => (
        <li
          key={item.label}
          className={cx(
            item.state === 'done' && 'is-done',
            item.state === 'current' && 'is-current',
          )}
          aria-current={item.state === 'current' ? 'step' : undefined}
        >
          <span className="mark">{item.state === 'done' ? <Icon name="check" /> : i + 1}</span>
          {item.label}
          {item.state === 'done' ? <span className="sr-only">, done</span> : null}
          {item.tag ? <span className="opt">{item.tag}</span> : null}
        </li>
      ))}
    </ol>
  );
}
