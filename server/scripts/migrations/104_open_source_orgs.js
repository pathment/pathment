const { Sequelize } = require('sequelize');
const sequelize = require('./_db');

const TABLE = 'open_source_orgs';
const TASK_COL = 'open_source_org_ids';
const UNIQ_IDX = 'open_source_orgs_name_lower_uniq';

async function tableExists(t) {
  const [rows] = await sequelize.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=:table`,
    { replacements: { table: t }, type: Sequelize.QueryTypes.SELECT }
  );
  return Boolean(rows);
}

async function columnExists(table, col) {
  const [rows] = await sequelize.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=:table AND column_name=:col`,
    { replacements: { table, col }, type: Sequelize.QueryTypes.SELECT }
  );
  return Boolean(rows);
}

async function up() {
  if (!await tableExists(TABLE)) {
    await sequelize.query(`
      CREATE TABLE ${TABLE} (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name        VARCHAR(255) NOT NULL,
        url         VARCHAR(1000) NOT NULL,
        created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await sequelize.query(`CREATE UNIQUE INDEX ${UNIQ_IDX} ON ${TABLE} (lower(name))`);
    console.log(`Created table ${TABLE}`);
  }

  if (!await columnExists('assigned_tasks', TASK_COL)) {
    await sequelize.query(`ALTER TABLE assigned_tasks ADD COLUMN ${TASK_COL} UUID[] DEFAULT '{}'`);
    console.log(`Added column assigned_tasks.${TASK_COL}`);
  }

  if (!await columnExists('roadmap_tasks', TASK_COL)) {
    await sequelize.query(`ALTER TABLE roadmap_tasks ADD COLUMN ${TASK_COL} UUID[] DEFAULT '{}'`);
    console.log(`Added column roadmap_tasks.${TASK_COL}`);
  }

  await sequelize.query(`
    ALTER TABLE roadmap_tasks DROP CONSTRAINT IF EXISTS "roadmap_tasks_type_check";
    ALTER TABLE roadmap_tasks ADD CONSTRAINT "roadmap_tasks_type_check"
      CHECK (type IN ('reading','video','exercise','project','quiz','discussion','practical','assessment','custom','assignment','interview','open_source'))
  `);
  console.log('Updated roadmap_tasks type constraint');
}

async function down() {
  await sequelize.query(`ALTER TABLE assigned_tasks DROP COLUMN IF EXISTS ${TASK_COL}`);
  await sequelize.query(`ALTER TABLE roadmap_tasks DROP COLUMN IF EXISTS ${TASK_COL}`);
  await sequelize.query(`DROP TABLE IF EXISTS ${TABLE}`);
  await sequelize.query(`
    ALTER TABLE roadmap_tasks DROP CONSTRAINT IF EXISTS "roadmap_tasks_type_check";
    ALTER TABLE roadmap_tasks ADD CONSTRAINT "roadmap_tasks_type_check"
      CHECK (type IN ('reading','video','exercise','project','quiz','discussion','practical','assessment','custom','assignment','interview'))
  `);
  console.log('Rollback complete');
}

module.exports = { up, down };
