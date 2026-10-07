// Services throw AppError(code, status, message, details); the errorHandler turns it into the uniform error body.
class AppError extends Error {
  constructor(code, status, message, details) {
    super(message || code);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const notFound = (message = 'Resource not found') => new AppError('NOT_FOUND', 404, message);

module.exports = { AppError, notFound };
