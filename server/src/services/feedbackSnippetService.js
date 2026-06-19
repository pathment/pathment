const { models } = require('../db');
const { NotFoundError, ForbiddenError, ValidationError } = require('../utils/errors/errorTypes');

/**
 * FeedbackSnippetService - per-mentor CRUD for saved feedback snippets, the
 * reusable bits of review feedback shown in both review drawers. Scoped to the
 * owning mentor: list/delete only ever touch the caller's own snippets.
 */
class FeedbackSnippetService {
  /** List the mentor's own snippets, newest first. */
  async list(mentorId) {
    return models.FeedbackSnippet.findAll({
      where: { mentorId },
      order: [['createdAt', 'DESC']]
    });
  }

  /** Create a snippet for the mentor. */
  async create(mentorId, { label, body } = {}) {
    const cleanLabel = String(label || '').trim();
    const cleanBody = String(body || '').trim();
    if (!cleanLabel) throw new ValidationError('A label is required');
    if (!cleanBody) throw new ValidationError('Snippet text is required');
    return models.FeedbackSnippet.create({
      mentorId,
      label: cleanLabel.slice(0, 80),
      body: cleanBody
    });
  }

  /** Delete one of the mentor's own snippets. */
  async remove(mentorId, id) {
    const snippet = await models.FeedbackSnippet.findByPk(id);
    if (!snippet) throw new NotFoundError('Snippet not found');
    if (snippet.mentorId !== mentorId) throw new ForbiddenError('This snippet is not yours');
    await snippet.destroy();
    return { id };
  }
}

module.exports = new FeedbackSnippetService();
