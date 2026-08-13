const { models } = require('../db');

/**
 * Push delivery, through Expo.
 *
 * Why Expo and not FCM directly: the app uses expo-notifications, so a device
 * hands us an ExponentPushToken. Sending to Expo needs no credentials on this
 * server at all — the token IS the address, and Expo holds the FCM key. Talking
 * to FCM v1 ourselves would mean a Google service account private key living in
 * this repo's environment, which is a secret we do not need to hold.
 *
 * Push is a courtesy channel. It is never awaited by the thing that triggered
 * it, and a failure here must never fail the action that caused it: a submission
 * is still submitted whether or not the mentor's phone buzzed.
 */

const EXPO_ENDPOINT = 'https://exp.host/--/api/v2/push/send';
/** Expo accepts up to a hundred messages a request. */
const CHUNK = 100;

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Expo tokens look like ExponentPushToken[xxx]. Anything else is not ours. */
function looksLikeExpoToken(token) {
  return typeof token === 'string' && /^Expo(nent)?PushToken\[.+\]$/.test(token.trim());
}

class PushService {
  /**
   * Register a device against a user. The token is unique, so a phone that
   * changes hands re-points to the new account rather than delivering the
   * previous person's notifications.
   */
  async register(userId, token, platform = 'android') {
    if (!looksLikeExpoToken(token)) {
      const error = new Error('That does not look like a push token');
      error.statusCode = 400;
      throw error;
    }

    const [row, created] = await models.DeviceToken.findOrCreate({
      where: { token },
      defaults: { userId, token, platform, lastSeenAt: new Date() }
    });

    if (!created) {
      await row.update({ userId, platform, lastSeenAt: new Date(), disabledAt: null });
    }

    return row;
  }

  /** Signing out on one device must not silence the others. */
  async unregister(userId, token) {
    if (!token) return { removed: 0 };
    const removed = await models.DeviceToken.destroy({ where: { userId, token } });
    return { removed };
  }

  async tokensFor(userIds) {
    const ids = [...new Set((Array.isArray(userIds) ? userIds : [userIds]).filter(Boolean))];
    if (!ids.length) return [];

    const rows = await models.DeviceToken.findAll({
      where: { userId: ids, disabledAt: null },
      attributes: ['token', 'userId']
    });

    return rows;
  }

  /**
   * Send to every device belonging to these users. Returns counts rather than
   * throwing, because no caller should change behaviour based on whether a
   * phone was reachable.
   */
  async send(userIds, { title, body, data = {} }) {
    const rows = await this.tokensFor(userIds);
    if (!rows.length) return { sent: 0, failed: 0 };

    const messages = rows.map((row) => ({
      to: row.token,
      title,
      body,
      data,
      sound: 'default',
      channelId: 'default'
    }));

    let sent = 0;
    let failed = 0;

    for (const batch of chunk(messages, CHUNK)) {
      try {
        const response = await fetch(EXPO_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(batch)
        });

        if (!response.ok) {
          failed += batch.length;
          continue;
        }

        const payload = await response.json();
        const tickets = Array.isArray(payload?.data) ? payload.data : [];

        for (let i = 0; i < tickets.length; i += 1) {
          const ticket = tickets[i];
          if (ticket?.status === 'ok') {
            sent += 1;
            continue;
          }

          failed += 1;

          // A dead token is disabled rather than deleted, so "we stopped
          // sending, and here is when" stays answerable in support.
          if (ticket?.details?.error === 'DeviceNotRegistered') {
            const dead = batch[i]?.to;
            if (dead) {
              await models.DeviceToken.update(
                { disabledAt: new Date() },
                { where: { token: dead } }
              ).catch(() => undefined);
            }
          }
        }
      } catch (error) {
        failed += batch.length;
        console.error('[Push] send failed:', error.message);
      }
    }

    return { sent, failed };
  }
}

module.exports = new PushService();
