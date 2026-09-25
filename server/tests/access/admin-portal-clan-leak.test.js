'use strict';

/**
 * An admin screen has no active clan.
 *
 * `X-Active-Clan` describes the clan PICKER, which exists in the mentor and
 * mentee portals. The browser stored the mentor picker's choice and attached it
 * to every request, admin pages included — so an admin who also mentors a clan
 * had their admin screens silently narrowed to their own dozen mentees.
 *
 * On production this split one page against itself. The certificate approval
 * banner takes no clan and described all 28 clans of a fellowship; the
 * verification queue beside it came back holding 10 rows from the one clan the
 * admin happened to mentor. A clan read "16 of 16 signed off · 3 changed" and
 * opened to "0 decisions", and a mentee who was verified in the database showed
 * as never signed off because her row was in a clan the request had excluded.
 *
 * The header can still narrow a mentor or mentee portal, and an explicit
 * ?clanId= still filters anything — that is somebody asking on purpose.
 */

const portalScope = require('../../src/middlewares/portalScope');
const { portalOf, requestedClanId } = require('../../src/middlewares/portalScope');

const CLAN = 'b87641ec-febd-4fd4-b93f-f808e9bcdd52';

/** Run the middleware over a fake request and hand back what it decided. */
function scope({ role, clan, query = {}, body = {} } = {}) {
  const req = {
    headers: {
      ...(role ? { 'x-portal-role': role } : {}),
      ...(clan ? { 'x-active-clan': clan } : {})
    },
    query,
    body
  };
  portalScope(req, {}, () => {});
  return req;
}

describe('the clan picker does not follow you into the admin portal', () => {
  it('drops an ambient clan on an admin screen', () => {
    const req = scope({ role: 'admin', clan: CLAN });

    expect(portalOf(req).role).toBe('admin');
    expect(portalOf(req).clanId).toBeNull();
    expect(requestedClanId(req)).toBeNull();
  });

  it('still honours the clan a mentor has chosen', () => {
    const req = scope({ role: 'mentor', clan: CLAN });
    expect(portalOf(req).clanId).toBe(CLAN);
  });

  it('still honours the clan a mentee has chosen', () => {
    const req = scope({ role: 'mentee', clan: CLAN });
    expect(portalOf(req).clanId).toBe(CLAN);
  });

  /**
   * An admin narrowing to one clan on purpose is a different act from a stale
   * picker riding along, and only the second one is being taken away.
   */
  it('lets an admin filter to one clan explicitly', () => {
    const req = scope({ role: 'admin', clan: CLAN, query: { clanId: CLAN } });
    expect(requestedClanId(req)).toBe(CLAN);
  });

  it('leaves a request with no portal exactly as it was', () => {
    const req = scope({ clan: CLAN });
    expect(portalOf(req).role).toBeNull();
    expect(portalOf(req).clanId).toBe(CLAN);
  });

  it('ignores a clan value that is not a uuid', () => {
    expect(portalOf(scope({ role: 'mentor', clan: 'all' })).clanId).toBeNull();
  });
});
