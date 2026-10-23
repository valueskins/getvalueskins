'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  computeBreakdown,
  DEAL_DESCRIPTION_TEMPLATE,
  formatInr,
  GST_RATE_BPS,
  MAX_TITLE_LENGTH,
  MIN_BUDGET_PAISE,
  todayIST,
  POSTING_NOT_OPEN,
  validateDealForPublish,
  type DealDetail,
} from '@valueskins/shared';
import { ApiError } from '@/lib/api/client';
import { errorText, fieldErrors } from '@/lib/api/errors';
import {
  useCreateDraft,
  useDeleteDraft,
  usePublish,
  useUpdateDraft,
  type DraftInput,
} from '@/lib/api/deals';
import { useConfig, useMe } from '@/lib/api/queries';
import {
  AUTOSAVE_MS,
  clearDraft,
  groupRupees,
  readDraft,
  sameFields,
  writeDraft,
  type DraftFields,
  type StoredDraft,
} from '@/lib/draftStore';
import { formatTime } from '@/lib/format';
import { longDate, shortDate } from '@/lib/deadlines';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Badge, Callout, ErrorSummary } from '@/components/ui/Callout';
import { describedBy, Field, Input, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { DateField } from './DateField';

const EMPTY: DraftFields = {
  title: '',
  description: '',
  budget: '',
  applicationDeadline: null,
  contentUploadDeadline: null,
  dealDeadline: null,
};

const DATE_FIELDS = [
  {
    key: 'applicationDeadline',
    label: 'Apply by',
    help: 'Creators can apply until 11:59 pm IST on this day. You can still confirm someone after it.',
  },
  {
    key: 'contentUploadDeadline',
    label: 'Content due',
    help: 'The creator shares the content link by this day. It must be after the apply-by date.',
  },
  {
    key: 'dealDeadline',
    label: 'Deal ends',
    help: 'Both UPI payments should be done by this day. It can be the same day as Content due.',
  },
] as const;

const FIELD_IDS: Record<string, string> = {
  title: 'f-title',
  description: 'f-desc',
  budgetRupees: 'f-budget',
  applicationDeadline: 'f-applicationDeadline',
  contentUploadDeadline: 'f-contentUploadDeadline',
  dealDeadline: 'f-dealDeadline',
};

export function fieldsFromDeal(deal: DealDetail): DraftFields {
  return {
    title: deal.title ?? '',
    description: deal.description ?? '',
    budget: deal.budgetPaise !== null ? String(Math.floor(deal.budgetPaise / 100)) : '',
    applicationDeadline: deal.applicationDeadline,
    contentUploadDeadline: deal.contentUploadDeadline,
    dealDeadline: deal.dealDeadline,
  };
}

function toInput(f: DraftFields): DraftInput {
  return {
    title: f.title.trim() || null,
    description: f.description.trim() ? f.description : null,
    budgetRupees: f.budget ? Number(f.budget) : null,
    applicationDeadline: f.applicationDeadline,
    contentUploadDeadline: f.contentUploadDeadline,
    dealDeadline: f.dealDeadline,
  };
}

function budgetPaise(digits: string): number | null {
  if (!digits) return null;
  const n = Number(digits);
  return Number.isSafeInteger(n * 100) ? n * 100 : null;
}

function Breakdown({ paise, gst, min }: { paise: number | null; gst: number; min: number }) {
  const ok = paise !== null && paise >= min;
  // The fee is the same at every budget, so it shows even before the minimum.
  const fee = computeBreakdown(ok ? paise : min, gst);
  const feeRow = (
    <div className="bd-row">
      <p className="t-small font-medium">ValueSkins fee</p>
      <p className="money money-s">{formatInr(fee.commissionTotalPaise)}</p>
      <p className="t-small c-ink-2">
        {formatInr(fee.commissionBasePaise)} + GST {formatInr(fee.commissionGstPaise)}
        {ok ? ', paid by you through Razorpay after you confirm a creator' : ''}
      </p>
    </div>
  );
  if (!ok) {
    return (
      <div className="breakdown" aria-live="polite">
        {feeRow}
        <p className="bd-note">
          Enter {formatInr(min)} or more to see what the creator gets and when.
        </p>
      </div>
    );
  }
  const b = computeBreakdown(paise, gst);
  return (
    <div className="breakdown" aria-live="polite" aria-label="Payment breakdown">
      {feeRow}
      <div className="bd-row">
        <p className="t-small font-medium">To the creator by UPI, before work starts</p>
        <p className="money money-s">{formatInr(b.advancePaise)}</p>
        <p className="t-small c-ink-2">
          30% of the creator&apos;s {formatInr(b.creatorAmountPaise)}
        </p>
      </div>
      <div className="bd-row">
        <p className="t-small font-medium">To the creator by UPI, after you approve</p>
        <p className="money money-s">{formatInr(b.finalPaise)}</p>
        <p className="t-small c-ink-2">The other 70%</p>
      </div>
      <div className="bd-row bd-total">
        <p className="t-body font-semibold">Total</p>
        <p className="money money-m font-semibold">{formatInr(b.budgetPaise)}</p>
        <p className="t-small c-ink-2">Your budget. Nothing is added on top.</p>
      </div>
      <p className="bd-note">
        Creators see: You receive{' '}
        <span className="money text-ink">{formatInr(b.creatorAmountPaise)}</span>
      </p>
    </div>
  );
}

function Preview({
  f,
  paise,
  gst,
  min,
  brand,
}: {
  f: DraftFields;
  paise: number | null;
  gst: number;
  min: number;
  brand: string;
}) {
  const ok = paise !== null && paise >= min;
  const b = ok ? computeBreakdown(paise, gst) : null;
  return (
    <aside className="flex flex-col gap-4" aria-label="How creators see it">
      <p className="t-label c-ink-2">How creators see it in their feed</p>
      <div className="card flex flex-col gap-3.5 px-5 py-5" aria-hidden="true">
        <div className="flex items-center justify-between">
          <span className="chip">
            <Avatar name={brand} size={32} />
            <span className="chip-name">@{brand}</span>
          </span>
          <Badge kind="new">New</Badge>
        </div>
        <p className="t-h3">{f.title.trim() || 'Your title'}</p>
        <p className="t-small c-ink-2 line-clamp-2">
          {f.description.trim() || 'The first lines of your description.'}
        </p>
        <div className="hr" />
        {b ? (
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between">
              <p className="t-small c-ink-2">Budget</p>
              <p className="money money-s">{formatInr(b.budgetPaise)}</p>
            </div>
            <div className="flex justify-between">
              <p className="t-small font-medium">You receive</p>
              <p className="money money-m">{formatInr(b.creatorAmountPaise)}</p>
            </div>
            <p className="money money-s c-ink-3 text-right">
              ({formatInr(b.advancePaise)} + {formatInr(b.finalPaise)})
            </p>
          </div>
        ) : (
          <p className="t-small c-ink-2">
            The amounts show once the budget is {formatInr(min)} or more.
          </p>
        )}
        <div className="t-small c-ink-2 flex flex-wrap gap-4">
          <span>Apply by {f.applicationDeadline ? shortDate(f.applicationDeadline) : '...'}</span>
          <span>
            Content due {f.contentUploadDeadline ? shortDate(f.contentUploadDeadline) : '...'}
          </span>
        </div>
      </div>
      <div className="card card-pad">
        <p className="t-small mb-3 font-semibold">After you publish</p>
        <ol className="nsteps">
          <li>
            Creators apply until the apply-by date. You see each one&apos;s followers, engagement
            and past deals.
          </li>
          <li>You confirm one creator. The others are told they were not selected.</li>
          <li>You pay the ValueSkins fee through Razorpay. Until then you can cancel for free.</li>
          <li>You pay the creator 30% by UPI, and they make the content.</li>
          <li>You approve it and pay the other 70% by UPI.</li>
        </ol>
      </div>
    </aside>
  );
}

/** `/campaigns/new` and `/campaigns/[id]/edit` (BrPost, BrPostErrors, BrPublish). */
export function DealForm({ draft }: { draft: DealDetail | null }) {
  const router = useRouter();
  const toast = useToast();
  const me = useMe();
  const config = useConfig();
  // SPEC 19: drafts work while posting is closed; only Publish is off, and it says why.
  const postingReason = config.data?.postingOpen === false ? POSTING_NOT_OPEN : undefined;
  const gst = config.data?.gstRateBps ?? GST_RATE_BPS;
  // The API decides the minimum; the shared constant is only the fallback while /api/config loads.
  const min = config.data?.minBudgetPaise ?? MIN_BUDGET_PAISE;
  const draftId = draft?.id ?? null;
  const serverFields = useMemo(() => (draft ? fieldsFromDeal(draft) : EMPTY), [draft]);

  const [f, setF] = useState<DraftFields>(serverFields);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<React.ReactNode>(null);
  const [savedLocal, setSavedLocal] = useState<string | null>(null);
  const [savedServer, setSavedServer] = useState<string | null>(null);
  const [restore, setRestore] = useState<StoredDraft | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const latest = useRef(f);
  latest.current = f;
  const lastStored = useRef<DraftFields | null>(null);

  const create = useCreateDraft();
  const update = useUpdateDraft();
  const publish = usePublish();
  const remove = useDeleteDraft();

  // Offer what this device kept, when it differs from what the server has.
  useEffect(() => {
    const stored = readDraft(draftId);
    if (stored && !sameFields(stored.fields, serverFields)) setRestore(stored);
  }, [draftId, serverFields]);

  const saveLocal = useCallback(() => {
    const current = latest.current;
    if (
      sameFields(current, serverFields) ||
      (lastStored.current && sameFields(current, lastStored.current))
    )
      return;
    const stored = writeDraft(draftId, current, new Date());
    if (stored) {
      lastStored.current = current;
      setSavedLocal(stored.savedAt);
    }
  }, [draftId, serverFields]);

  useEffect(() => {
    const id = window.setInterval(saveLocal, AUTOSAVE_MS);
    return () => window.clearInterval(id);
  }, [saveLocal]);

  const set = <K extends keyof DraftFields>(key: K, value: DraftFields[K]) => {
    setF((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      const path = key === 'budget' ? 'budgetRupees' : key;
      if (!(path in prev)) return prev;
      const next = { ...prev };
      delete next[path];
      return next;
    });
  };

  const paise = budgetPaise(f.budget);
  const today = todayIST(new Date());
  const issues = () =>
    validateDealForPublish(
      {
        title: f.title || null,
        description: f.description.trim() ? f.description : null,
        budgetPaise: paise,
        applicationDeadline: f.applicationDeadline,
        contentUploadDeadline: f.contentUploadDeadline,
        dealDeadline: f.dealDeadline,
      },
      new Date(),
      min,
    );

  /** Saves to the server and returns the draft id. */
  async function saveServer(): Promise<string | null> {
    setFormError(null);
    try {
      const deal = draftId
        ? (await update.mutateAsync({ id: draftId, input: toInput(f) })).deal
        : (await create.mutateAsync(toInput(f))).deal;
      clearDraft(draftId);
      clearDraft(deal.id);
      setSavedServer(new Date().toISOString());
      return deal.id;
    } catch (err) {
      if (err instanceof ApiError && err.code === 'VALIDATION_ERROR')
        setErrors(fieldErrors(err.details));
      setFormError(errorText(err));
      return null;
    }
  }

  async function onSaveDraft() {
    const id = await saveServer();
    if (id && !draftId) router.replace(`/campaigns/${id}/edit`);
    else if (id) toast.show({ tone: 'ok', title: 'Draft saved' });
  }

  function onPublishClick(event: FormEvent) {
    event.preventDefault();
    const found = issues();
    if (found.length) {
      setErrors(fieldErrors(found));
      requestAnimationFrame(() =>
        document.querySelector<HTMLElement>('.err-summary, [aria-invalid="true"]')?.focus(),
      );
      return;
    }
    setErrors({});
    setPublishOpen(true);
  }

  async function confirmPublish() {
    const id = await saveServer();
    if (!id) {
      setPublishOpen(false);
      return;
    }
    try {
      const { deal } = await publish.mutateAsync(id);
      clearDraft(null);
      clearDraft(id);
      toast.show({
        tone: 'ok',
        title: 'Deal published',
        text: 'Every creator on ValueSkins sees it in their feed now.',
      });
      router.replace(`/deals/${deal.id}`);
    } catch (err) {
      setPublishOpen(false);
      if (err instanceof ApiError && err.code === 'VALIDATION_ERROR') {
        setErrors(fieldErrors(err.details));
        setFormError(null);
      } else if (err instanceof ApiError && err.code === 'BILLING_REQUIRED') {
        setFormError(
          <>
            {err.message}. <Link href="/settings#billing">Add billing details</Link>
          </>,
        );
      } else {
        setFormError(errorText(err));
      }
      if (!draftId) router.replace(`/campaigns/${id}/edit`);
    }
  }

  async function confirmDelete() {
    if (!draftId) return;
    try {
      await remove.mutateAsync(draftId);
      clearDraft(draftId);
      toast.show({ tone: 'info', title: 'Draft deleted' });
      router.replace('/campaigns');
    } catch (err) {
      setDeleteOpen(false);
      setFormError(errorText(err));
    }
  }

  const summary = Object.entries(errors).map(([path, message]) => ({
    id: FIELD_IDS[path] ?? path,
    message,
  }));
  const saving = create.isPending || update.isPending;
  const status = savedServer
    ? `Draft saved to your account at ${formatTime(savedServer)}`
    : savedLocal
      ? `Saved on this device at ${formatTime(savedLocal)}`
      : null;
  const breakdown = paise !== null && paise >= min ? computeBreakdown(paise, gst) : null;

  return (
    <div className="page">
      <nav aria-label="Breadcrumb" className="mb-3">
        <Link href="/campaigns" className="t-small inline-flex min-h-8 items-center">
          Campaigns
        </Link>
      </nav>
      <div className="page-head">
        <div className="flex flex-col gap-1.5">
          <h1 className="t-h1">{draft ? 'Edit draft' : 'Post a deal'}</h1>
          <p className="t-body c-ink-2">
            One brief, one fixed amount, three dates. You see the full breakdown before you publish.
          </p>
        </div>
        {status ? (
          <p className="t-small c-ink-2" role="status">
            {status}
          </p>
        ) : null}
      </div>

      {restore ? (
        <Callout
          tone="info"
          title={`You have changes saved on this device at ${formatTime(restore.savedAt)}`}
          className="mb-6"
        >
          <div className="mt-2 flex flex-wrap gap-3">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setF(restore.fields);
                setRestore(null);
              }}
            >
              Restore them
            </Button>
            <Button
              size="sm"
              variant="text"
              onClick={() => {
                clearDraft(draftId);
                setRestore(null);
              }}
            >
              Discard
            </Button>
          </div>
        </Callout>
      ) : null}

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
        <form
          className="flex min-w-0 flex-col gap-6"
          noValidate
          aria-label="Deal details"
          onSubmit={onPublishClick}
          onBlur={saveLocal}
        >
          {summary.length > 1 ? <ErrorSummary errors={summary} /> : null}
          {formError ? (
            <Callout tone="error" role="alert">
              <p>{formError}</p>
            </Callout>
          ) : null}

          <section className="card" aria-labelledby="s-brief">
            <div className="flex items-baseline justify-between gap-3 px-6 py-4">
              <h2 id="s-brief" className="t-h3">
                The brief
              </h2>
              <p className="t-small c-ink-3">Cannot be edited after you publish</p>
            </div>
            <div className="hr" />
            <div className="flex flex-col gap-5 px-4 pb-6 pt-5 md:px-6">
              <Field
                id="f-title"
                label="Title"
                help="What the creator makes, in a few words. It is the first thing they read in the feed."
                error={errors.title}
                aside={
                  <span className="counter">
                    {f.title.length} / {MAX_TITLE_LENGTH}
                  </span>
                }
              >
                <Input
                  id="f-title"
                  maxLength={MAX_TITLE_LENGTH}
                  value={f.title}
                  invalid={Boolean(errors.title)}
                  placeholder="For example: Festive kurta try-on reel"
                  aria-describedby={describedBy('f-title', true, errors.title)}
                  onChange={(e) => set('title', e.target.value)}
                />
              </Field>
              <Field
                id="f-desc"
                label="Description"
                help="Write everything the creator needs. Scripts and storyboards go here as text. There is no length limit."
                error={errors.description}
                aside={
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      set(
                        'description',
                        f.description.trim()
                          ? `${f.description}\n\n${DEAL_DESCRIPTION_TEMPLATE}`
                          : DEAL_DESCRIPTION_TEMPLATE,
                      )
                    }
                  >
                    Insert template
                  </Button>
                }
              >
                <Textarea
                  id="f-desc"
                  className="min-h-[420px] text-[15px]"
                  value={f.description}
                  invalid={Boolean(errors.description)}
                  placeholder={DEAL_DESCRIPTION_TEMPLATE}
                  aria-describedby={describedBy('f-desc', true, errors.description)}
                  onChange={(e) => set('description', e.target.value)}
                />
              </Field>
            </div>
          </section>

          <section className="card" aria-labelledby="s-budget">
            <div className="flex items-baseline justify-between gap-3 px-6 py-4">
              <h2 id="s-budget" className="t-h3">
                Budget
              </h2>
              <p className="t-small c-ink-3">Everything you pay, in one number</p>
            </div>
            <div className="hr" />
            <div className="flex flex-col gap-5 px-4 pb-6 pt-5 md:px-6">
              <Field
                id="f-budget"
                label="Budget in rupees"
                help={`Whole rupees. The minimum is ${formatInr(min)}.`}
                error={errors.budgetRupees}
                className="max-w-[320px]"
              >
                <span className="input-wrap">
                  <span className="input-pre" aria-hidden="true">
                    ₹
                  </span>
                  <Input
                    id="f-budget"
                    className="has-pre"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="10,000"
                    value={groupRupees(f.budget)}
                    invalid={Boolean(errors.budgetRupees)}
                    aria-describedby={describedBy('f-budget', true, errors.budgetRupees)}
                    onChange={(e) =>
                      set(
                        'budget',
                        e.target.value.replace(/\D/g, '').replace(/^0+/, '').slice(0, 11),
                      )
                    }
                  />
                </span>
              </Field>
              <Breakdown paise={paise} gst={gst} min={min} />
            </div>
          </section>

          <section className="card" aria-labelledby="s-dates">
            <div className="flex items-baseline justify-between gap-3 px-6 py-4">
              <h2 id="s-dates" className="t-h3">
                Dates
              </h2>
              <p className="t-small c-ink-3">Each date ends at 11:59 pm IST</p>
            </div>
            <div className="hr" />
            <div className="grid items-start gap-5 px-4 pb-6 pt-5 md:grid-cols-3 md:px-6">
              {DATE_FIELDS.map((d) => (
                <DateField
                  key={d.key}
                  id={`f-${d.key}`}
                  label={d.label}
                  value={f[d.key]}
                  today={today}
                  marks={DATE_FIELDS.filter((o) => o.key !== d.key).map((o) => f[o.key])}
                  help={d.help}
                  error={errors[d.key]}
                  onChange={(v) => set(d.key, v)}
                />
              ))}
            </div>
          </section>

          <div className="form-bar -mx-4 md:-mx-8">
            <div className="form-bar-in flex-wrap px-4 md:px-8">
              <p className="t-small c-ink-2">
                {status ?? 'Your changes are kept on this device as you type.'}
              </p>
              <div className="flex flex-wrap gap-3">
                {draftId ? (
                  <Button variant="text" onClick={() => setDeleteOpen(true)}>
                    Delete draft
                  </Button>
                ) : null}
                <Button
                  variant="secondary"
                  loading={saving && !publishOpen}
                  onClick={() => void onSaveDraft()}
                >
                  Save draft
                </Button>
                <Button type="submit" disabledReason={postingReason}>
                  Publish
                </Button>
              </div>
            </div>
          </div>
        </form>
        <Preview f={f} paise={paise} gst={gst} min={min} brand={me.data?.user.username ?? 'you'} />
      </div>

      <Modal
        open={publishOpen}
        title={`Publish ${f.title.trim() || 'this deal'}?`}
        onClose={() => setPublishOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPublishOpen(false)}>
              Keep editing
            </Button>
            <Button
              onClick={() => void confirmPublish()}
              loading={saving || publish.isPending}
              disabledReason={postingReason}
            >
              Publish
            </Button>
          </>
        }
      >
        <p>
          You cannot edit a deal once it is published. Check the brief, the budget and the dates
          now.
        </p>
        <p className="mt-3">
          You can cancel it for free until you pay the ValueSkins fee. Once the fee is paid, it
          cannot be cancelled.
        </p>
        {breakdown ? (
          <div className="breakdown mt-4">
            <div className="bd-row">
              <p className="t-small">Budget</p>
              <p className="money money-s">{formatInr(breakdown.budgetPaise)}</p>
            </div>
            <div className="bd-row">
              <p className="t-small">ValueSkins fee, after you confirm a creator</p>
              <p className="money money-s">{formatInr(breakdown.commissionTotalPaise)}</p>
            </div>
            <div className="bd-row">
              <p className="t-small">To the creator by UPI</p>
              <p className="money money-s">{formatInr(breakdown.creatorAmountPaise)}</p>
            </div>
            {DATE_FIELDS.map((d) =>
              f[d.key] ? (
                <div key={d.key} className="bd-row">
                  <p className="t-small">{d.label}</p>
                  <p className="t-small">{longDate(f[d.key]!)}, 11:59 pm IST</p>
                </div>
              ) : null,
            )}
          </div>
        ) : null}
        <p className="mt-3">Every creator on ValueSkins sees it in their feed straight away.</p>
      </Modal>

      <Modal
        open={deleteOpen}
        title="Delete this draft?"
        onClose={() => setDeleteOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteOpen(false)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              onClick={() => void confirmDelete()}
              loading={remove.isPending}
            >
              Delete draft
            </Button>
          </>
        }
      >
        <p>The draft is removed. Nobody else has seen it. This cannot be undone.</p>
      </Modal>
    </div>
  );
}
