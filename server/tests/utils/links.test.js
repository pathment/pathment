'use strict';

/**
 * The links every email carries.
 *
 * Two things are being guarded. One is the shape: every entry link goes through
 * a single host with the tenant in the path, because Android verifies app links
 * per host and a per-customer host would mean a new mobile build per customer.
 *
 * The other is a bug that shipped. `actionUrl` is a relative path, and the
 * notification email dropped it straight into an href, so the "Open Pathment"
 * button in every task, deadline and approval email resolved against nothing.
 */

const ENV = ['APP_URL', 'CLIENT_URL', 'LINK_URL', 'TENANT_SLUG', 'DEFAULT_WORKSPACE_SLUG'];

function load(env) {
  ENV.forEach((key) => { delete process.env[key]; });
  Object.entries(env).forEach(([key, value]) => { process.env[key] = value; });
  jest.resetModules();
  return require('../../src/utils/links');
}

const original = {};
beforeAll(() => { ENV.forEach((key) => { original[key] = process.env[key]; }); });
afterAll(() => {
  ENV.forEach((key) => {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  });
});

const LIVE = {
  CLIENT_URL: 'https://app.pathment.me',
  LINK_URL: 'https://links.pathment.me',
  DEFAULT_WORKSPACE_SLUG: 'devweekends',
};

describe('with the link host set', () => {
  test('CORS origin lists never appear inside generated email links', () => {
    const links = load({ CLIENT_URL: 'https://app.pathment.me,https://pathment.me,https://*.pathment.me',
      DEFAULT_WORKSPACE_SLUG: 'devweekends' });
    expect(links.pageLink('/mentor/dashboard')).toBe('https://app.pathment.me/w/devweekends/mentor/dashboard');
  });
  test('every entry link goes through one host, tenant in the path', () => {
    const links = load(LIVE);

    expect(links.inviteLink('abc123')).toBe('https://links.pathment.me/i/devweekends/abc123');
    expect(links.resetLink('abc123')).toBe('https://links.pathment.me/r/devweekends/abc123');
    expect(links.verifyLink('abc123')).toBe('https://links.pathment.me/v/devweekends/abc123');
    expect(links.signInLink('abc123')).toBe('https://links.pathment.me/m/devweekends/abc123');
  });

  test('a notification path is carried whole, and escaped', () => {
    const links = load(LIVE);

    expect(links.pageLink('/mentee/tasks/123')).toBe(
      'https://links.pathment.me/g/devweekends?to=%2Fmentee%2Ftasks%2F123',
    );
    expect(links.pageLink('/mentee/dashboard?review=7')).toBe(
      'https://links.pathment.me/g/devweekends?to=%2Fmentee%2Fdashboard%3Freview%3D7',
    );
  });

  test('a token with url characters in it survives the trip', () => {
    const links = load(LIVE);
    expect(links.resetLink('a+b/c=d')).toBe('https://links.pathment.me/r/devweekends/a%2Bb%2Fc%3Dd');
  });

  test('the tenant can be named outright rather than guessed', () => {
    const links = load({ ...LIVE, TENANT_SLUG: 'microtechx' });
    expect(links.inviteLink('t')).toBe('https://links.pathment.me/i/microtechx/t');
    expect(links.verifyLink('t', 'new-company')).toBe('https://links.pathment.me/v/new-company/t');
  });

  test('a shared API uses the request workspace instead of the default', async () => {
    const links = load(LIVE);
    const { runWithRequestContext } = require('../../src/utils/auditContext');
    await runWithRequestContext({ organizationSlug: 'acme' }, async () => {
      expect(links.inviteLink('t')).toBe('https://links.pathment.me/i/acme/t');
      expect(links.pageLink('/admin/dashboard')).toBe(
        'https://links.pathment.me/g/acme?to=%2Fadmin%2Fdashboard',
      );
    });
  });

  test('a nonsense TENANT_SLUG is ignored rather than put in a URL', () => {
    const links = load({ ...LIVE, TENANT_SLUG: 'Not A Slug!' });
    expect(links.inviteLink('t')).toBe('https://links.pathment.me/i/devweekends/t');
  });
});

describe('before the link host exists', () => {
  test('links are exactly what they always were', () => {
    const links = load({ CLIENT_URL: 'https://app.pathment.me', DEFAULT_WORKSPACE_SLUG: 'devweekends' });

    expect(links.inviteLink('abc')).toBe('https://app.pathment.me/w/devweekends/register?invite=abc');
    expect(links.resetLink('abc')).toBe('https://app.pathment.me/w/devweekends/reset-password?token=abc');
    expect(links.verifyLink('abc')).toBe('https://app.pathment.me/w/devweekends/verify-email?token=abc');
    expect(links.signInLink('abc')).toBe('https://app.pathment.me/w/devweekends/sign-in?link=abc');
    expect(links.pageLink('/mentor/clan-team')).toBe('https://app.pathment.me/w/devweekends/mentor/clan-team');
  });

  test('localhost does not produce a tenant that looks real', () => {
    const links = load({ CLIENT_URL: 'http://localhost:3000', LINK_URL: 'https://links.pathment.me' });
    expect(links.tenantSlug()).toBe('app');
  });
});

describe('pageLink refuses to be a redirector', () => {
  test('a protocol relative path cannot smuggle a host in', () => {
    const links = load(LIVE);
    expect(links.pageLink('//evil.com/steal')).toBe(
      'https://links.pathment.me/g/devweekends?to=%2Fdashboard',
    );
  });

  test('anything that is not a path lands somewhere real', () => {
    const links = load(LIVE);

    ['', null, undefined, 'mentee/tasks', 'javascript:alert(1)'].forEach((value) => {
      expect(links.pageLink(value)).toBe('https://links.pathment.me/g/devweekends?to=%2Fdashboard');
    });
  });

  test('an absolute url is left alone, because some callers build their own', () => {
    const links = load(LIVE);
    expect(links.pageLink('https://devweekends.pathment.me/login')).toBe(
      'https://devweekends.pathment.me/login',
    );
  });
});
