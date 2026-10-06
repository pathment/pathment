const { Sequelize } = require('sequelize');
const sequelize = require('./_db');

async function tableExists(t) {
  const [rows] = await sequelize.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=:table`,
    { replacements: { table: t }, type: Sequelize.QueryTypes.SELECT }
  );
  return Boolean(rows);
}

async function up() {
  if (!await tableExists('talk_categories')) {
    await sequelize.query(`
      CREATE TABLE talk_categories (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        name             VARCHAR(100) NOT NULL,
        name_key         VARCHAR(100) NOT NULL,
        created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await sequelize.query(
      'CREATE UNIQUE INDEX talk_categories_org_name_key_uniq ON talk_categories (organization_id, name_key)'
    );
    console.log('Created table talk_categories');
  }

  if (!await tableExists('talks')) {
    await sequelize.query(`
      CREATE TABLE talks (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        title            VARCHAR(255) NOT NULL,
        speaker          VARCHAR(150),
        description      TEXT,
        url              TEXT NOT NULL,
        url_key          VARCHAR(1000) NOT NULL,
        duration_mins    INTEGER,
        uploaded_by      UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await sequelize.query('CREATE UNIQUE INDEX talks_org_url_key_uniq ON talks (organization_id, url_key)');
    await sequelize.query('CREATE INDEX talks_org_created_idx ON talks (organization_id, created_at DESC)');
    console.log('Created table talks');
  }

  if (!await tableExists('talk_category_links')) {
    await sequelize.query(`
      CREATE TABLE talk_category_links (
        talk_id      UUID NOT NULL REFERENCES talks(id) ON DELETE CASCADE,
        category_id  UUID NOT NULL REFERENCES talk_categories(id) ON DELETE RESTRICT,
        PRIMARY KEY (talk_id, category_id)
      )
    `);
    await sequelize.query('CREATE INDEX talk_category_links_category_idx ON talk_category_links (category_id)');
    console.log('Created table talk_category_links');
  }
}

async function down() {
  await sequelize.query('DROP TABLE IF EXISTS talk_category_links');
  await sequelize.query('DROP TABLE IF EXISTS talks');
  await sequelize.query('DROP TABLE IF EXISTS talk_categories');
  console.log('Rollback complete');
}

module.exports = { up, down };

if (require.main === module) {
  up()
    .catch(error => { console.error(error); process.exitCode = 1; })
    .finally(() => sequelize.close());
}
