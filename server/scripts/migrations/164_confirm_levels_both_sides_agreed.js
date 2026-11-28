/**
 * Migration: 164_confirm_levels_both_sides_agreed
 *
 * Confirm the level on every application where the review already agreed with
 * the applicant's own pick.
 *
 * Migration 159 made a level something that is DECIDED and then CONFIRMED, and
 * confirmation is what lets somebody be placed into a selection round. The
 * rule that shipped with it (`poolAutomationService.autoLevel`) confirms an
 * agreement by itself: two independent judgements already match, so there is
 * nothing for a human to adjudicate, and only disagreements queue. But that
 * rule only runs on reviews from then on — every application reviewed BEFORE
 * it sits unconfirmed, waiting on a click that says what the data already says.
 *
 * ## The distinction this turns on
 *
 * Only `level_source = 'ai'` counts. On those, `level` is the review's answer
 * and `self_selected_level` is the applicant's, so equality is two judgements
 * agreeing — which is exactly what the live rule auto-confirms.
 *
 * On `level_source = 'self'` the two columns are equal because NOTHING EVER
 * LOOKED: the applicant's pick was copied into `level` and no review has run.
 * Confirming those would place people on a level nobody examined, which is the
 * one thing the confirmation gate exists to prevent. They are left alone, and
 * a review (or an admin) will confirm them properly.
 *
 * Confirmed rows get `level_confirmed_by = NULL`, which is how an
 * auto-confirmation is told from a person's — the same marker the live rule
 * writes.
 *
 * Idempotent (already-confirmed rows are untouched) and reversible: the
 * rollback un-confirms exactly the rows this confirmed, which it knows because
 * it only ever touches auto-confirmations.
 *
 * Run:      node server/scripts/migrations/164_confirm_levels_both_sides_agreed.js [--dry-run]
 * Rollback: node server/scripts/migrations/164_confirm_levels_both_sides_agreed.js --rollback
 */
const sequelize = require('./_db');

/** Reviewed, agreed with the applicant, and nobody has confirmed it yet. */
const AGREED_AND_UNCONFIRMED = `
  level_source = 'ai'
  AND level IS NOT NULL
  AND self_selected_level IS NOT NULL
  AND level = self_selected_level
  AND level_confirmed_at IS NULL`;

async function up({ dryRun = false } = {}) {
  console.log(`▶ Running migration 164: confirm the levels both sides agreed on${dryRun ? ' (DRY RUN — nothing is written)' : ''}`);

  const [[counts]] = await sequelize.query(`
    SELECT
      COUNT(*) FILTER (WHERE ${AGREED_AND_UNCONFIRMED})::int AS will_confirm,
      COUNT(*) FILTER (WHERE level_source = 'ai' AND level IS NOT NULL AND self_selected_level IS NOT NULL
                         AND level <> self_selected_level AND level_confirmed_at IS NULL)::int AS disagreements,
      COUNT(*) FILTER (WHERE level_source = 'self' AND level_confirmed_at IS NULL)::int AS never_reviewed,
      COUNT(*) FILTER (WHERE level_confirmed_at IS NOT NULL)::int AS already_confirmed
    FROM applications`);

  console.log(`  confirming            ${counts.will_confirm} (the review agreed with the applicant)`);
  console.log(`  left for a human      ${counts.disagreements} (the review disagreed)`);
  console.log(`  left unreviewed       ${counts.never_reviewed} (nothing has examined the level)`);
  console.log(`  already confirmed     ${counts.already_confirmed}`);

  if (dryRun) { console.log('✅ Migration 164 dry run'); return; }
  if (!counts.will_confirm) { console.log('✅ Migration 164 complete (nothing to do)'); return; }

  const [, meta] = await sequelize.query(`
    UPDATE applications
       SET level_confirmed_at = NOW(), level_confirmed_by = NULL, updated_at = NOW()
     WHERE ${AGREED_AND_UNCONFIRMED}`);
  console.log(`  ✓ ${meta.rowCount} confirmed`);
  console.log('✅ Migration 164 complete');
}

async function down() {
  console.log('▶ Rolling back migration 164');
  // Only auto-confirmations, and only where the two still agree: anything a
  // person confirmed carries their id and is none of this migration's business.
  const [, meta] = await sequelize.query(`
    UPDATE applications
       SET level_confirmed_at = NULL, updated_at = NOW()
     WHERE level_confirmed_at IS NOT NULL
       AND level_confirmed_by IS NULL
       AND level_source = 'ai'
       AND level = self_selected_level`);
  console.log(`  ✓ ${meta.rowCount} un-confirmed`);
  console.log('✅ Rollback 164 complete');
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const isRollback = args.some((a) => a === '--rollback' || a === '-r');
  (async () => {
    try { await (isRollback ? down() : up({ dryRun: args.includes('--dry-run') })); process.exit(0); }
    catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); }
  })();
}

module.exports = { up, down };
