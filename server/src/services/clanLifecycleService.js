const { models } = require('../db');
const { ClanFrozenError, NotFoundError, ForbiddenError } = require('../utils/errors/errorTypes');
const { isProgrammeClan } = require('../config/clanKinds');

/**
 * The single write boundary for completed programme clans.
 *
 * UI flags are guidance, not authorization. Every domain that mutates a clan
 * calls this service so web, mobile, old clients and direct API calls receive
 * the same answer. Standing clans deliberately remain writable even though
 * their source programme is closed.
 */
class ClanLifecycleService {
  async assertClanWritable(clanId, { transaction } = {}) {
    if (!clanId) return null;
    const clan = await models.Clan.findByPk(clanId, {
      attributes: ['id', 'name', 'kind', 'frozenAt', 'programId'],
      transaction,
    });
    if (!clan) throw new NotFoundError('Clan not found');
    if (isProgrammeClan(clan) && clan.frozenAt) {
      throw new ClanFrozenError(`${clan.name} is read-only because its programme has closed. Request a standing clan to continue mentoring.`);
    }
    return clan;
  }

  async assertEnrollmentWritable(enrollmentId, { transaction } = {}) {
    if (!enrollmentId) return null;
    const enrollment = await models.Enrollment.findByPk(enrollmentId, {
      attributes: ['id', 'programId'],
      include: [{ model: models.Program, as: 'program', attributes: ['id', 'name', 'closedAt'] }],
      transaction,
    });
    if (!enrollment) throw new NotFoundError('Enrollment not found');
    if (enrollment.program?.closedAt) {
      throw new ClanFrozenError(`${enrollment.program.name} has closed. Its programme work is read-only.`);
    }
    return enrollment;
  }

  async assertTaskWritable(taskOrId, { transaction } = {}) {
    const id = typeof taskOrId === 'object' ? taskOrId?.id : taskOrId;
    if (!id) throw new NotFoundError('Task not found');
    // withPoolWork: System Pool work has no clan and no enrollment, and without
    // its own check it would pass this boundary unconditionally.
    const task = await models.AssignedTask.scope('withPoolWork').findByPk(id, {
      attributes: ['id', 'clanId', 'enrollmentId', 'poolMemberId'],
      transaction,
    });
    if (!task) throw new NotFoundError('Task not found');
    if (task.poolMemberId) await this.assertPoolWorkWritable(task.poolMemberId, { transaction });
    else if (task.clanId) await this.assertClanWritable(task.clanId, { transaction });
    else if (task.enrollmentId) await this.assertEnrollmentWritable(task.enrollmentId, { transaction });
    return task;
  }

  /**
   * Qualifying work is frozen once its pool has closed or the candidate has an
   * outcome: the selection was made on it, so it can no longer change — not by
   * the candidate resubmitting, nor by a reviewer re-marking it.
   */
  async assertPoolWorkWritable(poolMemberId, { transaction } = {}) {
    const member = await models.PoolMember.findByPk(poolMemberId, {
      attributes: ['id', 'decision'],
      include: [{ model: models.CandidatePool, as: 'pool', attributes: ['id', 'name', 'status', 'archivedAt'] }],
      transaction,
    });
    if (!member || !member.pool) throw new NotFoundError('Task not found');
    if (member.pool.status === 'closed' || member.pool.archivedAt) {
      throw new ForbiddenError(`${member.pool.name} has closed. Its qualifying work is read-only.`);
    }
    if (member.decision) {
      throw new ForbiddenError('A decision has been made for this candidate, so their qualifying work is read-only.');
    }
    return member;
  }
}

module.exports = new ClanLifecycleService();
