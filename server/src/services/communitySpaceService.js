const { Op } = require('sequelize');
const { models } = require('../db');
const { isProgrammeClan } = require('../config/clanKinds');

const fullName = (u) => (u ? `${u.firstName} ${u.lastName}`.trim() : null);

const isAdmin = (user) => {
  const caps = Array.isArray(user?.capabilities) && user.capabilities.length ? user.capabilities : [user?.role];
  return caps.includes('admin');
};

const MENTOR_CLAN_ROLES = ['lead_mentor', 'co_mentor', 'core_team'];

/**
 * Is this space closed to new posts?
 *
 * It used to be: yes, as soon as the clan froze or the cohort completed. That
 * tied the conversation to the work lifecycle, and the two are not the same
 * thing. Freezing a clan protects the RECORD OF WORK — tasks, submissions,
 * attendance — so a finished programme cannot be edited after the fact. A
 * cohort finishing is not a reason for the people in it to stop talking to
 * each other; it is usually when they have the most to say.
 *
 * So nothing closes a space today. This stays as one named place to change if
 * an explicit, admin-controlled archive is ever wanted — which is a different
 * feature from "the programme ended", and would be a deliberate act rather
 * than a side effect of one.
 */
function isSpaceArchived() {
  return false;
}

/**
 * Community spaces are not a table - they are *derived* from the relationships
 * a user already has (ClanMembership, Enrollment). A space is one of:
 *   - clan     → a single clan's working space (members = active ClanMembership)
 *   - cohort   → an intake batch's space (mentees of the cohort + mentors of the
 *                program's clans)
 *   - program  → the whole fellowship (everyone with a clan or enrollment in it)
 *   - global   → the all-hands lounge (every authenticated user)
 *
 * This service answers three questions used everywhere else: which spaces can a
 * user see (listSpaces), may a user touch a given space (canAccess + role), and
 * who are a space's members (getMemberIds / getPeople).
 */
class CommunitySpaceService {
  /**
   * Active clan memberships for a user, with clan + program eager-loaded — ONE
   * per clan. A user can hold two roles in a clan (mentee + co-mentor), and a
   * clan's community space must still appear exactly once in their sidebar.
   */
  async _myClanMemberships(userId) {
    const rows = await models.ClanMembership.findAll({
      where: { userId, status: { [Op.in]: ['active', 'paused'] } },
      include: [{
        model: models.Clan,
        as: 'clan',
        attributes: ['id', 'name', 'programId', 'kind', 'frozenAt'],
        include: [{ model: models.Program, as: 'program', attributes: ['id', 'name'] }]
      }]
    });
    const byClan = new Map();
    for (const m of rows) if (!byClan.has(m.clanId)) byClan.set(m.clanId, m);
    return [...byClan.values()];
  }

  /** Active enrollments for a user (mentee side), with program + cohort. */
  async _myEnrollments(userId) {
    return models.Enrollment.findAll({
      where: { menteeId: userId, status: { [Op.notIn]: ['rejected', 'dropped'] } },
      include: [
        { model: models.Program, as: 'program', attributes: ['id', 'name'] },
        { model: models.Cohort, as: 'cohort', attributes: ['id', 'name', 'programId', 'status'] }
      ]
    });
  }

  /** The full set of spaces a user can browse, clan-first. */
  async listSpaces(user, { portalRole = null } = {}) {
    const userId = user.id;
    /**
     * Resolved, not read off the account.
     *
     * The local `isAdmin` helper reads `user.capabilities`, which the rest of
     * the codebase is explicit about being legacy and not authoritative. A
     * program_admin has no stored capability, so every admin branch in this
     * file skipped them: they got their own memberships and nothing they
     * administer. `actsAsAdmin` derives it from real grants.
     */
    const administers = await require('./authzService').actsAsAdmin(user);
    const [memberships, enrollments] = await Promise.all([
      this._myClanMemberships(userId),
      this._myEnrollments(userId)
    ]);

    const spaces = [];
    const seen = new Set();
    const add = (s) => { if (!seen.has(s.key)) { seen.add(s.key); spaces.push(s); } };

    const mentorProgramIds = new Set();
    const programNames = new Map();

    // Clan spaces (the squad - most active).
    for (const m of memberships) {
      if (!m.clan) continue;
      const moderator = isAdmin(user) || MENTOR_CLAN_ROLES.includes(m.role);
      add({
        key: `clan:${m.clan.id}`,
        type: 'clan',
        id: m.clan.id,
        name: m.clan.name,
        subtitle: m.clan.program?.name || 'Clan',
        role: m.role,
        isModerator: moderator,
        readOnly: isSpaceArchived(),
        /** The work is closed even though the conversation is not — the UI says so. */
        workClosed: isProgrammeClan(m.clan) && Boolean(m.clan.frozenAt),
      });
      // A clan outside the programme's accounting does not put its programme
      // on somebody's community sidebar — a trial round is not a programme.
      if (m.clan.programId && isProgrammeClan(m.clan)) {
        programNames.set(m.clan.programId, m.clan.program?.name || 'Program');
        if (MENTOR_CLAN_ROLES.includes(m.role)) mentorProgramIds.add(m.clan.programId);
      }
    }

    // Cohort + program spaces from enrollments (mentee side).
    for (const e of enrollments) {
      if (e.cohort) {
        add({
          key: `cohort:${e.cohort.id}`,
          type: 'cohort',
          id: e.cohort.id,
          name: e.cohort.name,
          subtitle: e.program?.name ? `${e.program.name} · batch` : 'Cohort',
          role: 'member',
          isModerator: isAdmin(user),
          readOnly: isSpaceArchived(),
          workClosed: e.cohort.status === 'completed',
        });
      }
      if (e.program) {
        programNames.set(e.program.id, e.program.name);
        add({
          key: `program:${e.program.id}`,
          type: 'program',
          id: e.program.id,
          name: e.program.name,
          subtitle: 'Program',
          role: 'member',
          isModerator: isAdmin(user)
        });
      }
    }

    // Program spaces a mentor belongs to (via their clans) + the program's cohorts.
    if (mentorProgramIds.size) {
      const programIds = [...mentorProgramIds];
      for (const pid of programIds) {
        add({
          key: `program:${pid}`,
          type: 'program',
          id: pid,
          name: programNames.get(pid) || 'Program',
          subtitle: 'Program',
          role: 'mentor',
          isModerator: true
        });
      }
      const cohorts = await models.Cohort.findAll({
        where: { programId: { [Op.in]: programIds } },
        attributes: ['id', 'name', 'programId', 'status']
      });
      for (const c of cohorts) {
        add({
          key: `cohort:${c.id}`,
          type: 'cohort',
          id: c.id,
          name: c.name,
          subtitle: `${programNames.get(c.programId) || 'Program'} · batch`,
          role: 'mentor',
          isModerator: true,
          readOnly: isSpaceArchived(),
          workClosed: c.status === 'completed',
        });
      }
    }

    /**
     * Every space an admin administers, not only the ones they joined.
     *
     * An admin's spaces came from their own memberships and enrolments, same
     * as anybody's — so somebody who runs the workspace but is not in a clan
     * saw the Lounge and nothing else, and the one person responsible for
     * moderating these conversations had no way to read them. They could
     * already OPEN any space by id (see getSpaceContext below); they just
     * could not find one.
     *
     * Bounded by their programme scope, so a programme-scoped admin gets
     * their programmes' clans and not the workspace's. `add` is idempotent on
     * the key, so a space they are genuinely a member of keeps the richer
     * entry built above rather than being replaced by this one.
     */
    if (administers) {
      const scope = await require('./authzService').adminProgramScope(user);
      const where = Array.isArray(scope) ? { programId: { [Op.in]: scope } } : {};
      const [adminClans, adminPrograms] = await Promise.all([
        models.Clan.findAll({
          where, attributes: ['id', 'name', 'programId', 'kind', 'frozenAt'],
          include: [{ model: models.Program, as: 'program', attributes: ['id', 'name'], required: false }],
        }),
        models.Program.findAll({
          where: Array.isArray(scope) ? { id: { [Op.in]: scope } } : {},
          attributes: ['id', 'name'],
        }),
      ]);
      for (const c of adminClans) {
        add({
          key: `clan:${c.id}`,
          type: 'clan',
          id: c.id,
          name: c.name,
          subtitle: c.program?.name || 'Clan',
          role: 'admin',
          isModerator: true,
          readOnly: isSpaceArchived(),
          workClosed: isProgrammeClan(c) && Boolean(c.frozenAt),
        });
      }
      for (const prog of adminPrograms) {
        add({
          key: `program:${prog.id}`, type: 'program', id: prog.id,
          name: prog.name, subtitle: 'Program', role: 'admin', isModerator: true,
        });
      }
    }

    // Global lounge - everyone.
    add({
      key: 'global',
      type: 'global',
      id: null,
      name: 'Lounge',
      subtitle: 'Everyone on Pathment',
      role: isAdmin(user) ? 'admin' : 'member',
      isModerator: isAdmin(user)
    });

    /**
     * In the ADMIN portal, show what they administer — not what they are in.
     *
     * The same person can administer one programme and mentor a clan in
     * another; both are true, and which one applies is the hat they are
     * wearing. Under Admin, a programme-scoped admin was shown their own
     * clans from a programme they have no admin rights over, which reads as
     * the admin surface leaking another programme.
     *
     * Only ever narrows, and only in that portal: switch to Mentor and their
     * own clans are all there, which is the view those memberships are for.
     * The Lounge stays — it is everybody's and belongs to no programme.
     */
    if (portalRole === 'admin' && administers) {
      const scope = await require('./authzService').adminProgramScope(user);
      if (Array.isArray(scope)) {
        const allowedClans = scope.length
          ? await models.Clan.findAll({ where: { programId: { [Op.in]: scope } }, attributes: ['id'], raw: true })
          : [];
        const clanIds = new Set(allowedClans.map((c) => c.id));
        return spaces.filter((space) => (
          space.type === 'global'
          || (space.type === 'program' && scope.includes(space.id))
          || (space.type === 'clan' && clanIds.has(space.id))
        ));
      }
    }

    return spaces;
  }

  /** Per-space context for the requesting user, or null if no access. */
  async getSpaceContext(user, scopeType, scopeId) {
    if (scopeType === 'global') {
      return { type: 'global', id: null, name: 'Lounge', isModerator: isAdmin(user) };
    }
    const spaces = await this.listSpaces(user);
    const match = spaces.find((s) => s.type === scopeType && String(s.id) === String(scopeId));
    if (match) return match;
    // Admins can open any space for moderation even without membership.
    if (isAdmin(user)) {
      const space = scopeType === 'clan' ? await models.Clan.findByPk(scopeId) : scopeType === 'cohort' ? await models.Cohort.findByPk(scopeId) : await models.Program.findByPk(scopeId);
      if (!space) return null;
      return {
        type: scopeType,
        id: scopeId,
        name: space.name,
        isModerator: true,
        role: 'admin',
        readOnly: isSpaceArchived(),
        workClosed:
          (scopeType === 'clan' && isProgrammeClan(space) && Boolean(space.frozenAt)) ||
          (scopeType === 'cohort' && space.status === 'completed'),
      };
    }
    return null;
  }

  async canAccess(user, scopeType, scopeId) {
    return Boolean(await this.getSpaceContext(user, scopeType, scopeId));
  }

  /** Active member user-ids of a space (for notifications + people lists). */
  async getMemberIds(scopeType, scopeId) {
    if (scopeType === 'clan') {
      const rows = await models.ClanMembership.findAll({
        where: { clanId: scopeId, status: 'active' }, attributes: ['userId']
      });
      return [...new Set(rows.map((r) => r.userId))];
    }

    if (scopeType === 'program') {
      const ids = new Set();
      const clans = await models.Clan.findAll({ where: { programId: scopeId, kind: 'cohort' }, attributes: ['id'] });
      const clanIds = clans.map((c) => c.id);
      if (clanIds.length) {
        const cm = await models.ClanMembership.findAll({
          where: { clanId: { [Op.in]: clanIds }, status: 'active' }, attributes: ['userId']
        });
        cm.forEach((r) => ids.add(r.userId));
      }
      const enr = await models.Enrollment.findAll({
        where: { programId: scopeId, status: { [Op.notIn]: ['rejected', 'dropped'] } }, attributes: ['menteeId']
      });
      enr.forEach((r) => ids.add(r.menteeId));
      return [...ids];
    }

    if (scopeType === 'cohort') {
      const ids = new Set();
      const enr = await models.Enrollment.findAll({
        where: { cohortId: scopeId, status: { [Op.notIn]: ['rejected', 'dropped'] } }, attributes: ['menteeId']
      });
      enr.forEach((r) => ids.add(r.menteeId));
      // Mentors of the cohort's program.
      const cohort = await models.Cohort.findByPk(scopeId, { attributes: ['programId'] });
      if (cohort) {
        const clans = await models.Clan.findAll({ where: { programId: cohort.programId, kind: 'cohort' }, attributes: ['id'] });
        const clanIds = clans.map((c) => c.id);
        if (clanIds.length) {
          const mentors = await models.ClanMembership.findAll({
            where: { clanId: { [Op.in]: clanIds }, status: 'active', role: { [Op.in]: MENTOR_CLAN_ROLES } },
            attributes: ['userId']
          });
          mentors.forEach((r) => ids.add(r.userId));
        }
      }
      return [...ids];
    }

    // global: not enumerated (too broad) - callers notify only @mentioned users.
    return [];
  }

  /** People the user can @mention or send kudos to within a space. */
  async getPeople(user, scopeType, scopeId) {
    let memberIds;
    if (scopeType === 'global') {
      // Fall back to the user's broader network (everyone in their spaces).
      const ids = new Set();
      const memberships = await this._myClanMemberships(user.id);
      for (const m of memberships) {
        const mates = await this.getMemberIds('clan', m.clanId);
        mates.forEach((id) => ids.add(id));
      }
      memberIds = [...ids];
    } else {
      memberIds = await this.getMemberIds(scopeType, scopeId);
    }
    const others = memberIds.filter((id) => id !== user.id);
    if (!others.length) return [];
    const users = await models.User.findAll({
      where: { id: { [Op.in]: others } }, attributes: ['id', 'firstName', 'lastName']
    });
    return users.map((u) => ({ id: u.id, name: fullName(u) }));
  }
}

module.exports = new CommunitySpaceService();
module.exports.isAdmin = isAdmin;
module.exports.fullName = fullName;
