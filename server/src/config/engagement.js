/**
 * Engagement / re-engagement tuning — the single place to adjust how inactive
 * mentees get flagged and how the win-back cadence runs. Kept in one file so
 * the thresholds are easy to change without touching the logic.
 */
module.exports = {
  INACTIVITY: {
    // Flag a mentee as "suggested to pause" when the clan has held at least this
    // many review sessions since they joined AND they attended none of the last
    // this-many (never-attended, or attended once then stopped).
    reviewsBeforeFlag: 3,
    // Don't flag anyone who joined fewer than this many days ago (grace period).
    minDaysSinceJoin: 14,
  },
  // Win-back reminder cadence: days AFTER pause to send each re-engagement
  // touch. After the last one we stop (no endless pinging).
  REENGAGE_CADENCE_DAYS: [2, 5, 10, 21, 51],
};
