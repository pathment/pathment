const { models } = require('../db');
const { NotFoundError, ValidationError } = require('../utils/errors/errorTypes');
const { sanitizeRichText } = require('../utils/sanitizeHtml');

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
      hasContent: Boolean(d.content && d.content.trim()),
      updatedAt: d.updatedAt
    };
  }

  /** List = lightweight metadata (no full body) for the grid. */
  async list() {
    const docs = await models.Document.findAll({ order: [['pinned', 'DESC'], ['updated_at', 'DESC']] });
    return docs.map((d) => this._meta(d));
  }

  /** One item with its full rich-text content (the reader). */
  async get(id) {
    const d = await models.Document.findByPk(id);
    if (!d) throw new NotFoundError('Document not found');
    // Sanitize on read too: content written before sanitization shipped (or via any
    // path that bypassed _clean) is neutralized before it can reach the client's
    // dangerouslySetInnerHTML. Idempotent for already-clean rows.
    return { ...this._meta(d), content: sanitizeRichText(d.content) || '' };
  }

  _clean(data) {
    const patch = {};
    if (data.title !== undefined) patch.title = String(data.title).trim();
    if (data.category !== undefined) patch.category = CATEGORIES.includes(data.category) ? data.category : 'guidance';
    if (data.summary !== undefined) patch.summary = data.summary || null;
    if (data.content !== undefined) patch.content = sanitizeRichText(data.content);
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
