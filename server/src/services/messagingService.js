const { Op, fn, col } = require('sequelize');
const { models, sequelize } = require('../db');
const {
  NotFoundError,
  ForbiddenError,
  ValidationError
} = require('../utils/errors/errorTypes');
const schedulingService = require('./schedulingService');
const { VISIBLE_MEMBERSHIP_STATUSES, HISTORICAL_MEMBERSHIP_STATUSES } = require('../config/membership');
const { getRequestContext } = require('../utils/auditContext');
const logger = require('../utils/logger');
const { uploadToCloudinary } = require('../utils/cloudinaryUpload');
const path = require('path');

/** Documents a group discussion chat accepts, besides images, video and voice notes. */
const GROUP_DOCUMENT_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
]);
const GROUP_DOCUMENT_EXTENSIONS = new Set(['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.csv']);
/** Cloudinary's cap on a raw (document) upload. Images and videos may be larger. */
const GROUP_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;

// Clan roles that mean "I mentor the people in this clan". Mirrors
// authzService.mentoredClanIds — kept local because this file only needs the
// membership shape, not the whole permission engine.
const MENTOR_CLAN_ROLES = ['lead_mentor', 'co_mentor', 'core_team'];

class MessagingService {
  /**
   * Who this user is allowed to discover and start a direct conversation with
   * in the portal they currently have open.
   *
   * The ids are resolved here, at the API boundary. A client-side filter would
   * still download people from other clans and would make a crafted direct
   * conversation request an authorization bypass.
   *
   * `null` only exists for legacy calls with no workspace context. Every real
   * request has a workspace and therefore gets an explicit tenant-scoped set.
   */
  async getAllowedRecipientIds(userId) {
    const user = await models.User.findByPk(userId, { attributes: ['id', 'role', 'capabilities'] });
    if (!user) return [];

    const context = getRequestContext();
    const organizationId = context.organizationId || null;
    // One resolution of the role assignments, shared by both questions below:
    // this runs on every send, every directory search and every new thread.
    const authzService = require('./authzService');
    const assignments = await authzService.getAssignments(user);
    const caps = await authzService.getCapabilities(user, { assignments });
    const requestedPortal = ['admin', 'mentor', 'mentee'].includes(context.portalRole)
      ? context.portalRole
      : null;
    const portal = requestedPortal && caps.includes(requestedPortal)
      ? requestedPortal
      : (caps.includes(user.role) ? user.role : caps[0]);

    let workspaceUserIds = null;
    let adminIds = [];
    if (organizationId) {
      const memberships = await models.OrganizationMembership.findAll({
        where: { organizationId, status: 'active' },
        attributes: ['userId', 'role']
      });
      workspaceUserIds = memberships.map((membership) => membership.userId);
      adminIds = memberships
        .filter((membership) => ['owner', 'admin'].includes(membership.role))
        .map((membership) => membership.userId);
    }

    const scope = await authzService.programScopeFor(user, portal, { assignments });
    /**
     * The admins this person may always reach.
     *
     * Every org admin stayed reachable from every hat, which is right: being
     * limited to one programme is a reason to NEED an org admin, not a reason
     * to be cut off from one. What was wrong is that the admins of OTHER
     * programmes came with them, so a mentee in one fellowship had the people
     * running three others in their directory.
     */
    const reachableAdminIds = [...new Set([
      ...adminIds,
      ...(await authzService.adminUserIdsFor(scope.programIds || [])),
    ])];

    if (portal === 'admin') {
      if (workspaceUserIds === null) return null;
      /**
       * An admin of one programme may write to that programme.
       *
       * This returned the whole workspace to anybody wearing the admin hat,
       * so somebody granted a single fellowship could open a chat with all
       * 1,089 members of the organisation - and the picker listed them.
       */
      if (scope.unrestricted) return workspaceUserIds.filter((id) => id !== userId);

      const inScope = new Set(reachableAdminIds);
      if (scope.clanIds.length) {
        const members = await models.ClanMembership.findAll({
          where: {
            clanId: { [Op.in]: scope.clanIds },
            status: { [Op.in]: VISIBLE_MEMBERSHIP_STATUSES },
          },
          attributes: ['userId'],
          raw: true,
        });
        members.forEach((m) => inScope.add(m.userId));
      }
      const workspaceSet = new Set(workspaceUserIds);
      return [...inScope].filter((id) => id !== userId && workspaceSet.has(id));
    }

    const allowed = new Set(reachableAdminIds);

    if (portal === 'mentor') {
      /**
       * The mentors of this mentor's OWN programmes.
       *
       * This was `MentorProfile.findAll({ attributes: ['userId'] })` - no
       * filter of any kind - so a mentor running one clan of one fellowship
       * had every mentor in the workspace in their directory.
       */
      const clansInMyPrograms = await authzService.clanIdsInPrograms(scope.programIds || []);
      if (clansInMyPrograms.length) {
        const peerMentors = await models.ClanMembership.findAll({
          where: {
            clanId: { [Op.in]: clansInMyPrograms },
            status: { [Op.in]: VISIBLE_MEMBERSHIP_STATUSES },
            role: { [Op.in]: MENTOR_CLAN_ROLES },
          },
          attributes: ['userId'],
          raw: true,
        });
        peerMentors.forEach((m) => allowed.add(m.userId));
      } else {
        /**
         * A mentor who belongs to no programme at all gets the workspace's
         * mentors, as before.
         *
         * Bounding somebody to programmes they do not have produces an empty
         * directory, which is not what scoping is for - and mentor-to-mentor
         * messaging has never needed a clan or a match between them. The bound
         * narrows a real scope; it does not invent one.
         */
        const mentorProfiles = await models.MentorProfile.findAll({ attributes: ['userId'] });
        const workspaceSet = workspaceUserIds === null ? null : new Set(workspaceUserIds);
        mentorProfiles.forEach((profile) => {
          if (!workspaceSet || workspaceSet.has(profile.userId)) allowed.add(profile.userId);
        });
      }

      const [mentoredMemberships, directMatches] = await Promise.all([
        models.ClanMembership.findAll({
          where: {
            userId,
            status: 'active',
            role: { [Op.in]: MENTOR_CLAN_ROLES }
          },
          attributes: ['clanId']
        }),
        models.MentorMenteeMatch.findAll({
          where: { mentorId: userId, status: 'active' },
          attributes: ['menteeId']
        })
      ]);
      directMatches.forEach((match) => allowed.add(match.menteeId));

      const clanIds = mentoredMemberships.map((membership) => membership.clanId);
      if (clanIds.length) {
        const mentees = await models.ClanMembership.findAll({
          where: {
            clanId: { [Op.in]: clanIds },
            status: { [Op.in]: VISIBLE_MEMBERSHIP_STATUSES },
            role: 'mentee'
          },
          attributes: ['userId']
        });
        mentees.forEach((membership) => allowed.add(membership.userId));
      }
    } else {
      const mentorIds = await schedulingService.getMenteeMentorIds(userId);
      mentorIds.forEach((id) => allowed.add(id));

      // A paused mentee is still part of their clan and must still be able to
      // reach the people supporting them there.
      const myClans = await models.ClanMembership.findAll({
        where: {
          userId,
          status: { [Op.in]: VISIBLE_MEMBERSHIP_STATUSES },
          role: 'mentee'
        },
        attributes: ['clanId']
      });
      const clanIds = myClans.map((membership) => membership.clanId);
      if (clanIds.length) {
        const members = await models.ClanMembership.findAll({
          where: {
            clanId: { [Op.in]: clanIds },
            status: { [Op.in]: VISIBLE_MEMBERSHIP_STATUSES }
          },
          attributes: ['userId']
        });
        members.forEach((membership) => allowed.add(membership.userId));
      }
    }

    if (workspaceUserIds !== null) {
      const workspaceSet = new Set(workspaceUserIds);
      for (const id of allowed) if (!workspaceSet.has(id)) allowed.delete(id);
    }
    allowed.delete(userId);
    return [...allowed];
  }
  /**
   * Contacts that belong to the OTHER hat, and only the other hat — the people
   * whose direct threads should not appear in this portal's inbox.
   *
   * Two hats, as id sets:
   *   menteeHat  people met AS A LEARNER — every member of a clan where this
   *              person is a mentee, plus their 1:1 mentors.
   *   mentorHat  people met AS A MENTOR — every member of a clan where they
   *              mentor, plus their 1:1 mentees.
   *
   * Stated as an exclusion (hide minus keep) rather than as an inclusion on
   * purpose. An inclusion list silently loses every contact the relationship
   * model cannot classify — an admin, somebody from a clan you left — and an
   * inbox that quietly drops threads is worse than one showing a few extra.
   * Somebody in BOTH hats (a clan where you co-mentor and also learn) is in
   * neither exclusion, so their thread stays in both portals, which is true.
   *
   * Returns [] when nothing should be hidden — including, after three indexed
   * lookups and no further work, for the single-role majority who have no
   * other hat for anyone to fall under.
   */
  async #hiddenContactIds(userId, portal) {
    const role = portal && portal.role;
    if (role !== 'mentee' && role !== 'mentor') return [];

    const [myMemberships, matchesAsMentee, matchesAsMentor] = await Promise.all([
      models.ClanMembership.findAll({
        where: { userId, status: { [Op.in]: VISIBLE_MEMBERSHIP_STATUSES } },
        attributes: ['clanId', 'role']
      }),
      models.MentorMenteeMatch.findAll({ where: { menteeId: userId, status: 'active' }, attributes: ['mentorId'] }),
      models.MentorMenteeMatch.findAll({ where: { mentorId: userId, status: 'active' }, attributes: ['menteeId'] })
    ]);

    const clansWhereILearn = myMemberships.filter((m) => m.role === 'mentee').map((m) => m.clanId);
    const clansWhereIMentor = myMemberships
      .filter((m) => MENTOR_CLAN_ROLES.includes(m.role))
      .map((m) => m.clanId);

    // The hat being hidden, and the hat being kept.
    const [hideClanIds, hideMatches, keepClanIds, keepMatches] = role === 'mentee'
      ? [clansWhereIMentor, matchesAsMentor.map((m) => m.menteeId),
         clansWhereILearn, matchesAsMentee.map((m) => m.mentorId)]
      : [clansWhereILearn, matchesAsMentee.map((m) => m.mentorId),
         clansWhereIMentor, matchesAsMentor.map((m) => m.menteeId)];

    // Nothing under the other hat, so nothing to hide: the single-role case.
    // Stopping here keeps their inbox exactly as cheap as it was before.
    if (!hideClanIds.length && !hideMatches.length) return [];

    const clanIds = [...new Set([...hideClanIds, ...keepClanIds])];
    const membersByClan = new Map();
    if (clanIds.length) {
      const rows = await models.ClanMembership.findAll({
        where: { clanId: { [Op.in]: clanIds }, status: { [Op.in]: VISIBLE_MEMBERSHIP_STATUSES } },
        attributes: ['clanId', 'userId']
      });
      for (const row of rows) {
        if (!membersByClan.has(row.clanId)) membersByClan.set(row.clanId, []);
        membersByClan.get(row.clanId).push(row.userId);
      }
    }
    const contacts = (clanIdList, matchIds) => {
      const set = new Set();
      for (const clanId of clanIdList) {
        for (const id of (membersByClan.get(clanId) || [])) if (id !== userId) set.add(id);
      }
      for (const id of matchIds) if (id && id !== userId) set.add(id);
      return set;
    };

    const keep = contacts(keepClanIds, keepMatches);
    return [...contacts(hideClanIds, hideMatches)].filter((id) => !keep.has(id));
  }

  /**
   * Direct-thread counterparts who sit outside the programmes this person's
   * access currently covers.
   *
   * Scope is resolved on every read and written down nowhere, because it moves:
   * somebody can be an org admin at nine and an admin of one programme at ten,
   * and the inbox has to tell the truth at ten. Nothing is deleted and nothing
   * about the thread is touched, so restoring the access brings every thread
   * straight back.
   *
   * Bounded by the size of the INBOX, not of the organisation. It asks who this
   * person actually has direct threads with - tens of people - and then which
   * of those share a programme. Materialising every member of every clan in
   * scope would be thousands of ids fetched to filter a dozen threads.
   *
   * The test is "shares a programme with me", deliberately looser than the
   * directory `getAllowedRecipientIds` builds. A mentee who finished and left
   * the clan is no longer somebody you may START a chat with, and the thread
   * you already had with them must still be in your inbox: an inbox that
   * quietly drops history is worse than one showing a thread you cannot reply
   * to. Group and system threads are never hidden, for the reason given in
   * #hiddenContactIds - there is no single counterpart to attribute them to.
   */
  async #outOfProgramContactIds(userId, scope) {
    if (!scope || scope.unrestricted) return [];
    const mine = new Set(Array.isArray(scope.programIds) ? scope.programIds : []);
    // No programmes of our own is no basis on which to judge anybody else's.
    if (mine.size === 0) return [];

    const counterparts = await sequelize.query(
      `SELECT DISTINCT other.user_id AS id
         FROM conversation_participants mine
         JOIN conversations c ON c.id = mine.conversation_id AND c.type = 'direct'
         JOIN conversation_participants other
           ON other.conversation_id = mine.conversation_id
          AND other.user_id <> mine.user_id
        WHERE mine.user_id = :userId
          AND mine.left_at IS NULL
          AND other.left_at IS NULL`,
      { replacements: { userId }, type: sequelize.QueryTypes.SELECT }
    );
    const ids = counterparts.map((row) => row.id).filter(Boolean);
    if (!ids.length) return [];

    // Which programmes each counterpart belongs to, from every source that
    // places somebody in one.
    const theirPrograms = new Map();
    const note = (id, programId) => {
      if (!id || !programId) return;
      if (!theirPrograms.has(id)) theirPrograms.set(id, new Set());
      theirPrograms.get(id).add(programId);
    };
    const alwaysKeep = new Set();

    const [viaClan, viaEnrolment, grants, orgAdmins] = await Promise.all([
      models.ClanMembership.findAll({
        where: { userId: { [Op.in]: ids }, status: { [Op.in]: HISTORICAL_MEMBERSHIP_STATUSES } },
        attributes: ['userId'],
        include: [{ model: models.Clan, as: 'clan', attributes: ['programId'], required: true }],
      }),
      models.Enrollment.findAll({
        where: { menteeId: { [Op.in]: ids } },
        attributes: ['menteeId', 'programId'],
      }),
      models.RoleAssignment
        ? models.RoleAssignment.findAll({
          where: { userId: { [Op.in]: ids } },
          attributes: ['userId', 'scopeType', 'scopeId'],
        })
        : Promise.resolve([]),
      models.OrganizationMembership
        ? models.OrganizationMembership.findAll({
          where: { userId: { [Op.in]: ids }, status: 'active', role: { [Op.in]: ['owner', 'admin'] } },
          attributes: ['userId'],
        })
        : Promise.resolve([]),
    ]);

    viaClan.forEach((m) => note(m.userId, m.clan?.programId));
    viaEnrolment.forEach((e) => note(e.menteeId, e.programId));
    orgAdmins.forEach((m) => alwaysKeep.add(m.userId));

    const clanScopedGrants = [];
    grants.forEach((g) => {
      if (g.scopeType === 'org') alwaysKeep.add(g.userId);
      else if (g.scopeType === 'program') note(g.userId, g.scopeId);
      else if (g.scopeType === 'clan' && g.scopeId) clanScopedGrants.push(g);
    });
    if (clanScopedGrants.length && models.Clan) {
      const clans = await models.Clan.findAll({
        where: { id: { [Op.in]: [...new Set(clanScopedGrants.map((g) => g.scopeId))] } },
        attributes: ['id', 'programId'],
        raw: true,
        paranoid: false,
      });
      const programOfClan = new Map(clans.map((c) => [c.id, c.programId]));
      clanScopedGrants.forEach((g) => note(g.userId, programOfClan.get(g.scopeId)));
    }

    return ids.filter((id) => {
      if (alwaysKeep.has(id)) return false;
      const theirs = theirPrograms.get(id);
      /**
       * Nobody we cannot place is ever hidden.
       *
       * Stated as "hide the ones we can PROVE belong elsewhere", not "keep the
       * ones we can prove belong here", for the same reason #hiddenContactIds
       * is an exclusion: an inclusion list silently drops every contact the
       * relationship model cannot classify - an admin on a legacy base role, a
       * platform user, somebody with no clan and no enrolment - and an inbox
       * that quietly loses threads is worse than one showing a few extra.
       */
      if (!theirs || theirs.size === 0) return false;
      for (const programId of theirs) if (mine.has(programId)) return false;
      return true;
    });
  }

  async findDirectConversationsByKey(directKey, transaction = null) {
    return models.Conversation.findAll({
      where: {
        type: 'direct',
        isArchived: false,
        metadata: {
          directKey
        }
      },
      transaction
    });
  }

  selectCanonicalDirectConversation(conversations) {
    if (!Array.isArray(conversations) || conversations.length === 0) {
      return null;
    }

    return [...conversations].sort((left, right) => {
      const leftLastMessageAt = left.lastMessageAt ? new Date(left.lastMessageAt).getTime() : -1;
      const rightLastMessageAt = right.lastMessageAt ? new Date(right.lastMessageAt).getTime() : -1;

      if (leftLastMessageAt !== rightLastMessageAt) {
        return rightLastMessageAt - leftLastMessageAt;
      }

      return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
    })[0];
  }

  async createOrGetDirectConversation(userId, participantId, options = {}) {
    if (userId === participantId) {
      throw new ValidationError('Cannot create a direct conversation with yourself');
    }

    const participant = await models.User.findByPk(participantId, {
      attributes: ['id', 'status']
    });

    if (!participant || participant.status !== 'active') {
      throw new NotFoundError('Participant not found');
    }

    // A mentee may only start conversations with their mentor(s) + clan members.
    const allowed = await this.getAllowedRecipientIds(userId);
    if (allowed !== null && !allowed.includes(participantId)) {
      throw new ForbiddenError('You can only message people available in your workspace directory');
    }

    const directKey = [userId, participantId].sort().join(':');

    const conversation = await sequelize.transaction(async (transaction) => {
      await sequelize.query(
        'SELECT pg_advisory_xact_lock(hashtext(:lockKey))',
        {
          replacements: { lockKey: `direct-conversation:${directKey}` },
          transaction
        }
      );

      const existingConversations = await this.findDirectConversationsByKey(directKey, transaction);
      const existingConversation = this.selectCanonicalDirectConversation(existingConversations);
      if (existingConversation) {
        // Rejoining is not the same as never having left. Whoever deleted this
        // conversation gets a fresh joinedAt, which is the floor every read
        // below is filtered by, so the history they removed stays removed. The
        // person who never left keeps theirs: updating both rows in one call
        // was silently wiping the other side's conversation the moment somebody
        // re-opened one they had deleted.
        await models.ConversationParticipant.update({
          leftAt: null,
          isArchived: false,
          joinedAt: new Date(),
          lastReadAt: new Date(),
          lastReadMessageId: null
        }, {
          where: {
            conversationId: existingConversation.id,
            userId: { [Op.in]: [userId, participantId] },
            leftAt: { [Op.ne]: null }
          },
          transaction
        });

        await models.ConversationParticipant.update({
          isArchived: false
        }, {
          where: {
            conversationId: existingConversation.id,
            userId: { [Op.in]: [userId, participantId] },
            leftAt: null
          },
          transaction
        });

        return existingConversation;
      }

      const created = await models.Conversation.create({
        type: 'direct',
        createdBy: userId,
        relatedTaskId: options.relatedTaskId || null,
        relatedEnrollmentId: options.relatedEnrollmentId || null,
        metadata: { directKey }
      }, { transaction });

      await models.ConversationParticipant.bulkCreate([
        {
          conversationId: created.id,
          userId,
          role: 'owner'
        },
        {
          conversationId: created.id,
          userId: participantId,
          role: 'participant'
        }
      ], { transaction });

      return created;
    });

    return this.getConversationByIdForUser(conversation.id, userId);
  }

  /**
   * A group chat belongs to its discussion, not to one member's inbox: who is in
   * it is the mentor's decision, so nobody archives or leaves it from here.
   */
  async #assertNotGroupConversation(conversationId) {
    const conversation = await models.Conversation.findByPk(conversationId, { attributes: ['id', 'type'] });
    if (conversation?.type === 'group') {
      throw new ForbiddenError('A group discussion is managed by its mentor');
    }
  }

  async archiveConversation(userId, conversationId) {
    const participant = await this.assertUserInConversation(userId, conversationId);
    await this.#assertNotGroupConversation(conversationId);
    await participant.update({ isArchived: true });
    return { archived: true };
  }

  async unarchiveConversation(userId, conversationId) {
    const participant = await this.assertUserInConversation(userId, conversationId);
    await this.#assertNotGroupConversation(conversationId);
    await participant.update({ isArchived: false });
    return { archived: false };
  }

  async deleteConversation(userId, conversationId) {
    const participant = await this.assertUserInConversation(userId, conversationId);
    await this.#assertNotGroupConversation(conversationId);
    await participant.update({ leftAt: new Date() });
    return { deleted: true };
  }

  async listConversations(userId, options = {}) {
    const limit = Math.min(Math.max(Number(options.limit || 25), 1), 100);
    const isArchived = options.archived === 'true' || options.archived === true;

    // Which hat is this inbox for? A person who leads one clan and learns in
    // another had both sets of threads in one list, in both portals. The split
    // happens HERE rather than after the fetch because the list is paged: a
    // filter applied to an already-limited page would return short pages and
    // hide older threads entirely.
    // Two independent reasons a direct thread does not belong in THIS list:
    // it belongs to the other hat, or its counterpart is outside the
    // programmes this person can currently see. Both resolve to a set of
    // counterpart ids, so they are unioned and excluded in one pass.
    const scopeUser = await models.User.findByPk(userId, { attributes: ['id', 'role', 'capabilities'] });
    const scope = scopeUser
      ? await require('./authzService').programScopeFor(scopeUser, options.portal?.role || null)
      : null;
    const hiddenContactIds = [...new Set([
      ...(await this.#hiddenContactIds(userId, options.portal)),
      ...(await this.#outOfProgramContactIds(userId, scope)),
    ])];
    const portalFilter = hiddenContactIds.length
      ? {
        conversationId: {
          // Only DIRECT threads are ever hidden — a group/system conversation
          // has no single counterpart to attribute to one hat, so it stays.
          [Op.notIn]: sequelize.literal(
            '(SELECT cp.conversation_id FROM conversation_participants cp ' +
            'JOIN conversations c ON c.id = cp.conversation_id ' +
            'WHERE cp.user_id IN (:portalHiddenIds) AND cp.left_at IS NULL AND c.type = \'direct\')'
          )
        }
      }
      : {};

    // Step 1: fetch conversation IDs in stable order using a lightweight join.
    const membershipRows = await models.ConversationParticipant.findAll({
      attributes: ['conversationId', 'joinedAt'],
      ...(hiddenContactIds.length ? { replacements: { portalHiddenIds: hiddenContactIds } } : {}),
      where: {
        userId,
        leftAt: null,
        isArchived,
        ...portalFilter
      },
      include: [
        {
          model: models.Conversation,
          as: 'conversation',
          attributes: ['id', 'lastMessageAt'],
          // A group chat lives on its discussion's page, not in the inbox.
          where: { isArchived: false, type: { [Op.ne]: 'group' } },
          required: true
        }
      ],
      // NULLS LAST is not the default. Postgres sorts NULLs first on DESC, so a
      // conversation nobody has written in yet outranked every live thread and
      // the inbox opened on empty rows. A conversation with no messages is the
      // least recent thing there is, not the most.
      order: [
        [
          sequelize.literal(
            '"conversation"."last_message_at" DESC NULLS LAST'
          )
        ],
        ['createdAt', 'DESC']
      ],
      limit,
      subQuery: false
    });

    const orderedConversationIds = [...new Set(
      membershipRows.map((row) => row.conversationId).filter(Boolean)
    )];

    // When this person joined each conversation. Everything they are shown
    // about it - the preview line and the unread badge - is floored by this,
    // so a conversation they deleted and re-opened does not come back carrying
    // its old last message and a badge for messages they chose to remove.
    const joinedAtByConversation = new Map(
      membershipRows.map((row) => [row.conversationId, row.joinedAt ? new Date(row.joinedAt) : null])
    );

    if (orderedConversationIds.length === 0) {
      return [];
    }

    // Step 2: hydrate conversations with participants and latest message.
    const conversations = await models.Conversation.findAll({
      where: {
        id: { [Op.in]: orderedConversationIds },
        isArchived: false
      },
      include: [
        {
          model: models.ConversationParticipant,
          as: 'participants',
          where: {
            leftAt: null
          },
          required: false,
          include: [
            {
              model: models.User,
              as: 'user',
              attributes: ['id', 'firstName', 'lastName', 'email', 'profilePictureUrl', 'role']
            }
          ]
        },
        {
          model: models.Message,
          as: 'lastMessage',
          attributes: ['id', 'senderId', 'recipientId', 'messageText', 'createdAt', 'isRead']
        }
      ]
    });

    const conversationById = new Map(
      conversations.map((conversation) => [conversation.id, conversation])
    );
    const orderedConversations = orderedConversationIds
      .map((conversationId) => conversationById.get(conversationId))
      .filter(Boolean);

    let unreadByConversation = {};
    const unreadRows = await models.Message.findAll({
      attributes: [
        'threadId',
        [fn('COUNT', col('id')), 'count']
      ],
      where: {
        // One branch per conversation rather than a single IN, because each
        // carries its own floor. The list is capped at a hundred and every
        // branch is keyed on the indexed threadId.
        [Op.or]: orderedConversationIds.map((conversationId) => {
          const floor = joinedAtByConversation.get(conversationId);
          return floor
            ? { threadId: conversationId, createdAt: { [Op.gte]: floor } }
            : { threadId: conversationId };
        }),
        recipientId: userId,
        isRead: false
      },
      group: ['thread_id'],
      raw: true
    });

    unreadByConversation = unreadRows.reduce((acc, row) => {
      acc[row.threadId] = Number(row.count);
      return acc;
    }, {});

    // Tag each conversation with the clan(s) its OTHER participants belong to,
    // so the mentor UI can scope the conversation list by clan. One batched
    // ClanMembership query for all counterparts.
    const otherUserIds = new Set();
    for (const conversation of orderedConversations) {
      for (const p of (conversation.participants || [])) {
        if (p.userId && p.userId !== userId) otherUserIds.add(p.userId);
      }
    }
    const clanIdsByUser = new Map();
    if (otherUserIds.size) {
      const memberships = await models.ClanMembership.findAll({
        // Include paused — dual-clan mentees paused in one clan still belong there for scoping.
        where: { userId: { [Op.in]: [...otherUserIds] }, status: { [Op.in]: VISIBLE_MEMBERSHIP_STATUSES } },
        attributes: ['userId', 'clanId']
      });
      for (const m of memberships) {
        if (!clanIdsByUser.has(m.userId)) clanIdsByUser.set(m.userId, new Set());
        clanIdsByUser.get(m.userId).add(m.clanId);
      }
    }

    const seenDirectKeys = new Set();

    return orderedConversations.flatMap((conversation) => {
      const json = conversation.toJSON();
      const otherParticipants = (json.participants || []).filter((p) => p.userId !== userId);
      const fallbackDirectKey = otherParticipants
        .map((participant) => participant.userId)
        .concat(userId)
        .filter(Boolean)
        .sort()
        .join(':');
      const directKey = json.type === 'direct'
        ? json.metadata?.directKey || fallbackDirectKey
        : null;

      if (directKey) {
        if (seenDirectKeys.has(directKey)) {
          return [];
        }

        seenDirectKeys.add(directKey);
      }

      // The preview follows the same floor as the thread itself. Without this
      // a re-opened conversation shows a line the person deleted, which is the
      // one place the inbox would contradict what opening it displays.
      const floor = joinedAtByConversation.get(json.id);
      const lastMessage = json.lastMessage
        && (!floor || new Date(json.lastMessage.createdAt) >= floor)
        ? json.lastMessage
        : null;

      return [{
        id: json.id,
        type: json.type,
        relatedTaskId: json.relatedTaskId,
        relatedEnrollmentId: json.relatedEnrollmentId,
        lastMessageAt: json.lastMessageAt,
        unreadCount: unreadByConversation[json.id] || 0,
        participants: otherParticipants.map((p) => ({
          id: p.user?.id,
          firstName: p.user?.firstName,
          lastName: p.user?.lastName,
          email: p.user?.email,
          profilePictureUrl: p.user?.profilePictureUrl,
          role: p.user?.role
        })),
        clanIds: [...new Set(otherParticipants.flatMap((p) => [...(clanIdsByUser.get(p.userId) || [])]))],
        lastMessage
      }];
    });
  }

  async listMessages(userId, conversationId, options = {}) {
    const participant = await this.assertUserInConversation(userId, conversationId);

    const limit = Math.min(Math.max(Number(options.limit || 50), 1), 100);
    const where = { threadId: conversationId };

    // Nothing from before this person joined. For almost everybody joinedAt is
    // the day the conversation started and this changes nothing; it matters for
    // the one who deleted the conversation and later opened it again, who would
    // otherwise be handed back every message they had removed.
    const floor = participant.joinedAt ? new Date(participant.joinedAt) : null;

    if (options.before && floor) {
      where.createdAt = { [Op.lt]: new Date(options.before), [Op.gte]: floor };
    } else if (options.before) {
      where.createdAt = { [Op.lt]: new Date(options.before) };
    } else if (floor) {
      where.createdAt = { [Op.gte]: floor };
    }

    const messages = await models.Message.findAll({
      where,
      include: [
        {
          model: models.User,
          as: 'sender',
          attributes: ['id', 'firstName', 'lastName', 'email', 'profilePictureUrl', 'role']
        },
        {
          model: models.MessageAttachment,
          as: 'attachments'
        },
        {
          model: models.MessageReaction,
          as: 'reactions',
          attributes: ['id', 'userId', 'emoji']
        }
      ],
      order: [['createdAt', 'DESC']],
      limit
    });

    return messages.reverse();
  }

  /**
   * The buzz on the recipient's phone.
   *
   * Messages have always written their own Notification row inside the send
   * transaction, which lit the bell and the socket, and nothing ever sent a
   * push. So the one notification people actually tap, somebody answering them,
   * was the only one a phone never rang for.
   *
   * After the commit, never awaited and never thrown from: a message is sent
   * whether or not a phone was reachable. The title is who it is from and the
   * body is what they said, which is what a person needs to decide whether to
   * open it from the lock screen.
   */
  pushNewMessage(result) {
    try {
      const sender = result?.message?.sender;
      const name = [sender?.firstName, sender?.lastName].filter(Boolean).join(' ').trim();
      const text = String(result?.message?.messageText || '').trim();
      if (!result?.recipientIds?.length) return;

      const notificationOrchestrator = require('./notificationOrchestrator');
      const { NOTIFICATION_EVENTS } = require('../config/notificationMatrix');

      notificationOrchestrator
        .pushOnly({
          eventKey: NOTIFICATION_EVENTS.CHAT_MESSAGE_NEW,
          recipients: result.recipientIds.map((userId) => ({ userId })),
          payload: {
            title: name || 'Pathment',
            // Trimmed to roughly what a lock screen shows anyway. A whole essay
            // in a push payload is bytes nobody reads.
            message: text.length > 160 ? `${text.slice(0, 160)}…` : text,
            // The same path the bell row carries, so a tap from the phone and a
            // tap from the list land on the same conversation.
            actionUrl: result.notifications?.[0]?.actionUrl || null,
            relatedEntityType: 'message',
            relatedEntityId: result.message?.id || null,
            // Lets the app recognise the thread, so a push for the conversation
            // somebody is already reading does not interrupt them with it.
            data: { conversationId: result.conversationId || null }
          }
        })
        .catch((error) => logger.error('[Push] new message failed', { error: error.message }));
    } catch (error) {
      logger.error('[Push] new message failed', { error: error.message });
    }
  }

  /**
   * An image, video, voice note or document in a group discussion. Whether they
   * may post is checked before the upload, so a frozen chat cannot store a
   * file first.
   *
   * Documents (PDF, Word, Excel, PowerPoint, plain text, CSV) are uploaded as
   * Cloudinary `raw` with their own name and extension. `auto` would put a PDF
   * through the image pipeline, which needs signing and answers 401 (the task
   * submission upload has the same rule), and without the extension the file
   * is served as a generic download rather than opened.
   */
  async sendGroupAttachment(senderId, { conversationId, messageText }, file) {
    if (!file) throw new ValidationError('Choose a file to send');
    const mime = String(file.mimetype || '');
    const ext = path.extname(file.originalname || '').toLowerCase();
    const isMedia = /^(image|video|audio)\//.test(mime);
    const isDocument = GROUP_DOCUMENT_MIME_TYPES.has(mime) || GROUP_DOCUMENT_EXTENSIONS.has(ext);
    if (!isMedia && !isDocument) {
      throw new ValidationError('Send an image, video, voice note, or a PDF, Word, Excel, PowerPoint or text file');
    }
    // Cloudinary takes raw files (documents) up to 10MB, unlike media; said up
    // front rather than as a failed upload. The task submission limit is the same.
    if (!isMedia && file.size > GROUP_DOCUMENT_MAX_BYTES) {
      throw new ValidationError(`"${file.originalname}" is over 10MB. Documents can be up to 10MB; images and videos up to 25MB.`);
    }
    const conversation = await models.Conversation.findByPk(conversationId, { attributes: ['id', 'type'] });
    if (!conversation) throw new NotFoundError('Conversation not found');
    if (conversation.type !== 'group') throw new ValidationError('Files can only be sent in a group discussion');
    await require('./groupDiscussionService').assertCanPost(conversationId, senderId);

    let uploaded;
    try {
      uploaded = isMedia
        ? await uploadToCloudinary(file.buffer, 'pathment/discussions', 'auto')
        : await uploadToCloudinary(file.buffer, 'pathment/discussions', 'raw', {
          // Only the extension's dot survives, so the stored id reads back cleanly.
          filename_override: `${path.basename(String(file.originalname || 'document'), ext).replace(/[^\w\- ]+/g, '_').slice(0, 100) || 'document'}${ext}`,
        });
    } catch (error) {
      // Cloudinary rejects with a plain object, which would surface as a bare
      // 500. Say what failed and why, as the task submission upload does.
      logger.error('[messaging] group attachment upload failed', { message: error?.message, http: error?.http_code });
      const detail = error?.message ? ` (${error.message})` : '';
      throw new ValidationError(`Could not upload "${file.originalname || 'the file'}"${detail}. Check its type and size, then try again.`);
    }
    return this.sendMessage(
      senderId,
      { conversationId, messageText: String(messageText || '').trim().slice(0, 5000) },
      {
        attachment: {
          fileName: String(file.originalname || 'file').slice(0, 255),
          fileUrl: uploaded.secure_url,
          fileType: String(file.mimetype).slice(0, 50),
          fileSizeBytes: file.size,
        },
      },
    );
  }

  async sendMessage(senderId, payload, { attachment = null } = {}) {
    const result = await sequelize.transaction(async (transaction) => {
      const { conversationId, messageText, subject, parentMessageId, relatedTaskId, relatedEnrollmentId } = payload;

      // Lock only the conversation row (no joins - FOR UPDATE cannot be applied to nullable side of outer join in PG)
      const conversation = await models.Conversation.findByPk(conversationId, {
        transaction,
        lock: transaction.LOCK.UPDATE
      });

      if (!conversation) {
        throw new NotFoundError('Conversation not found');
      }

      // Fetch all participants (even those who have left) to restore them.
      // isArchived is selected because a new message un-archives the thread for
      // everybody but the sender; without it here that check reads undefined on
      // every row and quietly does nothing.
      const participantRows = await models.ConversationParticipant.findAll({
        where: { conversationId },
        attributes: ['id', 'userId', 'leftAt', 'isArchived'],
        transaction
      });

      const participantIds = participantRows.map((p) => p.userId);
      if (!participantIds.includes(senderId)) {
        throw new ForbiddenError('You are not a participant in this conversation');
      }

      // The discussion decides who may speak, and when. Everything below this
      // for a direct thread (restoring somebody who left, the allow-list) is
      // about two people; a group's membership is the mentor's to set.
      const isGroup = conversation.type === 'group';
      const discussionGroup = isGroup
        ? await require('./groupDiscussionService').assertCanPost(conversationId, senderId, transaction)
        : null;

      // If direct conversation, restore any participant who left. They have to
      // come back or the message would be sent into a conversation they are not
      // in and they would never see it. What they must not get back is the
      // history they deleted, so they return on a fresh joinedAt, which is the
      // floor every read of a conversation is filtered by. Without this, one
      // reply undid somebody's delete and handed them the whole thread again.
      if (conversation.type === 'direct') {
        const leftParticipants = participantRows.filter((p) => p.leftAt !== null);
        if (leftParticipants.length > 0) {
          const now = new Date();
          await models.ConversationParticipant.update({
            leftAt: null,
            isArchived: false,
            joinedAt: now,
            lastReadAt: now,
            lastReadMessageId: null
          }, {
            where: { id: leftParticipants.map((p) => p.id) },
            transaction
          });
        }
      }

      // A new message brings an archived conversation back to the inbox, for
      // everybody except whoever just sent it. Archiving is "I am done with
      // this for now", not "never show me this person again", and the app has
      // always told people it works this way. Only the flag is touched: the
      // history is theirs and they never asked to lose it, which is what makes
      // this different from the restore above.
      const archivedParticipants = participantRows.filter(
        (p) => p.leftAt === null && p.isArchived && p.userId !== senderId
      );
      if (archivedParticipants.length > 0) {
        await models.ConversationParticipant.update(
          { isArchived: false },
          { where: { id: archivedParticipants.map((p) => p.id) }, transaction }
        );
      }

      // Fetch active participants after restoration
      const activeParticipantRows = await models.ConversationParticipant.findAll({
        where: { conversationId, leftAt: null },
        attributes: ['userId'],
        transaction
      });

      const activeParticipantIds = activeParticipantRows.map((p) => p.userId);
      const recipientIds = activeParticipantIds.filter((id) => id !== senderId);
      if (recipientIds.length === 0) {
        throw new ValidationError('Conversation has no recipient');
      }

      // Defense in depth: a mentee can't message into a conversation with someone
      // outside their allowed set (e.g. after a clan/match was removed).
      if (!isGroup) {
        const allowed = await this.getAllowedRecipientIds(senderId);
        if (allowed !== null && recipientIds.some((id) => !allowed.includes(id))) {
          throw new ForbiddenError('You can only message your mentor or members of your clan');
        }
      }

      const recipientId = recipientIds[0];
      const recipientUsers = await models.User.findAll({
        where: {
          id: {
            [Op.in]: recipientIds
          }
        },
        attributes: ['id', 'role'],
        transaction
      });

      const recipientRoleById = recipientUsers.reduce((acc, user) => {
        acc[user.id] = user.role;
        return acc;
      }, {});

      // If the recipient already has a live socket, the message is delivered the
      // moment it's created (drives the double-gray tick). Otherwise it's marked
      // delivered when they next connect (see socket connect handler).
      let deliveredAt = null;
      try {
        const { isUserOnline } = require('../socket');
        if (recipientIds.some((id) => isUserOnline(id))) deliveredAt = new Date();
      } catch { /* socket not ready */ }

      const message = await models.Message.create({
        senderId,
        recipientId,
        threadId: conversationId,
        parentMessageId: parentMessageId || null,
        subject: subject || null,
        messageText,
        deliveredAt,
        // recipientId/isRead describe one reader, which a group does not have.
        // Its read position is each member's lastReadAt; leaving this false
        // would only inflate the first member's unread count.
        isRead: isGroup,
        relatedTaskId: relatedTaskId || conversation.relatedTaskId || null,
        relatedEnrollmentId: relatedEnrollmentId || conversation.relatedEnrollmentId || null
      }, { transaction });

      if (attachment) {
        await models.MessageAttachment.create({ ...attachment, messageId: message.id }, { transaction });
      }

      await conversation.update({
        lastMessageId: message.id,
        lastMessageAt: message.createdAt
      }, { transaction });

      const preview = messageText || 'Sent a file';
      const notifications = await Promise.all(recipientIds.map(async (userId) => {
        const role = recipientRoleById[userId] || 'mentee';
        return models.Notification.create({
          userId,
          type: 'message',
          title: isGroup ? `New message in ${discussionGroup.name}` : 'New message',
          message: preview.length > 140 ? `${preview.slice(0, 140)}...` : preview,
          // conversationId stays in the URL: markConversationRead finds these by it.
          // Mentors and mentees both read group chats in Messages.
          actionUrl: isGroup
            ? `/${role === 'mentee' ? 'mentee' : 'mentor'}/messages?discussion=${discussionGroup.id}&conversationId=${conversationId}`
            : `/${role}/messages?conversationId=${conversationId}`,
          actionLabel: 'Open Chat',
          relatedEntityType: 'message',
          relatedEntityId: message.id,
          status: 'unread'
        }, { transaction });
      }));

      const createdNotifications = notifications;

      const hydratedMessage = await models.Message.findByPk(message.id, {
        include: [
          {
            model: models.User,
            as: 'sender',
            attributes: ['id', 'firstName', 'lastName', 'email', 'profilePictureUrl', 'role']
          },
          {
            model: models.MessageAttachment,
            as: 'attachments'
          }
        ],
        transaction
      });

      // [RAG Core] Fire Orchestrator asynchronously if sender is a mentee
      // (Mentors don't auto-reply to themselves)
      if (!isGroup && recipientRoleById[recipientIds[0]] === 'mentor') {
        const { RagFacade } = require('../features/rag');
        // Fire and forget (do not await)
        RagFacade.handleNewMessage(hydratedMessage).catch(err => {
          logger.error('[RAG] Background orchestrator failed', { error: err.message, stack: err.stack });
        });
      }

      return {
        message: hydratedMessage,
        conversationId,
        recipientIds,
        notifications: createdNotifications
      };
    });

    // After the commit, so a phone is never told about a message that rolled
    // back, and outside it, so a slow push cannot hold a database transaction
    // open.
    this.pushNewMessage(result);

    return result;
  }

  async markConversationRead(userId, conversationId) {
    await this.assertUserInConversation(userId, conversationId);

    const result = await sequelize.transaction(async (transaction) => {
      const [updatedCount] = await models.Message.update({
        isRead: true,
        readAt: new Date()
      }, {
        where: {
          threadId: conversationId,
          recipientId: userId,
          isRead: false
        },
        transaction
      });

      const lastMessage = await models.Message.findOne({
        where: { threadId: conversationId },
        order: [['createdAt', 'DESC']],
        transaction
      });

      await models.ConversationParticipant.update({
        lastReadAt: new Date(),
        lastReadMessageId: lastMessage?.id || null
      }, {
        where: {
          conversationId,
          userId
        },
        transaction
      });

      await models.Notification.update({
        status: 'read',
        readAt: new Date()
      }, {
        where: {
          userId,
          type: 'message',
          status: 'unread',
          actionUrl: {
            [Op.like]: `%conversationId=${conversationId}%`
          }
        },
        transaction
      });

      return { updatedCount };
    });

    // Opening a group's chat is taking part in it, wherever it was opened from,
    // so the mentee's Group Discussion task starts. Never fails the read.
    await require('./groupDiscussionService').startTasksOnOpen(conversationId, userId)
      .catch((error) => logger.warn('[messaging] could not start a discussion task', { conversationId, error: error.message }));

    return result;
  }

  /**
   * Mark every message addressed to this user (across all conversations) as
   * delivered - called when the user connects. Returns the affected messages
   * grouped by sender so the socket layer can flip the senders' ticks live.
   */
  async markDelivered(userId) {
    const pending = await models.Message.findAll({
      where: { recipientId: userId, deliveredAt: null },
      attributes: ['id', 'senderId', 'threadId']
    });
    if (!pending.length) return [];
    const now = new Date();
    await models.Message.update({ deliveredAt: now }, { where: { id: pending.map((m) => m.id) } });
    return pending.map((m) => ({ id: m.id, senderId: m.senderId, conversationId: m.threadId, deliveredAt: now }));
  }

  /**
   * Toggle a user's emoji reaction on a message (one per user - re-acting with a
   * different emoji replaces it; re-acting with the same one removes it). Returns
   * the message's full reaction set + the conversation id for the socket emit.
   */
  async toggleReaction(userId, messageId, emoji) {
    const message = await models.Message.findByPk(messageId, { attributes: ['id', 'threadId'] });
    if (!message) throw new NotFoundError('Message not found');
    await this.assertUserInConversation(userId, message.threadId);

    const clean = String(emoji || '').trim().slice(0, 16);
    if (!clean) throw new ValidationError('An emoji is required');

    const existing = await models.MessageReaction.findOne({ where: { messageId, userId } });
    if (existing) {
      if (existing.emoji === clean) {
        await existing.destroy(); // same emoji → toggle off
      } else {
        await existing.update({ emoji: clean }); // different → replace
      }
    } else {
      await models.MessageReaction.create({ messageId, userId, emoji: clean });
    }

    const reactions = await models.MessageReaction.findAll({
      where: { messageId },
      attributes: ['id', 'userId', 'emoji']
    });
    return { conversationId: message.threadId, messageId, reactions };
  }

  async listNotifications(userId, options = {}) {
    const limit = Math.min(Math.max(Number(options.limit || 30), 1), 100);
    return models.Notification.findAll({
      attributes: [
        'id',
        'userId',
        'type',
        'audience',
        'title',
        'message',
        'status',
        'actionUrl',
        'actionLabel',
        'relatedEntityType',
        'relatedEntityId',
        'clanId',
        'readAt',
        'sentAt',
        'emailSent',
        'emailSentAt',
        'createdAt'
      ],
      where: {
        userId,
        status: {
          [Op.ne]: 'archived'
        }
      },
      order: [['createdAt', 'DESC']],
      limit
    });
  }

  async getUnreadNotificationCount(userId) {
    return models.Notification.count({
      where: {
        userId,
        status: 'unread'
      }
    });
  }

  async markNotificationRead(userId, notificationId) {
    const notification = await models.Notification.findOne({
      attributes: [
        'id',
        'userId',
        'type',
        'audience',
        'title',
        'message',
        'status',
        'actionUrl',
        'actionLabel',
        'relatedEntityType',
        'relatedEntityId',
        'readAt',
        'sentAt',
        'emailSent',
        'emailSentAt',
        'createdAt',
        'organizationId'
      ],
      where: {
        id: notificationId,
        userId
      }
    });

    if (!notification) {
      throw new NotFoundError('Notification not found');
    }

    if (notification.status !== 'read') {
      await notification.update({
        status: 'read',
        readAt: new Date()
      });
    }

    return notification;
  }

  async markAllNotificationsRead(userId) {
    const [updatedCount] = await models.Notification.update({
      status: 'read',
      readAt: new Date()
    }, {
      where: {
        userId,
        status: 'unread'
      }
    });

    return { updatedCount };
  }

  async deleteNotification(userId, notificationId) {
    const deleted = await models.Notification.destroy({
      where: {
        id: notificationId,
        userId
      }
    });

    if (!deleted) {
      throw new NotFoundError('Notification not found');
    }

    return { deleted: true };
  }

  async getConversationByIdForUser(conversationId, userId) {
    await this.assertUserInConversation(userId, conversationId);

    const conversation = await models.Conversation.findByPk(conversationId, {
      include: [
        {
          model: models.ConversationParticipant,
          as: 'participants',
          where: { leftAt: null },
          required: false,
          include: [
            {
              model: models.User,
              as: 'user',
              attributes: ['id', 'firstName', 'lastName', 'email', 'profilePictureUrl', 'role']
            }
          ]
        },
        {
          model: models.Message,
          as: 'lastMessage',
          attributes: ['id', 'senderId', 'recipientId', 'messageText', 'createdAt', 'isRead']
        }
      ]
    });

    if (!conversation) return null;
    const json = conversation.toJSON();
    const otherParticipants = (json.participants || []).filter((p) => p.userId !== userId);

    return {
      id: json.id,
      type: json.type,
      relatedTaskId: json.relatedTaskId,
      relatedEnrollmentId: json.relatedEnrollmentId,
      lastMessageAt: json.lastMessageAt,
      unreadCount: 0,
      participants: otherParticipants.map((p) => ({
        id: p.user?.id || p.userId,
        firstName: p.user?.firstName || '',
        lastName: p.user?.lastName || '',
        email: p.user?.email || '',
        profilePictureUrl: p.user?.profilePictureUrl,
        role: p.user?.role || 'mentee'
      })),
      lastMessage: json.lastMessage
    };
  }

  async getClanMemberUserIds(userId) {
    const myClans = await models.ClanMembership.findAll({
      where: { userId, status: { [Op.in]: VISIBLE_MEMBERSHIP_STATUSES } },
      attributes: ['clanId']
    });
    const clanIds = myClans.map((c) => c.clanId);
    if (!clanIds.length) return [];
    const members = await models.ClanMembership.findAll({
      where: { clanId: { [Op.in]: clanIds }, status: { [Op.in]: VISIBLE_MEMBERSHIP_STATUSES } },
      attributes: ['userId']
    });
    const set = new Set(members.map((m) => m.userId));
    set.delete(userId);
    return [...set];
  }

  async searchUsers(currentUserId, query = '', options = {}) {
    const roleFilter = options.role;
    const requestedLimit = options.limit ? Number(options.limit) : null;
    const isSearchMode = Boolean(query && query.trim());

    // Explicit role-scoped, tenant-scoped directory. `null` is only possible
    // for an old admin caller outside a workspace request.
    const allowed = await this.getAllowedRecipientIds(currentUserId);
    const clanMemberIds = await this.getClanMemberUserIds(currentUserId);

    const baseWhere = {
      id: { [Op.ne]: currentUserId },
      status: 'active',
      deletedAt: null
    };

    if (roleFilter && ['admin', 'mentor', 'mentee'].includes(roleFilter)) {
      baseWhere.role = roleFilter;
    }

    // Mentee scope check
    if (allowed !== null) {
      if (!allowed.length) return [];
      baseWhere.id = { [Op.ne]: currentUserId, [Op.in]: allowed };
    }

    const userAttributes = ['id', 'firstName', 'lastName', 'email', 'role', 'profilePictureUrl'];

    // CASE 1: Initial load (query is empty)
    if (!isSearchMode) {
      if (allowed !== null) {
        // Mentee: fetch ALL allowed recipients (clan members + mentors) without artificial limit truncation
        const users = await models.User.findAll({
          attributes: userAttributes,
          where: baseWhere,
          order: [['firstName', 'ASC'], ['lastName', 'ASC']]
        });
        return users.map((u) => u.toJSON());
      } else {
        // Mentor / Admin: Always include ALL clan members first, plus general users up to limit
        const limit = requestedLimit ? Math.min(Math.max(requestedLimit, 1), 200) : 100;
        
        // 1. Fetch all clan members for this mentor/admin
        let clanUsers = [];
        if (clanMemberIds.length) {
          const clanWhere = { ...baseWhere, id: { [Op.in]: clanMemberIds } };
          const foundClanUsers = await models.User.findAll({
            attributes: userAttributes,
            where: clanWhere,
            order: [['firstName', 'ASC'], ['lastName', 'ASC']]
          });
          clanUsers = foundClanUsers.map((u) => u.toJSON());
        }

        // 2. Fetch non-clan users up to limit
        const fetchedClanIds = new Set(clanUsers.map((u) => u.id));
        const remainingLimit = Math.max(0, limit - clanUsers.length);

        let otherUsers = [];
        if (remainingLimit > 0) {
          const otherWhere = { ...baseWhere };
          if (fetchedClanIds.size > 0) {
            otherWhere.id = { [Op.ne]: currentUserId, [Op.notIn]: [...fetchedClanIds] };
          }
          const foundOther = await models.User.findAll({
            attributes: userAttributes,
            where: otherWhere,
            order: [['firstName', 'ASC'], ['lastName', 'ASC']],
            limit: remainingLimit
          });
          otherUsers = foundOther.map((u) => u.toJSON());
        }

        return [...clanUsers, ...otherUsers];
      }
    }

    // CASE 2: Active Search Mode (query is provided)
    const limit = requestedLimit ? Math.min(Math.max(requestedLimit, 1), 200) : 100;
    const term = `%${query.trim()}%`;
    const searchWhere = {
      ...baseWhere,
      [Op.or]: [
        { firstName: { [Op.iLike]: term } },
        { lastName: { [Op.iLike]: term } },
        { email: { [Op.iLike]: term } }
      ]
    };

    const users = await models.User.findAll({
      attributes: userAttributes,
      where: searchWhere,
      order: [['firstName', 'ASC'], ['lastName', 'ASC']],
      limit
    });

    const userList = users.map((u) => u.toJSON());

    // Prioritize clan members in search results
    if (clanMemberIds.length > 0) {
      const clanSet = new Set(clanMemberIds);
      userList.sort((a, b) => {
        const aIsClan = clanSet.has(a.id) ? 0 : 1;
        const bIsClan = clanSet.has(b.id) ? 0 : 1;
        if (aIsClan !== bIsClan) return aIsClan - bIsClan;
        return (a.firstName || '').localeCompare(b.firstName || '');
      });
    }

    return userList;
  }

  async assertUserInConversation(userId, conversationId) {
    const participant = await models.ConversationParticipant.findOne({
      where: {
        userId,
        conversationId,
        leftAt: null
      }
    });

    if (!participant) {
      throw new ForbiddenError('You are not a participant in this conversation');
    }

    return participant;
  }
}

module.exports = new MessagingService();
