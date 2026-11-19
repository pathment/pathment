/**
 * The read side of the public API (v1, phase 2): programmes, clans, mentees
 * and their progress, shaped for integrations.
 *
 * Every response is built here from stable fields — never raw rows. Lists are
 * read a page at a time and everything about a page is fetched in a handful of
 * batched queries (no query per row). Model queries are scoped to the API
 * key's workspace by the ORM; the few hand-written SQL fragments name the
 * workspace explicitly, because raw SQL is not scoped automatically.
 */
const { Op, literal } = require('sequelize');
const { models, sequelize } = require('../db');
const { getRequestContext } = require('../utils/auditContext');

const VERIFY_BASE = process.env.CERTIFICATE_VERIFY_BASE_URL || 'https://app.pathment.me/verify';
const OPEN_TASK = ['not_started', 'assigned', 'in_progress'];
const NOT_DONE = ['not_started', 'assigned', 'in_progress', 'revision_needed'];

const orgId = () => {
  const id = getRequestContext().organizationId;
  if (!id) throw new Error('No workspace for this request');
  return id;
};
const esc = (v) => sequelize.escape(v);
const nameOf = (u) => (u ? [u.firstName, u.lastName].filter(Boolean).join(' ') || null : null);
const countBy = (rows, key) => rows.reduce((m, r) => m.set(r[key], (m.get(r[key]) || 0) + 1), new Map());

/** SQL: the users who are mentees in this workspace's clans (optionally one programme or clan). */
function menteeIdsSql({ programmeId = null, clanId = null } = {}) {
  return `(SELECT DISTINCT cm.user_id FROM clan_memberships cm
    JOIN clans c ON c.id = cm.clan_id
    WHERE cm.organization_id = ${esc(orgId())} AND cm.role = 'mentee' AND cm.status IN ('active', 'paused')
    ${programmeId ? `AND c.program_id = ${esc(programmeId)}` : ''}
    ${clanId ? `AND cm.clan_id = ${esc(clanId)}` : ''})`;
}

class ReadService {
  // ── Programmes ──────────────────────────────────────────────────────────────
  async programmes(where, limit) {
    const rows = await models.Program.findAll({ where, order: [['createdAt', 'ASC'], ['id', 'ASC']], limit });
    return this._withProgrammeCounts(rows);
  }

  async programme(id) {
    const row = await models.Program.findByPk(id);
    if (!row) return null;
    return (await this._withProgrammeCounts([row]))[0];
  }

  async _withProgrammeCounts(rows) {
    const ids = rows.map((r) => r.id);
    const clans = ids.length ? await models.Clan.findAll({ where: { programId: ids }, attributes: ['programId'] }) : [];
    const clanCount = countBy(clans, 'programId');
    const menteeCount = new Map();
    if (ids.length) {
      const [counts] = await sequelize.query(`SELECT c.program_id, COUNT(DISTINCT cm.user_id)::int AS n FROM clan_memberships cm
        JOIN clans c ON c.id = cm.clan_id
        WHERE cm.organization_id = ${esc(orgId())} AND cm.role = 'mentee' AND cm.status IN ('active', 'paused')
          AND c.program_id IN (${ids.map(esc).join(',')})
        GROUP BY c.program_id`);
      for (const c of counts) menteeCount.set(c.program_id, c.n);
    }
    return rows.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description || null,
      type: p.type,
      status: p.status,
      clanCount: clanCount.get(p.id) || 0,
      menteeCount: menteeCount.get(p.id) || 0,
      createdAt: p.createdAt,
    }));
  }

  // ── Clans ──────────────────────────────────────────────────────────────────
  async clans(where, limit) {
    const rows = await models.Clan.findAll({
      where,
      include: [{ model: models.User, as: 'leadMentor', attributes: ['id', 'firstName', 'lastName'], required: false }],
      order: [['createdAt', 'ASC'], ['id', 'ASC']],
      limit,
    });
    return this._withClanCounts(rows);
  }

  async clan(id) {
    const row = await models.Clan.findByPk(id, { include: [{ model: models.User, as: 'leadMentor', attributes: ['id', 'firstName', 'lastName'], required: false }] });
    if (!row) return null;
    return (await this._withClanCounts([row]))[0];
  }

  async _withClanCounts(rows) {
    const ids = rows.map((r) => r.id);
    const members = ids.length
      ? await models.ClanMembership.findAll({ where: { clanId: ids, role: 'mentee', status: { [Op.in]: ['active', 'paused'] } }, attributes: ['clanId'] })
      : [];
    const counts = countBy(members, 'clanId');
    return rows.map((c) => ({
      id: c.id,
      name: c.name,
      programmeId: c.programId,
      kind: c.kind,
      status: c.status,
      leadMentor: c.leadMentor ? { id: c.leadMentor.id, name: nameOf(c.leadMentor) } : null,
      menteeCount: counts.get(c.id) || 0,
      createdAt: c.createdAt,
    }));
  }

  // ── Mentees ────────────────────────────────────────────────────────────────
  /** A page of mentees. `after` is the cursor position; returns limit+1 rows for hasMore. */
  async mentees({ programmeId, clanId, email, externalId, updatedSince, after }, limit) {
    const where = { [Op.and]: [{ id: { [Op.in]: literal(menteeIdsSql({ programmeId, clanId })) } }] };
    if (email) where.email = String(email).trim().toLowerCase();
    if (updatedSince) where.updatedAt = { [Op.gt]: updatedSince };
    if (externalId) {
      where[Op.and].push({ id: { [Op.in]: literal(`(SELECT a.user_id FROM external_identities ei JOIN applications a ON a.id = ei.application_id
        WHERE ei.organization_id = ${esc(orgId())} AND ei.external_id = ${esc(String(externalId))} AND a.user_id IS NOT NULL)`) } });
    }
    if (after) where[Op.and].push({ [Op.or]: [{ createdAt: { [Op.gt]: after.t } }, { createdAt: after.t, id: { [Op.gt]: after.id } }] });
    const users = await models.User.findAll({
      where,
      attributes: ['id', 'email', 'firstName', 'lastName', 'status', 'createdAt', 'updatedAt'],
      order: [['createdAt', 'ASC'], ['id', 'ASC']],
      limit,
    });
    return { rows: users, present: await this._presentMentees(users) };
  }

  async mentee(id) {
    const user = await models.User.findOne({
      where: { [Op.and]: [{ id }, { id: { [Op.in]: literal(menteeIdsSql()) } }] },
      attributes: ['id', 'email', 'firstName', 'lastName', 'status', 'createdAt', 'updatedAt'],
    });
    if (!user) return null;
    return (await this._presentMentees([user])).get(user.id);
  }

  async _presentMentees(users) {
    const ids = users.map((u) => u.id);
    const out = new Map();
    if (!ids.length) return out;
    const [memberships, enrollments, identities] = await Promise.all([
      models.ClanMembership.findAll({
        where: { userId: ids, role: 'mentee', status: { [Op.in]: ['active', 'paused'] } },
        include: [{ model: models.Clan, as: 'clan', attributes: ['id', 'name', 'programId'] }],
        attributes: ['userId', 'status'],
      }),
      models.Enrollment.findAll({ where: { menteeId: ids }, attributes: ['menteeId', 'programId', 'status', 'enrolledAt', 'completedAt'] }),
      sequelize.query(`SELECT a.user_id, ei.external_id FROM external_identities ei JOIN applications a ON a.id = ei.application_id
        WHERE ei.organization_id = ${esc(orgId())} AND a.user_id IN (${ids.map(esc).join(',')}) AND ei.external_id NOT LIKE 'email:%'
        ORDER BY ei.updated_at DESC`).then(([r]) => r),
    ]);
    const externalBy = new Map();
    for (const r of identities) if (!externalBy.has(r.user_id)) externalBy.set(r.user_id, r.external_id);
    for (const u of users) {
      out.set(u.id, {
        id: u.id,
        email: u.email,
        firstName: u.firstName || null,
        lastName: u.lastName || null,
        externalId: externalBy.get(u.id) || null,
        status: u.status,
        clans: memberships.filter((m) => m.userId === u.id && m.clan).map((m) => ({
          id: m.clan.id, name: m.clan.name, programmeId: m.clan.programId, membership: m.status,
        })),
        enrollments: enrollments.filter((e) => e.menteeId === u.id).map((e) => ({
          programmeId: e.programId, status: e.status, enrolledAt: e.enrolledAt || null, completedAt: e.completedAt || null,
        })),
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
      });
    }
    return out;
  }

  // ── Progress ───────────────────────────────────────────────────────────────
  /** One mentee's progress, one object per programme they're enrolled in. */
  async menteeProgress(menteeId, { programmeId = null } = {}) {
    const where = { menteeId };
    if (programmeId) where.programId = programmeId;
    const enrollments = await models.Enrollment.findAll({ where, order: [['createdAt', 'ASC']] });
    return this._progress(enrollments);
  }

  /** A page of progress for a programme (one per enrolled mentee). */
  async programmeProgress(programmeId, { clanId = null, after = null }, limit) {
    const where = { programId: programmeId };
    if (clanId) {
      where.menteeId = { [Op.in]: literal(`(SELECT user_id FROM clan_memberships WHERE organization_id = ${esc(orgId())}
        AND clan_id = ${esc(clanId)} AND role = 'mentee' AND status IN ('active', 'paused'))`) };
    }
    if (after) where[Op.or] = [{ createdAt: { [Op.gt]: after.t } }, { createdAt: after.t, id: { [Op.gt]: after.id } }];
    const enrollments = await models.Enrollment.findAll({ where, order: [['createdAt', 'ASC'], ['id', 'ASC']], limit });
    return { rows: enrollments, present: await this._progress(enrollments, { byEnrollment: true }) };
  }

  async _progress(enrollments, { byEnrollment = false } = {}) {
    if (!enrollments.length) return byEnrollment ? new Map() : [];
    const enrollmentIds = enrollments.map((e) => e.id);
    const menteeIds = [...new Set(enrollments.map((e) => e.menteeId))];
    const programmeIds = [...new Set(enrollments.map((e) => e.programId))];

    const [programmes, clans, tasks, roadmapRows, templates] = await Promise.all([
      models.Program.findAll({ where: { id: programmeIds }, attributes: ['id', 'name'] }),
      models.Clan.findAll({ where: { programId: programmeIds }, attributes: ['id', 'name', 'programId'] }),
      models.AssignedTask.findAll({
        where: { enrollmentId: enrollmentIds, status: { [Op.ne]: 'cancelled' } },
        attributes: ['enrollmentId', 'status', 'dueDate'],
      }),
      models.RoadmapProgress.findAll({
        where: { menteeId: menteeIds, enrollmentId: enrollmentIds },
        include: [{ model: models.Roadmap, as: 'roadmap', attributes: ['id', 'name'] }],
        attributes: ['enrollmentId', 'roadmapId', 'currentStep', 'completed'],
      }),
      models.CertificateTemplate.findAll({ where: { programId: programmeIds }, attributes: ['id', 'programId'] }),
    ]);
    const clanIds = clans.map((c) => c.id);
    const roadmapIds = [...new Set(roadmapRows.map((r) => r.roadmapId))];
    const [memberships, stepCounts, sessions, certificates] = await Promise.all([
      clanIds.length ? models.ClanMembership.findAll({
        where: { userId: menteeIds, clanId: clanIds, role: 'mentee', status: { [Op.in]: ['active', 'paused'] } },
        attributes: ['userId', 'clanId'],
      }) : [],
      roadmapIds.length ? models.RoadmapTask.count({ where: { roadmapId: roadmapIds }, group: ['roadmapId'] }) : [],
      clanIds.length ? models.CohortReviewSession.findAll({ where: { clanId: clanIds }, attributes: ['id', 'clanId'] }) : [],
      templates.length ? models.CertificateInstance.findAll({
        where: { menteeId: menteeIds, templateId: templates.map((t) => t.id) },
        attributes: ['menteeId', 'templateId', 'tier', 'certificateNumber', 'createdAt'],
      }) : [],
    ]);
    const sessionIds = sessions.map((s) => s.id);
    const entries = sessionIds.length ? await models.CohortReviewEntry.findAll({
      where: { sessionId: sessionIds, menteeId: menteeIds },
      attributes: ['sessionId', 'menteeId', 'attendance'],
    }) : [];

    const programmeBy = new Map(programmes.map((p) => [p.id, p]));
    const clanBy = new Map(clans.map((c) => [c.id, c]));
    const steps = new Map(stepCounts.map((s) => [s.roadmapId || s.roadmap_id, Number(s.count)]));
    const sessionClan = new Map(sessions.map((s) => [s.id, s.clanId]));
    const templateProgramme = new Map(templates.map((t) => [t.id, t.programId]));
    const now = Date.now();

    const results = enrollments.map((e) => {
      const programme = programmeBy.get(e.programId);
      const clanIdsHere = new Set(clans.filter((c) => c.programId === e.programId).map((c) => c.id));
      const membership = memberships.find((m) => m.userId === e.menteeId && clanIdsHere.has(m.clanId));
      const clan = membership ? clanBy.get(membership.clanId) : null;

      const mine = tasks.filter((t) => t.enrollmentId === e.id);
      const tally = {
        total: mine.length,
        open: mine.filter((t) => OPEN_TASK.includes(t.status)).length,
        submitted: mine.filter((t) => t.status === 'submitted').length,
        completed: mine.filter((t) => t.status === 'completed').length,
        revisionNeeded: mine.filter((t) => t.status === 'revision_needed').length,
        overdue: mine.filter((t) => NOT_DONE.includes(t.status) && t.dueDate && new Date(t.dueDate).getTime() < now).length,
      };
      const completionPercent = tally.total
        ? Math.round((tally.completed / tally.total) * 100)
        : Math.round(Number(e.overallProgressPercentage) || 0);

      const roadmaps = roadmapRows.filter((r) => r.enrollmentId === e.id && r.roadmap).map((r) => {
        const total = steps.get(r.roadmapId) || 0;
        return {
          id: r.roadmapId,
          name: r.roadmap.name,
          currentStep: r.completed ? total : Math.min(Number(r.currentStep) || 0, total),
          totalSteps: total,
          completed: !!r.completed,
        };
      });

      const attended = entries.filter((x) => x.menteeId === e.menteeId && clanIdsHere.has(sessionClan.get(x.sessionId)) && x.attendance);
      const present = attended.filter((x) => x.attendance === 'present').length;
      const attendance = {
        sessions: attended.length,
        present,
        absent: attended.filter((x) => x.attendance === 'absent').length,
        excused: attended.filter((x) => x.attendance === 'excused').length,
        rate: attended.length ? Math.round((present / attended.length) * 100) / 100 : null,
      };

      const certs = certificates
        .filter((c) => c.menteeId === e.menteeId && templateProgramme.get(c.templateId) === e.programId)
        .map((c) => ({
          number: c.certificateNumber || null,
          tier: c.tier,
          issuedAt: c.createdAt,
          verifyUrl: c.certificateNumber ? `${VERIFY_BASE}/${encodeURIComponent(c.certificateNumber)}` : null,
        }));

      return {
        menteeId: e.menteeId,
        programme: programme ? { id: programme.id, name: programme.name } : { id: e.programId, name: null },
        clan: clan ? { id: clan.id, name: clan.name } : null,
        enrollment: { status: e.status, enrolledAt: e.enrolledAt || null, completedAt: e.completedAt || null },
        completionPercent,
        points: Number(e.totalPointsEarned) || 0,
        tasks: tally,
        roadmaps,
        attendance,
        certificates: certs,
        updatedAt: e.updatedAt,
      };
    });
    if (!byEnrollment) return results;
    return new Map(enrollments.map((e, i) => [e.id, results[i]]));
  }
}

module.exports = new ReadService();
