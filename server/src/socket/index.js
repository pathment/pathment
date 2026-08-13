const { Server } = require('socket.io');
const messagingService = require('../services/messagingService');
const { verifyAccessToken } = require('../utils/jwt');
const { models } = require('../db');

let io = null;
const userSockets = new Map();

function getCorsOrigins() {
  const patterns = (process.env.CLIENT_URL || 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  return (origin, callback) => {
    if (!origin) return callback(null, true);
    const allowed = patterns.some((pattern) => {
      if (pattern.includes('*')) {
        const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace('*', '[^.]+');
        return new RegExp('^' + escaped + '$').test(origin);
      }
      return pattern === origin;
    });
    callback(allowed ? null : new Error('Not allowed by CORS'), allowed);
  };
}

async function socketAuthMiddleware(socket, next) {
  try {
    const tokenFromAuth = socket.handshake.auth?.token;
    const header = socket.handshake.headers?.authorization;
    const tokenFromHeader = header && header.startsWith('Bearer ') ? header.slice(7) : null;
    const token = tokenFromAuth || tokenFromHeader;

    if (!token) {
      return next(new Error('Authentication required'));
    }

    const decoded = verifyAccessToken(token);
    const user = await models.User.findByPk(decoded.id, {
      attributes: ['id', 'email', 'firstName', 'lastName', 'role', 'status']
    });

    if (!user || user.status !== 'active') {
      return next(new Error('Unauthorized'));
    }

    socket.user = user;
    next();
  } catch (error) {
    next(new Error('Unauthorized'));
  }
}

function trackSocket(userId, socketId) {
  if (!userSockets.has(userId)) {
    userSockets.set(userId, new Set());
  }
  userSockets.get(userId).add(socketId);
}

function untrackSocket(userId, socketId) {
  const sockets = userSockets.get(userId);
  if (!sockets) {
    return;
  }
  sockets.delete(socketId);
  if (sockets.size === 0) {
    userSockets.delete(userId);
  }
}

function emitToUser(userId, event, payload) {
  if (!io) {
    return;
  }
  io.to(`user:${userId}`).emit(event, payload);
}

function emitToConversation(conversationId, event, payload) {
  if (!io) {
    return;
  }
  io.to(`conversation:${conversationId}`).emit(event, payload);
}

function isUserOnline(userId) {
  const sockets = userSockets.get(userId);
  return Boolean(sockets && sockets.size > 0);
}

function getIO() {
  return io;
}

function initSocket(httpServer) {
  io = new Server(httpServer, {
    path: '/socket.io',
    cors: {
      origin: getCorsOrigins(),
      methods: ['GET', 'POST'],
      credentials: true
    },
    transports: ['websocket', 'polling']
  });

  io.use(socketAuthMiddleware);

  io.on('connection', (socket) => {
    const userId = socket.user.id;
    trackSocket(userId, socket.id);

    socket.join(`user:${userId}`);

    socket.emit('socket:ready', {
      userId,
      socketId: socket.id
    });

    // This user is now online → mark messages addressed to them as delivered
    // and tell each sender so their ticks flip from sent (✓) to delivered (✓✓).
    messagingService.markDelivered(userId).then((delivered) => {
      if (!delivered.length) return;
      const bySender = new Map();
      delivered.forEach((d) => {
        if (!bySender.has(d.senderId)) bySender.set(d.senderId, []);
        bySender.get(d.senderId).push(d);
      });
      for (const [senderId, items] of bySender) {
        emitToUser(senderId, 'message:delivered', {
          messageIds: items.map((i) => i.id),
          conversationIds: [...new Set(items.map((i) => i.conversationId))]
        });
      }
    }).catch((err) => console.error('[Socket] markDelivered failed:', err.message));

    socket.on('conversation:join', async ({ conversationId }, ack) => {
      try {
        await messagingService.assertUserInConversation(userId, conversationId);
        socket.join(`conversation:${conversationId}`);
        if (typeof ack === 'function') {
          ack({ ok: true });
        }
      } catch (error) {
        if (typeof ack === 'function') {
          ack({ ok: false, message: error.message });
        }
      }
    });

    socket.on('conversation:leave', ({ conversationId }, ack) => {
      socket.leave(`conversation:${conversationId}`);
      if (typeof ack === 'function') {
        ack({ ok: true });
      }
    });

    socket.on('conversation:list', async (payload = {}, ack) => {
      try {
        const conversations = await messagingService.listConversations(userId, payload);
        if (typeof ack === 'function') {
          ack({ ok: true, conversations });
        }
      } catch (error) {
        if (typeof ack === 'function') {
          ack({ ok: false, message: error.message });
        }
      }
    });

    socket.on('message:list', async (payload = {}, ack) => {
      try {
        const messages = await messagingService.listMessages(userId, payload.conversationId, payload);
        if (typeof ack === 'function') {
          ack({ ok: true, messages });
        }
      } catch (error) {
        if (typeof ack === 'function') {
          ack({ ok: false, message: error.message });
        }
      }
    });

    socket.on('message:send', async (payload, ack) => {
      try {
        const result = await messagingService.sendMessage(userId, payload);

        const msgPayload = { conversationId: result.conversationId, message: result.message };
        emitToConversation(result.conversationId, 'message:new', msgPayload);

        result.recipientIds.forEach((recipientId) => {
          // Direct delivery via user room — guaranteed even if recipient hasn't joined the conversation room
          emitToUser(recipientId, 'message:new', msgPayload);

          const notification = result.notifications?.find((item) => item.userId === recipientId);
          if (!notification) return;

          emitToUser(recipientId, 'notification:new', {
            id: notification.id,
            type: notification.type,
            audience: notification.audience || 'any',
            title: notification.title,
            message: notification.message,
            status: notification.status,
            actionUrl: notification.actionUrl,
            actionLabel: notification.actionLabel,
            relatedEntityType: notification.relatedEntityType,
            relatedEntityId: notification.relatedEntityId,
            createdAt: notification.createdAt,
            conversationId: result.conversationId
          });
        });

        if (typeof ack === 'function') {
          ack({ ok: true, message: result.message });
        }
      } catch (error) {
        if (typeof ack === 'function') {
          ack({ ok: false, message: error.message });
        }
      }
    });

    socket.on('conversation:read', async ({ conversationId }, ack) => {
      try {
        const result = await messagingService.markConversationRead(userId, conversationId);

        emitToConversation(conversationId, 'conversation:read', {
          conversationId,
          userId,
          updatedCount: result.updatedCount
        });

        // Signal the reading user's navigation badge to refresh its unread count.
        emitToUser(userId, 'message:unread-count', {});

        if (typeof ack === 'function') {
          ack({ ok: true, updatedCount: result.updatedCount });
        }
      } catch (error) {
        if (typeof ack === 'function') {
          ack({ ok: false, message: error.message });
        }
      }
    });

    socket.on('disconnect', () => {
      untrackSocket(userId, socket.id);
    });
  });

  return io;
}

module.exports = {
  initSocket,
  getIO,
  emitToUser,
  emitToConversation,
  isUserOnline
};
