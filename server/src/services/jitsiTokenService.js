const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const cfg = require('../config/reviewMeeting');

/**
 * Issue a credential bound to one Pathment user and one random meeting room.
 * Meeting ownership always comes from the database; callers must never accept
 * a client-supplied moderator flag.
 */
function issueJitsiToken({ room, user, moderator = false }) {
  if (!cfg.jitsiAppSecret) throw new Error('JITSI_APP_SECRET is required for live meetings');
  if (!room || !user?.id) throw new Error('Jitsi token requires a room and authenticated user');

  const name = `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Pathment user';
  return jwt.sign({
    room: String(room),
    context: {
      user: {
        id: String(user.id),
        name,
        email: user.email || undefined,
        avatar: user.profilePictureUrl || undefined,
        moderator: !!moderator,
        affiliation: moderator ? 'owner' : 'member',
      },
    },
  }, cfg.jitsiAppSecret, {
    algorithm: 'HS256',
    issuer: cfg.jitsiAppId,
    audience: cfg.jitsiAppId,
    subject: cfg.jitsiDomain,
    expiresIn: cfg.jitsiTokenTtlSeconds,
    jwtid: crypto.randomUUID(),
  });
}

module.exports = { issueJitsiToken };
