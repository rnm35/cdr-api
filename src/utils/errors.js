// errors are returned as { error: { status, code, message, details } }

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message, details) => new ApiError(400, "VALIDATION_ERROR", message, details);
export const unauthorized = (message = "You need to sign in to access this.") =>
  new ApiError(401, "UNAUTHORIZED", message);
export const forbidden = (message = "Your role does not have access to this.") =>
  new ApiError(403, "FORBIDDEN", message);
export const notFound = (message = "The requested resource was not found.") =>
  new ApiError(404, "NOT_FOUND", message);
export const conflict = (message) => new ApiError(409, "CONFLICT", message);

export function errorBody(error) {
  const body = { status: error.status, code: error.code, message: error.message };
  if (error.details) body.details = error.details;
  return { error: body };
}

// pass async errors on to the error handler
export const asyncHandler = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);
