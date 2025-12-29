require('dotenv').config();
const { sequelize } = require('../src/db');

/**
 * Reset Database Script
 * Drops all tables and recreates them
 * ⚠️ WARNING: This will DELETE ALL DATA!
 */

async function resetDatabase() {
  try {
    console.log('⚠️  WARNING: This will DROP ALL TABLES and DELETE ALL DATA!\n');
    console.log('Waiting 3 seconds... Press Ctrl+C to cancel\n');
    
    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log('🔄 Starting database reset...\n');

    // Test connection
    await sequelize.authenticate();
    console.log('✓ Database connection established\n');

    // Drop all tables
    console.log('Dropping all tables...');
    await sequelize.drop();
    console.log('✓ All tables dropped\n');

    // Recreate all tables
    console.log('Creating tables...');
    await sequelize.sync({ force: true });
    console.log('✓ All tables recreated\n');

    console.log('✅ Database reset completed successfully!\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error resetting database:', error);
    process.exit(1);
  }
}

resetDatabase();
