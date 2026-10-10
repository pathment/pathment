/**
 * Migration: 121_uncap_standing_clans
 *
 * Take the cohort's size limit off standing clans.
 *
 * `createClan` defaulted every clan to `maxMentees: 25`, which is a COHORT's
 * number — a programme intake is deliberately bounded. A standing clan is an
 * open-ended mentoring space its mentor runs, and the default meant a 34-person
 * cohort could not be carried into its own continuation: it filled at 25 and
 * refused the rest with "increase its capacity", from a screen that has no
 * capacity control on it.
 *
 * `createClan` no longer caps standing clans. This clears the inherited caps on
 * the ones already created — only where the cap is the untouched default, so a
 * mentor who deliberately set a limit keeps it.
 *
 * NULL means uncapped: `addMenteesToStandingClan` checks `if (clan.maxMentees
 * && count >= clan.maxMentees)`, so a null is simply never full.
 *
 * Idempotent.
 *
 * Run:      node server/scripts/migrations/121_uncap_standing_clans.js
 * Preview:  node server/scripts/migrations/121_uncap_standing_clans.js --dry-run
 */
const sequelize = require('./_db');

const DEFAULT_COHORT_CAP = 25;

const AFFECTED = `
  SELECT c.id, c.name, c.max_mentees,
         (SELECT COUNT(*)::int FROM clan_memberships cm
           WHERE cm.clan_id = c.id AND cm.role = 'mentee'
             AND cm.status IN ('active','paused')) AS mentees
    FROM clans c
   WHERE c.kind = 'standing' AND c.max_mentees = ${DEFAULT_COHORT_CAP}`;

async function up({ dryRun = false } = {}) {
  console.log(dryRun ? '=== DRY RUN ===\n' : '▶ Running migration 121: uncap standing clans\n');

  const [rows] = await sequelize.query(AFFECTED);
  if (!rows.length) {
    console.log('No standing clan is still on the default cohort cap. Nothing to do.');
    return;
  }

  console.log(`${rows.length} standing clan(s) carrying the cohort default of ${DEFAULT_COHORT_CAP}:`);
  console.table(rows);

  if (dryRun) {
    console.log('\nRe-run without --dry-run to clear the cap.');
    return;
  }

  const [, meta] = await sequelize.query(`
    UPDATE clans SET max_mentees = NULL, updated_at = NOW()
     WHERE kind = 'standing' AND max_mentees = ${DEFAULT_COHORT_CAP}`);
  console.log(`\n✓ Uncapped ${meta?.rowCount ?? rows.length} standing clan(s).`);

  const [left] = await sequelize.query(AFFECTED);
  console.log(`Still capped at the default: ${left.length} (expected 0).`);
}

async function down() {
  await sequelize.query(
    `UPDATE clans SET max_mentees = ${DEFAULT_COHORT_CAP} WHERE kind = 'standing' AND max_mentees IS NULL`);
  console.log(`  ✓ Restored the ${DEFAULT_COHORT_CAP} cap on uncapped standing clans`);
}

module.exports = { up, down };

if (require.main === module) {
  (process.argv.includes('--rollback')
    ? down()
    : up({ dryRun: process.argv.includes('--dry-run') }))
    .catch((error) => { console.error('Migration failed:', error.message); process.exitCode = 1; })
    .finally(() => sequelize.close());
}
