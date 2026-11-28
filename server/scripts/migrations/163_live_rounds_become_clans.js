/**
 * Migration: 163_live_rounds_become_clans
 *
 * The live selection rounds move off `candidate_pools` and onto clans.
 *
 * For each pool that is not archived:
 *   - a clan of kind 'pool' in the same programme, carrying the pool's name,
 *     photo, quota, waitlist, deadline and points curve;
 *   - the intake it draws from points at it (`cohorts.pool_clan_id`);
 *   - each level's live work becomes a ROADMAP of that level's steps, and a
 *     level rule pointing at it;
 *   - every member becomes a clan membership at the level they hold, and their
 *     selection record points at the clan and that membership;
 *   - their assigned tasks are re-pointed from `pool_member_id` to `clan_id`.
 *
 * ## The two things this has to invent, and why
 *
 * **There are no roadmaps.** A pool's work items are standalone
 * `roadmap_tasks` rows with `roadmap_id = NULL` — the "add a course as
 * qualifying work" flow made them that way. A round that is a clan sets work
 * per level by naming a ROADMAP, so one is created per level and that level's
 * steps are adopted into it. Nothing is copied: the same rows move, so every
 * task already assigned from them keeps pointing at the same step.
 *
 * **There are no durations.** Those steps have no `due_offset_days`; the pool
 * put a fixed calendar date on the work item instead. A round counts a
 * deadline from the moment somebody joins, so the fixed date is converted to
 * the span it was originally meant to allow — `dueAt` minus the work item's
 * `createdAt`, floored at one day, defaulting to 14 when there is no date to
 * read. People already holding the work keep the date they were given; this
 * only decides what somebody joining tomorrow gets.
 *
 * Cancelled work items are left behind on purpose: they are history, and a
 * round should not start by handing out work somebody withdrew.
 *
 * Idempotent (a pool already carrying `settings.migratedToClanId` is skipped)
 * and reversible. `--dry-run` reports exactly what it would do and writes
 * nothing.
 *
 * Run:      node server/scripts/migrations/163_live_rounds_become_clans.js [--dry-run]
 * Rollback: node server/scripts/migrations/163_live_rounds_become_clans.js --rollback
 */
const { randomUUID } = require('crypto');
const sequelize = require('./_db');

const DEFAULT_DAYS = 14;
const MIGRATED_KEY = 'migratedToClanId';

const q = (sql, replacements) => sequelize.query(sql, { replacements, type: sequelize.QueryTypes.SELECT });
const run = (sql, replacements) => sequelize.query(sql, { replacements });

/** How long this piece of work was meant to take, in days. */
function spanOf(item) {
  const due = item.dueAt ? new Date(item.dueAt) : null;
  const from = item.createdAt ? new Date(item.createdAt) : null;
  if (!due || Number.isNaN(due.getTime())) return DEFAULT_DAYS;
  const start = from && !Number.isNaN(from.getTime()) ? from : new Date();
  const days = Math.round((due.getTime() - start.getTime()) / 86400000);
  return days >= 1 ? days : 1;
}

async function up({ dryRun = false } = {}) {
  console.log(`▶ Running migration 163: live rounds become clans${dryRun ? ' (DRY RUN — nothing is written)' : ''}`);

  const pools = await q(`
    SELECT id, organization_id, program_id, cohort_id, name, description, avatar_url,
           selection_quota, qualification_due_at, scoring_policy, settings, work_items, created_by_id
      FROM candidate_pools
     WHERE archived_at IS NULL
     ORDER BY created_at`);
  if (!pools.length) { console.log('  ℹ No live pools to move'); return; }

  for (const pool of pools) {
    const settings = pool.settings || {};
    if (settings[MIGRATED_KEY]) {
      console.log(`  ℹ "${pool.name}" already moved to clan ${settings[MIGRATED_KEY]}, skipping`);
      continue;
    }
    console.log(`\n  ── ${pool.name} ──`);

    const clanId = randomUUID();
    const items = (Array.isArray(pool.work_items) ? pool.work_items : []).filter((w) => w && !w.cancelledAt);
    const members = await q('SELECT id, user_id, level, email FROM candidate_pool_members WHERE pool_id = :id', { id: pool.id });
    const seated = members.filter((m) => m.user_id);
    const [{ count: taskCount }] = await q(
      'SELECT COUNT(*)::int AS count FROM assigned_tasks WHERE pool_member_id IN (SELECT id FROM candidate_pool_members WHERE pool_id = :id)',
      { id: pool.id },
    );

    /*
     * Who each piece of work actually reached, read exactly as
     * `poolService.targetsMember` reads it — the service that handed it out:
     *
     *   aimed at levels            → those levels
     *   aimed at nobody, round HAS levels
     *                              → nobody, unless an admin said `forEveryone`
     *   aimed at nobody, round has NO levels
     *                              → everyone, because there is nothing to aim at
     *
     * Getting this wrong in either direction is a round that hands out work
     * nobody was meant to have, or drops work everybody was doing.
     */
    const cohortLevels = pool.cohort_id
      ? (await q('SELECT levels FROM cohorts WHERE id = :id', { id: pool.cohort_id }))[0]?.levels || []
      : [];
    const roundLevels = [...new Set([
      ...members.map((m) => m.level).filter(Boolean),
      ...(Array.isArray(cohortLevels) ? cohortLevels.map((l) => l && l.key).filter(Boolean) : []),
    ])];

    const byLevel = new Map();
    const leftBehind = [];
    for (const item of items) {
      const levels = Array.isArray(item.levels) ? item.levels.filter(Boolean) : [];
      let targets;
      if (levels.length) targets = levels;
      else if (item.forEveryone || !roundLevels.length) targets = ['*'];
      else targets = [];
      if (!targets.length) { leftBehind.push(item); continue; }
      for (const level of targets) {
        if (!byLevel.has(level)) byLevel.set(level, []);
        byLevel.get(level).push(item);
      }
    }

    console.log(`     clan            ${clanId}`);
    console.log(`     members         ${members.length} (${seated.length} with an account)`);
    console.log(`     assigned tasks  ${taskCount}`);
    console.log(`     live work       ${items.length} piece(s) across ${byLevel.size} level(s)`);
    for (const [level, list] of byLevel) {
      console.log(`       ${level}: ${list.map((w) => `${w.title} (${spanOf(w)}d)`).join(', ')}`);
    }
    if (leftBehind.length) {
      console.log(`     ⚠ ${leftBehind.length} piece(s) already reached nobody and are left behind: ${leftBehind.map((w) => w.title).join(', ')}`);
    }
    if (byLevel.has('*')) {
      // Work everybody had, in a round with nothing to aim at. It moves, so
      // the people doing it keep it — but a round sets work BY LEVEL, so there
      // is no rule it can become and nobody new will be given it.
      console.log(`     ⚠ ${byLevel.get('*').length} piece(s) reached everyone (this round has no levels). The work moves and`);
      console.log('       the people doing it keep it, but set levels and their work before anybody else joins.');
    }
    const levelsHeld = [...new Set(members.map((m) => m.level).filter(Boolean))];
    const orphanLevels = levelsHeld.filter((l) => !byLevel.has(l));
    if (orphanLevels.length) {
      console.log(`     ⚠ candidates hold level(s) with no work: ${orphanLevels.join(', ')}`);
    }
    if (dryRun) continue;

    await sequelize.transaction(async (transaction) => {
      const opts = { transaction };
      const policy = pool.scoring_policy || {};
      const selection = {
        quota: pool.selection_quota || 1,
        waitlistSize: Number.isInteger(settings.waitlistSize) ? settings.waitlistSize : 0,
        qualificationDueAt: pool.qualification_due_at ? new Date(pool.qualification_due_at).toISOString() : null,
        ...(policy.difficultyPoints ? { scoringPolicy: { difficultyPoints: policy.difficultyPoints } } : {}),
        ...(Array.isArray(settings.targetClanIds) && settings.targetClanIds.length
          ? { targetClanIds: settings.targetClanIds } : {}),
      };

      const levelRules = [];
      for (const [level, list] of byLevel) {
        const roadmapId = randomUUID();
        await sequelize.query(`
          INSERT INTO roadmaps (id, organization_id, program_id, name, description, source, published, skill_tags, owner_mentor_id, created_at, updated_at)
          VALUES (:id, :org, :program, :name, :description, 'org', true, ARRAY[]::text[], :createdBy, NOW(), NOW())`,
        { replacements: {
          id: roadmapId, org: pool.organization_id, program: pool.program_id,
          name: `${pool.name} — ${level === '*' ? 'everyone' : level}`,
          description: `The work this round sets for ${level === '*' ? 'every candidate' : level}.`,
          createdBy: pool.created_by_id || null,
        }, ...opts });

        for (const [index, item] of list.entries()) {
          await sequelize.query(`
            UPDATE roadmap_tasks
               SET roadmap_id = :roadmap, task_order = :order,
                   due_offset_days = COALESCE(due_offset_days, :span), updated_at = NOW()
             WHERE id = :step AND roadmap_id IS NULL`,
          { replacements: { roadmap: roadmapId, order: index + 1, span: spanOf(item), step: item.roadmapTaskId }, ...opts });
        }
        if (level !== '*') levelRules.push({ level, roadmapId, stepIndexes: null });
      }

      await sequelize.query(`
        INSERT INTO clans (id, organization_id, program_id, kind, name, description, avatar_url,
                           lead_mentor_id, max_mentees, status, tags, levels, countries,
                           level_rules, selection_settings, created_by, created_at, updated_at)
        VALUES (:id, :org, :program, 'pool', :name, :description, :avatar,
                NULL, NULL, 'active', ARRAY[]::varchar[], ARRAY[]::varchar[], ARRAY[]::varchar[],
                CAST(:rules AS jsonb), CAST(:selection AS jsonb), :createdBy, NOW(), NOW())`,
      { replacements: {
        id: clanId, org: pool.organization_id, program: pool.program_id, name: pool.name,
        description: pool.description || null, avatar: pool.avatar_url || null,
        rules: JSON.stringify(levelRules), selection: JSON.stringify(selection),
        createdBy: pool.created_by_id || null,
      }, ...opts });

      if (pool.cohort_id) {
        await sequelize.query(
          'UPDATE cohorts SET pool_clan_id = :clan, updated_at = NOW() WHERE id = :cohort AND pool_clan_id IS NULL',
          { replacements: { clan: clanId, cohort: pool.cohort_id }, ...opts },
        );
      }

      const movedTaskIds = [];
      for (const member of seated) {
        const membershipId = randomUUID();
        await sequelize.query(`
          INSERT INTO clan_memberships (id, organization_id, clan_id, user_id, enrollment_id, role, status, level, joined_at, created_at, updated_at)
          VALUES (:id, :org, :clan, :user, NULL, 'mentee', 'active', :level, NOW(), NOW(), NOW())
          ON CONFLICT DO NOTHING`,
        { replacements: { id: membershipId, org: pool.organization_id, clan: clanId, user: member.user_id, level: member.level || null }, ...opts });

        await sequelize.query(
          'UPDATE candidate_pool_members SET clan_id = :clan, clan_membership_id = :membership, updated_at = NOW() WHERE id = :member',
          { replacements: { clan: clanId, membership: membershipId, member: member.id }, ...opts },
        );
        // Which rows moved is recorded, so the rollback puts back exactly
        // these and never claims work given inside the round afterwards.
        const moved = await sequelize.query(
          'UPDATE assigned_tasks SET clan_id = :clan, pool_member_id = NULL, updated_at = NOW() WHERE pool_member_id = :member RETURNING id',
          { replacements: { clan: clanId, member: member.id }, type: sequelize.QueryTypes.UPDATE, transaction },
        );
        for (const row of (moved && moved[0]) || []) movedTaskIds.push({ taskId: row.id, memberId: member.id });
      }

      // Members with no account keep their selection record on the clan so the
      // round still lists them; they have no membership until they register.
      await sequelize.query(
        'UPDATE candidate_pool_members SET clan_id = :clan, updated_at = NOW() WHERE pool_id = :pool AND clan_id IS NULL',
        { replacements: { clan: clanId, pool: pool.id }, ...opts },
      );

      // The pool records where it went, which is what makes this idempotent
      // and what the rollback reads.
      await sequelize.query(
        `UPDATE candidate_pools
            SET settings = COALESCE(settings,'{}'::jsonb)
                           || jsonb_build_object('${MIGRATED_KEY}', :clan::text)
                           || jsonb_build_object('migratedTasks', CAST(:moved AS jsonb)),
                updated_at = NOW()
          WHERE id = :pool`,
        { replacements: { clan: clanId, pool: pool.id, moved: JSON.stringify(movedTaskIds) }, ...opts },
      );
    });

    console.log(`     ✓ moved to clan ${clanId}`);
  }

  console.log(`\n✅ Migration 163 ${dryRun ? 'dry run' : 'complete'}`);
}

async function down() {
  console.log('▶ Rolling back migration 163');
  const pools = await q(`SELECT id, name, settings FROM candidate_pools WHERE settings ? '${MIGRATED_KEY}'`);
  if (!pools.length) { console.log('  ℹ Nothing to roll back'); return; }

  for (const pool of pools) {
    const clanId = pool.settings[MIGRATED_KEY];
    console.log(`  ── ${pool.name} (clan ${clanId}) ──`);
    await sequelize.transaction(async (transaction) => {
      const opts = { transaction };
      /*
       * Work goes back onto its selection record — exactly the rows that
       * moved, by id. Matching on "this candidate's work in this clan" would
       * also claim anything given to them inside the round since, which never
       * belonged to the pool and has no selection record to go back to.
       */
      for (const row of pool.settings.migratedTasks || []) {
        await sequelize.query(
          'UPDATE assigned_tasks SET pool_member_id = :member, clan_id = NULL, updated_at = NOW() WHERE id = :task AND clan_id = :clan',
          { replacements: { member: row.memberId, task: row.taskId, clan: clanId }, ...opts },
        );
      }

      await sequelize.query('DELETE FROM clan_memberships WHERE clan_id = :clan', { replacements: { clan: clanId }, ...opts });
      await sequelize.query(
        'UPDATE candidate_pool_members SET clan_id = NULL, clan_membership_id = NULL, updated_at = NOW() WHERE pool_id = :pool',
        { replacements: { pool: pool.id }, ...opts },
      );
      await sequelize.query('UPDATE cohorts SET pool_clan_id = NULL, updated_at = NOW() WHERE pool_clan_id = :clan', { replacements: { clan: clanId }, ...opts });

      // The steps go back to standing alone, and the roadmaps made for them go.
      const roadmaps = await sequelize.query(
        'SELECT id FROM roadmaps WHERE id IN (SELECT DISTINCT (r->>\'roadmapId\')::uuid FROM clans c CROSS JOIN LATERAL jsonb_array_elements(c.level_rules) r WHERE c.id = :clan)',
        { replacements: { clan: clanId }, type: sequelize.QueryTypes.SELECT, transaction },
      );
      for (const roadmap of roadmaps) {
        await sequelize.query('UPDATE roadmap_tasks SET roadmap_id = NULL, updated_at = NOW() WHERE roadmap_id = :roadmap', { replacements: { roadmap: roadmap.id }, ...opts });
        await sequelize.query('DELETE FROM roadmaps WHERE id = :roadmap', { replacements: { roadmap: roadmap.id }, ...opts });
      }

      await sequelize.query('DELETE FROM clans WHERE id = :clan', { replacements: { clan: clanId }, ...opts });
      await sequelize.query(
        `UPDATE candidate_pools SET settings = settings - '${MIGRATED_KEY}' - 'migratedTasks', updated_at = NOW() WHERE id = :pool`,
        { replacements: { pool: pool.id }, ...opts },
      );
    });
    console.log('     ✓ back where it was');
  }
  console.log('✅ Rollback 163 complete');
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const isRollback = args.some((a) => a === '--rollback' || a === '-r');
  const dryRun = args.includes('--dry-run');
  (async () => {
    try { await (isRollback ? down() : up({ dryRun })); process.exit(0); }
    catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); }
  })();
}

module.exports = { up, down };
