require('dotenv').config();
const { sequelize } = require('../src/db');

async function checkTables() {
  try {
    await sequelize.authenticate();
    console.log('✓ Database connection successful\n');

    // Query to get all tables
    const [tables] = await sequelize.query(`
      SELECT 
        tablename,
        schemaname
      FROM pg_tables 
      WHERE schemaname = 'public' 
      ORDER BY tablename;
    `);

    console.log(`📊 Found ${tables.length} tables in database:\n`);
    
    tables.forEach((table, index) => {
      console.log(`${(index + 1).toString().padStart(2)}. ${table.tablename}`);
    });

    console.log('\n✅ Check complete\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkTables();
