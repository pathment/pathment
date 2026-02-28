/**
 * Migration: Add pg_trgm GIN indexes for fast case-insensitive search
 *
 * Enables the pg_trgm extension and creates GIN indexes on the columns
 * used in enrollment search (mentee first_name, last_name, email and
 * program name). After this migration, ILIKE '%term%' queries on these
 * columns use an index instead of a full sequential scan.
 *
 * Run:      node scripts/migrations/002_add_trgm_search_indexes.js
 * Rollback: node scripts/migrations/002_add_trgm_search_indexes.js --rollback
 */

require('dotenv').config();
const { sequelize } = require('../../src/db');

async function up() {
  console.log('Running migration: Add pg_trgm GIN search indexes...');

  try {
    // Enable the extension (safe to run multiple times)
    await sequelize.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`);
    console.log('  ✅ pg_trgm extension enabled');

    // GIN indexes on users table (mentee/mentor search)
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_users_first_name_trgm
        ON users USING GIN (first_name gin_trgm_ops);
    `);
    console.log('  ✅ Index: users.first_name');

    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_users_last_name_trgm
        ON users USING GIN (last_name gin_trgm_ops);
    `);
    console.log('  ✅ Index: users.last_name');

    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_users_email_trgm
        ON users USING GIN (email gin_trgm_ops);
    `);
    console.log('  ✅ Index: users.email');

    // GIN index on programs table
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_programs_name_trgm
        ON programs USING GIN (name gin_trgm_ops);
    `);
    console.log('  ✅ Index: programs.name');

    console.log('\n✅ Migration completed — ILIKE search is now index-backed.');
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  }
}

async function down() {
  console.log('Rolling back migration: Remove pg_trgm GIN indexes...');

  try {
    await sequelize.query(`DROP INDEX IF EXISTS idx_users_first_name_trgm;`);
    await sequelize.query(`DROP INDEX IF EXISTS idx_users_last_name_trgm;`);
    await sequelize.query(`DROP INDEX IF EXISTS idx_users_email_trgm;`);
    await sequelize.query(`DROP INDEX IF EXISTS idx_programs_name_trgm;`);

    // Note: we do NOT drop the pg_trgm extension here because other parts
    // of the database may rely on it. Drop manually if you are sure:
    //   DROP EXTENSION IF EXISTS pg_trgm;
    console.log('✅ Rollback completed — indexes removed.');
  } catch (error) {
    console.error('❌ Rollback failed:', error.message);
    throw error;
  }
}

// Run migration
if (require.main === module) {
  const args = process.argv.slice(2);
  const isRollback = args.includes('--rollback') || args.includes('-r');

  (async () => {
    try {
      if (isRollback) {
        await down();
      } else {
        await up();
      }
      process.exit(0);
    } catch (error) {
      console.error(error);
      process.exit(1);
    }
  })();
}

module.exports = { up, down };
