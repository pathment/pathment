const ingestionWorker = require('./workers/ingestionWorker');
const learningWorker  = require('./workers/learningWorker');
const orchestrator    = require('./services/ragOrchestrator');
const logger          = require('../../utils/logger');

const ragService      = require('./services/ragService');

function initializeRag() {
  ingestionWorker.start();
  learningWorker.start();
  logger.info('[RAG] Module initialized and workers started');
}

const RagFacade = {
  handleNewMessage:    orchestrator.handleNewMessage,
  listPendingDrafts:   ragService.listPendingDrafts,
  approveDraft:        ragService.approveDraft,
  markDraftApproved:   ragService.markDraftApproved,
  rejectDraft:         ragService.rejectDraft,
  getMentorDocuments:  ragService.getMentorDocuments,
  ingestDocument:      ragService.ingestDocument,
  deleteMentorDocument: ragService.deleteMentorDocument
};

module.exports = { initializeRag, RagFacade };
