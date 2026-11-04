/**
 * Migration: 137_announcement_window_and_occurrence_indexes
 *
 * Two indexes that the code now depends on.
 *
 * 1. announcements (organization_id, audience, audience_id, created_at)
 *
 *    Announcement visibility gained a time bound: every audience branch is now
 *    "this audience AND posted since I joined it", so `created_at` is part of
 *    every read. The table carried indexes on `audience` and `pinned` alone,
 *    which no longer cover the query the viewer branch builds.
 *
 * 2. assigned_tasks (mentee_id, schedule_slot_id, occurrence_date) UNIQUE
 *
 *    A repeating task's occurrence is identified by exactly those three
 *    columns, and recurringSlotMaterializer relies on it twice: to find the
 *    occurrence it already made, and to shrug off the duplicate-key error two
 *    server processes racing on one tick would produce. It swallows anything
 *    matching /unique/i for that reason - while there was no unique index for
 *    it to hit. Nothing structurally prevented two identical occurrences.
 *
 *    Partial, because the columns are null for every task that is not a
 *    scheduled occurrence, and `NULL` is not equal to `NULL`: without the
 *    predicate the index would be enormous and would constrain nothing.
 *
 *    Refuses to create it if duplicates already exist, and names them, rather
 *    than failing halfway with a constraint error.
 *
 * Run:      node server/scripts/migrations/137_announcement_window_and_occurrence_indexes.js
 * Rollback: node server/scripts/migrations/137_announcement_window_and_occurrence_indexes.js --rollback
 */
const sequelize = require('./_db');

const DUPLICATES = `
  SELECT mentee_id, schedule_slot_id, occurrence_date, COUNT(*) AS n
    FROM assigned_tasks
   WHERE schedule_slot_id IS NOT NULL AND occurrence_date IS NOT NULL
   GROUP BY mentee_id, schedule_slot_id, occurrence_date
  HAVING COUNT(*) > 1
   ORDER BY n DESC
   LIMIT 20`;

async function up() {
  console.log('→ announcements: (organization_id, audience, audience_id, created_at)');
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS announcements_org_audience_created_idx
      ON announcements (organization_id, audience, audience_id, created_at DESC)`);
  console.log('  ✓ done');

  const [dupes] = await sequelize.query(DUPLICATES);
  if (dupes.length) {
    console.log(`\n✗ assigned_tasks: ${dupes.length} duplicated occurrence key(s) already exist:`);
    for (const d of dupes) {
      console.log(`    mentee ${d.mentee_id} slot ${d.schedule_slot_id} on ${d.occurrence_date}: ${d.n} rows`);
    }
    throw new Error(
      'The unique index was not created. Resolve duplicate occurrences first ' +
      '(keep the row with work on it and cancel the rest), then retry the migration.'
    );
  }

  console.log('→ assigned_tasks: UNIQUE (mentee_id, schedule_slot_id, occurrence_date)');
  await sequelize.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS assigned_tasks_occurrence_key_idx
      ON assigned_tasks (mentee_id, schedule_slot_id, occurrence_date)
      WHERE schedule_slot_id IS NOT NULL AND occurrence_date IS NOT NULL`);
  console.log('  ✓ done');
}

async function down() {
  await sequelize.query('DROP INDEX IF EXISTS announcements_org_audience_created_idx');
  await sequelize.query('DROP INDEX IF EXISTS assigned_tasks_occurrence_key_idx');
  console.log('  ✓ both indexes dropped');
}

module.exports = { up, down };

if (require.main === module) {
  (process.argv.includes('--rollback') ? down() : up())
    .catch((error) => { console.error('Migration failed:', error.message); process.exitCode = 1; })
    .finally(() => sequelize.close());
}
