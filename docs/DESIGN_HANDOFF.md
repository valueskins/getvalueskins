# Design handoff

The design for the web rebuild (W1 to W3 in `docs/REPLACEMENT_PLAN.md` section 7). It is the visual source of truth. The data source of truth stays `apps/api` and the schemas in `packages/shared`. Anything a screen needs that the API does not give is listed in `docs/WEB_API_GAPS.md`.

- **The design canvas:** the link comes with the handoff instruction. It has one page per area. Each board is one self-contained HTML file, `project/<Board>.dc.html`, styled by `project/receipt.css`.
- **`project/canvas.json`:** lists every board, with its page, title, size and position.
- **How to read a board:**
  - Its markup uses `{{name}}` placeholders and the `<sc-if>` and `<sc-for>` template tags.
  - The board's script, at the bottom, holds the sample data and the click-through logic.
  - Read boards for layout, copy, states and behaviour. They are not code to ship.
- **`docs/design/receipt.css`:** a copy of the canvas stylesheet. It holds the tokens and every component class. Build the Tailwind theme and the UI primitives from it.

## 1. Decisions

- **Direction:** "Receipt". Off-white page, white cards with a 1px rule, ink text, and one vermilion accent.
  - **Light only.** There is no dark mode.
  - This replaces the black, `#FF0000` and 4px rules in `docs/SPEC.md` section 18. W1 updates SPEC 18 to match in the same change.
- **Colour tokens** (all on `:root` in `receipt.css`):
  - **Page and surfaces:** page `#F7F8F8`, surface `#FFFFFF`, sunken `#EFF1F1`.
  - **Ink:** ink `#101113`, ink-2 `#4A4F55`, ink-3 `#6B7177`. Never use ink-3 on sunken.
  - **Lines:** rule `#E3E6E8`, rule-strong `#C4C9CD`, field border `#8A9096`.
  - **Accent** `#D2340C`, hover `#B42C0A`, press `#9A2508`. It is only for primary actions and the focus ring.
  - **Status:** error `#B42318` on `#FBEAE8`, ok `#1E7A4C` on `#E7F4EC`, waiting `#8A5A00` on `#FBF1DC`, in progress `#2F4B7C` on `#E8EEF7`.
- **Type:** Geist 400, 500 and 600, and Geist Mono 400 and 500.
  - Mono, with tabular figures, is for money, deal ids, UTRs, UPI IDs, invoice numbers and Razorpay ids.
  - The scale: display 40/44, h1 28/36, h2 22/28, h3 18/24, body 16/24, small 14/20, label 12/16.
- **Shape:**
  - Radius 6px on controls, cards, modals and toasts. 4px on badges and checkboxes. Circles are for avatars only.
  - No shadows except on overlays: modal, toast, menu, popover.
- **Icons:** Phosphor, regular weight, drawn inline with `fill: currentColor`.
- **Copy:** CLAUDE.md section 12 applies to the web too.
  - Short sentences. No emojis, no em or en dashes, and none of the banned words.
  - Button labels start with a verb, and name the amount whenever money moves.
- **Money and time:**
  - Money looks like `₹10,000.00` (en-IN). Paise are a shade lighter in large amounts.
  - Dates look like `30 Sep 2026`, and `2 Oct` in compact places. Times look like `11:59 pm`, in IST.
  - A deadline is the end of that day in IST.
  - Countdowns read "8 days left", switch to hours under 24 hours, and turn red as "Overdue by 2 days".
- **Short ids:** shown exactly as the API makes them, 8 characters in mono with no prefix, for example `8K2M4QXZ`. This matches emails, PDFs and the Razorpay receipt. Invoice numbers keep their own formats, `VS/2026-27/000123` and `VS-PR/2026-27/000045`.
- **Wording:** the screens say "ValueSkins fee" and "Deal record", and the API now says the same in copy, email subjects and bodies, PDFs and error messages. Identifiers, enums, table names and URL slugs keep "commission" and `adp`. Closed in `WEB_API_GAPS.md`.
- **UPI ID:**
  - Masked as `cr•••@okhdfcbank` everywhere, including for admins and on the creator's own screens.
  - In full only on the brand's pay panel, from `GET /deals/:id/direct-payment`.
- **Disabled controls:** every one shows the API's reason under it, word for word, with an info icon. A control the user can never use is hidden, not disabled.
- **Overlays:**
  - **Modals:** only for choices that cannot be undone. The title asks the question, and the body says what happens next, with numbers. Escape and the close button cancel. On phones a modal becomes a bottom sheet.
  - **Toasts:** success and info leave after 6 seconds, and errors stay until closed. Desktop: top right. Phone: full width above the bottom edge.
- **Widths:** designed at 1440 and 390. At 768, use the desktop layout with the side column moved under the main column.
- **Accessibility:**
  - The focus ring is 2px in the accent colour, offset 2px.
  - Targets are at least 44px (36px small buttons only in dense desktop tables).
  - Every icon-only button has a name.
  - Reduced motion turns off the shimmer and transitions.

## 2. Components

These come from `receipt.css`. Build each one once.

| Component                     | Classes                                                                                                                        | Notes                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Button                        | `.btn` with `-primary`, `-secondary`, `-text`, `-ghost`, `-danger`, `-danger-outline`, `-sm`, `-block`, `-icon`, `.is-loading` | One primary per screen. Loading keeps its width and blocks a second click. |
| DisabledReason                | `.reason`                                                                                                                      | The line under a disabled control.                                         |
| Field                         | `.field`, `.field-label`, `.field-help`, `.field-error`, `.field-row`, `.counter`                                              | The error replaces nothing: help stays, the error is added under it.       |
| Input, Select, Textarea       | `.input` (`.mono`, `.has-pre`, `.is-error`), `.input-wrap`, `.input-adorn`, `.input-pre`                                       | The ₹ prefix uses `.has-pre` and `.input-pre`.                             |
| DateField with calendar       | `.date-btn`, `.cal`, `.cal-*`                                                                                                  | Past days are off. Dots mark the other two dates.                          |
| Checkbox                      | `.check`, `.check-box`                                                                                                         |                                                                            |
| Card, Section                 | `.card`, `.card-pad`, `.sec`, `.sec-h`, `.sec-b`, `.sec-foot`                                                                  |                                                                            |
| Badge                         | `.badge` with `-draft`, `-open`, `-progress`, `-wait`, `-ok`, `-done`, `-cancelled`, `-new`, `-error`                          | One per deal status. Labels are in section 4.                              |
| Callout, Banner, ErrorSummary | `.callout-*`, `.banner`, `.err-summary`                                                                                        |                                                                            |
| Toast                         | `.toast`                                                                                                                       |                                                                            |
| Modal, BottomSheet            | `.scrim`, `.modal-*`, `.sheet-bottom`                                                                                          |                                                                            |
| Steps (9) and StepsCompact    | `.steps`, `.step.is-done                                                                                                       | is-current                                                                 | is-stopped | is-void`, `.steps-compact`, `.seg` | Never moves back. Changes requested stays on Review. |
| UserChip and Avatar           | `.chip`, `.chip-btn`, `.avatar`                                                                                                | Initials while the picture loads.                                          |
| ResumeCard                    | `.popover`, `.resume-*`                                                                                                        | Hover on desktop, tap on phones. Inline on the applicants list.            |
| MoneyBreakdown                | `.breakdown`, `.bd-row`, `.bd-total`, `.bd-note`                                                                               | The live budget breakdown, and the modal summaries.                        |
| NextStep                      | `.np`, `.np-head`, `.np-body`, `.np-foot`, `.np.is-wait`                                                                       | The one action now, or what the person is waiting for.                     |
| UpiPanel and Qr               | `.upi-full`, `.upi-masked`, `.qr`                                                                                              |                                                                            |
| PaymentRecord                 | `.rec`, `.rec.is-struck`, `.rec-why`                                                                                           | A record marked not received is struck through, with its reason.           |
| Timeline                      | `.timeline`                                                                                                                    | Activity.                                                                  |
| EmailRow                      | `.email-row`, `.email-btn`, `.email-body`, `.att`                                                                              |                                                                            |
| Tabs, FilterChips, Pager      | `.tabs`, `.tab`, `.fchips`, `.fchip`, `.pager`                                                                                 |                                                                            |
| DataTable                     | `.dt`, `.kv`, `.id-copy`                                                                                                       | Admin.                                                                     |
| Shell                         | `.topbar`, `.nav`, `.usermenu-btn`, `.menu`, `.topbar-m`, `.sheet`, `.admin-tag`, `.site-header`, `.site-footer`               |                                                                            |
| Empty, Error, Loading         | the D0 board "States, user chip, UPI, QR", `.skel`                                                                             | Skeletons, not spinners, for loading pages.                                |

## 3. Navigation

- **Creator:** Deals, Applications, My deals, Settings.
- **Brand:** Campaigns, Settings, plus a "Post a deal" button.
- **Admin:** Deals, Disputes, with an "Admin" tag next to the wordmark.
- **Phones:** the menu opens as a full sheet.

## 4. Screens

Board names are the canvas file names. Routes are suggestions.

### Public, sign-in, onboarding, settings, legal (pages Public, Onboarding, Settings, Legal)

| Screen                                | Boards                                                                                                                                       | Route                 | API                                                                                                    |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------ |
| Home                                  | Home, HomeM                                                                                                                                  | `/`                   | `GET /config`                                                                                          |
| How it works                          | HowItWorks, HowItWorksM                                                                                                                      | `/how-it-works`       |                                                                                                        |
| Sign-in errors                        | ErrPersonal, ErrRole, ErrGeneric, ErrPersonalM                                                                                               | `/signin/error?code=` | codes from the Instagram callback                                                                      |
| Onboarding                            | OnbInstagram, OnbEmail, OnbEmailSent, OnbEmailVerified, OnbProfileCreator, OnbProfileBrand, OnbUpi, OnbUpiError, OnbBilling and the M boards | `/onboarding`         | `GET /me` (`onboarding`), `POST /me/email`, `PUT /me/profile`, `PUT /me/payout-upi`, `PUT /me/billing` |
| Settings                              | SettingsCreator, SettingsBrand, SettingsDialogs, SettingsCreatorM                                                                            | `/settings`           | `GET /me`, `GET /me/payout-upi`, the PUTs above, `DELETE /me`                                          |
| Terms, Privacy, Refunds, Contact, 404 | Terms, Privacy, Refunds, Contact, NotFound and the M boards                                                                                  | `/terms` and so on    |                                                                                                        |

### Creator (page Creator)

| Screen               | Boards                                    | Route                                      | API                                                                             |
| -------------------- | ----------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------- |
| Deals feed           | CrFeed, CrFeedNoUpi, CrFeedEmpty, CrFeedM | `/deals`                                   | `GET /deals/feed`, `GET /users/:id/resume`, socket `deal:new` and `deal:closed` |
| Open deal (applying) | CrDeal, CrApplyStates, CrDealM            | `/deals/[id]` while OPEN and not confirmed | `GET /deals/:id` (APPLY and its reason), `POST /deals/:id/applications`         |
| Applications         | CrApplications, CrApplicationsM           | `/applications`                            | `GET /applications/mine`                                                        |
| My deals             | CrMyDeals, CrMyDealsDone, CrMyDealsM      | `/my-deals`                                | `GET /deals/mine`                                                               |
| Resume card          | Resume, ResumeSheetM                      | everywhere                                 | `GET /users/:id/resume`                                                         |

### Brand (page Brand)

| Screen                     | Boards                                                                  | Route                                           | API                                                                                              |
| -------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Campaigns                  | BrCampaigns, BrCampaignsEmpty, BrCampaignsM                             | `/campaigns`                                    | `GET /deals/mine`                                                                                |
| Post a deal                | BrPost, BrPostErrors, BrPublish, BrPostM                                | `/campaigns/new`, and the same form for a draft | `POST /deals`, `PATCH /deals/:id`, `DELETE /deals/:id`, `POST /deals/:id/publish`, `GET /config` |
| Applicants on an open deal | BrApplicants, BrApplicantStates, BrPublished, BrApplicantsM, BrConfirmM | `/deals/[id]` while OPEN                        | `GET /deals/:id/applications`, `POST /applications/:id/confirm`, socket `application:new`        |

### The deal page (pages "Deal page" and "Deal page, 390")

- **One layout for every state and both roles:**
  - the header with both people
  - the 9 steps
  - Next step
  - the sections: brief, content links, feedback, payments, documents, emails and activity
  - the side panel: amounts, deadlines, cancel and dispute
- **Boards:**
  - `DealPage` is the master, and the "Click through" board has a prototype bar for picking any state and role.
  - `Dl01` to `Dl12` are the states. `DlMap` maps each state to what each person sees. `DlEdge` shows the errors.
  - At 390, `DealPageM` is the master and `Dm*` are the states. On phones the sections fold.
- **Route:** `/deals/[id]`.
- **API:**
  - The page: `GET /deals/:id`. Everything shown and enabled comes from `allowedActions` and `reason`.
  - **Fee:** `POST /deals/:id/payments/commission/order`, Razorpay Checkout, then `POST /payments/verify`.
  - **UPI:** `GET` and `POST /deals/:id/direct-payment`, `POST /direct-payments/:id/confirm` and `/not-received`.
  - **Content and review:** `POST /deals/:id/content`, `/feedback`, `/approve`, `/cancel`, `/disputes`.
  - **History:** `GET /deals/:id/emails`, `/events` and `/documents/:kind`.
  - **Live:** socket `deal:updated`.
- **The applicants list:** the Open state's Next step holds it, and it behaves as on the Brand page boards.

### Admin (page Admin)

| Screen         | Boards                       | Route                  | API                                                                                                                       |
| -------------- | ---------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Deals          | AdDeals, AdDealsEmpty        | `/admin/deals`         | `GET /admin/deals?status=&q=&cursor=`                                                                                     |
| Deal detail    | AdDeal, AdDealCancel         | `/admin/deals/[id]`    | `GET /admin/deals/:id`, `POST /admin/emails/:id/resend`, `POST /admin/deals/:id/cancel`, `GET /deals/:id/documents/:kind` |
| Disputes       | AdDisputes                   | `/admin/disputes`      | `GET /admin/disputes?status=`                                                                                             |
| Dispute detail | AdDispute, AdDisputeResolved | `/admin/disputes/[id]` | from the list item or `GET /admin/deals/:id` (there is no single-dispute endpoint), `POST /admin/disputes/:id/resolve`    |

### Status labels

| Status             | Label             | Badge     |
| ------------------ | ----------------- | --------- |
| DRAFT              | Draft             | draft     |
| OPEN               | Open              | open      |
| CONFIRMED          | Confirmed         | progress  |
| COMMISSION_PAID    | Fee paid          | progress  |
| ADVANCE_PAID       | Advance confirmed | progress  |
| CONTENT_UPLOADED   | Content shared    | progress  |
| REVISION_REQUESTED | Changes requested | wait      |
| APPROVED           | Approved          | ok        |
| COMPLETED          | Completed         | done      |
| CANCELLED          | Cancelled         | cancelled |

The 9 steps are Posted, Creator confirmed, Fee paid, Advance confirmed, Content shared, Review, Approved, Final confirmed and Completed.

## 5. Behaviour

- **Permissions:**
  - Never work out a permission in the browser. Show what `allowedActions` allows.
  - Put `reason` under a disabled control, word for word.
  - Hide an action that is not in the list.
- **Errors:**
  - Map error codes to plain text, and never show `message` when it names a raw status.
  - The `DlEdge` board has the wording: lost race, already recorded, not pending, document not ready, limits, and Razorpay failures.
  - Show validation `details` under the matching field. A form with several errors gets an error summary at the top, with links to the fields.
- **Live updates:**
  - Connect the socket when signed in.
  - Refetch on `deal:new`, `deal:closed`, `deal:updated` and `application:new`, and on reconnect and window focus.
  - When the other person acts, show a toast.
- **Post a deal:**
  - The budget field adds commas as you type.
  - The breakdown under it comes from `computeBreakdown`, using `GET /config`, and only from ₹5,000.00 up.
  - The form saves to localStorage every 30 seconds and on blur. "Save draft" saves to the server.
  - Publish checks the fields and either shows the errors or opens the confirm.
- **Applying:** a confirm step comes first, because an application cannot be withdrawn.
- **UPI payment:** "Pay with UPI app" uses `upiUri`. The QR code is drawn from the same `upiUri`; the temporary page already does this with `uqr`.
- **Pagination:** cursor based. Use "Show more" on feeds and lists, and Previous and Next on admin tables. There is no total count.
- **Sample data:** one consistent story runs through every board (Festive kurta try-on reel, `8K2M4QXZ`, @urbanthreads.in and @riya.eats, ₹10,000.00, 1 to 11 Oct 2026). It is sample data only. Every amount comes from `computeBreakdown`.

## 6. Checked before handoff

Every board from the design system to admin was checked:

- no em or en dashes, emojis or banned words
- every amount in `₹0.00` form
- one short-id format
- the same navigation labels per role
- reasons and errors copied from the code
- the full UPI ID only on the brand's pay panel
- every board in `canvas.json` has a file

The deal template (`DEAL_DESCRIPTION_TEMPLATE` in `copy.ts`, SPEC 9) now follows the copy rules too ("1 to 3 Oct", "₹2,000.00"), so there is no exception left.
