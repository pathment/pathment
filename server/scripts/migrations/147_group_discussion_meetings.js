const { Sequelize } = require('sequelize');
const sequelize = require('./_db');

/**
 * A live meeting for a group discussion, and the mentor's feedback on each
 * mentee in it.
 *
 * The meeting reuses the Clan Review tables rather than adding its own. It is
 * a row in `cohort_review_sessions` with kind 'discussion' (the CHECK already
 * allows it, migration 144), linked to its group by `discussion_group_id`:
 *
 *   meeting_room / meeting_url             the Jitsi room
 *   scheduled_at                           when it is scheduled to start
 *   scheduled_end_at (new)                 when it is scheduled to end, optional
 *   meeting_started_at / meeting_ended_at  a mentor opened / closed the room
 *   reminded_1h_at                         the 10 minute reminder went out
 *
 * Who joined, for how long and how long they held the floor are its rows in
 * `cohort_review_entries` (joined_at, left_at, seconds_present, talk_seconds),
 * the same numbers a Clan Review call records. The review code only ever reads
 * kind 'review' (the model's default scope), so these rows never show up there.
 *
 * `discussion_feedback` is the one new table: nothing existing holds five
 * 0-100 criteria and a note. One row per mentee per mentor: two mentors rating
 * the same mentee is two opinions and both are kept; rating again replaces.
 */

async function tableExists(name) {
  const [rows] = await sequelize.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=:name`,
    { replacements: { name }, type: Sequelize.QueryTypes.SELECT },
  );
  return Boolean(rows);
}

async function columnExists(table, column) {
  const [rows] = await sequelize.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=:table AND column_name=:column`,
    { replacements: { table, column }, type: Sequelize.QueryTypes.SELECT },
  );
  return Boolean(rows);
}

async function addColumn(table, column, ddl) {
  if (await columnExists(table, column)) return;
  await sequelize.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  console.log(`  ✓ ${table}.${column}`);
}

const CRITERIA = ['communication', 'relevance', 'openness', 'critical_thinking', 'collaboration'];

async function up() {
  console.log('▶ Running migration 147: group discussion meetings\n');

  // ── the meeting: a Clan Review session of kind 'discussion' ──
  // SET NULL, not CASCADE: entries have no foreign key to their session, so
  // the group service deletes the session and its entries itself, and a stray
  // row can never block deleting a group.
  await addColumn('cohort_review_sessions', 'discussion_group_id', 'UUID REFERENCES discussion_groups(id) ON DELETE SET NULL');
  await addColumn('cohort_review_sessions', 'scheduled_end_at', 'TIMESTAMPTZ');
  // One meeting per group; also what every lookup of a group's meeting uses.
  await sequelize.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS cohort_review_sessions_discussion_group_uniq
      ON cohort_review_sessions (organization_id, discussion_group_id) WHERE discussion_group_id IS NOT NULL
  `);
  // The reminder worker looks for discussion meetings about to start, every minute.
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS cohort_review_sessions_discussion_start_idx
      ON cohort_review_sessions (scheduled_at) WHERE kind = 'discussion'
  `);

  // ── the feedback ──
  if (!await tableExists('discussion_feedback')) {
    const criteria = CRITERIA
      .map((name) => `${name} SMALLINT NOT NULL DEFAULT 50 CHECK (${name} BETWEEN 0 AND 100)`)
      .join(',\n        ');
    await sequelize.query(`
      CREATE TABLE discussion_feedback (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        group_id         UUID NOT NULL REFERENCES discussion_groups(id) ON DELETE CASCADE,
        mentee_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        mentor_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        ${criteria},
        note             TEXT,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await sequelize.query('CREATE UNIQUE INDEX discussion_feedback_uniq ON discussion_feedback (organization_id, group_id, mentee_id, mentor_id)');
    await sequelize.query('CREATE INDEX discussion_feedback_group_idx ON discussion_feedback (group_id, mentee_id)');
    console.log('  ✓ discussion_feedback');
  }

  console.log('\n✓ Migration 147 complete');
}

async function down() {
  await sequelize.query('DROP TABLE IF EXISTS discussion_feedback');
  // The meeting sessions go with the column that marks them.
  await sequelize.query(`
    DELETE FROM cohort_review_entries WHERE session_id IN (
      SELECT id FROM cohort_review_sessions WHERE kind = 'discussion' AND discussion_group_id IS NOT NULL
    )
  `);
  await sequelize.query("DELETE FROM cohort_review_sessions WHERE kind = 'discussion' AND discussion_group_id IS NOT NULL");
  await sequelize.query('DROP INDEX IF EXISTS cohort_review_sessions_discussion_start_idx');
  await sequelize.query('DROP INDEX IF EXISTS cohort_review_sessions_discussion_group_uniq');
  await sequelize.query('ALTER TABLE cohort_review_sessions DROP COLUMN IF EXISTS scheduled_end_at');
  await sequelize.query('ALTER TABLE cohort_review_sessions DROP COLUMN IF EXISTS discussion_group_id');
  console.log('Rollback complete');
}

module.exports = { up, down };

if (require.main === module) {
  up()
    .catch((error) => { console.error(error); process.exitCode = 1; })
    .finally(() => sequelize.close());
}
