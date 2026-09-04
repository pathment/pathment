/**
 * Migration: 097_custom_certificates
 *
 * Sets up custom certificate system tables and AI evaluation:
 * 1. certificate_templates: holds layout configs, coordinates, logo options, background image, and AI evaluation caches
 * 2. certificate_instances: issued certificates tracking mentee, template, issuer, and PDF Cloudinary url
 * 3. certificate_queue: outbox queue to render certificates in the background using Puppeteer
 * 4. ai_evaluation_queue: outbox queue for per-mentee AI evaluation jobs
 *
 * Run:      node server/scripts/migrations/097_custom_certificates.js
 * Rollback: node server/scripts/migrations/097_custom_certificates.js --rollback
 */
const { Sequelize } = require('sequelize');
const sequelize = require('./_db');

async function tableExists(table, t) {
  const [r] = await sequelize.query(
    `SELECT 1 FROM information_schema.tables WHERE table_name='${table}'`, { transaction: t });
  return r.length > 0;
}

async function indexExists(name, t) {
  const [r] = await sequelize.query(`SELECT 1 FROM pg_indexes WHERE indexname='${name}'`, { transaction: t });
  return r.length > 0;
}

async function columnExists(table, column, t) {
  const [r] = await sequelize.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name='${table}' AND column_name='${column}'`,
    { transaction: t }
  );
  return r.length > 0;
}

async function up() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Running migration 097: custom certificate system (consolidated)');

  await sequelize.transaction(async (t) => {
    if (await tableExists('certificate_templates', t)) {
      console.log('  ℹ certificate_templates exists, skipping create');
    } else {
      await qi.createTable('certificate_templates', {
        id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
        name: { type: Sequelize.STRING(255), allowNull: false },
        bg_image_url: { type: Sequelize.TEXT, allowNull: true },
        logo_url: { type: Sequelize.TEXT, allowNull: true },
        logo_config: { type: Sequelize.JSONB, allowNull: true },
        criteria: { type: Sequelize.JSONB, allowNull: true },
        config: { type: Sequelize.JSONB, allowNull: false },
        program_id: {
          type: Sequelize.UUID, allowNull: false,
          references: { model: 'programs', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE',
        },
        created_by: {
          type: Sequelize.UUID, allowNull: false,
          references: { model: 'users', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE',
        },
        status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'active' },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      }, { transaction: t });
      console.log('  ✓ Created certificate_templates');
    }

    if (!await columnExists('certificate_templates', 'ai_evaluation', t)) {
      await sequelize.query(`ALTER TABLE certificate_templates ADD COLUMN ai_evaluation JSONB`, { transaction: t });
      console.log('  ✓ Added ai_evaluation column to certificate_templates');
    }
    if (!await columnExists('certificate_templates', 'ai_evaluation_ran_at', t)) {
      await sequelize.query(`ALTER TABLE certificate_templates ADD COLUMN ai_evaluation_ran_at TIMESTAMPTZ`, { transaction: t });
      console.log('  ✓ Added ai_evaluation_ran_at column to certificate_templates');
    }

    if (await tableExists('certificate_instances', t)) {
      console.log('  ℹ certificate_instances exists, skipping create');
    } else {
      await qi.createTable('certificate_instances', {
        id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
        template_id: {
          type: Sequelize.UUID, allowNull: false,
          references: { model: 'certificate_templates', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE',
        },
        mentee_id: {
          type: Sequelize.UUID, allowNull: false,
          references: { model: 'users', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE',
        },
        mentor_id: {
          type: Sequelize.UUID, allowNull: true,
          references: { model: 'users', key: 'id' }, onDelete: 'SET NULL', onUpdate: 'CASCADE',
        },
        issued_by: {
          type: Sequelize.UUID, allowNull: false,
          references: { model: 'users', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE',
        },
        tier: { type: Sequelize.STRING(50), allowNull: false, defaultValue: 'participation' },
        pdf_url: { type: Sequelize.TEXT, allowNull: true },
        image_url: { type: Sequelize.TEXT, allowNull: true },
        metadata: { type: Sequelize.JSONB, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      }, { transaction: t });
      console.log('  ✓ Created certificate_instances');
    }

    if (await tableExists('certificate_queue', t)) {
      console.log('  ℹ certificate_queue exists, skipping create');
    } else {
      await qi.createTable('certificate_queue', {
        id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
        instance_id: {
          type: Sequelize.UUID, allowNull: false,
          references: { model: 'certificate_instances', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE',
        },
        status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'pending' },
        attempts: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        error: { type: Sequelize.TEXT, allowNull: true },
        locked_at: { type: Sequelize.DATE, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      }, { transaction: t });
      console.log('  ✓ Created certificate_queue');
    }

    if (await tableExists('ai_evaluation_queue', t)) {
      console.log('  ℹ ai_evaluation_queue exists, skipping create');
    } else {
      await sequelize.query(`
        CREATE TABLE ai_evaluation_queue (
          id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          run_id        UUID        NOT NULL,
          template_id   UUID        NOT NULL REFERENCES certificate_templates(id) ON DELETE CASCADE,
          mentee_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          triggered_by  UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          status        VARCHAR(20) NOT NULL DEFAULT 'pending',
          mentee_payload JSONB      NOT NULL,
          pre_check     JSONB,
          result        JSONB,
          error         TEXT,
          attempts      INTEGER     NOT NULL DEFAULT 0,
          max_attempts  INTEGER     NOT NULL DEFAULT 3,
          locked_at     TIMESTAMPTZ,
          created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `, { transaction: t });
      console.log('  ✓ Created ai_evaluation_queue table');
    }

    const qStatusIdx = 'certificate_queue_status_attempts';
    if (await indexExists(qStatusIdx, t)) {
      console.log(`  ℹ ${qStatusIdx} exists, skipping`);
    } else {
      await qi.addIndex('certificate_queue', ['status', 'attempts'], { name: qStatusIdx, transaction: t });
      console.log(`  ✓ Created index ${qStatusIdx}`);
    }

    const instMenteeIdx = 'certificate_instances_mentee_id';
    if (await indexExists(instMenteeIdx, t)) {
      console.log(`  ℹ ${instMenteeIdx} exists, skipping`);
    } else {
      await qi.addIndex('certificate_instances', ['mentee_id'], { name: instMenteeIdx, transaction: t });
      console.log(`  ✓ Created index ${instMenteeIdx}`);
    }

    const aiStatusIdx = 'idx_ai_eval_queue_status_created';
    if (await indexExists(aiStatusIdx, t)) {
      console.log(`  ℹ ${aiStatusIdx} exists, skipping`);
    } else {
      await sequelize.query(`CREATE INDEX idx_ai_eval_queue_status_created ON ai_evaluation_queue (status, created_at);`, { transaction: t });
      console.log(`  ✓ Created index ${aiStatusIdx}`);
    }

    const aiRunIdx = 'idx_ai_eval_queue_run_id';
    if (await indexExists(aiRunIdx, t)) {
      console.log(`  ℹ ${aiRunIdx} exists, skipping`);
    } else {
      await sequelize.query(`CREATE INDEX idx_ai_eval_queue_run_id ON ai_evaluation_queue (run_id);`, { transaction: t });
      console.log(`  ✓ Created index ${aiRunIdx}`);
    }

    const aiTemplateIdx = 'idx_ai_eval_queue_template_id';
    if (await indexExists(aiTemplateIdx, t)) {
      console.log(`  ℹ ${aiTemplateIdx} exists, skipping`);
    } else {
      await sequelize.query(`CREATE INDEX idx_ai_eval_queue_template_id ON ai_evaluation_queue (template_id);`, { transaction: t });
      console.log(`  ✓ Created index ${aiTemplateIdx}`);
    }

    const aiRunMenteeUnique = 'ai_eval_queue_run_mentee_unique';
    if (await indexExists(aiRunMenteeUnique, t)) {
      console.log(`  ℹ ${aiRunMenteeUnique} exists, skipping`);
    } else {
      await sequelize.query(`
        CREATE UNIQUE INDEX ai_eval_queue_run_mentee_unique
        ON ai_evaluation_queue (run_id, mentee_id)
      `, { transaction: t });
      console.log(`  ✓ Created UNIQUE index ${aiRunMenteeUnique} (run_id, mentee_id)`);
    }
  });

  console.log('✅ Migration 097 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('◀ Rolling back migration 097 (consolidated)');

  await sequelize.transaction(async (t) => {
    if (await tableExists('ai_evaluation_queue', t)) {
      await sequelize.query(`DROP TABLE IF EXISTS ai_evaluation_queue CASCADE`, { transaction: t });
      console.log('  ✓ Dropped ai_evaluation_queue');
    }
    if (await tableExists('certificate_queue', t)) {
      await qi.dropTable('certificate_queue', { transaction: t });
      console.log('  ✓ Dropped certificate_queue');
    }
    if (await tableExists('certificate_instances', t)) {
      await qi.dropTable('certificate_instances', { transaction: t });
      console.log('  ✓ Dropped certificate_instances');
    }
    if (await tableExists('certificate_templates', t)) {
      await qi.dropTable('certificate_templates', { transaction: t });
      console.log('  ✓ Dropped certificate_templates');
    }
  });

  console.log('✅ Rollback 097 complete');
}

if (require.main === module) {
  (async () => {
    try {
      await (process.argv.includes('--rollback') ? down() : up());
      process.exit(0);
    } catch (err) {
      console.error('❌ Migration 097 failed:', err);
      process.exit(1);
    }
  })();
}

module.exports = { up, down };
