const { sequelize }        = require('../../../db');
const { models: { RagIngestionJob } } = require('../../../db');
const ingestionService     = require('../services/ingestionService');
const { resolveGeminiKey } = require('../../../services/aiConnectionService');
const logger               = require('../../../utils/logger');

let running = false;

async function reapStuck() {
  await sequelize.query(`
    UPDATE rag_ingestion_jobs 
    SET status='pending', updated_at=NOW()
    WHERE status='processing' AND updated_at < NOW() - INTERVAL '10 minutes'
  `);
}

async function tick() {
  if (running) return;
  running = true;

  try {
    await reapStuck();

    // Atomically claim jobs that are pending. We set them to 'processing' (or keep 'pending' but lock)
    // Actually, setting them to 'processing' is better. Let's do a raw update with returning id.
    const [rows] = await sequelize.query(`
      UPDATE rag_ingestion_jobs 
      SET status='processing', updated_at=NOW()
      WHERE id IN (
        SELECT id FROM rag_ingestion_jobs
        WHERE status='pending'
        ORDER BY created_at ASC
        LIMIT 5
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id
    `);

    const ids = (rows || []).map(r => r.id);
    if (!ids.length) return;

    const jobs = await RagIngestionJob.findAll({ where: { id: ids } });

    for (const job of jobs) {
      // Strict BYOK: explicit routing → any Gemini connection → null (no env fallback)
      const geminiKey = await resolveGeminiKey(job.mentorId);

      if (!geminiKey) {
        logger.warn('[Ingestion] Mentor has no Gemini key (BYOK required), skipping job', { mentorId: job.mentorId, jobId: job.id });
        await job.update({ status: 'failed', attempts: job.attempts + 1 });
        continue;
      }

      try {
        await ingestionService.processJob(job, geminiKey);
      } catch (err) {
        logger.error('Ingestion job failed, scheduling retry', { jobId: job.id, error: err.message });
        const attempts = job.attempts + 1;
        const status = attempts >= 5 ? 'failed' : 'pending';
        await sequelize.query('UPDATE rag_ingestion_jobs SET status=?, attempts=?, updated_at=NOW() WHERE id=?', {
          replacements: [status, attempts, job.id]
        });
      }
    }
  } catch (err) {
    logger.error('Ingestion worker error', { error: err.message });
  } finally {
    running = false;
  }
}

let interval;
function start() {
  if (interval) return;
  interval = setInterval(tick, 10_000);
  logger.info('RAG Ingestion worker started');
}

module.exports = { start, tick };
