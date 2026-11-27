/**
 * Clan kind semantics.
 *
 * `clans.kind` is one of:
 *   'cohort'    a programme clan — the ordinary case. Its mentees are enrolled
 *               in the programme, their work counts towards programme progress,
 *               ranking and a certificate, and the clan freezes when the
 *               programme closes.
 *   'standing'  a clan that outlived its programme. No enrollment, no programme
 *               progress, no certificate, no freeze.
 *   'pool'      a selection round — a trial clan. Candidates do work and are
 *               reviewed in it, but nobody in it is a mentee of the programme
 *               until they are selected and placed out of it.
 *
 * ## Why this file exists
 *
 * Nearly every place that asked `kind === 'standing'` did not mean "standing".
 * It meant **"this is not a programme clan"** — do not enrol, do not rank, do
 * not certificate, do not freeze. There were ninety-odd of those checks, split
 * between `=== 'standing'` and `=== 'cohort'` spellings of the same question.
 *
 * That is safe while there are exactly two kinds and dangerous the moment there
 * are three: `kind === 'standing'` is FALSE for a pool, so every one of those
 * checks would have quietly treated a trial clan as a real programme clan and
 * let selection-round work into certificates, rankings and progress — the exact
 * leak the pool exists to prevent. Failing open, in the places that matter most.
 *
 * So the question gets a name. Ask `isProgrammeClan` when you mean "does this
 * clan's work count towards the programme", and only compare `kind` directly
 * when you genuinely mean that one kind — continuing a closed programme is
 * about standing clans specifically, and should keep saying so.
 */

const COHORT = 'cohort';
const STANDING = 'standing';
const POOL = 'pool';

const CLAN_KINDS = [COHORT, STANDING, POOL];

/** The kind of a clan, a plain object, or a row — defaulting to the ordinary case. */
function kindOf(clan) {
  if (!clan) return COHORT;
  return (typeof clan === 'string' ? clan : clan.kind) || COHORT;
}

/**
 * Does this clan's work count towards the programme?
 *
 * True only for a cohort clan. This is the question behind enrollment,
 * programme progress, fairness, ranking, certificates and freezing.
 */
function isProgrammeClan(clan) {
  return kindOf(clan) === COHORT;
}

/**
 * A clan that exists outside its programme's accounting: standing or pool.
 * Its members hold no enrollment and its work is scoped by `clanId` alone.
 */
function isNonProgrammeClan(clan) {
  return !isProgrammeClan(clan);
}

/** A selection round. Members are candidates, not mentees, until placed out. */
function isPoolClan(clan) {
  return kindOf(clan) === POOL;
}

/** A clan continuing past its programme's close. */
function isStandingClan(clan) {
  return kindOf(clan) === STANDING;
}

module.exports = {
  COHORT,
  STANDING,
  POOL,
  CLAN_KINDS,
  kindOf,
  isProgrammeClan,
  isNonProgrammeClan,
  isPoolClan,
  isStandingClan,
};
