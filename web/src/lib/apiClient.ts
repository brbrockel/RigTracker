export class ApiActionError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiActionError'
    this.status = status
  }
}

export async function ensureOk(res: Response, fallbackMessage: string): Promise<void> {
  if (res.ok) return

  let responseMessage = ''
  try {
    const contentType = res.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      const data = await res.json()
      responseMessage = String(data?.message || data?.error || '').trim()
    } else {
      responseMessage = (await res.text()).trim()
    }
  } catch {
    responseMessage = ''
  }

  throw new ApiActionError(responseMessage || fallbackMessage, res.status)
}

export function actionErrorMessage(err: unknown, fallbackMessage: string): string {
  if (err instanceof ApiActionError) {
    if (err.status === 401) return 'Sign in is required for this action'
    if (err.status === 403) return 'Your account does not have permission for this action'
    return err.message || fallbackMessage
  }

  if (err instanceof Error && err.message) return err.message
  return fallbackMessage
}
