/**
 * Migration: 149_pool_member_level
 *
 * A pool candidate carries the level they applied at, so qualifying work can
 * be aimed at a level instead of at everybody.
 *
 * Intake already has this: a cohort offers `levels` ([{ key, label }]), an
 * applicant picks one, and `applications.level` holds the key — which is what
 * decides the assessment they are given. The pool had no equivalent, so a
 * round could only ever hand the same work to every candidate, or have an
 * operator hand-pick names. Both are wrong when a beginner and a senior are
 * being selected in the same round and should be set different courses.
 *
 * The level is a key into the cohort's `levels`, as on applications, and it is
 * nullable for the same reason: a pool with no cohort, or a cohort with no
 * level question, has no level to carry. Work with no level targets everyone,
 * so existing rounds behave exactly as they did.
 *
 * Backfill: candidates added from an application take that application's
 * level. Candidates imported by email have none, which is correct — nobody
 * ever asked them.
 *
 * Idempotent and additive.
 *
 * Run:      node server/scripts/migrations/149_pool_member_level.js
 * Preview:  node server/scripts/migrations/149_pool_member_level.js --dry-run
 * Rollback: node server/scripts/migrations/149_pool_member_level.js --rollback
 */
const sequelize = require('./_db');

const STATEMENTS = [
  'ALTER TABLE candidate_pool_members ADD COLUMN IF NOT EXISTS level VARCHAR(40)',
  'CREATE INDEX IF NOT EXISTS candidate_pool_members_pool_level_idx ON candidate_pool_members (pool_id, level)',
];

// Only fills rows that came from an application and have no level yet, so
// re-running changes nothing and a hand-set level is never overwritten.
const BACKFILL = `
  UPDATE candidate_pool_members m
     SET level = a.level
    FROM applications a
   WHERE m.application_id = a.id
     AND m.level IS NULL
     AND a.level IS NOT NULL
`;

async function up({ dryRun = false } = {}) {
  console.log(dryRun ? '=== DRY RUN ===\n' : '▶ Running migration 149: pool member level\n');
  if (dryRun) {
    STATEMENTS.forEach((sql) => console.log(`${sql} …`));
    console.log(`${BACKFILL.trim()} …`);
    console.log('\nRe-run without --dry-run to apply.');
    return;
  }
  await sequelize.transaction(async (transaction) => {
    for (const sql of STATEMENTS) await sequelize.query(sql, { transaction });
    const [, result] = await sequelize.query(BACKFILL, { transaction });
    console.log(`  ✓ candidate_pool_members.level (backfilled ${result?.rowCount ?? 0} from applications)`);
  });
}

async function down() {
  await sequelize.query('DROP INDEX IF EXISTS candidate_pool_members_pool_level_idx');
  await sequelize.query('ALTER TABLE candidate_pool_members DROP COLUMN IF EXISTS level');
  console.log('  ✓ Dropped candidate_pool_members.level');
}

module.exports = { up, down };

if (require.main === module) {
  (process.argv.includes('--rollback')
    ? down()
    : up({ dryRun: process.argv.includes('--dry-run') }))
    .catch((error) => { console.error('Migration failed:', error.message); process.exitCode = 1; })
    .finally(() => sequelize.close());
}
