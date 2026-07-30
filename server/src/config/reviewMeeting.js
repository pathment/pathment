/**
 * Cohort-review live-meeting config — one place to tune the video provider and
 * the contribution rule. Provider-flexible: point JITSI_DOMAIN at a self-hosted
 * Jitsi or JaaS later without touching the code.
 */
module.exports = {
  // Master switch for the whole live-video feature. OFF by default so it can
  // ship to production dormant and only light up where explicitly enabled
  // (e.g. staging, or production once a self-hosted Jitsi is ready). Set
  // REVIEW_MEETING_ENABLED=true to turn it on.
  enabled: process.env.REVIEW_MEETING_ENABLED === 'true',
  // When the feature is OFF, show an inviting "Coming soon" teaser instead of
  // hiding the panel entirely — a marketing tease so mentors know it's on the
  // way. Set REVIEW_MEETING_COMING_SOON=true in production (where enabled=false)
  // and leave it unset in staging (where enabled=true and it actually works).
  comingSoon: process.env.REVIEW_MEETING_COMING_SOON === 'true',
  // 'jitsi' today; the room URL is built from the domain below.
  provider: process.env.REVIEW_MEETING_PROVIDER || 'jitsi',
  // The public free service by default; override to self-host / JaaS.
  jitsiDomain: process.env.JITSI_DOMAIN || 'meet.jit.si',
  // A mentee who was the dominant speaker for at least this long earns the
  // (single) contribution point — a proxy the mentor can override.
  contributionThresholdSeconds: Number(process.env.REVIEW_CONTRIBUTION_SECONDS) || 20,
  // Points granted for contributing in a review.
  contributionPoints: Number(process.env.REVIEW_CONTRIBUTION_POINTS) || 1,
};
