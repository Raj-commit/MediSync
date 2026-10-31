const AppError = require('../utils/AppError');

// Express recognises an error handler by its four arguments, keep all four.
function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  // express.json() raises this when the request body is not valid JSON.
  if (err.type === 'entity.parse.failed') {
    return res
      .status(400)
      .json({ message: 'Request body is not valid JSON', code: 'INVALID_JSON' });
  }

  const status =
    Number.isInteger(err.status) && err.status >= 400 && err.status < 600 ? err.status : 500;

  if (status >= 500) {
    if (err instanceof AppError && err.code) {
      return res.status(status).json({ message: err.message, code: err.code });
    }
    // Log the real error on the server, never send details to the client.
    console.error(err);
    return res
      .status(status)
      .json({ message: 'Internal server error', code: 'INTERNAL_ERROR' });
  }

  // Errors we throw on purpose later can set `status` and `code` themselves.
  return res
    .status(status)
    .json({ message: err.message, code: typeof err.code === 'string' ? err.code : 'BAD_REQUEST' });
}

module.exports = errorHandler;
