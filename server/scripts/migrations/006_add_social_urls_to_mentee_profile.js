/**
 * Migration: 006_add_social_urls_to_mentee_profile
 * 
 * Adds LinkedIn, GitHub, and Portfolio URL fields to the mentee_profiles table
 * These fields allow mentees to add their professional profile links
 *
 * Run manually:
 *   node server/scripts/migrations/006_add_social_urls_to_mentee_profile.js
 *
 * Rollback:
 *   node server/scripts/migrations/006_add_social_urls_to_mentee_profile.js --rollback
 */

const { Sequelize } = require('sequelize');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const sequelize = new Sequelize(process.env.DATABASE_URL, { logging: false });

async function up() {
  const qi = sequelize.getQueryInterface();

  console.log('▶ Running migration 006: Add social URLs to mentee_profiles table');

  try {
    // Add the three new columns to mentee_profiles table
    await qi.addColumn('mentee_profiles', 'linkedin_url', {
      type: Sequelize.STRING(255),
      allowNull: true,
      defaultValue: null
    });
    console.log('  ✓ Added linkedin_url column');

    await qi.addColumn('mentee_profiles', 'github_url', {
      type: Sequelize.STRING(255),
      allowNull: true,
      defaultValue: null
    });
    console.log('  ✓ Added github_url column');

    await qi.addColumn('mentee_profiles', 'portfolio_url', {
      type: Sequelize.STRING(255),
      allowNull: true,
      defaultValue: null
    });
    console.log('  ✓ Added portfolio_url column');

    console.log('✅ Migration 006 complete');
    console.log('   - linkedin_url column added to mentee_profiles');
    console.log('   - github_url column added to mentee_profiles');
    console.log('   - portfolio_url column added to mentee_profiles');
  } catch (error) {
    if (error.message && error.message.includes('already exists')) {
      console.log('  ℹ Columns already exist, skipping');
      return;
    }
    throw error;
  }
}

async function down() {
  const qi = sequelize.getQueryInterface();

  console.log('▶ Rolling back migration 006: Remove social URLs from mentee_profiles table');

  try {
    await qi.removeColumn('mentee_profiles', 'linkedin_url');
    console.log('  ✓ Removed linkedin_url column');

    await qi.removeColumn('mentee_profiles', 'github_url');
    console.log('  ✓ Removed github_url column');

    await qi.removeColumn('mentee_profiles', 'portfolio_url');
    console.log('  ✓ Removed portfolio_url column');

    console.log('✅ Rollback 006 complete');
  } catch (error) {
    if (error.message && error.message.includes('does not exist')) {
      console.log('  ℹ Columns do not exist, skipping');
      return;
    }
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
      console.error('❌ Migration failed:', error.message);
      process.exit(1);
    }
  })();
}

module.exports = { up, down };