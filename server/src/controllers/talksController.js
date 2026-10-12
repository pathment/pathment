const { catchAsync } = require('../middlewares/errorHandler');
const { successResponse } = require('../utils/responses');
const talksService = require('../services/talksService');

const list = catchAsync(async (req, res) => {
  const { search, categoryId, limit, offset } = req.query;
  const { items, pagination } = await talksService.list({ search, categoryId, limit, offset }, req.user);
  res.status(200).json(successResponse('Talks retrieved', { talks: items, pagination }));
});

const getOne = catchAsync(async (req, res) => {
  const talk = await talksService.get(req.params.id, req.user);
  res.status(200).json(successResponse('Talk retrieved', { talk }));
});

const create = catchAsync(async (req, res) => {
  const talk = await talksService.create(req.body, req.user);
  res.status(201).json(successResponse('Talk added', { talk }, 201));
});

const update = catchAsync(async (req, res) => {
  const talk = await talksService.update(req.params.id, req.body, req.user);
  res.status(200).json(successResponse('Talk updated', { talk }));
});

const remove = catchAsync(async (req, res) => {
  res.status(200).json(successResponse('Talk removed', await talksService.remove(req.params.id, req.user)));
});

const listCategories = catchAsync(async (req, res) => {
  const categories = await talksService.listCategories();
  res.status(200).json(successResponse('Categories retrieved', { categories }));
});

const createCategory = catchAsync(async (req, res) => {
  const category = await talksService.createCategory(req.body, req.user);
  res.status(201).json(successResponse('Category added', { category }, 201));
});

const updateCategory = catchAsync(async (req, res) => {
  const category = await talksService.updateCategory(req.params.id, req.body);
  res.status(200).json(successResponse('Category updated', { category }));
});

const removeCategory = catchAsync(async (req, res) => {
  res.status(200).json(successResponse('Category removed', await talksService.removeCategory(req.params.id)));
});

module.exports = { list, getOne, create, update, remove, listCategories, createCategory, updateCategory, removeCategory };
