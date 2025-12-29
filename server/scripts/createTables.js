require('dotenv').config();
const { sequelize, models } = require('../src/db');

/**
 * Create Tables Script
 * Creates all database tables in the correct order based on dependencies
 */

async function createTables() {
  try {
    console.log('🚀 Starting table creation...\n');

    // Test connection
    await sequelize.authenticate();
    console.log('✓ Database connection established');
    console.log(`✓ Database: ${sequelize.config.database}\n`);

    // List all models
    const modelNames = Object.keys(models);
    console.log(`Found ${modelNames.length} models:\n`);
    
    // Group models by category
    const categories = {};
    modelNames.forEach(name => {
      const model = models[name];
      const tableName = model.tableName || model.getTableName();
      const category = model.options?.category || 'Other';
      
      if (!categories[category]) categories[category] = [];
      categories[category].push({ name, tableName });
    });

    // Display by category
    Object.keys(categories).sort().forEach(category => {
      console.log(`📁 ${category}:`);
      categories[category].forEach(({ name, tableName }) => {
        console.log(`   • ${name} → ${tableName}`);
      });
      console.log('');
    });

    // Confirm before proceeding
    console.log('Creating tables...\n');

    // Create tables (preserves existing data)
    await sequelize.sync({ force: false });

    console.log('✅ All tables created successfully!\n');

    // Show created tables
    const [results] = await sequelize.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public' 
      ORDER BY tablename;
    `);

    console.log('📊 Database tables:');
    results.forEach(({ tablename }) => {
      console.log(`   ✓ ${tablename}`);
    });

    console.log(`\n✅ Total: ${results.length} tables created\n`);

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error creating tables:', error);
    console.error('\nDetails:', error.message);
    process.exit(1);
  }
}

createTables();
