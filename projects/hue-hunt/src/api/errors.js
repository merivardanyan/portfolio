export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  get isValidation() {
    return this.status === 400 || this.status === 422;
  }

  get isNetwork() {
    return this.status === 0 || this.status >= 500;
  }
}

export function describeError(err) {
  if (err instanceof ApiError && Array.isArray(err.details) && err.details.length) {
    return err.details.map((d) => (d.field ? `${d.field}: ${d.message}` : d.message)).join('; ');
  }
  return err?.message ?? 'Unknown error';
}
