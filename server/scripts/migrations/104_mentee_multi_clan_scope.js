/**
 * Migration: 104_mentee_multi_clan_scope
 *
 * A mentee may hold visible memberships in more than one clan. Work that used
 * to be unique per mentee (schedule, daily log, roadmap progress) and tasks
 * that were found by menteeId alone must be scoped to the clan they belong to.
 *
 * clan_id is NULLABLE. Existing rows are backfilled only when the mentee has
 * exactly one visible (active/paused) mentee membership — never by picking
 * an arbitrary clan. Leftover nulls are legacy/global rows and stay valid.
 *
 * Unique indexes (required — these are constraints, not speed tweaks):
 *   (mentee_id, clan_id) WHERE clan_id IS NOT NULL
 *   (mentee_id)          WHERE clan_id IS NULL     (legacy single row)
 * same pattern for daily_log_entries (+ date_key) and roadmap_progress (+ roadmap_id).
 * Without replacing the old whole-table uniques, a second clan cannot get its
 * own schedule / log / progress row. Extra btree indexes on assigned_tasks and
 * notifications are not created: mentee_id / user_id lookups already exist, and
 * ~3k users do not need a clan composite on top.
 *
 * Notifications.clan_id is optional: clan-specific events set it; system/global
 * rows stay null.
 *
 * Run:      node server/scripts/migrations/104_mentee_multi_clan_scope.js
 * Rollback: node server/scripts/migrations/104_mentee_multi_clan_scope.js --rollback
 */
const { Sequelize } = require('sequelize');
const sequelize = require('./_db');

async function columnExists(table, column, t) {
  const [rows] = await sequelize.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=:table AND column_name=:column`,
    { replacements: { table, column }, transaction: t }
  );
  return rows.length > 0;
}

async function indexExists(name, t) {
  const [rows] = await sequelize.query('SELECT 1 FROM pg_indexes WHERE indexname = :name', {
    replacements: { name }, transaction: t
  });
  return rows.length > 0;
}

async function constraintExists(name, t) {
  const [rows] = await sequelize.query(
    `SELECT 1 FROM pg_constraint WHERE conname = :name`,
    { replacements: { name }, transaction: t }
  );
  return rows.length > 0;
}

async function addClanId(qi, table, t) {
  if (await columnExists(table, 'clan_id', t)) {
    console.log(`  ℹ ${table}.clan_id exists, skipping add`);
    return;
  }
  await qi.addColumn(table, 'clan_id', {
    type: Sequelize.UUID,
    allowNull: true
  }, { transaction: t });
  console.log(`  ✓ Added ${table}.clan_id`);
}

/** Backfill only when the mentee has exactly one visible mentee membership. */
async function backfillByMentee(table, menteeCol, t) {
  const [result] = await sequelize.query(`
    UPDATE ${table} t
       SET clan_id = sub.clan_id
      FROM (
        SELECT user_id, MIN(clan_id::text)::uuid AS clan_id
          FROM clan_memberships
         WHERE role = 'mentee'
           AND status IN ('active', 'paused')
         GROUP BY user_id
        HAVING COUNT(DISTINCT clan_id) = 1
      ) sub
     WHERE t.${menteeCol} = sub.user_id
       AND t.clan_id IS NULL
  `, { transaction: t });
  const n = result?.rowCount ?? result;
  console.log(`  ✓ Backfilled ${table}.clan_id (${n ?? 'ok'})`);
}

async function addFk(table, name, t) {
  if (await constraintExists(name, t)) {
    console.log(`  ℹ ${name} exists, skipping`);
    return;
  }
  await sequelize.query(
    `ALTER TABLE ${table} ADD CONSTRAINT ${name} FOREIGN KEY (clan_id) REFERENCES clans(id) ON UPDATE CASCADE ON DELETE SET NULL`,
    { transaction: t }
  );
  console.log(`  ✓ ${name}`);
}

async function uniquePartial(name, sql, t) {
  if (await indexExists(name, t)) {
    console.log(`  ℹ ${name} exists, skipping`);
    return;
  }
  await sequelize.query(sql, { transaction: t });
  console.log(`  ✓ ${name}`);
}

async function dropIndex(name, t) {
  if (!(await indexExists(name, t))) return;
  await sequelize.query(`DROP INDEX IF EXISTS ${name}`, { transaction: t });
  console.log(`  ✓ Dropped index ${name}`);
}

async function up() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Running migration 104: mentee multi-clan scope');

  await sequelize.transaction(async (t) => {
    for (const table of ['assigned_tasks', 'mentee_schedules', 'roadmap_progress', 'daily_log_entries', 'notifications']) {
      await addClanId(qi, table, t);
    }

    await backfillByMentee('assigned_tasks', 'mentee_id', t);
    await backfillByMentee('mentee_schedules', 'mentee_id', t);
    await backfillByMentee('roadmap_progress', 'mentee_id', t);
    await backfillByMentee('daily_log_entries', 'mentee_id', t);

    // Notifications: copy clan from the related assigned task when we can.
    await sequelize.query(`
      UPDATE notifications n
         SET clan_id = at.clan_id
        FROM assigned_tasks at
       WHERE n.related_entity_type IN ('assigned_task', 'task')
         AND n.related_entity_id = at.id
         AND n.clan_id IS NULL
         AND at.clan_id IS NOT NULL
    `, { transaction: t });

    await addFk('assigned_tasks', 'assigned_tasks_clan_id_fkey', t);
    await addFk('mentee_schedules', 'mentee_schedules_clan_id_fkey', t);
    await addFk('roadmap_progress', 'roadmap_progress_clan_id_fkey', t);
    await addFk('daily_log_entries', 'daily_log_entries_clan_id_fkey', t);
    await addFk('notifications', 'notifications_clan_id_fkey', t);

    // Optional lookup indexes from an earlier draft of this migration — drop if
    // they already landed. Do not recreate them.
    await dropIndex('assigned_tasks_mentee_id_clan_id', t);
    await dropIndex('notifications_user_id_clan_id', t);

    await dropIndex('mentee_schedules_mentee_unique', t);
    await uniquePartial(
      'mentee_schedules_mentee_clan_unique',
      `CREATE UNIQUE INDEX mentee_schedules_mentee_clan_unique ON mentee_schedules (mentee_id, clan_id) WHERE clan_id IS NOT NULL`,
      t
    );
    await uniquePartial(
      'mentee_schedules_mentee_legacy_unique',
      `CREATE UNIQUE INDEX mentee_schedules_mentee_legacy_unique ON mentee_schedules (mentee_id) WHERE clan_id IS NULL`,
      t
    );

    await dropIndex('roadmap_progress_roadmap_mentee_unique', t);
    await uniquePartial(
      'roadmap_progress_roadmap_mentee_clan_unique',
      `CREATE UNIQUE INDEX roadmap_progress_roadmap_mentee_clan_unique ON roadmap_progress (roadmap_id, mentee_id, clan_id) WHERE clan_id IS NOT NULL`,
      t
    );
    await uniquePartial(
      'roadmap_progress_roadmap_mentee_legacy_unique',
      `CREATE UNIQUE INDEX roadmap_progress_roadmap_mentee_legacy_unique ON roadmap_progress (roadmap_id, mentee_id) WHERE clan_id IS NULL`,
      t
    );

    await dropIndex('daily_log_mentee_date_unique', t);
    await uniquePartial(
      'daily_log_entries_mentee_date_clan_unique',
      `CREATE UNIQUE INDEX daily_log_entries_mentee_date_clan_unique ON daily_log_entries (mentee_id, date_key, clan_id) WHERE clan_id IS NOT NULL`,
      t
    );
    await uniquePartial(
      'daily_log_entries_mentee_date_legacy_unique',
      `CREATE UNIQUE INDEX daily_log_entries_mentee_date_legacy_unique ON daily_log_entries (mentee_id, date_key) WHERE clan_id IS NULL`,
      t
    );
  });

  console.log('✅ Migration 104 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 104');
  await sequelize.transaction(async (t) => {
    await dropIndex('mentee_schedules_mentee_clan_unique', t);
    await dropIndex('mentee_schedules_mentee_legacy_unique', t);
    await uniquePartial(
      'mentee_schedules_mentee_unique',
      `CREATE UNIQUE INDEX mentee_schedules_mentee_unique ON mentee_schedules (mentee_id)`,
      t
    );
    await dropIndex('roadmap_progress_roadmap_mentee_clan_unique', t);
    await dropIndex('roadmap_progress_roadmap_mentee_legacy_unique', t);
    await uniquePartial(
      'roadmap_progress_roadmap_mentee_unique',
      `CREATE UNIQUE INDEX roadmap_progress_roadmap_mentee_unique ON roadmap_progress (roadmap_id, mentee_id)`,
      t
    );
    await dropIndex('daily_log_entries_mentee_date_clan_unique', t);
    await dropIndex('daily_log_entries_mentee_date_legacy_unique', t);
    await uniquePartial(
      'daily_log_mentee_date_unique',
      `CREATE UNIQUE INDEX daily_log_mentee_date_unique ON daily_log_entries (mentee_id, date_key)`,
      t
    );
    await dropIndex('assigned_tasks_mentee_id_clan_id', t);
    await dropIndex('notifications_user_id_clan_id', t);

    for (const table of ['assigned_tasks', 'mentee_schedules', 'roadmap_progress', 'daily_log_entries', 'notifications']) {
      if (await columnExists(table, 'clan_id', t)) {
        await qi.removeColumn(table, 'clan_id', { transaction: t });
        console.log(`  ✓ Removed ${table}.clan_id`);
      }
    }
  });
  console.log('✅ Rollback 104 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => {
    try { await (isRollback ? down() : up()); process.exit(0); }
    catch (e) { console.error('Migration failed:', e.message); process.exit(1); }
  })();
}

module.exports = { up, down };
