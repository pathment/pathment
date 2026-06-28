const { models } = require('../db');
const { Op, fn, col } = require('sequelize');
const { catchAsync } = require('../middlewares/errorHandler');
const { NotFoundError } = require('../utils/errors/errorTypes');
const programReviewService = require('../services/programReviewService');

const TERMINAL_ENROLLMENT_STATUSES = ['program_completed', 'dropped', 'rejected', 'withdrawn'];

/**
 * Get all active mentors
 */
const getAllMentors = catchAsync(async (req, res) => {
  const { search, page = 1, limit = 20, accepting } = req.query;
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
  const offset = (pageNum - 1) * limitNum;

  // Include suspended mentors so they stay visible and can be UNsuspended
  // (active-only filtering made a just-suspended person disappear from the list).
  const where = { role: 'mentor', status: { [Op.in]: ['active', 'suspended'] } };

  const searchConditions = search ? {
    [Op.or]: [
      { firstName: { [Op.iLike]: `%${search}%` } },
      { lastName: { [Op.iLike]: `%${search}%` } },
      { email: { [Op.iLike]: `%${search}%` } }
    ]
  } : {};

  // Build mentor profile include - optionally filter by accepting status
  const mentorProfileInclude = {
    model: models.MentorProfile,
    as: 'mentorProfile',
    attributes: [
      'specialization', 'maxMentees', 'currentMenteeCount', 'title', 'organization',
      'isAcceptingMentees', 'avgFeedbackRating', 'totalMenteesGuided', 'yearsOfExperience',
    ],
  };

  if (accepting === 'true' || accepting === 'false') {
    mentorProfileInclude.where = { isAcceptingMentees: accepting === 'true' };
    mentorProfileInclude.required = true;
  }

  const { count, rows: mentors } = await models.User.findAndCountAll({
    where: { ...where, ...searchConditions },
    attributes: ['id', 'firstName', 'lastName', 'email', 'status', 'createdAt', 'lastLoginAt', 'profilePictureUrl'],
    include: [mentorProfileInclude],
    order: [['firstName', 'ASC']],
    limit: limitNum,
    offset,
    distinct: true,
  });

  // Attach each mentor's clans (lead/co-mentor) + skills (specializations) via
  // batched queries — so the admin table shows which clans they run + expertise
  // without row-multiplying the paginated list.
  const mentorIds = mentors.map((m) => m.id);
  const [clanRows, skillUsers] = mentorIds.length ? await Promise.all([
    models.ClanMembership.findAll({
      where: { userId: { [Op.in]: mentorIds }, status: 'active', role: { [Op.in]: ['lead_mentor', 'co_mentor'] } },
      include: [{ model: models.Clan, as: 'clan', attributes: ['id', 'name'] }],
    }),
    models.User.findAll({
      where: { id: { [Op.in]: mentorIds } }, attributes: ['id'],
      include: [{ model: models.Skill, as: 'skills', attributes: ['name'], through: { attributes: [] } }],
    }),
  ]) : [[], []];
  const clansByUser = new Map();
  for (const m of clanRows) {
    if (!m.clan) continue;
    const arr = clansByUser.get(m.userId) || [];
    arr.push({ id: m.clan.id, name: m.clan.name, role: m.role });
    clansByUser.set(m.userId, arr);
  }
  const skillsByUser = new Map(skillUsers.map((u) => [u.id, (u.skills || []).map((s) => s.name)]));

  // Active mentees per mentor = sum of active mentees across the clans they run.
  const allClanIds = [...new Set(clanRows.map((r) => r.clanId).filter(Boolean))];
  const menteeCountRows = allClanIds.length ? await models.ClanMembership.findAll({
    where: { clanId: { [Op.in]: allClanIds }, role: 'mentee', status: 'active' },
    attributes: ['clanId', [fn('COUNT', col('id')), 'n']], group: ['clanId'], raw: true,
  }) : [];
  const countByClan = new Map(menteeCountRows.map((r) => [r.clanId, Number(r.n)]));
  const menteesByUser = new Map();
  for (const m of clanRows) {
    menteesByUser.set(m.userId, (menteesByUser.get(m.userId) || 0) + (countByClan.get(m.clanId) || 0));
  }

  const mentorRows = mentors.map((m) => {
    const json = m.toJSON();
    json.clans = clansByUser.get(m.id) || [];
    json.specializations = skillsByUser.get(m.id) || [];
    json.activeMentees = menteesByUser.get(m.id) || 0;
    return json;
  });

  res.status(200).json({
    status: 'success',
    data: { mentors: mentorRows },
    pagination: {
      page: pageNum,
      limit: limitNum,
      totalItems: count,
      totalPages: Math.ceil(count / limitNum),
    },
  });
});

/**
 * Get a single mentor's full profile (admin)
 */
const getMentorById = catchAsync(async (req, res) => {
  const { id } = req.params;

  const mentor = await models.User.findOne({
    where: { id, role: 'mentor' },
    attributes: ['id', 'firstName', 'lastName', 'email', 'profilePictureUrl', 'createdAt'],
    include: [
      {
        model: models.MentorProfile,
        as: 'mentorProfile',
        attributes: [
          'title', 'organization', 'yearsOfExperience',
          'specialization', 'linkedinUrl', 'githubUrl', 'portfolioUrl',
          'maxMentees', 'currentMenteeCount', 'avgResponseTimeHours',
          'totalMenteesGuided', 'successRate', 'avgFeedbackRating',
          'totalTasksReviewed', 'isAcceptingMentees', 'preferredMenteeLevel'
        ]
      },
      {
        model: models.Skill,
        as: 'skills',
        attributes: ['id', 'name', 'category'],
        through: { attributes: ['proficiencyLevel'] }
      }
    ]
  });

  if (!mentor) throw new NotFoundError('Mentor not found');

  // ── Mentee resolution is CLAN-based (the live data model) ──
  // This org assigns mentees by placing them in a clan the mentor leads/co-mentors,
  // NOT by creating MentorMenteeMatch rows. The legacy match-based stats therefore
  // always read 0. We compute every stat from the mentor's clans + the mentees'
  // enrollments in those clans' programs (mirrors getAllMentors' approach).
  const clanRows = await models.ClanMembership.findAll({
    where: { userId: id, status: 'active', role: { [Op.in]: ['lead_mentor', 'co_mentor', 'core_team'] } },
    include: [{ model: models.Clan, as: 'clan', attributes: ['id', 'name', 'programId'] }],
  }).catch(() => []);

  const clanIds = [...new Set(clanRows.map((r) => r.clanId).filter(Boolean))];
  const programIds = [...new Set(clanRows.map((r) => r.clan?.programId).filter(Boolean))];

  // All active mentee memberships in those clans (one batched query → no N+1).
  const menteeMemberships = clanIds.length
    ? await models.ClanMembership.findAll({
        where: { clanId: { [Op.in]: clanIds }, role: 'mentee', status: 'active' },
        include: [{
          model: models.User,
          as: 'user',
          attributes: ['id', 'firstName', 'lastName', 'email', 'profilePictureUrl'],
        }],
      }).catch(() => [])
    : [];

  // De-dupe mentees (a person could be in more than one of the mentor's clans).
  const menteeById = new Map();
  const clanByMentee = new Map();
  for (const m of menteeMemberships) {
    if (!m.user) continue;
    if (!menteeById.has(m.userId)) {
      menteeById.set(m.userId, m.user);
      const cl = clanRows.find((c) => c.clanId === m.clanId)?.clan;
      clanByMentee.set(m.userId, { id: cl?.id, name: cl?.name, programId: cl?.programId });
    }
  }
  const menteeIds = [...menteeById.keys()];

  // Pull every enrollment for those mentees in the mentor's programs in one query,
  // then bucket by mentee. Used both for the active-mentee list (with program +
  // progress) and the success-rate computation.
  const enrollments = menteeIds.length && programIds.length
    ? await models.Enrollment.findAll({
        where: { menteeId: { [Op.in]: menteeIds }, programId: { [Op.in]: programIds } },
        attributes: ['id', 'menteeId', 'programId', 'status', 'overallProgressPercentage', 'enrolledAt'],
        include: [{ model: models.Program, as: 'program', attributes: ['id', 'name'] }],
        order: [['enrolledAt', 'DESC']],
      }).catch(() => [])
    : [];

  const enrollmentsByMentee = new Map();
  for (const e of enrollments) {
    const arr = enrollmentsByMentee.get(e.menteeId) || [];
    arr.push(e);
    enrollmentsByMentee.set(e.menteeId, arr);
  }

  // Active mentees = current clan mentees, paired with their best enrollment in the
  // mentor's program (prefer a non-terminal one). Shaped like the old MentorMenteeMatch
  // payload so the client renders unchanged: { id, mentee, enrollment{ ...program } }.
  const activeMatches = menteeIds.map((mid) => {
    const list = enrollmentsByMentee.get(mid) || [];
    const enr = list.find((e) => !TERMINAL_ENROLLMENT_STATUSES.includes(e.status)) || list[0] || null;
    return {
      id: `${id}:${mid}`,
      status: 'active',
      mentee: menteeById.get(mid),
      clan: clanByMentee.get(mid) || null,
      enrollment: enr
        ? {
            id: enr.id,
            status: enr.status,
            overallProgressPercentage: enr.overallProgressPercentage,
            program: enr.program ? { id: enr.program.id, name: enr.program.name } : null,
          }
        : null,
    };
  });

  // Success rate over all enrollments that reached a terminal state.
  const completedCount = enrollments.filter((e) => e.status === 'program_completed').length;
  const finishedCount = enrollments.filter((e) => TERMINAL_ENROLLMENT_STATUSES.includes(e.status)).length;
  const successRate = finishedCount > 0
    ? parseFloat(((completedCount / finishedCount) * 100).toFixed(1))
    : 0;

  // Total mentees guided = distinct mentees ever placed in the mentor's clans
  // (any membership status), so completed/graduated mentees still count.
  const everMembers = clanIds.length
    ? await models.ClanMembership.findAll({
        where: { clanId: { [Op.in]: clanIds }, role: 'mentee' },
        attributes: ['userId'],
        raw: true,
      }).catch(() => [])
    : [];
  const totalMenteesGuided = new Set(everMembers.map((m) => m.userId)).size;

  // Avg rating comes from anonymous mentee→mentor program reviews (the real source),
  // not the never-written MentorMenteeMatch.menteeSatisfactionRating column.
  const feedbackSummary = await programReviewService.getMentorFeedbackSummary(id).catch(() => null);
  const avgFeedbackRating = feedbackSummary?.revealed && feedbackSummary.overall != null
    ? feedbackSummary.overall
    : null;

  // Tasks reviewed = task feedback rows authored by this mentor.
  const totalTasksReviewed = await models.TaskFeedback.count({ where: { mentorId: id } }).catch(() => 0);

  const mentorJson = mentor.toJSON();
  // Override stale stored stats with live-computed values
  if (mentorJson.mentorProfile) {
    mentorJson.mentorProfile.totalMenteesGuided = totalMenteesGuided;
    mentorJson.mentorProfile.successRate = successRate;
    mentorJson.mentorProfile.avgFeedbackRating = avgFeedbackRating;
    mentorJson.mentorProfile.totalTasksReviewed = totalTasksReviewed;
    // Keep capacity card honest: current mentees = live active clan-mentee count.
    mentorJson.mentorProfile.currentMenteeCount = menteeIds.length;
  }

  res.status(200).json({
    success: true,
    message: 'Mentor profile retrieved successfully',
    statusCode: 200,
    data: {
      mentor: mentorJson,
      activeMatches
    }
  });
});

module.exports = {
  getAllMentors,
  getMentorById
};
