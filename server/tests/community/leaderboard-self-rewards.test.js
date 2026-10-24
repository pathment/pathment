const { models, sequelize } = require('../../src/db');
const { cleanDb, createAdmin, createMentor, createMentee, createProgram } = require('../helpers/seed');
const { runWithRequestContext } = require('../../src/utils/auditContext');
const clans = require('../../src/services/clanService');
const community = require('../../src/services/communityService');

// The "Top contributors" leaderboard (#803): you shouldn't be able to earn
// points from yourself. Posting still counts (2 points), but reacting to your
// own post, kudos to yourself, or accepting your own answer don't.
describe('community leaderboard ignores self-rewards', () => {
  let organization, sara, bilal, clan;
  const within = (fn) => runWithRequestContext({ organizationId: organization.id, workspaceJob: true }, fn);
  const pointsOf = async (viewer, person, scope = { scopeType: 'clan', scopeId: clan.id }) => {
    const { leaderboard } = await community.getLeaderboard(viewer, { ...scope, limit: 50 });
    return leaderboard.find((r) => r.userId === person.id)?.points || 0;
  };
  const reactWithAll = async (user, postId) => {
    for (const type of ['cheers', 'celebrate', 'helpful', 'insightful']) await community.toggleReaction(user, postId, type);
  };

  beforeEach(async () => {
    await cleanDb();
    organization = await models.Organization.findOne({ where: { slug: process.env.TENANT_SLUG || 'devweekends' } });
    await within(async () => {
      const admin = await createAdmin({ email: 'admin-leaderboard@test.com' });
      const mentor = await createMentor({ email: 'mentor-leaderboard@test.com' });
      sara = await createMentee({ email: 'sara-leaderboard@test.com' });
      bilal = await createMentee({ email: 'bilal-leaderboard@test.com' });
      const program = await createProgram({ createdBy: admin.id, name: 'Leaderboard programme' });
      clan = await clans.createClan({ programId: program.id, name: 'Leaderboard clan', leadMentorId: mentor.id }, admin.id);
      await clans.addMember(clan.id, { userId: sara.id, role: 'mentee' });
      await clans.addMember(clan.id, { userId: bilal.id, role: 'mentee' });
    });
  });
  afterAll(() => sequelize.close());

  it('does not count reactions on your own post', async () => {
    await within(async () => {
      const post = await community.createPost(sara, { scopeType: 'clan', scopeId: clan.id, body: 'My post' });
      await reactWithAll(sara, post.id);
      expect(await pointsOf(sara, sara)).toBe(2); // the post only
    });
  });

  it('does not count kudos you give yourself', async () => {
    await within(async () => {
      await community.createPost(sara, { type: 'kudos', toId: sara.id, scopeType: 'clan', scopeId: clan.id, body: 'Well done me' });
      expect(await pointsOf(sara, sara)).toBe(2);
    });
  });

  it('does not count an answer you accept on your own question', async () => {
    await within(async () => {
      const question = await community.createPost(sara, { type: 'question', title: 'Q', scopeType: 'clan', scopeId: clan.id, body: 'How?' });
      const answer = await community.addComment(sara, question.id, { body: 'Like this' });
      await community.acceptAnswer(sara, question.id, answer.id);
      expect(await pointsOf(sara, sara)).toBe(2);
    });
  });

  it('still counts the same things when they come from someone else', async () => {
    await within(async () => {
      const post = await community.createPost(sara, { scopeType: 'clan', scopeId: clan.id, body: 'My post' });
      await community.toggleReaction(bilal, post.id, 'helpful');
      await community.createPost(bilal, { type: 'kudos', toId: sara.id, scopeType: 'clan', scopeId: clan.id, body: 'Thanks Sara' });
      const question = await community.createPost(sara, { type: 'question', title: 'Q', scopeType: 'clan', scopeId: clan.id, body: 'How?' });
      const answer = await community.addComment(bilal, question.id, { body: 'Like this' });
      await community.acceptAnswer(sara, question.id, answer.id);

      // Sara: 2 posts (4) + Bilal's reaction (3) + Bilal's kudos (15)
      expect(await pointsOf(sara, sara)).toBe(22);
      // Bilal: his kudos post (2) + accepted answer (25)
      expect(await pointsOf(sara, bilal)).toBe(27);
    });
  });

  it('applies on the Lounge board too, which adds up every space', async () => {
    await within(async () => {
      const post = await community.createPost(sara, { scopeType: 'clan', scopeId: clan.id, body: 'My post' });
      await reactWithAll(sara, post.id);
      expect(await pointsOf(sara, sara, { scopeType: 'global' })).toBe(2);
    });
  });
});
