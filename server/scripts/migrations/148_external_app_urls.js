/**
 * Migration: 148_external_app_urls
 *
 * Where an external app lives, set from the platform console instead of the
 * server's .env.
 *
 *   external_apps.backend_url    the app's server that Pathment calls
 *                                (Edorax: {backend_url}/integrations/v1)
 *   external_apps.frontend_url   where users open the app, when it differs
 *                                from the backend (optional)
 *
 * Run:      node server/scripts/migrations/148_external_app_urls.js
 * Rollback: node server/scripts/migrations/148_external_app_urls.js --rollback
 */
const sequelize = require('./_db');

async function up() {
  await sequelize.transaction(async (transaction) => {
    await sequelize.query('ALTER TABLE external_apps ADD COLUMN IF NOT EXISTS backend_url VARCHAR(500)', { transaction });
    await sequelize.query('ALTER TABLE external_apps ADD COLUMN IF NOT EXISTS frontend_url VARCHAR(500)', { transaction });
  });
  console.log('  ✓ external_apps.backend_url, external_apps.frontend_url');
}

async function down() {
  await sequelize.query('ALTER TABLE external_apps DROP COLUMN IF EXISTS frontend_url');
  await sequelize.query('ALTER TABLE external_apps DROP COLUMN IF EXISTS backend_url');
  console.log('Rollback complete');
}

module.exports = { up, down };

if (require.main === module) {
  (process.argv.includes('--rollback') ? down() : up())
    .catch((error) => { console.error(error); process.exitCode = 1; })
    .finally(() => sequelize.close());
}
