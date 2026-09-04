const { Op } = require('sequelize');
const { models, sequelize } = require('../db');
const certificateRenderer = require('../utils/certificateUtils');
const certificateService = require('../services/certificateService');
const { enrichEvaluationResults } = require('../utils/certificateUtils');
const emailService = require('../services/emailService');
const notificationOrchestrator = require('../services/notificationOrchestrator');
const { NOTIFICATION_EVENTS } = require('../config/notificationMatrix');
const { certificateAwardedEmail } = require('../utils/emailTemplate');
const { emitToUser } = require('../socket');
const { uploadToCloudinary } = require('../utils/cloudinaryUpload');
const logger = require('../utils/logger');

// ==================== WORKER CONFIGURATION ====================

const PDF_POLL_MS = Number(process.env.CERTIFICATE_WORKER_POLL_MS) || 10000;
const AI_EVAL_POLL_MS = Number(process.env.AI_EVAL_WORKER_POLL_MS) || 1000;

const MAX_PDF_ATTEMPTS = 5;
const MAX_AI_EVAL_ATTEMPTS = 3;
const BATCH_SIZE = 10;
const CONCURRENT_BATCHES = 4;

let pdfTimer = null;
let aiEvalTimer = null;

let pdfRunning = false;
let aiEvalRunning = false;

// ==================== PDF GENERATION WORKER LOGIC ====================

async function processPDFJob(job) {
  const instance = await models.CertificateInstance.findOne({
    where: { id: job.instanceId },
    include: [
      {
        model: models.CertificateTemplate,
        as: 'template',
        include: [{ model: models.Program, as: 'program', required: false }]
      },
      { model: models.User, as: 'mentee' },
      { model: models.User, as: 'mentor', required: false },
      { model: models.User, as: 'issuer' }
    ]
  });

  if (!instance) {
    throw new Error(`Certificate instance ${job.instanceId} not found in database`);
  }

  const menteeName = `${instance.mentee.firstName} ${instance.mentee.lastName}`.trim();
  const mentorName = instance.mentor
    ? `${instance.mentor.firstName} ${instance.mentor.lastName}`.trim()
    : `${instance.issuer.firstName} ${instance.issuer.lastName}`.trim();

  const dateIssued = new Date(instance.createdAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const enrollment = await models.Enrollment.findOne({
    where: { menteeId: instance.menteeId },
    include: [{ model: models.Program, as: 'program', required: false }]
  });
  const programName = instance.template?.program?.name || enrollment?.program?.name || 'Pathment Program';
  const fellowshipName = programName;

  const renderData = {
    menteeName,
    mentorName,
    dateIssued,
    fellowshipName,
    programName,
    issuerName: mentorName,
    issuerTitle: instance.mentor ? 'Mentor' : 'Pathment Admin'
  };

  const criteria = Array.isArray(instance.template.criteria) ? instance.template.criteria : [];
  const tierConfig = criteria.find(t => t.id === instance.tier);
  const badgeUrl = tierConfig ? tierConfig.badgeUrl : null;

  const templateClone = JSON.parse(JSON.stringify(instance.template.get({ plain: true })));
  if (Array.isArray(templateClone.config)) {
    templateClone.config = templateClone.config
      .map(el => {
        if (el.type === 'badge') {
          return { ...el, badgeUrl };
        }
        return el;
      })
      .filter(el => {
        if (el.type === 'badge') {
          return !!badgeUrl;
        }
        return true;
      });
  }

  const { pdfBuffer, pngBuffer } = await certificateRenderer.renderCertificate(templateClone, renderData);

  const [pdfResult, pngResult] = await Promise.all([
    uploadToCloudinary(pdfBuffer, 'pathment/certificates', 'auto'),
    uploadToCloudinary(pngBuffer, 'pathment/certificates', 'image')
  ]);

  instance.pdfUrl = pdfResult.secure_url;
  instance.imageUrl = pngResult.secure_url;
  await instance.save();

  const targetPath = instance.mentee.role === 'mentor' ? '/mentor/certificates' : '/mentee/certificates';
  const certificateLink = `${(process.env.CLIENT_URL || 'http://localhost:3000').replace(/\/$/, '')}${targetPath}`;

  const criteriaMatch = criteria.find(c => c.id === instance.tier);
  const tierDisplayName = criteriaMatch ? criteriaMatch.name : (instance.tier.charAt(0).toUpperCase() + instance.tier.slice(1));

  const { subject, html } = certificateAwardedEmail({
    firstName: instance.mentee.firstName,
    lastName: instance.mentee.lastName,
    templateName: instance.template.name,
    tier: instance.tier,
    tierDisplayName,
    imageUrl: instance.imageUrl,
    certificateLink
  });

  await emailService.enqueue({
    to: instance.mentee.email,
    subject,
    html,
    emailType: 'certificate_awarded',
    recipientId: instance.menteeId,
    attachments: [
      {
        filename: `${instance.template.name.replace(/[^a-z0-9]/gi, '_')}.pdf`,
        content: pdfBuffer.toString('base64'),
        contentType: 'application/pdf'
      }
    ]
  });

  await notificationOrchestrator.dispatch({
    eventKey: NOTIFICATION_EVENTS.CERTIFICATE_AWARDED,
    recipients: [{ userId: instance.menteeId }],
    payload: {
      title: 'Certificate Awarded!',
      message: `Congratulations! You have been awarded a certificate for: "${instance.template.name}".`,
      actionUrl: `/mentee/certificates`,
      actionLabel: 'View Certificate',
      relatedEntityType: 'certificate_instance',
      relatedEntityId: instance.id
    }
  });
}

async function tickPDF() {
  if (pdfRunning) return;
  pdfRunning = true;

  try {
    const STALE_LOCK_MS = 5 * 60 * 1000;
    const now = new Date();

    const job = await sequelize.transaction(async (t) => {
      const pendingJob = await models.CertificateQueue.findOne({
        where: {
          [Op.or]: [
            { status: 'pending' },
            {
              status: 'processing',
              lockedAt: { [Op.lt]: new Date(Date.now() - STALE_LOCK_MS) }
            }
          ],
          attempts: { [Op.lt]: MAX_PDF_ATTEMPTS }
        },
        order: [['createdAt', 'ASC']],
        lock: { level: t.LOCK.UPDATE, of: models.CertificateQueue },
        skipLocked: true,
        transaction: t
      });

      if (!pendingJob) return null;

      if (pendingJob.attempts > 0 && pendingJob.status === 'pending') {
        const backoffMs = Math.pow(2, pendingJob.attempts - 1) * 3000;
        const lastUpdated = new Date(pendingJob.updatedAt).getTime();
        if (Date.now() - lastUpdated < backoffMs) {
          return null;
        }
      }

      pendingJob.status = 'processing';
      pendingJob.lockedAt = now;
      pendingJob.attempts += 1;
      await pendingJob.save({ transaction: t });

      return pendingJob;
    });

    if (!job) {
      pdfRunning = false;
      return;
    }

    try {
      logger.info(`[Certificate Worker - PDF] Processing job ${job.id} (instance ${job.instanceId}, attempt ${job.attempts}/${MAX_PDF_ATTEMPTS})`);
      await processPDFJob(job);

      job.status = 'completed';
      job.error = null;
      await job.save();
      logger.info(`[Certificate Worker - PDF] Job ${job.id} completed successfully.`);
    } catch (jobError) {
      logger.error(`[Certificate Worker - PDF] Job ${job.id} failed (attempt ${job.attempts}/${MAX_PDF_ATTEMPTS}): ${jobError.message}`);

      job.status = job.attempts >= MAX_PDF_ATTEMPTS ? 'failed' : 'pending';
      job.error = jobError.stack || jobError.message;
      await job.save();
    }
  } catch (err) {
    logger.error(`[Certificate Worker - PDF] Loop error: ${err.message}`);
  } finally {
    pdfRunning = false;
  }
}

// ==================== AI EVALUATION WORKER LOGIC ====================

async function checkRunCompletion(runId, triggeredBy) {
  const stats = await models.AIEvaluationQueue.findAll({
    where: { runId },
    attributes: [
      'status',
      [sequelize.fn('COUNT', sequelize.col('id')), 'count']
    ],
    group: ['status'],
    raw: true
  });

  const statusMap = {};
  let total = 0;
  for (const s of stats) {
    statusMap[s.status] = parseInt(s.count, 10);
    total += parseInt(s.count, 10);
  }

  const pending = statusMap['pending'] || 0;
  const processing = statusMap['processing'] || 0;
  const completed = statusMap['completed'] || 0;
  const failed = statusMap['failed'] || 0;

  if (pending === 0 && processing === 0) {
    const finishedJobs = await models.AIEvaluationQueue.findAll({
      where: { runId, status: 'completed' },
      attributes: ['menteeId', 'result', 'templateId'],
      raw: true
    });

    const results = finishedJobs
      .map(j => j.result)
      .filter(Boolean);

    const enrichedResults = await enrichEvaluationResults(results);

    const templateId = finishedJobs[0]?.templateId ?? null;

    if (templateId) {
      const ranAt = new Date().toISOString();
      await models.CertificateTemplate.update(
        { aiEvaluation: { results: enrichedResults, ranAt }, aiEvaluationRanAt: ranAt },
        { where: { id: templateId } }
      );
    }

    emitToUser(triggeredBy, 'ai-eval:complete', {
      runId,
      results: enrichedResults,
      ranAt: new Date().toISOString(),
      total,
      completed,
      failed
    });

    logger.info(`[Certificate Worker - AI Eval] Run ${runId} complete: ${completed} done, ${failed} failed out of ${total}`);
  }
}

async function processBatchJobs(batchJobs) {
  if (!batchJobs || batchJobs.length === 0) return;

  const templateId = batchJobs[0].templateId;
  const triggeredBy = batchJobs[0].triggeredBy;
  const runId = batchJobs[0].runId;

  try {
    logger.info(`[Certificate Worker - AI Eval] Processing micro-batch of ${batchJobs.length} mentees for run ${runId}`);
    const template = await models.CertificateTemplate.findByPk(templateId);

    const batchItems = batchJobs.map(j => ({
      menteeId: j.menteeId,
      menteePayload: j.menteePayload,
      preCheck: j.preCheck
    }));

    const batchResults = await certificateService.evaluateBatchMentees(template, batchItems, triggeredBy);
    const resultMap = new Map(batchResults.map(r => [r.menteeId, r.result]));

    for (const job of batchJobs) {
      const result = resultMap.get(job.menteeId) || certificateService.buildFallbackResult(job.menteePayload, job.preCheck);
      job.status = 'completed';
      job.result = result;
      job.error = null;
      await job.save();
    }

    const [{ completedCount, totalCount }] = await sequelize.query(
      `SELECT COUNT(*) FILTER (WHERE status IN ('completed', 'failed')) AS "completedCount", COUNT(*) AS "totalCount" FROM ai_evaluation_queue WHERE run_id = :runId`,
      { replacements: { runId }, type: sequelize.QueryTypes.SELECT }
    );

    const menteeIds = batchJobs.map(j => j.menteeId);
    const mentees = await models.User.findAll({
      where: { id: { [Op.in]: menteeIds } },
      attributes: ['id', 'firstName', 'lastName', 'email'],
      raw: true
    });
    const menteeMap = new Map(mentees.map(m => [m.id, m]));

    for (const job of batchJobs) {
      const mentee = menteeMap.get(job.menteeId);
      const result = job.result;

      emitToUser(triggeredBy, 'ai-eval:progress', {
        runId,
        menteeId: job.menteeId,
        result: {
          ...result,
          firstName: mentee?.firstName ?? '',
          lastName: mentee?.lastName ?? '',
          email: mentee?.email ?? ''
        },
        completed: completedCount,
        total: totalCount
      });
    }

    logger.info(`[Certificate Worker - AI Eval] Micro-batch completed (${completedCount}/${totalCount})`);
    await checkRunCompletion(runId, triggeredBy);
  } catch (batchError) {
    logger.error(`[Certificate Worker - AI Eval] Micro-batch failed: ${batchError.stack || batchError.message}`);

    let errorCompletedCount = 0;
    let errorTotalCount = 0;
    try {
      const [counts] = await sequelize.query(
        `SELECT
           COUNT(*) FILTER (WHERE status IN ('completed', 'failed')) AS "completedCount",
           COUNT(*) AS "totalCount"
         FROM ai_evaluation_queue WHERE run_id = :runId`,
        { replacements: { runId }, type: sequelize.QueryTypes.SELECT }
      );
      errorCompletedCount = Number(counts?.completedCount ?? 0);
      errorTotalCount     = Number(counts?.totalCount     ?? 0);
    } catch (_) { }

    for (const job of batchJobs) {
      job.status = job.attempts >= MAX_AI_EVAL_ATTEMPTS ? 'failed' : 'pending';
      job.error  = batchError.message;
      await job.save();

      if (job.status === 'failed') {
        const fallbackResult = certificateService.buildFallbackResult(
          job.menteePayload,
          job.preCheck
        );

        const mentee = await models.User.findByPk(job.menteeId, {
          attributes: ['id', 'firstName', 'lastName', 'email'],
          raw: true
        });

        emitToUser(triggeredBy, 'ai-eval:progress', {
          runId:    job.runId,
          menteeId: job.menteeId,
          result: {
            ...fallbackResult,
            firstName: mentee?.firstName ?? '',
            lastName:  mentee?.lastName  ?? '',
            email:     mentee?.email     ?? '',
            _failed: true
          },
          completed: errorCompletedCount,
          total:     errorTotalCount
        });
      }
    }
  }
}

async function tickAIEval() {
  if (aiEvalRunning) return;
  aiEvalRunning = true;

  try {
    const allBatchJobs = [];

    for (let b = 0; b < CONCURRENT_BATCHES; b++) {
      const batchJobs = await sequelize.transaction(async (t) => {
        const nextTarget = await models.AIEvaluationQueue.findOne({
          where: {
            [Op.or]: [
              { status: 'pending' },
              {
                status: 'processing',
                lockedAt: { [Op.lt]: new Date(Date.now() - 45000) }
              }
            ],
            attempts: { [Op.lt]: MAX_AI_EVAL_ATTEMPTS }
          },
          order: [['createdAt', 'ASC']],
          attributes: ['runId'],
          raw: true,
          transaction: t
        });

        if (!nextTarget) return [];

        const pendingJobs = await models.AIEvaluationQueue.findAll({
          where: {
            runId: nextTarget.runId,
            [Op.or]: [
              { status: 'pending' },
              {
                status: 'processing',
                lockedAt: { [Op.lt]: new Date(Date.now() - 45000) }
              }
            ],
            attempts: { [Op.lt]: MAX_AI_EVAL_ATTEMPTS }
          },
          order: [['createdAt', 'ASC']],
          limit: BATCH_SIZE,
          lock: { level: t.LOCK.UPDATE, of: models.AIEvaluationQueue },
          skipLocked: true,
          transaction: t
        });

        if (!pendingJobs.length) return [];

        const now = new Date();
        for (const j of pendingJobs) {
          j.status = 'processing';
          j.lockedAt = now;
          j.attempts += 1;
          await j.save({ transaction: t });
        }

        return pendingJobs;
      });

      if (batchJobs && batchJobs.length > 0) {
        allBatchJobs.push(batchJobs);
      } else {
        break;
      }
    }

    if (allBatchJobs.length > 0) {
      await Promise.allSettled(allBatchJobs.map(jobs => processBatchJobs(jobs)));
    }
  } catch (err) {
    logger.error(`[Certificate Worker - AI Eval] Tick error: ${err.message}`);
  } finally {
    aiEvalRunning = false;
  }
}

// ==================== WORKER CONTROLS ====================

function start() {
  if (!pdfTimer) {
    pdfTimer = setInterval(tickPDF, PDF_POLL_MS);
    if (pdfTimer.unref) pdfTimer.unref();
    logger.info(`Certificate PDF worker started (polling every ${PDF_POLL_MS}ms)`);
  }

  if (!aiEvalTimer && process.env.AI_EVAL_WORKER_DISABLED !== 'true') {
    aiEvalTimer = setInterval(tickAIEval, AI_EVAL_POLL_MS);
    if (aiEvalTimer.unref) aiEvalTimer.unref();
    logger.info(`Certificate AI Evaluation worker started (polling every ${AI_EVAL_POLL_MS}ms)`);
  }
}

async function stop() {
  if (pdfTimer) {
    clearInterval(pdfTimer);
    pdfTimer = null;
  }
  if (aiEvalTimer) {
    clearInterval(aiEvalTimer);
    aiEvalTimer = null;
  }

  let waitCount = 0;
  while ((pdfRunning || aiEvalRunning) && waitCount < 10) {
    await new Promise(r => setTimeout(r, 500));
    waitCount++;
  }
  logger.info('Certificate worker (PDF + AI Eval) stopped gracefully');
}

module.exports = {
  start,
  stop,
  tickPDF,
  tickAIEval
};
