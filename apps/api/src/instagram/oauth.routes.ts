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
  isProfessionalAccount,
} from './client.js';
import { AppError } from '../errors/AppError.js';
import { encryptInstagramToken } from './tokenEncryption.js';
import { clearOAuthStateCookie, setOAuthStateCookie, verifyOAuthState } from './state.js';
import { attachInstagramToUser, upsertInstagramLogin } from './upsertUser.js';

type RedirectErrorCode =
  | 'state_invalid'
  | 'instagram_failed'
  | 'professional_account_required'
  | 'must_be_logged_in'
  | 'account_linked_elsewhere';

function loginErrorRedirect(env: Env, code: RedirectErrorCode): string {
  const path = code === 'account_linked_elsewhere' ? '/settings' : '/login';
  return `${env.WEB_ORIGIN}${path}?error=${code}`;
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
      const shortLived = await exchangeCodeForToken(code, env);
      const longLived = await exchangeForLongLivedToken(shortLived.accessToken, env);
      const profile = await fetchProfile(longLived.accessToken);

      if (!isProfessionalAccount(profile)) {
        res.redirect(loginErrorRedirect(env, 'professional_account_required'));
        return;
      }

      const media = await fetchLatestMedia(longLived.accessToken);
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
      req.log?.error({ err: error }, 'instagram oauth callback failed');
      res.redirect(loginErrorRedirect(env, 'instagram_failed'));
    }
  });

  return router;
}
