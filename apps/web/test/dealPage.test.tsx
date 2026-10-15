import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { apiError, json } from './helpers/api';
import { act, CREATOR, DEAL_ID, makeDeal, record } from './helpers/deals';
import { renderDeal } from './helpers/dealPage';

const applicant = (over: Record<string, unknown> = {}) => ({
  id: 'app-1',
  dealId: DEAL_ID,
  status: 'APPLIED',
  createdAt: '2026-10-01T05:00:00.000Z',
  creator: {
    ...CREATOR,
    name: 'Test Creator',
    followersCount: 48230,
    engagementRate: 3.84,
    instagramVerified: true,
  },
  confirm: { enabled: true, reason: null },
  ...over,
});

describe('deal page: open', () => {
  it('lets the brand confirm an applicant, and shows why another cannot be', async () => {
    const deal = makeDeal('OPEN', {
      applicationCount: 2,
      allowedActions: [act('CONFIRM_CREATOR'), act('CANCEL')],
    });
    const { api } = renderDeal(deal, 'brand', {
      [`GET /deals/${DEAL_ID}/applications`]: {
        items: [
          applicant(),
          applicant({
            id: 'app-2',
            creator: {
              ...CREATOR,
              id: 'c-2',
              username: 'other.creator',
              name: 'Other',
              followersCount: null,
              engagementRate: null,
              instagramVerified: true,
            },
            confirm: { enabled: false, reason: 'This creator has not added a UPI ID' },
          }),
        ],
        nextCursor: null,
      },
      'POST /applications/app-1/confirm': json(200, { deal: makeDeal('CONFIRMED') }),
    });
    expect(await screen.findByRole('heading', { name: 'Confirm one creator' })).toBeInTheDocument();
    expect(await screen.findByText('48,230')).toBeInTheDocument();
    expect(screen.getByText('This creator has not added a UPI ID')).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'Confirm' })[0]!);
    const dialog = screen.getByRole('dialog', { name: /Confirm @test.creator/ });
    expect(dialog).toHaveTextContent('₹885.00');
    expect(dialog).toHaveTextContent('The other 1 applicant is told they were not selected.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm @test.creator' }));
    await waitFor(() => expect(api.called('POST /applications/app-1/confirm')).toHaveLength(1));
    expect(
      await screen.findByRole('heading', { name: 'Pay the ValueSkins fee to start the deal' }),
    ).toBeInTheDocument();
  });

  it('lets a creator apply after a confirm', async () => {
    const { api } = renderDeal(makeDeal('OPEN', { allowedActions: [act('APPLY')] }), 'other', {
      [`POST /deals/${DEAL_ID}/applications`]: json(201, { application: { id: 'a1' } }),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Apply' }));
    const dialog = screen.getByRole('dialog', { name: 'Apply to Test kurta reel?' });
    expect(dialog).toHaveTextContent('You cannot withdraw an application.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(api.called(`POST /deals/${DEAL_ID}/applications`)).toHaveLength(1));
    // History is for the parties only.
    expect(api.called(`GET /deals/${DEAL_ID}/events`)).toHaveLength(0);
  });

  it('shows each Apply state from the API’s reason', async () => {
    const cases: Array<[string, string]> = [
      ['You have already applied', 'Applied'],
      ['Applications closed', 'Apply'],
      ['Add your UPI ID to apply', 'Apply'],
    ];
    for (const [reason, label] of cases) {
      const view = renderDeal(
        makeDeal('OPEN', { allowedActions: [act('APPLY', reason)] }),
        'other',
      );
      const button = await screen.findByRole('button', { name: label });
      expect(button).toBeDisabled();
      expect(screen.getByText(reason)).toBeInTheDocument();
      if (reason === 'Add your UPI ID to apply')
        expect(screen.getByRole('link', { name: 'Add UPI ID' })).toBeInTheDocument();
      view.unmount();
    }
  });
});

describe('deal page: waiting states', () => {
  it('tells the creator what they wait for, with no buttons from absent actions', async () => {
    renderDeal(makeDeal('CONFIRMED', { allowedActions: [act('RAISE_DISPUTE')] }), 'creator');
    expect(
      await screen.findByRole('heading', {
        name: 'Waiting for @test.brand to pay the ValueSkins fee',
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Pay ValueSkins fee/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel deal' })).not.toBeInTheDocument();
  });

  it('hides the fee button when the API does not offer it', async () => {
    renderDeal(makeDeal('CONFIRMED', { allowedActions: [] }), 'brand');
    expect(
      await screen.findByRole('heading', { name: 'Pay the ValueSkins fee to start the deal' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Pay ValueSkins fee/ })).not.toBeInTheDocument();
  });

  it('shows the brand its recorded payment waiting, with the reason it cannot record again', async () => {
    const reason = 'Waiting for the creator to confirm the payment you recorded';
    renderDeal(
      makeDeal('COMMISSION_PAID', {
        directPayments: [record()],
        allowedActions: [act('PAY_ADVANCE', reason)],
      }),
      'brand',
    );
    expect(
      await screen.findByRole('heading', { name: 'Waiting for the creator to confirm.' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Record another payment' })).toBeDisabled();
    expect(screen.getAllByText(reason).length).toBeGreaterThan(0);
  });
});

describe('deal page: the creator confirms a UPI payment', () => {
  const deal = makeDeal('COMMISSION_PAID', {
    directPayments: [record({ note: 'Paid from HDFC' })],
    allowedActions: [act('CONFIRM_PAYMENT_RECEIVED'), act('RAISE_DISPUTE')],
  });

  it('confirms with "I received it", showing only the masked UPI ID', async () => {
    const { api } = renderDeal(deal, 'creator', {
      'POST /direct-payments/0190a0e8-52b5-75d3-999f-4570bcd49200/confirm': json(200, {
        directPayment: record({ status: 'CONFIRMED' }),
        deal: makeDeal('ADVANCE_PAID'),
      }),
    });
    expect(await screen.findByText(/The brand says it paid/)).toHaveTextContent('te•••@okfakebank');
    expect(screen.getAllByText(/Note from the brand: Paid from HDFC/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'I received it' }));
    await waitFor(() =>
      expect(
        api.called('POST /direct-payments/0190a0e8-52b5-75d3-999f-4570bcd49200/confirm'),
      ).toHaveLength(1),
    );
    expect(api.called(`GET /deals/${DEAL_ID}/direct-payment`)).toHaveLength(0);
  });

  it('needs a reason for "Not received"', async () => {
    const { api } = renderDeal(deal, 'creator', {
      'POST /direct-payments/0190a0e8-52b5-75d3-999f-4570bcd49200/not-received': json(200, {
        directPayment: record({ status: 'DISPUTED' }),
        deal,
      }),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Not received' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tell the brand it did not arrive' }));
    expect(screen.getByText('Tell the brand what happened.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('What happened?'), {
      target: { value: 'Nothing in my account' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tell the brand it did not arrive' }));
    await waitFor(() =>
      expect(
        api.called('POST /direct-payments/0190a0e8-52b5-75d3-999f-4570bcd49200/not-received')[0]!
          .body,
      ).toEqual({
        reason: 'Nothing in my account',
      }),
    );
  });

  it('shows the reason when nothing is recorded yet', async () => {
    renderDeal(
      makeDeal('COMMISSION_PAID', {
        allowedActions: [
          act('CONFIRM_PAYMENT_RECEIVED', 'The brand has not recorded a payment yet'),
        ],
      }),
      'creator',
    );
    expect(await screen.findByRole('button', { name: 'I received it' })).toBeDisabled();
    expect(screen.getAllByText('The brand has not recorded a payment yet').length).toBeGreaterThan(
      0,
    );
  });
});

describe('deal page: content and review', () => {
  it('checks the Drive link before sharing, and shares it', async () => {
    const { api } = renderDeal(
      makeDeal('REVISION_REQUESTED', {
        feedback: 'Show the fabric up close.',
        revisionNotice: 'This deal has had 5 revisions. If you cannot agree, raise a dispute.',
        allowedActions: [act('UPLOAD_CONTENT'), act('RAISE_DISPUTE')],
      }),
      'creator',
      { [`POST /deals/${DEAL_ID}/content`]: json(200, { deal: makeDeal('CONTENT_UPLOADED') }) },
    );
    expect(await screen.findByText('Show the fabric up close.')).toBeInTheDocument();
    expect(screen.getByText(/5 revisions/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Google Drive link'), {
      target: { value: 'https://dropbox.com/x' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Share new link' }));
    expect(screen.getByText('Must be a Google Drive link')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Google Drive link'), {
      target: { value: 'https://drive.google.com/file/d/x' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Share new link' }));
    await waitFor(() =>
      expect(api.called(`POST /deals/${DEAL_ID}/content`)[0]!.body).toEqual({
        link: 'https://drive.google.com/file/d/x',
      }),
    );
  });

  it('shows the 20-link limit as the reason', async () => {
    renderDeal(
      makeDeal('ADVANCE_PAID', {
        allowedActions: [
          act('UPLOAD_CONTENT', 'The limit of 20 content links for this deal has been reached'),
        ],
      }),
      'creator',
    );
    expect(await screen.findByRole('button', { name: 'Share content' })).toBeDisabled();
  });

  it('lets the brand approve after a confirm naming the final amount, or ask for changes', async () => {
    const deal = makeDeal('CONTENT_UPLOADED', {
      contentUploads: [
        { link: 'https://drive.google.com/file/d/cut-1', uploadedAt: '2026-10-08T14:15:00.000Z' },
      ],
      allowedActions: [act('SEND_FEEDBACK'), act('APPROVE'), act('RAISE_DISPUTE')],
    });
    const { api } = renderDeal(deal, 'brand', {
      [`POST /deals/${DEAL_ID}/approve`]: json(200, { deal: makeDeal('APPROVED') }),
      [`POST /deals/${DEAL_ID}/feedback`]: json(200, { deal: makeDeal('REVISION_REQUESTED') }),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Suggest changes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send changes' }));
    expect(screen.getByText('Write what should change.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    const dialog = screen.getByRole('dialog', { name: 'Approve the content?' });
    expect(dialog).toHaveTextContent(
      'You will then pay the final ₹6,380.50 to the creator by UPI.',
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(api.called(`POST /deals/${DEAL_ID}/approve`)).toHaveLength(1));
  });
});

describe('deal page: finished deals', () => {
  it('links only the documents the deal lists, and the deal record', async () => {
    const deal = makeDeal('COMPLETED', {
      documents: [
        {
          kind: 'commission-invoice',
          number: 'VS/2026-27/000123',
          issuedAt: '2026-10-02T06:04:00.000Z',
        },
        { kind: 'adp', number: null, issuedAt: '2026-10-11T12:35:00.000Z' },
      ],
      directPayments: [
        record({ status: 'CONFIRMED', confirmedAt: '2026-10-03T08:45:00.000Z' }),
        record({
          id: 'r2',
          stage: 'FINAL',
          amountPaise: 638050,
          status: 'CONFIRMED',
          confirmedAt: '2026-10-11T12:35:00.000Z',
        }),
      ],
      allowedActions: [act('RAISE_DISPUTE')],
    });
    renderDeal(deal, 'creator');
    expect(
      await screen.findByRole('heading', { name: 'This deal is complete' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Download deal record' }).getAttribute('href')).toMatch(
      /\/api\/deals\/.+\/documents\/adp$/,
    );
    expect(screen.getByRole('link', { name: /Download Fee tax invoice/ })).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /Download Advance payment record/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('You received')).toBeInTheDocument();
  });

  it('says who cancelled, why, and that no fee was charged', async () => {
    renderDeal(
      makeDeal('CANCELLED', {
        creator: CREATOR,
        confirmedAt: '2026-10-02T05:50:00.000Z',
        cancelledAt: '2026-10-02T06:30:00.000Z',
        cancelledByRole: 'BRAND',
        cancellationReason: 'Our launch moved to next month.',
      }),
      'creator',
    );
    expect(
      await screen.findByRole('heading', { name: 'Cancelled by @test.brand' }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Our launch moved to next month.').length).toBeGreaterThan(0);
    expect(screen.getByText('No fee was charged.')).toBeInTheDocument();
  });
});

describe('deal page: side panel and errors', () => {
  it('cancels only with a reason', async () => {
    const deal = makeDeal('CONFIRMED', { allowedActions: [act('PAY_COMMISSION'), act('CANCEL')] });
    const { api } = renderDeal(deal, 'brand', {
      [`POST /deals/${DEAL_ID}/cancel`]: json(200, {
        deal: makeDeal('CANCELLED', { cancelledByRole: 'BRAND' }),
      }),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel deal' }));
    const dialog = screen.getByRole('dialog', { name: 'Cancel Test kurta reel?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel deal' }));
    expect(within(dialog).getByText('Say why you are cancelling.')).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText('Why are you cancelling?'), {
      target: { value: 'Plans changed' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel deal' }));
    await waitFor(() =>
      expect(api.called(`POST /deals/${DEAL_ID}/cancel`)[0]!.body).toEqual({
        reason: 'Plans changed',
      }),
    );
  });

  it('shows why cancelling and disputes are off', async () => {
    renderDeal(
      makeDeal('COMMISSION_PAID', {
        allowedActions: [
          act(
            'CANCEL',
            'The deal cannot be cancelled after the fee is paid. Write to us if something is wrong.',
          ),
          act('RAISE_DISPUTE', 'A dispute is already open on this deal'),
        ],
      }),
      'creator',
    );
    expect(
      await screen.findByText(
        'The deal cannot be cancelled after the fee is paid. Write to us if something is wrong.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Raise a dispute' })).toBeDisabled();
    expect(screen.getByText('A dispute is already open on this deal')).toBeInTheDocument();
  });

  it('raises a dispute, and words the daily limit', async () => {
    const deal = makeDeal('ADVANCE_PAID', {
      allowedActions: [act('UPLOAD_CONTENT'), act('RAISE_DISPUTE')],
    });
    const { api } = renderDeal(deal, 'creator', {
      [`POST /deals/${DEAL_ID}/disputes`]: apiError(429, 'RATE_LIMITED', 'Too many requests'),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Raise a dispute' }));
    const dialog = screen.getByRole('dialog', { name: 'Raise a dispute' });
    fireEvent.change(within(dialog).getByLabelText('Subject'), { target: { value: 'Late fee' } });
    fireEvent.change(within(dialog).getByLabelText('What happened?'), {
      target: { value: 'Details' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Raise dispute' }));
    expect(
      await screen.findByText('You can raise 3 disputes on a deal in a day'),
    ).toBeInTheDocument();
    expect(api.called(`POST /deals/${DEAL_ID}/disputes`)[0]!.body).toEqual({
      subject: 'Late fee',
      description: 'Details',
    });
  });

  it('re-reads the deal and says so when the other person acted first', async () => {
    const deal = makeDeal('CONTENT_UPLOADED', {
      contentUploads: [
        { link: 'https://drive.google.com/file/d/cut-1', uploadedAt: '2026-10-08T14:15:00.000Z' },
      ],
      allowedActions: [act('APPROVE'), act('SEND_FEEDBACK')],
    });
    const { api } = renderDeal(deal, 'brand', {
      [`POST /deals/${DEAL_ID}/approve`]: apiError(
        409,
        'INVALID_TRANSITION',
        'From CONTENT_UPLOADED',
      ),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Approve' }));
    expect(await screen.findByText('This deal just changed')).toBeInTheDocument();
    expect(screen.queryByText(/CONTENT_UPLOADED/)).not.toBeInTheDocument();
    await waitFor(() => expect(api.called(`GET /deals/${DEAL_ID}`).length).toBeGreaterThan(1));
  });

  it('shows the 404 page for a deal this person cannot see', async () => {
    renderDeal(makeDeal('OPEN'), 'other', {
      [`GET /deals/${DEAL_ID}`]: apiError(404, 'NOT_FOUND', 'Not found'),
    });
    expect(await screen.findByText('404 page')).toBeInTheDocument();
  });
});
