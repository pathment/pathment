const { Op } = require('sequelize');
const { models, sequelize } = require('../../../db');

/**
 * Whether a mentor can turn auto reply on, and what is missing if not.
 *
 * Auto reply sends a message to a mentee under the mentor's name without the
 * mentor seeing it first. That is a lot of trust, and it only works when three
 * separate things are true. A toggle that can be switched on before they are
 * produces silence, or worse, a confident answer grounded in nothing.
 *
 * So the toggle is not a toggle until the prerequisites are met. This service
 * is the single answer to "can they, and if not, what do they do next", and it
 * is used both to render the checklist and to refuse the enable, so the screen
 * and the server can never disagree about whether somebody is ready.
 *
 * The steps are ordered by what has to happen first: a key, then something to
 * ground answers in, then the mentor's own writing to imitate.
 */

/** Embeddings are Gemini only, so any other provider cannot satisfy this. */
const EMBEDDING_PROVIDER = 'gemini';

/** Below this many chunks, retrieval has nothing worth grounding an answer in. */
const MIN_CHUNKS = 5;

/** Below this, style learning has not seen enough of how the mentor writes. */
const MIN_STYLE_EXAMPLES = 3;

/**
 * Their own key, or the organisation's.
 *
 * Connections are owned by a user, or by nobody when an admin adds one for the
 * whole organisation. A mentor can use either, so both are looked for: telling
 * somebody to add a key they already have through their org would be wrong.
 */
async function hasGeminiKey(mentorId) {
  const count = await models.AIConnection.count({
    where: {
      provider: EMBEDDING_PROVIDER,
      status: { [Op.ne]: 'invalid' },
      [Op.or]: [{ ownerId: mentorId }, { ownerId: null }]
    }
  });
  return count > 0;
}

async function chunkCount(mentorId) {
  const [rows] = await sequelize.query(
    'SELECT count(*)::int AS n FROM knowledge_chunks WHERE mentor_id = :id',
    { replacements: { id: mentorId } }
  );
  return rows?.[0]?.n ?? 0;
}

/**
 * The checklist, in the order it has to be done.
 *
 * Each step says what it is for rather than only what it is, because a mentor
 * being asked to paste an API key deserves to know why the feature cannot work
 * without one.
 */
async function getReadiness(mentorId) {
  const [profile, keyPresent, chunks] = await Promise.all([
    models.MentorStyleProfile.findOne({ where: { mentorId } }),
    hasGeminiKey(mentorId),
    chunkCount(mentorId)
  ]);

  const styleExamples = Array.isArray(profile?.styleExamples) ? profile.styleExamples.length : 0;

  const steps = [
    {
      key: 'key',
      title: 'Connect a Gemini key',
      why: 'Answers are written and searched by Gemini. Pathment never charges you for this: the key is yours and the usage is billed to you.',
      action: 'Settings, then AI connections',
      done: keyPresent,
      /** Nothing else can be attempted until this is true. */
      blocking: true
    },
    {
      key: 'documents',
      title: 'Add something to answer from',
      why: `Replies are grounded in your own material, never invented. ${
        chunks > 0
          ? `You have ${chunks} passages so far.`
          : 'Upload notes, a guide, or anything you find yourself explaining twice.'
      }`,
      action: 'Auto reply, then Your material',
      done: chunks >= MIN_CHUNKS,
      blocking: true,
      progress: { current: chunks, needed: MIN_CHUNKS }
    },
    {
      key: 'style',
      title: 'Let it learn how you write',
      why: `Drafts copy your tone rather than sounding like a chatbot. This happens on its own as you reply to mentees. ${
        styleExamples > 0 ? `${styleExamples} of your replies studied so far.` : ''
      }`,
      action: 'Nothing to do, it learns as you work',
      done: styleExamples >= MIN_STYLE_EXAMPLES,
      blocking: false,
      progress: { current: styleExamples, needed: MIN_STYLE_EXAMPLES }
    }
  ];

  const blockers = steps.filter((s) => s.blocking && !s.done);

  return {
    /** True only when every blocking step is done. */
    canEnable: blockers.length === 0,
    enabled: Boolean(profile?.autoReplyEnabled),
    steps,
    /** The one thing to do next, or null when they are ready. */
    nextStep: blockers[0] ? blockers[0].key : null,
    usage: {
      sent: profile?.autoReplyCount ?? 0,
      limit: profile?.autoReplyLimit ?? 100
    }
  };
}

/**
 * Turning auto reply on, refused when the prerequisites are not met.
 *
 * The check is repeated here rather than trusted from the screen. A client that
 * is out of date, or a request made directly, must not be able to switch on a
 * feature that will then answer a mentee out of an empty knowledge base.
 */
async function setAutoReply(mentorId, enabled) {
  if (enabled) {
    const readiness = await getReadiness(mentorId);
    if (!readiness.canEnable) {
      const missing = readiness.steps.filter((s) => s.blocking && !s.done).map((s) => s.title);
      const error = new Error(`Auto reply is not ready yet: ${missing.join(', ').toLowerCase()}`);
      error.statusCode = 400;
      throw error;
    }
  }

  const [profile] = await models.MentorStyleProfile.findOrCreate({
    where: { mentorId },
    defaults: { mentorId, autoReplyEnabled: false }
  });

  await profile.update({ autoReplyEnabled: Boolean(enabled) });
  return getReadiness(mentorId);
}

module.exports = { getReadiness, setAutoReply, MIN_CHUNKS, MIN_STYLE_EXAMPLES };
