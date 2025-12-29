/**
 * Standardized API response utilities
 */

/**
 * Success response format
 */
const successResponse = (message, data = null, statusCode = 200) => {
  const response = {
    success: true,
    message,
    statusCode
  };

  if (data !== null) {
    response.data = data;
  }

  return response;
};

/**
 * Error response format
 */
const errorResponse = (message, statusCode = 500, errors = null) => {
  const response = {
    success: false,
    message,
    statusCode
  };

  if (errors !== null) {
    response.errors = errors;
  }

  return response;
};

/**
 * Paginated response format
 */
const paginatedResponse = (message, data, pagination, statusCode = 200) => {
  return {
    success: true,
    message,
    statusCode,
    data,
    pagination: {
      page: pagination.page,
      limit: pagination.limit,
      totalPages: pagination.totalPages,
      totalItems: pagination.totalItems
    }
  };
};

module.exports = {
  successResponse,
  errorResponse,
  paginatedResponse
};
