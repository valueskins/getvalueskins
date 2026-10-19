import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseEnv } from '../../src/env/parse.js';
import { envSchema } from '../../src/env/schema.js';
import { getStartupGuardViolations } from '../../src/env/startupGuards.js';
import { buildTestEnv } from '../testEnv.js';

const REPO_ROOT = new URL('../../../../', import.meta.url);
const renderYaml = readFileSync(new URL('render.yaml', REPO_ROOT), 'utf8');
const deploymentDoc = readFileSync(new URL('docs/DEPLOYMENT.md', REPO_ROOT), 'utf8');

const ALL_ENV_KEYS = Object.keys(envSchema.shape);
// Injected by Render, or defaulted and so safely omitted from the Blueprint.
const NOT_IN_BLUEPRINT = ['PORT', 'TEST_DATABASE_URL', 'DISPUTE_EMAIL'];

/** render.yaml split at each database and service: a chunk starts at `  - name:` or `  - type:`. */
const chunks = renderYaml.split(/^(?= {2}- (?:name|type): )/m);

function chunkNamed(kind: 'database' | 'service', name: string): string {
  const start = kind === 'service' ? '  - type: web' : '  - name:';
  const found = chunks.find(
    (c) => c.startsWith(start) && new RegExp(`^\\s*(?:- )?name: ${name}$`, 'm').test(c),
  );
  if (!found) throw new Error(`render.yaml has no ${kind} named ${name}`);
  return found;
}

const stagingApi = chunkNamed('service', 'valueskins-api-staging');
const productionApi = chunkNamed('service', 'valueskins-api');
const productionDb = chunkNamed('database', 'valueskins-db');

function keysIn(chunk: string): string[] {
  return [...chunk.matchAll(/^\s*- key: ([A-Z_]+)\s*$/gm)].map((m) => m[1]!);
}

/** The lines of one env var: after its `- key:` line, up to the next key or comment. */
function entryOf(chunk: string, key: string): string {
  const lines = chunk.split('\n');
  const at = lines.findIndex((l) => new RegExp(`^\\s*- key: ${key}\\s*$`).test(l));
  if (at === -1) throw new Error(`no ${key} in the chunk`);
  const body: string[] = [];
  for (const line of lines.slice(at + 1)) {
    if (/^\s*(- key:|#)/.test(line) || line.trim() === '') break;
    body.push(line);
  }
  return body.join('\n');
}

function valueIn(chunk: string, key: string): string | undefined {
  const match = chunk.match(new RegExp(`- key: ${key}\\n\\s+value: ["']?([^"'\\n]+)["']?`));
  return match?.[1];
}

const blueprintKeys = () => keysIn(renderYaml);
const blueprintValue = (key: string) => valueIn(stagingApi, key);

const RAZORPAY_KEYS = ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET'];

describe('render.yaml', () => {
  it('lists every API env var the API requires at startup, so a new var cannot be forgotten', () => {
    const listed = keysIn(stagingApi);
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
    expect(blueprintValue('AUTH_EMAIL_ENABLED')).toBe('true');
    // GST is charged (REPLACEMENT_PLAN 2.2), so the GSTIN is a value the human enters.
    expect(blueprintValue('GST_RATE_BPS')).toBe('1800');
    expect(stagingApi).toMatch(/- key: COMPANY_GSTIN\n\s+sync: false/);
    expect(blueprintValue('SUPPORT_EMAIL')).toBe('founder@valueskins.com');
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
      expect(stagingApi).toMatch(new RegExp(`- key: ${key}\\n\\s+sync: false`));
    }
    expect(renderYaml).not.toMatch(/rzp_(live|test)_[A-Za-z0-9]{6,}/);
  });

  it('is a paid, always-on service with health check and pre-deploy migrations', () => {
    expect(stagingApi).toMatch(/plan: 0\.5c-512mb/);
    expect(stagingApi).toMatch(/healthCheckPath: \/api\/health/);
    expect(stagingApi).toMatch(/preDeployCommand: .*db:migrate:deploy/);
    expect(stagingApi).toMatch(/domains:\n\s+- api-staging\.valueskins\.com/);
  });
});

describe('render.yaml: production (docs/DEPLOYMENT.md section 21)', () => {
  it('has a paid, backed-up database in Singapore, reachable only from inside Render', () => {
    expect(productionDb).toMatch(/plan: 0\.5c-1g/);
    expect(productionDb).not.toMatch(/plan: free/);
    expect(productionDb).toMatch(/region: singapore/);
    expect(productionDb).toMatch(/postgresMajorVersion: '16'/);
    expect(productionDb).toMatch(/ipAllowList: \[\]/);
  });

  it('is a paid, always-on API in Singapore with pre-deploy migrations, deployed by hand', () => {
    expect(productionApi).toMatch(/plan: 0\.5c-512mb/);
    expect(productionApi).toMatch(/region: singapore/);
    expect(productionApi).toMatch(/healthCheckPath: \/api\/health/);
    expect(productionApi).toMatch(/preDeployCommand: .*db:migrate:deploy/);
    expect(productionApi).toMatch(/domains:\n\s+- api\.valueskins\.com\n/);
    // Quoted: a bare `off` is the YAML boolean false.
    expect(productionApi).toMatch(/autoDeployTrigger: 'off'/);
  });

  it('reads its database from the production database, never the staging one', () => {
    expect(entryOf(productionApi, 'DATABASE_URL')).toContain('name: valueskins-db');
    expect(entryOf(stagingApi, 'DATABASE_URL')).toContain('name: valueskins-staging-db');
  });

  it('lists every API env var except the Razorpay ones, which are left out on purpose', () => {
    const listed = keysIn(productionApi);
    const missing = ALL_ENV_KEYS.filter(
      (k) => !NOT_IN_BLUEPRINT.includes(k) && !RAZORPAY_KEYS.includes(k) && !listed.includes(k),
    );

    expect(missing).toEqual([]);
    for (const key of RAZORPAY_KEYS) expect(listed).not.toContain(key);
  });

  it('has the production values', () => {
    const value = (key: string) => valueIn(productionApi, key);
    expect(value('NODE_ENV')).toBe('production');
    expect(value('COOKIE_DOMAIN')).toBe('.valueskins.com');
    expect(value('SESSION_COOKIE_NAME')).toBe('vs_session');
    expect(value('EMAIL_TRANSPORT')).toBe('resend');
    expect(value('SUPPORT_EMAIL')).toBe('founder@valueskins.com');
    expect(value('GST_RATE_BPS')).toBe('1800');
    expect(value('INSTAGRAM_REDIRECT_URI')).toBe(
      'https://api.valueskins.com/api/auth/instagram/callback',
    );
    // The variable has no default, so it is present and false (the guard refuses true).
    expect(value('ENABLE_DEV_LOGIN')).toBe('false');
    expect(value('AUTH_EMAIL_ENABLED')).toBe('false');
    // No staging value leaked in (comments may mention staging).
    expect(productionApi).not.toMatch(/^\s+value: .*staging/im);
  });

  it('keeps every secret out of the file: prompted with sync: false, or generated', () => {
    for (const key of [
      'INSTAGRAM_APP_ID',
      'INSTAGRAM_APP_SECRET',
      'META_APP_SECRET',
      'RESEND_API_KEY',
      'SENTRY_DSN',
    ]) {
      expect(entryOf(productionApi, key), key).toMatch(/sync: false/);
    }
    for (const key of ['SESSION_SECRET', 'TOKEN_ENCRYPTION_KEY']) {
      expect(entryOf(productionApi, key), key).toMatch(/generateValue: true/);
    }
  });

  it('leaves the values that change after launch to the dashboard (a Blueprint sync resets any value in this file)', () => {
    for (const key of [
      'PAYMENTS_MODE',
      'DEAL_POSTING_MODE',
      'ADMIN_INSTAGRAM_USER_IDS',
      'WEB_ORIGIN',
    ]) {
      expect(entryOf(productionApi, key), key).toMatch(/sync: false/);
      expect(entryOf(productionApi, key), key).not.toMatch(/value:/);
    }
  });

  /** What Render would hand the API: the file's values, plus what a person types at each prompt. */
  function productionEnv(prompted: Record<string, string> = {}): Record<string, string> {
    const typed: Record<string, string> = {
      WEB_ORIGIN: 'https://next.valueskins.com',
      INSTAGRAM_APP_ID: 'ci-instagram-app-id',
      INSTAGRAM_APP_SECRET: 'ci-instagram-app-secret',
      META_APP_SECRET: 'ci-meta-app-secret',
      RESEND_API_KEY: 'ci-resend-api-key',
      ADMIN_INSTAGRAM_USER_IDS: 'none',
      SENTRY_DSN: '',
      COMPANY_ADDRESS: '1 Example Road, Bengaluru',
      COMPANY_STATE: 'Karnataka',
      COMPANY_GSTIN: '29ABCDE1234F1Z5',
      COMMISSION_SAC_CODE: '998399',
      PAYMENTS_MODE: 'off',
      DEAL_POSTING_MODE: 'off',
      ...prompted,
    };
    const env: Record<string, string> = { PORT: '10000' };
    for (const key of keysIn(productionApi)) {
      const entry = entryOf(productionApi, key);
      if (/sync: false/.test(entry)) env[key] = typed[key] ?? '';
      else if (/generateValue: true/.test(entry)) env[key] = 'render-generated-value';
      else if (/fromDatabase:/.test(entry)) env[key] = 'postgres://user:pass@db:5432/valueskins';
      else env[key] = valueIn(productionApi, key) ?? '';
    }
    return env;
  }

  it('starts: the real env parser and startup guards accept it, closed, with no Razorpay variable', () => {
    const env = parseEnv(productionEnv());

    expect(getStartupGuardViolations(env)).toEqual([]);
    expect(env.NODE_ENV).toBe('production');
    expect([env.PAYMENTS_MODE, env.DEAL_POSTING_MODE]).toEqual(['off', 'off']);
    expect([env.RAZORPAY_KEY_ID, env.RAZORPAY_KEY_SECRET, env.RAZORPAY_WEBHOOK_SECRET]).toEqual([
      '',
      '',
      '',
    ]);
    expect(env.ENABLE_DEV_LOGIN).toBe(false);
    expect(env.AUTH_EMAIL_ENABLED).toBe(false);
  });

  it('still starts closed if both mode prompts are left blank', () => {
    const env = parseEnv(productionEnv({ PAYMENTS_MODE: '', DEAL_POSTING_MODE: '' }));

    expect([env.PAYMENTS_MODE, env.DEAL_POSTING_MODE]).toEqual(['off', 'off']);
    expect(getStartupGuardViolations(env)).toEqual([]);
  });

  it('does not start with payments opened before the live Razorpay values are added', () => {
    const env = parseEnv(productionEnv({ PAYMENTS_MODE: 'on' }));

    expect(getStartupGuardViolations(env)).toEqual(
      expect.arrayContaining([
        'RAZORPAY_KEY_ID is required when PAYMENTS_MODE is not "off" in production',
      ]),
    );
  });

  it('opening deal posting needs no Razorpay variable', () => {
    const env = parseEnv(productionEnv({ DEAL_POSTING_MODE: 'on' }));

    expect(getStartupGuardViolations(env)).toEqual([]);
  });
});

describe('docs/DEPLOYMENT.md', () => {
  it('documents every API env var by name', () => {
    const missing = ALL_ENV_KEYS.filter((k) => !deploymentDoc.includes(k));

    expect(missing).toEqual([]);
  });

  it('has a production section that names every production variable', () => {
    const start = deploymentDoc.indexOf('\n## 21. Production');
    expect(start).toBeGreaterThan(0);
    const section = deploymentDoc.slice(start);
    const missing = keysIn(productionApi).filter((k) => !section.includes(k));

    expect(missing).toEqual([]);
    // The two Vercel variables, and the three Razorpay ones it says are left out.
    for (const key of ['NEXT_PUBLIC_API_URL', 'NEXT_PUBLIC_SENTRY_DSN', ...RAZORPAY_KEYS]) {
      expect(section).toContain(key);
    }
  });

  it('documents the web env vars', () => {
    for (const key of ['NEXT_PUBLIC_API_URL', 'NEXT_PUBLIC_ENABLE_DEV_LOGIN']) {
      expect(deploymentDoc).toContain(key);
    }
  });

  it('no longer names the retired web env vars', () => {
    // Checkout takes its key from the fee order, and email sign-in follows GET /api/config.
    const webEnvExample = readFileSync(new URL('apps/web/.env.example', REPO_ROOT), 'utf8');
    for (const key of ['NEXT_PUBLIC_RAZORPAY_KEY_ID', 'NEXT_PUBLIC_AUTH_EMAIL_ENABLED']) {
      expect(deploymentDoc).not.toContain(key);
      expect(webEnvExample).not.toContain(key);
    }
  });
});

describe('SUPPORT_EMAIL (SPEC 21)', () => {
  it('is required in every environment, with no default in the schema', () => {
    for (const NODE_ENV of ['development', 'test', 'staging', 'production']) {
      expect(() => buildTestEnv({ NODE_ENV, SUPPORT_EMAIL: undefined }), NODE_ENV).toThrow(
        /SUPPORT_EMAIL/,
      );
    }
    expect(() => buildTestEnv({ SUPPORT_EMAIL: '' })).toThrow(/SUPPORT_EMAIL/);
    expect(() => buildTestEnv({ SUPPORT_EMAIL: 'not-an-address' })).toThrow(/SUPPORT_EMAIL/);
    expect(buildTestEnv({ SUPPORT_EMAIL: 'founder@valueskins.com' }).SUPPORT_EMAIL).toBe(
      'founder@valueskins.com',
    );
  });

  it('is defaulted nowhere: not in the code, and empty in .env.example', () => {
    const source = readFileSync(new URL('apps/api/src/env/schema.ts', REPO_ROOT), 'utf8');
    expect(source).toMatch(/SUPPORT_EMAIL: z\.string\(\)\.email\(\),/);
    const example = readFileSync(new URL('apps/api/.env.example', REPO_ROOT), 'utf8');
    expect(example).toMatch(/^SUPPORT_EMAIL=\s*$/m);
  });

  it('is documented as founder@valueskins.com for staging and production', () => {
    const section = deploymentDoc.slice(
      deploymentDoc.indexOf('**`SUPPORT_EMAIL` in every environment.**'),
    );
    expect(section.slice(0, 700)).toContain('`founder@valueskins.com` on staging');
    expect(section.slice(0, 700)).toContain('and in production');
    expect(deploymentDoc).toMatch(/\| `SUPPORT_EMAIL`\s+\| `founder@valueskins\.com`/);
  });
});
