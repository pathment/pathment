const { Op } = require('sequelize');
const { models } = require('../db');
const { NotFoundError, ValidationError, ForbiddenError } = require('../utils/errors/errorTypes');

const AUDIENCE_TYPES = ['all', 'mentors', 'mentees', 'program', 'clan'];

/**
 * Announcements with audience targeting + per-viewer visibility.
 *  - Admin can target: all | mentors | mentees | program:<id> | clan:<id>
 *  - Mentor can target: clan:<id> for a clan they lead (reaches the clan's mentees + co-mentors)
 * A viewer sees an announcement when it's 'all', a role they hold, or a
 * program/clan they belong to (admins see everything for oversight).
 */
class AnnouncementService {
  _caps(user) {
    return Array.isArray(user?.capabilities) && user.capabilities.length ? user.capabilities : [user?.role].filter(Boolean);
  }

  /** Clans + programs the viewer belongs to (for visibility filtering). */
  async _scope(user) {
    const caps = this._caps(user);
    const memberships = await models.ClanMembership.findAll({
      where: { userId: user.id, status: 'active' },
      include: [{ model: models.Clan, as: 'clan', attributes: ['programId'] }]
    });
    const clanIds = memberships.map((m) => m.clanId);
    const programIds = new Set(memberships.map((m) => m.clan?.programId).filter(Boolean));

    if (caps.includes('mentee')) {
      const enrollments = await models.Enrollment.findAll({ where: { menteeId: user.id }, attributes: ['programId'] });
      enrollments.forEach((e) => programIds.add(e.programId));
    }
    if (caps.includes('mentor')) {
      const matches = await models.MentorMenteeMatch.findAll({
        where: { mentorId: user.id, status: 'active' },
        include: [{ model: models.Enrollment, as: 'enrollment', attributes: ['programId'] }]
      });
      matches.forEach((m) => m.enrollment?.programId && programIds.add(m.enrollment.programId));
    }
    return { caps, clanIds, programIds: [...programIds] };
  }

  /**
   * Translate the audience rules into a WHERE clause.
   *
   * This used to be a JS `.filter()` over every announcement in the org, which
   * meant each request loaded the whole table — plus each row's author and its
   * full reactions array — to then discard most of it. Expressed as SQL, the
   * database returns only what this person may see, and LIMIT actually limits.
   *
   * Returns undefined for admins, who see everything for oversight.
   */
  async _visibilityWhere(user) {
    const caps = this._caps(user);
    if (caps.includes('admin')) return undefined;

    const { clanIds, programIds } = await this._scope(user);

    const or = [
      { authorId: user.id },      // you always see your own
      { audience: 'all' }
    ];
    if (caps.includes('mentor')) or.push({ audience: 'mentors' });
    if (caps.includes('mentee')) or.push({ audience: 'mentees' });
    if (programIds.length) or.push({ audience: 'program', audienceId: { [Op.in]: programIds } });
    if (clanIds.length) or.push({ audience: 'clan', audienceId: { [Op.in]: clanIds } });

    return { [Op.or]: or };
  }

  /**
   * @param {Object} user
   * @param {Object} [options]
   * @param {number} [options.limit=30]  capped at 100
   * @param {number} [options.offset=0]
   */
  async list(user, { limit = 30, offset = 0 } = {}) {
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 30, 1), 100);
    const safeOffset = Math.max(parseInt(offset, 10) || 0, 0);

    const where = await this._visibilityWhere(user);

    const { rows: visible, count: totalItems } = await models.Announcement.findAndCountAll({
      where,
      include: [
        { model: models.User, as: 'author', attributes: ['firstName', 'lastName', 'role'] },
        { model: models.AnnouncementReaction, as: 'reactions', attributes: ['userId', 'type'] }
      ],
      order: [['pinned', 'DESC'], ['created_at', 'DESC']],
      limit: safeLimit,
      offset: safeOffset,
      // `reactions` is a hasMany, so the join multiplies rows: without distinct,
      // COUNT returns reaction rows rather than announcements. Sequelize also
      // needs its default subQuery behaviour here so LIMIT applies to
      // announcements — forcing subQuery:false would cut a page off mid-way
      // through one announcement's reactions.
      distinct: true
    });

    // Resolve names for program/clan audience labels.
    const progIds = [...new Set(visible.filter((a) => a.audience === 'program').map((a) => a.audienceId).filter(Boolean))];
    const clanIdsLbl = [...new Set(visible.filter((a) => a.audience === 'clan').map((a) => a.audienceId).filter(Boolean))];
    const [programs, clans] = await Promise.all([
      progIds.length ? models.Program.findAll({ where: { id: progIds }, attributes: ['id', 'name'] }) : [],
      clanIdsLbl.length ? models.Clan.findAll({ where: { id: clanIdsLbl }, attributes: ['id', 'name'] }) : []
    ]);
    const progName = Object.fromEntries(programs.map((p) => [p.id, p.name]));
    const clanName = Object.fromEntries(clans.map((c) => [c.id, c.name]));
    const label = (a) => {
      switch (a.audience) {
        case 'all': return 'Everyone';
        case 'mentors': return 'All mentors';
        case 'mentees': return 'All mentees';
        case 'program': return progName[a.audienceId] || 'Program';
        case 'clan': return clanName[a.audienceId] || 'Clan';
        default: return a.audience;
      }
    };

    const announcements = visible.map((a) => {
      const reactions = a.reactions || [];
      const count = (t) => reactions.filter((r) => r.type === t).length;
      const mine = reactions.filter((r) => r.userId === user.id).map((r) => r.type);
      return {
        id: a.id,
        title: a.title,
        body: a.body,
        audience: a.audience,
        audienceId: a.audienceId,
        audienceLabel: label(a),
        pinned: a.pinned,
        at: a.createdAt,
        author: a.author ? { name: `${a.author.firstName} ${a.author.lastName}`.trim(), role: a.author.role } : null,
        mine: a.authorId === user.id,
        reactions: { acknowledged: count('acknowledged'), helpful: count('helpful') },
        myReactions: mine
      };
    });

    return {
      items: announcements,
      pagination: {
        limit: safeLimit,
        offset: safeOffset,
        totalItems,
        hasMore: safeOffset + announcements.length < totalItems
      }
    };
  }

  /** Clans a mentor leads (for the mentor compose dropdown). */
  async ledClans(userId) {
    const memberships = await models.ClanMembership.findAll({
      where: { userId, status: 'active', role: { [Op.in]: ['lead_mentor', 'co_mentor'] } },
      include: [{ model: models.Clan, as: 'clan', attributes: ['id', 'name'] }]
    });
    return memberships.filter((m) => m.clan).map((m) => ({ id: m.clanId, name: m.clan.name }));
  }

  async create({ title, body, audience, audienceId }, author) {
    if (!title || !title.trim() || !body || !body.trim()) throw new ValidationError('title and body are required');
    if (!AUDIENCE_TYPES.includes(audience)) throw new ValidationError('Invalid audience');
    const caps = this._caps(author);

    if (caps.includes('admin')) {
      if ((audience === 'program' || audience === 'clan') && !audienceId) {
        throw new ValidationError(`A ${audience} must be selected`);
      }
    } else if (caps.includes('mentor')) {
      // Mentors may only announce to a clan they lead.
      if (audience !== 'clan' || !audienceId) throw new ForbiddenError('Mentors can only announce to a clan they lead');
      const leads = await this.ledClans(author.id);
      if (!leads.some((c) => c.id === audienceId)) throw new ForbiddenError('You do not lead that clan');
    } else {
      throw new ForbiddenError('You cannot post announcements');
    }

    return models.Announcement.create({
      title: title.trim(),
      body: body.trim(),
      audience,
      audienceId: (audience === 'program' || audience === 'clan') ? audienceId : null,
      pinned: false,
      authorId: author.id
    });
  }

  async _assertCanManage(id, user) {
    const a = await models.Announcement.findByPk(id);
    if (!a) throw new NotFoundError('Announcement not found');
    const caps = this._caps(user);
    if (!caps.includes('admin') && a.authorId !== user.id) {
      throw new ForbiddenError('You can only manage your own announcements');
    }
    return a;
  }

  async togglePin(id, user) {
    const a = await this._assertCanManage(id, user);
    a.pinned = !a.pinned;
    await a.save();
    return a;
  }

  async toggleReaction(id, userId, type) {
    if (!['acknowledged', 'helpful'].includes(type)) throw new ValidationError('Invalid reaction type');
    const existing = await models.AnnouncementReaction.findOne({ where: { announcementId: id, userId, type } });
    if (existing) { await existing.destroy(); return { reacted: false }; }
    await models.AnnouncementReaction.create({ announcementId: id, userId, type });
    return { reacted: true };
  }

  async remove(id, user) {
    const a = await this._assertCanManage(id, user);
    await models.AnnouncementReaction.destroy({ where: { announcementId: id } });
    await a.destroy();
    return { removed: true };
  }
}

module.exports = new AnnouncementService();
