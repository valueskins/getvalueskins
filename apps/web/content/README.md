# Page text

The Terms, Privacy, Refunds and How it works pages are rendered from these files at build time.

- The first `# ` line is the page title. The paragraph after it (for example "Last updated 8 Oct 2026") is shown under the title.
- Every `## ` heading is a section and gets an entry in the "Sections" list. Legal pages number them.
- Plain markdown only: paragraphs, `###` subheadings, lists, `**bold**` and links.

## Marking what this version does not do

When a passage describes something the app does not do yet, put a note right after it:

```
:::missing
There is no way to suspend an account in this version.
:::
```

The note is shown as a yellow "Not in this version" box on local and staging builds, so it can be reviewed. A build that points at the production API leaves it out. The passage itself always stays. `test/legal.test.tsx` lists every note, so adding or removing one shows up in review.
