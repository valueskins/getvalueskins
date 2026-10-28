import { roleFromAccountType } from '@valueskins/shared';
import { Router } from 'express';
import { setSessionCookie } from '../auth/cookies.js';
import { createSession, toAuthenticatedUser } from '../auth/session.js';
import type { Env } from '../env/index.js';
import {
  buildAuthorizeUrl,
  computeEngagementRate,
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  fetchLatestMedia,
  fetchProfile,
} from './client.js';
import { AppError } from '../errors/AppError.js';
import { InstagramApiError, META_UNSUPPORTED_REQUEST_CODE, type InstagramStep } from './errors.js';
import { completeOnboardingIfReady } from '../onboarding/onboarding.service.js';
import { encryptInstagramToken } from './tokenEncryption.js';
import { clearOAuthStateCookie, setOAuthStateCookie, verifyOAuthState } from './state.js';
import { attachInstagramToUser, upsertInstagramLogin } from './upsertUser.js';

type RedirectErrorCode =
  | 'state_invalid'
  | 'instagram_failed'
  | 'account_type_unsupported'
  | 'account_type_change_blocked'
  | 'must_be_logged_in'
  | 'account_linked_elsewhere'
  | 'instagram_account_rejected';

function loginErrorRedirect(env: Env, code: RedirectErrorCode): string {
  const path = code === 'account_linked_elsewhere' ? '/settings' : '/login';
  return `${env.WEB_ORIGIN}${path}?error=${code}`;
}

/** Runs one of the callback's calls to Meta, and marks a failure with the step it happened at. */
async function atStep<T>(step: InstagramStep, call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    if (error instanceof InstagramApiError) error.step = step;
    throw error;
  }
}

/**
 * Meta's "Unsupported request" (code 100) after the code exchange worked: Instagram signed someone
 * in but will not serve that account to the app, which in practice is the wrong or a personal
 * account in this browser's Instagram session (SPEC 6.1).
 */
function isAccountRejected(error: InstagramApiError): boolean {
  return (
    (error.step === 'long_lived_exchange' || error.step === 'profile') &&
    error.metaCode === META_UNSUPPORTED_REQUEST_CODE
  );
}

/**
 * What the logs keep about a failed call to Meta: the step, Meta's error number, type, subcode and
 * trace id, and the HTTP status. Never a token, the sign-in code or a secret. The key names avoid
 * "code" and "token", which the log scrubber blanks out.
 */
export function instagramFailureLog(error: InstagramApiError) {
  return {
    step: error.step ?? 'unknown',
    metaNumber: error.metaCode ?? null,
    metaType: error.metaType ?? null,
    metaSubnumber: error.metaSubcode ?? null,
    fbtraceId: error.fbtraceId ?? null,
    httpStatus: error.httpStatus ?? null,
  };
}

export function instagramAuthRoutes(env: Env): Router {
  const router = Router();

  router.get('/api/auth/instagram/start', (req, res) => {
    const isLinkMode = req.query.link === '1';

    if (isLinkMode && !req.user) {
      res.redirect(loginErrorRedirect(env, 'must_be_logged_in'));
      return;
    }

    const nonce = setOAuthStateCookie(res, env, {
      mode: isLinkMode ? 'link' : 'login',
      linkUserId: isLinkMode ? req.user?.id : undefined,
    });

    res.redirect(buildAuthorizeUrl(env, nonce));
  });

  router.get('/api/auth/instagram/callback', async (req, res) => {
    const state = verifyOAuthState(req, env);
    clearOAuthStateCookie(res, env);

    if (req.query.error) {
      res.redirect(loginErrorRedirect(env, 'instagram_failed'));
      return;
    }
    if (!state) {
      res.redirect(loginErrorRedirect(env, 'state_invalid'));
      return;
    }

    const code = req.query.code;
    if (typeof code !== 'string') {
      res.redirect(loginErrorRedirect(env, 'instagram_failed'));
      return;
    }

    try {
      const shortLived = await atStep('code_exchange', () => exchangeCodeForToken(code, env));
      const longLived = await atStep('long_lived_exchange', () =>
        exchangeForLongLivedToken(shortLived.accessToken, env),
      );
      const profile = await atStep('profile', () => fetchProfile(longLived.accessToken));

      // Only Business (brand) and Creator (creator) accounts can sign in (REPLACEMENT_PLAN 2.3).
      if (roleFromAccountType(profile.accountType) === null) {
        res.redirect(loginErrorRedirect(env, 'account_type_unsupported'));
        return;
      }

      const media = await atStep('media', () => fetchLatestMedia(longLived.accessToken));
      const engagementRate = computeEngagementRate(media, profile.followersCount);
      const encryptedToken = encryptInstagramToken(longLived.accessToken, env);
      const tokenExpiresAt = new Date(Date.now() + longLived.expiresInSeconds * 1000);

      if (state.mode === 'link') {
        if (!state.linkUserId) {
          res.redirect(loginErrorRedirect(env, 'must_be_logged_in'));
          return;
        }
        await attachInstagramToUser({
          userId: state.linkUserId,
          profile,
          encryptedToken,
          tokenExpiresAt,
          engagementRate,
          env,
        });
        // Linking Instagram gives an email-only account its role, which may finish onboarding.
        await completeOnboardingIfReady(state.linkUserId);
        res.redirect(`${env.WEB_ORIGIN}/home`);
        return;
      }

      const user = await upsertInstagramLogin({
        profile,
        encryptedToken,
        tokenExpiresAt,
        engagementRate,
        env,
      });

      const userAgent = req.headers['user-agent'];
      const token = await createSession({
        userId: user.id,
        ip: req.ip,
        userAgent: typeof userAgent === 'string' ? userAgent : undefined,
      });
      setSessionCookie(res, env, token);

      const authUser = toAuthenticatedUser(user);
      res.redirect(
        authUser.onboardingCompletedAt ? `${env.WEB_ORIGIN}/home` : `${env.WEB_ORIGIN}/onboarding`,
      );
    } catch (error) {
      if (error instanceof AppError && error.code === 'INSTAGRAM_ACCOUNT_ALREADY_LINKED') {
        res.redirect(loginErrorRedirect(env, 'account_linked_elsewhere'));
        return;
      }
      if (error instanceof AppError && error.code === 'ACCOUNT_TYPE_UNSUPPORTED') {
        res.redirect(loginErrorRedirect(env, 'account_type_unsupported'));
        return;
      }
      if (error instanceof AppError && error.code === 'ACCOUNT_TYPE_CHANGE_BLOCKED') {
        res.redirect(loginErrorRedirect(env, 'account_type_change_blocked'));
        return;
      }
      if (error instanceof InstagramApiError) {
        req.log?.error(instagramFailureLog(error), 'instagram oauth callback failed');
        res.redirect(
          loginErrorRedirect(
            env,
            isAccountRejected(error) ? 'instagram_account_rejected' : 'instagram_failed',
          ),
        );
        return;
      }
      req.log?.error({ err: error }, 'instagram oauth callback failed');
      res.redirect(loginErrorRedirect(env, 'instagram_failed'));
    }
  });

  return router;
}
