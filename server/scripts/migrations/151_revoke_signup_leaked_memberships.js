/**
 * Migration: 151_revoke_signup_leaked_memberships
 *
 * Removes workspace access that nobody granted.
 *
 * Creating a user adds them to the request's workspace (User.afterCreate in
 * src/db). A public "create your workspace" sign-up carries no workspace, so the
 * request resolved to the default tenant, and every person who created their own
 * workspace ALSO became an admin of DevWeekends and saw it in their workspace
 * list. The hook is fixed (owner sign-up and invite registration now name the
 * workspace themselves); this takes back what it already handed out.
 *
 * A leaked row is a membership that:
 *   - was created in the same moment as the account (the hook, not a person),
 *   - has no inviter and is not an owner, and
 *   - sits beside a REAL sign-up membership: one the account owns, or one an
 *     invitation granted.
 * An account whose only membership came from the hook is a normal sign-up and
 * is left alone.
 *
 * The rows are set to 'left', not deleted, so nothing that references them
 * breaks. Each row's previous status is saved in
 * organization_membership_leak_backup, and --rollback restores it.
 * Idempotent: a second run finds nothing active to revoke.
 *
 * Run:      node server/scripts/migrations/151_revoke_signup_leaked_memberships.js
 * Preview:  node server/scripts/migrations/151_revoke_signup_leaked_memberships.js --dry-run
 * Rollback: node server/scripts/migrations/151_revoke_signup_leaked_memberships.js --rollback
 */
const sequelize = require('./_db');

const LEAKED_SQL = `
  WITH signup AS (
    SELECT m.id, m.user_id, m.organization_id, m.role, m.status, m.invited_by
      FROM organization_memberships m JOIN users u ON u.id = m.user_id
     WHERE m.created_at BETWEEN u.created_at - interval '5 seconds' AND u.created_at + interval '5 seconds'
  )
  SELECT DISTINCT s.id, s.user_id, s.organization_id, s.role, s.status
    FROM signup s
    JOIN signup real ON real.user_id = s.user_id AND real.id <> s.id
         AND (real.role = 'owner' OR real.invited_by IS NOT NULL)
   WHERE s.invited_by IS NULL AND s.role <> 'owner'
     AND s.status IN ('active', 'suspended')`;

async function up({ dryRun = false } = {}) {
  console.log(dryRun ? '=== DRY RUN ===\n' : '▶ Running migration 151: revoke sign-up leaked memberships\n');
  const [rows] = await sequelize.query(`
    SELECT l.*, o.slug FROM (${LEAKED_SQL}) l JOIN organizations o ON o.id = l.organization_id`);
  console.log(`  memberships to revoke: ${rows.length}`);
  for (const r of rows) console.log(`    user ${r.user_id} in ${r.slug} (${r.role}, ${r.status})`);
  if (dryRun || !rows.length) {
    if (dryRun) console.log('\nRe-run without --dry-run to apply.');
    return;
  }

  await sequelize.transaction(async (transaction) => {
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS organization_membership_leak_backup (
        membership_id UUID PRIMARY KEY REFERENCES organization_memberships(id) ON DELETE CASCADE,
        prior_status VARCHAR(20) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`, { transaction });
    await sequelize.query(`
      INSERT INTO organization_membership_leak_backup (membership_id, prior_status)
      SELECT id, status FROM (${LEAKED_SQL}) l
      ON CONFLICT (membership_id) DO NOTHING`, { transaction });
    const [, meta] = await sequelize.query(`
      UPDATE organization_memberships m SET status = 'left', updated_at = NOW()
        FROM organization_membership_leak_backup b
       WHERE b.membership_id = m.id AND m.status <> 'left'`, { transaction });
    console.log(`  ✓ revoked ${meta?.rowCount ?? rows.length} memberships (backup: organization_membership_leak_backup)`);
  });
}

async function down() {
  await sequelize.transaction(async (transaction) => {
    const [[exists]] = await sequelize.query(
      "SELECT to_regclass('organization_membership_leak_backup') IS NOT NULL AS ok", { transaction },
    );
    if (!exists.ok) { console.log('  ℹ nothing to roll back'); return; }
    const [, meta] = await sequelize.query(`
      UPDATE organization_memberships m SET status = b.prior_status, updated_at = NOW()
        FROM organization_membership_leak_backup b
       WHERE b.membership_id = m.id AND m.status = 'left'`, { transaction });
    await sequelize.query('DROP TABLE organization_membership_leak_backup', { transaction });
    console.log(`  ✓ restored ${meta?.rowCount ?? 0} memberships; dropped organization_membership_leak_backup`);
  });
}

module.exports = { up, down, LEAKED_SQL };

if (require.main === module) {
  (process.argv.includes('--rollback')
    ? down()
    : up({ dryRun: process.argv.includes('--dry-run') }))
    .catch((error) => { console.error('Migration failed:', error.message); process.exitCode = 1; })
    .finally(() => sequelize.close());
}
