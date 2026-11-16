const { catchAsync } = require('../middlewares/errorHandler');
const { successResponse } = require('../utils/responses');
const board = require('../services/scheduleBoardService');
const { requestedClanId } = require('../middlewares/portalScope');

/**
 * The day planner.
 *
 * Every handler takes the mentee as a parameter, including the mentee's own —
 * `/me` resolves to `req.user.id` rather than being a second code path. The
 * service decides who may act through `schedule.plan`, which a mentee holds at
 * self scope and a mentor at clan scope, so there is one authorization rule
 * here instead of a mentee branch and a mentor branch that can drift apart.
 */
const targetId = (req) => (req.params.menteeId === 'me' ? req.user.id : req.params.menteeId);
/**
 * Which clan the planner is being read or written in.
 *
 * An explicit query/body value still wins; falling through to the sidebar's
 * `X-Active-Clan` is what lets a mentee who has moved into a standing clan get
 * that clan's day rather than the union of every clan they have ever been in.
 */
const clanOf = (req) => requestedClanId(req);

const getBoard = catchAsync(async (req, res) => {
  const data = await board.board(targetId(req), { clanId: clanOf(req) }, req.user);
  res.status(200).json(successResponse('Plan retrieved', data));
});

const addItem = catchAsync(async (req, res) => {
  const item = await board.addItem(
    targetId(req), req.params.slotId,
    // `repeat` was accepted by the service and never forwarded here, so an
    // item set up to repeat was quietly created as a one-off.
    {
      title: req.body.title, kind: req.body.kind,
      dueDate: req.body.dueDate, repeat: req.body.repeat,
    },
    req.user, clanOf(req),
  );
  res.status(201).json(successResponse('Added to your plan', { item }, 201));
});

const moveItem = catchAsync(async (req, res) => {
  // `slotId: null` is a deliberate value, not a missing one — it means "take
  // this off the day", which is why the body is read rather than the path.
  const result = await board.moveItem(req.params.taskId, req.body.slotId ?? null, req.user, clanOf(req));
  res.status(200).json(successResponse('Moved', result));
});

const completeItem = catchAsync(async (req, res) => {
  const result = await board.completeItem(req.params.taskId, req.user, req.body.done !== false, clanOf(req));
  res.status(200).json(successResponse('Updated', result));
});

const addSlot = catchAsync(async (req, res) => {
  const slot = await board.addSlot(
    targetId(req), { label: req.body.label, time: req.body.time }, req.user, clanOf(req),
  );
  res.status(201).json(successResponse('Block added', { slot }, 201));
});

const updateSlot = catchAsync(async (req, res) => {
  const slot = await board.updateSlot(targetId(req), req.params.slotId, req.body, req.user, clanOf(req));
  res.status(200).json(successResponse('Block updated', { slot }));
});

const removeSlot = catchAsync(async (req, res) => {
  const result = await board.removeSlot(targetId(req), req.params.slotId, req.user, clanOf(req));
  res.status(200).json(successResponse('Block removed', result));
});

const hideSlot = catchAsync(async (req, res) => {
  const result = await board.hideSlotToday(
    targetId(req), req.params.slotId, req.user, clanOf(req), req.body?.hide !== false,
  );
  res.status(200).json(successResponse(result.hiddenOn ? 'Hidden for today' : 'Back on your day', result));
});

const listTemplates = catchAsync(async (req, res) => {
  const templates = await board.selectableTemplates(targetId(req), req.user, clanOf(req));
  res.status(200).json(successResponse('Templates retrieved', { templates }));
});

const applyTemplate = catchAsync(async (req, res) => {
  const result = await board.applyTemplate(targetId(req), req.body.templateId, req.user, clanOf(req));
  const message = result.added
    ? `Added ${result.added} block${result.added === 1 ? '' : 's'} to your day`
    : 'Your day already has those blocks';
  res.status(200).json(successResponse(message, result));
});

const setItemRepeat = catchAsync(async (req, res) => {
  const result = await board.setItemRepeat(req.params.taskId, req.body.repeat ?? null, req.user, clanOf(req));
  res.status(200).json(successResponse(result.repeat ? 'Repeat set' : 'Repeat turned off', result));
});

const strip = catchAsync(async (req, res) => {
  const data = await board.strip(targetId(req), clanOf(req), req.user);
  res.status(200).json(successResponse('Plan summary retrieved', data));
});

// Today's plan progress for many mentees at once (clan review's mentee row).
const strips = catchAsync(async (req, res) => {
  const data = await board.stripsMany(req.body?.menteeIds, req.body?.clanId || clanOf(req), req.user);
  res.status(200).json(successResponse('Plan progress retrieved', { progress: data }));
});

module.exports = {
  getBoard, addItem, moveItem, completeItem, addSlot, updateSlot, removeSlot, strip, strips,
  hideSlot, listTemplates, applyTemplate, setItemRepeat,
};
