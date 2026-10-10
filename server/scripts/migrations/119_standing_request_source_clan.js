/**
 * Migration: 119_standing_request_source_clan
 *
 * A standing clan belongs to the clan it grew out of, not to the programme.
 *
 * `standing_clan_requests` was keyed on (mentor, programme), with a unique
 * index allowing one pending request per mentor per programme. That silently
 * assumed a mentor runs one clan in a programme. They do not: a lead mentor of
 * "Viral Loop Clan 2026" who is also co-mentor of "Core Team 2026" mentors two
 * clans inside "Full Stack AI Engineering".
 *
 * So requesting a standing clan from Core Team made the banner read "Standing
 * clan requested" on Viral Loop as well — one request, shown against both — and
 * the unique index meant the second clan could never get its own. The clans are
 * separate groups of people doing separate work; their continuations are too.
 *
 * `source_clan_id` records which clan the request came from, and the pending
 * uniqueness moves to (mentor, source clan).
 *
 * BACKFILL. Existing rows predate the column. Where the mentor mentors exactly
 * one cohort clan in that programme there is no ambiguity, so it is filled in.
 * Otherwise the request name is matched against their clan names — the form
 * pre-fills "<clan name> · Standing", so "Core Team 2026 · Standing" names its
 * own origin. Anything still ambiguous is left NULL and reported rather than
 * guessed: a wrong source clan would hide the banner on the clan that needs it
 * and show it on one that does not, which is the bug this is fixing.
 *
 * A NULL source behaves as it did before — programme-wide — so legacy rows keep
 * working, and the partial unique index ignores them (Postgres treats NULLs as
 * distinct), which is correct: we do not know what they conflict with.
 *
 * Idempotent.
 *
 * Run:      node server/scripts/migrations/119_standing_request_source_clan.js
 * Preview:  node server/scripts/migrations/119_standing_request_source_clan.js --dry-run
 * Rollback: node server/scripts/migrations/119_standing_request_source_clan.js --rollback
 */
const sequelize = require('./_db');

const TABLE = 'standing_clan_requests';

async function columnExists(column) {
  const [rows] = await sequelize.query(
    'SELECT 1 FROM information_schema.columns WHERE table_name = :t AND column_name = :c',
    { replacements: { t: TABLE, c: column } },
  );
  return rows.length > 0;
}

/**
 * Candidate source clans for each request: the cohort clans the mentor actually
 * mentors inside that request's programme.
 */
const CANDIDATES = `
  SELECT r.id            AS request_id,
         r.name          AS request_name,
         r.mentor_id,
         c.id            AS clan_id,
         c.name          AS clan_name
    FROM ${TABLE} r
    JOIN clan_memberships cm
      ON cm.user_id = r.mentor_id
     AND cm.status = 'active'
     AND cm.role IN ('lead_mentor', 'co_mentor', 'mentor')
    JOIN clans c
      ON c.id = cm.clan_id
     AND c.program_id = r.program_id
     AND c.kind = 'cohort'
   WHERE r.source_clan_id IS NULL`;

/**
 * The resolution: unambiguous when the mentor has one candidate clan, or when
 * exactly one candidate's name prefixes the request name.
 */
const RESOLVED = `
  WITH candidates AS (${CANDIDATES}),
  counted AS (
    SELECT request_id, COUNT(*)::int AS n FROM candidates GROUP BY request_id
  ),
  named AS (
    SELECT c.request_id, COUNT(*)::int AS n
      FROM candidates c
     WHERE c.request_name ILIKE c.clan_name || '%'
     GROUP BY c.request_id
  )
  SELECT c.request_id,
         c.clan_id,
         c.clan_name,
         c.request_name,
         CASE WHEN counted.n = 1 THEN 'only clan they mentor'
              ELSE 'request name matches the clan name' END AS reason
    FROM candidates c
    JOIN counted ON counted.request_id = c.request_id
    LEFT JOIN named ON named.request_id = c.request_id
   WHERE counted.n = 1
      OR (named.n = 1 AND c.request_name ILIKE c.clan_name || '%')`;

async function up({ dryRun = false } = {}) {
  console.log(dryRun ? '=== DRY RUN ===\n' : '▶ Running migration 119: standing request source clan\n');

  if (await columnExists('source_clan_id')) {
    console.log(`  ℹ ${TABLE}.source_clan_id exists, skipping add`);
  } else if (!dryRun) {
    await sequelize.query(
      `ALTER TABLE ${TABLE} ADD COLUMN source_clan_id UUID REFERENCES clans(id) ON DELETE SET NULL`);
    console.log('  ✓ Added source_clan_id');
  } else {
    console.log('  would add source_clan_id — nothing else can be previewed until it exists');
    return;
  }

  const [resolved] = await sequelize.query(RESOLVED);
  console.log(`\nBackfill — ${resolved.length} request(s) resolved:`);
  if (resolved.length) console.table(resolved);

  if (!dryRun && resolved.length) {
    await sequelize.query(`
      UPDATE ${TABLE} r
         SET source_clan_id = x.clan_id, updated_at = NOW()
        FROM (${RESOLVED}) x
       WHERE r.id = x.request_id AND r.source_clan_id IS NULL`);
    console.log(`  ✓ Backfilled ${resolved.length} row(s)`);
  }

  const [unresolved] = await sequelize.query(`
    SELECT r.id, r.name, r.status, u.email AS mentor
      FROM ${TABLE} r LEFT JOIN users u ON u.id = r.mentor_id
     WHERE r.source_clan_id IS NULL`);
  if (unresolved.length) {
    console.log(`\n${unresolved.length} request(s) left WITHOUT a source clan — ambiguous, not guessed:`);
    console.table(unresolved);
    console.log('These keep the old programme-wide behaviour. A mentor can withdraw and re-request');
    console.log('from the clan they mean, which will record the source properly.');
  } else {
    console.log('\nEvery request has a source clan.');
  }

  if (dryRun) {
    console.log('\nRe-run without --dry-run to apply.');
    return;
  }

  // Pending uniqueness moves from the programme to the clan.
  await sequelize.query('DROP INDEX IF EXISTS standing_request_pending_unique');
  await sequelize.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS standing_request_pending_clan_unique
      ON ${TABLE} (mentor_id, source_clan_id)
     WHERE status = 'pending' AND source_clan_id IS NOT NULL`);
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS standing_request_source_clan
      ON ${TABLE} (source_clan_id, status)`);
  console.log('  ✓ Pending uniqueness is now per source clan');
}

async function down() {
  await sequelize.query('DROP INDEX IF EXISTS standing_request_pending_clan_unique');
  await sequelize.query('DROP INDEX IF EXISTS standing_request_source_clan');
  await sequelize.query(`ALTER TABLE ${TABLE} DROP COLUMN IF EXISTS source_clan_id`);
  await sequelize.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS standing_request_pending_unique
      ON ${TABLE} (mentor_id, program_id) WHERE status = 'pending'`);
  console.log('  ✓ Reverted 119');
}

module.exports = { up, down };

if (require.main === module) {
  (process.argv.includes('--rollback')
    ? down()
    : up({ dryRun: process.argv.includes('--dry-run') }))
    .catch((error) => { console.error('Migration failed:', error.message); process.exitCode = 1; })
    .finally(() => sequelize.close());
}
