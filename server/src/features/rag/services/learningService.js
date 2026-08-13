const crypto = require('crypto');
const { models: { MentorStyleProfile, MessageDraft, MentorEditHistory, KnowledgeChunk } } = require('../../../db');
const { embedText } = require('./embeddingService');
const logger = require('../../../utils/logger');

// Levenshtein distance to see how much the mentor changed the AI draft
function levenshtein(a, b) {
  if (!a || !b) return (a || b || '').length;
  const dp = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => i || j)
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] 
        ? dp[i - 1][j - 1] 
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

/**
 * Analyzes a mentor's approved edit and does TWO things:
 *
 * 1. STYLE PROFILE UPDATE (always)
 *    Nudges tone.brevity and tone.formality based on how the mentor edited the draft.
 *
 * 2. Q&A PAIR EMBEDDING (when geminiKey available — BYOK)
 *    Stores a (mentee_question, mentor_answer) pair as a `mentor_qa` knowledge chunk.
 *
 *    WHY Q&A pairs and NOT just answers:
 *      - We embed the QUESTION text → semantically similar future questions retrieve this pair
 *      - The chunk content stores BOTH question AND answer
 *      - promptBuilder shows these under a separate "HOW I HAVE REPLIED BEFORE" section
 *      - LLM is explicitly told: use these for STYLE REFERENCE, not as repeatable facts
 *
 *    WHY this is safe (no "15-20 pages for 26-page proposal" type errors):
 *      - promptBuilder clearly labels Q&A chunks as examples, NOT ground truth
 *      - The LLM is instructed to adapt the answer to the CURRENT question's specifics
 *      - Only semantically similar questions retrieve them (not random retrieval)
 */
async function processEdit(editId, geminiApiKey) {
  const edit = await MentorEditHistory.findByPk(editId);
  if (!edit) return;

  const { sequelize } = require('../../../db');
  const t = await sequelize.transaction();

  try {
    const profile = await MentorStyleProfile.findOne({ where: { mentorId: edit.mentorId }, transaction: t });

    if (profile) {
      // ── 1. Style signal analysis ─────────────────────────────────────────
      const emojiCount = (edit.finalContent.match(/[\p{Emoji}]/gu) || []).length;
      const isShorter  = edit.finalContent.length < edit.originalContent.length;

      const currentTone = profile.tone || { brevity: 0.5, formality: 0.5 };
      const newTone = {
        brevity:   clamp(currentTone.brevity   + (isShorter ? 0.05 : -0.05),  0, 1),
        formality: clamp(currentTone.formality + (emojiCount > 0 ? -0.05 : 0.05), 0, 1),
      };

      // Keep last 5 style examples for the prompt (short-term style reference)
      const currentExamples = profile.styleExamples || [];
      const newExamples = [...currentExamples, edit.finalContent].slice(-5);

      await profile.update({ tone: newTone, styleExamples: newExamples }, { transaction: t });

      logger.info('[Learning] Style profile nudged', {
        editId: edit.id,
        brevity: newTone.brevity.toFixed(2),
        formality: newTone.formality.toFixed(2),
      });
    }

    // ── 2. Q&A pair embedding ─────────────────────────────────────────────
    // Only run if we have a Gemini key (BYOK — caller passes null to skip).
    if (geminiApiKey) {
      // Fetch the original mentee question via: edit → draft → original message
      let menteeQuestion = null;
      let menteeId = null;
      try {
        const draft = await MessageDraft.findByPk(edit.draftId);
        if (draft) {
          menteeId = draft.menteeId;   // Always available on the draft
          if (draft.messageId) {
            const { models: { Message } } = require('../../../db');
            const origMessage = await Message.findByPk(draft.messageId);
            if (origMessage?.messageText) {
              menteeQuestion = origMessage.messageText.trim();
            }
          }
        }
      } catch (lookupErr) {
        logger.warn('[Learning] Could not fetch original mentee question', { error: lookupErr.message });
      }

      if (menteeQuestion) {
        // Store Q&A pair where:
        //   embedding key = mentee question  → future similar questions retrieve this
        //   content       = Q + A together   → LLM sees full context (labelled as example)
        const qaContent = `[PAST_EXAMPLE]\nMentee asked: ${menteeQuestion}\nMentor replied: ${edit.finalContent}`;
        const contentHash = crypto.createHash('sha256').update(`${edit.mentorId}:${qaContent}`).digest('hex');

        // Idempotency: remove stale version if re-processing same edit
        await KnowledgeChunk.destroy({
          where: { sourceId: edit.id, sourceType: 'mentor_qa' },
          transaction: t
        });

        // Embed the QUESTION text (not the answer) — this makes retrieval semantic
        const embedding = await embedText(menteeQuestion, geminiApiKey);

        await KnowledgeChunk.create({
          mentorId:    edit.mentorId,
          menteeId,              // ← per-mentee isolation
          sourceType:  'mentor_qa',
          sourceId:    edit.id,
          chunkIndex:  0,
          contentHash,
          content:     qaContent,
          embedding:   `[${embedding.join(',')}]`,
          visibility:  'mentor',
        }, { transaction: t });

        logger.info('[Learning] Q&A pair embedded', {
          editId: edit.id,
          questionChars: menteeQuestion.length,
          answerChars: edit.finalContent.length,
        });
      } else {
        logger.info('[Learning] Skipping Q&A embedding — original mentee question not found', { editId: edit.id });
      }
    }

    await t.commit();
    logger.info('[Learning] Edit processed', { editId: edit.id, hasQA: !!geminiApiKey });

  } catch (err) {
    await t.rollback();
    logger.error('[Learning] Failed to process edit', { editId: edit.id, error: err.message });
    throw err;
  }
}

module.exports = { processEdit, levenshtein };
