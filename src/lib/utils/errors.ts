export class CrucibleError extends Error {
  public code: string
  public statusCode: number

  constructor(message: string, code: string, statusCode: number = 500) {
    super(message)
    this.name = 'CrucibleError'
    this.code = code
    this.statusCode = statusCode
  }
}

export class RateLimitError extends CrucibleError {
  constructor(message: string = 'Rate limit exceeded') {
    super(message, 'RATE_LIMIT', 429)
  }
}

export class AuthenticationError extends CrucibleError {
  constructor(message: string = 'Unauthorized') {
    super(message, 'UNAUTHORIZED', 401)
  }
}

export class SandboxError extends CrucibleError {
  constructor(message: string = 'Sandbox execution failed') {
    super(message, 'SANDBOX_ERROR', 500)
  }
}

export function formatErrorMessage(error: unknown): string {
  if (error instanceof CrucibleError) {
    return error.message
  }
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}
