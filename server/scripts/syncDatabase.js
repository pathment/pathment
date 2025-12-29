require('dotenv').config();
const { sequelize, models } = require('../src/db');

/**
 * Sync Database Script
 * Creates all tables based on Sequelize models
 * Use this for development/initial setup
 */

async function syncDatabase() {
  try {
    console.log('Starting database sync...\n');

    // Test connection
    await sequelize.authenticate();
    console.log('✓ Database connection established\n');

    // Show all models that will be synced
    console.log('Models to be synced:');
    Object.keys(models).forEach(modelName => {
      console.log(`  - ${modelName}`);
    });
    console.log('');

    // Sync all models
    // Options:
    // { force: true }  - Drops tables if they exist, then creates them (WARNING: Data loss!)
    // { alter: true }  - Tries to alter existing tables to match models (safer)
    // { }              - Creates tables only if they don't exist (safest)

    const syncOptions = process.argv.includes('--force') 
      ? { force: true } 
      : process.argv.includes('--alter')
      ? { alter: true }
      : {};

    if (syncOptions.force) {
      console.log('⚠️  WARNING: Using --force option. This will DROP all existing tables!\n');
      await new Promise(resolve => setTimeout(resolve, 2000)); // Give time to cancel
    }

    await sequelize.sync(syncOptions);

    if (syncOptions.force) {
      console.log('\n✓ All tables dropped and recreated successfully');
    } else if (syncOptions.alter) {
      console.log('\n✓ Tables altered to match models');
    } else {
      console.log('\n✓ Tables created successfully (existing tables preserved)');
    }

    console.log('\nDatabase sync completed!');
    console.log('\nUsage:');
    console.log('  node scripts/syncDatabase.js           # Create tables (safe)');
    console.log('  node scripts/syncDatabase.js --alter   # Alter existing tables');
    console.log('  node scripts/syncDatabase.js --force   # Drop and recreate (DANGER!)');

    process.exit(0);
  } catch (error) {
    console.error('✗ Error syncing database:', error);
    process.exit(1);
  }
}

syncDatabase();
