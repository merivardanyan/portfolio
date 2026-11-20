/** One error type for both adapters, mirroring the server's `{ error: { code, message, details } }`. */
export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}
