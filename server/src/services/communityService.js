const { Op } = require('sequelize');
const { models, sequelize } = require('../db');
const { ValidationError, AuthorizationError, NotFoundError, ClanFrozenError } = require('../utils/errors/errorTypes');
const spaceService = require('./communitySpaceService');
const gamificationService = require('./gamificationService');
const notificationOrchestrator = require('./notificationOrchestrator');
const { NOTIFICATION_EVENTS } = require('../config/notificationMatrix');

const fullName = (u) => (u ? `${u.firstName} ${u.lastName}`.trim() : null);
const initials = (u) => (u ? `${(u.firstName || '').charAt(0)}${(u.lastName || '').charAt(0)}`.toUpperCase() : '?');
const photo = (u) => (u && u.profilePictureUrl) || null;

const POST_TYPES = ['kudos', 'win', 'question', 'discussion', 'resource', 'meme', 'standup'];
const REACTION_TYPES = ['cheers', 'celebrate', 'helpful', 'insightful'];
// Why something was reported. "other" says nothing by itself, so it is the one
// category that must come with an explanation. Keep in step with the client.
const REPORT_CATEGORIES = {
  spam: 'Spam',
  scam: 'Scam or fraud',
  hate: 'Hateful content',
  violence: 'Violence or threats',
  other: 'Something else',
};
const REPORT_DETAILS_MAX = 1000;
const REPORT_SEPARATOR = ' — ';
/**
 * Split a stored report line back into the reason that was picked and what the
 * reporter wrote. Reports from before the reason picker have neither a known
 * label nor a separator, so the whole line is treated as their own words.
 */
const parseReportReason = (reason) => {
  const text = typeof reason === 'string' ? reason.trim() : '';
  if (!text) return { category: null, categoryLabel: null, details: null };
  for (const [category, categoryLabel] of Object.entries(REPORT_CATEGORIES)) {
    if (text === categoryLabel) return { category, categoryLabel, details: null };
    if (text.startsWith(`${categoryLabel}${REPORT_SEPARATOR}`)) {
      return { category, categoryLabel, details: text.slice(categoryLabel.length + REPORT_SEPARATOR.length).trim() || null };
    }
  }
  return { category: null, categoryLabel: null, details: text };
};

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

  async _requireWritableAccess(user, scopeType, scopeId) {
    const ctx = await this._requireAccess(user, scopeType, scopeId);
    if (ctx.readOnly) throw new ClanFrozenError();
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
  async listSpaces(user, options = {}) {
    return spaceService.listSpaces(user, options);
  }

  /**
   * The people in a space — a page of them.
   *
   * This used to load every member of the scope in one go and hand the lot to
   * the browser. In a programme space that is the whole fellowship: a
   * thousand-odd user rows, each with a photo, rendered as one endless column
   * nobody could get to the bottom of. The membership itself is derived, so
   * the id list still has to be computed; what changed is that only the page
   * being looked at is loaded, named and sent.
   *
   * `q` filters by name in the database rather than in the browser, which is
   * the only way a search can find somebody who is not on the current page.
   */
  async getMembers(user, scopeType, scopeId, { limit = 50, offset = 0, q = null } = {}) {
    await this._requireAccess(user, scopeType, scopeId);
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
    const safeOffset = Math.max(parseInt(offset, 10) || 0, 0);

    const ids = await spaceService.getMemberIds(scopeType, scopeId);
    const empty = { members: [], pagination: { limit: safeLimit, offset: safeOffset, totalItems: 0, hasMore: false } };
    if (!ids.length) return empty;

    const where = { id: { [Op.in]: ids } };
    const term = typeof q === 'string' ? q.trim() : '';
    if (term) {
      const like = `%${term}%`;
      where[Op.or] = [
        { firstName: { [Op.iLike]: like } },
        { lastName: { [Op.iLike]: like } },
        // So "ada lovelace" matches, not just one half of it.
        sequelize.where(
          sequelize.fn('concat', sequelize.col('first_name'), ' ', sequelize.col('last_name')),
          { [Op.iLike]: like },
        ),
      ];
    }

    const [{ rows: users, count: totalItems }, memberships] = await Promise.all([
      models.User.findAndCountAll({
        where,
        attributes: ['id', 'firstName', 'lastName', 'role', 'profilePictureUrl'],
        order: [['first_name', 'ASC'], ['last_name', 'ASC']],
        limit: safeLimit,
        offset: safeOffset,
      }),
      scopeType === 'clan'
        ? models.ClanMembership.findAll({ where: { clanId: scopeId, status: 'active' }, attributes: ['userId', 'role'] })
        : Promise.resolve([])
    ]);

    const clanRole = new Map(memberships.map((m) => [m.userId, m.role]));
    return {
      members: users.map((u) => ({
        id: u.id,
        name: fullName(u),
        avatar: initials(u),
        avatarUrl: photo(u),
        role: clanRole.get(u.id) || u.role
      })),
      pagination: {
        limit: safeLimit,
        offset: safeOffset,
        totalItems,
        hasMore: safeOffset + users.length < totalItems,
      },
    };
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
      models.CommunityPost.findAll({ where: { type: 'kudos', toId: { [Op.in]: memberIds }, deletedAt: null, ...scopeWhere, ...timeWhere }, attributes: ['toId', 'authorId'] }),
      models.CommunityPost.findAll({ where: { authorId: { [Op.in]: memberIds }, deletedAt: null, ...scopeWhere, ...timeWhere }, attributes: ['id', 'authorId', 'acceptedCommentId'] })
    ]);
    const acceptedIds = posts.map((p) => p.acceptedCommentId).filter(Boolean);
    const postIds = posts.map((p) => p.id);
    const [acceptedComments, reactions] = await Promise.all([
      acceptedIds.length ? models.CommunityComment.findAll({ where: { id: { [Op.in]: acceptedIds } }, attributes: ['id', 'authorId'] }) : [],
      postIds.length ? models.CommunityReaction.findAll({ where: { postId: { [Op.in]: postIds }, type: { [Op.in]: REACTION_TYPES } }, attributes: ['postId', 'userId'] }) : []
    ]);
    const postAuthor = new Map(posts.map((p) => [p.id, p.authorId]));
    const askerOfAnswer = new Map(posts.filter((p) => p.acceptedCommentId).map((p) => [p.acceptedCommentId, p.authorId]));

    // You can't earn points from yourself: kudos to yourself, an answer you accepted
    // on your own question, or reactions on your own post don't count. XP already
    // works this way (see createPost and acceptAnswer).
    const tally = new Map(memberIds.map((id) => [id, { kudos: 0, answers: 0, posts: 0, reactions: 0 }]));
    kudos.forEach((k) => { const t = k.authorId !== k.toId && tally.get(k.toId); if (t) t.kudos += 1; });
    posts.forEach((p) => { const t = tally.get(p.authorId); if (t) t.posts += 1; });
    acceptedComments.forEach((c) => { const t = c.authorId !== askerOfAnswer.get(c.id) && tally.get(c.authorId); if (t) t.answers += 1; });
    reactions.forEach((r) => { const a = postAuthor.get(r.postId); const t = a && r.userId !== a && tally.get(a); if (t) t.reactions += 1; });

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
  /**
   * The space feed.
   *
   * Was a hardcoded `limit: 80` with no way to ask for the next page — so a
   * space simply stopped having history past its 80th post, and every visit
   * paid for 80 posts with their authors and full reaction arrays.
   *
   * Now cursor-paginated on created_at. A cursor (rather than an offset) is the
   * right shape for a feed people post into while reading: an offset would
   * duplicate or skip posts as new ones arrive above.
   *
   * `stats` and `shoutouts` are returned on the FIRST page only. They summarise
   * the space, not the page, and recomputing them per page would either repeat
   * work or produce numbers that shrink as you scroll.
   *
   * @param {Object} [options]
   * The default stays at the historical page size so the web feed shows exactly
   * what it shows today; a mobile client should ask for a smaller page.
   *
   * @param {string} [options.before] ISO timestamp cursor — return posts older than this
   * @param {number} [options.limit=80] capped at 80
   */
  async feed(user, {
    scopeType = 'global', scopeId = null, type = null, tag = null, q = null,
    before = null, limit = 80,
  } = {}) {
    const ctx = await this._requireAccess(user, scopeType, scopeId);
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 80, 1), 80);
    const isFirstPage = !before;

    const where = { scopeType, scopeId: scopeId || null, deletedAt: null };
    if (type && POST_TYPES.includes(type)) where.type = type;
    if (tag) where.tags = { [Op.contains]: [tag] };
    if (q && q.trim()) {
      const like = `%${q.trim()}%`;
      where[Op.or] = [{ title: { [Op.iLike]: like } }, { body: { [Op.iLike]: like } }];
    }
    if (before) {
      const cursor = new Date(before);
      if (!Number.isNaN(cursor.getTime())) where.createdAt = { [Op.lt]: cursor };
    }

    // Fetch one extra row to learn whether another page exists without a
    // second COUNT over a table that only grows.
    const posts = await models.CommunityPost.findAll({
      where,
      order: [['created_at', 'DESC']],
      limit: safeLimit + 1,
      include: [
        { model: models.User, as: 'author', attributes: ['id', 'firstName', 'lastName', 'profilePictureUrl'] },
        { model: models.User, as: 'recipient', attributes: ['id', 'firstName', 'lastName'] },
        { model: models.CommunityReaction, as: 'reactions', attributes: ['userId', 'type'] }
      ]
    });

    const hasMore = posts.length > safeLimit;
    if (hasMore) posts.pop();
    const nextCursor = hasMore && posts.length
      ? new Date(posts[posts.length - 1].createdAt).toISOString()
      : null;

    const mapped = posts.map((p) => this._mapPost(p, user.id));
    // Pinned first, then newest — within the page. The DB order stays purely
    // chronological because that is what the cursor walks; sorting pinned to the
    // top in SQL would make `created_at < cursor` skip older pinned posts.
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
      // First page only: these describe the space, and a client paging further
      // already holds them. Omitting them keeps later pages cheap.
      ...(isFirstPage
        ? {
          shoutouts: shoutouts.map(strip),
          stats: { given, cheersReceived, posts: mapped.length, openQuestions }
        }
        : {}),
      pagination: { limit: safeLimit, hasMore, nextCursor }
    };
  }

  // ── posts ────────────────────────────────────────────────────────────────
  async createPost(user, data) {
    const { type, scopeType, scopeId, title, body, toId, tags, linkUrl, attachments, mentionedUserIds } = data;
    if (!body || !body.trim()) throw new ValidationError('Say something');
    const resolvedType = POST_TYPES.includes(type) ? type : 'discussion';
    await this._requireWritableAccess(user, scopeType, scopeId || null);

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
    const { post, ctx } = await this._loadPostWithAccess(user, postId);
    if (ctx.readOnly) throw new ClanFrozenError();
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
    if (ctx.readOnly) throw new ClanFrozenError();
    if (!this._canModerate(ctx, user, post.authorId)) throw new AuthorizationError('Not allowed');
    await post.update({ deletedAt: new Date() });
    return { deleted: true };
  }

  async setPinned(user, postId, pinned) {
    const { post, ctx } = await this._loadPostWithAccess(user, postId);
    if (ctx.readOnly) throw new ClanFrozenError();
    if (!ctx.isModerator) throw new AuthorizationError('Only space moderators can pin posts');
    await post.update(pinned ? { pinnedAt: new Date(), pinnedBy: user.id } : { pinnedAt: null, pinnedBy: null });
    return { pinned: Boolean(pinned) };
  }

  async toggleReaction(user, postId, type) {
    if (!REACTION_TYPES.includes(type)) throw new ValidationError('Invalid reaction type');
    const { ctx } = await this._loadPostWithAccess(user, postId);
    if (ctx.readOnly) throw new ClanFrozenError();
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
    const { post, ctx } = await this._loadPostWithAccess(user, postId);
    if (ctx.readOnly) throw new ClanFrozenError();

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
    const { ctx } = await this._loadPostWithAccess(user, comment.postId);
    if (ctx.readOnly) throw new ClanFrozenError();
    await comment.update({ body: body.trim(), editedAt: new Date() });
    return comment;
  }

  async deleteComment(user, commentId) {
    const comment = await models.CommunityComment.findOne({ where: { id: commentId, deletedAt: null } });
    if (!comment) throw new NotFoundError('Comment not found');
    const { post, ctx } = await this._loadPostWithAccess(user, comment.postId);
    if (ctx.readOnly) throw new ClanFrozenError();
    if (!this._canModerate(ctx, user, comment.authorId)) throw new AuthorizationError('Not allowed');
    await comment.update({ deletedAt: new Date() });
    await post.decrement('commentCount');
    if (post.acceptedCommentId === comment.id) await post.update({ acceptedCommentId: null, resolved: false });
    return { deleted: true };
  }

  /** Mark a comment as the accepted answer on a question (author or moderator). */
  async acceptAnswer(user, postId, commentId) {
    const { post, ctx } = await this._loadPostWithAccess(user, postId);
    if (ctx.readOnly) throw new ClanFrozenError();
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
  async report(user, { targetType, targetId, reason, category, details }) {
    if (!['post', 'comment'].includes(targetType)) throw new ValidationError('Invalid report target');
    // A categorised report is stored as one readable line ("Spam — <details>")
    // in the existing `reason` column, which is what the moderation queue
    // already shows. A bare `reason` is still accepted from older clients.
    let storedReason = typeof reason === 'string' ? reason.trim().slice(0, REPORT_DETAILS_MAX) : '';
    if (category !== undefined && category !== null && category !== '') {
      const label = REPORT_CATEGORIES[category];
      if (!label) throw new ValidationError('Choose a reason for the report');
      const note = typeof details === 'string' ? details.trim() : '';
      if (note.length > REPORT_DETAILS_MAX) {
        throw new ValidationError(`Keep the details under ${REPORT_DETAILS_MAX} characters`);
      }
      if (category === 'other' && !note) {
        throw new ValidationError('Tell us what is wrong so a moderator knows what to look at');
      }
      storedReason = note ? `${label}${REPORT_SEPARATOR}${note}` : label;
    }
    // Confirm the target exists and the reporter can see its space.
    if (targetType === 'post') {
      await this._loadPostWithAccess(user, targetId);
    } else {
      const comment = await models.CommunityComment.findOne({ where: { id: targetId, deletedAt: null } });
      if (!comment) throw new NotFoundError('Comment not found');
      await this._loadPostWithAccess(user, comment.postId);
    }
    await models.CommunityReport.create({ targetType, targetId, reporterId: user.id, reason: storedReason || null });
    return { reported: true };
  }

  async listReports(_user, { status = 'open' } = {}) {
    const reports = await models.CommunityReport.findAll({
      where: status ? { status } : {},
      order: [['created_at', 'DESC']],
      include: [{ model: models.User, as: 'reporter', attributes: ['id', 'firstName', 'lastName', 'role', 'profilePictureUrl'] }]
    });

    // Attach a preview of each reported target so a moderator can judge without leaving the queue.
    const postIds = reports.filter((r) => r.targetType === 'post').map((r) => r.targetId);
    const commentIds = reports.filter((r) => r.targetType === 'comment').map((r) => r.targetId);
    const authorInc = [{ model: models.User, as: 'author', attributes: ['id', 'firstName', 'lastName', 'role', 'profilePictureUrl'] }];
    const [posts, comments] = await Promise.all([
      postIds.length ? models.CommunityPost.findAll({ where: { id: { [Op.in]: postIds } }, include: authorInc, paranoid: false }) : [],
      commentIds.length ? models.CommunityComment.findAll({ where: { id: { [Op.in]: commentIds } }, include: authorInc, paranoid: false }) : []
    ]);
    const postMap = new Map(posts.map((p) => [p.id, p]));
    const commentMap = new Map(comments.map((c) => [c.id, c]));

    /**
     * Where each report came from.
     *
     * The queue said what was reported and who reported it, and never which
     * SPACE it happened in — so an admin running several programmes could not
     * tell a report in one from a report in another, and had no way to work
     * through their own. A post carries its scope; a comment carries a post,
     * so its scope is one hop away.
     */
    const parentIds = [...new Set(comments.map((c) => c.postId).filter(Boolean))];
    const parents = parentIds.length
      ? await models.CommunityPost.findAll({
        where: { id: { [Op.in]: parentIds } },
        attributes: ['id', 'scopeType', 'scopeId'], paranoid: false, raw: true,
      })
      : [];
    const parentMap = new Map(parents.map((p) => [p.id, p]));
    const scopeOf = (target, type) => {
      if (!target) return null;
      if (type === 'post') return { scopeType: target.scopeType, scopeId: target.scopeId };
      const parent = parentMap.get(target.postId);
      return parent ? { scopeType: parent.scopeType, scopeId: parent.scopeId } : null;
    };

    // Names and owning programmes for every scope in the queue, in two queries.
    const scopes = reports.map((r) => scopeOf(
      r.targetType === 'post' ? postMap.get(r.targetId) : commentMap.get(r.targetId),
      r.targetType,
    )).filter(Boolean);
    const clanIds = [...new Set(scopes.filter((s) => s.scopeType === 'clan').map((s) => s.scopeId).filter(Boolean))];
    const programIds = [...new Set(scopes.filter((s) => s.scopeType === 'program').map((s) => s.scopeId).filter(Boolean))];
    const [clanRows, programRows] = await Promise.all([
      clanIds.length ? models.Clan.findAll({ where: { id: { [Op.in]: clanIds } }, attributes: ['id', 'name', 'programId'], raw: true }) : [],
      programIds.length ? models.Program.findAll({ where: { id: { [Op.in]: programIds } }, attributes: ['id', 'name'], raw: true }) : [],
    ]);
    const clanById = new Map(clanRows.map((c) => [c.id, c]));
    const programById = new Map(programRows.map((p) => [p.id, p]));
    const describeScope = (scope) => {
      if (!scope) return { scopeType: null, scopeId: null, scopeLabel: null, programId: null };
      if (scope.scopeType === 'clan') {
        const clan = clanById.get(scope.scopeId);
        return { ...scope, scopeLabel: clan?.name || 'Clan', programId: clan?.programId || null };
      }
      if (scope.scopeType === 'program') {
        return { ...scope, scopeLabel: programById.get(scope.scopeId)?.name || 'Program', programId: scope.scopeId };
      }
      // A cohort belongs to a programme too, but the queue only needs to group
      // by programme — and global is the Lounge, which belongs to none.
      return { ...scope, scopeLabel: scope.scopeType === 'global' ? 'Lounge' : 'Cohort', programId: null };
    };

    return reports.map((r) => {
      const t = r.targetType === 'post' ? postMap.get(r.targetId) : commentMap.get(r.targetId);
      const preview = t ? `${t.title ? `${t.title} - ` : ''}${t.body || ''}`.slice(0, 240) : '(content removed)';
      return {
        id: r.id,
        targetType: r.targetType,
        targetId: r.targetId,
        reason: r.reason,
        // The same line, split for display: the picked reason and their words.
        ...parseReportReason(r.reason),
        status: r.status,
        at: r.createdAt,
        reporter: { id: r.reporter?.id, name: fullName(r.reporter), role: r.reporter?.role || null, avatarUrl: photo(r.reporter) },
        preview,
        targetAuthor: t ? fullName(t.author) : null,
        targetAuthorId: t?.author?.id || null,
        targetAuthorRole: t?.author?.role || null,
        targetAuthorAvatarUrl: t ? photo(t.author) : null,
        targetDeleted: t ? Boolean(t.deletedAt) : true,
        ...describeScope(scopeOf(t, r.targetType))
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
