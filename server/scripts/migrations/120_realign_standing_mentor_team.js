/**
 * Migration: 120_realign_standing_mentor_team
 *
 * Put the right mentor back in charge of standing clans already created.
 *
 * Approval hardcoded `leadMentorId: request.mentorId`, so whoever pressed the
 * button became lead of the new clan. A co-mentor who asked for a continuation
 * was promoted over the lead mentor who had actually run the cohort — and that
 * lead was left out of the new clan altogether. Requesting is not a promotion.
 *
 * The code no longer does this (standingClanService inherits the source clan's
 * team). This repairs the clans created before that.
 *
 * For each standing clan whose request records a source clan:
 *   - the source clan's lead mentor becomes lead here too
 *   - everybody else on that source team joins as co-mentor
 *   - the person who requested it stays, as the role they actually held
 *
 * Nothing is removed. A mentor already in the standing clan is demoted from
 * lead to co-mentor where the source clan says so, but never dropped — they
 * asked for this clan and they belong in it. Mentees are untouched.
 *
 * Requires 119 to have run: without `source_clan_id` there is nothing to align
 * to, and those clans are skipped rather than guessed at.
 *
 * Idempotent.
 *
 * Run:      node server/scripts/migrations/120_realign_standing_mentor_team.js
 * Preview:  node server/scripts/migrations/120_realign_standing_mentor_team.js --dry-run
 */
const sequelize = require('./_db');

/**
 * Standing clans, the source clan they continue, and who leads each side.
 * `suspended` mentors are not made lead of anything.
 */
const PAIRS = `
  SELECT sc.id                AS standing_id,
         sc.name              AS standing_name,
         sc.lead_mentor_id    AS standing_lead,
         src.id               AS source_id,
         src.name             AS source_name,
         r.mentor_id          AS requested_by,
         (SELECT cm.user_id
            FROM clan_memberships cm
            JOIN users u ON u.id = cm.user_id AND u.status <> 'suspended'
           WHERE cm.clan_id = src.id AND cm.role = 'lead_mentor' AND cm.status = 'active'
           LIMIT 1)           AS source_lead
    FROM standing_clan_requests r
    JOIN clans sc  ON sc.id = r.created_clan_id AND sc.kind = 'standing'
    JOIN clans src ON src.id = r.source_clan_id
   WHERE r.status = 'approved'
     AND r.source_clan_id IS NOT NULL`;

async function run({ dryRun }) {
  console.log(dryRun ? '=== DRY RUN ===\n' : '▶ Running migration 120: realign standing mentor teams\n');

  const [cols] = await sequelize.query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_name = 'standing_clan_requests' AND column_name = 'source_clan_id'`);
  if (!cols.length) {
    console.log('source_clan_id is missing — run migration 119 first. Nothing done.');
    return;
  }

  const [pairs] = await sequelize.query(PAIRS);
  if (!pairs.length) {
    console.log('No approved standing clan has a source clan to align to.');
    return;
  }

  const wrong = pairs.filter(p => p.source_lead && p.standing_lead !== p.source_lead);
  console.log(`${pairs.length} standing clan(s) with a known source; ${wrong.length} with the wrong lead:`);
  console.table(pairs.map(p => ({
    standing: p.standing_name,
    source: p.source_name,
    lead_now: p.standing_lead,
    lead_should_be: p.source_lead || '(source has no active lead — left alone)',
    needs_fix: Boolean(p.source_lead && p.standing_lead !== p.source_lead),
  })));

  if (dryRun) {
    console.log('\nRe-run without --dry-run to apply.');
    return;
  }

  let promoted = 0;
  let joined = 0;
  for (const pair of pairs) {
    if (!pair.source_lead) continue;

    await sequelize.transaction(async (transaction) => {
      const opts = { transaction };

      if (pair.standing_lead !== pair.source_lead) {
        // Whoever was holding lead here keeps their place as a co-mentor.
        if (pair.standing_lead) {
          await sequelize.query(`
            UPDATE clan_memberships SET role = 'co_mentor', updated_at = NOW()
             WHERE clan_id = :clan AND user_id = :user AND role = 'lead_mentor'`,
          { replacements: { clan: pair.standing_id, user: pair.standing_lead }, ...opts });
        }
        await sequelize.query(
          'UPDATE clans SET lead_mentor_id = :lead, updated_at = NOW() WHERE id = :clan',
          { replacements: { lead: pair.source_lead, clan: pair.standing_id }, ...opts });
        promoted += 1;
      }

      // The source clan's whole mentor team belongs here, the lead as lead.
      const [team] = await sequelize.query(`
        SELECT cm.user_id, cm.role FROM clan_memberships cm
         JOIN users u ON u.id = cm.user_id AND u.status <> 'suspended'
        WHERE cm.clan_id = :src AND cm.role IN ('lead_mentor','co_mentor') AND cm.status = 'active'`,
      { replacements: { src: pair.source_id }, ...opts });

      for (const member of team) {
        const role = member.user_id === pair.source_lead ? 'lead_mentor' : 'co_mentor';
        const [existing] = await sequelize.query(
          `SELECT id, role, status FROM clan_memberships
            WHERE clan_id = :clan AND user_id = :user AND role IN ('lead_mentor','co_mentor') LIMIT 1`,
          { replacements: { clan: pair.standing_id, user: member.user_id }, ...opts });

        if (!existing.length) {
          await sequelize.query(`
            INSERT INTO clan_memberships (id, organization_id, clan_id, user_id, role, status, joined_at, created_at, updated_at)
            SELECT gen_random_uuid(), c.organization_id, :clan, :user, :role, 'active', NOW(), NOW(), NOW()
              FROM clans c WHERE c.id = :clan`,
          { replacements: { clan: pair.standing_id, user: member.user_id, role }, ...opts });
          joined += 1;
        } else if (existing[0].role !== role || existing[0].status !== 'active') {
          await sequelize.query(
            `UPDATE clan_memberships SET role = :role, status = 'active', updated_at = NOW() WHERE id = :id`,
            { replacements: { role, id: existing[0].id }, ...opts });
        }
      }
    });
  }

  console.log(`\n✓ ${promoted} clan(s) handed back to their source lead; ${joined} mentor membership(s) added.`);

  const [after] = await sequelize.query(PAIRS);
  const stillWrong = after.filter(p => p.source_lead && p.standing_lead !== p.source_lead);
  console.log(`Still mismatched: ${stillWrong.length} (expected 0).`);
}

async function up(opts = {}) { return run({ dryRun: Boolean(opts.dryRun) }); }
async function down() {
  throw new Error('Realigning mentor roles cannot be reversed automatically; restore a reviewed backup instead');
}

module.exports = { up, down };

if (require.main === module) {
  (process.argv.includes('--rollback') ? down() : up({ dryRun: process.argv.includes('--dry-run') }))
    .catch((error) => { console.error('Migration failed:', error.message); process.exitCode = 1; })
    .finally(() => sequelize.close());
}
