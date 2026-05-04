import type {
  Card,
  CreateSessionRequest,
  CreateSessionResponse,
  JoinSessionRequest,
  JoinSessionResponse,
  SessionViewDto,
} from './types'

const PLAYER_ID_HEADER = 'X-Player-Id'

function apiBase(): string {
  const raw = import.meta.env.VITE_API_BASE_URL?.trim()
  return raw ? raw.replace(/\/$/, '') : ''
}

async function readErrorMessage(res: Response): Promise<string> {
  const ct = res.headers.get('content-type') ?? ''
  if (ct.includes('application/json')) {
    try {
      const j = (await res.json()) as {
        title?: string
        detail?: string
        message?: string
      }
      return j.title ?? j.detail ?? j.message ?? res.statusText
    } catch {
      return res.statusText
    }
  }
  const text = await res.text()
  return text.trim() || res.statusText
}

export class BunkerApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'BunkerApiError'
    this.status = status
  }
}

async function parseJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const msg = await readErrorMessage(res)
    throw new BunkerApiError(res.status, msg)
  }
  return (await res.json()) as T
}

function url(path: string): string {
  const base = apiBase()
  const p = path.startsWith('/') ? path : `/${path}`
  return `${base}${p}`
}

/** `GET /Hello` — проверка доступности API (текст). */
export async function getHello(): Promise<string> {
  const res = await fetch(url('/Hello'))
  if (!res.ok) {
    throw new BunkerApiError(res.status, await readErrorMessage(res))
  }
  return res.text()
}

/** `GET /api/Card` — случайная карта (не привязана к сессии). */
export async function getRandomCard(): Promise<Card> {
  const res = await fetch(url('/api/Card'))
  return parseJson<Card>(res)
}

/** `POST /api/Sessions` — создать лобби; хост автоматически входит в комнату. */
export async function createSession(
  body?: CreateSessionRequest | null,
): Promise<CreateSessionResponse> {
  const res = await fetch(url('/api/Sessions'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })
  return parseJson<CreateSessionResponse>(res)
}

/** `POST /api/Sessions/{id}/players` — присоединиться к лобби. */
export async function joinSession(
  sessionId: string,
  body: JoinSessionRequest,
): Promise<JoinSessionResponse> {
  const res = await fetch(url(`/api/Sessions/${sessionId}/players`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return parseJson<JoinSessionResponse>(res)
}

/** `POST /api/Sessions/{id}/start` — старт игры (только хост, заголовок X-Player-Id). */
export async function startGame(
  sessionId: string,
  playerId: string,
): Promise<void> {
  const res = await fetch(url(`/api/Sessions/${sessionId}/start`), {
    method: 'POST',
    headers: { [PLAYER_ID_HEADER]: playerId },
  })
  if (res.status === 204) return
  if (!res.ok) {
    throw new BunkerApiError(res.status, await readErrorMessage(res))
  }
}

/** `GET /api/Sessions/{id}` — состояние комнаты; карта видна только себе в фазе игры. */
export async function getSession(
  sessionId: string,
  viewerPlayerId?: string | null,
): Promise<SessionViewDto> {
  const headers: Record<string, string> = {}
  if (viewerPlayerId) headers[PLAYER_ID_HEADER] = viewerPlayerId

  const res = await fetch(url(`/api/Sessions/${sessionId}`), { headers })
  return parseJson<SessionViewDto>(res)
}
