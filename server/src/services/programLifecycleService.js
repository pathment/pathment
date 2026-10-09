const { Op } = require('sequelize');
const { models, sequelize } = require('../db');
const { ForbiddenError, NotFoundError, ValidationError } = require('../utils/errors/errorTypes');
const { PERMISSIONS } = require('../config/permissions');
const authz = require('./authzService');
const performanceService = require('./performanceService');

const ACTIVE = ['approved', 'pending_match', 'matched', 'active', 'pending_completion', 'level_completed', 'program_completed', 'dropped'];

function outcomeFromEnrollment(enrollment, verification) {
  if (enrollment.status === 'dropped') return 'dropped';
  if (verification?.decision === 'award') return 'certified';
  if (verification?.decision === 'no_certificate') return 'completed_uncertified';
  return enrollment.status === 'program_completed' ? 'completed' : 'completed';
}

function enrollmentStatusAtClose(enrollment) {
  if (enrollment.status === 'dropped') return 'dropped';
  return 'program_completed';
}

/** Resolve close timestamp: omit/empty → now; YYYY-MM-DD  */
function resolveClosedAt(value, todayKey = new Date().toISOString().slice(0, 10)) {
  if (value == null || value === '') return new Date();
  const raw = String(value).trim();
  const dayOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw);
  const closedAt = dayOnly ? new Date(`${raw}T12:00:00.000Z`) : new Date(raw);
  if (Number.isNaN(closedAt.getTime())) throw new ValidationError('Enter a valid close date');
  const closeKey = closedAt.toISOString().slice(0, 10);
  if (closeKey > todayKey) throw new ValidationError('Close date cannot be in the future');
  return closedAt;
}

function dateKey(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  return new Date(value).toISOString().slice(0, 10);
}

class ProgramLifecycleService {
  async assertAdmin(actor, programId) {
    if (!await authz.hasAdminAccess(actor)) throw new ForbiddenError('Only an admin can close or reopen a program');
    if (programId && !await authz.can(actor, PERMISSIONS.PROGRAM_MANAGE, { programId })) {
      throw new ForbiddenError('You cannot manage this program');
    }
  }

  async localToday(program, now = new Date()) {
    const org = await models.Organization.findByPk(program.organizationId, { attributes: ['timezone'] });
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: org?.timezone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(now);
  }

  /** Certificate review rows for close preview — informational only; does not block close. */
  async decisions(programId, transaction) {
    const templates = await models.CertificateTemplate.findAll({
      where: { programId }, transaction, lock: transaction ? transaction.LOCK.UPDATE : undefined,
    });
    const enrollments = await models.Enrollment.findAll({
      where: { programId, status: { [Op.in]: ACTIVE } }, transaction,
    });
    const templateIds = templates.map(t => t.id);
    const rows = templateIds.length ? await models.CertificateVerification.findAll({
      where: { templateId: { [Op.in]: templateIds } }, transaction,
      order: [['verifiedAt', 'DESC'], ['createdAt', 'DESC']],
    }) : [];
    const issuedRows = templateIds.length ? await models.CertificateInstance.findAll({
      where: { templateId: { [Op.in]: templateIds }, menteeId: { [Op.in]: enrollments.map(e => e.menteeId) } },
      attributes: ['menteeId'], transaction, raw: true,
    }) : [];
    const issuedMentees = new Set(issuedRows.map(r => r.menteeId));
    const byMentee = new Map();
    const unresolved = [];
    const withoutCertificate = [];
    for (const enrollment of enrollments) {
      const decisions = rows.filter(r => r.menteeId === enrollment.menteeId);
      const settled = decisions.filter(r => r.status === 'verified' && ['award', 'no_certificate'].includes(r.decision));
      if (!issuedMentees.has(enrollment.menteeId) && !settled.some(d => d.decision === 'award')) {
        withoutCertificate.push(enrollment.menteeId);
      }
      const signatures = new Set(settled.map(r => `${r.decision}:${r.finalTier || ''}`));
      if (!settled.length || decisions.some(r => r.status !== 'verified' || r.decision === 'undecided') || signatures.size > 1) {
        unresolved.push(enrollment.menteeId);
        continue;
      }
      const decision = settled[0];
      if (decision.decision === 'award' && !decision.finalTier) {
        unresolved.push(enrollment.menteeId);
        continue;
      }
      byMentee.set(enrollment.menteeId, decision);
    }
    return { enrollments, byMentee, unresolved, withoutCertificate };
  }

  async preview(programId, actor) {
    await this.assertAdmin(actor, programId);
    const program = await models.Program.findByPk(programId);
    if (!program) throw new NotFoundError('Program not found');
    const { enrollments, unresolved, withoutCertificate } = await this.decisions(programId);
    const today = await this.localToday(program);
    const ended = Boolean(program.endDate && dateKey(program.endDate) <= today);
    const earliestCloseDate = dateKey(program.startDate) || dateKey(program.createdAt);
    const started = !earliestCloseDate || earliestCloseDate <= today;
    const pending = unresolved.length
      ? await models.User.findAll({ where: { id: { [Op.in]: unresolved } }, attributes: ['id', 'firstName', 'lastName'] })
      : [];
    const missingCertificates = withoutCertificate.length
      ? await models.User.findAll({ where: { id: { [Op.in]: withoutCertificate } }, attributes: ['id', 'firstName', 'lastName'] })
      : [];
    return {
      ended,
      started,
      closed: Boolean(program.closedAt),
      // The scheduled end is planning metadata, not an admin lock. Once a
      // program has started, a full-access admin may close it on any historical
      // date from the start through today.
      canClose: !program.closedAt && started,
      featureAvailable: true,
      earliestCloseDate,
      today,
      scheduledEndDate: dateKey(program.endDate),
      enrollmentCount: enrollments.length,
      unresolved: pending,
      certificatesNotIssued: missingCertificates,
      certificatesNotIssuedMessage: missingCertificates.length
        ? 'Certificates are not issued for some mentees. You can still close the program.'
        : null,
    };
  }

  async closeProgram(programId, actor, { closedAt: closedAtInput } = {}) {
    await this.assertAdmin(actor, programId);
    return sequelize.transaction(async transaction => {
      const program = await models.Program.findByPk(programId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!program) throw new NotFoundError('Program not found');
      if (program.closedAt) return program;

      const cohortClans = await models.Clan.findAll({
        where: { programId, kind: 'cohort' }, transaction, lock: transaction.LOCK.UPDATE, order: [['id', 'ASC']],
      });
      const { enrollments } = await this.decisions(programId, transaction);
      const today = await this.localToday(program);
      const closedAt = resolveClosedAt(closedAtInput, today);
      const startKey = dateKey(program.startDate) || dateKey(program.createdAt);
      const closeKey = dateKey(closedAt);
      if (startKey && closeKey < startKey) {
        throw new ValidationError(`Close date cannot be before the program start date (${startKey})`);
      }

      const groups = new Map();
      for (const enrollment of enrollments) {
        const key = enrollment.cohortId || 'program';
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(enrollment);
      }
      for (const group of groups.values()) {
        const scores = await performanceService.scoreMentees(
          group.map(e => e.menteeId),
          { programId, transaction, live: true, asOf: closedAt },
        );
        for (const enrollment of group) {
          const status = enrollmentStatusAtClose(enrollment);
          const performance = scores.mentees.find(m => m.id === enrollment.menteeId);
          await enrollment.update({
            status,
            ...(performance ? {
              tasksCompleted: performance.evidence.tasksCompleted,
              overallProgressPercentage: performance.evidence.absoluteProgress,
            } : {}),
            ...(status === 'dropped'
              ? { droppedAt: enrollment.droppedAt || closedAt }
              : { completedAt: enrollment.completedAt || closedAt }),
          }, { transaction });
        }
      }

      await models.Clan.update({ frozenAt: closedAt }, { where: { programId, kind: 'cohort' }, transaction });
      const cohortClanIds = cohortClans.map(clan => clan.id);
      if (cohortClanIds.length) {
        await models.ReviewSchedule.update(
          { active: false },
          { where: { clanId: { [Op.in]: cohortClanIds }, active: true }, transaction },
        );
        await models.CohortReviewSession.update(
          { status: 'finished', meetingEndedAt: closedAt },
          {
            where: {
              clanId: { [Op.in]: cohortClanIds },
              scheduledAt: { [Op.gt]: closedAt },
              meetingStartedAt: null,
            },
            transaction,
          },
        );
      }
      await models.Cohort.update({ status: 'completed' }, { where: { programId }, transaction });
      await program.update({ status: 'completed', closedAt }, { transaction });
      transaction.afterCommit(() => require('./clanHealthService').invalidate());
      return program;
    });
  }

  async reopenProgram(programId, reason, actor) {
    await this.assertAdmin(actor, programId);
    if (!String(reason || '').trim()) throw new ValidationError('Explain why the program is being reopened');
    return sequelize.transaction(async transaction => {
      const program = await models.Program.findByPk(programId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!program) throw new NotFoundError('Program not found');
      if (!program.closedAt) throw new ValidationError('This program has no formal close to reopen');
      await program.update({ status: 'published', closedAt: null }, { transaction });
      await models.Clan.update({ frozenAt: null }, { where: { programId, kind: 'cohort' }, transaction });
      await models.Cohort.update({ status: 'running' }, { where: { programId, status: 'completed' }, transaction });
      transaction.afterCommit(() => require('./clanHealthService').invalidate());
      return { programId, reopenedAt: new Date(), reopenReason: reason.trim(), reopenedBy: actor.id };
    });
  }

  async results(programId, actor) {
    await require('./programService').getProgramById(
      programId, actor.id, await authz.hasAdminAccess(actor) ? 'admin' : actor.role,
    );
    const admin = await authz.hasAdminAccess(actor);
    if (admin) await authz.assertProgramInScope(actor, programId);
    const mentorClans = admin ? [] : await authz.mentoredClanIds(actor.id);
    const program = await models.Program.findByPk(programId);
    const enrollments = await models.Enrollment.findAll({
      where: { programId, status: { [Op.in]: ['program_completed', 'dropped', 'level_completed', 'pending_completion', 'active'] } },
      include: [{ model: models.User, as: 'mentee', attributes: ['id', 'firstName', 'lastName'] }],
    });
    const templates = await models.CertificateTemplate.findAll({ where: { programId }, attributes: ['id'] });
    const templateIds = templates.map(t => t.id);
    const menteeIds = enrollments.map(e => e.menteeId);
    const verificationRows = templateIds.length && menteeIds.length
      ? await models.CertificateVerification.findAll({
        where: { templateId: { [Op.in]: templateIds }, menteeId: { [Op.in]: menteeIds } },
        order: [['verifiedAt', 'DESC'], ['createdAt', 'DESC']],
      })
      : [];
    const verificationByMentee = new Map();
    for (const row of verificationRows) {
      if (!verificationByMentee.has(row.menteeId)) verificationByMentee.set(row.menteeId, row);
    }
    let scoreByMentee = new Map();
    if (program.closedAt && menteeIds.length) {
      // Final results are frozen to the close date — ignore activity after closedAt.
      const scored = await performanceService.scoreMentees(
        menteeIds, { programId, live: true, asOf: program.closedAt },
      );
      for (const m of scored.mentees) scoreByMentee.set(m.id, m);
    }
    const rankByMentee = new Map();
    if (scoreByMentee.size) {
      [...scoreByMentee.entries()]
        .filter(([, m]) => m.score != null)
        .sort((a, b) => b[1].score - a[1].score)
        .forEach(([id], index) => rankByMentee.set(id, index + 1));
    }
    const memberships = mentorClans.length
      ? await models.ClanMembership.findAll({
        where: { clanId: { [Op.in]: mentorClans }, role: 'mentee' }, attributes: ['userId', 'clanId'],
      })
      : [];
    const menteeClanIds = new Map();
    for (const m of memberships) {
      (menteeClanIds.get(m.userId) || menteeClanIds.set(m.userId, []).get(m.userId)).push(m.clanId);
    }
    const closureKey = program.closedAt ? `closed:${program.id}` : null;
    const snapshots = enrollments
      .filter(e => admin || e.menteeId === actor.id || (menteeClanIds.get(e.menteeId) || []).length)
      .map(e => {
        const verification = verificationByMentee.get(e.menteeId);
        const scored = scoreByMentee.get(e.menteeId);
        const evidence = scored?.evidence;
        return {
          id: e.id,
          enrollmentId: e.id,
          menteeId: e.menteeId,
          mentee: e.mentee,
          outcome: outcomeFromEnrollment(e, verification),
          tier: verification?.decision === 'award' ? (verification.finalTier || null) : null,
          cohortRank: rankByMentee.get(e.menteeId) ?? null,
          performance: scored ? {
            score: scored.score ?? null,
            evidence: {
              absoluteProgress: Number(evidence?.absoluteProgress ?? e.overallProgressPercentage) || 0,
              onTimeRate: evidence?.onTimeRate ?? null,
              tasksCompleted: evidence?.tasksCompleted ?? e.tasksCompleted,
              attendance: evidence?.attendance ?? null,
            },
            parts: scored.parts || [],
          } : {
            score: null,
            evidence: {
              absoluteProgress: Number(e.overallProgressPercentage) || 0,
              onTimeRate: null,
              tasksCompleted: e.tasksCompleted,
              attendance: null,
            },
            parts: [],
          },
          decision: verification ? {
            decision: verification.decision,
            overrideReason: verification.overrideReason || undefined,
          } : null,
          clanIds: menteeClanIds.get(e.menteeId) || [],
          closureId: closureKey,
        };
      });
    const history = program.closedAt
      ? [{ id: closureKey, closedAt: program.closedAt, closedBy: null, reopenedAt: null, reopenedBy: null, reopenReason: null }]
      : [];
    return {
      closed: Boolean(program.closedAt),
      closedAt: program.closedAt,
      currentClosureId: history[0]?.id || null,
      history,
      snapshots,
    };
  }
}

module.exports = new ProgramLifecycleService();
