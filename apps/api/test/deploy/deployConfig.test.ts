import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseEnv } from '../../src/env/parse.js';
import { envSchema } from '../../src/env/schema.js';
import { getStartupGuardViolations } from '../../src/env/startupGuards.js';
import { buildTestEnv } from '../testEnv.js';

const REPO_ROOT = new URL('../../../../', import.meta.url);
const renderYaml = readFileSync(new URL('render.yaml', REPO_ROOT), 'utf8');
const deploymentDoc = readFileSync(new URL('docs/DEPLOYMENT.md', REPO_ROOT), 'utf8');
const cutoverDoc = readFileSync(new URL('docs/CUTOVER.md', REPO_ROOT), 'utf8');
const netlifyToml = readFileSync(new URL('apps/web/netlify.toml', REPO_ROOT), 'utf8');
const deployWorkflow = readFileSync(
  new URL('.github/workflows/deploy-web-production.yml', REPO_ROOT),
  'utf8',
);

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

  it('runs only after the CI workflow has finished on main, and on nothing else', () => {
    const on = code.slice(code.indexOf('\non:\n'), code.indexOf('\npermissions:'));
    expect(on).toMatch(
      /workflow_run:\n\s+workflows: \[CI\]\n\s+types: \[completed\]\n\s+branches: \[main\]/,
    );
    expect(code).not.toMatch(
      /pull_request|workflow_dispatch|schedule:|^\s{2}push:|repository_dispatch/m,
    );
    // And the CI workflow it waits for really is called CI and runs on pushes to main.
    const ci = readFileSync(new URL('.github/workflows/ci.yml', REPO_ROOT), 'utf8');
    expect(ci).toMatch(/^name: CI$/m);
    expect(ci).toMatch(/push:\n\s+branches: \[main\]/);
  });

  it('deploys only a passed push to this repository main: never a pull request, never a fork', () => {
    const condition = code.slice(code.indexOf('    if: >-'), code.indexOf('    runs-on:'));
    for (const clause of [
      "github.event.workflow_run.conclusion == 'success'",
      "github.event.workflow_run.event == 'push'",
      "github.event.workflow_run.head_branch == 'main'",
      'github.event.workflow_run.head_repository.full_name == github.repository',
    ]) {
      expect(condition, clause).toContain(clause);
    }
  });

  it('checks out exactly the commit CI tested, with read-only access and no stored credentials', () => {
    expect(code).toMatch(/^permissions:\n {2}contents: read$/m);
    expect(code).not.toMatch(/: write/);
    const checkout = step('actions/checkout');
    expect(checkout).toContain('ref: ${{ github.event.workflow_run.head_sha }}');
    expect(checkout).toContain('persist-credentials: false');
  });

  it('uses Node 22 and pnpm with the frozen lockfile, like CI', () => {
    expect(step('actions/setup-node')).toMatch(/node-version: 22\n\s+cache: pnpm/);
    expect(step('pnpm/action-setup')).toContain('pnpm/action-setup@v4');
    expect(step('Install dependencies')).toContain('pnpm install --frozen-lockfile');
  });

  it('builds the shared package, then deploys to production with the pinned Netlify CLI', () => {
    expect(stepsBlock.indexOf('Build the shared package')).toBeGreaterThan(
      stepsBlock.indexOf('Install dependencies'),
    );
    expect(stepsBlock.indexOf(DEPLOY)).toBeGreaterThan(
      stepsBlock.indexOf('Build the shared package'),
    );
    expect(step('Build the shared package')).toContain('pnpm --filter "./packages/*" run build');
    const deploy = step(DEPLOY).replace(/\s+/g, ' ');
    expect(deploy).toMatch(/--package=netlify-cli@\d+\.\d+\.\d+ dlx netlify deploy/);
    for (const flag of ['--prod', '--context production', '--filter @valueskins/web']) {
      expect(deploy, flag).toContain(flag);
    }
    // `netlify deploy` builds by default (the Next.js runtime needs that); never skip it.
    expect(deploy).not.toContain('--no-build');
    // A real production deploy: not a draft (no --prod) and not triggered remotely.
    expect(deploy).not.toContain('--trigger');
  });

  it('reads the two secrets and the two variables by the documented names', () => {
    const env = step(DEPLOY);
    for (const line of [
      'NETLIFY_AUTH_TOKEN: ${{ secrets.NETLIFY_AUTH_TOKEN }}',
      'NETLIFY_SITE_ID: ${{ secrets.NETLIFY_SITE_ID }}',
      'NEXT_PUBLIC_API_URL: ${{ vars.NEXT_PUBLIC_API_URL }}',
      'NEXT_PUBLIC_SENTRY_DSN: ${{ vars.NEXT_PUBLIC_SENTRY_DSN }}',
    ]) {
      expect(env, line).toContain(line);
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

  it('never prints a secret, and only the two steps that run our own shell and the CLI can see them', () => {
    const seeing = steps.filter((t) => /\$\{\{ secrets\./.test(t));
    expect(seeing.map((t) => t.match(/name: (.*)/)![1])).toEqual([
      'Check the deploy inputs',
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
  });

  describe('the skip when the web app did not change (a deploy costs 15 Netlify credits)', () => {
    const changes = step('Check whether the web app changed');
    const pattern = new RegExp(changes.match(/grep -Eq '([^']+)'/)![1]!);
    const deployed = (file: string) => pattern.test(file);

    it('deploys for everything the web build reads, and for the workflow itself', () => {
      for (const file of [
        'apps/web/app/layout.tsx',
        'apps/web/netlify.toml',
        'apps/web/package.json',
        'packages/shared/src/money.ts',
        'pnpm-lock.yaml',
        'pnpm-workspace.yaml',
        'package.json',
        'tsconfig.base.json',
        '.nvmrc',
        '.github/workflows/deploy-web-production.yml',
      ]) {
        expect(deployed(file), file).toBe(true);
      }
    });

    it('skips API-only, docs-only and CI-only changes', () => {
      for (const file of [
        'apps/api/src/app.ts',
        'docs/DEPLOYMENT.md',
        'render.yaml',
        'README.md',
        '.github/workflows/ci.yml',
        'apps/webish/x.ts',
        'subdir/apps/web/x.ts',
      ]) {
        expect(deployed(file), file).toBe(false);
      }
    });

    it('compares a merge commit with its first parent, and a re-run always deploys', () => {
      expect(changes).toContain('git diff --name-only HEAD^ HEAD');
      expect(changes).toMatch(/github\.run_attempt \}\}" != "1"/);
      expect(deployWorkflow).toMatch(/fetch-depth: 2/);
    });

    it('runs every later step only when it says so', () => {
      for (const name of [
        'Check the deploy inputs',
        'actions/setup-node',
        'Install dependencies',
        'Build the shared package',
        DEPLOY,
      ]) {
        expect(step(name), name).toContain("if: steps.changes.outputs.web == 'true'");
      }
    });
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
