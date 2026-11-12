import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { parseEnv } from '../../src/env/parse.js';
import { envSchema } from '../../src/env/schema.js';
import { getStartupGuardViolations } from '../../src/env/startupGuards.js';
import { buildTestEnv } from '../testEnv.js';

const REPO_ROOT = new URL('../../../../', import.meta.url);
const renderYaml = readFileSync(new URL('render.yaml', REPO_ROOT), 'utf8');
const deploymentDoc = readFileSync(new URL('docs/DEPLOYMENT.md', REPO_ROOT), 'utf8');
const specDoc = readFileSync(new URL('docs/SPEC.md', REPO_ROOT), 'utf8');
const cutoverDoc = readFileSync(new URL('docs/CUTOVER.md', REPO_ROOT), 'utf8');
const netlifyToml = readFileSync(new URL('apps/web/netlify.toml', REPO_ROOT), 'utf8');
const deployWorkflow = readFileSync(
  new URL('.github/workflows/deploy-web-production.yml', REPO_ROOT),
  'utf8',
);

const backupWorkflow = readFileSync(new URL('.github/workflows/backup.yml', REPO_ROOT), 'utf8');
const runbookDoc = readFileSync(new URL('docs/RUNBOOK.md', REPO_ROOT), 'utf8');

const ALL_ENV_KEYS = Object.keys(envSchema.shape);
// Injected by Render, or defaulted and so safely omitted from the Blueprint.
const NOT_IN_BLUEPRINT = ['PORT', 'TEST_DATABASE_URL', 'DISPUTE_EMAIL'];

/** The one service in render.yaml, from its `- type:` line to the end of the file. */
const productionApi = renderYaml.slice(renderYaml.indexOf('  - type: web'));

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

/** A line of the file that is not a comment, so a comment may mention what it forbids. */
function codeLines(text: string): string[] {
  return text.split('\n').filter((l) => !/^\s*#/.test(l));
}

const RAZORPAY_KEYS = ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET'];
const NEON_DIRECT =
  'postgresql://owner:pw@ep-cool-darkness-123456.ap-southeast-1.aws.neon.tech/valueskins?sslmode=require';

describe('render.yaml: production only, on free hosting (docs/DEPLOYMENT.md section 21)', () => {
  it('defines production only: one service, no Render database, and no staging', () => {
    const code = codeLines(renderYaml).join('\n');
    expect([...code.matchAll(/^\s*- type: /gm)]).toHaveLength(1);
    expect(code).toMatch(/^\s+name: valueskins-api$/m);
    expect(code).not.toMatch(/^databases:/m);
    expect(code).not.toMatch(/fromDatabase/);
    expect(code).not.toMatch(/staging/i);
  });

  it('is Render free, in Singapore, with a health check and the production domain', () => {
    expect(productionApi).toMatch(/^\s+plan: free$/m);
    expect(productionApi).toMatch(/^\s+region: singapore$/m);
    // Never /api/health: that queries the database and sits behind the rate limiter, which would
    // keep the free Neon database awake all day (docs/DEPLOYMENT.md section 21.8).
    expect(productionApi).toMatch(/healthCheckPath: \/healthz$/m);
    expect(productionApi).toMatch(/domains:\n\s+- api\.valueskins\.com\n/);
    // Quoted: a bare `off` is the YAML boolean false.
    expect(productionApi).toMatch(/autoDeployTrigger: 'off'/);
  });

  it('has no pre-deploy command, and nothing that migrates in the build or on start', () => {
    const code = codeLines(productionApi);
    expect(code.join('\n')).not.toMatch(/preDeployCommand/);
    for (const key of ['buildCommand', 'startCommand']) {
      const line = code.find((l) => l.trim().startsWith(`${key}:`));
      expect(line, key).toBeDefined();
      expect(line, key).not.toMatch(/migrat/i);
    }
  });

  it('lists every API env var except the Razorpay ones, which are left out on purpose', () => {
    const listed = keysIn(productionApi);
    const missing = ALL_ENV_KEYS.filter(
      (k) => !NOT_IN_BLUEPRINT.includes(k) && !RAZORPAY_KEYS.includes(k) && !listed.includes(k),
    );

    expect(missing).toEqual([]);
    for (const key of RAZORPAY_KEYS) expect(listed).not.toContain(key);
  });

  it('lists no unknown keys (other than Render own NODE_VERSION)', () => {
    const unknown = keysIn(renderYaml).filter(
      (k) => k !== 'NODE_VERSION' && !ALL_ENV_KEYS.includes(k),
    );

    expect(unknown).toEqual([]);
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
  });

  it('keeps every secret out of the file: prompted with sync: false, or generated', () => {
    for (const key of [
      'DATABASE_URL',
      'INSTAGRAM_APP_ID',
      'INSTAGRAM_APP_SECRET',
      'META_APP_SECRET',
      'RESEND_API_KEY',
      'BREVO_API_KEY',
      'SENTRY_DSN',
    ]) {
      expect(entryOf(productionApi, key), key).toMatch(/sync: false/);
    }
    for (const key of ['SESSION_SECRET', 'TOKEN_ENCRYPTION_KEY']) {
      expect(entryOf(productionApi, key), key).toMatch(/generateValue: true/);
    }
    expect(renderYaml).not.toMatch(/rzp_(live|test)_[A-Za-z0-9]{6,}/);
    expect(renderYaml).not.toMatch(/postgres(ql)?:\/\/[^\s]*:[^\s]*@/);
  });

  it('leaves the values that change after launch to the dashboard (a Blueprint sync resets any value in this file)', () => {
    for (const key of [
      'DATABASE_URL',
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
      DATABASE_URL: NEON_DIRECT,
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

  it('starts with both gates "on" on free hosting, once the live Razorpay values are set', () => {
    const env = parseEnv({
      ...productionEnv({ PAYMENTS_MODE: 'on', DEAL_POSTING_MODE: 'on' }),
      RAZORPAY_KEY_ID: 'rzp_live_x',
      RAZORPAY_KEY_SECRET: 'secret',
      RAZORPAY_WEBHOOK_SECRET: 'whsec',
    });

    expect(getStartupGuardViolations(env)).toEqual([]);
  });

  it('starts with the gates open to admins on free hosting, once the live Razorpay values are set', () => {
    // The Razorpay values are not in the blueprint: the person adds them in the dashboard (16a).
    const env = parseEnv({
      ...productionEnv({ PAYMENTS_MODE: 'admins', DEAL_POSTING_MODE: 'admins' }),
      RAZORPAY_KEY_ID: 'rzp_live_x',
      RAZORPAY_KEY_SECRET: 'secret',
      RAZORPAY_WEBHOOK_SECRET: 'whsec',
    });

    expect(getStartupGuardViolations(env)).toEqual([]);
  });

  it('does not start on a pooled Neon host, or without TLS', () => {
    const pooled = NEON_DIRECT.replace('-123456.', '-123456-pooler.');
    expect(
      getStartupGuardViolations(parseEnv(productionEnv({ DATABASE_URL: pooled }))).join(' '),
    ).toContain('-pooler');
    expect(
      getStartupGuardViolations(
        parseEnv(productionEnv({ DATABASE_URL: NEON_DIRECT.replace('?sslmode=require', '') })),
      ).join(' '),
    ).toContain('sslmode=require');
  });

  it('payments "on" still need the live Razorpay values', () => {
    const env = parseEnv(productionEnv({ PAYMENTS_MODE: 'on' }));

    expect(getStartupGuardViolations(env)).toEqual(
      expect.arrayContaining([
        'RAZORPAY_KEY_ID is required when PAYMENTS_MODE is not "off" in production',
      ]),
    );
  });

  it('opening deal posting "on" needs no Razorpay variable', () => {
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
    // The two web variables (GitHub Actions in production), and the three Razorpay ones it says are left out.
    for (const key of ['NEXT_PUBLIC_API_URL', 'NEXT_PUBLIC_SENTRY_DSN', ...RAZORPAY_KEYS]) {
      expect(section).toContain(key);
    }
  });

  it('describes the free production setup: Neon, the direct string, manual migrations, moving to paid', () => {
    const section = deploymentDoc.slice(deploymentDoc.indexOf('\n## 21. Production'));
    for (const text of [
      'Neon',
      '-pooler',
      'sslmode=require',
      'read -rs',
      'db:migrate',
      'Moving to paid',
      'sleeps',
    ]) {
      expect(section, text).toContain(text);
    }
  });

  it('says the staging services are managed by hand and are not in render.yaml', () => {
    expect(deploymentDoc).toContain('Staging is managed by hand');
    expect(renderYaml).toContain('Staging is managed by hand');
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

describe('netlify.toml: the production web app, with no Git link (docs/DEPLOYMENT.md section 21.6)', () => {
  const code = codeLines(netlifyToml).join('\n');

  it('builds the shared package, then the app, and publishes the Next.js build', () => {
    const command = code.match(/^\s*command = "(.*)"$/m)?.[1] ?? '';
    expect(command.indexOf('packages/*')).toBeGreaterThanOrEqual(0);
    expect(command.indexOf('packages/*')).toBeLessThan(command.indexOf('@valueskins/web'));
    expect(command).toContain('run build');
    // Run from the repo root with --filter, so the publish path is relative to the root.
    expect(command).not.toMatch(/\bcd\b/);
    expect(code).toMatch(/^\s*publish = "apps\/web\/\.next"$/m);
  });

  it('uses Node 22 and the Next.js runtime', () => {
    expect(code).toMatch(/^\[build\.environment\]\n\s+NODE_VERSION = "22"$/m);
    expect(code).toMatch(/^\[\[plugins\]\]\n\s+package = "@netlify\/plugin-nextjs"$/m);
  });

  it('has no Git, branch, preview or ignore settings, and no environment values', () => {
    expect(code).not.toMatch(/\[context/);
    expect(code).not.toMatch(/^\s*(ignore|branch|repo|production_branch|base) *=/m);
    expect(code).not.toMatch(/NEXT_PUBLIC_|NETLIFY_|SENTRY|rzp_/);
    expect(code).not.toMatch(/\[build\.environment\][^[]*(?:\n\s+[A-Z_]+ = [^\n]*){2,}/);
  });

  it('is production only: vercel.json stays for staging and says nothing of Netlify', () => {
    const vercel = readFileSync(new URL('apps/web/vercel.json', REPO_ROOT), 'utf8');
    expect(vercel).toContain('"framework": "nextjs"');
    expect(vercel).not.toMatch(/netlify/i);
    expect(deploymentDoc).toMatch(/`apps\/web\/vercel\.json` is for \*\*staging only\*\*/);
  });
});

describe('deploy-web-production workflow (docs/DEPLOYMENT.md section 21.6)', () => {
  const code = codeLines(deployWorkflow).join('\n');
  const stepsBlock = code.slice(code.indexOf('    steps:\n') + '    steps:\n'.length);
  const steps = stepsBlock
    .split(/\n {6}- (?=name:|uses:)/)
    .map((t, i) => (i === 0 ? t.replace(/^ {6}- /, '') : t));
  const step = (name: string) => {
    const found = steps.find((t) => t.includes(name));
    if (!found) throw new Error(`no step "${name}"`);
    return found;
  };
  const DEPLOY = 'Build and deploy to Netlify';
  const PREVIEW = 'Build and deploy a preview to Netlify';
  const CI_CHECK = 'Confirm CI passed for this commit';
  const MAIN_ONLY = 'Refuse anything but main';
  const before = (first: string, second: string) =>
    expect(stepsBlock.indexOf(first), `${first} before ${second}`).toBeLessThan(
      stepsBlock.indexOf(second),
    );

  it('runs only when started by hand, with a preview or production choice that defaults to preview', () => {
    const on = code.slice(code.indexOf('\non:\n'), code.indexOf('\npermissions:'));
    expect(on).toMatch(/^\s*on:\n {2}workflow_dispatch:\n {4}inputs:\n {6}target:/);
    expect(on).toContain('type: choice');
    expect(on).toContain('options: [preview, production]');
    expect(on).toContain('default: preview');
    // Those triggers, as keys (the CI check below mentions `workflow_runs`, the API's own word).
    expect(on).not.toMatch(/workflow_run:|pull_request|schedule:|push:|repository_dispatch/);
    // The CI workflow it checks is called CI, lives in ci.yml and runs on pushes to main.
    const ci = readFileSync(new URL('.github/workflows/ci.yml', REPO_ROOT), 'utf8');
    expect(ci).toMatch(/^name: CI$/m);
    expect(ci).toMatch(/push:\n\s+branches: \[main\]/);
  });

  it('is never run for a fork, and fails loudly unless it was started from main', () => {
    const condition = code.slice(code.indexOf('    if: >-'), code.indexOf('    runs-on:'));
    expect(condition).toContain("github.event_name == 'workflow_dispatch'");
    expect(condition).toContain('github.event.repository.fork == false');
    const main = step(MAIN_ONLY);
    expect(main).toContain('"$GITHUB_REF" != "refs/heads/main"');
    expect(main).toContain('::error::');
    expect(main).toContain('exit 1');
    expect(stepsBlock.trimStart().startsWith(`- name: ${MAIN_ONLY}`)).toBe(true);
  });

  it('asks the GitHub API, with the workflow token, whether CI succeeded for this exact commit', () => {
    const check = step(CI_CHECK);
    expect(check).toContain('GH_TOKEN: ${{ github.token }}');
    expect(check).toContain('gh api');
    expect(check).toContain('actions/workflows/ci.yml/runs?head_sha=$GITHUB_SHA');
    expect(check).toContain('event=push&branch=main');
    // Only runs of this repository count, and only the newest one.
    expect(check).toContain('env.GITHUB_REPOSITORY');
    expect(check).toContain('.[0]');
    // Anything but a success stops the deploy, and says what to do.
    expect(check).toContain('"$result" != "success"');
    expect(check).toContain('::error::');
    expect(check).toContain('exit 1');
  });

  it('checks main and CI before it reads a secret, builds or deploys anything', () => {
    before(MAIN_ONLY, CI_CHECK);
    before(CI_CHECK, 'actions/checkout');
    before(CI_CHECK, 'Check the deploy inputs');
    before(CI_CHECK, 'Install dependencies');
    before(CI_CHECK, PREVIEW);
    before(CI_CHECK, DEPLOY);
    expect(step(MAIN_ONLY)).not.toMatch(/secrets\./);
    expect(step(CI_CHECK)).not.toMatch(/secrets\.|vars\./);
  });

  it('has read-only access: contents and actions read, nothing written, no stored credentials', () => {
    expect(code).toMatch(/^permissions:\n {2}contents: read\n {2}actions: read\n/m);
    expect(code).not.toMatch(/: write/);
    expect(step('actions/checkout')).toContain('persist-credentials: false');
  });

  it('builds exactly the commit that was checked, and has no change detection left', () => {
    expect(step('actions/checkout')).toContain('ref: ${{ github.sha }}');
    expect(code).toContain('DEPLOY_SHA: ${{ github.sha }}');
    expect(code).not.toMatch(/fetch-depth|git diff|steps\.changes|workflow_run\.head_sha/);
  });

  it('uses Node 22 and pnpm with the frozen lockfile, like CI', () => {
    expect(step('actions/setup-node')).toMatch(/node-version: 22\n\s+cache: pnpm/);
    expect(step('pnpm/action-setup')).toContain('pnpm/action-setup@v4');
    expect(step('Install dependencies')).toContain('pnpm install --frozen-lockfile');
  });

  it('builds the shared package, then deploys with the pinned Netlify CLI', () => {
    before('Install dependencies', 'Build the shared package');
    before('Build the shared package', PREVIEW);
    before('Build the shared package', DEPLOY);
    expect(step('Build the shared package')).toContain('pnpm --filter "./packages/*" run build');
    for (const name of [PREVIEW, DEPLOY]) {
      const deploy = step(name).replace(/\s+/g, ' ');
      expect(deploy, name).toMatch(/--package=netlify-cli@\d+\.\d+\.\d+ dlx netlify deploy/);
      expect(deploy, name).toContain('--filter @valueskins/web');
      // `netlify deploy` builds by default (the Next.js runtime needs that); never skip it.
      expect(deploy, name).not.toContain('--no-build');
      expect(deploy, name).not.toContain('--trigger');
    }
    // The same CLI version in both.
    const versions = [PREVIEW, DEPLOY].map((n) => step(n).match(/netlify-cli@([\d.]+)/)![1]);
    expect(versions[0]).toBe(versions[1]);
  });

  it('puts the live site behind target production, and the preview behind target preview', () => {
    const production = step(DEPLOY).replace(/\s+/g, ' ');
    expect(step(DEPLOY)).toContain("if: inputs.target == 'production'");
    for (const flag of ['--prod', '--context production']) {
      expect(production, flag).toContain(flag);
    }
    const preview = step(PREVIEW).replace(/\s+/g, ' ');
    expect(step(PREVIEW)).toContain("if: inputs.target == 'preview'");
    // A draft deploy: no --prod, so it never reaches the live site.
    expect(preview).not.toMatch(/--prod\b/);
    expect(preview).not.toContain('--context production');
  });

  it('reads the two secrets and the two variables by the documented names', () => {
    for (const name of [PREVIEW, DEPLOY]) {
      const env = step(name);
      for (const line of [
        'NETLIFY_AUTH_TOKEN: ${{ secrets.NETLIFY_AUTH_TOKEN }}',
        'NETLIFY_SITE_ID: ${{ secrets.NETLIFY_SITE_ID }}',
        'NEXT_PUBLIC_API_URL: ${{ vars.NEXT_PUBLIC_API_URL }}',
        'NEXT_PUBLIC_SENTRY_DSN: ${{ vars.NEXT_PUBLIC_SENTRY_DSN }}',
      ]) {
        expect(env, `${name}: ${line}`).toContain(line);
      }
    }
    for (const name of [
      'NETLIFY_AUTH_TOKEN',
      'NETLIFY_SITE_ID',
      'NEXT_PUBLIC_API_URL',
      'NEXT_PUBLIC_SENTRY_DSN',
    ]) {
      expect(deploymentDoc.slice(deploymentDoc.indexOf('\n## 21. Production')), name).toContain(
        name,
      );
    }
  });

  it('never prints a secret, and only the input check and the two deploy steps can see them', () => {
    const seeing = steps.filter((t) => /\$\{\{ secrets\./.test(t));
    expect(seeing.map((t) => t.match(/name: (.*)/)![1])).toEqual([
      'Check the deploy inputs',
      PREVIEW,
      DEPLOY,
    ]);
    // The install step runs the packages' own scripts: no secret and no variable there.
    expect(step('Install dependencies')).not.toMatch(/secrets\.|vars\./);
    expect(code.slice(0, code.indexOf('    steps:'))).not.toMatch(/secrets\./);
    expect(code).not.toMatch(/--auth\b/);
    expect(code).not.toMatch(/set -x|printenv|\benv \||\bcurl\b|ACTIONS_STEP_DEBUG/);
    for (const line of code.split('\n').filter((l) => /\becho\b/.test(l))) {
      expect(line, line).not.toMatch(/NETLIFY_AUTH_TOKEN|NETLIFY_SITE_ID|SENTRY_DSN|secrets\./);
    }
  });

  it('never sets the dev login flag', () => {
    expect(code).not.toContain('NEXT_PUBLIC_ENABLE_DEV_LOGIN');
  });

  it('stops early, by name only, on a missing input or any API address but the production one', () => {
    const check = step('Check the deploy inputs');
    for (const name of ['NETLIFY_AUTH_TOKEN', 'NETLIFY_SITE_ID', 'NEXT_PUBLIC_API_URL']) {
      expect(check, name).toContain(name);
    }
    expect(check).toContain('"$NEXT_PUBLIC_API_URL" != "https://api.valueskins.com"');
    expect(check).toContain('::error::');
    expect(check).toContain('exit 1');
    // It runs for a preview too, which is built with the production settings.
    expect(check).not.toContain('if:');
    before('Check the deploy inputs', PREVIEW);
  });

  it('is documented: the budget, the preview first, and how to start a deploy', () => {
    const section = deploymentDoc.slice(
      deploymentDoc.indexOf('### 21.6'),
      deploymentDoc.indexOf('### 21.7'),
    );
    expect(section).toContain('Run workflow');
    expect(section).toMatch(/at most 8 production deploys a month/i);
    expect(section).toMatch(/checked first on a (free )?preview/i);
    expect(section).toContain('CI has not succeeded');
    expect(section).not.toMatch(/after the \*\*CI\*\* workflow finishes/);
    // The spec says the same: by hand, from main, with the CI check, and no change detection.
    expect(specDoc).toContain('started by hand (`workflow_dispatch`) from `main`');
    expect(specDoc).not.toMatch(/deploys only when the merge changed/);
    expect(specDoc).not.toMatch(/runs only after CI passes on a push to `main`/);
  });
});

describe('the production web build guard still applies on Netlify', () => {
  it('next.config.ts runs it on every build, which `netlify deploy` performs', () => {
    const config = readFileSync(new URL('apps/web/next.config.ts', REPO_ROOT), 'utf8');
    expect(config).toContain('assertSafeWebEnv(process.env);');
  });

  it('refuses dev login with the production API, and accepts the environment the workflow passes', async () => {
    const { assertSafeWebEnv } = (await import('../../../web/lib/env.ts')) as {
      assertSafeWebEnv: (env: Record<string, string | undefined>) => void;
    };
    const fromWorkflow = {
      NEXT_PUBLIC_API_URL: 'https://api.valueskins.com',
      NEXT_PUBLIC_SENTRY_DSN: 'https://k@o9.ingest.sentry.io/1',
    };
    expect(() => assertSafeWebEnv(fromWorkflow)).not.toThrow();
    // For example a variable someone added in the Netlify site settings.
    expect(() =>
      assertSafeWebEnv({ ...fromWorkflow, NEXT_PUBLIC_ENABLE_DEV_LOGIN: 'true' }),
    ).toThrow(/NEXT_PUBLIC_ENABLE_DEV_LOGIN/);
  });
});

describe('the Netlify docs (DEPLOYMENT.md section 21.6, CUTOVER.md A7, C3, F)', () => {
  const section = deploymentDoc.slice(deploymentDoc.indexOf('\n## 21. Production'));

  it('DEPLOYMENT.md explains the site, the credentials, the credits and the rollback', () => {
    for (const text of [
      'no Git link',
      'Site ID',
      'Personal access tokens',
      'NETLIFY_AUTH_TOKEN',
      'NETLIFY_SITE_ID',
      'NEXT_PUBLIC_API_URL',
      'NEXT_PUBLIC_SENTRY_DSN',
      'Do not add environment variables in the Netlify site settings',
      '300 credits',
      '| One **production deploy**                     | 15',
      'Site not available',
      'paused',
      'Publish deploy',
      'Re-run all jobs',
    ]) {
      expect(section, text).toContain(text);
    }
  });

  it('DEPLOYMENT.md no longer sends production to a Vercel project', () => {
    expect(section).not.toContain('### 21.6 The Vercel project');
    expect(section).not.toMatch(/Rolling back the web\.\*\* Vercel/);
  });

  it('CUTOVER.md sets up next.valueskins.com on Netlify and moves the apex and www through Cloudflare', () => {
    for (const text of [
      '<site name>.netlify.app',
      '`next` as a CNAME',
      'apex-loadbalancer.netlify.com',
      '75.2.60.5',
      '**DNS only**',
      'primary domain',
      'Remove `valueskins.com` and `www.valueskins.com`',
    ]) {
      expect(cutoverDoc, text).toContain(text);
    }
  });

  it('CUTOVER.md rollback puts the Cloudflare records back and re-adds the domains on the old Vercel project', () => {
    const rollback = cutoverDoc.slice(
      cutoverDoc.indexOf('\n## F. Rollback'),
      cutoverDoc.indexOf('\n## G.'),
    );
    expect(rollback).toContain(
      'put the apex and `www` records back to the values in the rollback sheet',
    );
    expect(rollback).toContain(
      'remove `valueskins.com` and `www.valueskins.com` from the Netlify site',
    );
    expect(rollback).toContain('in the old Vercel project add them back');
  });
});

describe('backup workflow (docs/DEPLOYMENT.md section 21.12)', () => {
  const code = codeLines(backupWorkflow).join('\n');
  const stepsBlock = code.slice(code.indexOf('    steps:\n') + '    steps:\n'.length);
  const steps = stepsBlock
    .split(/\n {6}- (?=name:|uses:)/)
    .map((t, i) => (i === 0 ? t.replace(/^ {6}- /, '') : t));
  const step = (name: string) => {
    const found = steps.find((t) => t.includes(name));
    if (!found) throw new Error(`no step "${name}"`);
    return found;
  };
  const MAIN_ONLY = 'Refuse anything but main';
  const INPUTS = 'Check the backup inputs';
  const INSTALL = 'Install the PostgreSQL client and age';
  const DUMP = 'Dump the database';
  const ENCRYPT = 'Encrypt the dump with age';
  const UPLOAD = 'Upload the encrypted backup';
  const CLEANUP = 'Remove the plain dump';
  const before = (first: string, second: string) =>
    expect(stepsBlock.indexOf(first), `${first} before ${second}`).toBeLessThan(
      stepsBlock.indexOf(second),
    );

  it('runs daily at 21:00 Coordinated Universal Time (02:30 India Standard Time) and by hand, and on nothing else', () => {
    const on = code.slice(code.indexOf('\non:\n'), code.indexOf('\npermissions:'));
    expect(on).toMatch(/schedule:\n\s+- cron: '0 21 \* \* \*'/);
    expect(on).toContain('workflow_dispatch:');
    expect(on).not.toMatch(
      /pull_request|pull_request_target|push:|workflow_run|repository_dispatch/,
    );
  });

  it('never runs for a fork, and a manual run must start from main', () => {
    const condition = code.slice(code.indexOf('    if: >-'), code.indexOf('    runs-on:'));
    expect(condition).toContain('github.event.repository.fork == false');
    expect(condition).toContain("github.event_name == 'schedule'");
    expect(condition).toContain("github.event_name == 'workflow_dispatch'");
    expect(step(MAIN_ONLY)).toContain('"$GITHUB_REF" != "refs/heads/main"');
    expect(stepsBlock.trimStart().startsWith(`- name: ${MAIN_ONLY}`)).toBe(true);
  });

  it('checks inputs, installs the tools, dumps, encrypts, then uploads, in that order', () => {
    before(MAIN_ONLY, INPUTS);
    before(INPUTS, INSTALL);
    before(INSTALL, DUMP);
    before(DUMP, ENCRYPT);
    // The encryption comes before the upload, so a plain file can never be uploaded.
    before(ENCRYPT, UPLOAD);
    before(UPLOAD, CLEANUP);
  });

  it('runs on a pinned Ubuntu, not on the moving latest label', () => {
    expect(code).toMatch(/^ {4}runs-on: ubuntu-24\.04$/m);
    expect(code).not.toContain('ubuntu-latest');
  });

  it('installs the PostgreSQL client of one chosen version and age, and dumps in the custom format with it', () => {
    const version = code.match(/^ {2}POSTGRES_CLIENT_VERSION: '(\d+)'$/m)?.[1];
    expect(version, 'POSTGRES_CLIENT_VERSION').toBeDefined();
    // The version lives in one place: every step reads the variable, none repeats the number.
    expect(code.match(/POSTGRES_CLIENT_VERSION: /g)).toHaveLength(1);
    const install = step(INSTALL);
    expect(install).toContain('apt.postgresql.org.sh');
    expect(install).toContain('"postgresql-client-$POSTGRES_CLIENT_VERSION"');
    expect(install).toMatch(/install -y [^\n]*\bage\b/);
    expect(install).toContain(
      '/usr/lib/postgresql/$POSTGRES_CLIENT_VERSION/bin" >> "$GITHUB_PATH"',
    );
    expect(install).not.toMatch(/postgresql-client-\d|postgresql\/\d/);
    expect(step(DUMP)).toContain('pg_dump --format=custom');
  });

  it('is at least as new as the Neon server, and the runbook restores with the same version', () => {
    const version = Number(code.match(/POSTGRES_CLIENT_VERSION: '(\d+)'/)![1]);
    // Neon's production database is PostgreSQL 18 (checked 12 November 2026): the client must not be older.
    expect(version).toBeGreaterThanOrEqual(18);
    // A backup restores only with the same version or a newer one, so the runbook names that image.
    expect(runbookDoc).toContain(`postgres:${version}`);
    expect(runbookDoc).not.toMatch(/docker compose up -d postgres/);
    expect(deploymentDoc.slice(deploymentDoc.indexOf('### 21.12'))).toContain(
      'POSTGRES_CLIENT_VERSION',
    );
  });

  it('encrypts to the public key, deletes the plain file, and fails on an empty file', () => {
    const encrypt = step(ENCRYPT);
    expect(encrypt).toContain('age -r "$BACKUP_AGE_RECIPIENT"');
    expect(encrypt).toContain('BACKUP_AGE_RECIPIENT: ${{ vars.BACKUP_AGE_RECIPIENT }}');
    expect(encrypt).toContain('rm -f "$dump"');
    expect(encrypt).toContain('trap \'rm -f "$dump"\' EXIT');
    expect(encrypt).toContain('[ ! -s "$out" ]');
    expect(encrypt).toContain('exit 1');
    // The dump itself must not be empty either.
    expect(step(DUMP)).toContain('[ ! -s "$dump" ]');
    // The plain dump is removed once more at the end, whatever happened.
    expect(step(CLEANUP)).toContain('if: always()');
    expect(step(CLEANUP)).toContain('backup.dump');
  });

  it('uploads only the encrypted file, for 30 days, with the official action', () => {
    const upload = step(UPLOAD);
    expect(upload).toMatch(/uses: actions\/upload-artifact@v\d+/);
    expect(upload).toContain('path: ${{ runner.temp }}/backup/*.age');
    expect(upload).toContain('retention-days: 30');
    expect(upload).toContain('if-no-files-found: error');
    expect(upload).not.toMatch(/\.dump(?!\.age)/);
    // Nothing but actions from the actions organization, and no checkout (nothing is needed).
    for (const uses of code.matchAll(/uses: ([^\s@]+)@/g)) {
      expect(uses[1], String(uses[1])).toMatch(/^actions\//);
    }
    expect(code).not.toContain('actions/checkout');
  });

  it('has read-only permissions and one backup at a time', () => {
    expect(code).toMatch(/^permissions:\n {2}contents: read\n\n/m);
    expect(code).not.toMatch(/: write/);
    expect(code).toMatch(/concurrency:\n {2}group: backup\n {2}cancel-in-progress: false/);
  });

  it('never prints the database address: the secret is on two steps, never echoed, and errors are not shown', () => {
    const seeing = steps.filter((t) => /\$\{\{ secrets\./.test(t));
    expect(seeing.map((t) => t.match(/name: (.*)/)![1])).toEqual([INPUTS, DUMP]);
    expect(code.slice(0, code.indexOf('    steps:'))).not.toMatch(/secrets\./);
    expect(code).toContain('secrets.BACKUP_DATABASE_URL');
    expect(code).not.toMatch(
      /set -x|printenv|\benv \||\bcurl\b|ACTIONS_STEP_DEBUG|--verbose|pg_dump -v/,
    );
    for (const line of code.split('\n').filter((l) => /\becho\b/.test(l))) {
      expect(line, line).not.toMatch(/\$\{?BACKUP_DATABASE_URL|\$\{\{ *secrets/);
    }
    // pg_dump's error text goes to a file that nothing prints.
    expect(step(DUMP)).toContain('2> "$errors"');
    expect(code).not.toMatch(/\bcat\b|\btail\b/);
    // The error file is read only by quiet greps, by the one grep that prints just the phrase
    // "permission denied for <kind> <name>", and by the commands that write or delete it.
    for (const line of code.split('\n').filter((l) => l.includes('"$errors"'))) {
      expect(line, line).toMatch(
        /grep -qiE? |grep -oiE 'permission denied for \([a-z| ]+\) \[A-Za-z0-9_."-\]\+' "\$errors"|2> "\$errors"|errors="\$RUNNER_TEMP|rm -f /,
      );
    }
  });

  it('asks for the direct Neon address with TLS and an age public key', () => {
    const inputs = step(INPUTS);
    expect(inputs).toContain('*-pooler*');
    expect(inputs).toContain('*sslmode=require*');
    expect(inputs).toContain('age1*');
    expect(inputs).toContain('::error::');
  });

  it('is documented in the deployment guide and the runbook', () => {
    const section = deploymentDoc.slice(deploymentDoc.indexOf('### 21.12'));
    for (const text of [
      'BACKUP_DATABASE_URL',
      'BACKUP_AGE_RECIPIENT',
      'CREATE ROLE backup_reader',
      'GRANT pg_read_all_data TO backup_reader',
      'GRANT SELECT ON ALL SEQUENCES',
      'age-keygen',
      'Run workflow',
      '60 days',
      '-pooler',
    ]) {
      expect(section, text).toContain(text);
    }
    for (const text of [
      'age -d -i',
      'pg_restore',
      'docker run -d --name restore_check',
      'count(*) from deals',
      'count(*) from payments',
      'count(*) from invoices',
      'count(*) from users',
    ]) {
      expect(runbookDoc, text).toContain(text);
    }
  });

  describe('the shell of each step, run against stand-in pg_dump, pg_restore and age', () => {
    const SECRET_URL =
      'postgresql://backup_reader:s3cretpw@ep-secret-host-123456.ap-southeast-1.aws.neon.tech/valueskins?sslmode=require';
    const RECIPIENT = 'age1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq';

    /** The `run: |` script of a step, as bash would receive it. */
    function scriptOf(name: string): string {
      const block = step(name);
      const start = block.indexOf('        run: |\n');
      if (start < 0) throw new Error(`step "${name}" has no run block`);
      const lines = block.slice(start + '        run: |\n'.length).split('\n');
      return lines.map((l) => l.replace(/^ {10}/, '')).join('\n');
    }

    const dirs: string[] = [];
    afterAll(() => {
      for (const d of dirs) rmSync(d, { recursive: true, force: true });
    });

    /** Stand-ins on PATH. Their behaviour is chosen by STUB_* variables. */
    function sandbox() {
      const dir = mkdtempSync(join(tmpdir(), 'backup-test-'));
      dirs.push(dir);
      const bin = join(dir, 'bin');
      const temp = join(dir, 'runner-temp');
      mkdirSync(bin);
      mkdirSync(temp);
      const write = (name: string, body: string) => {
        writeFileSync(join(bin, name), `#!/usr/bin/env bash\n${body}\n`);
        chmodSync(join(bin, name), 0o755);
      };
      return { dir, bin, temp, write };
    }

    function prepare() {
      const sb = sandbox();
      sb.write(
        'pg_dump',
        `for a in "$@"; do case "$a" in --file=*) f="\${a#--file=}";; esac; done
case "$STUB_PG_DUMP" in
  fail) echo "connection to server at ep-secret-host-123456.ap-southeast-1.aws.neon.tech failed: password authentication failed for user backup_reader s3cretpw" >&2; exit 1;;
  denied) printf 'pg_dump: error: connection to server at "ep-secret-host-123456.ap-southeast-1.aws.neon.tech" (10.0.0.1), user backup_reader, password s3cretpw\\npg_dump: error: query failed: ERROR:  permission denied for schema neon\\npg_dump: error: Query was: LOCK TABLE neon.foo\\npg_dump: error: ERROR:  permission denied for table users_secret_table_name\\n' >&2; exit 1;;
  empty) : > "$f";;
  *) echo "PGDMP stand-in" > "$f";;
esac`,
      );
      sb.write(
        'pg_restore',
        `case "$STUB_ENTRIES" in
  none) ;;
  *) printf ';\n; Archive created\n123; 1259 16394 TABLE public deals owner\n124; 1259 16400 TABLE public users owner\n';;
esac`,
      );
      sb.write(
        'age',
        `while [ $# -gt 0 ]; do case "$1" in -o) out="$2"; shift 2;; -r) shift 2;; *) in="$1"; shift;; esac; done
case "$STUB_AGE" in
  fail) echo "age: error: failed to parse recipient" >&2; exit 1;;
  empty) : > "$out";;
  *) printf 'age-encryption.org/v1 stand-in' > "$out"; cat "$in" >> "$out";;
esac`,
      );
      return sb;
    }

    function run(name: string, sb: ReturnType<typeof prepare>, env: Record<string, string> = {}) {
      const result = spawnSync('bash', ['-c', scriptOf(name)], {
        encoding: 'utf8',
        env: {
          PATH: `${sb.bin}:${process.env.PATH}`,
          RUNNER_TEMP: sb.temp,
          GITHUB_REF: 'refs/heads/main',
          BACKUP_DATABASE_URL: SECRET_URL,
          BACKUP_AGE_RECIPIENT: RECIPIENT,
          ...env,
        },
      });
      return { status: result.status, output: `${result.stdout}${result.stderr}` };
    }

    const filesIn = (sb: ReturnType<typeof prepare>) => readdirSync(sb.temp).sort();
    const never = (output: string) => {
      for (const secret of ['s3cretpw', 'ep-secret-host', SECRET_URL, 'backup_reader']) {
        expect(output, secret).not.toContain(secret);
      }
    };

    it('refuses a run from another branch, and accepts main', () => {
      const sb = prepare();
      expect(run(MAIN_ONLY, sb, { GITHUB_REF: 'refs/heads/feature/x' }).status).toBe(1);
      expect(run(MAIN_ONLY, sb).status).toBe(0);
    });

    it('stops on a missing input, a pooled address, a missing sslmode or a recipient that is not an age key, without printing the address', () => {
      const sb = prepare();
      const bad: Array<[string, Record<string, string>]> = [
        ['missing address', { BACKUP_DATABASE_URL: '' }],
        ['missing recipient', { BACKUP_AGE_RECIPIENT: '' }],
        [
          'pooled',
          {
            BACKUP_DATABASE_URL: SECRET_URL.replace(
              'ep-secret-host-123456',
              'ep-secret-host-123456-pooler',
            ),
          },
        ],
        ['no sslmode', { BACKUP_DATABASE_URL: SECRET_URL.replace('?sslmode=require', '') }],
        ['not an age key', { BACKUP_AGE_RECIPIENT: 'ssh-ed25519 AAAA' }],
      ];
      for (const [label, env] of bad) {
        const result = run(INPUTS, sb, env);
        expect(result.status, label).toBe(1);
        expect(result.output, label).toContain('::error::');
        never(result.output);
      }
      expect(run(INPUTS, sb).status).toBe(0);
    });

    it('dumps, encrypts and leaves only the encrypted file', () => {
      const sb = prepare();
      const dump = run(DUMP, sb);
      expect(dump.status).toBe(0);
      expect(dump.output).toContain('Dump written: 2 entries.');
      never(dump.output);
      expect(filesIn(sb)).toEqual(['backup.dump']);

      const encrypt = run(ENCRYPT, sb);
      expect(encrypt.status).toBe(0);
      never(encrypt.output);
      expect(filesIn(sb)).toEqual(['backup']);
      const files = readdirSync(join(sb.temp, 'backup'));
      expect(files).toHaveLength(1);
      expect(files[0]).toMatch(/^valueskins-\d{4}-\d{2}-\d{2}T\d{4}Z\.dump\.age$/);
      expect(readFileSync(join(sb.temp, 'backup', files[0]!), 'utf8')).toContain(
        'age-encryption.org/v1',
      );
    });

    it('fails, and shows no address, user or password, when pg_dump fails', () => {
      const sb = prepare();
      const result = run(DUMP, sb, { STUB_PG_DUMP: 'fail' });
      expect(result.status).toBe(1);
      expect(result.output).toContain('::error::pg_dump failed');
      expect(result.output).toContain('Hint: check the role and password');
      never(result.output);
      // Nothing is left behind, not even the error file that held the host.
      expect(filesIn(sb)).toEqual([]);
    });

    it('names the schema or table a missing privilege is about, and nothing else from the error', () => {
      const sb = prepare();
      const result = run(DUMP, sb, { STUB_PG_DUMP: 'denied' });
      expect(result.status).toBe(1);
      expect(result.output).toContain('Hint: the backup role is missing a privilege');
      expect(result.output).toContain('Missing: permission denied for schema neon');
      expect(result.output).toContain(
        'Missing: permission denied for table users_secret_table_name',
      );
      // Only the phrase and the object name: not the host, the address, the user or the password.
      never(result.output);
      expect(result.output).not.toContain('10.0.0.1');
      expect(result.output).not.toContain('LOCK TABLE');
      expect(filesIn(sb)).toEqual([]);
    });

    it('fails when the dump is empty or is not a readable archive', () => {
      const sb = prepare();
      const empty = run(DUMP, sb, { STUB_PG_DUMP: 'empty' });
      expect(empty.status).toBe(1);
      expect(empty.output).toContain('The dump file is empty');
      expect(filesIn(sb)).toEqual([]);

      const unreadable = run(DUMP, sb, { STUB_ENTRIES: 'none' });
      expect(unreadable.status).toBe(1);
      expect(unreadable.output).toContain('not a readable archive');
      expect(filesIn(sb)).toEqual([]);
    });

    it('fails when the encrypted file is empty or age fails, and the plain dump is gone either way', () => {
      for (const mode of ['empty', 'fail']) {
        const sb = prepare();
        expect(run(DUMP, sb).status).toBe(0);
        const result = run(ENCRYPT, sb, { STUB_AGE: mode });
        expect(result.status, mode).toBe(1);
        expect(result.output, mode).toContain('::error::');
        never(result.output);
        expect(filesIn(sb), mode).not.toContain('backup.dump');
      }
    });

    it('fails when there is no dump to encrypt', () => {
      const sb = prepare();
      const result = run(ENCRYPT, sb);
      expect(result.status).toBe(1);
      expect(result.output).toContain('missing or empty');
    });
  });
});
