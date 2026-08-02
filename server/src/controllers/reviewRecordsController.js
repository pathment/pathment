const { catchAsync } = require('../middlewares/errorHandler');
const { successResponse } = require('../utils/responses');
const svc = require('../services/reviewRecordsService');

/** GET /api/admin/review-records?clanId=&mentorId=&from=&to= */
const list = catchAsync(async (req, res) => {
  const { clanId, mentorId, from, to, limit } = req.query;
  const data = await svc.orgReviewRecords({ clanId, mentorId, from, to, limit });
  res.status(200).json(successResponse('Review records', data));
});

/** GET /api/admin/review-records/:id */
const detail = catchAsync(async (req, res) => {
  const session = await svc.sessionDetail(req.params.id);
  if (!session) return res.status(404).json(successResponse('Not found', null));
  res.status(200).json(successResponse('Review record', { session }));
});

module.exports = { list, detail };
