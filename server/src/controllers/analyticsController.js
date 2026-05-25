const analyticsService = require('../services/analyticsService');
const { successResponse } = require('../utils/responses');
const { catchAsync } = require('../middlewares/errorHandler');

class AnalyticsController {
  getOverview = catchAsync(async (req, res) => {
    const overview = await analyticsService.getSystemOverview();

    res.status(200).json(
      successResponse('Analytics overview retrieved', overview)
    );
  });

  getProgramsList = catchAsync(async (req, res) => {
    const { page = 1, limit = 20, search } = req.query;

    const programs = await analyticsService.getProgramsList({
      page: parseInt(page),
      limit: parseInt(limit),
      search
    });

    res.status(200).json(
      successResponse('Programs list retrieved', programs)
    );
  });

  getMentorsList = catchAsync(async (req, res) => {
    const { page = 1, limit = 20 } = req.query;

    const mentors = await analyticsService.getMentorsList({
      page: parseInt(page),
      limit: parseInt(limit)
    });

    res.status(200).json(
      successResponse('Mentors list retrieved', mentors)
    );
  });
}

module.exports = new AnalyticsController();
