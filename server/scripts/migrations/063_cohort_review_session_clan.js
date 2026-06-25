/**
 * Migration: 063_cohort_review_session_clan
 *
 * Make cohort-review sessions CLAN-scoped instead of mentor-scoped.
 *
 * Before: a session was keyed on (mentor_id, session_date), so a lead mentor and
 * a co-mentor of the SAME clan each got their own session/history for the same
 * day's review — duplicate, un-shared, can't co-edit. After: a session belongs
 * to a clan (clan_id), so everyone who mentors that clan (lead + co-mentors)
 * shares one session per day and both can edit it. mentor_id stays as the
 * "started by" creator for display/audit.
 *
 * This migration:
 *   1. Adds nullable clan_id + an index on (clan_id, session_date).
 *   2. Backfills clan_id from each session owner's clan — a clan they LEAD when
 *      that's unambiguous, else their single mentored clan. Owners who mentor
 *      multiple clans (ambiguous) are left null (legacy; hidden from clan history).
 *   3. De-duplicates: when several sessions now share the same (clan_id,
 *      session_date), KEEP the lead-mentor-owned one and delete the others
 *      (co-mentor duplicates) plus their entries. A clan+day with only a
 *      co-mentor session (no lead that day) keeps that single session.
 *
 * Run:      node server/scripts/migrations/063_cohort_review_session_clan.js
 * Rollback: node server/scripts/migrations/063_cohort_review_session_clan.js --rollback
 *           (drops the column/index; deleted duplicate sessions cannot be restored)
 */
const { Sequelize, QueryTypes } = require('sequelize');
const sequelize = require('./_db');

async function up() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Running migration 063: clan-scoped cohort review sessions');

  // 1. Column ------------------------------------------------------------------
  try {
    await qi.addColumn('cohort_review_sessions', 'clan_id', {
      type: Sequelize.UUID, allowNull: true,
      references: { model: 'clans', key: 'id' }, onDelete: 'CASCADE',
    });
    console.log('  ✓ Added cohort_review_sessions.clan_id');
  } catch (e) {
    if (/already exists|duplicate column/i.test(e.message)) console.log('  ℹ clan_id exists, skipping');
    else throw e;
  }

  try {
    await qi.addIndex('cohort_review_sessions', ['clan_id', 'session_date'], { name: 'crs_clan_date_idx' });
    console.log('  ✓ Index crs_clan_date_idx');
  } catch (e) {
    if (/already exists/i.test(e.message)) console.log('  ℹ Index crs_clan_date_idx exists, skipping');
    else throw e;
  }

  // 2. Backfill clan_id --------------------------------------------------------
  // (a) Owner leads exactly one clan → that clan.
  const [leadRes] = await sequelize.query(`
    UPDATE cohort_review_sessions s
    SET clan_id = sub.clan_id
    FROM (
      SELECT cm.user_id, MIN(cm.clan_id::text)::uuid AS clan_id
      FROM clan_memberships cm
      WHERE cm.role = 'lead_mentor' AND cm.status = 'active'
      GROUP BY cm.user_id
      HAVING COUNT(DISTINCT cm.clan_id) = 1
    ) sub
    WHERE s.clan_id IS NULL AND s.mentor_id = sub.user_id;
  `);
  console.log(`  ✓ Backfilled clan_id from lead-mentor clan (${leadRes?.rowCount ?? 0} rows)`);

  // (b) Still null + owner mentors exactly one clan (lead or co) → that clan.
  const [anyRes] = await sequelize.query(`
    UPDATE cohort_review_sessions s
    SET clan_id = sub.clan_id
    FROM (
      SELECT cm.user_id, MIN(cm.clan_id::text)::uuid AS clan_id
      FROM clan_memberships cm
      WHERE cm.role IN ('lead_mentor','co_mentor') AND cm.status = 'active'
      GROUP BY cm.user_id
      HAVING COUNT(DISTINCT cm.clan_id) = 1
    ) sub
    WHERE s.clan_id IS NULL AND s.mentor_id = sub.user_id;
  `);
  console.log(`  ✓ Backfilled clan_id from single mentored clan (${anyRes?.rowCount ?? 0} rows)`);

  // 3. De-duplicate per (clan_id, session_date) -------------------------------
  const sessions = await sequelize.query(
    `SELECT id, mentor_id, clan_id, session_date::text AS session_date, created_at
       FROM cohort_review_sessions
      WHERE clan_id IS NOT NULL
      ORDER BY created_at ASC`,
    { type: QueryTypes.SELECT }
  );
  const leadPairs = await sequelize.query(
    `SELECT user_id, clan_id FROM clan_memberships WHERE role = 'lead_mentor' AND status = 'active'`,
    { type: QueryTypes.SELECT }
  );
  const leadSet = new Set(leadPairs.map((l) => `${l.user_id}|${l.clan_id}`));

  const groups = new Map();
  for (const s of sessions) {
    const key = `${s.clan_id}|${s.session_date}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }

  const toDelete = [];
  for (const arr of groups.values()) {
    if (arr.length < 2) continue;
    // arr is ascending by created_at; prefer the lead-owned session, else oldest.
    const keeper = arr.find((s) => leadSet.has(`${s.mentor_id}|${s.clan_id}`)) || arr[0];
    for (const s of arr) if (s.id !== keeper.id) toDelete.push(s.id);
  }

  if (toDelete.length) {
    await sequelize.query(`DELETE FROM cohort_review_entries WHERE session_id IN (:ids)`, { replacements: { ids: toDelete } });
    await sequelize.query(`DELETE FROM cohort_review_sessions WHERE id IN (:ids)`, { replacements: { ids: toDelete } });
    console.log(`  ✓ Removed ${toDelete.length} duplicate co-mentor session(s) (kept the lead's)`);
  } else {
    console.log('  ℹ No duplicate clan+day sessions to remove');
  }

  const [stillNull] = await sequelize.query(`SELECT COUNT(*)::int AS n FROM cohort_review_sessions WHERE clan_id IS NULL`, { type: QueryTypes.SELECT });
  if (stillNull?.n) console.log(`  ℹ ${stillNull.n} legacy session(s) left without a clan (ambiguous owner) — hidden from clan history`);

  console.log('✅ Migration 063 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 063 (deleted duplicate sessions are NOT restored)');
  try { await qi.removeIndex('cohort_review_sessions', 'crs_clan_date_idx'); console.log('  ✓ Dropped index'); }
  catch (e) { if (!/does not exist/i.test(e.message)) throw e; }
  try { await qi.removeColumn('cohort_review_sessions', 'clan_id'); console.log('  ✓ Dropped clan_id'); }
  catch (e) { if (!/does not exist/i.test(e.message)) throw e; }
  console.log('✅ Rollback 063 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => { try { await (isRollback ? down() : up()); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down };
