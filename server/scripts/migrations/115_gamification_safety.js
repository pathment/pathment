// Additive only: never recalculate existing XP, credits, levels or awards.
async function up({ db = require('./_db') } = {}) {
  await db.transaction(async transaction => {
    const query = sql => db.query(sql, { transaction });
    await query("SET LOCAL lock_timeout = '5s'");
    await query("SET LOCAL statement_timeout = '60s'");
    await query('ALTER TABLE points_history ADD COLUMN IF NOT EXISTS event_key VARCHAR(255)');
    await query('ALTER TABLE redemptions ADD COLUMN IF NOT EXISTS request_key UUID');
    await query("ALTER TABLE badges ADD COLUMN IF NOT EXISTS audience VARCHAR(20) DEFAULT 'mentee'");
    await query('ALTER TABLE badges ADD COLUMN IF NOT EXISTS retired_at TIMESTAMPTZ');
    await query('ALTER TABLE user_badges ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ');
    await query('ALTER TABLE user_badges ADD COLUMN IF NOT EXISTS revoke_reason TEXT');
    // NULL keys keep historical rows intact, including historical duplicates.
    await query('CREATE UNIQUE INDEX IF NOT EXISTS points_history_event_key_uniq ON points_history (organization_id, user_id, event_key)');
    await query('CREATE UNIQUE INDEX IF NOT EXISTS redemptions_request_key_uniq ON redemptions (organization_id, mentee_id, request_key)');
  });
}

module.exports = { up };
