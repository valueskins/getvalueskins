# Design reference

This file describes the look every ValueSkins screen will follow. The only source is the home page: `apps/web/app/(landing)/page.tsx`, `apps/web/components/landing/`, the `.hm` rules and tokens in `apps/web/app/home.css`, and `docs/SPEC.md` section 18 (the "Homepage" and "Deal calculator" bullets).

Status: written from the home page, with the founder's decisions in section 7. Anything marked **Proposed** has no example on the home page.

`apps/web/app/styles/tokens.css` is the one token source: the `--hm-*` values below, plus the shorter names the components read (`--bg`, `--ink`, `--accent`, `--border-field` and so on), each pointing at a `--hm-*` value. `/dev/components` (non-production builds) shows every shared component in every state, including pink and danger side by side.

These are older looks and are not the reference, even where a comment calls them "the approved look": `apps/web/app/landing.css` (`.v3`), the rest of `apps/web/app/styles/`, and `docs/DESIGN_HANDOFF.md`.

## 1. Principles

- A cool off-white ground with ink type. Colour is rare, so it means something.
- Rani pink is the brand and every action. Lime is only the creator's money. Green is only a status.
- One shape rule: anything you press is a pill. Containers are 32px on the outside and 16px on the inside.
- Headlines use a condensed, heavy cut of Bricolage Grotesque. Everything else is the regular cut.
- Light only. Every text pairing meets WCAG AA (4.5:1, or 3:1 for input edges and focus rings).
- Motion is transform and opacity only, and all of it stops under `prefers-reduced-motion`.
- Working screens are calmer than the marketing page: same tokens, type, shapes and colour meanings, but no tilting cards, no marquee bands and no decorative motion.

## 2. Tokens

All values are in `apps/web/app/home.css`, in the `.hm` block (lines 14 to 63). Contrast ratios are WCAG relative luminance, computed from the hex values.

### 2.1 Colour

| Token               | Value                     | Role                                                                              |
| ------------------- | ------------------------- | --------------------------------------------------------------------------------- |
| `--hm-bg`           | `#f3f3f0`                 | Page ground                                                                       |
| `--hm-bg-2`         | `#e9e9e4`                 | Band ground, pills, hover ground, bar track                                       |
| `--hm-surface`      | `#fcfcfa`                 | Cards, tiles, ticket, glass base                                                  |
| `--hm-ink`          | `#111114`                 | Text, ink button, dark tile                                                       |
| `--hm-ink-2`        | `#46464c`                 | Body text, the fee segment                                                        |
| `--hm-ink-3`        | `#66666d`                 | Small text, legends                                                               |
| `--hm-line`         | `#d9d9d3`                 | Hairlines and card borders                                                        |
| `--hm-line-strong`  | `#a9a9a2`                 | Rules and decoration: FAQ rules, hatching, disabled edges                         |
| `--hm-line-field`   | `#6f6f68`                 | The edge of an input, a checkbox, an outline pill and the FAQ marker (decision 6) |
| `--hm-accent`       | `#d6195f`                 | Rani pink: fills, actions, focus ring                                             |
| `--hm-accent-hover` | `#bb1452`                 | Hover on an accent fill                                                           |
| `--hm-accent-press` | `#a01046`                 | Pressed accent fill in the app (the home page presses with a scale only)          |
| `--hm-accent-ink`   | `#b0124d`                 | The accent as text on light grounds                                               |
| `--hm-accent-soft`  | `#fbe2eb`                 | Tint: creator tile, picked row, focus halo                                        |
| `--hm-accent-mid`   | `#ef8fb2`                 | The accent on ink grounds (`--accent-on-dark`)                                    |
| `--hm-on-accent`    | `#fcfcfa`                 | Text on the accent                                                                |
| `--hm-ok`           | `#17733e`                 | Status text                                                                       |
| `--hm-ok-soft`      | `#e1f2e7`                 | Status pill ground                                                                |
| `--hm-lime`         | `#c6e043`                 | The creator's 70% payment, the creator total                                      |
| `--hm-lime-soft`    | `#e6f2a6`                 | The creator's 30% payment                                                         |
| `--hm-on-lime`      | `#111114`                 | Text on lime (the ink)                                                            |
| `--hm-lime-edge`    | `#7c9018`                 | The 1px edge of the soft lime swatch only                                         |
| `--hm-glyph`        | `rgb(255 255 255 / 0.16)` | The giant rupee sign on the money tile                                            |

### 2.2 Contrast of the pairings the home page uses

Text pairings (need 4.5:1):

| Text on ground                                  | Ratio                     |
| ----------------------------------------------- | ------------------------- |
| ink on bg / surface                             | 16.95 / 18.35             |
| ink-2 on bg / surface / bg-2 / accent-soft      | 8.43 / 9.12 / 7.69 / 7.67 |
| ink-3 on bg / surface                           | 5.12 / 5.55               |
| ink-3 on bg-2                                   | 4.68 (tight)              |
| ink-3 on accent-soft                            | 4.66 (tight)              |
| on-accent on accent                             | 4.91                      |
| on-accent on accent-hover                       | 6.13                      |
| accent-ink on bg / surface / bg-2 / accent-soft | 6.21 / 6.73 / 5.67 / 5.65 |
| ink on lime / lime-soft                         | 12.70 / 15.81             |
| ok on surface / bg / ok-soft                    | 5.75 / 5.31 / 5.07        |
| bg on ink (ink button, dark tile)               | 16.95                     |
| bg on ink-2 (ink button hover)                  | 8.43                      |

Non-text pairings (need 3:1):

| Edge or icon on ground                                                                       | Ratio       | Result                                                                                  |
| -------------------------------------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------- |
| accent on bg (focus ring, calculator focus border)                                           | 4.54        | passes                                                                                  |
| accent on surface                                                                            | 4.91        | passes                                                                                  |
| accent on ink (icon in the dark tile)                                                        | 3.74        | passes                                                                                  |
| ink focus ring on the accent block                                                           | 3.74        | passes                                                                                  |
| lime-edge on bg                                                                              | 3.22        | passes                                                                                  |
| line-strong on bg / surface (the old calculator input border, outline pills and menu button) | 2.13 / 2.30 | **below 3:1**, replaced by `--hm-line-field` (4.55 on bg, 4.14 on bg-2), see decision 6 |
| line on bg (hairlines)                                                                       | 1.27        | decorative only                                                                         |
| lime on bg / surface                                                                         | 1.34 / 1.45 | fill only, never an edge                                                                |
| lime-soft on bg                                                                              | 1.07        | needs `--hm-lime-edge`                                                                  |

### 2.2a Pairings checked by the test

`apps/web/test/designTokens.test.ts` reads this table, resolves each token from `apps/web/app/styles/tokens.css` and fails when a pairing is below its minimum. The first column is the text, icon or edge colour, the second the ground it sits on, the third the minimum ratio (4.5 for text, 3 for control edges, focus rings and icons). The app tokens are the names the components use; each points at a `--hm-*` value in section 2.1. `--hm-line-field` (`#6f6f68`) is the control edge of decision 6.

| Colour             | Ground           | Minimum |
| ------------------ | ---------------- | ------- |
| `--ink`            | `--bg`           | 4.5     |
| `--ink`            | `--surface`      | 4.5     |
| `--ink`            | `--sunken`       | 4.5     |
| `--ink-muted`      | `--bg`           | 4.5     |
| `--ink-muted`      | `--surface`      | 4.5     |
| `--ink-muted`      | `--sunken`       | 4.5     |
| `--ink-muted`      | `--accent-soft`  | 4.5     |
| `--ink-muted`      | `--lime`         | 4.5     |
| `--ink-muted`      | `--lime-soft`    | 4.5     |
| `--ink-subtle`     | `--bg`           | 4.5     |
| `--ink-subtle`     | `--surface`      | 4.5     |
| `--ink-subtle`     | `--sunken`       | 4.5     |
| `--ink-subtle`     | `--accent-soft`  | 4.5     |
| `--accent-ink`     | `--bg`           | 4.5     |
| `--accent-ink`     | `--surface`      | 4.5     |
| `--accent-ink`     | `--sunken`       | 4.5     |
| `--accent-ink`     | `--accent-soft`  | 4.5     |
| `--on-accent`      | `--accent`       | 4.5     |
| `--on-accent`      | `--accent-hover` | 4.5     |
| `--on-accent`      | `--accent-press` | 4.5     |
| `--on-accent`      | `--success`      | 4.5     |
| `--on-accent`      | `--danger`       | 4.5     |
| `--on-accent`      | `--danger-hover` | 4.5     |
| `--success`        | `--bg`           | 4.5     |
| `--success`        | `--surface`      | 4.5     |
| `--success`        | `--success-soft` | 4.5     |
| `--danger`         | `--bg`           | 4.5     |
| `--danger`         | `--surface`      | 4.5     |
| `--danger`         | `--sunken`       | 4.5     |
| `--danger`         | `--danger-soft`  | 4.5     |
| `--warning`        | `--bg`           | 4.5     |
| `--warning`        | `--surface`      | 4.5     |
| `--warning`        | `--warning-soft` | 4.5     |
| `--info`           | `--bg`           | 4.5     |
| `--info`           | `--surface`      | 4.5     |
| `--info`           | `--info-soft`    | 4.5     |
| `--lime-ink`       | `--lime`         | 4.5     |
| `--lime-ink`       | `--lime-soft`    | 4.5     |
| `--bg`             | `--ink`          | 4.5     |
| `--on-dark`        | `--dark`         | 4.5     |
| `--on-dark`        | `--dark-raised`  | 4.5     |
| `--on-dark-muted`  | `--dark`         | 4.5     |
| `--accent-on-dark` | `--dark`         | 4.5     |
| `--tone-pink-ink`  | `--tone-pink`    | 4.5     |
| `--tone-grey-ink`  | `--tone-grey`    | 4.5     |
| `--tone-blue-ink`  | `--tone-blue`    | 4.5     |
| `--tone-plum-ink`  | `--tone-plum`    | 4.5     |
| `--tone-ink-ink`   | `--tone-ink`     | 4.5     |
| `--border-field`   | `--bg`           | 3       |
| `--border-field`   | `--surface`      | 3       |
| `--border-field`   | `--sunken`       | 3       |
| `--border-field`   | `--accent-soft`  | 3       |
| `--accent`         | `--bg`           | 3       |
| `--accent`         | `--surface`      | 3       |
| `--accent`         | `--sunken`       | 3       |
| `--accent`         | `--dark`         | 3       |
| `--ink`            | `--accent`       | 3       |
| `--lime-edge`      | `--bg`           | 3       |
| `--danger`         | `--bg`           | 3       |
| `--danger`         | `--surface`      | 3       |

### 2.3 Type

- Body and UI: Bricolage Grotesque (`--font-sans`, from `--font-bricolage`), 17px with a line height of 1.55 and `font-optical-sizing: auto` inside `.hm`.
- Display cut: Bricolage Grotesque with the `opsz` and `wdth` axes, loaded for the home page only in `components/landing/fonts.ts` as `--font-hm-display`, exposed as `--hm-display`. Weight 800, `font-stretch: 76%`. Use it for headlines and numerals on the marketing page. Condensed numerals use a stretch of 78% to 80%.
- Wordmark: Instrument Serif italic for "Skins" (`.wordmark em` in `apps/web/app/styles/shell.css`), recoloured by the token mapping in `.hm`.
- Tabular figures for amounts: `.hm-num`. Weights: regular body, 600 for emphasis (`.hm-strong`), 650 for small headings, 700 for kickers and tags, 800 for the display cut.

| Class                                                  | Size                                     | Line height | Letter spacing | Notes                             |
| ------------------------------------------------------ | ---------------------------------------- | ----------- | -------------- | --------------------------------- |
| `.hm-h1`                                               | `clamp(3.75rem, 1rem + 8.6vw, 10.5rem)`  | 0.88        | -0.012em       | display cut                       |
| `.hm-h2`                                               | `clamp(2.4rem, 1.2rem + 3.6vw, 4.75rem)` | 0.95        | -0.012em       | display cut, `text-wrap: balance` |
| `.hm-cta-title`                                        | `clamp(3.5rem, 0.6rem + 9.6vw, 11.5rem)` | 0.86        | -0.015em       | display cut                       |
| `.hm-rules-list li`                                    | `clamp(2.25rem, 1.2rem + 3.4vw, 4.5rem)` | 1.1         | -0.01em        | display cut, even items outlined  |
| `.hm-how-label`                                        | `clamp(2.5rem, 1.4rem + 2vw, 3.75rem)`   | 0.95        | -0.01em        | display cut                       |
| `.hm-h3`                                               | 21px                                     | 1.2         |                | weight 650                        |
| `.hm-lede`                                             | `clamp(18px, 1rem + 0.4vw, 21px)`        | 1.45        |                | `--hm-ink-2`, at most 34ch        |
| `.hm-ticket-title`, `.hm-mini-title`                   | 20px                                     |             |                | weight 650                        |
| `.hm-kicker`                                           | 15px                                     |             |                | weight 700, `--hm-accent-ink`     |
| `.hm-small`, `.hm-note`, `.hm-reason`, `.hm-calc-help` | 14px                                     |             |                | `--hm-ink-3` for `.hm-small`      |
| `.hm-example`                                          | 12px                                     |             |                | weight 600                        |
| `.hm-tag`                                              | 12px                                     |             |                | weight 700                        |
| `.hm-faq-item summary`                                 | `clamp(18px, 1rem + 0.4vw, 21px)`        |             |                | weight 600                        |
| `.hm-figure-num`                                       | `clamp(22px, 1.2rem + 0.6vw, 28px)`      |             |                | weight 700, shrinks to 12px       |
| `.hm-calc-input` digits                                | 32px to 44px, shrinking to a 16px floor  |             |                | weight 800, stretch 80%           |
| `.hm-sat-amount`                                       | 32px (26px at 480px and under)           |             |                | stretch 80%                       |
| `.hm-tile-figure`                                      | 40px to 56px                             |             |                | stretch 80%                       |

### 2.4 Spacing and layout

- `--hm-wrap` 1320px. `--hm-gutter` `clamp(16px, 4vw, 48px)`. `--hm-section` `clamp(88px, 11vw, 168px)`.
- Hero padding: `clamp(32px, 5vw, 64px)` above, `clamp(56px, 7vw, 104px)` below. Hero grid gap 48px.
- Tile padding: sides `clamp(24px, 4vw, 52px)`, `.hm-tile` `clamp(24px, 3vw, 40px)`, `.hm-costs-card` `clamp(20px, 3vw, 40px)`, `.hm-cta-block` `clamp(32px, 7vw, 104px)`.
- Gaps: bento 16px, sides 20px (24px from 900px).
- Layouts: hero 7fr/5fr from 1024px; sides 7fr/5fr from 900px; how it works 5fr/7fr with a 96px gap from 1024px; costs 4fr/8fr with a 64px gap; FAQ 5fr/7fr with a 96px gap; bento 12 columns from 900px.
- Tap targets: at least 44px for `.hm-btn`, `.hm-links a`, `.hm-text-link`, `.hm-pause`, `.hm-menu-btn`, and the FAQ summary.

### 2.5 Radii

- `--hm-r-xl` 32px: `.hm-side`, `.hm-costs-card`, `.hm-tile`, `.hm-cta-block`, `.hm-panel`.
- `--hm-r` 16px: `.hm-calc-input`, `.hm-figure`, `.hm-sat`, `.hm-applicants li`, `.hm-calc-empty`.
- `--hm-pill` 999px: everything pressable.
- Off the rule today: 24px on the ticket, `.hm-mini`, `.hm-record` and the open mobile menu; 12px on `.hm-nav-mark` and `.hm-record li`; 10px on `.hm-sat-amount`. See decision 7: app screens snap to the rule.

### 2.6 Shadows

- `--hm-shadow`: `0 1px 2px rgb(17 17 20 / 0.06), 0 24px 48px -24px rgb(17 17 20 / 0.28)`. Raised nav, mini cards.
- `--hm-shadow-lg`: `0 2px 6px rgb(17 17 20 / 0.08), 0 40px 80px -32px rgb(17 17 20 / 0.42)`.
- Primary button glow: `0 12px 24px -14px var(--hm-accent)`. Ink button: `0 16px 32px -18px rgb(17 17 20 / 0.7)`.
- Ticket: a pair of `drop-shadow` filters (needed for the notch cut-outs).

### 2.7 Borders

- 1px `--hm-line`: raised nav, `.hm-side-brand`, `.hm-costs-card`, `.hm-tile`, `.hm-rules` top and bottom, footer top.
- 1px `--hm-line-strong`: `.hm-menu-btn`, `.hm-free li`, `.hm-how-steps li` top, `.hm-faq-item` top.
- 1.5px `--hm-line-strong`: `.hm-faq-plus`. 2px `--hm-line-strong`: `.hm-calc-input`.

### 2.8 Motion

Easings: `--hm-ease` is `cubic-bezier(0.16, 1, 0.3, 1)`. `--hm-spring` is `cubic-bezier(0.34, 1.56, 0.64, 1)`.

| What moves                                      | Duration and easing                           | Class                                          |
| ----------------------------------------------- | --------------------------------------------- | ---------------------------------------------- |
| Headline lines rise from a mask                 | 0.95s `--hm-ease`, second line delayed 120ms  | `.hm-line > span`                              |
| Hero lede, actions and ticket fade up 20px      | 0.9s, delays 200, 420, 560ms                  | `.hm-enter`                                    |
| Scroll entrance: opacity and `translateY(28px)` | 0.7s opacity, 0.8s transform, 80ms stagger    | `.hm.js [data-rise]`                           |
| Rules marquee                                   | 52s linear, infinite                          | `.hm-rules-track`                              |
| Close lines slide in                            | scroll-driven `view()` timeline               | `.hm-cta-line`                                 |
| Button press, magnet, tag                       | 0.4s `--hm-spring` transform, 0.2s background | `.hm-btn`                                      |
| Hero depth shift                                | 0.9s `--hm-ease`                              | `.hm-depth-*`, fine pointer only               |
| Bar segments                                    | 0.6s to 0.8s `--hm-ease`                      | `.hm-split-seg`, `.hm-calc-seg`                |
| Figures count up                                | 600ms cubic ease-out                          | `useCountUp` in `components/landing/motion.ts` |
| Nav glass                                       | 0.3s ease                                     | `.hm-nav-in`                                   |
| Menu drop                                       | 0.35s `--hm-ease`                             | `.hm-links.is-open`                            |
| FAQ plus rotation and answer fade               | 0.4s spring, 0.45s `--hm-ease`                | `.hm-faq-plus`, `.hm-faq-item[open] p`         |

Under `prefers-reduced-motion: reduce` every animation and transition is off, the marquee becomes a static wrapped list, entrances never start (`useRiseIn` returns early) and figures jump to their value. Background-colour and shadow transitions are the only non-transform, non-opacity changes.

## 3. Colour meaning rules

| Colour                               | Means                                                                                | Allowed                                                                                                                                                  | Never                                                                              |
| ------------------------------------ | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Rani pink (`--hm-accent`)            | The brand, and every action                                                          | Primary button fill, focus ring, the current step, tag on, FAQ open marker, accent blocks. `--hm-accent-ink` for pink text. `--hm-accent-soft` for tints | As a status, as money, as an error                                                 |
| Lime (`--hm-lime`, `--hm-lime-soft`) | The creator's money only: the 30% and 70% UPI payments and what the creator receives | A fill under `--hm-on-lime` ink text. A bar segment or swatch. The soft swatch may have the `--hm-lime-edge` 1px edge                                    | Text, icon or border on a light ground. The ValueSkins fee. Any status. Decoration |
| Green (`--hm-ok`)                    | A status only (confirmed, applied, done)                                             | Status text on `--hm-ok-soft` or a light ground                                                                                                          | Money, brand, actions, decoration                                                  |
| Ink and greys                        | Text, structure, and the ValueSkins fee segment                                      | Everything else                                                                                                                                          | Never carry meaning on their own                                                   |

`apps/web/test/homeStyles.test.ts` pins the lime rule to a list of 10 selectors. The same discipline applies to the whole app.

## 4. Components as the home page draws them

### 4.1 Buttons (`.hm-btn`, mapped in `components/landing/HomeSignIn.tsx`)

- Base: pill, 44px high, 20px padding, weight 600, 16px, accent fill, `--hm-on-accent` text, glow shadow.
- `hm-btn hm-btn-sm`: the nav sign-in, 14px padding, icon hidden at 420px and under.
- `hm-btn hm-btn-lg`: hero action, 60px high, 30px padding, 18px type.
- `hm-btn hm-btn-lg hm-btn-ink`: the closing action on the accent block. Ink ground, `--hm-bg` text, `--hm-ink-2` on hover.
- States: hover goes to `--hm-accent-hover`. Pressed sets `--press: 0.96`. Disabled shows `cursor: progress`. Focus shows the 3px ring (ink on the accent block). Magnet shift (`useMagnet.ts`, 10px reach, 4px in the nav) on a fine pointer without reduced motion only.
- Other pressables: `.hm-menu-btn` (pill, 1px `--hm-line-strong`, below 960px), `.hm-pause` (underlined text button, 14px), `.hm-skip` (ink pill that drops in on focus).

### 4.2 Links

- `.hm a` inherits colour. `.hm-text-link`: weight 600, underline offset 4px, 44px target.
- `.hm-links a` (nav): pill, `--hm-ink-2`, hover to `--hm-bg-2` ground and `--hm-ink` text.

### 4.3 Navigation bar (`components/landing/HomeNav.tsx`, `.hm-nav`)

- Sticky at `top: 12px`, z-index 40. `.hm-nav-in` is a 64px pill with a transparent 1px border.
- Glass state, `[data-raised]`: 80% `--hm-surface` mix, `--hm-line` border, `--hm-shadow`, `backdrop-filter: blur(18px) saturate(1.6)`. Falls back to solid surface under `prefers-reduced-transparency`.
- Raised when an `IntersectionObserver` on `.hm-sentinel` leaves view, or when the menu is open.
- Links from 960px. Below that, a Menu button opens `.hm-links.is-open`, a 24px-radius card with 52px rows. Escape closes it.

### 4.4 Cards and tiles

- `.hm-side-brand`: surface card with a 1px line. `.hm-side-creator`: flat `--hm-accent-soft` panel. Both 32px.
- `.hm-tile`: `-money` (accent with a radial highlight and the rupee glyph), `-insta` (accent-soft to surface gradient), `-invoice` (`--hm-bg-2`, no border), `-public` (ink ground, `--hm-bg` text), `-record` (surface). 32px.
- `.hm-mini`, `.hm-record`: 24px, surface, `--hm-shadow`.
- `.hm-panel`, `.hm-cta-block`: accent with radial gradients and a ring texture, 32px.
- Ticket: `.hm-ticket-main`, `.hm-perf`, `.hm-ticket-foot`, tilted -3deg. Marketing only.
- Satellite cards `.hm-sat` (`-creator`, `-upi`, `-record`): 16px. Marketing only.

### 4.5 Amount field (`.hm-calc-input`, `DealCalculator.tsx`)

- 76px high, 2px `--hm-line-strong` border, 16px radius, `--hm-bg` ground, `container-type: inline-size`.
- The rupee sign is an absolutely placed span (`pointer-events: none`, `--hm-ink-3`). The box carries `data-affix`.
- One focus ring: the box draws it with `:focus-within` (accent border plus a `0 0 0 4px var(--hm-accent-soft)` halo). The control inside draws none (rule `.hm [data-affix] :is(input, select, textarea):focus`, pinned by `homeStyles.test.ts`).
- Results: `.hm-calc-bar` 18px high with `translateX` segments (fee ink-2, advance lime-soft, final lime, fee keeps 10px minimum). `.hm-figure` tiles are 16px cards with a 10px swatch; `.hm-figure-total` is lime with ink text. Amounts size to their tile with container query units.

### 4.6 Badges and pills

- `.hm-example`: 12px pill on `--hm-bg-2`. `.hm-tag`: grey, accent with `scale(1.06)` when `[data-on]`.
- `.hm-apply`: accent pill that flips to `--hm-ok-soft` and `--hm-ok` at 1.04 scale.
- `.hm-free li`: outline pill, 1px `--hm-line-strong`. `.hm-how-n-upi`: lime pill.
- `.hm-mono`: 40px monograms. `-brand` is an ink square with a 12px radius. `-creator` is an accent-soft circle.

### 4.7 FAQ (`components/landing/Faq.tsx`, native `<details class="hm-faq-item">`)

- Summary: flex, at least 44px, 22px padding, marker hidden. Top rule 1px `--hm-line-strong`.
- `.hm-faq-plus`: 40px circle drawn with two 14px by 2px bars. Hover turns its border ink. Open rotates it 45deg and fills it accent with `--hm-on-accent`.
- Answer: 17px, `--hm-ink-2`, 60ch, fades in.

### 4.8 Footer

The shared `.site-footer` (`components/shell/SiteChrome.tsx`), restyled under `.hm` (`home.css` lines 1685 to 1710): `--hm-bg-2` ground, `--hm-ink` text, 1px `--hm-line` top, wordmark and mail link in `--hm-accent-ink`, legal text `--hm-ink-3`, accent focus ring.

### 4.9 Section bands

| Section      | Ground                             |
| ------------ | ---------------------------------- |
| Rules strip  | `--hm-bg`, hairline top and bottom |
| Sides        | `--hm-bg`                          |
| How it works | `--hm-bg-2`, full width            |
| Costs        | `--hm-bg`                          |
| Promises     | `--hm-bg`                          |
| FAQ          | `--hm-bg`                          |
| Close        | accent block                       |
| Footer       | `--hm-bg-2`                        |

### 4.10 Focus and hover

- Focus: `.hm :focus-visible` is a 3px solid `--hm-accent` outline with a 3px offset. Ink inside `.hm-cta`. Accent in the footer.
- Hover: `.hm-btn` and `.hm-btn-ink` background, `.hm-links a` background and colour, `.hm-faq-item summary:hover .hm-faq-plus` border, `.hm-rules-band:hover` pauses the marquee.

## 5. How the look adapts for app screens

All of this uses the home page's tokens. Where the home page has no example it is marked **Proposed**.

### 5.1 General rules for working screens

- Same ground, ink, pink, lime and green meanings as section 3. Same type, with the display cut subject to decision 2.
- No tilt, no marquee, no parallax, no scroll-driven or decorative motion, no radial gradient blocks. Allowed motion: press feedback, menus, modals, toasts, bars filling, a status badge popping on a live change, and rows that arrive by realtime rising in gently. All transform and opacity, all off under reduced motion.
- Pills for anything pressed. Cards 32px for page-level containers and 16px for things inside them. **Proposed:** a card inside a card is always 16px.
- Content first: one accent block per screen at most, and only for the one action that moves the deal.

### 5.2 Dense admin variant (**Proposed**)

- Ground `--hm-bg`, flat `--hm-surface` cards with a 1px `--hm-line` border and no shadow, 16px radius.
- Solid top bar (no glass) with an "Admin" tag in ink, not pink.
- Tables: 14px text, 40px rows, `--hm-line` row rules, tabular figures, monospace identifiers. Wide tables scroll inside their card. On phones rows stack as cards.
- Actions stay pills and stay pink. Pink stays the primary action in admin (decision 10). Secondary actions are ink outline pills, destructive ones the danger red.

### 5.3 Forms (**Proposed**, based on the amount field)

- Label above, 14px help text in `--hm-ink-3` below, error in the danger colour (decision 4) with an icon.
- Text inputs: 56px high, 16px radius, 2px border in `--hm-line-field` (decision 6), `--hm-bg` ground. Focus is the amount field's ring: accent border and a 4px `--hm-accent-soft` halo.
- Inputs with a prefix or suffix use `data-affix` and draw one ring on the box.
- Checkbox, radio and select follow the same border, radius and ring. Date fields keep today's behaviour.

### 5.4 Tables and lists (**Proposed**)

- Lists are surface cards, 16px radius, 1px `--hm-line`, 16px to 24px padding, a pill-shaped action at the end of the row. Row hover is `--hm-bg-2`.
- Filter chips and tabs are outline pills with a `--hm-line-field` edge: transparent at rest, ink with `--hm-bg` text when selected.

### 5.5 Empty states (**Proposed**)

- An icon in an accent-soft circle, one 21px heading, one 17px line in `--hm-ink-2`, and at most one pill action. No illustration.

### 5.6 Loading skeletons (**Proposed**)

- Shapes match the content they replace, in `--hm-bg-2` on `--hm-surface`, with the shimmer as a transform of a pale gradient. Static under reduced motion. A failed read shows what did not load and **Try again**, never an empty state.

### 5.7 Modals, toasts and bottom sheets

- Modal: `--hm-surface`, 32px radius, `--hm-shadow-lg`, scrim of ink at about 50%, focus trapped, Escape closes. On phones it becomes a bottom sheet with 32px top corners.
- Toast: `--hm-surface` with a 1px `--hm-line` edge, 32px radius, an icon and words, above the tab bar. Success and information leave after 6 seconds; errors stay until closed. Only a success icon is green.
- Popover (resume card): surface, 16px radius, `--hm-shadow`.

### 5.8 Phone tab bar (**Proposed**)

- Solid `--hm-surface` bar with a 1px `--hm-line` top rule, 64px high, each tab at least 44px. Current tab: `--hm-accent-ink` label and an accent-soft pill behind the icon. Sits above the bottom of the page and below toasts.

### 5.9 Step rail

- The deal steps use ink segments for done, an accent segment for the current step and `--hm-line` for to come. The onboarding steps mark done with an ink check and the current step with an accent ring and `--hm-accent-soft`. On phones the onboarding rail becomes "Step 2 of 4" with a thin bar.

### 5.10 Money display

- Format `₹10,000.00`, `en-IN` grouping, from `Money` and `computeBreakdown`. Tabular figures (`.hm-num`). Paise one shade lighter (`--hm-ink-3`) in large amounts.
- Identifiers, unique transaction references (UTRs) and UPI IDs use the system monospace.
- The ValueSkins fee is ink. The creator's 30% and 70% and "You receive" follow decision 1 (lime fill under ink text, never lime text).

### 5.11 Status and deadline badges (**Proposed**)

- Status badge: pill, 12px to 14px, weight 700. Done and confirmed use `--hm-ok` on `--hm-ok-soft`. In progress uses ink on `--hm-bg-2`. Needs action uses `--hm-accent-ink` on `--hm-accent-soft`. Cancelled and error use the danger colour (decision 4).
- Deadline badge: same shape. Overdue uses the danger colour. Today uses accent-soft. Otherwise grey.

## 6. Route map

Current look: `.hm` (the home page look), `.v3` (the older saffron look from `landing.css`), or "app" (saffron app styles in `apps/web/app/styles/`). Every page inherits `app/layout.tsx`, which loads `globals.css` and the five style files.

| Route                                                                          | File under `apps/web/app`                   | Current look                                              | Shell and main components                                                                                                  | Redesign             |
| ------------------------------------------------------------------------------ | ------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| `/`                                                                            | `(landing)/page.tsx`                        | `.hm`, inside a `.v3` wrapper from `(landing)/layout.tsx` | `components/landing/Landing`, `HomeNav`, `Hero`, `Faq`, `FinalCta`; shared footer from `SiteChrome`                        | Reference, no change |
| `/how-it-works`                                                                | `(landing)/how-it-works/page.tsx`           | `.v3`                                                     | `components/public/HowItWorksPage`, `landing/Nav`, `landing/SignIn`, `landing/screens/Screens`, `SiteHeader`, `SiteFooter` | Part 3               |
| `/terms`, `/privacy`, `/refunds`                                               | `(public)/{terms,privacy,refunds}/page.tsx` | app, with the `.v3` header                                | `(public)/layout.tsx`, `SiteHeader`, `SiteFooter`, `content/ContentPage`                                                   | Part 3               |
| `/contact`                                                                     | `(public)/contact/page.tsx`                 | app, with the `.v3` header                                | `public/ContactPage`                                                                                                       | Part 3               |
| `/login?error=`                                                                | `(public)/login/page.tsx`                   | app, with the `.v3` header                                | `public/SignInError`                                                                                                       | Part 3               |
| `/signin/email`                                                                | `(public)/signin/email/page.tsx`            | app, with the `.v3` header                                | `public/EmailSignIn`                                                                                                       | Part 3               |
| `/verify-email`                                                                | `verify-email/page.tsx`                     | app, no layout                                            | `onboarding/VerifyEmail`                                                                                                   | Part 3               |
| 404, errors                                                                    | `not-found.tsx`, `error.tsx`                | app, with the `.v3` header                                | `SiteHeader`, `SiteFooter`, `status-*` classes                                                                             | Part 3               |
| Fatal error                                                                    | `global-error.tsx`                          | inline styles, hard-coded saffron                         | none                                                                                                                       | Part 3               |
| `/home`                                                                        | `home/page.tsx`                             | redirect and skeleton only                                | `PageSkeleton`                                                                                                             | Part 2 (skeleton)    |
| `/onboarding`                                                                  | `(setup)/onboarding/page.tsx`               | app                                                       | `(setup)/layout.tsx`, `SetupTopbar`, `onboarding/OnboardingFlow`, `Stepper`, `forms/*`                                     | Part 4               |
| `/settings`                                                                    | `(app)/settings/page.tsx`                   | app                                                       | `AppShell`, `settings/SettingsPage`, `forms/*`                                                                             | Part 4               |
| `/deals`, `/applications`, `/my-deals` (creator)                               | `(app)/deals`, `applications`, `my-deals`   | app                                                       | `AppShell`, `RolePage`, `creator/*`, `DealCard`, `lists/*`                                                                 | Part 5               |
| `/campaigns`, `/campaigns/new`, `/campaigns/[id]/edit` (brand)                 | `(app)/campaigns/...`                       | app                                                       | `AppShell`, `RolePage`, `brand/*`, `DealForm`, `DateField`                                                                 | Part 5               |
| `/deals/[id]` (both roles)                                                     | `(app)/deals/[id]/page.tsx`                 | app                                                       | `AppShell`, `deal/DealPage`, `deal/panels/*`                                                                               | Part 6               |
| `/admin`                                                                       | `(admin)/admin/page.tsx`                    | redirect                                                  | none                                                                                                                       | none                 |
| `/admin/deals`, `/admin/deals/[id]`, `/admin/disputes`, `/admin/disputes/[id]` | `(admin)/admin/...`                         | app, flatter                                              | `AdminShell`, `Pager`, `admin/*`                                                                                           | Part 7               |
| `/dev/components`                                                              | `dev/components/page.tsx`                   | app                                                       | `dev/ComponentSheet`                                                                                                       | Part 2               |
| `/dev/login`                                                                   | `dev/login/page.tsx`                        | app, with the `.v3` header                                | `dev/DevLoginForm`, `SiteHeader`                                                                                           | Part 3               |
| `/dev/error`                                                                   | `dev/error/page.tsx`                        | throws on purpose                                         | none                                                                                                                       | none                 |

Shared pieces and the part that restyles them: `components/ui/*`, `components/lists/*`, `components/shell/*` and `app/styles/*` in Part 2.

## 7. Decisions

The ten open questions of the first version of this file, answered by the founder. They are settled, and they override anything above that reads differently.

1. **Lime in the app.** Lime may appear in the app only on the creator's money: the 30% and 70% amounts, "You receive" and the creator total, on both the brand's and the creator's screens. Always a fill under ink text, never text, an icon or a border. The fee stays ink. Statuses stay green.
2. **Display cut.** App screens use the condensed display cut only for the page title (the one `h1` per page). Section headings, body text and controls stay in the regular Bricolage Grotesque. The admin area does not use the display cut at all.
3. **Saffron.** Every saffron use maps to rani pink: primary action, hover and press, focus ring, current step, accent text and accent tint. Where saffron marked a "key money moment" that is the creator's money, lime is used as in decision 1. Any other money stays ink.
4. **Danger, warning and information.** Today's values stay (danger `#b42318`, warning `#8a5a00`, information `#2f4b7c`, each with its soft tint). Success uses the home page's green (`#17733e` on `#e1f2e7`). Danger must never be confused with rani pink: every danger state also carries an icon and words, and destructive buttons use the danger red, never pink. Every pairing is checked for contrast (section 2.2 and `apps/web/test/designTokens.test.ts`).
5. **Wordmark.** As on the home page: "Value" in the sans, "Skins" in the serif italic, in the pink accent text colour.
6. **Edges.** Inputs, checkboxes, radio buttons and outline pills get a darker edge, `--hm-line-field`, that reaches at least 3:1 against every ground they sit on. The home page's amount field and outline pills use it too. This is the one allowed visual change to the home page, because it fixes an accessibility gap.
7. **Radii.** One rule everywhere: anything you press is a pill; containers (cards, modals, sheets, panels) are 32px; things inside a container are 16px. Inputs follow the home page's amount field. The dense admin variant may use 16px for its cards and tables. The one exception is the 6px mark of a checkbox, which would otherwise become a circle and look like a radio button.
8. **Other colours.** The avatar and monogram tints move to the new palette with their ink at AA. `themeColor` is the page ground `#f3f3f0`. The Razorpay Checkout theme colour is the rani pink accent `#d6195f`.
9. **Public header.** Public pages use the home page's floating navigation bar (glass on scroll, Menu on phones), with the same links to the home page's sections and to `/how-it-works`. Every behaviour of today's public header stays: the Sign in button with its waking and "Try again" states, and the links. Public pages keep the shared footer. This is done in Part 3.
10. **Admin.** Admin keeps pink for its primary actions, so pink means "action" everywhere. Secondary admin actions are outline pills in ink. Destructive ones use the danger red. Admin keeps the plainer, denser layout.

## 8. Conflicts

Where other files disagree with the home page, or with each other. Nothing here has been changed.

- **SPEC section 18, opening paragraph.** Says the app uses one system "taken from the home page, the approved look". The tokens it names are saffron in `tokens.css`. The home page is rani pink and lime with its own tokens.
- **SPEC section 18, "Look" bullet.** Warm ground `#FBF8F4`, saffron `#C2410C`, near-black contrast sections, `#FF7A3D` on dark, radii 14, 18 and 24. The home page has a cool ground `#F3F3F0`, rani pink, no dark sections, and radii 32, 16 and pill.
- **SPEC section 18, sentence about `landing.css`.** Says the home page's styles are `landing.css` under `.v3`. The home page's styles are `home.css` under `.hm`. Only How it works and the public header still use `.v3`.
- **SPEC section 18, "Public pages".** Says How it works uses the home page's look and has a dark band. It uses `.v3` saffron.
- **SPEC section 18, focus ring.** The Look bullet says 3px. The Accessibility bullet says 2px. The code uses 3px.
- **SPEC section 18, header.** Says the home page has its own navigation and every other public page has `SiteHeader`. `SiteHeader` is the old `.v3` `Nav`, so public pages look unlike the home page.
- **`docs/DESIGN_HANDOFF.md`.** Marked superseded but describes a third look: vermilion `#D2340C`, cool grey ground, Geist and Geist Mono, 6px radii, no shadows, a 2px focus ring.
- **`apps/web/app/styles/tokens.css`, lines 3 to 5.** Says its values come from the home page, the approved look. They are saffron.
- **`apps/web/app/landing.css`.** Its header calls the saffron `.v3` look the approved home look. It also sets `html, body { overflow-x: clip }` globally, and its `.v3` rules may reach content inside `.hm` through the `(landing)/layout.tsx` wrapper.
- **`apps/web/app/(landing)/layout.tsx`.** Wraps the home page in `.v3` and says the tokens are the app's. The home page uses its own `--hm-*` tokens.
- **`apps/web/app/styles/shell.css`, lines 56 to 64.** Says the public header is the home page's own navigation. It is the old `Nav`.
- **`apps/web/components/landing/`.** `Nav.tsx`, `SignIn.tsx` and `screens/Screens.tsx` live here but use `.v3` classes and are used only by public pages.
- **`apps/web/lib/razorpay.ts`, line 90.** Checkout colour `#D2340C`, the old vermilion, matching neither saffron nor rani pink.
- **`apps/web/app/layout.tsx`.** `themeColor` is `#fbf8f4`. The home page paints `#f3f3f0`, so the browser chrome colour differs on `/`.
- **`apps/web/app/global-error.tsx`.** Hard-coded saffron and warm grounds.
- **Input edge contrast.** `.hm-calc-input`, `.hm-menu-btn` and `.hm-free li` use `--hm-line-strong`, 2.13:1 on `--hm-bg`, below the 3:1 SPEC asks for on input edges.
- **Not verified.** The home page's lighter radial highlights on `.hm-tile-money` and `.hm-cta-block` give about 2.8:1 to 2.9:1 against `--hm-on-accent`. The text sits in the darker part of the block, but this was read from the CSS and not checked in a rendered page.
- **Unused token.** `--hm-accent-mid` is declared and not used by any `.hm` rule.
- **Tests.** `homeStyles.test.ts` checks only `home.css`. Nothing checks `tokens.css`, `landing.css` or the documents against it.
