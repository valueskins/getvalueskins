'use client';

import { useState, type ReactNode } from 'react';
import { DEAL_STATUSES, STEP_LABELS, type DealStep } from '@valueskins/shared';
import { DateField } from '@/components/brand/DateField';
import { DealSteps } from '@/components/deal/DealSteps';
import { StatusBadge } from '@/components/deal/StatusBadge';
import { EmptyState } from '@/components/lists/EmptyState';
import { ShowMore } from '@/components/lists/ShowMore';
import { Tabs } from '@/components/lists/Tabs';
import { TabBar } from '@/components/shell/AppShell';
import { SiteFooter } from '@/components/shell/SiteChrome';
import { Wordmark } from '@/components/shell/Wordmark';
import { Avatar, UserChip } from '@/components/ui/Avatar';
import { Button, LinkButton } from '@/components/ui/Button';
import { Badge, Callout, ErrorSummary, type BadgeKind } from '@/components/ui/Callout';
import { Checkbox, Field, Input, MoneyInput, Select, Textarea } from '@/components/ui/Field';
import { Icon, ICON_NAMES } from '@/components/ui/Icon';
import { LoadError } from '@/components/ui/LoadError';
import { Modal } from '@/components/ui/Modal';
import { Money } from '@/components/ui/Money';
import { CardSkeleton, Skeleton } from '@/components/ui/Skeleton';
import { Stepper } from '@/components/ui/Stepper';
import { useToast } from '@/components/ui/Toast';
import { cx } from '@/components/ui/cx';
import { ApiError } from '@/lib/api/client';

const SWATCHES: Array<[string, string[]]> = [
  ['Grounds', ['bg', 'surface', 'sunken', 'track', 'sand']],
  ['Ink and lines', ['ink', 'ink-muted', 'ink-subtle', 'border', 'border-strong', 'border-field']],
  ['Accent', ['accent', 'accent-hover', 'accent-press', 'accent-ink', 'accent-soft']],
  [
    'Status',
    [
      'success',
      'success-soft',
      'warning',
      'warning-soft',
      'danger',
      'danger-soft',
      'info',
      'info-soft',
    ],
  ],
  ['Contrast sections', ['dark', 'dark-raised', 'on-dark', 'on-dark-muted', 'accent-on-dark']],
];

const VARIANTS = ['primary', 'secondary', 'text', 'ghost', 'danger', 'danger-outline'] as const;
const STATES: Array<[string, string | undefined]> = [
  ['Default', undefined],
  ['Hover', 'is-hover'],
  ['Focus', 'is-focus'],
  ['Pressed', 'is-press'],
];
const BADGES: BadgeKind[] = [
  'draft',
  'open',
  'progress',
  'wait',
  'ok',
  'done',
  'cancelled',
  'new',
  'error',
];

function steps(done: number, cancelled = false): DealStep[] {
  return STEP_LABELS.map((label, i) => ({
    label,
    state:
      i < done
        ? 'done'
        : i === done
          ? cancelled
            ? 'stopped'
            : 'current'
          : cancelled
            ? 'void'
            : 'todo',
    at: i < done ? `2026-10-${String(10 + i).padStart(2, '0')}T10:30:00.000Z` : null,
  }));
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className="sheet-sec" aria-labelledby={`sec-${id}`}>
      <h2 id={`sec-${id}`} className="t-h2">
        {title}
      </h2>
      <div className="sheet-sec-body">{children}</div>
    </section>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <p className="t-label c-ink-3">{children}</p>;
}

/** /dev/components: every shared component in every state, on the app's tokens. */
export function ComponentSheet() {
  const toast = useToast();
  const [modal, setModal] = useState(false);
  const [tab, setTab] = useState<'active' | 'done'>('active');
  const [date, setDate] = useState<string | null>('2026-11-14');
  const [agree, setAgree] = useState(true);

  return (
    <div className="component-sheet">
      <header className="topbar">
        <div className="topbar-in">
          <Wordmark />
          <span className="badge badge-wait">Not in production</span>
        </div>
      </header>
      <main id="main" className="page flex flex-col gap-12">
        <div className="flex flex-col gap-2">
          <h1 className="t-display">
            The ValueSkins <span className="t-accent">system</span>
          </h1>
          <p className="t-body c-ink-2 max-w-[60ch]">
            Every shared component in every state, drawn from the tokens in app/styles/tokens.css.
            Hover, focus and pressed are shown with their static classes.
          </p>
        </div>

        <Section id="colour" title="Colour">
          {SWATCHES.map(([group, names]) => (
            <div key={group} className="flex flex-col gap-3">
              <Label>{group}</Label>
              <div className="sheet-swatches">
                {names.map((n) => (
                  <div key={n} className="sheet-swatch">
                    <span style={{ background: `var(--${n})` }} />
                    <code className="t-mono t-small">--{n}</code>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </Section>

        <Section id="type" title="Type">
          <div className="flex flex-col gap-4">
            <p className="t-display">Display 40, the deal is set</p>
            <p className="t-h1">Heading 1, Campaigns</p>
            <p className="t-h2">Heading 2, Next step</p>
            <p className="t-h3">Heading 3, Payments</p>
            <p className="t-body">Body 16. Plain, direct sentences in short lines.</p>
            <p className="t-small c-ink-2">Small 14, muted. Helper and secondary text.</p>
            <p className="t-label c-ink-3">Label 12, subtle</p>
            <p className="t-mono">Mono for ids: VS-7F3K2Q, example@okaxis</p>
            <p className="t-h2">
              One <span className="t-accent">accent</span> word, used sparingly
            </p>
            <div className="flex flex-wrap items-baseline gap-6">
              <Money paise={1_000_000} size="l" />
              <Money paise={273_450} size="m" />
              <Money paise={88_500} size="s" />
            </div>
          </div>
        </Section>

        <Section id="buttons" title="Buttons">
          <div className="sheet-grid">
            {VARIANTS.map((v) => (
              <div key={v} className="flex flex-col gap-3">
                <Label>{v}</Label>
                {STATES.map(([name, cls]) => (
                  <Button key={name} variant={v} className={cls}>
                    {name}
                  </Button>
                ))}
                <Button variant={v} loading>
                  Loading
                </Button>
                <Button variant={v} disabledReason="Add your UPI ID first">
                  Disabled
                </Button>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm">Small</Button>
            <Button size="sm" variant="secondary">
              Small secondary
            </Button>
            <Button iconOnly variant="secondary" aria-label="Copy">
              <Icon name="copy" />
            </Button>
            <Button>
              <Icon name="plus" />
              Post a deal
            </Button>
            <LinkButton href="/dev/components" variant="secondary">
              A link as a button
              <Icon name="arrowRight" />
            </LinkButton>
          </div>
          <div className="max-w-[360px]">
            <Button block>Block width</Button>
          </div>
        </Section>

        <Section id="fields" title="Fields">
          <div className="sheet-grid">
            <Field
              id="s-text"
              label="Deal title"
              help="What the creator will make, in a few words."
            >
              <Input id="s-text" placeholder="Festive kurta try-on reel" />
            </Field>
            <Field id="s-hover" label="Hover">
              <Input id="s-hover" className="is-hover" defaultValue="example.brand" />
            </Field>
            <Field id="s-focus" label="Focus">
              <Input id="s-focus" className="is-focus" defaultValue="example.brand" />
            </Field>
            <Field id="s-error" label="Email" error="Enter an email address like name@example.com.">
              <Input id="s-error" invalid defaultValue="name@" />
            </Field>
            <Field id="s-disabled" label="Instagram username" optional>
              <Input id="s-disabled" disabled defaultValue="example.creator" />
            </Field>
            <Field
              id="s-money"
              label="Budget in rupees"
              help="Whole rupees. The minimum is ₹886.00."
            >
              <MoneyInput id="s-money" inputMode="numeric" defaultValue="10,000" />
            </Field>
            <Field id="s-money-err" label="Budget in rupees" error="The minimum is ₹886.00.">
              <MoneyInput id="s-money-err" inputMode="numeric" invalid defaultValue="500" />
            </Field>
            <Field id="s-select" label="City">
              <Select id="s-select" defaultValue="Pune">
                <option>Bengaluru</option>
                <option>Mumbai</option>
                <option>Pune</option>
              </Select>
            </Field>
            <DateField
              id="s-date"
              label="Applications close"
              value={date}
              onChange={setDate}
              today="2026-10-26"
              marks={['2026-11-20']}
              help="The last day creators can apply."
            />
            <Field
              id="s-textarea"
              label="What to make"
              aside={<span className="counter">84 / 2000</span>}
              help="Plain text. Say what to film and what to avoid."
            >
              <Textarea
                id="s-textarea"
                defaultValue="One reel, 30 to 45 seconds, trying on two kurtas in daylight."
              />
            </Field>
          </div>
          <div className="flex flex-col gap-1">
            <Checkbox
              label="I agree to the terms"
              checked={agree}
              onChange={(e) => setAgree(e.target.checked)}
            />
            <Checkbox label="Unchecked" />
            <Checkbox label="With an error" invalid />
            <Checkbox label="Disabled" disabled defaultChecked />
          </div>
          <ErrorSummary
            errors={[
              { id: 's-error', message: 'Enter an email address like name@example.com.' },
              { id: 's-money-err', message: 'The minimum is ₹886.00.' },
            ]}
          />
        </Section>

        <Section id="callouts" title="Callouts and banner">
          <div className="sheet-grid">
            <Callout tone="info" title="How payment works">
              <p>You pay the creator straight to their UPI ID.</p>
            </Callout>
            <Callout tone="wait" title="Waiting for the creator">
              <p>They have until 14 Nov 2026 to share the content.</p>
            </Callout>
            <Callout tone="ok" title="Payment confirmed">
              <p>The creator confirmed the advance arrived.</p>
            </Callout>
            <Callout tone="error" title="We could not save that">
              <p>Check your connection and try again.</p>
            </Callout>
          </div>
          <div className="banner" role="status">
            <div className="flex items-start gap-3">
              <Icon name="info" />
              <p className="t-body">
                Posting new deals opens soon. You can set up your profile now.
              </p>
            </div>
          </div>
        </Section>

        <Section id="badges" title="Badges and deal status">
          <div className="flex flex-wrap gap-2">
            {BADGES.map((b) => (
              <Badge key={b} kind={b}>
                {b}
              </Badge>
            ))}
            <Badge kind="ok">
              <Icon name="check" size={16} />
              With an icon
            </Badge>
          </div>
          <div className="flex flex-col gap-3">
            <Label>All ten deal statuses</Label>
            <div className="flex flex-wrap gap-2">
              {DEAL_STATUSES.map((s) => (
                <StatusBadge key={s} status={s} />
              ))}
            </div>
            <div className="flex items-center gap-3">
              <Label>Just changed</Label>
              <Badge kind="progress" className="is-changed">
                Fee paid
              </Badge>
            </div>
          </div>
        </Section>

        <Section id="people" title="People">
          <div className="flex flex-wrap items-center gap-4">
            {(
              [
                'example.brand',
                'example.creator',
                'example.reels',
                'example.styles',
                'example.foods',
              ] as const
            ).map((n, i) => (
              <Avatar key={n} name={n} size={([24, 32, 40, 56, 64] as const)[i]} />
            ))}
          </div>
          <div className="flex flex-wrap gap-8">
            <UserChip username="example.creator" sub="Creator, Pune" size={40} />
            <UserChip username="example.brand" sub="Brand, Bengaluru" size={32} />
            <UserChip username="example.reels" />
          </div>
          <div className="flex flex-col gap-2">
            <Label>UPI IDs</Label>
            <p className="upi-full">example.creator@okaxis</p>
            <p className="upi-masked">ex•••••@okaxis</p>
          </div>
        </Section>

        <Section id="lists" title="Tabs, filters and lists">
          <div>
            <Tabs
              label="My deals"
              value={tab}
              onChange={setTab}
              items={[
                { id: 'active', label: 'Active', count: 4 },
                { id: 'done', label: 'Finished', count: 12 },
              ]}
            />
            <div className="fchips">
              <button type="button" className="fchip is-active">
                All <span className="count">9</span>
              </button>
              <button type="button" className="fchip">
                Open <span className="count">3</span>
              </button>
              <button type="button" className="fchip">
                In progress <span className="count">5</span>
              </button>
              <button type="button" className="fchip">
                Drafts <span className="count">1</span>
              </button>
            </div>
          </div>
          <div className="card">
            <ul className="list">
              {[
                'Festive kurta try-on reel',
                'Street food city guide',
                'Monsoon skincare routine',
              ].map((t, i) => (
                <li key={t} className="list-row" style={{ gridTemplateColumns: '1fr auto auto' }}>
                  <span className="t-body font-semibold">{t}</span>
                  <Money paise={[1_000_000, 800_000, 650_000][i]!} size="m" />
                  <StatusBadge status={(['OPEN', 'ADVANCE_PAID', 'COMPLETED'] as const)[i]!} />
                </li>
              ))}
            </ul>
          </div>
          <ShowMore hasMore loading={false} onMore={() => undefined} label="Show more deals" />
          <ShowMore hasMore loading onMore={() => undefined} label="Show more deals" />
        </Section>

        <Section id="empty" title="Empty, error and loading">
          <EmptyState
            title="No deals yet"
            text="When a brand posts a deal that fits you, it shows here."
          >
            <Button variant="secondary">Edit your profile</Button>
          </EmptyState>
          <LoadError
            title="We could not load your deals"
            error={new ApiError({ status: 0, code: 'NETWORK', message: 'offline' })}
            onRetry={() => undefined}
          />
          <div className="flex flex-col gap-3">
            <Skeleton className="h-9 w-56" />
            <CardSkeleton />
            <CardSkeleton />
          </div>
        </Section>

        <Section id="progress" title="Steps and progress">
          <div className="max-w-[420px]">
            <Stepper
              label="Set up"
              items={[
                { label: 'Instagram', state: 'done' },
                { label: 'Email', state: 'done' },
                { label: 'Profile', state: 'current' },
                { label: 'UPI ID', state: 'todo', tag: 'To get paid' },
              ]}
            />
          </div>
          <div className="card card-pad flex flex-col gap-8">
            <div className="flex flex-col gap-3">
              <Label>In progress, step 5 of 9</Label>
              <div className="sheet-steps-wide">
                <DealSteps steps={steps(4)} />
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <Label>Cancelled after step 3</Label>
              <div className="sheet-steps-wide">
                <DealSteps steps={steps(2, true)} />
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <Label>Phones</Label>
              <div className="sheet-steps-compact max-w-[360px]">
                <DealSteps steps={steps(4)} />
              </div>
            </div>
          </div>
        </Section>

        <Section id="overlays" title="Modal and toasts">
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" onClick={() => setModal(true)}>
              Open the modal
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                toast.show({ tone: 'ok', title: 'Saved', text: 'Your UPI ID is saved.' })
              }
            >
              Success toast
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                toast.show({ tone: 'info', title: 'The deal moved to Fee paid', text: 'Just now' })
              }
            >
              Info toast
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                toast.show({ tone: 'error', title: 'We could not save that', text: 'Try again.' })
              }
            >
              Error toast
            </Button>
          </div>
          <div className="flex flex-col gap-2">
            {(
              [
                ['ok', 'checkCircle', 'text-success', 'Saved', 'Your UPI ID is saved.'],
                ['info', 'info', 'text-ink-muted', 'The deal moved to Fee paid', 'Just now'],
                ['error', 'warningCircle', 'text-danger', 'We could not save that', 'Try again.'],
              ] as const
            ).map(([tone, icon, cls, title, text]) => (
              <div key={tone} className="toast">
                <span className={cls}>
                  <Icon name={icon} />
                </span>
                <div className="toast-body">
                  <p className="toast-title">{title}</p>
                  <p className="toast-text">{text}</p>
                </div>
                <span className="btn btn-ghost btn-icon btn-sm" aria-hidden="true">
                  <Icon name="x" size={16} />
                </span>
              </div>
            ))}
          </div>
          <Modal
            open={modal}
            title="Cancel this deal?"
            onClose={() => setModal(false)}
            footer={
              <>
                <Button variant="secondary" onClick={() => setModal(false)}>
                  Keep the deal
                </Button>
                <Button variant="danger" onClick={() => setModal(false)}>
                  Cancel the deal
                </Button>
              </>
            }
          >
            <p>The creator is told by email. This cannot be undone.</p>
          </Modal>
        </Section>

        <Section id="frame" title="Frame pieces">
          <div className="sheet-frame">
            <div className="topbar sheet-static">
              <div className="topbar-in">
                <Wordmark />
                <nav className="nav" aria-label="Example navigation">
                  <span className="nav-link is-active">Campaigns</span>
                  <span className="nav-link">Settings</span>
                </nav>
                <div className="topbar-right">
                  <span className="btn btn-primary">
                    <Icon name="plus" />
                    Post a deal
                  </span>
                  <span className="usermenu-btn">
                    <Avatar name="example.brand" size={32} />
                    <span className="chip-name">@example.brand</span>
                    <Icon name="caretDown" size={16} />
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-6">
            <div className="sheet-phone">
              <Label>Creator tab bar</Label>
              <TabBar role="CREATOR" pathname="/deals" />
            </div>
            <div className="sheet-phone">
              <Label>Brand tab bar</Label>
              <TabBar role="BRAND" pathname="/campaigns" />
            </div>
          </div>
        </Section>

        <Section id="icons" title="Icons">
          <div className="sheet-icons">
            {ICON_NAMES.map((n) => (
              <div key={n} className={cx('sheet-icon')}>
                <Icon name={n} size={24} />
                <span className="t-label c-ink-2">{n}</span>
              </div>
            ))}
          </div>
        </Section>
      </main>
      <SiteFooter />
    </div>
  );
}
