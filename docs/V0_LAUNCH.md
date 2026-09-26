# V0 Launch

Working notes for the pre-launch build.

## 1. Status

Prompts are given one by one and executed via the workflow in docs/WORKFLOW.md.

## 2. Prompts

Per CLAUDE.md, this section overrides docs/SPEC.md wherever they differ, until launch. Prompts are appended here as they are given; when a prompt implements something from this section, docs/SPEC.md is updated in the same change so it stays the source of truth.

### 2.1 Email-only accounts

Instagram app review can take weeks, and building cannot wait. V0 allows accounts to exist without a linked Instagram account. `users.instagram_user_id` is nullable; `users.username`'s uniqueness is a partial unique index scoped to `instagram_user_id IS NOT NULL` (so email-only usernames, not yet derived from anything, don't collide with the real-handle uniqueness rule). A new `email_login_codes` table backs a future email-code login endpoint, gated by `AUTH_EMAIL_ENABLED` (not yet built — this prompt only adds the flag and the table).

### 2.6 Configurable GST

ValueSkins isn't GST-registered yet, so GST isn't charged at launch. `computeBreakdown` takes an optional GST-rate-in-basis-points parameter, defaulting to `packages/shared`'s config constant. The API's `GST_RATE_BPS` env var controls the live rate (currently `0`), and a startup guard prevents enabling GST (`GST_RATE_BPS > 0`) without `COMPANY_GSTIN` set.
