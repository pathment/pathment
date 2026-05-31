require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { sequelize } = require('../../src/db');

async function up() {
  console.log('Running migration: Create task_templates table...');

  try {
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS task_templates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        mentor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        type VARCHAR(20) NOT NULL DEFAULT 'custom',
        difficulty VARCHAR(20) NOT NULL DEFAULT 'medium',
        deliverable TEXT,
        acceptance_criteria TEXT[] DEFAULT '{}',
        estimated_hours INTEGER DEFAULT 5,
        points_base INTEGER DEFAULT 10,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_task_templates_mentor_id ON task_templates(mentor_id);
    `);

    console.log('Migration completed successfully!');
    console.log('   - Created task_templates table');
    console.log('   - Added mentor_id index');
  } catch (error) {
    console.error('Migration failed:', error.message);
    throw error;
  }
}

async function down() {
  console.log('Rolling back migration: Drop task_templates table...');

  try {
    await sequelize.query(`DROP TABLE IF EXISTS task_templates CASCADE;`);
    console.log('Rollback completed successfully!');
  } catch (error) {
    console.error('Rollback failed:', error.message);
    throw error;
  }
}

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
