'use strict';

/**
 * Scoped badges (workspace / program / clan) — additive, preserves existing awards.
 *
 * 1) badges.earning_scope SMALLINT NOT NULL DEFAULT 0 (0=workspace, 1=program, 2=clan)
 * 2) user_badges.program_id / clan_id nullable FKs
 * 3) Replace UNIQUE(user_id, badge_id) [and org-prefixed variants] with
 *    UNIQUE (user_id, badge_id, COALESCE(clan_id, program_id, badge_id))
 *
 * The expression unique index is built CONCURRENTLY outside a transaction.
 * Safe for large user_badges tables; requires disk headroom for index build.
 */

async function up({ db = require('./_db') } = {}) {
  await db.transaction(async (transaction) => {
    const q = (sql) => db.query(sql, { transaction });

    await q(`
      ALTER TABLE badges
        ADD COLUMN IF NOT EXISTS earning_scope SMALLINT NOT NULL DEFAULT 0
    `);
    await q(`
      DO $$ BEGIN
        ALTER TABLE badges
          ADD CONSTRAINT badges_earning_scope_check
          CHECK (earning_scope IN (0, 1, 2));
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);

    await q(`
      ALTER TABLE user_badges
        ADD COLUMN IF NOT EXISTS program_id UUID NULL,
        ADD COLUMN IF NOT EXISTS clan_id UUID NULL
    `);

    await q(`
      DO $$ BEGIN
        ALTER TABLE user_badges
          ADD CONSTRAINT user_badges_program_id_fkey
          FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE RESTRICT;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);
    await q(`
      DO $$ BEGIN
        ALTER TABLE user_badges
          ADD CONSTRAINT user_badges_clan_id_fkey
          FOREIGN KEY (clan_id) REFERENCES clans(id) ON DELETE RESTRICT;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);

    await q(`
      DO $$ BEGIN
        ALTER TABLE user_badges
          ADD CONSTRAINT user_badges_scope_context_check
          CHECK (
            (program_id IS NULL AND clan_id IS NULL)
            OR (program_id IS NOT NULL AND clan_id IS NULL)
            OR (clan_id IS NOT NULL)
          );
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);

    // Drop every unique constraint/index that enforces one award per (user, badge).
    const [oldUniques] = await db.query(`
      SELECT c.conname AS name, 'constraint' AS kind
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      WHERE t.relname = 'user_badges'
        AND c.contype = 'u'
        AND pg_get_constraintdef(c.oid) ILIKE '%user_id%'
        AND pg_get_constraintdef(c.oid) ILIKE '%badge_id%'
      UNION ALL
      SELECT i.relname AS name, 'index' AS kind
      FROM pg_index x
      JOIN pg_class i ON i.oid = x.indexrelid
      JOIN pg_class t ON t.oid = x.indrelid
      WHERE t.relname = 'user_badges'
        AND x.indisunique
        AND NOT x.indisprimary
        AND pg_get_indexdef(x.indexrelid) ILIKE '%user_id%'
        AND pg_get_indexdef(x.indexrelid) ILIKE '%badge_id%'
        AND pg_get_indexdef(x.indexrelid) NOT ILIKE '%coalesce%'
    `, { transaction });

    for (const row of oldUniques || []) {
      if (row.kind === 'constraint') {
        await q(`ALTER TABLE user_badges DROP CONSTRAINT IF EXISTS "${row.name}"`);
      } else {
        await q(`DROP INDEX IF EXISTS "${row.name}"`);
      }
    }
  });

  // CONCURRENTLY cannot run inside a transaction.
  await db.query(`
    CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS user_badges_once_per_context
    ON user_badges (
      user_id,
      badge_id,
      (COALESCE(clan_id, program_id, badge_id))
    )
  `);
}

async function down({ db = require('./_db') } = {}) {
  await db.query('DROP INDEX CONCURRENTLY IF EXISTS user_badges_once_per_context');
  await db.transaction(async (transaction) => {
    const q = (sql) => db.query(sql, { transaction });
    await q('ALTER TABLE user_badges DROP CONSTRAINT IF EXISTS user_badges_scope_context_check');
    await q('ALTER TABLE user_badges DROP CONSTRAINT IF EXISTS user_badges_clan_id_fkey');
    await q('ALTER TABLE user_badges DROP CONSTRAINT IF EXISTS user_badges_program_id_fkey');
    await q('ALTER TABLE user_badges DROP COLUMN IF EXISTS clan_id');
    await q('ALTER TABLE user_badges DROP COLUMN IF EXISTS program_id');
    await q('ALTER TABLE badges DROP CONSTRAINT IF EXISTS badges_earning_scope_check');
    await q('ALTER TABLE badges DROP COLUMN IF EXISTS earning_scope');
    await q(`
      CREATE UNIQUE INDEX IF NOT EXISTS user_badges_user_id_badge_id
      ON user_badges (user_id, badge_id)
    `);
  });
}

module.exports = { up, down };

if (require.main === module) {
  const db = require('./_db');
  (process.argv.includes('--rollback') ? down({ db }) : up({ db }))
    .catch((error) => { console.error(error.message); process.exitCode = 1; })
    .finally(() => db.close());
}
