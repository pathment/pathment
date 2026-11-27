const { Op } = require('sequelize');
const { VISIBLE_MEMBERSHIP_STATUSES } = require('../config/membership');
const { models, sequelize } = require('../db');
const clanService = require('./clanService');
const cohortService = require('./cohortService');
const { isProgrammeClan } = require('../config/clanKinds');

const MENTOR_ROLES = ['lead_mentor', 'co_mentor'];

function avg(nums) {
  if (!nums.length) return 0;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

function nameOf(user) {
  if (!user) return null;
  return `${user.firstName || ''} ${user.lastName || ''}`.trim() || null;
}

/**
 * The lean `listClans()` no longer eager-loads memberships (hasMany + limit
 * multiplies rows), so we fetch active memberships for these clans in one
 * grouped query and return a Map<clanId, [{ userId, role }]>.
 */
/**
 * Clan members, by clan.
 *
 * `statuses` defaults to active only, which is right for the health dashboards:
 * a paused mentee is deliberately out of clan averages and reminders, because
 * averaging in somebody who has stepped away makes every clan look worse than
 * it is being run.
 *
 * It is exactly wrong for the follow-up queue, which is the one screen whose
 * job is to find the people nobody is currently reaching. config/membership.js
 * says it plainly: a paused mentee "is still in the clan, still their mentor's
 * responsibility, and the whole point of the pause feature is that someone
 * brings them back". So that caller asks for the wider set.
 */
async function membershipsByClan(clans, statuses = ['active']) {
  const byClan = new Map(clans.map((c) => [c.id, []]));
  const ids = clans.map((c) => c.id);
  if (!ids.length) return byClan;
  const rows = await models.ClanMembership.findAll({
    where: { clanId: { [Op.in]: ids }, status: { [Op.in]: statuses } },
    attributes: ['clanId', 'userId', 'role', 'status'],
    raw: true,
  });
  for (const r of rows) {
    if (byClan.has(r.clanId)) byClan.get(r.clanId).push({ userId: r.userId, role: r.role, status: r.status });
  }
  return byClan;
}

function initialsOf(user) {
  if (!user) return '-';
  const a = (user.firstName || '').charAt(0);
  const b = (user.lastName || '').charAt(0);
  return (a + b).toUpperCase() || '-';
}

/**
 * Derive a clan's health status from its mentee rows.
 *   red    → "Needs attention"  (a third of the cohort at risk, or completion stalled)
 *   amber  → "Watch"            (some risk / slipping on-time / behind pace)
 *   green  → "Healthy"          (everyone tracking)
 * An empty clan (no active mentees) is "Watch" - nothing to read yet.
 */
function deriveStatus({ memberCount, atRisk, avgCompletion, avgOnTime }) {
  if (memberCount === 0) return { status: 'amber', label: 'Watch', reason: 'No active mentees yet' };

  // Health is judged on PROPORTIONS, never on a raw count.
  //
  // Amber used to trigger on `atRisk > 0`, which meant a clan of thirty could
  // only be healthy if not one person was struggling. That is not a high bar,
  // it is an unreachable one, and it got harder the bigger the clan: the
  // largest clans could never read healthy however well they were run. Every
  // clan in the organisation sat red or amber, so the colour said nothing.
  const atRiskRatio = atRisk / memberCount;

  if (atRiskRatio >= 0.34 || avgCompletion < 40) {
    return {
      status: 'red',
      label: 'Needs attention',
      reason: `${atRisk} of ${memberCount} mentees at risk`
    };
  }

  if (atRiskRatio >= 0.15 || avgOnTime < 70 || avgCompletion < 65) {
    const bits = [];
    if (atRiskRatio >= 0.15) bits.push(`${atRisk} of ${memberCount} at risk`);
    if (avgOnTime < 70) bits.push(`${avgOnTime}% on-time`);
    if (avgCompletion < 65) bits.push(`${avgCompletion}% complete`);
    return { status: 'amber', label: 'Watch', reason: bits.join(' · ') };
  }

  // A healthy clan can still have someone having a hard week. Say so, rather
  // than implying nobody needs anything.
  return {
    status: 'green',
    label: 'Healthy',
    reason: atRisk > 0 ? `On track · ${atRisk} needing support` : 'On track'
  };
}

// Keep task history bounded while calculating an organization-wide snapshot.
// Only compact metrics survive each batch; completed task objects are discarded.
const snapshots = new Map();
const SNAPSHOT_TTL_MS = 30000;
/**
 * @param {{includeStanding?: boolean, statuses?: string[]}} [options]
 *   `includeStanding` brings in the clans a cohort continues into after its
 *   programme ends. The dashboards leave them out because they measure a
 *   programme's delivery and a standing clan is not part of one; the follow-up
 *   queue needs them, because that is where the still-active people are.
 */
async function loadSnapshot(programIds = null, options = {}) {
  const { includeStanding = false, statuses = ['active'] } = options;
  // The widened views are cached separately: same workspace, different question.
  const key = `${require('../utils/workspaceExecution').requireWorkspaceId()}:${programIds === null ? '*' : [...programIds].sort().join(',')}:${includeStanding ? 'all' : 'cohort'}:${[...statuses].sort().join('+')}`;
  const cached = snapshots.get(key);
  if (cached && cached.expires > Date.now()) return cached.promise;
  const entry = { expires: Infinity };
  entry.promise = (async () => {
    const clans = (await clanService.listClans({ programIds }))
      // Programme clan health. `includeStanding` opts the others back in —
      // a selection round is not a programme clan either.
      .filter(c => includeStanding || isProgrammeClan(c));
    const byClan = await membershipsByClan(clans, statuses);
    const rowById = new Map();
    const rowByClan = new Map();
    for (const clan of clans) {
      const ids = (byClan.get(clan.id) || []).filter(m => m.role === 'mentee').map(m => m.userId);
      const clanRows = new Map();
      rowByClan.set(clan.id, clanRows);
      for (let offset = 0; offset < ids.length; offset += 200) {
        const batch = ids.slice(offset, offset + 200);
        const snapshotEnd = clan.frozenAt || clan.program?.closedAt || null;
        const preloads = await cohortService.preloadMenteeData(batch, {
          programId: clan.programId,
          clanId: clan.id,
          ...(snapshotEnd
            ? {
                asOfEnd: snapshotEnd,
                asOfDateKey: new Date(snapshotEnd).toISOString().slice(0, 10),
              }
            : {}),
        });
        for (const id of batch) {
          const row = await cohortService.buildMenteeRow(id, preloads);
          if (row) {
            const { completedTasks, ...metrics } = row;
            clanRows.set(row.id, metrics);
            if (!rowById.has(row.id) || !clan.frozenAt) rowById.set(row.id, metrics);
          }
        }
      }
    }
    return { clans, byClan, rowById, rowByClan, generatedAt: new Date().toISOString() };
  })().then(value => { entry.expires = Date.now() + SNAPSHOT_TTL_MS; return value; }, error => {
    if (snapshots.get(key) === entry) snapshots.delete(key);
    throw error;
  });
  snapshots.set(key, entry);
  // Bound retained snapshots. In-flight callers keep their own promise.
  while (snapshots.size > 4) snapshots.delete(snapshots.keys().next().value);
  return entry.promise;
}

function summarizeRows(rows) {
  const risk = { high: 0, watch: 0, low: 0 };
  const completion = [0, 0, 0, 0, 0];
  for (const row of rows) {
    risk[row.risk] = (risk[row.risk] || 0) + 1;
    completion[Math.min(4, Math.max(0, Math.floor(row.absoluteProgress / 20)))]++;
  }
  return { risk, completion: completion.map((count, index) => ({ label: index === 4 ? '80–100%' : `${index * 20}–${index * 20 + 19}%`, count })) };
}

function priorityMentees(rows, limit = 12) {
  return rows
    .filter((row) => row.risk !== 'low')
    .sort((a, b) => Number(b.risk === 'high') - Number(a.risk === 'high') || a.absoluteProgress - b.absoluteProgress || a.id.localeCompare(b.id))
    .slice(0, limit)
    .map((row) => ({
      id: row.id,
      name: row.name,
      avatar: row.avatar,
      avatarUrl: row.profilePictureUrl || null,
      program: row.program,
      risk: row.risk,
      riskReason: row.riskReason,
      absoluteProgress: row.absoluteProgress,
      onTimeRate: row.onTimeRate,
    }));
}

class ClanHealthService {
  invalidate() { snapshots.clear(); }
  /**
   * Org-wide health snapshot for the admin dashboard: clans grouped by program,
   * each clan scored from its mentees' real cohort rows. Returns org KPIs plus
   * programs[] → clans[] so the UI can render "clan status, program-wise".
   */
  async programHealth(programIds = null) {
    const { clans, byClan, rowById, rowByClan, generatedAt } = await loadSnapshot(programIds);
    const programs = new Map(); // programId -> program metadata + rows + clans
    const orgRows = [...rowById.values()];

    for (const clan of clans) {
      const memberships = byClan.get(clan.id) || [];
      const menteeMemberships = memberships.filter((m) => m.role === 'mentee');
      const mentorMemberships = memberships.filter((m) => MENTOR_ROLES.includes(m.role));

      const rows = menteeMemberships.map((m) => rowByClan.get(clan.id)?.get(m.userId)).filter(Boolean);

      const memberCount = menteeMemberships.length;
      const avgCompletion = avg(rows.map((r) => r.absoluteProgress));
      const avgOnTime = avg(rows.map((r) => r.onTimeRate));
      const atRisk = rows.filter((r) => r.risk !== 'low').length;
      const openBlockers = rows.reduce((sum, r) => sum + (r.openBlockers || 0), 0);
      const pendingApprovals = rows.reduce((sum, r) => sum + (r.pendingApprovals || 0), 0);

      const health = deriveStatus({ memberCount, atRisk, avgCompletion, avgOnTime });

      const clanCard = {
        id: clan.id,
        name: clan.name,
        status: health.status,
        statusLabel: health.label,
        statusReason: health.reason,
        memberCount,
        mentorCount: mentorMemberships.length,
        avgCompletion,
        avgOnTime,
        atRisk,
        openBlockers,
        pendingApprovals,
        leadMentor: clan.leadMentor
          ? { id: clan.leadMentor.id, name: nameOf(clan.leadMentor), avatar: initialsOf(clan.leadMentor) }
          : null,
      };

      const program = clan.program;
      const programId = program?.id || 'unassigned';
      if (!programs.has(programId)) {
        programs.set(programId, {
          id: programId,
          name: program?.name || 'Unassigned',
          status: program?.status || null,
          startDate: program?.startDate || null,
          endDate: program?.endDate || null,
          closedAt: program?.closedAt || null,
          rows: new Map(),
          clans: [],
        });
      }
      const programEntry = programs.get(programId);
      programEntry.clans.push(clanCard);
      // A mentee may hold more than one clan membership in a program. Dashboard
      // people counts and distributions must count the person once per program.
      for (const row of rows) programEntry.rows.set(row.id, row);
    }

    /**
     * Programmes that have no clans yet still exist.
     *
     * This map is built by walking the CLANS, so a programme with none in it
     * never appears — which is every programme on the day it is created. An
     * admin granted a new fellowship opened the dashboard to "No programs
     * yet" with their own programme missing from the scope selector, and no
     * way to pick it. They are added here with empty counts, which is the
     * truth about them.
     */
    const known = (Array.isArray(programIds) && models.Program)
      ? await models.Program.findAll({
        where: { id: { [Op.in]: programIds } },
        attributes: ['id', 'name', 'status', 'startDate', 'endDate', 'closedAt'],
        raw: true,
      })
      : [];
    for (const program of known || []) {
      if (programs.has(program.id)) continue;
      programs.set(program.id, {
        id: program.id,
        name: program.name,
        status: program.status || null,
        startDate: program.startDate || null,
        endDate: program.endDate || null,
        closedAt: program.closedAt || null,
        rows: new Map(),
        clans: [],
      });
    }

    // Sort clans within each program worst-first; sort programs by attention need.
    const statusRank = { red: 0, amber: 1, green: 2 };
    const programList = [...programs.values()].map((p) => {
      p.clans.sort((a, b) =>
        statusRank[a.status] !== statusRank[b.status]
          ? statusRank[a.status] - statusRank[b.status]
          : b.atRisk - a.atRisk
      );
      const { rows: rowsById, ...program } = p;
      const programRows = [...rowsById.values()];
      return {
        ...program,
        clanCount: p.clans.length,
        memberCount: programRows.length,
        atRisk: programRows.filter((row) => row.risk !== 'low').length,
        avgCompletion: avg(programRows.map((row) => row.absoluteProgress)),
        avgOnTime: avg(programRows.map((row) => row.onTimeRate)),
        openBlockers: programRows.reduce((sum, row) => sum + (row.openBlockers || 0), 0),
        pendingApprovals: programRows.reduce((sum, row) => sum + (row.pendingApprovals || 0), 0),
        summary: summarizeRows(programRows),
        priorityMentees: priorityMentees(programRows, 5),
      };
    });
    programList.sort((a, b) => b.atRisk - a.atRisk || b.memberCount - a.memberCount);

    const kpis = {
      activeMentees: orgRows.length,
      avgCompletion: avg(orgRows.map((r) => r.absoluteProgress)),
      avgOnTime: avg(orgRows.map((r) => r.onTimeRate)),
      atRisk: orgRows.filter((r) => r.risk !== 'low').length,
      clans: clans.length,
      programs: programList.length,
    };

    // Flat org-wide "needs attention" rollup: the actual at-risk mentees.
    const atRiskMentees = priorityMentees(orgRows);

    return { kpis, programs: programList, atRiskMentees, summary: summarizeRows(orgRows), generatedAt };
  }

  async followUps(filters = {}, programIds = null) {
    /**
     * The widest view in the service, on purpose.
     *
     * This queue returned nothing at all on a workspace of a thousand people,
     * while the Overview beside it advertised a hundred and forty-seven who
     * needed support. Three filters were stacking up, and between them they
     * excluded everybody:
     *
     *   - the snapshot dropped STANDING clans, which is where the 353 still
     *     active people had been moved to;
     *   - it loaded only ACTIVE memberships, so the 465 paused were invisible
     *     exactly where somebody was meant to notice them;
     *   - and this function skipped FROZEN clans, which is where the 567 the
     *     Overview was counting actually were.
     *
     * Every mentee sat in one of those three buckets, so the union was zero.
     */
    const { clans, byClan, rowByClan, generatedAt } = await loadSnapshot(programIds, {
      includeStanding: true,
      statuses: VISIBLE_MEMBERSHIP_STATUSES,
    });
    const rowById = new Map();
    const clanForUser = new Map();
    const pausedUsers = new Set();
    for (const clan of clans) {
      if (filters.programId && clan.programId !== filters.programId) continue;
      if (filters.clanId && clan.id !== filters.clanId) continue;
      for (const member of byClan.get(clan.id) || []) {
        if (member.role !== 'mentee') continue;
        const row = rowByClan.get(clan.id)?.get(member.userId);
        if (row) rowById.set(member.userId, row);
        if (member.status === 'paused') pausedUsers.add(member.userId);
        if (!clanForUser.has(member.userId)) clanForUser.set(member.userId, []);
        clanForUser.get(member.userId).push({ id: clan.id, name: clan.name, frozen: Boolean(clan.frozenAt) });
      }
    }
    const search = (filters.search || '').trim().toLowerCase();
    /**
     * Paused is a reason on its own, not a risk score.
     *
     * Somebody who stepped away stops generating the signals the risk model
     * reads: no overdue work, no missed sessions, so they settle at 'low' and
     * drop out of a queue filtered on risk. That is the person most likely to
     * never come back, and the one this screen exists to surface.
     */
    const needsFollowUp = (row) => row.risk !== 'low' || pausedUsers.has(row.id);
    const matchesRisk = (row) => {
      if (!filters.risk) return true;
      if (filters.risk === 'paused') return pausedUsers.has(row.id);
      return row.risk === filters.risk;
    };
    const rows = [...rowById.values()].filter(row => clanForUser.has(row.id) && needsFollowUp(row) &&
      matchesRisk(row) &&
      (!search || `${row.name} ${row.email}`.toLowerCase().includes(search)))
      .sort((a,b) => Number(b.risk === 'high') - Number(a.risk === 'high')
        || Number(pausedUsers.has(b.id)) - Number(pausedUsers.has(a.id))
        || a.absoluteProgress - b.absoluteProgress || a.id.localeCompare(b.id));
    const limit = Math.min(50, Math.max(1, Number(filters.limit) || 20));
    const pages = Math.max(1, Math.ceil(rows.length / limit));
    const page = Math.min(pages, Math.max(1, Number(filters.page) || 1));
    return { total: rows.length, page, limit, pages, generatedAt,
      rows: rows.slice((page - 1) * limit, page * limit).map(row => ({
        id: row.id, name: row.name, avatarUrl: row.profilePictureUrl,
        risk: row.risk,
        // Says WHY they are here. A paused mentee has no risk reason of their
        // own, and "no reason given" on a follow-up queue is not actionable.
        riskReason: row.riskReason || (pausedUsers.has(row.id) ? 'Paused - nobody is currently reaching them' : null),
        paused: pausedUsers.has(row.id),
        absoluteProgress: row.absoluteProgress,
        clans: clanForUser.get(row.id),
      })) };
  }

  /**
   * Everybody the current follow-up filters match, not just the page on screen.
   *
   * The follow-ups queue was a table an admin could read and nothing else:
   * it named thirty people who needed chasing and offered no way to chase
   * one, let alone all of them. A bulk nudge has to act on the QUERY rather
   * than on a list of ids posted by the browser — otherwise the client
   * decides who gets messaged, and "nudge everyone" becomes "message anyone".
   *
   * Capped, because a nudge is a notification per person and an accidental
   * org-wide send is not undoable.
   */
  async followUpRecipients(filters = {}, programIds = null, { cap = 200 } = {}) {
    const { total, rows } = await this.followUps(
      { ...filters, page: 1, limit: 50 }, programIds,
    );
    // followUps paginates at 50; walk the pages rather than widening its limit.
    const ids = rows.map((r) => r.id);
    const pages = Math.ceil(Math.min(total, cap) / 50);
    for (let page = 2; page <= pages; page += 1) {
      const next = await this.followUps({ ...filters, page, limit: 50 }, programIds);
      ids.push(...next.rows.map((r) => r.id));
    }
    return { ids: [...new Set(ids)].slice(0, cap), total, capped: total > cap };
  }

  /**
   * Org Insights payload (admin /admin/insights): a worst-first CLAN comparison
   * plus the fairness lens - org absolute vs relative progress and a per-mentee
   * distribution. "Extensions" = accepted DelayEvents (friction the org granted).
   */
  async orgInsights(programIds = null) {
    const { clans, byClan, rowById, rowByClan, generatedAt } = await loadSnapshot(programIds);

    const clanRows = [];
    const orgRows = [...rowById.values()];
    for (const clan of clans) {
      const menteeMemberships = (byClan.get(clan.id) || []).filter((m) => m.role === 'mentee');
      const rows = menteeMemberships.map((m) => rowByClan.get(clan.id)?.get(m.userId)).filter(Boolean);

      const memberCount = menteeMemberships.length;
      const avgCompletion = avg(rows.map((r) => r.absoluteProgress));
      const avgOnTime = avg(rows.map((r) => r.onTimeRate));
      const avgRelative = avg(rows.map((r) => r.relativeProgress));
      const atRisk = rows.filter((r) => r.risk !== 'low').length;
      const openBlockers = rows.reduce((s, r) => s + (r.openBlockers || 0), 0);
      const extensions = rows.reduce((s, r) => s + (r.extensions || 0), 0);
      const health = deriveStatus({ memberCount, atRisk, avgCompletion, avgOnTime });

      clanRows.push({
        id: clan.id,
        name: clan.name,
        program: clan.program?.name || 'Unassigned',
        status: health.status,
        statusLabel: health.label,
        memberCount,
        avgCompletion,
        avgOnTime,
        avgRelative,
        atRisk,
        openBlockers,
        extensions,
      });
    }

    const statusRank = { red: 0, amber: 1, green: 2 };
    clanRows.sort((a, b) => (statusRank[a.status] - statusRank[b.status]) || (b.atRisk - a.atRisk));

    const avgAbsolute = avg(orgRows.map((r) => r.absoluteProgress));
    const avgRelative = avg(orgRows.map((r) => r.relativeProgress));
    const distribution = orgRows
      .map((r) => ({ id: r.id, name: r.name, absolute: r.absoluteProgress, relative: r.relativeProgress, gap: r.relativeProgress - r.absoluteProgress }))
      .sort((a, b) => b.gap - a.gap)
      .slice(0, 24);

    const totalExtensions = clanRows.reduce((s, c) => s + c.extensions, 0);
    const totalOpenBlockers = orgRows.reduce((s, r) => s + (r.openBlockers || 0), 0);
    const redClans = clanRows.filter((c) => c.status === 'red');

    return {
      kpis: {
        activeMentees: orgRows.length,
        avgCompletion: avgAbsolute,
        avgRelative,
        atRisk: orgRows.filter((r) => r.risk !== 'low').length,
        totalExtensions,
        totalOpenBlockers,
        clansRed: redClans.length,
        clans: clans.length,
      },
      summary: summarizeRows(orgRows),
      generatedAt,
      fairness: { avgAbsolute, avgRelative, gap: avgRelative - avgAbsolute },
      clans: clanRows,
      distribution,
      redClans: redClans.map((c) => c.name),
    };
  }
}

module.exports = new ClanHealthService();
