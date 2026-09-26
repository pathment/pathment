const { models, sequelize } = require('../db');
const { NotFoundError, ValidationError } = require('../utils/errors/errorTypes');

const fullName = (u) => (u ? `${u.firstName} ${u.lastName}`.trim() : null);
const credits = value => {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw new ValidationError('Cost and stock must be non-negative whole numbers');
  return number;
};

/** Rewards: gift catalog + redemptions. */
class RewardsService {
  async auditGift(gift, oldValues, transaction) {
    const { getRequestContext } = require('../utils/auditContext');
    const ctx = getRequestContext();
    await models.AuditLog.create({ userId: ctx.userId || null, action: oldValues ? 'reward.updated' : 'reward.created',
      entityType: 'gift', entityId: gift.id, oldValues, newValues: gift.toJSON(),
      ipAddress: ctx.ip || null, userAgent: ctx.userAgent || null }, { transaction });
  }
  /**
   * The catalogue, plus who has spent points recently.
   *
   * The history is scoped to the caller's own clans unless they administer the
   * programme. It used to be the latest twenty redemptions across the whole
   * organisation for everyone who could read this route, so a mentor of one
   * clan was shown the names of mentees in clans they have nothing to do with.
   * Pass no viewer and it stays org wide, which is what an admin screen wants.
   */
  async overview(viewer = null) {
    const scopeToClans = viewer && !(await require('./authzService').can(viewer, require('../config/permissions').PERMISSIONS.MENTEE_VIEW, { orgWide: true }));

    let menteeIds = null;
    if (scopeToClans) {
      const mine = await models.ClanMembership.findAll({
        where: { userId: viewer.id, status: 'active' },
        attributes: ['clanId']
      });
      const clanIds = [...new Set(mine.map((row) => row.clanId))];

      const members = clanIds.length
        ? await models.ClanMembership.findAll({
            where: { clanId: clanIds, role: 'mentee', status: 'active' },
            attributes: ['userId']
          })
        : [];

      menteeIds = [...new Set(members.map((row) => row.userId))];
    }

    const [gifts, redemptions] = await Promise.all([
      models.Gift.findAll({ where: { active: true }, order: [['created_at', 'DESC']] }),
      // No clan means nobody to show, rather than everybody.
      menteeIds && menteeIds.length === 0
        ? []
        : models.Redemption.findAll({
            where: menteeIds ? { menteeId: menteeIds } : undefined,
            order: [['created_at', 'DESC']],
            limit: 20,
            include: [
              { model: models.Gift, as: 'gift', attributes: ['name'] },
              { model: models.User, as: 'mentee', attributes: ['firstName', 'lastName'] }
            ]
          })
    ]);

    return {
      gifts: gifts.map((g) => ({ id: g.id, name: g.name, description: g.description, costXp: g.costXp, imageUrl: g.imageUrl, stock: g.stock })),
      redemptions: redemptions.map((r) => ({
        id: r.id,
        gift: r.gift?.name || 'Gift',
        mentee: fullName(r.mentee),
        costXp: r.costXp,
        at: r.createdAt
      }))
    };
  }

  async createGift(data, createdBy) {
    if (!data.name || !data.name.trim()) throw new ValidationError('name is required');
    return sequelize.transaction(async transaction => {
      const gift = await models.Gift.create({
        name: data.name.trim(),
        description: data.description || null,
        costXp: credits(data.costXp ?? 0),
        imageUrl: data.imageUrl || null,
        stock: data.stock === null || data.stock === undefined || data.stock === '' ? null : credits(data.stock),
        active: true,
        createdBy
      }, { transaction });
      await this.auditGift(gift, null, transaction);
      return gift;
    });
  }

  async updateGift(id, data) {
    return sequelize.transaction(async transaction => {
      const g = await models.Gift.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!g) throw new NotFoundError('Gift not found');
      const oldValues = g.toJSON();
      if (data.name !== undefined) {
        if (typeof data.name !== 'string' || !data.name.trim()) throw new ValidationError('name is required');
        g.name = data.name.trim();
      }
      if (data.description !== undefined) g.description = data.description;
      if (data.costXp !== undefined) g.costXp = credits(data.costXp);
      if (data.imageUrl !== undefined) g.imageUrl = data.imageUrl || null;
      if (data.stock !== undefined) g.stock = data.stock === null || data.stock === '' ? null : credits(data.stock);
      if (data.active !== undefined) g.active = !!data.active;
      await g.save({ transaction });
      await this.auditGift(g, oldValues, transaction);
      return { id: g.id, name: g.name, description: g.description, costXp: g.costXp, imageUrl: g.imageUrl, stock: g.stock, active: g.active };
    });
  }

  async removeGift(id) {
    await this.updateGift(id, { active: false });
    return { removed: true };
  }

  /** A mentee's spendable points = points earned across enrollments − points already redeemed. */
  async menteePointsBalance(menteeId, transaction) {
    const [enrollments, redemptions] = await Promise.all([
      models.Enrollment.findAll({ where: { menteeId }, attributes: ['totalPointsEarned'], transaction }),
      models.Redemption.findAll({ where: { menteeId }, attributes: ['costXp'], transaction })
    ]);
    const earned = enrollments.reduce((s, e) => s + Number(e.totalPointsEarned || 0), 0);
    const spent = redemptions.reduce((s, r) => s + Number(r.costXp || 0), 0);
    return { earned, spent, balance: earned - spent };
  }

  async redeem(giftId, menteeId, redeemedBy, requestKey = null) {
    if (!giftId || !menteeId) throw new ValidationError('giftId and menteeId are required');
    return sequelize.transaction(async (transaction) => {
      const profile = await models.MenteeProfile.findOne({ where: { userId: menteeId }, transaction, lock: transaction.LOCK.UPDATE });
      if (!profile) throw new NotFoundError('Mentee profile not found');
      if (requestKey) {
        const existing = await models.Redemption.findOne({ where: { menteeId, requestKey }, transaction });
        if (existing) {
          if (existing.giftId !== giftId) throw new ValidationError('Request key already used for a different gift');
          return existing;
        }
      }
      const gift = await models.Gift.findByPk(giftId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!gift || !gift.active) throw new NotFoundError('Gift not available');
      // Mentees spend points they've earned from completed work.
      credits(gift.costXp);
      const { balance } = await this.menteePointsBalance(menteeId, transaction);
      if (gift.costXp > 0 && balance < gift.costXp) {
        throw new ValidationError(`Not enough reward credits - mentee has ${balance}, needs ${gift.costXp}`);
      }
      if (gift.stock !== null) {
        if (gift.stock <= 0) throw new ValidationError('This gift is out of stock');
        gift.stock -= 1;
        await gift.save({ transaction });
      }
      const redemption = await models.Redemption.create({ giftId, menteeId, redeemedBy, costXp: gift.costXp, requestKey }, { transaction });
      await models.AuditLog.create({ userId: redeemedBy, action: 'reward.redeemed', entityType: 'redemption',
        entityId: redemption.id, newValues: { giftId, menteeId, costXp: gift.costXp } }, { transaction });
      return redemption;
    });
  }
}

module.exports = new RewardsService();
