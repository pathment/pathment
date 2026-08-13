const { catchAsync } = require('../middlewares/errorHandler');
const { successResponse } = require('../utils/responses');
const announcementService = require('../services/announcementService');

const list = catchAsync(async (req, res) => {
  const { limit, offset } = req.query;
  const { items, pagination } = await announcementService.list(req.user, { limit, offset });
  // `announcements` stays an array at the same path, so existing callers that
  // ignore `pagination` keep working unchanged.
  res.status(200).json(
    successResponse('Announcements retrieved', { announcements: items, pagination })
  );
});

const create = catchAsync(async (req, res) => {
  const announcement = await announcementService.create(req.body, req.user);
  res.status(201).json(successResponse('Announcement posted', { announcement }, 201));
});

const togglePin = catchAsync(async (req, res) => {
  const announcement = await announcementService.togglePin(req.params.id, req.user);
  res.status(200).json(successResponse('Pin toggled', { announcement }));
});

const react = catchAsync(async (req, res) => {
  const result = await announcementService.toggleReaction(req.params.id, req.user.id, req.body.type);
  res.status(200).json(successResponse('Reaction updated', result));
});

const remove = catchAsync(async (req, res) => {
  const result = await announcementService.remove(req.params.id, req.user);
  res.status(200).json(successResponse('Announcement removed', result));
});

// Clans the logged-in mentor leads (for the compose dropdown).
const myLedClans = catchAsync(async (req, res) => {
  const clans = await announcementService.ledClans(req.user.id);
  res.status(200).json(successResponse('Led clans retrieved', { clans }));
});

module.exports = { list, create, togglePin, react, remove, myLedClans };
