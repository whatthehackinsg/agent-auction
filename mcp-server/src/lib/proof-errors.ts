export interface ParsedEngineStructuredError {
  error: string
  detail: string
  suggestion: string
  reason?: string
  diagnostics?: Record<string, unknown>
}

export function parseEngineStructuredError(
  message: string,
): ParsedEngineStructuredError | null {
  const jsonStart = message.indexOf('{')
  if (jsonStart < 0) {
    return null
  }

  try {
    const parsed = JSON.parse(message.slice(jsonStart)) as Record<string, unknown>
    if (
      typeof parsed.error !== 'string'
      || typeof parsed.detail !== 'string'
      || typeof parsed.suggestion !== 'string'
    ) {
      return null
    }

    return {
      error: parsed.error,
      detail: parsed.detail,
      suggestion: parsed.suggestion,
      ...(typeof parsed.reason === 'string' ? { reason: parsed.reason } : {}),
      ...(parsed.diagnostics && typeof parsed.diagnostics === 'object'
        ? { diagnostics: parsed.diagnostics as Record<string, unknown> }
        : {}),
    }
  } catch {
    return null
  }
}
