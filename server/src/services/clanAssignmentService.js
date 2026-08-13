const { Op } = require('sequelize');
const { models, sequelize } = require('../db');
const { NotFoundError, ValidationError } = require('../utils/errors/errorTypes');
const applicationService = require('./applicationService');

/**
 * clanAssignmentService — place accepted intake candidates into clans.
 *
 * Two steps, mirroring the AI-review and pause flows: previewAssignment()
 * PROPOSES a clan per candidate against the admin's conditions (pure, no
 * writes), the admin edits any row, then commitAssignment() accepts each
 * candidate with their chosen clan (issuing the clan-stamped invite that lands
 * them in that clan on registration).
 *
 * Conditions (all admin-controlled):
 *   capacity        per-clan maxMentees, or a uniform override for the run
 *                   ("fill every clan to 40").
 *   matchLevel      candidate's level must be one the clan serves (clans can
 *                   serve several; a clan with no levels serves any).
 *   matchGender     candidate's gender must match the clan lead's gender.
 *   excludeClanIds  clans kept out of the auto-fill entirely.
 *   balanceMode     'even' spreads across clans (most room first); 'fill' tops
 *                   one clan up before moving on.
 *   allowLevelOverflow  when a candidate's level clans are all full, may place
 *                   them in another level's clan (off by default — level is
 *                   respected hard unless you opt in). Gender is always relaxed
 *                   before level.
 */
class ClanAssignmentService {
  _norm(v) { return v == null ? '' : String(v).trim().toLowerCase(); }

  /** Candidate gender / country from their application responses (pre-registration). */
  _candidateGender(app) { return this._norm((app.responses || {}).gender); }
  _candidateCountry(app) { return this._norm((app.responses || {}).country); }

  _defaults(settings = {}) {
    return {
      capacity: settings.capacity != null && settings.capacity !== '' ? Math.max(1, parseInt(settings.capacity, 10) || 0) : null,
      matchLevel: settings.matchLevel !== false,
      matchGender: !!settings.matchGender,
      matchCountry: !!settings.matchCountry,
      excludeClanIds: Array.isArray(settings.excludeClanIds) ? settings.excludeClanIds : [],
      balanceMode: settings.balanceMode === 'fill' ? 'fill' : 'even',
      allowLevelOverflow: !!settings.allowLevelOverflow,
    };
  }

  /**
   * Active clans in the program, with lead gender and current live mentee fill.
   * Returns Map<clanId, { id, name, levels, leadGender, cap, fill }>. `cap` is
   * the per-clan max here; the run applies any override on top.
   */
  async _clanPool(programId, capacityOverride) {
    const clans = await models.Clan.findAll({
      where: { programId, status: 'active' },
      attributes: ['id', 'name', 'levels', 'countries', 'maxMentees', 'leadMentorId'],
      include: [{ model: models.User, as: 'leadMentor', attributes: ['id', 'gender'] }],
    });
    if (!clans.length) return new Map();

    const counts = await models.ClanMembership.findAll({
      where: { clanId: { [Op.in]: clans.map((c) => c.id) }, role: 'mentee', status: 'active' },
      attributes: ['clanId', [sequelize.fn('COUNT', sequelize.col('id')), 'n']],
      group: ['clanId'], raw: true,
    });
    const fillById = new Map(counts.map((r) => [r.clanId, parseInt(r.n, 10) || 0]));

    const pool = new Map();
    for (const c of clans) {
      pool.set(c.id, {
        id: c.id,
        name: c.name,
        levels: Array.isArray(c.levels) ? c.levels : [],
        countries: (Array.isArray(c.countries) ? c.countries : []).map((x) => this._norm(x)),
        leadGender: this._norm(c.leadMentor && c.leadMentor.gender),
        cap: capacityOverride != null ? capacityOverride : (c.maxMentees || 25),
        fill: fillById.get(c.id) || 0,
      });
    }
    return pool;
  }

  /** Clans (from the pool) with room, filtered by the given constraints. */
  _candidates(pool, { level, gender, country, useLevel, useGender, useCountry, excludeSet }) {
    const out = [];
    for (const c of pool.values()) {
      if (excludeSet.has(c.id)) continue;
      if (c.fill >= c.cap) continue;                                   // full
      if (useLevel && level && c.levels.length && !c.levels.includes(level)) continue;
      if (useCountry && country && c.countries.length && !c.countries.includes(country)) continue;
      if (useGender && gender && c.leadGender && c.leadGender !== gender) continue;
      out.push(c);
    }
    return out;
  }

  /**
   * Pick one clan. A clan that SPECIFICALLY serves the candidate's country/level
   * always beats a catch-all clan — "these countries go to this clan" should win
   * over a generic clan. Among equally-specific clans, balance decides: most room
   * first ('even') or least-room-but-nonzero ('fill', to top a clan up).
   */
  _pick(list, balanceMode, ctx = {}) {
    const room = (c) => c.cap - c.fill;
    const withRoom = list.filter((c) => room(c) > 0);
    if (!withRoom.length) return null;
    const spec = (c) =>
      (ctx.country && c.countries.includes(ctx.country) ? 1 : 0) +
      (ctx.level && c.levels.includes(ctx.level) ? 1 : 0);
    return [...withRoom].sort((a, b) =>
      (spec(b) - spec(a)) ||                                             // specific clans first
      (balanceMode === 'fill' ? room(a) - room(b) : room(b) - room(a)) || // then balance
      a.name.localeCompare(b.name)
    )[0] || null;
  }

  /**
   * Resolve ONE candidate to a clan through the relaxation tiers, returning
   * { clan, reason } or { clan: null, reason } when nothing fits.
   */
  _resolve(pool, app, s) {
    const level = app.level || null;
    const gender = this._candidateGender(app);
    const country = this._candidateCountry(app);
    const excludeSet = new Set(s.excludeClanIds);
    const ctx = { level, gender, country };
    const tier = (useLevel, useCountry, useGender) =>
      this._pick(this._candidates(pool, { ...ctx, excludeSet, useLevel, useCountry, useGender }), s.balanceMode, ctx);

    // Relax softest → hardest: gender, then country, then (only if allowed) level.
    let pick = tier(s.matchLevel, s.matchCountry, s.matchGender);
    if (pick) return { clan: pick, reason: this._reason('match', pick, ctx, s) };

    if (s.matchGender) {
      pick = tier(s.matchLevel, s.matchCountry, false);
      if (pick) return { clan: pick, reason: this._reason('gender_relaxed', pick, ctx, s) };
    }
    if (s.matchCountry) {
      pick = tier(s.matchLevel, false, false);
      if (pick) return { clan: pick, reason: this._reason('country_relaxed', pick, ctx, s) };
    }
    if (s.matchLevel && s.allowLevelOverflow) {
      pick = tier(false, false, false);
      if (pick) return { clan: pick, reason: this._reason('level_overflow', pick, ctx, s) };
    }
    return { clan: null, reason: this._noFitReason(pool, s) };
  }

  _fillStr(c) { return `${c.fill + 1}/${c.cap}`; }
  _reason(kind, c, ctx, s) {
    const lvl = ctx.level ? `L:${ctx.level}` : 'any level';
    const parts = [lvl];
    if (s.matchCountry && ctx.country) parts.push(ctx.country);
    if (s.matchGender && ctx.gender) parts.push(`lead ${ctx.gender}`);
    const desc = parts.join(' · ');
    switch (kind) {
      case 'match': return `${desc} ✓ · ${this._fillStr(c)}`;
      case 'gender_relaxed': return `${lvl}${s.matchCountry && ctx.country ? ` · ${ctx.country}` : ''} ✓ · no ${ctx.gender}-lead clan free → different lead · ${this._fillStr(c)}`;
      case 'country_relaxed': return `${lvl} ✓ · no ${ctx.country} clan free → overflow into ${c.name} · ${this._fillStr(c)}`;
      case 'level_overflow': return `all matching clans full → ${c.name} (level relaxed) · ${this._fillStr(c)}`;
      default: return `${c.name} · ${this._fillStr(c)}`;
    }
  }
  _noFitReason(pool, s) {
    if (!pool.size) return 'No active clans in this program — create a clan first';
    const anyRoom = [...pool.values()].some((c) => !s.excludeClanIds.includes(c.id) && c.fill < c.cap);
    if (!anyRoom) return 'Every eligible clan is at capacity — raise capacity or free a clan';
    return s.allowLevelOverflow
      ? 'No clan matches after relaxing gender & level — assign manually'
      : 'No clan for this level with room (level overflow is off) — assign manually';
  }

  /**
   * Shared planner. Takes normalized candidates ({ applicationId, userId,
   * firstName, lastName, email, level, responses, alreadyPlaced }) and proposes
   * a clan for each against the pool. Pure — writes nothing. Stable order so a
   * re-run gives the same plan.
   */
  async _plan(cohort, candidates, s) {
    const levelLabel = new Map((Array.isArray(cohort.levels) ? cohort.levels : []).map((l) => [l.key, l.label]));
    const pool = await this._clanPool(cohort.programId, s.capacity);
    candidates.sort((a, b) => (a.level || '').localeCompare(b.level || '')
      || `${a.firstName}${a.lastName}`.localeCompare(`${b.firstName}${b.lastName}`)
      || String(a.applicationId).localeCompare(String(b.applicationId)));

    const rows = [];
    for (const c of candidates) {
      const name = `${c.firstName || ''} ${c.lastName || ''}`.trim() || c.email;
      const base = { applicationId: c.applicationId, userId: c.userId || null, name, email: c.email,
        level: c.level, levelLabel: levelLabel.get(c.level) || c.level, gender: this._candidateGender(c),
        // Where they're stuck, when they're accepted but not in a clan — shown
        // under the row so the admin can see WHY there's no invite.
        note: c.note || null };
      if (c.alreadyPlaced) {
        // Carry the real clan through, so the row can name it instead of just
        // saying "already placed" and leaving the admin to go hunting.
        rows.push({ ...base, clanId: c.placedClanId || null, clanName: c.placedClanName || null,
          status: 'already_placed', reason: c.placedReason || 'Already placed' });
        continue;
      }
      const { clan, reason } = this._resolve(pool, c, s);
      if (clan) clan.fill += 1; // reserve the seat for the rest of this run
      rows.push({ ...base, clanId: clan ? clan.id : null, clanName: clan ? clan.name : null,
        status: clan ? 'assigned' : 'unassigned', reason });
    }

    const clansOut = [...pool.values()].map((c) => ({ id: c.id, name: c.name, levels: c.levels, countries: c.countries, leadGender: c.leadGender, cap: c.cap, projectedFill: c.fill }));
    const summary = {
      total: rows.length,
      assigned: rows.filter((r) => r.status === 'assigned').length,
      unassigned: rows.filter((r) => r.status === 'unassigned').length,
      // Renamed meaning: this now counts people genuinely IN a clan, not merely
      // ones whose application says 'accepted'.
      alreadyAccepted: rows.filter((r) => r.status === 'already_placed').length,
      // Accepted but stuck (no clan): the whole point is that these are still
      // assignable from this screen.
      stuck: rows.filter((r) => r.status !== 'already_placed' && r.note).length,
    };
    return { rows, clans: clansOut, summary, settings: s };
  }

  /**
   * What has ACTUALLY happened to each applicant, as opposed to what their
   * status column claims. `status: 'accepted'` only means someone pressed
   * accept — it says nothing about whether they got an account, whether their
   * invite is still usable, or whether they ever landed in a clan.
   *
   * Returns per applicationId: the resolved user, the clan they're really in
   * (if any), and the state of their invite. That's what lets the drawer say
   * "Already in Crispy Cache" or "Accepted · invite expired" instead of a bare
   * "Already accepted" that dead-ends the admin.
   */
  async _resolveState(apps) {
    const out = new Map();
    if (!apps.length) return out;

    const emails = [...new Set(apps.map((a) => (a.email || '').trim().toLowerCase()).filter(Boolean))];

    // Resolve the account: applications back-link `user_id` once the person
    // registers, but a person who registered another way (or an older row) may
    // not be linked — so fall back to matching on email.
    const linkedIds = [...new Set(apps.map((a) => a.userId).filter(Boolean))];
    const users = await models.User.findAll({
      where: { [Op.or]: [
        ...(linkedIds.length ? [{ id: { [Op.in]: linkedIds } }] : []),
        ...(emails.length ? [{ email: { [Op.in]: emails } }] : []),
      ] },
      attributes: ['id', 'email'], raw: true,
    });
    const userById = new Map(users.map((u) => [u.id, u]));
    const userByEmail = new Map(users.map((u) => [(u.email || '').toLowerCase(), u]));

    // The one thing that truly blocks a re-assignment: a live mentee membership.
    const userIds = [...new Set(users.map((u) => u.id))];
    const placedByUser = new Map();
    if (userIds.length) {
      const memberships = await models.ClanMembership.findAll({
        where: { userId: { [Op.in]: userIds }, role: 'mentee', status: { [Op.in]: ['active', 'paused'] } },
        include: [{ model: models.Clan, as: 'clan', attributes: ['id', 'name'] }],
      });
      memberships.forEach((m) => placedByUser.set(m.userId, { clanId: m.clanId, clanName: m.clan?.name || 'a clan' }));
    }

    // Invite state — this is what answers "why can't I find their invite link?".
    const invites = emails.length
      ? await models.RegistrationInvite.findAll({
        where: { email: { [Op.in]: emails }, role: 'mentee' },
        attributes: ['id', 'email', 'clanId', 'usedAt', 'revokedAt', 'expiresAt', 'createdAt'],
        order: [['createdAt', 'DESC']], raw: true,
      })
      : [];
    const inviteByEmail = new Map();
    for (const inv of invites) {
      const key = (inv.email || '').toLowerCase();
      if (!inviteByEmail.has(key)) inviteByEmail.set(key, inv); // newest wins
    }
    const inviteState = (inv) => {
      if (!inv) return 'none';
      if (inv.usedAt) return 'used';
      if (inv.revokedAt) return 'revoked';
      if (new Date(inv.expiresAt) <= new Date()) return 'expired';
      return 'live';
    };

    for (const a of apps) {
      const email = (a.email || '').trim().toLowerCase();
      const user = (a.userId && userById.get(a.userId)) || userByEmail.get(email) || null;
      const placed = user ? placedByUser.get(user.id) : null;
      const invite = inviteByEmail.get(email) || null;
      out.set(a.id, {
        userId: user ? user.id : null,
        clanId: placed ? placed.clanId : null,
        clanName: placed ? placed.clanName : null,
        hasAccount: !!user,
        invite: inviteState(invite),
      });
    }
    return out;
  }

  /** A short human note explaining where an accepted-but-unplaced person is stuck. */
  _stuckNote(status, st) {
    if (status !== 'accepted') return null;
    if (!st.hasAccount) {
      if (st.invite === 'live') return 'Accepted · invite sent, not registered yet';
      if (st.invite === 'expired') return 'Accepted · invite expired — assigning re-sends it';
      if (st.invite === 'revoked') return 'Accepted · invite revoked — assigning re-sends it';
      return 'Accepted · no invite found — assigning sends one';
    }
    return 'Accepted · registered but never placed in a clan';
  }

  /** Propose a clan for each SELECTED candidate (assign-at-accept flow). */
  async previewAssignment(cohortId, applicationIds, rawSettings = {}) {
    const cohort = await models.Cohort.findByPk(cohortId, { attributes: ['id', 'programId', 'levels'] });
    if (!cohort) throw new NotFoundError('Cohort not found');
    if (!Array.isArray(applicationIds) || !applicationIds.length) throw new ValidationError('Select at least one candidate');

    const s = this._defaults(rawSettings);
    const apps = await models.Application.findAll({
      where: { id: { [Op.in]: applicationIds }, cohortId },
      attributes: ['id', 'firstName', 'lastName', 'email', 'level', 'status', 'responses', 'userId'],
    });
    const state = await this._resolveState(apps);

    const candidates = apps.map((a) => {
      const st = state.get(a.id) || { userId: null, clanId: null, clanName: null, hasAccount: false, invite: 'none' };
      // ONLY a real clan membership blocks re-assignment. "status = accepted"
      // used to block it on its own, which stranded anyone who was accepted but
      // never registered, or whose invite expired: they showed as "Already
      // accepted" here AND were invisible on the Unplaced tab, with no way back.
      return {
        applicationId: a.id, userId: st.userId, firstName: a.firstName, lastName: a.lastName, email: a.email,
        level: a.level, responses: a.responses,
        alreadyPlaced: !!st.clanId,
        placedReason: st.clanName ? `Already in ${st.clanName}` : null,
        placedClanId: st.clanId, placedClanName: st.clanName,
        note: this._stuckNote(a.status, st),
      };
    });
    return this._plan(cohort, candidates, s);
  }

  /**
   * Every accepted candidate who is NOT in a clan — whether or not they ever
   * registered. It used to require `userId != null`, i.e. only people with an
   * account, which meant anyone accepted-but-never-registered (expired invite,
   * invite never delivered) appeared on NO tab at all and could not be recovered
   * from this screen. Returns applications plus their resolved state.
   */
  async _unassignedApplications(cohortId) {
    const apps = await models.Application.findAll({
      where: { cohortId, status: 'accepted' },
      attributes: ['id', 'userId', 'firstName', 'lastName', 'email', 'level', 'responses', 'status'],
    });
    if (!apps.length) return { apps: [], state: new Map() };
    const state = await this._resolveState(apps);
    return { apps: apps.filter((a) => !state.get(a.id)?.clanId), state };
  }

  /** Propose a clan for each already-accepted-but-unplaced mentee. */
  async previewUnassigned(cohortId, rawSettings = {}) {
    const cohort = await models.Cohort.findByPk(cohortId, { attributes: ['id', 'programId', 'levels'] });
    if (!cohort) throw new NotFoundError('Cohort not found');
    const s = this._defaults(rawSettings);
    const { apps, state } = await this._unassignedApplications(cohortId);
    const candidates = apps.map((a) => {
      const st = state.get(a.id) || { userId: null, hasAccount: false, invite: 'none' };
      return {
        applicationId: a.id, userId: st.userId, firstName: a.firstName, lastName: a.lastName, email: a.email,
        level: a.level, responses: a.responses, alreadyPlaced: false,
        note: this._stuckNote('accepted', st),
      };
    });
    return this._plan(cohort, candidates, s);
  }

  /**
   * Commit the SELECTED-candidate plan: accept each with their clan. Reuses
   * acceptApplication (invite + email + clan-stamp). Resilient per row.
   */
  async commitAssignment(cohortId, assignments, acceptedBy) {
    if (!Array.isArray(assignments) || !assignments.length) throw new ValidationError('Nothing to assign');
    const results = { accepted: 0, skipped: [] };
    for (const a of assignments) {
      const clanId = a.clanId || null;
      if (!clanId) { results.skipped.push({ applicationId: a.applicationId, reason: 'no clan chosen' }); continue; }
      try {
        await applicationService.acceptApplication(a.applicationId, { clanId }, acceptedBy);
        results.accepted += 1;
      } catch (e) {
        results.skipped.push({ applicationId: a.applicationId, reason: e.message });
      }
    }
    return results;
  }

  /**
   * Commit the UNPLACED-mentee plan. Two kinds of person land here, and they
   * need different treatment:
   *   - HAS an account (registered, never placed) → drop them straight into the
   *     clan via addMember, which creates the membership + enrollment.
   *   - NO account (accepted but never registered — invite expired, lost, or
   *     never delivered) → there is nobody to add yet, so re-run the accept with
   *     the chosen clan. acceptApplication reuses or re-issues the invite and
   *     stamps the clan on it, so registering drops them into that clan.
   * Previously only the first case was handled and the second was skipped as
   * "missing clan or user", which is why an accepted applicant with no invite
   * could not be recovered from this screen at all. Resilient per row.
   */
  async commitPlacement(cohortId, placements, actorId = null) {
    if (!Array.isArray(placements) || !placements.length) throw new ValidationError('Nothing to place');
    const clanService = require('./clanService');
    const results = { placed: 0, invited: 0, skipped: [] };
    for (const p of placements) {
      const clanId = p.clanId || null;
      const userId = p.userId || null;
      if (!clanId) { results.skipped.push({ userId, applicationId: p.applicationId, reason: 'no clan chosen' }); continue; }
      try {
        if (userId) {
          // actor omitted: the route already enforces INTAKE_MANAGE.
          await clanService.addMember(clanId, { userId, role: 'mentee' });
          results.placed += 1;
        } else if (p.applicationId) {
          // resend: this person is being rescued precisely because they have no
          // usable link — retargeting a silent invite would leave them stuck again.
          await applicationService.acceptApplication(p.applicationId, { clanId, resend: true }, actorId);
          results.invited += 1;
        } else {
          results.skipped.push({ userId, reason: 'no account and no application to re-invite' });
        }
      } catch (e) {
        results.skipped.push({ userId, applicationId: p.applicationId, reason: e.message });
      }
    }
    return results;
  }
}

module.exports = new ClanAssignmentService();
