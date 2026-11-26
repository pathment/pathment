'use strict';

const { Op } = require('sequelize');

let mockContext = {};

const mockModels = {
  User: { findByPk: jest.fn(), findAll: jest.fn() },
  OrganizationMembership: { findAll: jest.fn() },
  MentorProfile: { findAll: jest.fn() },
  ClanMembership: { findAll: jest.fn() },
  MentorMenteeMatch: { findAll: jest.fn() },
  // Resolving a programme scope to its clans, for the bounded admin case.
  Clan: { findAll: jest.fn() },
  // Selection-pool candidates: no clan, no mentor, so their directory is
  // resolved from the rounds they are in rather than from a clan roster.
  PoolMember: { findAll: jest.fn() },
  CandidatePool: {},
};

jest.mock('../../src/db', () => ({ models: mockModels, sequelize: {} }));
jest.mock('../../src/utils/auditContext', () => ({ getRequestContext: () => mockContext }));
jest.mock('../../src/services/authzService', () => ({
  getCapabilities: jest.fn(),
  adminProgramScope: jest.fn(),
  getAssignments: jest.fn(async () => []),
  // The one shared resolver every scoped read now asks (see programScopeFor).
  programScopeFor: jest.fn(),
  clanIdsInPrograms: jest.fn(async () => []),
  adminUserIdsFor: jest.fn(async () => []),
}));
jest.mock('../../src/services/schedulingService', () => ({ getMenteeMentorIds: jest.fn() }));

const authzService = require('../../src/services/authzService');
const schedulingService = require('../../src/services/schedulingService');
const messagingService = require('../../src/services/messagingService');
const clanRequestValidation = require('../../src/validations/clanRequestValidation');

const memberships = [
  { userId: 'admin', role: 'admin' },
  { userId: 'mentor', role: 'member' },
  { userId: 'other-mentor', role: 'member' },
  { userId: 'mentee', role: 'member' },
  { userId: 'peer', role: 'member' },
  { userId: 'outside-mentee', role: 'member' },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockContext = { organizationId: 'organization' };
  mockModels.OrganizationMembership.findAll.mockResolvedValue(memberships);
  authzService.programScopeFor.mockResolvedValue({ unrestricted: false, programIds: [], clanIds: [] });
  authzService.clanIdsInPrograms.mockResolvedValue([]);
  authzService.adminUserIdsFor.mockResolvedValue([]);
  mockModels.MentorProfile.findAll.mockResolvedValue([]);
  mockModels.PoolMember.findAll.mockResolvedValue([]);
});

it('gives a mentee only their clan, assigned mentor and admins', async () => {
  mockContext.portalRole = 'mentee';
  mockModels.User.findByPk.mockResolvedValue({ id: 'mentee', role: 'mentee' });
  authzService.getCapabilities.mockResolvedValue(['mentee']);
  schedulingService.getMenteeMentorIds.mockResolvedValue(['mentor']);
  mockModels.ClanMembership.findAll
    .mockResolvedValueOnce([{ clanId: 'own-clan' }])
    .mockResolvedValueOnce([
      { userId: 'mentee' },
      { userId: 'peer' },
      { userId: 'mentor' },
    ]);

  const visible = await messagingService.getAllowedRecipientIds('mentee');
  expect(visible).toEqual(expect.arrayContaining(['admin', 'mentor', 'peer']));
  expect(visible).not.toEqual(expect.arrayContaining(['other-mentor', 'outside-mentee']));
});

it('gives a mentor assigned mentees, every mentor and admins', async () => {
  mockContext.portalRole = 'mentor';
  mockModels.User.findByPk.mockResolvedValue({ id: 'mentor', role: 'mentor' });
  authzService.getCapabilities.mockResolvedValue(['mentor']);
  mockModels.MentorProfile.findAll.mockResolvedValue([
    { userId: 'mentor' },
    { userId: 'other-mentor' },
  ]);
  mockModels.ClanMembership.findAll
    .mockResolvedValueOnce([{ clanId: 'own-clan' }])
    .mockResolvedValueOnce([{ userId: 'mentee' }, { userId: 'peer' }]);
  mockModels.MentorMenteeMatch.findAll.mockResolvedValue([]);

  const visible = await messagingService.getAllowedRecipientIds('mentor');
  expect(visible).toEqual(expect.arrayContaining(['admin', 'other-mentor', 'mentee', 'peer']));
  expect(visible).not.toContain('outside-mentee');
});

it('gives an ORG admin every other active workspace member', async () => {
  mockContext.portalRole = 'admin';
  mockModels.User.findByPk.mockResolvedValue({ id: 'admin', role: 'admin' });
  authzService.getCapabilities.mockResolvedValue(['admin']);
  // unrestricted is what an org-tier admin resolves to: no bound at all.
  authzService.programScopeFor.mockResolvedValue({ unrestricted: true, programIds: null, clanIds: null });

  await expect(messagingService.getAllowedRecipientIds('admin')).resolves.toEqual([
    'mentor',
    'other-mentor',
    'mentee',
    'peer',
    'outside-mentee',
  ]);
});

/**
 * An admin granted one programme could open a chat with all 1,089 members of
 * the organisation, because the admin branch returned the workspace and
 * stopped. Bounded to their programmes' clans — plus the workspace's own
 * admins, who must stay reachable: being scoped to one programme is a reason
 * to need an org admin, not a reason to be cut off from one.
 */
it('bounds a PROGRAMME admin to their programmes, keeping org admins reachable', async () => {
  mockContext.portalRole = 'admin';
  mockModels.User.findByPk.mockResolvedValue({ id: 'scoped', role: 'mentor' });
  authzService.getCapabilities.mockResolvedValue(['admin']);
  authzService.programScopeFor.mockResolvedValue({
    unrestricted: false, programIds: ['prog-1'], clanIds: ['in-scope-clan'],
  });
  mockModels.ClanMembership.findAll.mockResolvedValue([{ userId: 'mentee' }, { userId: 'peer' }]);

  const visible = await messagingService.getAllowedRecipientIds('scoped');
  expect(visible).toEqual(expect.arrayContaining(['mentee', 'peer', 'admin']));
  expect(visible).not.toContain('outside-mentee');
  expect(visible).not.toContain('other-mentor');
});

/**
 * A mentor's peers are the mentors of their own programmes.
 *
 * The branch was `MentorProfile.findAll({ attributes: ['userId'] })` - no
 * filter of any kind - so a mentor running one clan of one fellowship had
 * every mentor in the workspace in their directory, from programmes they have
 * nothing to do with.
 */
it('bounds a MENTOR to the mentors of their own programmes', async () => {
  mockContext.portalRole = 'mentor';
  mockModels.User.findByPk.mockResolvedValue({ id: 'mentor', role: 'mentor' });
  authzService.getCapabilities.mockResolvedValue(['mentor']);
  authzService.programScopeFor.mockResolvedValue({
    unrestricted: false, programIds: ['prog-1'], clanIds: ['own-clan'],
  });
  authzService.clanIdsInPrograms.mockResolvedValue(['own-clan', 'sibling-clan']);
  // Asked for the clans of their programme, never for every MentorProfile.
  mockModels.ClanMembership.findAll
    .mockResolvedValueOnce([{ userId: 'mentor' }, { userId: 'other-mentor' }])
    .mockResolvedValueOnce([{ clanId: 'own-clan' }])
    .mockResolvedValueOnce([{ userId: 'mentee' }]);
  mockModels.MentorMenteeMatch.findAll.mockResolvedValue([]);

  const visible = await messagingService.getAllowedRecipientIds('mentor');
  expect(visible).toEqual(expect.arrayContaining(['other-mentor', 'mentee', 'admin']));
  expect(visible).not.toContain('outside-mentee');
  expect(mockModels.MentorProfile.findAll).not.toHaveBeenCalled();
});

/**
 * A mentor who belongs to no programme at all keeps the workspace's mentors.
 * Bounding somebody to programmes they do not have would hand them an empty
 * directory, and mentor-to-mentor messaging has never needed a clan between
 * them. The bound narrows a real scope; it does not invent one.
 */
it('falls back to every mentor when the mentor has no programme', async () => {
  mockContext.portalRole = 'mentor';
  mockModels.User.findByPk.mockResolvedValue({ id: 'mentor', role: 'mentor' });
  authzService.getCapabilities.mockResolvedValue(['mentor']);
  authzService.clanIdsInPrograms.mockResolvedValue([]);
  mockModels.MentorProfile.findAll.mockResolvedValue([
    { userId: 'mentor' }, { userId: 'other-mentor' },
  ]);
  mockModels.ClanMembership.findAll.mockResolvedValue([]);
  mockModels.MentorMenteeMatch.findAll.mockResolvedValue([]);

  const visible = await messagingService.getAllowedRecipientIds('mentor');
  expect(visible).toEqual(expect.arrayContaining(['other-mentor']));
});

it('puts allowed ids into the query so forbidden users are never fetched', async () => {
  // Restored at the end: these spies replace methods on the service singleton,
  // and jest.clearAllMocks() does not put a spy back. Left standing, every
  // later test in this file silently got this stubbed directory instead of
  // the real one.
  jest.spyOn(messagingService, 'getAllowedRecipientIds').mockResolvedValue(['mentor', 'peer', 'admin']);
  jest.spyOn(messagingService, 'getClanMemberUserIds').mockResolvedValue(['peer']);
  mockModels.User.findAll.mockResolvedValue([]);

  await messagingService.searchUsers('mentee', 'nadia');

  const where = mockModels.User.findAll.mock.calls[0][0].where;
  expect(where.id[Op.in]).toEqual(['mentor', 'peer', 'admin']);
  expect(where[Op.or]).toEqual(expect.arrayContaining([
    { firstName: { [Op.iLike]: '%nadia%' } },
  ]));
  messagingService.getAllowedRecipientIds.mockRestore();
  messagingService.getClanMemberUserIds.mockRestore();
});

it('keeps the source clan in a standing-clan request', () => {
  const input = {
    programId: '11111111-1111-4111-8111-111111111111',
    sourceClanId: '22222222-2222-4222-8222-222222222222',
    name: 'Builders alumni',
    description: '',
  };

  const result = clanRequestValidation.standingRequest.validate(input, { stripUnknown: true });
  expect(result.error).toBeUndefined();
  expect(result.value.sourceClanId).toBe(input.sourceClanId);
});


/*
 * A selection-pool candidate. They hold no portal capability — no clan, no
 * enrollment, no mentee profile — so every other branch would hand them an
 * empty directory and no way to ask about the work they have been given.
 */
describe('a selection-pool candidate', () => {
  const asCandidate = () => {
    mockContext.portalRole = 'mentee';            // what the learner portal asks for
    mockModels.User.findByPk.mockResolvedValue({ id: 'candidate', role: 'mentee' });
    authzService.getCapabilities.mockResolvedValue(['candidate']);
    mockModels.PoolMember.findAll.mockResolvedValue([{ poolId: 'pool', pool: { programId: 'programme' } }]);
  };

  it('reaches the workspace admins and their programme admins, and nobody else', async () => {
    asCandidate();
    // The programme's admin is a member of this workspace like anyone else.
    mockModels.OrganizationMembership.findAll.mockResolvedValue([
      ...memberships, { userId: 'programme-admin', role: 'member' },
    ]);
    authzService.adminUserIdsFor.mockResolvedValue(['programme-admin']);

    const visible = await messagingService.getAllowedRecipientIds('candidate');

    expect(visible.sort()).toEqual(['admin', 'programme-admin']);
    // The admins are looked up for the programme their round belongs to.
    expect(authzService.adminUserIdsFor).toHaveBeenCalledWith(['programme']);
  });

  it('cannot reach another candidate, a mentor or a mentee', async () => {
    asCandidate();
    const visible = await messagingService.getAllowedRecipientIds('candidate');
    expect(visible).not.toEqual(expect.arrayContaining(['mentor', 'mentee', 'peer', 'other-candidate']));
  });

  it('is never offered somebody outside the workspace', async () => {
    asCandidate();
    authzService.adminUserIdsFor.mockResolvedValue(['admin-of-another-workspace']);
    const visible = await messagingService.getAllowedRecipientIds('candidate');
    expect(visible).toEqual(['admin']);
  });

  it('is reachable BY a programme-scoped admin, who has no clan in common with them', async () => {
    mockContext.portalRole = 'admin';
    mockModels.User.findByPk.mockResolvedValue({ id: 'scoped', role: 'admin' });
    authzService.getCapabilities.mockResolvedValue(['admin']);
    authzService.programScopeFor.mockResolvedValue({ unrestricted: false, programIds: ['programme'], clanIds: [] });
    mockModels.PoolMember.findAll.mockResolvedValue([{ userId: 'mentee' }]);

    const visible = await messagingService.getAllowedRecipientIds('scoped');

    expect(visible).toEqual(expect.arrayContaining(['mentee']));
  });
});
