/**
 * Migration: 157_pricing_v2
 *
 * The November 2026 price list. Plans are billed on participants (mentees);
 * mentors and admins never count toward the member limit (see
 * organizationService.usage). Changes the catalogue only:
 *
 *  - starter      renamed Community: still free, still 100 participants
 *  - program      NEW  $299/mo, or $2,988/yr ($249/mo billed yearly), 300 participants
 *  - academy      NEW  $849/mo, or $8,388/yr ($699/mo billed yearly), 1,500 participants
 *  - institution  NEW  $12,000/yr, unlimited, sold on an annual contract
 *  - growth, scale  no longer offered (active = false). Workspaces already on
 *                   them keep the plan, its price and its limits: existing
 *                   customers are grandfathered.
 *
 * Plan keys are immutable and subscriptions reference plan rows, so nothing
 * is deleted. Safe to run twice.
 *
 * Run:      node server/scripts/migrations/157_pricing_v2.js
 * Rollback: node server/scripts/migrations/157_pricing_v2.js --rollback
 */
const sequelize = require('./_db');

// Vocabulary matches 110_multi_tenant_foundation so operator overrides keep
// working. Only members/programs/clans and the four public features are
// published (organizationService.plans); the rest are internal entitlements.
const NEW_PLANS = [
  {
    key: 'program', name: 'Program', monthly: 29900, annual: 298800, sort: 20,
    description: 'For one bootcamp, fellowship or trainee program.',
    limits: { members: 300, programs: 5, clans: 25, storageGb: 50, aiEvaluationsPerMonth: 5000 },
    features: { certificates: true, aiEvaluation: true, customBranding: false, customDomain: false, advancedAnalytics: true, sso: false, programCompletionStanding: true },
  },
  {
    key: 'academy', name: 'Academy', monthly: 84900, annual: 838800, sort: 30,
    description: 'For training providers running several cohorts at once.',
    limits: { members: 1500, programs: -1, clans: -1, storageGb: 200, aiEvaluationsPerMonth: 20000 },
    features: { certificates: true, aiEvaluation: true, customBranding: true, customDomain: true, advancedAnalytics: true, sso: false, programCompletionStanding: true },
  },
  {
    key: 'institution', name: 'Institution', monthly: 100000, annual: 1200000, sort: 40,
    description: 'For academies, employers and funders at scale, on an annual contract.',
    limits: { members: -1, programs: -1, clans: -1, storageGb: 500, aiEvaluationsPerMonth: 50000 },
    features: { certificates: true, aiEvaluation: true, customBranding: true, customDomain: true, advancedAnalytics: true, sso: true, programCompletionStanding: true },
  },
];

const COMMUNITY_DESCRIPTION = 'For communities and first pilots. Mentors and admins are always free.';
const STARTER_DESCRIPTION = 'For a small mentorship community getting started.';

async function up(transaction) {
  await sequelize.query(
    `UPDATE plans SET name = 'Community', description = :description, sort_order = 10, updated_at = NOW()
      WHERE key = 'starter'`,
    { replacements: { description: COMMUNITY_DESCRIPTION }, transaction },
  );
  console.log('  ✓ starter → Community');

  for (const plan of NEW_PLANS) {
    // eslint-disable-next-line no-await-in-loop
    await sequelize.query(
      `INSERT INTO plans
         (key, name, description, monthly_price_cents, annual_price_cents, currency, limits, features, active, sort_order, created_at, updated_at)
       VALUES (:key, :name, :description, :monthly, :annual, 'USD', CAST(:limits AS jsonb), CAST(:features AS jsonb), true, :sort, NOW(), NOW())
       ON CONFLICT (key) DO UPDATE SET
         name = EXCLUDED.name, description = EXCLUDED.description,
         monthly_price_cents = EXCLUDED.monthly_price_cents, annual_price_cents = EXCLUDED.annual_price_cents,
         limits = EXCLUDED.limits, features = EXCLUDED.features,
         active = true, sort_order = EXCLUDED.sort_order, updated_at = NOW()`,
      {
        replacements: { ...plan, limits: JSON.stringify(plan.limits), features: JSON.stringify(plan.features) },
        transaction,
      },
    );
    console.log(`  ✓ ${plan.key} upserted`);
  }

  await sequelize.query(
    `UPDATE plans SET active = false, updated_at = NOW() WHERE key IN ('growth', 'scale')`,
    { transaction },
  );
  console.log('  ✓ growth, scale retired (existing subscriptions keep them)');
}

async function down(transaction) {
  await sequelize.query(
    `UPDATE plans SET name = 'Starter', description = :description, sort_order = 10, updated_at = NOW()
      WHERE key = 'starter'`,
    { replacements: { description: STARTER_DESCRIPTION }, transaction },
  );
  await sequelize.query(
    `UPDATE plans SET active = true, updated_at = NOW() WHERE key IN ('growth', 'scale')`,
    { transaction },
  );
  // Workspaces may already subscribe to the new plans, so retire them rather
  // than delete them.
  await sequelize.query(
    `UPDATE plans SET active = false, updated_at = NOW() WHERE key IN ('program', 'academy', 'institution')`,
    { transaction },
  );
  console.log('  ✓ catalogue restored to Starter / Growth / Scale');
}

(async () => {
  const rollback = process.argv.includes('--rollback');
  try {
    await sequelize.transaction(async (transaction) => (rollback ? down(transaction) : up(transaction)));
    console.log(rollback ? '✅ Migration 157 rolled back' : '✅ Migration 157 complete');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration 157 failed:', error.message);
    process.exit(1);
  }
})();
