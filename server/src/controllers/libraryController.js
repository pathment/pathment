const { catchAsync } = require('../middlewares/errorHandler');
const { successResponse } = require('../utils/responses');
const libraryService = require('../services/libraryService');

const list = catchAsync(async (req, res) => {
  const { category, limit, offset } = req.query;
  const { items, pagination } = await libraryService.list({ category, limit, offset });
  res.status(200).json(
    successResponse('Library retrieved', { documents: items, pagination })
  );
});

const getOne = catchAsync(async (req, res) => {
  const document = await libraryService.get(req.params.id);
  res.status(200).json(successResponse('Document retrieved', { document }));
});

const create = catchAsync(async (req, res) => {
  const document = await libraryService.create(req.body, `${req.user.firstName} ${req.user.lastName}`.trim());
  res.status(201).json(successResponse('Document added', { document }, 201));
});

const update = catchAsync(async (req, res) => {
  const document = await libraryService.update(req.params.id, req.body);
  res.status(200).json(successResponse('Document updated', { document }));
});

const togglePin = catchAsync(async (req, res) => {
  const document = await libraryService.togglePin(req.params.id);
  res.status(200).json(successResponse('Pin toggled', { document }));
});

const remove = catchAsync(async (req, res) => {
  res.status(200).json(successResponse('Document removed', await libraryService.remove(req.params.id)));
});

module.exports = { list, getOne, create, update, togglePin, remove };
