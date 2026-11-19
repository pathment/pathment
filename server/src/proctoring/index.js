/**
 * Proctoring, server side: one package any host can use.
 *
 *   rules  — what a client must be able to do before an attempt starts
 *            (screen share, video recording), recording limits, storage paths.
 *   media  — the proctor log (append-only jsonb on the host's attempts table),
 *            snapshots, video answers (signed direct upload or through us),
 *            and the reviewer's summary (snapshots, flags, interruptions).
 *
 * See README.md in this folder for wiring a new host.
 */
module.exports = {
  rules: require('./rules'),
  media: require('./media'),
};
