const { catchAsync } = require('../middlewares/errorHandler');
const { successResponse } = require('../utils/responses');
const { ValidationError } = require('../utils/errors/errorTypes');
const rewardsService = require('../services/rewardsService');
const { uploadToCloudinary } = require('../utils/cloudinaryUpload');

// Upload a gift image/GIF → returns { url } for the gift form to store.
const uploadGiftImage = catchAsync(async (req, res) => {
  if (!req.file) throw new ValidationError('No image uploaded');
  if (!(req.file.mimetype || '').startsWith('image/')) {
    throw new ValidationError('Please upload an image file (PNG, JPG, GIF, or WebP).');
  }
  const result = await uploadToCloudinary(req.file.buffer, 'pathment/gifts', 'image');
  res.status(200).json(successResponse('Uploaded', { url: result.secure_url }));
});

const overview = catchAsync(async (req, res) => {
  const data = await rewardsService.overview();
  res.status(200).json(successResponse('Rewards retrieved', data));
});

const createGift = catchAsync(async (req, res) => {
  const gift = await rewardsService.createGift(req.body, req.user.id);
  res.status(201).json(successResponse('Gift added', { gift }, 201));
});

const updateGift = catchAsync(async (req, res) => {
  const gift = await rewardsService.updateGift(req.params.id, req.body);
  res.status(200).json(successResponse('Gift updated', { gift }));
});

const removeGift = catchAsync(async (req, res) => {
  res.status(200).json(successResponse('Gift removed', await rewardsService.removeGift(req.params.id)));
});

const menteeBalance = catchAsync(async (req, res) => {
  res.status(200).json(successResponse('Balance retrieved', await rewardsService.menteePointsBalance(req.params.menteeId)));
});

const redeem = catchAsync(async (req, res) => {
  const redemption = await rewardsService.redeem(req.body.giftId, req.body.menteeId, req.user.id);
  res.status(201).json(successResponse('Gift redeemed', { redemption }, 201));
});

module.exports = { overview, createGift, updateGift, removeGift, redeem, menteeBalance, uploadGiftImage };
