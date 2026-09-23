import { describe, expect, it } from 'vitest';
import { dealContentLinkSchema } from './content.js';

describe('dealContentLinkSchema', () => {
  it('accepts a drive.google.com link', () => {
    expect(
      dealContentLinkSchema.safeParse({ link: 'https://drive.google.com/file/d/abc123/view' })
        .success,
    ).toBe(true);
  });

  it('accepts a docs.google.com link', () => {
    expect(
      dealContentLinkSchema.safeParse({ link: 'https://docs.google.com/document/d/abc123' })
        .success,
    ).toBe(true);
  });

  it('rejects a non-Google-Drive URL', () => {
    expect(dealContentLinkSchema.safeParse({ link: 'https://dropbox.com/s/abc123' }).success).toBe(
      false,
    );
  });

  it('rejects a non-URL string', () => {
    expect(dealContentLinkSchema.safeParse({ link: 'not a url' }).success).toBe(false);
  });
});
