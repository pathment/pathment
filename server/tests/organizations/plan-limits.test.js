'use strict';

/**
 * Every plan, every metered limit, every way of spending one.
 *
 * The three limits a plan publishes — members, programs, clans — are only
 * worth publishing if every route to the resource counts against them. Two
 * did not:
 *
 *   • creating a person from the admin screen added an organization
 *     membership without touching the member cap, so the limit held for
 *     self-registration and invite acceptance and simply did not exist for
 *     the one person most able to exceed it;
 *   • duplicating a programme wrote a Program row directly, so a workspace on
 *     its last slot could fill the catalogue by pressing Duplicate.
 *
 * Neither needed anything clever. They were the ordinary buttons.
 *
 * The table below is deliberately data-driven: adding a plan to the product
 * adds a case here, and a plan whose limits are never enforced fails loudly
 * instead of being discovered by a customer who outgrew it for free.
 */

const { models } = require('../../src/db');
const organizationService = require('../../src/services/organizationService');
const programService = require('../../src/services/programService');
const clanService = require('../../src/services/clanService');
const { cleanDb, createAdmin, createMentor } = require('../helpers/seed');

/** The metered resources, and the cheapest honest way to consume one. */
const METERED = ['members', 'programs', 'clans'];

describe('plan limits', () => {
  let admin, mentor, organizationId;

  beforeEach(async () => {
    await cleanDb();
    admin = await createAdmin({ email: 'plan-admin@test.com' });
    mentor = await createMentor({ email: 'plan-mentor@test.com' });
    organizationId = await organizationService.currentId();
  });

  /** Put this workspace on `key` with no per-workspace overrides. */
  const onPlan = async (key) => {
    const plan = await models.Plan.findOne({ where: { key } });
    expect(plan).toBeTruthy();
    await models.OrganizationSubscription.update(
      { planId: plan.id, overrides: {} },
      { where: { organizationId } },
    );
    return plan;
  };

  // growth and scale are retired (157_pricing_v2) but still enforced for the
  // workspaces that keep them.
  describe.each(['starter', 'program', 'academy', 'institution', 'growth', 'scale'])('the %s plan', (key) => {
    it.each(METERED)('enforces its published %s limit, or publishes none', async (resource) => {
      const plan = await onPlan(key);
      const limit = Number(plan.limits?.[resource]);

      if (!Number.isFinite(limit) || limit < 0) {
        // Unlimited. The guard must let anything through rather than throw on
        // a NaN comparison, which is how "-1 means unlimited" usually breaks.
        await expect(organizationService.assertLimit(organizationId, resource, 10_000))
          .resolves.toBe(true);
        return;
      }

      // One under the cap is fine; at the cap is refused. Passing the usage in
      // keeps this about the rule, not about seeding a thousand rows.
      await expect(organizationService.assertLimit(organizationId, resource, limit - 1))
        .resolves.toBe(true);
      await expect(organizationService.assertLimit(organizationId, resource, limit))
        .rejects.toThrow(new RegExp(`${limit} ${resource === 'members' ? 'participants' : resource}`, 'i'));
      await expect(organizationService.assertLimit(organizationId, resource, limit + 5))
        .rejects.toThrow(/upgrade/i);
    });
  });

  it('counts a per-workspace override instead of the published figure', async () => {
    const plan = await onPlan('starter');
    const published = Number(plan.limits.programs);
    await models.OrganizationSubscription.update(
      { overrides: { limits: { programs: published + 10 } } },
      { where: { organizationId } },
    );
    // What the plan publishes is now refused by nothing; the override is.
    await expect(organizationService.assertLimit(organizationId, 'programs', published))
      .resolves.toBe(true);
    await expect(organizationService.assertLimit(organizationId, 'programs', published + 10))
      .rejects.toThrow(/upgrade/i);
  });

  // ── every route to the resource, not just the obvious one ─────────────────
  describe('the ways a limit can actually be spent', () => {
    beforeEach(() => onPlan('starter'));

    /** The minimum a Program needs to validate — the cap is what is on trial here. */
    const programInput = (name) => ({
      name, description: 'For the limit test', type: 'mentorship', totalDurationWeeks: 12,
    });

    const fillTo = async (resource, value) => models.OrganizationSubscription.update(
      { overrides: { limits: { [resource]: value } } },
      { where: { organizationId } },
    );

    it('refuses a new programme at the cap', async () => {
      await fillTo('programs', 0);
      await expect(programService.createProgram(programInput('Over the line'), admin.id, organizationId))
        .rejects.toThrow(/upgrade/i);
    });

    /** Duplicate is a create. It used to be a way around the cap. */
    it('refuses a DUPLICATED programme at the cap', async () => {
      await fillTo('programs', 1);
      const source = await programService.createProgram(programInput('Source'), admin.id, organizationId);
      await expect(programService.cloneProgram(source.id, admin.id))
        .rejects.toThrow(/upgrade/i);
    });

    it('refuses a new clan at the cap', async () => {
      await fillTo('clans', 0);
      const program = await programService.createProgram(programInput('Has clans'), admin.id, organizationId);
      await expect(clanService.createClan(
        { programId: program.id, name: 'One too many', leadMentorId: mentor.id }, admin.id,
      )).rejects.toThrow(/upgrade/i);
    });

    /** Plans are billed on participants: mentors and admins never fill a seat. */
    it('lets an admin be created at the participant cap', async () => {
      const adminService = require('../../src/services/adminService');
      await fillTo('members', 0);
      await expect(adminService.createAdmin({
        firstName: 'Free', lastName: 'Admin', email: 'free-admin@test.com', password: 'Test@1234',
      }, admin.id)).resolves.toBeTruthy();
    });

    it('refuses a participant at the cap but not a mentor', async () => {
      await fillTo('members', 0);
      await expect(organizationService.assertLimit(organizationId, 'members', null, { role: 'mentee' }))
        .rejects.toThrow(/upgrade/i);
      await expect(organizationService.assertLimit(organizationId, 'members', null, { role: 'mentor' }))
        .resolves.toBe(true);
    });

    it('counts only mentees as participants', async () => {
      const before = (await organizationService.usage(organizationId)).members;
      const extraMentor = await createMentor({ email: 'plan-mentor-2@test.com' });
      await models.OrganizationMembership.findOrCreate({
        where: { organizationId, userId: extraMentor.id }, defaults: { role: 'member', status: 'active' },
      });
      expect((await organizationService.usage(organizationId)).members).toBe(before);
    });
  });
});
