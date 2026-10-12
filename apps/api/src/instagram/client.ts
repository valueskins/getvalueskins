import type { Env } from '../env/index.js';
import { InstagramApiError, throwForFailedResponse, throwIfMetaError } from './errors.js';

/** Meta's API responses are untyped external JSON — cast once at this single
 * trust boundary rather than scattering `any` through every call site below. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MetaJson = Record<string, any>;

async function parseJson(response: Response): Promise<MetaJson> {
  // A failed call can have an empty or HTML body (a rate limit, a gateway error): the caller still
  // needs to learn the status, so an unreadable body on a failure becomes {}.
  if (!response.ok) return (await response.json().catch(() => ({}))) as MetaJson;
  return (await response.json()) as MetaJson;
}

const AUTHORIZE_URL = 'https://www.instagram.com/oauth/authorize';
const CODE_EXCHANGE_URL = 'https://api.instagram.com/oauth/access_token';
const LONG_LIVED_EXCHANGE_URL = 'https://graph.instagram.com/access_token';
const REFRESH_URL = 'https://graph.instagram.com/refresh_access_token';
const PROFILE_URL = 'https://graph.instagram.com/me';
const MEDIA_URL = 'https://graph.instagram.com/me/media';

export const INSTAGRAM_SCOPE = 'instagram_business_basic';

export function buildAuthorizeUrl(env: Env, state: string): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set('client_id', env.INSTAGRAM_APP_ID);
  url.searchParams.set('redirect_uri', env.INSTAGRAM_REDIRECT_URI);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', INSTAGRAM_SCOPE);
  url.searchParams.set('state', state);
  return url.toString();
}

export interface ShortLivedToken {
  accessToken: string;
  userId: string;
}

export async function exchangeCodeForToken(code: string, env: Env): Promise<ShortLivedToken> {
  const body = new URLSearchParams({
    client_id: env.INSTAGRAM_APP_ID,
    client_secret: env.INSTAGRAM_APP_SECRET,
    grant_type: 'authorization_code',
    redirect_uri: env.INSTAGRAM_REDIRECT_URI,
    code,
  });

  const response = await fetch(CODE_EXCHANGE_URL, { method: 'POST', body });
  const json = await parseJson(response);
  if (!response.ok) {
    throw new InstagramApiError(
      typeof json?.error_message === 'string' ? json.error_message : 'Code exchange failed',
    );
  }
  throwIfMetaError(json);

  return { accessToken: json.access_token, userId: String(json.user_id) };
}

export interface LongLivedToken {
  accessToken: string;
  expiresInSeconds: number;
}

export async function exchangeForLongLivedToken(
  shortLivedToken: string,
  env: Env,
): Promise<LongLivedToken> {
  const url = new URL(LONG_LIVED_EXCHANGE_URL);
  url.searchParams.set('grant_type', 'ig_exchange_token');
  url.searchParams.set('client_secret', env.INSTAGRAM_APP_SECRET);
  url.searchParams.set('access_token', shortLivedToken);

  const response = await fetch(url);
  const json = await parseJson(response);
  if (!response.ok) throwForFailedResponse(json, response.status);

  return { accessToken: json.access_token, expiresInSeconds: json.expires_in };
}

/** Reserved for the future daily-cron refresh (SPEC 6.1: "refreshed when it
 * has less than 10 days left") — not called from the login/link flow, which
 * always mints a brand-new long-lived token via exchangeForLongLivedToken. */
export async function refreshLongLivedToken(currentToken: string): Promise<LongLivedToken> {
  const url = new URL(REFRESH_URL);
  url.searchParams.set('grant_type', 'ig_refresh_token');
  url.searchParams.set('access_token', currentToken);

  const response = await fetch(url);
  const json = await parseJson(response);
  if (!response.ok) throwForFailedResponse(json, response.status);

  return { accessToken: json.access_token, expiresInSeconds: json.expires_in };
}

export interface InstagramProfile {
  userId: string;
  username: string;
  name: string | null;
  /** BUSINESS or MEDIA_CREATOR are accepted (roleFromAccountType); the API may send other values or none. */
  accountType: string | undefined;
  profilePictureUrl: string | null;
  followersCount: number;
  followsCount: number;
  mediaCount: number;
  biography: string | null;
}

export async function fetchProfile(accessToken: string): Promise<InstagramProfile> {
  const url = new URL(PROFILE_URL);
  url.searchParams.set(
    'fields',
    'user_id,username,name,account_type,profile_picture_url,followers_count,follows_count,media_count,biography',
  );
  url.searchParams.set('access_token', accessToken);

  const response = await fetch(url);
  const json = await parseJson(response);
  if (!response.ok) throwForFailedResponse(json, response.status);

  return {
    userId: String(json.user_id),
    username: json.username,
    name: json.name ?? null,
    accountType: json.account_type,
    profilePictureUrl: json.profile_picture_url ?? null,
    followersCount: json.followers_count ?? 0,
    followsCount: json.follows_count ?? 0,
    mediaCount: json.media_count ?? 0,
    biography: json.biography ?? null,
  };
}

export interface MediaEngagement {
  likeCount: number;
  commentsCount: number;
}

export async function fetchLatestMedia(accessToken: string): Promise<MediaEngagement[]> {
  const url = new URL(MEDIA_URL);
  url.searchParams.set('fields', 'id,like_count,comments_count,timestamp');
  url.searchParams.set('limit', '12');
  url.searchParams.set('access_token', accessToken);

  const response = await fetch(url);
  const json = await parseJson(response);
  if (!response.ok) throwForFailedResponse(json, response.status);

  const items = Array.isArray(json.data) ? json.data : [];
  return items.map((item: { like_count?: number; comments_count?: number }) => ({
    likeCount: item.like_count ?? 0,
    commentsCount: item.comments_count ?? 0,
  }));
}

/** SPEC 6.1: average of (likes + comments) over the latest 12 media, divided
 * by followers, as a percentage with 2 decimals. Null if fewer than 3 posts
 * or 0 followers. */
export function computeEngagementRate(
  media: MediaEngagement[],
  followersCount: number,
): number | null {
  if (media.length < 3 || followersCount <= 0) return null;

  const totalEngagement = media.reduce((sum, m) => sum + m.likeCount + m.commentsCount, 0);
  const averageEngagement = totalEngagement / media.length;
  const rate = (averageEngagement / followersCount) * 100;

  return Math.round(rate * 100) / 100;
}
