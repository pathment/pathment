const { sequelize }         = require('../../../db');
const { models: { MentorEditHistory } } = require('../../../db');
const learningService       = require('../services/learningService');
const { resolveGeminiKey }  = require('../../../services/aiConnectionService');
const logger                = require('../../../utils/logger');

let running = false;

async function reapStuck() {
  await sequelize.query(`
    UPDATE mentor_edit_histories 
    SET status='pending', updated_at=NOW()
    WHERE status='processing' AND updated_at < NOW() - INTERVAL '10 minutes'
  `);
}

async function tick() {
  if (running) return;
  running = true;
  try {
    await reapStuck();
    const [rows] = await sequelize.query(`
      UPDATE mentor_edit_histories 
      SET status='processing', updated_at=NOW()
      WHERE id IN (
        SELECT id FROM mentor_edit_histories
        WHERE status='pending'
        ORDER BY created_at ASC
        LIMIT 10
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id
    `);

    const ids = (rows || []).map(r => r.id);
    if (!ids.length) return;

    const edits = await MentorEditHistory.findAll({ where: { id: ids } });

    for (const edit of edits) {
      try {
        // Strict BYOK: resolve mentor's Gemini key for Q&A embedding.
        // If no key → processEdit(editId, null) → style update only (no Q&A embedding).
        const geminiKey = await resolveGeminiKey(edit.mentorId);
        // BYOK strict: NO process.env fallback

        await learningService.processEdit(edit.id, geminiKey);
        await sequelize.query('UPDATE mentor_edit_histories SET status=?, updated_at=NOW() WHERE id=?', {
          replacements: ['completed', edit.id]
        });
      } catch (e) {
        logger.error('[Learning] Job failed, scheduling retry', { editId: edit.id, error: e.message });
        const attempts = edit.attempts + 1;
        const status = attempts >= 5 ? 'failed' : 'pending';
        await sequelize.query('UPDATE mentor_edit_histories SET status=?, attempts=?, updated_at=NOW() WHERE id = ?', {
          replacements: [status, attempts, edit.id]
        });
      }
    }
  } catch (err) {
    logger.error('Learning worker error', { error: err.message });
  } finally {
    running = false;
  }
}

let interval;
function start() {
  if (interval) return;
  interval = setInterval(tick, 5_000);
  logger.info('RAG Learning worker started');
}

module.exports = { start, tick };
