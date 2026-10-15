import type { DealStep } from '@/lib/dealStatus';
import { currentStepNumber } from '@/lib/dealStatus';
import { formatShortDateTime } from '@/lib/dealFormat';
import { cx } from '@/components/ui/cx';
import { Icon } from '@/components/ui/Icon';

const STATE_CLASS: Record<DealStep['state'], string> = {
  done: 'is-done',
  current: 'is-current',
  todo: '',
  stopped: 'is-stopped',
  void: 'is-void',
};

/** The 9-step bar. On phones it collapses to "Step 4 of 9" and a segment bar. */
export function DealSteps({ steps }: { steps: DealStep[] }) {
  const n = currentStepNumber(steps);
  const current = steps[n - 1] ?? steps[steps.length - 1]!;
  const allDone = steps.every((s) => s.state === 'done');
  return (
    <>
      <ol className="steps hidden md:grid" aria-label="Deal progress">
        {steps.map((s) => (
          <li
            key={s.label}
            className={cx('step', STATE_CLASS[s.state])}
            aria-current={s.state === 'current' ? 'step' : undefined}
          >
            <div className="step-bar" />
            <p className="step-label">
              {s.state === 'done' ? <Icon name="check" size={16} /> : null}
              {s.label}
              {s.state === 'done' ? <span className="sr-only">, done</span> : null}
            </p>
            <p className="step-date">{s.at ? formatShortDateTime(s.at) : ''}</p>
          </li>
        ))}
      </ol>
      <div
        className="steps-compact md:hidden"
        role="group"
        aria-label={
          allDone ? 'Deal progress, completed' : `Deal progress, step ${n} of ${steps.length}`
        }
      >
        <p className="t-label c-ink-2">
          Step {n} of {steps.length}
        </p>
        <p className={cx('t-h3', current.state === 'current' && 'text-prog')}>{current.label}</p>
        <div className="seg" aria-hidden="true">
          {steps.map((s) => (
            <span
              key={s.label}
              className={
                s.state === 'done' ? 'done' : s.state === 'current' ? 'current' : undefined
              }
            />
          ))}
        </div>
      </div>
    </>
  );
}
