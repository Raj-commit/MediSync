// An error we throw on purpose. The existing errorHandler reads `status` and
// `code` and sends { message, code } to the client, so `message` must always
// be safe to show to a user.
class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
  }
}

module.exports = AppError;