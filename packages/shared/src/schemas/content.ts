import { z } from 'zod';

export const GOOGLE_DRIVE_URL_REGEX = /^https:\/\/(drive|docs)\.google\.com\//;

export const dealContentLinkSchema = z
  .object({
    link: z.string().url().regex(GOOGLE_DRIVE_URL_REGEX, 'Must be a Google Drive link'),
  })
  .strict();

export type DealContentLinkInput = z.infer<typeof dealContentLinkSchema>;
