/**
 * Tell a mentee how to join their clan's group chat, the moment they are added.
 *
 * The link was already there. Mentors set it on their own clan (Clan team),
 * admins set it on any clan, and somebody INVITED from scratch already got it
 * in their registration email. The person who fell through was the one who
 * already had an account: `clanService.addMember` sent nothing at all, so
 * being placed in a clan was silent, and the group everyone talks in was
 * whatever somebody remembered to paste to them afterwards.
 *
 * Only sent when the clan HAS a link — with no link there is nothing to say,
 * and a "you were added" email the product never promised is not this change's
 * job. It is a preference-gated, unsubscribable notification like any other.
 *
 * Never throws. Being added to a clan is the thing that must succeed; an email
 * that did not go out is recoverable and must not roll back a placement.
 */
const { models } = require('../db');
const logger = require('../utils/logger');
const { NOTIFICATION_EVENTS } = require('../config/notificationMatrix');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

/** A link we are willing to put in an email and tell somebody to click. */
function safeLink(raw) {
  const value = String(raw || '').trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    // http(s) only: a stored `javascript:` or `data:` must never reach a
    // mail client as an anchor, however it got into the column.
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * @param {object} args
 * @param {string} args.clanId        the clan they joined
 * @param {string} args.userId        the mentee
 * @param {string} [args.membershipId] dedupe key — one welcome per membership
 */
async function notifyMenteeJoinedClan({ clanId, userId, membershipId = null }) {
  try {
    if (!clanId || !userId) return { sent: false, reason: 'missing clan or user' };

    const clan = await models.Clan.findByPk(clanId, {
      attributes: ['id', 'name', 'kind', 'whatsappGroupLink'],
      include: [{ model: models.Program, as: 'program', attributes: ['name'], required: false }],
    });
    const link = safeLink(clan?.whatsappGroupLink);
    if (!link) return { sent: false, reason: 'no group link on this clan' };

    const clanName = clan.name || 'your clan';
    const programName = clan.program?.name || null;
    const where = programName ? `${clanName} (${programName})` : clanName;

    const message = `You have been added to ${where}. Join the clan's WhatsApp group to meet everyone and keep up with the day to day.`;

    await require('./notificationOrchestrator').dispatch({
      eventKey: NOTIFICATION_EVENTS.CLAN_GROUP_CHAT,
      recipients: [{ userId }],
      payload: {
        title: `Join the ${clanName} group chat`,
        message,
        // In-app goes to My clan, where the same link now lives. The EMAIL
        // button goes straight to WhatsApp: somebody reading mail on a phone
        // should be one tap from the group, not one tap from a login screen.
        actionUrl: '/mentee/clan',
        actionLabel: 'Open my clan',
        emailSubject: `Join the ${clanName} WhatsApp group`,
        emailActionLabel: 'Join the WhatsApp group',
        // The button goes to the group itself, not to a Pathment page.
        emailActionUrl: link,
        emailBodyHtml: [
          `<p style="margin:0 0 14px;">You have been added to <strong>${esc(where)}</strong>.</p>`,
          `<p style="margin:0 0 14px;">This is where the clan talks day to day. Introduce yourself when you join.</p>`,
          `<p style="margin:0 0 14px;">If the button does not work, copy this link:<br>`,
          `<a href="${esc(link)}" style="color:#00796b;word-break:break-all;">${esc(link)}</a></p>`,
        ].join(''),
        emailPlainBody: `${message}\n\n${link}`,
        relatedEntityType: 'clan_group_chat',
        ...(membershipId ? { relatedEntityId: membershipId } : {}),
      },
      // One welcome per membership, so re-saving a roster cannot send it twice.
      ...(membershipId
        ? { dedupe: { relatedEntityType: 'clan_group_chat', relatedEntityId: membershipId } }
        : {}),
    });
    return { sent: true };
  } catch (error) {
    logger.warn('Clan group-chat invite not sent', { clanId, userId, message: error.message });
    return { sent: false, reason: error.message };
  }
}

module.exports = { notifyMenteeJoinedClan, safeLink };
