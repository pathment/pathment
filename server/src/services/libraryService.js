const { Sequelize } = require('sequelize');
const { models } = require('../db');
const { NotFoundError, ValidationError } = require('../utils/errors/errorTypes');

const CATEGORIES = ['guidance', 'reading', 'template', 'policy'];

/** Org-shared mentor Library - rich-text articles, links, templates, policies. */
class LibraryService {
  _meta(d) {
    return {
      id: d.id,
      title: d.title,
      category: d.category,
      summary: d.summary,
      author: d.author,
      url: d.url,
      readMins: d.readMins,
      pinned: d.pinned,
      // list() omits the body for payload reasons and computes this flag in SQL;
      // get() has the real content. Fall back so both paths report it correctly.
      hasContent: d.get('hasContent') !== undefined
        ? Boolean(d.get('hasContent'))
        : Boolean(d.content && d.content.trim()),
      updatedAt: d.updatedAt
    };
  }

  /**
   * List = lightweight metadata (no full body) for the grid.
   *
   * Paginated and category-filterable. This was an unbounded findAll: fine with
   * twenty documents, and quietly worse every time someone adds one — a library
   * only ever grows.
   *
   * @param {Object} [options]
   * @param {string} [options.category] one of CATEGORIES
   * @param {number} [options.limit=50]  capped at 100
   * @param {number} [options.offset=0]
   */
  async list({ category, limit = 50, offset = 0 } = {}) {
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
    const safeOffset = Math.max(parseInt(offset, 10) || 0, 0);

    const where = {};
    if (category && CATEGORIES.includes(category)) where.category = category;

    const { rows, count } = await models.Document.findAndCountAll({
      where,
      order: [['pinned', 'DESC'], ['updated_at', 'DESC']],
      limit: safeLimit,
      offset: safeOffset,
      // The body can be a long rich-text blob and the grid never shows it, so it
      // stays out of the payload. The one thing the grid does need from it —
      // "is there an article to read" — is computed in SQL instead.
      attributes: {
        exclude: ['content'],
        include: [[
          Sequelize.literal("(content IS NOT NULL AND btrim(content) <> '')"),
          'hasContent'
        ]]
      }
    });

    return {
      items: rows.map((d) => this._meta(d)),
      pagination: {
        limit: safeLimit,
        offset: safeOffset,
        totalItems: count,
        hasMore: safeOffset + rows.length < count
      }
    };
  }

  /** One item with its full rich-text content (the reader). */
  async get(id) {
    const d = await models.Document.findByPk(id);
    if (!d) throw new NotFoundError('Document not found');
    return { ...this._meta(d), content: d.content || '' };
  }

  _clean(data) {
    const patch = {};
    if (data.title !== undefined) patch.title = String(data.title).trim();
    if (data.category !== undefined) patch.category = CATEGORIES.includes(data.category) ? data.category : 'guidance';
    if (data.summary !== undefined) patch.summary = data.summary || null;
    if (data.content !== undefined) patch.content = data.content || null;
    if (data.url !== undefined) patch.url = data.url || null;
    if (data.readMins !== undefined) patch.readMins = data.readMins ? Number(data.readMins) : null;
    return patch;
  }

  async create(data, author) {
    if (!data.title || !data.title.trim()) throw new ValidationError('A title is required');
    if (!(data.content && data.content.trim()) && !(data.url && data.url.trim())) {
      throw new ValidationError('Add written content or a link');
    }
    return models.Document.create({
      ...this._clean(data),
      category: CATEGORIES.includes(data.category) ? data.category : 'guidance',
      author: data.author || author || null,
      pinned: false
    });
  }

  async update(id, data) {
    const d = await models.Document.findByPk(id);
    if (!d) throw new NotFoundError('Document not found');
    await d.update(this._clean(data));
    return this.get(id);
  }

  async togglePin(id) {
    const d = await models.Document.findByPk(id);
    if (!d) throw new NotFoundError('Document not found');
    d.pinned = !d.pinned;
    await d.save();
    return this._meta(d);
  }

  async remove(id) {
    const d = await models.Document.findByPk(id);
    if (!d) throw new NotFoundError('Document not found');
    await d.destroy();
    return { removed: true };
  }
}

module.exports = new LibraryService();
