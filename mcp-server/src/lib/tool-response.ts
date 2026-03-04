/**
 * Shared MCP tool response helpers.
 *
 * All tools should use these to return structured responses so that
 * AI agents can programmatically handle errors (code + detail + suggestion)
 * instead of parsing raw error strings.
 */

export function toolError(code: string, detail: string, suggestion: string) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(
          { success: false, error: { code, detail, suggestion } },
          null,
          2,
        ),
      },
    ],
  }
}

export function toolSuccess(data: Record<string, unknown>) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({ success: true, ...data }, null, 2),
      },
    ],
  }
}
