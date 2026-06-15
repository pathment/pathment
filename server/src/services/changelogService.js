const { Op } = require('sequelize');
const { models } = require('../db');
const { NotFoundError, ValidationError } = require('../utils/errors/errorTypes');

const ROLE_VIEWS = ['admin', 'mentor', 'mentee'];

/**
 * The in-app "What's New" changelog. Users get a role-filtered feed of published
 * updates with a per-user unread count (vs `users.last_seen_changelog_at`), and
 * `isMajor` entries that they haven't seen pop a one-time modal. Admins author,
 * publish, and manage entries.
 */
class ChangelogService {
  /** Roles a user may legitimately view a feed for (their current portal). */
  resolveRole(user, requestedRole) {
    const held = new Set([user.role, ...(Array.isArray(user.capabilities) ? user.capabilities : [])]);
    if (requestedRole && held.has(requestedRole)) return requestedRole;
    return user.role;
  }

  toPublic(row) {
    return {
      id: row.id,
      title: row.title,
      body: row.body,
      type: row.type,
      isMajor: row.isMajor,
      actionUrl: row.actionUrl || null,
      actionLabel: row.actionLabel || null,
      publishedAt: row.publishedAt,
    };
  }

  /**
   * The user-facing feed: published entries whose audience includes the viewer's
   * current role, newest first, plus unread count and any unseen major entries.
   */
  async feedForUser(user, requestedRole) {
    const role = this.resolveRole(user, requestedRole);
    const rows = await models.ProductUpdate.findAll({
      where: { publishedAt: { [Op.ne]: null }, audience: { [Op.contains]: [role] } },
      order: [['publishedAt', 'DESC']],
      limit: 50,
    });

    const lastSeen = user.lastSeenChangelogAt ? new Date(user.lastSeenChangelogAt) : null;
    const isUnread = (r) => !lastSeen || new Date(r.publishedAt) > lastSeen;

    const updates = rows.map((r) => ({ ...this.toPublic(r), unread: isUnread(r) }));
    const unreadCount = updates.filter((u) => u.unread).length;
    const majorUnseen = updates.filter((u) => u.unread && u.isMajor);

    return { updates, unreadCount, majorUnseen };
  }

  /** Mark the whole feed as seen for this user (clears the badge + suppresses the modal). */
  async markSeen(userId) {
    await models.User.update({ lastSeenChangelogAt: new Date() }, { where: { id: userId } });
    return { ok: true };
  }

  // ── Admin authoring ─────────────────────────────────────────────────────────

  /**
   * Admin list: search (title) + type/status filters + server-side pagination,
   * capped at the validation layer so a crafted `?limit=` can't dump the table.
   */
  async listForAdmin({ search, type, status, page, limit } = {}) {
    const where = {};
    if (type) where.type = type;
    if (status === 'draft') where.publishedAt = { [Op.is]: null };
    if (status === 'published') where.publishedAt = { [Op.ne]: null };
    const term = (search || '').trim();
    if (term) where.title = { [Op.iLike]: `%${term}%` };

    const parsedLimit = Math.min(100, Math.max(1, Number(limit) || 20));
    const parsedPage = Math.max(1, Number(page) || 1);

    // belongsTo author only → no row multiplication, so findAndCountAll is exact.
    const { rows, count } = await models.ProductUpdate.findAndCountAll({
      where,
      order: [['created_at', 'DESC']],
      include: [{ model: models.User, as: 'author', attributes: ['id', 'first_name', 'last_name'] }],
      limit: parsedLimit,
      offset: (parsedPage - 1) * parsedLimit,
    });

    const updates = rows.map((r) => ({
      ...this.toPublic(r),
      audience: r.audience,
      createdAt: r.createdAt,
      isDraft: !r.publishedAt,
      author: r.author ? `${r.author.firstName || ''} ${r.author.lastName || ''}`.trim() : null,
    }));
    return { updates, total: count, page: parsedPage, limit: parsedLimit };
  }

  sanitize(input = {}) {
    const out = {};
    if (input.title !== undefined) out.title = String(input.title).trim().slice(0, 200);
    if (input.body !== undefined) out.body = String(input.body);
    if (input.type !== undefined) {
      if (!['feature', 'improvement', 'fix'].includes(input.type)) throw new ValidationError('Invalid update type');
      out.type = input.type;
    }
    if (input.audience !== undefined) {
      const aud = (Array.isArray(input.audience) ? input.audience : []).filter((r) => ROLE_VIEWS.includes(r));
      if (!aud.length) throw new ValidationError('Pick at least one audience');
      out.audience = aud;
    }
    if (input.isMajor !== undefined) out.isMajor = Boolean(input.isMajor);
    if (input.actionUrl !== undefined) out.actionUrl = input.actionUrl ? String(input.actionUrl).trim().slice(0, 500) : null;
    if (input.actionLabel !== undefined) out.actionLabel = input.actionLabel ? String(input.actionLabel).trim().slice(0, 80) : null;
    return out;
  }

  async create(authorId, input) {
    const data = this.sanitize(input);
    if (!data.title) throw new ValidationError('Title is required');
    if (!data.body) throw new ValidationError('Body is required');
    // `publish: true` publishes immediately; otherwise it's saved as a draft.
    const publishedAt = input.publish ? new Date() : null;
    const row = await models.ProductUpdate.create({ ...data, createdBy: authorId, publishedAt });
    return this.toPublic(row);
  }

  /**
   * Bulk-import entries from a pasted JSON array (admin authoring). Each item is
   * validated independently: the valid ones are created, the bad ones reported —
   * so one typo doesn't sink the whole paste. `publishAll` (the import-level
   * toggle) is the default publish state; a per-item `publish` overrides it.
   * Returns { created, total, errors: [{ index, title, message }] }.
   */
  async importMany(authorId, items, publishAll = false) {
    if (!Array.isArray(items) || !items.length) {
      throw new ValidationError('Provide a non-empty JSON array of updates');
    }
    if (items.length > 100) throw new ValidationError('Import at most 100 updates at once');

    const errors = [];
    const rows = [];
    items.forEach((item, index) => {
      try {
        if (!item || typeof item !== 'object') throw new ValidationError('Each item must be an object');
        const data = this.sanitize(item);
        if (!data.title) throw new ValidationError('Title is required');
        if (!data.body) throw new ValidationError('Body is required');
        const publish = item.publish === undefined ? publishAll : Boolean(item.publish);
        rows.push({
          title: data.title,
          body: data.body,
          type: data.type || 'feature',
          audience: data.audience || ROLE_VIEWS,
          isMajor: data.isMajor || false,
          actionUrl: data.actionUrl ?? null,
          actionLabel: data.actionLabel ?? null,
          createdBy: authorId,
          publishedAt: publish ? new Date() : null,
        });
      } catch (e) {
        errors.push({ index, title: item && item.title ? String(item.title).slice(0, 80) : null, message: e.message });
      }
    });

    let created = [];
    if (rows.length) created = await models.ProductUpdate.bulkCreate(rows);
    return { created: created.length, total: items.length, errors };
  }

  async update(id, input) {
    const row = await models.ProductUpdate.findByPk(id);
    if (!row) throw new NotFoundError('Update not found');
    const data = this.sanitize(input);
    // Explicit publish/unpublish toggle.
    if (input.publish === true && !row.publishedAt) data.publishedAt = new Date();
    if (input.publish === false) data.publishedAt = null;
    await row.update(data);
    return this.toPublic(row);
  }

  async remove(id) {
    const row = await models.ProductUpdate.findByPk(id);
    if (!row) throw new NotFoundError('Update not found');
    await row.destroy();
    return { ok: true };
  }
}

module.exports = new ChangelogService();
