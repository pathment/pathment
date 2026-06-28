const { Op } = require('sequelize');
const { models } = require('../db');
const { ValidationError, AuthorizationError, NotFoundError } = require('../utils/errors/errorTypes');
const spaceService = require('./communitySpaceService');
const gamificationService = require('./gamificationService');
const notificationOrchestrator = require('./notificationOrchestrator');
const { NOTIFICATION_EVENTS } = require('../config/notificationMatrix');

const fullName = (u) => (u ? `${u.firstName} ${u.lastName}`.trim() : null);
const initials = (u) => (u ? `${(u.firstName || '').charAt(0)}${(u.lastName || '').charAt(0)}`.toUpperCase() : '?');
const photo = (u) => (u && u.profilePictureUrl) || null;

const POST_TYPES = ['kudos', 'win', 'question', 'discussion', 'resource', 'meme', 'standup'];
const REACTION_TYPES = ['cheers', 'celebrate', 'helpful', 'insightful'];

// Points awarded by community activity (no-op for non-mentees, which have no profile).
const POINTS = { KUDOS_RECEIVED: 15, ANSWER_ACCEPTED: 25 };

// Community CONTRIBUTION score - a self-contained reputation computed from
// community activity (works for everyone, mentee or mentor, unlike the
// mentee-only points engine). Powers the "Top contributors" leaderboard.
const CONTRIB = { kudos: 15, answer: 25, post: 2, reaction: 3 };
const TIERS = [
  { min: 600, name: 'Legend' },
  { min: 300, name: 'Champion' },
  { min: 120, name: 'Helper' },
  { min: 40, name: 'Contributor' },
  { min: 0, name: 'Newcomer' },
];
const tierFor = (points) => (TIERS.find((t) => points >= t.min) || TIERS[TIERS.length - 1]).name;

/**
 * Community v2 - a scoped social + knowledge layer. Every read/write is gated
 * by communitySpaceService so a member only ever sees the clan/cohort/program
 * spaces they belong to (plus the global lounge). Replaces the old flat feed.
 */
class CommunityService {
  // ── helpers ─────────────────────────────────────────────────────────────
  async _requireAccess(user, scopeType, scopeId) {
    const ctx = await spaceService.getSpaceContext(user, scopeType, scopeId);
    if (!ctx) throw new AuthorizationError('You are not a member of this space');
    return ctx;
  }

  /** Fetch a non-deleted post and the requester's space context for it. */
  async _loadPostWithAccess(user, postId) {
    const post = await models.CommunityPost.findOne({ where: { id: postId, deletedAt: null } });
    if (!post) throw new NotFoundError('Post not found');
    const ctx = await this._requireAccess(user, post.scopeType, post.scopeId);
    return { post, ctx };
  }

  _canModerate(ctx, user, authorId) {
    return ctx.isModerator || authorId === user.id;
  }

  /** Keep only mentioned ids that are real members of the space. */
  async _sanitizeMentions(scopeType, scopeId, mentionedUserIds) {
    if (!Array.isArray(mentionedUserIds) || !mentionedUserIds.length) return [];
    const memberIds = new Set(await spaceService.getMemberIds(scopeType, scopeId));
    return [...new Set(mentionedUserIds.filter((id) => memberIds.has(id)))];
  }

  async _notify(eventKey, recipientIds, payload) {
    const recipients = [...new Set(recipientIds.filter(Boolean))].map((userId) => ({ userId }));
    if (!recipients.length) return;
    try {
      await notificationOrchestrator.dispatch({ eventKey, recipients, payload });
    } catch (e) {
      console.error('[Community] notification dispatch failed:', e.message);
    }
  }

  async _awardPoints(userId, amount, sourceType, sourceId, reason) {
    try {
      await gamificationService.awardPoints(userId, amount, sourceType, sourceId, reason);
    } catch (e) {
      // Non-mentees have no profile - that's expected; only log real errors.
      if (!/profile not found/i.test(e.message)) console.error('[Community] awardPoints failed:', e.message);
    }
  }

  _mapPost(p, userId) {
    const reactions = p.reactions || [];
    const counts = REACTION_TYPES.reduce((acc, t) => { acc[t] = reactions.filter((r) => r.type === t).length; return acc; }, {});
    return {
      id: p.id,
      type: p.type,
      scopeType: p.scopeType,
      scopeId: p.scopeId,
      title: p.title || null,
      body: p.body,
      tags: p.tags || [],
      linkUrl: p.linkUrl || null,
      attachments: p.attachments || [],
      at: p.createdAt,
      editedAt: p.editedAt || null,
      pinned: Boolean(p.pinnedAt),
      resolved: Boolean(p.resolved),
      acceptedCommentId: p.acceptedCommentId || null,
      commentCount: p.commentCount || 0,
      author: { id: p.author?.id, name: fullName(p.author), avatar: initials(p.author), avatarUrl: photo(p.author) },
      recipient: p.recipient ? { id: p.recipient.id, name: fullName(p.recipient) } : null,
      reactions: counts,
      myReactions: reactions.filter((r) => r.userId === userId).map((r) => r.type),
      mine: p.author?.id === userId,
      _toId: p.toId,
      _authorId: p.author?.id
    };
  }

  // ── spaces ────────────────────────────────────────────────────────────
  async listSpaces(user) {
    return spaceService.listSpaces(user);
  }

  async getMembers(user, scopeType, scopeId) {
    await this._requireAccess(user, scopeType, scopeId);
    const ids = await spaceService.getMemberIds(scopeType, scopeId);
    if (!ids.length) return [];
    const [users, memberships] = await Promise.all([
      models.User.findAll({ where: { id: { [Op.in]: ids } }, attributes: ['id', 'firstName', 'lastName', 'role', 'profilePictureUrl'] }),
      scopeType === 'clan'
        ? models.ClanMembership.findAll({ where: { clanId: scopeId, status: 'active' }, attributes: ['userId', 'role'] })
        : Promise.resolve([])
    ]);
    const clanRole = new Map(memberships.map((m) => [m.userId, m.role]));
    return users.map((u) => ({
      id: u.id,
      name: fullName(u),
      avatar: initials(u),
      avatarUrl: photo(u),
      role: clanRole.get(u.id) || u.role
    }));
  }

  async getPeople(user, scopeType, scopeId) {
    if (scopeType) await this._requireAccess(user, scopeType, scopeId);
    return spaceService.getPeople(user, scopeType || 'global', scopeId || null);
  }

  /**
   * Top contributors for a space (or the global lounge). A real, role-agnostic
   * reputation computed from community activity - kudos received, accepted
   * answers, helpful reactions, and participation - so recognition is visible
   * right where people earn it. period: 'week' | 'all'.
   */
  async getLeaderboard(user, { scopeType = 'global', scopeId = null, period = 'all', limit = 10 } = {}) {
    await this._requireAccess(user, scopeType, scopeId);
    const since = period === 'week' ? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) : null;
    const timeWhere = since ? { createdAt: { [Op.gte]: since } } : {};
    const scopeWhere = scopeType === 'global' ? {} : { scopeType, scopeId: scopeId || null };

    // Candidate members.
    let memberIds;
    if (scopeType === 'global') {
      const rows = await models.CommunityPost.findAll({ where: { deletedAt: null, ...timeWhere }, attributes: ['authorId', 'toId'] });
      const set = new Set();
      rows.forEach((p) => { if (p.authorId) set.add(p.authorId); if (p.toId) set.add(p.toId); });
      memberIds = [...set];
    } else {
      memberIds = await spaceService.getMemberIds(scopeType, scopeId);
    }
    if (!memberIds.length) return { leaderboard: [], me: null };

    // Pull the activity that feeds the score.
    const [kudos, posts] = await Promise.all([
      models.CommunityPost.findAll({ where: { type: 'kudos', toId: { [Op.in]: memberIds }, deletedAt: null, ...scopeWhere, ...timeWhere }, attributes: ['toId'] }),
      models.CommunityPost.findAll({ where: { authorId: { [Op.in]: memberIds }, deletedAt: null, ...scopeWhere, ...timeWhere }, attributes: ['id', 'authorId', 'acceptedCommentId'] })
    ]);
    const acceptedIds = posts.map((p) => p.acceptedCommentId).filter(Boolean);
    const postIds = posts.map((p) => p.id);
    const [acceptedComments, reactions] = await Promise.all([
      acceptedIds.length ? models.CommunityComment.findAll({ where: { id: { [Op.in]: acceptedIds } }, attributes: ['authorId'] }) : [],
      postIds.length ? models.CommunityReaction.findAll({ where: { postId: { [Op.in]: postIds }, type: { [Op.in]: REACTION_TYPES } }, attributes: ['postId'] }) : []
    ]);
    const postAuthor = new Map(posts.map((p) => [p.id, p.authorId]));

    const tally = new Map(memberIds.map((id) => [id, { kudos: 0, answers: 0, posts: 0, reactions: 0 }]));
    kudos.forEach((k) => { const t = tally.get(k.toId); if (t) t.kudos += 1; });
    posts.forEach((p) => { const t = tally.get(p.authorId); if (t) t.posts += 1; });
    acceptedComments.forEach((c) => { const t = tally.get(c.authorId); if (t) t.answers += 1; });
    reactions.forEach((r) => { const a = postAuthor.get(r.postId); const t = a && tally.get(a); if (t) t.reactions += 1; });

    let rows = memberIds.map((id) => {
      const s = tally.get(id);
      const points = s.kudos * CONTRIB.kudos + s.answers * CONTRIB.answer + s.posts * CONTRIB.post + s.reactions * CONTRIB.reaction;
      return { userId: id, points, breakdown: s };
    }).filter((r) => r.points > 0).sort((a, b) => b.points - a.points);

    const users = await models.User.findAll({ where: { id: { [Op.in]: rows.map((r) => r.userId) } }, attributes: ['id', 'firstName', 'lastName', 'profilePictureUrl'] });
    const byId = new Map(users.map((u) => [u.id, u]));
    const ranked = rows.map((r, i) => ({
      rank: i + 1,
      userId: r.userId,
      name: fullName(byId.get(r.userId)) || 'Member',
      avatar: initials(byId.get(r.userId)),
      avatarUrl: photo(byId.get(r.userId)),
      points: r.points,
      tier: tierFor(r.points),
      mine: r.userId === user.id
    }));

    const me = ranked.find((r) => r.userId === user.id)
      || { rank: null, userId: user.id, name: fullName(user), points: 0, tier: tierFor(0), mine: true };
    return { leaderboard: ranked.slice(0, limit), me };
  }

  // ── feed ────────────────────────────────────────────────────────────────
  async feed(user, { scopeType = 'global', scopeId = null, type = null, tag = null, q = null } = {}) {
    const ctx = await this._requireAccess(user, scopeType, scopeId);

    const where = { scopeType, scopeId: scopeId || null, deletedAt: null };
    if (type && POST_TYPES.includes(type)) where.type = type;
    if (tag) where.tags = { [Op.contains]: [tag] };
    if (q && q.trim()) {
      const like = `%${q.trim()}%`;
      where[Op.or] = [{ title: { [Op.iLike]: like } }, { body: { [Op.iLike]: like } }];
    }

    const posts = await models.CommunityPost.findAll({
      where,
      order: [['created_at', 'DESC']],
      limit: 80,
      include: [
        { model: models.User, as: 'author', attributes: ['id', 'firstName', 'lastName', 'profilePictureUrl'] },
        { model: models.User, as: 'recipient', attributes: ['id', 'firstName', 'lastName'] },
        { model: models.CommunityReaction, as: 'reactions', attributes: ['userId', 'type'] }
      ]
    });

    const mapped = posts.map((p) => this._mapPost(p, user.id));
    // Pinned first, then newest.
    mapped.sort((a, b) => (Number(b.pinned) - Number(a.pinned)) || (new Date(b.at) - new Date(a.at)));

    const shoutouts = mapped.filter((p) => p.type === 'kudos' && p._toId === user.id);
    const given = mapped.filter((p) => p.type === 'kudos' && p._authorId === user.id).length;
    const cheersReceived = mapped
      .filter((p) => p._authorId === user.id)
      .reduce((n, p) => n + (p.reactions.cheers || 0), 0);
    const openQuestions = mapped.filter((p) => p.type === 'question' && !p.resolved).length;

    const strip = ({ _toId, _authorId, ...rest }) => rest;
    return {
      space: { type: ctx.type, id: ctx.id ?? scopeId ?? null, name: ctx.name, role: ctx.role, isModerator: ctx.isModerator },
      feed: mapped.map(strip),
      shoutouts: shoutouts.map(strip),
      stats: { given, cheersReceived, posts: mapped.length, openQuestions }
    };
  }

  // ── posts ────────────────────────────────────────────────────────────────
  async createPost(user, data) {
    const { type, scopeType, scopeId, title, body, toId, tags, linkUrl, attachments, mentionedUserIds } = data;
    if (!body || !body.trim()) throw new ValidationError('Say something');
    const resolvedType = POST_TYPES.includes(type) ? type : 'discussion';
    await this._requireAccess(user, scopeType, scopeId || null);

    const mentions = await this._sanitizeMentions(scopeType, scopeId, mentionedUserIds);

    const post = await models.CommunityPost.create({
      authorId: user.id,
      type: resolvedType,
      scopeType,
      scopeId: scopeId || null,
      title: title ? String(title).slice(0, 255) : null,
      body: body.trim(),
      toId: resolvedType === 'kudos' ? (toId || null) : null,
      tags: Array.isArray(tags) ? tags.slice(0, 8).map((t) => String(t).slice(0, 40)) : [],
      linkUrl: linkUrl ? String(linkUrl).slice(0, 2000) : null,
      attachments: Array.isArray(attachments) ? attachments.slice(0, 10) : [],
      mentionedUserIds: mentions
    });

    // Kudos → recognise the recipient (points + notification).
    if (resolvedType === 'kudos' && post.toId && post.toId !== user.id) {
      await this._awardPoints(post.toId, POINTS.KUDOS_RECEIVED, 'community_kudos', post.id, `Kudos from ${fullName(user)}`);
      await this._notify(NOTIFICATION_EVENTS.COMMUNITY_KUDOS, [post.toId], {
        title: 'You got kudos 🎉',
        message: `${fullName(user)} gave you a shout-out.`,
        actionUrl: '/mentee/community',
        actionLabel: 'View',
        relatedEntityType: 'community_post',
        relatedEntityId: post.id
      });
    }

    // @mentions.
    const toNotify = mentions.filter((id) => id !== user.id && id !== post.toId);
    await this._notify(NOTIFICATION_EVENTS.COMMUNITY_MENTION, toNotify, {
      title: `${fullName(user)} mentioned you`,
      message: post.title || post.body.slice(0, 140),
      actionUrl: '/mentee/community',
      actionLabel: 'View post',
      relatedEntityType: 'community_post',
      relatedEntityId: post.id
    });

    return post;
  }

  async updatePost(user, postId, data) {
    const { post } = await this._loadPostWithAccess(user, postId);
    if (post.authorId !== user.id) throw new AuthorizationError('You can only edit your own posts');
    const patch = { editedAt: new Date() };
    if (typeof data.body === 'string') {
      if (!data.body.trim()) throw new ValidationError('Post cannot be empty');
      patch.body = data.body.trim();
    }
    if (typeof data.title === 'string') patch.title = data.title.slice(0, 255) || null;
    if (Array.isArray(data.tags)) patch.tags = data.tags.slice(0, 8).map((t) => String(t).slice(0, 40));
    if (typeof data.linkUrl === 'string') patch.linkUrl = data.linkUrl.slice(0, 2000) || null;
    await post.update(patch);
    return post;
  }

  async deletePost(user, postId) {
    const { post, ctx } = await this._loadPostWithAccess(user, postId);
    if (!this._canModerate(ctx, user, post.authorId)) throw new AuthorizationError('Not allowed');
    await post.update({ deletedAt: new Date() });
    return { deleted: true };
  }

  async setPinned(user, postId, pinned) {
    const { post, ctx } = await this._loadPostWithAccess(user, postId);
    if (!ctx.isModerator) throw new AuthorizationError('Only space moderators can pin posts');
    await post.update(pinned ? { pinnedAt: new Date(), pinnedBy: user.id } : { pinnedAt: null, pinnedBy: null });
    return { pinned: Boolean(pinned) };
  }

  async toggleReaction(user, postId, type) {
    if (!REACTION_TYPES.includes(type)) throw new ValidationError('Invalid reaction type');
    await this._loadPostWithAccess(user, postId);
    const existing = await models.CommunityReaction.findOne({ where: { postId, userId: user.id, type } });
    if (existing) { await existing.destroy(); return { reacted: false }; }
    await models.CommunityReaction.create({ postId, userId: user.id, type });
    return { reacted: true };
  }

  // ── comments / threads ────────────────────────────────────────────────
  async listComments(user, postId) {
    const { post } = await this._loadPostWithAccess(user, postId);
    const comments = await models.CommunityComment.findAll({
      where: { postId, deletedAt: null },
      order: [['created_at', 'ASC']],
      include: [{ model: models.User, as: 'author', attributes: ['id', 'firstName', 'lastName', 'profilePictureUrl'] }]
    });
    return comments.map((c) => ({
      id: c.id,
      postId: c.postId,
      parentId: c.parentId || null,
      body: c.body,
      at: c.createdAt,
      editedAt: c.editedAt || null,
      accepted: post.acceptedCommentId === c.id,
      author: { id: c.author?.id, name: fullName(c.author), avatar: initials(c.author), avatarUrl: photo(c.author) },
      mine: c.authorId === user.id
    }));
  }

  async addComment(user, postId, { body, parentId, mentionedUserIds }) {
    if (!body || !body.trim()) throw new ValidationError('Write a reply');
    const { post } = await this._loadPostWithAccess(user, postId);

    let parent = null;
    if (parentId) {
      parent = await models.CommunityComment.findOne({ where: { id: parentId, postId, deletedAt: null } });
      if (!parent) throw new ValidationError('Parent comment not found');
    }

    const mentions = await this._sanitizeMentions(post.scopeType, post.scopeId, mentionedUserIds);
    const comment = await models.CommunityComment.create({
      postId, authorId: user.id, parentId: parentId || null, body: body.trim(), mentionedUserIds: mentions
    });
    await post.increment('commentCount');

    // Notify post author, the parent comment's author, and any mentions.
    const recipients = new Set([post.authorId, parent?.authorId, ...mentions].filter(Boolean));
    recipients.delete(user.id);
    await this._notify(NOTIFICATION_EVENTS.COMMUNITY_REPLY, [...recipients], {
      title: `${fullName(user)} replied`,
      message: comment.body.slice(0, 140),
      actionUrl: '/mentee/community',
      actionLabel: 'View thread',
      relatedEntityType: 'community_post',
      relatedEntityId: post.id
    });

    return comment;
  }

  async updateComment(user, commentId, body) {
    if (!body || !body.trim()) throw new ValidationError('Reply cannot be empty');
    const comment = await models.CommunityComment.findOne({ where: { id: commentId, deletedAt: null } });
    if (!comment) throw new NotFoundError('Comment not found');
    if (comment.authorId !== user.id) throw new AuthorizationError('You can only edit your own replies');
    await comment.update({ body: body.trim(), editedAt: new Date() });
    return comment;
  }

  async deleteComment(user, commentId) {
    const comment = await models.CommunityComment.findOne({ where: { id: commentId, deletedAt: null } });
    if (!comment) throw new NotFoundError('Comment not found');
    const { post, ctx } = await this._loadPostWithAccess(user, comment.postId);
    if (!this._canModerate(ctx, user, comment.authorId)) throw new AuthorizationError('Not allowed');
    await comment.update({ deletedAt: new Date() });
    await post.decrement('commentCount');
    if (post.acceptedCommentId === comment.id) await post.update({ acceptedCommentId: null, resolved: false });
    return { deleted: true };
  }

  /** Mark a comment as the accepted answer on a question (author or moderator). */
  async acceptAnswer(user, postId, commentId) {
    const { post, ctx } = await this._loadPostWithAccess(user, postId);
    if (post.type !== 'question') throw new ValidationError('Only questions can have an accepted answer');
    if (post.authorId !== user.id && !ctx.isModerator) throw new AuthorizationError('Only the asker or a moderator can accept an answer');
    const comment = await models.CommunityComment.findOne({ where: { id: commentId, postId, deletedAt: null } });
    if (!comment) throw new NotFoundError('Answer not found');

    await post.update({ acceptedCommentId: comment.id, resolved: true });

    if (comment.authorId !== user.id) {
      await this._awardPoints(comment.authorId, POINTS.ANSWER_ACCEPTED, 'community_answer', comment.id, 'Answer accepted');
      await this._notify(NOTIFICATION_EVENTS.COMMUNITY_ANSWER_ACCEPTED, [comment.authorId], {
        title: 'Your answer was accepted ✅',
        message: post.title || post.body.slice(0, 140),
        actionUrl: '/mentee/community',
        actionLabel: 'View question',
        relatedEntityType: 'community_post',
        relatedEntityId: post.id
      });
    }
    return { resolved: true, acceptedCommentId: comment.id };
  }

  // ── moderation ────────────────────────────────────────────────────────
  async report(user, { targetType, targetId, reason }) {
    if (!['post', 'comment'].includes(targetType)) throw new ValidationError('Invalid report target');
    // Confirm the target exists and the reporter can see its space.
    if (targetType === 'post') {
      await this._loadPostWithAccess(user, targetId);
    } else {
      const comment = await models.CommunityComment.findOne({ where: { id: targetId, deletedAt: null } });
      if (!comment) throw new NotFoundError('Comment not found');
      await this._loadPostWithAccess(user, comment.postId);
    }
    await models.CommunityReport.create({ targetType, targetId, reporterId: user.id, reason: reason || null });
    return { reported: true };
  }

  async listReports(_user, { status = 'open' } = {}) {
    const reports = await models.CommunityReport.findAll({
      where: status ? { status } : {},
      order: [['created_at', 'DESC']],
      include: [{ model: models.User, as: 'reporter', attributes: ['id', 'firstName', 'lastName'] }]
    });

    // Attach a preview of each reported target so a moderator can judge without leaving the queue.
    const postIds = reports.filter((r) => r.targetType === 'post').map((r) => r.targetId);
    const commentIds = reports.filter((r) => r.targetType === 'comment').map((r) => r.targetId);
    const authorInc = [{ model: models.User, as: 'author', attributes: ['id', 'firstName', 'lastName'] }];
    const [posts, comments] = await Promise.all([
      postIds.length ? models.CommunityPost.findAll({ where: { id: { [Op.in]: postIds } }, include: authorInc, paranoid: false }) : [],
      commentIds.length ? models.CommunityComment.findAll({ where: { id: { [Op.in]: commentIds } }, include: authorInc, paranoid: false }) : []
    ]);
    const postMap = new Map(posts.map((p) => [p.id, p]));
    const commentMap = new Map(comments.map((c) => [c.id, c]));

    return reports.map((r) => {
      const t = r.targetType === 'post' ? postMap.get(r.targetId) : commentMap.get(r.targetId);
      const preview = t ? `${t.title ? `${t.title} - ` : ''}${t.body || ''}`.slice(0, 240) : '(content removed)';
      return {
        id: r.id,
        targetType: r.targetType,
        targetId: r.targetId,
        reason: r.reason,
        status: r.status,
        at: r.createdAt,
        reporter: { id: r.reporter?.id, name: fullName(r.reporter) },
        preview,
        targetAuthor: t ? fullName(t.author) : null,
        targetDeleted: t ? Boolean(t.deletedAt) : true
      };
    });
  }

  async resolveReport(user, reportId, status) {
    if (!['reviewed', 'dismissed'].includes(status)) throw new ValidationError('Invalid status');
    const report = await models.CommunityReport.findByPk(reportId);
    if (!report) throw new NotFoundError('Report not found');
    await report.update({ status, reviewedBy: user.id });
    return { status };
  }
}

module.exports = new CommunityService();
