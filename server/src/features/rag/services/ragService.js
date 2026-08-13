const { models: { MessageDraft, RagIngestionJob, KnowledgeChunk, MentorEditHistory } } = require('../../../db');
const { enqueueDocument } = require('./ingestionService');
const { extractTextFromBuffer } = require('./chunkingService');
const { levenshtein } = require('./learningService');
const logger = require('../../../utils/logger');
const crypto = require('crypto');

// ---------------------------------------------------------------------------
// Drafts
// ---------------------------------------------------------------------------

async function listPendingDrafts(mentorId) {
  const { models: { Message } } = require('../../../db');

  const drafts = await MessageDraft.findAll({
    where: { mentorId, status: 'pending' },
    order: [['createdAt', 'DESC']]
  });

  // Batch-load the original messages to avoid N+1 queries
  const messageIds = drafts.map((d) => d.messageId).filter(Boolean);
  const messages = messageIds.length
    ? await Message.findAll({ where: { id: messageIds } })
    : [];
  const messageById = new Map(messages.map((m) => [m.id, m.toJSON()]));

  return drafts.map((draft) => ({
    ...draft.toJSON(),
    originalMessage: messageById.get(draft.messageId) ?? null
  }));
}

/**
 * Prepares a draft for approval: creates the learning history record and
 * resolves the original message — but does NOT mark the draft as 'approved'
 * yet. The caller must call markDraftApproved() after the message has been
 * sent successfully, so the two state changes are kept consistent.
 */
async function approveDraft(draftId, mentorId, finalText) {
  const draft = await MessageDraft.findOne({ where: { id: draftId, mentorId } });
  if (!draft) throw new Error('Draft not found');

  // Compute actual edit distance so the learning worker can use it as a signal
  const editDistance = levenshtein(draft.draftContent ?? '', finalText);

  // Queue the learning record for the background worker to process
  await MentorEditHistory.create({
    draftId:         draft.id,
    mentorId:        draft.mentorId,
    originalContent: draft.draftContent,
    finalContent:    finalText,
    editDistance,
    status: 'pending'
  });

  // Resolve the original message for the controller to extract threadId
  const { models: { Message } } = require('../../../db');
  const originalMessage = await Message.findByPk(draft.messageId);

  return {
    draft,  // raw instance so markDraftApproved() can update it
    originalMessage: originalMessage ? originalMessage.toJSON() : null
  };
}

/**
 * Marks a draft as approved. Called by the controller AFTER sendMessage
 * succeeds so that draft status and message delivery stay consistent.
 */
async function markDraftApproved(draftId, mentorId) {
  const draft = await MessageDraft.findOne({ where: { id: draftId, mentorId } });
  if (!draft) throw new Error('Draft not found');
  await draft.update({ status: 'approved' });
}

async function rejectDraft(draftId, mentorId) {
  const draft = await MessageDraft.findOne({ where: { id: draftId, mentorId } });
  if (!draft) throw new Error('Draft not found');
  await draft.update({ status: 'rejected' });
  return draft;
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

const VALID_VISIBILITY = ['mentor', 'program'];

async function getMentorDocuments(mentorId) {
  const jobs = await RagIngestionJob.findAll({
    where: { mentorId, sourceType: 'mentor_document' },
    order: [['createdAt', 'DESC']]
  });

  return jobs.map((job) => {
    // Prefer the dedicated fileName column (available for new uploads after
    // migration 091). Fall back to the legacy text-prefix format for
    // documents ingested before the column was added.
    let fileName = job.fileName ?? null;
    if (!fileName) {
      const firstLine = job.text ? job.text.split('\n')[0] : '';
      if (firstLine.startsWith('Document Name: ')) {
        fileName = firstLine.substring('Document Name: '.length);
      }
    }
    fileName = fileName || 'Unknown Document';

    return {
      id:           job.id,
      fileName,
      status:       job.status === 'pending' ? 'processing' : job.status,
      errorMessage: job.attempts > 0 && job.status !== 'completed' ? 'Retrying or failed' : undefined,
      createdAt:    job.createdAt
    };
  });
}

async function ingestDocument(mentorId, fileBuffer, fileName, visibility) {
  // chunkingService.extractTextFromBuffer handles PDF parsing with proper
  // error handling and logging — no need to duplicate pdfParse here.
  const text = await extractTextFromBuffer(fileBuffer);

  if (!text || text.trim().length === 0) {
    throw new Error('No text found in PDF');
  }

  const sourceId = crypto.randomUUID();
  const safeVisibility = VALID_VISIBILITY.includes(visibility) ? visibility : 'mentor';

  // Prepend document name for legacy text-prefix reading (older records).
  // The dedicated fileName column is the canonical source going forward.
  const fullText = `Document Name: ${fileName}\n\n${text}`;

  const job = await enqueueDocument({
    mentorId,
    sourceType: 'mentor_document',
    sourceId,
    text:       fullText,
    fileName,
    visibility: safeVisibility
  });

  return job;
}

async function deleteMentorDocument(jobId, mentorId) {
  const job = await RagIngestionJob.findOne({ where: { id: jobId, mentorId } });
  if (!job) throw new Error('Document not found');

  if (job.sourceId) {
    await KnowledgeChunk.destroy({ where: { sourceId: job.sourceId, mentorId } });
  }

  await job.destroy();
}

module.exports = {
  listPendingDrafts,
  approveDraft,
  markDraftApproved,
  rejectDraft,
  getMentorDocuments,
  ingestDocument,
  deleteMentorDocument
};
