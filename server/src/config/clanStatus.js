/**
 * Clan lifecycle status semantics.
 *
 * `clans.status` is one of 'active' | 'inactive' | 'archived'. The two
 * questions the rest of the codebase asks are different, so they get separate
 * answers:
 *
 *   OPERATIONAL  does the clan WORK? Mentors mentor, mentees submit, a mentor or
 *                admin may knowingly place somebody into it, its join link
 *                works. 'active' and 'inactive' both do; only 'archived' stops.
 *
 *   SUGGESTABLE  should the SYSTEM put people here on its own? Only 'active'.
 *                An admin marks a clan 'inactive' when it is winding down, its
 *                mentor is stretched, or it should simply not grow — and every
 *                auto-distribution (candidate-pool placement, intake assignment,
 *                handover-pool suggestions) skips it. Nothing else changes.
 *
 * So 'inactive' is a re-assignment flag, not a lock. Freezing (programme
 * closed) is a separate axis — see clanLifecycleService.
 */
const CLAN_STATUSES = ['active', 'inactive', 'archived'];
const OPERATIONAL_CLAN_STATUSES = ['active', 'inactive'];
const SUGGESTABLE_CLAN_STATUSES = ['active'];

const isClanOperational = (status) => OPERATIONAL_CLAN_STATUSES.includes(status || 'active');
const isClanSuggestable = (status) => SUGGESTABLE_CLAN_STATUSES.includes(status || 'active');

module.exports = {
  CLAN_STATUSES,
  OPERATIONAL_CLAN_STATUSES,
  SUGGESTABLE_CLAN_STATUSES,
  isClanOperational,
  isClanSuggestable,
};
