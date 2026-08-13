/**
 * Migration: 092_rag_core
 *
 * The storage behind mentor style learning and drafted replies:
 *
 *   - `mentor_style_profiles`  one row per mentor: tone, vocabulary and phrase
 *                              patterns learned from how they actually write,
 *                              plus the auto reply switch and its usage cap.
 *   - `knowledge_chunks`       the retrieval corpus. Each row is one chunk of
 *                              text with a 768 dimension embedding AND a
 *                              generated tsvector, so retrieval can be hybrid:
 *                              vector similarity for meaning, full text for the
 *                              exact term somebody typed.
 *   - `rag_ingestion_jobs`     the queue that turns raw text into chunks, with
 *                              attempts so a failure is retried rather than lost.
 *   - `message_drafts`         a generated reply awaiting the mentor, with the
 *                              chunks it drew on so the suggestion can be
 *                              traced back to what produced it.
 *   - `mentor_edit_histories`  what the mentor changed before sending. Edit
 *                              distance is the training signal: heavy editing
 *                              means the style model is wrong.
 *
 * `knowledge_chunks` is raw SQL rather than createTable because Sequelize has
 * no VECTOR type and cannot express a GENERATED column. It is created IF NOT
 * EXISTS: an earlier draft of this migration dropped the table first, which
 * would have destroyed every embedding on a second run.
 *
 * pgvector is created outside the transaction. It is a precondition rather than
 * part of the change, and on a managed database it may need a superuser, so it
 * fails with its own message instead of rolling the whole migration back.
 *
 * Run:      node server/scripts/migrations/092_rag_core.js
 * Rollback: node server/scripts/migrations/092_rag_core.js --rollback
 */
const { Sequelize } = require('sequelize');
const sequelize = require('./_db');

const TIMESTAMPS = {
  created_at: {
    type: Sequelize.DATE,
    allowNull: false,
    defaultValue: Sequelize.literal('NOW()')
  },
  updated_at: {
    type: Sequelize.DATE,
    allowNull: false,
    defaultValue: Sequelize.literal('NOW()')
  }
};

async function tableExists(table, t) {
  const [r] = await sequelize.query(
    `SELECT 1 FROM information_schema.tables WHERE table_name='${table}'`,
    { transaction: t }
  );
  return r.length > 0;
}

/** Creates a table once, and says which of the two happened. */
async function createOnce(qi, name, columns, t) {
  if (await tableExists(name, t)) {
    console.log(`  ℹ ${name} exists, skipping create`);
    return;
  }
  await qi.createTable(name, columns, { transaction: t });
  console.log(`  ✓ Created ${name}`);
}

async function ensureVectorExtension() {
  try {
    await sequelize.query('CREATE EXTENSION IF NOT EXISTS vector;');
    console.log('  ✓ pgvector available');
  } catch (error) {
    throw new Error(
      `pgvector could not be installed: ${error.message}. ` +
        'It needs a superuser on most managed databases. Enable the vector ' +
        'extension for this database, then run this migration again.'
    );
  }
}

async function up() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Running migration 092: RAG core');

  await ensureVectorExtension();

  await sequelize.transaction(async (t) => {
    await createOnce(
      qi,
      'mentor_style_profiles',
      {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.literal('gen_random_uuid()'),
          primaryKey: true
        },
        mentor_id: {
          type: Sequelize.UUID,
          allowNull: false,
          unique: true,
          references: { model: 'users', key: 'id' },
          onDelete: 'CASCADE'
        },
        tone: { type: Sequelize.JSONB, defaultValue: { brevity: 0.5, formality: 0.5 } },
        vocab_prefs: { type: Sequelize.JSONB, defaultValue: {} },
        phrase_patterns: { type: Sequelize.JSONB, defaultValue: [] },
        style_examples: { type: Sequelize.JSONB, defaultValue: [] },
        auto_reply_enabled: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        auto_reply_limit: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 100 },
        auto_reply_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        ...TIMESTAMPS
      },
      t
    );

    // Raw SQL: VECTOR is not a Sequelize type, and the tsvector column is
    // GENERATED, which createTable cannot express either.
    if (await tableExists('knowledge_chunks', t)) {
      console.log('  ℹ knowledge_chunks exists, skipping create');
    } else {
      await sequelize.query(
        `
        CREATE TABLE knowledge_chunks (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          mentor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          mentee_id UUID REFERENCES users(id) ON DELETE CASCADE,
          source_type VARCHAR(50),
          source_id UUID,
          chunk_index INTEGER NOT NULL DEFAULT 0,
          content_hash CHAR(64),
          content TEXT NOT NULL,
          embedding VECTOR(768),
          visibility VARCHAR(20) NOT NULL DEFAULT 'mentor',
          search_vector TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        `,
        { transaction: t }
      );
      console.log('  ✓ Created knowledge_chunks');
    }

    await sequelize.query(
      `
      CREATE INDEX IF NOT EXISTS idx_chunks_embedding
        ON knowledge_chunks USING hnsw (embedding vector_cosine_ops);
      CREATE INDEX IF NOT EXISTS idx_chunks_fts
        ON knowledge_chunks USING gin (search_vector);
      CREATE INDEX IF NOT EXISTS idx_chunks_mentee
        ON knowledge_chunks (mentee_id) WHERE mentee_id IS NOT NULL;
      -- The dedup lookup in contextService reads all three together. Without
      -- this it is a sequential scan of the whole corpus on every ingestion.
      CREATE INDEX IF NOT EXISTS idx_chunks_mentor_source_hash
        ON knowledge_chunks (mentor_id, content_hash, source_type);
      `,
      { transaction: t }
    );
    console.log('  ✓ Ensured knowledge_chunks indexes');

    await createOnce(
      qi,
      'rag_ingestion_jobs',
      {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.literal('gen_random_uuid()'),
          primaryKey: true
        },
        mentor_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: 'users', key: 'id' },
          onDelete: 'CASCADE'
        },
        source_type: { type: Sequelize.STRING(50) },
        source_id: { type: Sequelize.UUID },
        text: { type: Sequelize.TEXT, allowNull: false },
        file_name: { type: Sequelize.STRING(255), allowNull: true, defaultValue: null },
        visibility: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'mentor' },
        status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'pending' },
        attempts: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        ...TIMESTAMPS
      },
      t
    );

    await createOnce(
      qi,
      'message_drafts',
      {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.literal('gen_random_uuid()'),
          primaryKey: true
        },
        message_id: { type: Sequelize.UUID },
        mentor_id: {
          type: Sequelize.UUID,
          references: { model: 'users', key: 'id' },
          onDelete: 'CASCADE'
        },
        mentee_id: {
          type: Sequelize.UUID,
          references: { model: 'users', key: 'id' },
          onDelete: 'CASCADE'
        },
        draft_content: { type: Sequelize.TEXT },
        confidence_score: { type: Sequelize.FLOAT },
        retrieved_chunk_ids: { type: Sequelize.JSONB, defaultValue: [] },
        status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'pending' },
        ...TIMESTAMPS
      },
      t
    );

    await createOnce(
      qi,
      'mentor_edit_histories',
      {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.literal('gen_random_uuid()'),
          primaryKey: true
        },
        draft_id: { type: Sequelize.UUID },
        mentor_id: {
          type: Sequelize.UUID,
          references: { model: 'users', key: 'id' },
          onDelete: 'CASCADE'
        },
        original_content: { type: Sequelize.TEXT },
        final_content: { type: Sequelize.TEXT },
        edit_distance: { type: Sequelize.INTEGER },
        status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'pending' },
        attempts: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        ...TIMESTAMPS
      },
      t
    );
  });

  console.log('✅ Migration 092 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 092');

  await sequelize.transaction(async (t) => {
    // Children first, then the corpus, then the profiles.
    for (const table of ['mentor_edit_histories', 'message_drafts', 'rag_ingestion_jobs']) {
      if (await tableExists(table, t)) {
        await qi.dropTable(table, { transaction: t });
        console.log(`  ✓ Dropped ${table}`);
      } else {
        console.log(`  ℹ ${table} does not exist, nothing to drop`);
      }
    }

    if (await tableExists('knowledge_chunks', t)) {
      await sequelize.query('DROP TABLE knowledge_chunks;', { transaction: t });
      console.log('  ✓ Dropped knowledge_chunks');
    } else {
      console.log('  ℹ knowledge_chunks does not exist, nothing to drop');
    }

    if (await tableExists('mentor_style_profiles', t)) {
      await qi.dropTable('mentor_style_profiles', { transaction: t });
      console.log('  ✓ Dropped mentor_style_profiles');
    } else {
      console.log('  ℹ mentor_style_profiles does not exist, nothing to drop');
    }
  });

  // The vector extension is deliberately left in place. It is shared with
  // anything else in this database that uses it, and dropping it here would
  // take those with it.
  console.log('✅ Rollback 092 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => {
    try {
      await (isRollback ? down() : up());
      process.exit(0);
    } catch (e) {
      console.error('❌ Migration failed:', e.message);
      process.exit(1);
    }
  })();
}

module.exports = { up, down };
