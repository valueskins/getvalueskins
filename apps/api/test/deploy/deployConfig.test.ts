import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { envSchema } from '../../src/env/schema.js';

const REPO_ROOT = new URL('../../../../', import.meta.url);
const renderYaml = readFileSync(new URL('render.yaml', REPO_ROOT), 'utf8');
const deploymentDoc = readFileSync(new URL('docs/DEPLOYMENT.md', REPO_ROOT), 'utf8');

const ALL_ENV_KEYS = Object.keys(envSchema.shape);
// Injected by Render, or defaulted to empty and so safely omitted from the Blueprint.
const NOT_IN_BLUEPRINT = ['PORT', 'TEST_DATABASE_URL', 'COMPANY_GSTIN'];

function blueprintKeys(): string[] {
  return [...renderYaml.matchAll(/^\s*- key: ([A-Z_]+)\s*$/gm)].map((m) => m[1]!);
}

function blueprintValue(key: string): string | undefined {
  const match = renderYaml.match(new RegExp(`- key: ${key}\\n\\s+value: ["']?([^"'\\n]+)["']?`));
  return match?.[1];
}

describe('render.yaml', () => {
  it('lists every API env var the API requires at startup, so a new var cannot be forgotten', () => {
    const listed = blueprintKeys();
    const missing = ALL_ENV_KEYS.filter(
      (k) => !NOT_IN_BLUEPRINT.includes(k) && !listed.includes(k),
    );

    expect(missing).toEqual([]);
  });

  it('lists no unknown keys (other than Render own NODE_VERSION)', () => {
    const unknown = blueprintKeys().filter(
      (k) => k !== 'NODE_VERSION' && !ALL_ENV_KEYS.includes(k),
    );

    expect(unknown).toEqual([]);
  });

  it('has the staging values from the deployment spec', () => {
    expect(blueprintValue('NODE_ENV')).toBe('staging');
    expect(blueprintValue('WEB_ORIGIN')).toBe('https://staging.valueskins.com');
    expect(blueprintValue('COOKIE_DOMAIN')).toBe('.valueskins.com');
    expect(blueprintValue('SESSION_COOKIE_NAME')).toBe('vs_session_staging');
    expect(blueprintValue('EMAIL_TRANSPORT')).toBe('resend');
    expect(blueprintValue('ENABLE_DEV_LOGIN')).toBe('true');
    expect(blueprintValue('INSTAGRAM_REDIRECT_URI')).toBe(
      'https://api-staging.valueskins.com/api/auth/instagram/callback',
    );
  });

  it('keeps every secret out of the file (prompted with sync: false)', () => {
    for (const key of [
      'INSTAGRAM_APP_SECRET',
      'META_APP_SECRET',
      'RAZORPAY_KEY_SECRET',
      'RAZORPAY_WEBHOOK_SECRET',
      'RESEND_API_KEY',
    ]) {
      expect(renderYaml).toMatch(new RegExp(`- key: ${key}\\n\\s+sync: false`));
    }
    expect(renderYaml).not.toMatch(/rzp_(live|test)_[A-Za-z0-9]{6,}/);
  });

  it('is a paid, always-on service with health check and pre-deploy migrations', () => {
    expect(renderYaml).toMatch(/plan: 0\.5c-512mb/);
    expect(renderYaml).toMatch(/healthCheckPath: \/api\/health/);
    expect(renderYaml).toMatch(/preDeployCommand: .*db:migrate:deploy/);
    expect(renderYaml).toMatch(/domains:\n\s+- api-staging\.valueskins\.com/);
  });
});

describe('docs/DEPLOYMENT.md', () => {
  it('documents every API env var by name', () => {
    const missing = ALL_ENV_KEYS.filter((k) => !deploymentDoc.includes(k));

    expect(missing).toEqual([]);
  });

  it('documents the web env vars', () => {
    for (const key of [
      'NEXT_PUBLIC_API_URL',
      'NEXT_PUBLIC_RAZORPAY_KEY_ID',
      'NEXT_PUBLIC_ENABLE_DEV_LOGIN',
      'NEXT_PUBLIC_AUTH_EMAIL_ENABLED',
    ]) {
      expect(deploymentDoc).toContain(key);
    }
  });
});
