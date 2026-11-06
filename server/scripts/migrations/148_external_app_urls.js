/**
 * Migration: 148_external_app_urls
 *
 * Where an integration-backed app lives, set from the platform console instead
 * of the server's .env.
 *
 *   external_apps.api_base_url   the provider's API host (Buildment: calls go to
 *                                {api_base_url}/integrations/v1)
 *   external_apps.app_url        where learners sign up / study, when it differs
 *                                from the API host (optional)
 *
 * Run:      node server/scripts/migrations/148_external_app_urls.js
 * Rollback: node server/scripts/migrations/148_external_app_urls.js --rollback
 */
const sequelize = require('./_db');

async function up() {
  await sequelize.transaction(async (transaction) => {
    await sequelize.query('ALTER TABLE external_apps ADD COLUMN IF NOT EXISTS api_base_url VARCHAR(500)', { transaction });
    await sequelize.query('ALTER TABLE external_apps ADD COLUMN IF NOT EXISTS app_url VARCHAR(500)', { transaction });
  });
  console.log('  ✓ external_apps.api_base_url, external_apps.app_url');
}

async function down() {
  await sequelize.query('ALTER TABLE external_apps DROP COLUMN IF EXISTS app_url');
  await sequelize.query('ALTER TABLE external_apps DROP COLUMN IF EXISTS api_base_url');
  console.log('Rollback complete');
}

module.exports = { up, down };

if (require.main === module) {
  (process.argv.includes('--rollback') ? down() : up())
    .catch((error) => { console.error(error); process.exitCode = 1; })
    .finally(() => sequelize.close());
}
