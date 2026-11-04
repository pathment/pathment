const { Sequelize } = require('sequelize');
const sequelize = require('./_db');

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
        thumbnail_url    TEXT,
        duration_mins    INTEGER,
        rating           NUMERIC(3,2) NOT NULL DEFAULT 0,
        ratings_count    INTEGER NOT NULL DEFAULT 0,
        uploaded_by      UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await sequelize.query('CREATE UNIQUE INDEX talks_org_url_key_uniq ON talks (organization_id, url_key)');
    await sequelize.query('CREATE INDEX talks_org_created_idx ON talks (organization_id, created_at DESC)');
    console.log('Created table talks');
  } else {
    if (!await columnExists('talks', 'thumbnail_url')) {
      await sequelize.query('ALTER TABLE talks ADD COLUMN thumbnail_url TEXT');
    }
    if (!await columnExists('talks', 'rating')) {
      await sequelize.query('ALTER TABLE talks ADD COLUMN rating NUMERIC(3,2) NOT NULL DEFAULT 0');
    }
    if (!await columnExists('talks', 'ratings_count')) {
      await sequelize.query('ALTER TABLE talks ADD COLUMN ratings_count INTEGER NOT NULL DEFAULT 0');
    }
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

  if (!await tableExists('talk_reviews')) {
    await sequelize.query(`
      CREATE TABLE talk_reviews (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        talk_id          UUID NOT NULL REFERENCES talks(id) ON DELETE CASCADE,
        user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        rating           INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
        feedback         TEXT,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (talk_id, user_id)
      )
    `);
    await sequelize.query('CREATE INDEX talk_reviews_talk_idx ON talk_reviews (talk_id)');
    console.log('Created table talk_reviews');
  }

  if (await tableExists('assigned_tasks') && !await columnExists('assigned_tasks', 'talk_ids')) {
    await sequelize.query('ALTER TABLE assigned_tasks ADD COLUMN talk_ids UUID[] DEFAULT \'{}\'');
    console.log('Added column assigned_tasks.talk_ids');
  }

  if (await tableExists('roadmap_tasks')) {
    if (!await columnExists('roadmap_tasks', 'talk_ids')) {
      await sequelize.query('ALTER TABLE roadmap_tasks ADD COLUMN talk_ids UUID[] DEFAULT \'{}\'');
      console.log('Added column roadmap_tasks.talk_ids');
    }
    // Preserve every value admitted by the current constraint. This migration
    // may still be pending where a later schema was created by db:sync, and a
    // historical hardcoded list must not reject newer values.
    const [constraint] = await sequelize.query(`
      SELECT pg_get_constraintdef(oid) AS definition
        FROM pg_constraint
       WHERE conrelid = 'roadmap_tasks'::regclass
         AND conname = 'roadmap_tasks_type_check'`,
      { type: Sequelize.QueryTypes.SELECT });
    const admitted = constraint
      ? [...constraint.definition.matchAll(/'([a-z_]+)'::/g)].map((match) => match[1])
      : [];
    const types = [...new Set([...admitted, 'talk'])];
    if (!types.length) throw new Error('Could not determine roadmap task types');
    const quoted = types.map((type) => sequelize.escape(type)).join(', ');
    await sequelize.query(`
      ALTER TABLE roadmap_tasks DROP CONSTRAINT IF EXISTS "roadmap_tasks_type_check";
      ALTER TABLE roadmap_tasks ADD CONSTRAINT "roadmap_tasks_type_check"
        CHECK (type IN (${quoted}))
    `);
  }
}

async function down() {
  await sequelize.query('ALTER TABLE assigned_tasks DROP COLUMN IF EXISTS talk_ids');
  await sequelize.query('ALTER TABLE roadmap_tasks DROP COLUMN IF EXISTS talk_ids');
  await sequelize.query('DROP TABLE IF EXISTS talk_reviews');
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
