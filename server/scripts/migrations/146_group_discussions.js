const { Sequelize } = require('sequelize');
const sequelize = require('./_db');

/**
 * Group discussions: mentees talking a scenario through in a shared chat.
 *
 * A scenario is the prompt, a group is the people discussing it, and one
 * scenario can have many groups. There is no message table here on purpose: a
 * group owns one row in `conversations` (type 'group'), so messages, reactions,
 * attachments and read positions all live where they already do and the chat
 * stays one system rather than two. The members ARE the conversation's
 * participants, for the same reason.
 *
 * Deleting a group is an explicit, mentor-only act handled by the service,
 * because the conversation tables do not cascade. Assigned tasks survive it:
 * `discussion_group_id` goes back to null and the task stays with the mentee.
 */

async function tableExists(name) {
  const [rows] = await sequelize.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=:name`,
    { replacements: { name }, type: Sequelize.QueryTypes.SELECT },
  );
  return Boolean(rows);
}

async function columnExists(table, column) {
  const [rows] = await sequelize.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=:table AND column_name=:column`,
    { replacements: { table, column }, type: Sequelize.QueryTypes.SELECT },
  );
  return Boolean(rows);
}

/** Every type the CHECK allowed, read from it, so this adds one and loses none. */
async function currentTaskTypes() {
  const [row] = await sequelize.query(
    `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
      WHERE conrelid = 'roadmap_tasks'::regclass AND conname = 'roadmap_tasks_type_check'`,
    { type: Sequelize.QueryTypes.SELECT },
  );
  if (!row) return null;
  return [...row.def.matchAll(/'([a-z_]+)'::/g)].map((match) => match[1]);
}

async function setTaskTypes(types) {
  const list = types.map((type) => `'${type}'`).join(', ');
  await sequelize.query(`
    ALTER TABLE roadmap_tasks DROP CONSTRAINT IF EXISTS "roadmap_tasks_type_check";
    ALTER TABLE roadmap_tasks ADD CONSTRAINT "roadmap_tasks_type_check" CHECK (type IN (${list}))
  `);
}

async function up() {
  console.log('▶ Running migration 146: group discussions\n');

  if (!await tableExists('discussion_scenarios')) {
    await sequelize.query(`
      CREATE TABLE discussion_scenarios (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        clan_id          UUID NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
        title            VARCHAR(200) NOT NULL,
        prompt           TEXT,
        created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await sequelize.query('CREATE INDEX discussion_scenarios_clan_idx ON discussion_scenarios (organization_id, clan_id, created_at DESC)');
    console.log('  ✓ discussion_scenarios');
  }

  if (!await tableExists('discussion_groups')) {
    await sequelize.query(`
      CREATE TABLE discussion_groups (
        id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        clan_id           UUID NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
        scenario_id       UUID NOT NULL REFERENCES discussion_scenarios(id) ON DELETE CASCADE,
        conversation_id   UUID REFERENCES conversations(id) ON DELETE SET NULL,
        name              VARCHAR(150) NOT NULL,
        -- 'none' opens between starts_at and ends_at; 'weekly' opens every week.
        repeat            VARCHAR(10) NOT NULL DEFAULT 'none' CHECK (repeat IN ('none', 'weekly')),
        starts_at         TIMESTAMPTZ,
        ends_at           TIMESTAMPTZ,
        day_of_week       INTEGER CHECK (day_of_week BETWEEN 0 AND 6),
        time_local        VARCHAR(5),
        duration_minutes  INTEGER,
        timezone          VARCHAR(64),
        starts_on         DATE,
        ends_on           DATE,
        created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await sequelize.query('CREATE INDEX discussion_groups_scenario_idx ON discussion_groups (scenario_id)');
    await sequelize.query('CREATE INDEX discussion_groups_clan_idx ON discussion_groups (organization_id, clan_id)');
    await sequelize.query('CREATE UNIQUE INDEX discussion_groups_conversation_uniq ON discussion_groups (conversation_id) WHERE conversation_id IS NOT NULL');
    console.log('  ✓ discussion_groups');
  }

  if (!await columnExists('assigned_tasks', 'discussion_group_id')) {
    await sequelize.query(`
      ALTER TABLE assigned_tasks
        ADD COLUMN discussion_group_id UUID REFERENCES discussion_groups(id) ON DELETE SET NULL
    `);
    console.log('  ✓ assigned_tasks.discussion_group_id');
  }
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS assigned_tasks_discussion_group_idx
      ON assigned_tasks (discussion_group_id) WHERE discussion_group_id IS NOT NULL
  `);

  const types = await currentTaskTypes();
  if (types && !types.includes('group_discussion')) {
    await setTaskTypes([...types, 'group_discussion']);
    console.log("  ✓ roadmap_tasks.type accepts 'group_discussion'");
  }

  console.log('\n✓ Migration 146 complete');
}

async function down() {
  await sequelize.query("UPDATE roadmap_tasks SET type = 'discussion' WHERE type = 'group_discussion'");
  const types = await currentTaskTypes();
  if (types) await setTaskTypes(types.filter((type) => type !== 'group_discussion'));
  await sequelize.query('DROP INDEX IF EXISTS assigned_tasks_discussion_group_idx');
  await sequelize.query('ALTER TABLE assigned_tasks DROP COLUMN IF EXISTS discussion_group_id');
  await sequelize.query('DROP TABLE IF EXISTS discussion_groups');
  await sequelize.query('DROP TABLE IF EXISTS discussion_scenarios');
  console.log('Rollback complete');
}

module.exports = { up, down };

if (require.main === module) {
  up()
    .catch((error) => { console.error(error); process.exitCode = 1; })
    .finally(() => sequelize.close());
}
