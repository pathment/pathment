/**
 * Migration: 082_dedupe_invites_unique
 *
 * Stops duplicate ACTIVE registration invites for the same person. Under load
 * (a retried / double-submitted assign run, or a token expiry mid-batch) two
 * concurrent accepts could each mint an invite, leaving an orphaned second one.
 *
 *  1. Dedupe existing active invites: for each (email, role) with more than one
 *     live invite (used_at IS NULL AND revoked_at IS NULL AND not expired), keep
 *     ONE — preferring the invite an application actually points at, else the
 *     newest — and revoke the rest. Repoint any application.invite_id that
 *     referenced a now-revoked invite to the kept one.
 *  2. Add a PARTIAL UNIQUE INDEX on (lower(email), role) WHERE used_at IS NULL
 *     AND revoked_at IS NULL, so the DB itself refuses a second active invite —
 *     the race can no longer produce a duplicate (the loser gets a unique
 *     violation, which the service catches and reuses).
 *
 * Idempotent: the dedupe is a no-op once clean, and the index is created
 * IF NOT EXISTS.
 *
 * Run:      node server/scripts/migrations/082_dedupe_invites_unique.js
 * Rollback: node server/scripts/migrations/082_dedupe_invites_unique.js --rollback
 */
const sequelize = require('./_db');

const INDEX = 'registration_invites_active_email_role_uidx';

async function up() {
  console.log('▶ Running migration 082: dedupe invites + active-unique index');
  await sequelize.transaction(async (transaction) => {
    // 1. Find (email, role) groups with more than one OUTSTANDING invite. This
    //    must match the index predicate EXACTLY — unused + unrevoked, expiry
    //    aside — or an expired-but-unrevoked leftover slips through and breaks
    //    the unique index.
    const [dups] = await sequelize.query(`
      SELECT lower(email) AS email, role, COUNT(*) AS n
      FROM registration_invites
      WHERE used_at IS NULL AND revoked_at IS NULL
      GROUP BY lower(email), role
      HAVING COUNT(*) > 1
    `, { transaction });

    let revoked = 0;
    for (const g of dups) {
      // Outstanding invites in this group, KEEPER first: one an application
      // references wins, then a still-valid (non-expired) one, then the newest.
      const [rows] = await sequelize.query(`
        SELECT ri.id,
               (EXISTS (SELECT 1 FROM applications a WHERE a.invite_id = ri.id)) AS linked,
               (ri.expires_at > now()) AS valid,
               ri.created_at
        FROM registration_invites ri
        WHERE lower(ri.email) = :email AND ri.role = :role
          AND ri.used_at IS NULL AND ri.revoked_at IS NULL
        ORDER BY linked DESC, valid DESC, ri.created_at DESC
      `, { replacements: { email: g.email, role: g.role }, transaction });

      const keeper = rows[0].id;
      const losers = rows.slice(1).map((r) => r.id);
      if (!losers.length) continue;

      // Repoint any applications that referenced a loser → the keeper.
      await sequelize.query(
        `UPDATE applications SET invite_id = :keeper WHERE invite_id IN (:losers)`,
        { replacements: { keeper, losers }, transaction }
      );
      // Revoke the losers.
      await sequelize.query(
        `UPDATE registration_invites SET revoked_at = now() WHERE id IN (:losers)`,
        { replacements: { losers }, transaction }
      );
      revoked += losers.length;
    }
    console.log(`  ✓ Deduped ${dups.length} email/role group(s), revoked ${revoked} duplicate invite(s)`);

    // 2. Partial unique index so it can never happen again.
    await sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS ${INDEX}
      ON registration_invites (lower(email), role)
      WHERE used_at IS NULL AND revoked_at IS NULL
    `, { transaction });
    console.log(`  ✓ Created partial unique index ${INDEX}`);
  });
  console.log('✅ Migration 082 complete');
}

async function down() {
  console.log('▶ Rolling back migration 082 (dropping the unique index; revocations stay)');
  await sequelize.query(`DROP INDEX IF EXISTS ${INDEX}`);
  console.log('✅ Rollback 082 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => { try { await (isRollback ? down() : up()); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down };
