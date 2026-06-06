/**
 * Migration: 052_email_queue_resilience
 *
 * Promotes `email_queue` from an audit log into a real, worker-processed queue
 * (DB-backed - zero Redis commands, fits the Upstash 500k/mo budget) and adds a
 * suppression list so we stop mailing addresses that hard-bounced / complained.
 *
 *   email_queue +:
 *     next_attempt_at      when this row is next eligible to send (backoff)
 *     last_attempt_at      when we last tried
 *     max_attempts         retry ceiling before it goes to the DLQ ('dead')
 *     idempotency_key      UNIQUE - prevents double-enqueue / double-send
 *     provider_message_id  Resend id, for webhook correlation
 *     error_category       'transient' | 'permanent' (why it failed)
 *   + index (status, next_attempt_at) for the claim query.
 *
 *   suppressed_emails (new): addresses we must never mail (bounce/complaint).
 *
 * Run:      node server/scripts/migrations/052_email_queue_resilience.js
 * Rollback: node server/scripts/migrations/052_email_queue_resilience.js --rollback
 */
const { Sequelize } = require('sequelize');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const sequelize = new Sequelize(process.env.DATABASE_URL, { logging: false });

const COLS = [
  ['next_attempt_at', { type: 'DATE' }],
  ['last_attempt_at', { type: 'DATE' }],
  ['max_attempts', { type: 'INT', defaultValue: 5 }],
  ['idempotency_key', { type: 'STR255' }],
  ['provider_message_id', { type: 'STR255' }],
  ['error_category', { type: 'STR20' }],
];

async function up() {
  const qi = sequelize.getQueryInterface();
  const S = Sequelize;
  const typeOf = (t) => t === 'DATE' ? S.DATE : t === 'INT' ? S.INTEGER : t === 'STR20' ? S.STRING(20) : S.STRING(255);
  console.log('▶ Running migration 052: email queue resilience');

  for (const [col, def] of COLS) {
    try {
      await qi.addColumn('email_queue', col, { type: typeOf(def.type), allowNull: true, defaultValue: def.defaultValue });
      console.log(`  ✓ added email_queue.${col}`);
    } catch (e) {
      if (/already exists|duplicate column/i.test(e.message)) console.log(`  ℹ email_queue.${col} exists, skipping`);
      else throw e;
    }
  }

  // Backfill next_attempt_at for any existing pending rows so the worker picks them up.
  try {
    await sequelize.query(`UPDATE email_queue SET next_attempt_at = COALESCE(scheduled_at, created_at, NOW()) WHERE next_attempt_at IS NULL AND status = 'pending'`);
  } catch (e) { console.log('  ℹ backfill skipped:', e.message); }

  // Unique idempotency key (nullable → Postgres allows many NULLs).
  try {
    await qi.addIndex('email_queue', ['idempotency_key'], { unique: true, name: 'email_queue_idempotency_key_uniq' });
    console.log('  ✓ unique index on idempotency_key');
  } catch (e) { if (/already exists/i.test(e.message)) console.log('  ℹ idempotency index exists'); else throw e; }

  // The claim query filters on (status, next_attempt_at).
  try {
    await qi.addIndex('email_queue', ['status', 'next_attempt_at'], { name: 'email_queue_status_next_attempt_idx' });
    console.log('  ✓ index on (status, next_attempt_at)');
  } catch (e) { if (/already exists/i.test(e.message)) console.log('  ℹ status/next_attempt index exists'); else throw e; }

  // Suppression list.
  try {
    await qi.createTable('suppressed_emails', {
      id: { type: S.UUID, defaultValue: S.UUIDV4, primaryKey: true },
      email: { type: S.STRING(255), allowNull: false, unique: true },
      reason: { type: S.STRING(20), allowNull: false }, // 'bounce' | 'complaint' | 'manual'
      detail: { type: S.TEXT, allowNull: true },
      source: { type: S.STRING(20), allowNull: true }, // 'resend_webhook' | 'admin'
      created_at: { type: S.DATE, allowNull: false, defaultValue: S.fn('NOW') },
      updated_at: { type: S.DATE, allowNull: false, defaultValue: S.fn('NOW') },
    });
    await qi.addIndex('suppressed_emails', ['email'], { unique: true, name: 'suppressed_emails_email_uniq' });
    console.log('  ✓ created suppressed_emails');
  } catch (e) { if (/already exists/i.test(e.message)) console.log('  ℹ suppressed_emails exists, skipping'); else throw e; }

  console.log('✅ Migration 052 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 052');
  try { await qi.dropTable('suppressed_emails'); console.log('  ✓ dropped suppressed_emails'); } catch (e) { if (!/does not exist/.test(e.message)) throw e; }
  for (const idx of ['email_queue_idempotency_key_uniq', 'email_queue_status_next_attempt_idx']) {
    try { await qi.removeIndex('email_queue', idx); } catch { /* ignore */ }
  }
  for (const [col] of COLS) {
    try { await qi.removeColumn('email_queue', col); console.log(`  ✓ dropped email_queue.${col}`); }
    catch (e) { if (!/does not exist/.test(e.message)) throw e; }
  }
  console.log('✅ Rollback 052 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => { try { await (isRollback ? down() : up()); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down };
