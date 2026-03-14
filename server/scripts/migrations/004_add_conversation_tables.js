/**
 * Migration: 004_add_conversation_tables
 *
 * Creates:
 * - conversations
 * - conversation_participants
 *
 * Run manually:
 *   node server/scripts/migrations/004_add_conversation_tables.js
 */

const { Sequelize } = require('sequelize');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const sequelize = new Sequelize(process.env.DATABASE_URL, { logging: false });

async function up() {
  const qi = sequelize.getQueryInterface();

  console.log('▶ Running migration 004: add conversation tables');

  await qi.createTable('conversations', {
    id: {
      type: Sequelize.UUID,
      defaultValue: Sequelize.literal('gen_random_uuid()'),
      primaryKey: true,
      allowNull: false,
    },
    type: {
      type: Sequelize.STRING(20),
      allowNull: false,
      defaultValue: 'direct',
    },
    created_by: {
      type: Sequelize.UUID,
      allowNull: true,
    },
    last_message_id: {
      type: Sequelize.UUID,
      allowNull: true,
    },
    last_message_at: {
      type: Sequelize.DATE,
      allowNull: true,
    },
    related_task_id: {
      type: Sequelize.UUID,
      allowNull: true,
    },
    related_enrollment_id: {
      type: Sequelize.UUID,
      allowNull: true,
    },
    metadata: {
      type: Sequelize.JSONB,
      allowNull: false,
      defaultValue: {},
    },
    is_archived: {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    created_at: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
    },
    updated_at: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
    },
  }).catch(async (error) => {
    if (error.message && error.message.includes('already exists')) {
      console.log('  ℹ conversations table already exists, skipping create');
      return;
    }
    throw error;
  });

  await qi.createTable('conversation_participants', {
    id: {
      type: Sequelize.UUID,
      defaultValue: Sequelize.literal('gen_random_uuid()'),
      primaryKey: true,
      allowNull: false,
    },
    conversation_id: {
      type: Sequelize.UUID,
      allowNull: false,
    },
    user_id: {
      type: Sequelize.UUID,
      allowNull: false,
    },
    role: {
      type: Sequelize.STRING(20),
      allowNull: false,
      defaultValue: 'participant',
    },
    last_read_message_id: {
      type: Sequelize.UUID,
      allowNull: true,
    },
    last_read_at: {
      type: Sequelize.DATE,
      allowNull: true,
    },
    joined_at: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
    },
    left_at: {
      type: Sequelize.DATE,
      allowNull: true,
    },
    muted_until: {
      type: Sequelize.DATE,
      allowNull: true,
    },
    is_archived: {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    created_at: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
    },
    updated_at: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
    },
  }).catch(async (error) => {
    if (error.message && error.message.includes('already exists')) {
      console.log('  ℹ conversation_participants table already exists, skipping create');
      return;
    }
    throw error;
  });

  // Indexes for performance
  await sequelize.query('CREATE INDEX IF NOT EXISTS conversations_type_idx ON conversations(type);');
  await sequelize.query('CREATE INDEX IF NOT EXISTS conversations_last_message_at_idx ON conversations(last_message_at);');
  await sequelize.query('CREATE INDEX IF NOT EXISTS conversations_related_task_id_idx ON conversations(related_task_id);');
  await sequelize.query('CREATE INDEX IF NOT EXISTS conversations_related_enrollment_id_idx ON conversations(related_enrollment_id);');

  await sequelize.query('CREATE INDEX IF NOT EXISTS conv_participants_user_id_idx ON conversation_participants(user_id);');
  await sequelize.query('CREATE INDEX IF NOT EXISTS conv_participants_conversation_id_idx ON conversation_participants(conversation_id);');
  await sequelize.query('CREATE INDEX IF NOT EXISTS conv_participants_last_read_at_idx ON conversation_participants(last_read_at);');
  await sequelize.query('CREATE UNIQUE INDEX IF NOT EXISTS conv_participants_unique ON conversation_participants(conversation_id, user_id);');

  // Thread/message access performance
  await sequelize.query('CREATE INDEX IF NOT EXISTS messages_thread_id_created_at_idx ON messages(thread_id, created_at);');
  await sequelize.query('CREATE INDEX IF NOT EXISTS messages_recipient_is_read_thread_idx ON messages(recipient_id, is_read, thread_id);');

  console.log('✅ Migration 004 complete');
}

up()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  });
