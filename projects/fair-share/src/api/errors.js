export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const STATUS = { forbidden: 403, bill_locked: 409, unauthorized: 401, not_found: 404 };

export function statusFor(code) {
  if (STATUS[code]) return STATUS[code];
  if (code?.startsWith('duplicate_')) return 409;
  if (code?.endsWith('_not_found')) return 404;
  return 422;
}
