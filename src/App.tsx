import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import {
  BunkerApiError,
  createSession,
  getHello,
  getRandomCard,
  getSession,
  joinSession,
  startGame,
} from './api/bunkerApi'
import type { Card, SessionViewDto } from './api/types'
import './App.css'

const STORAGE_KEY = 'bunker:sessionIdentity'

type SessionIdentity = {
  sessionId: string
  playerId: string
}

function loadIdentity(): SessionIdentity | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const v = JSON.parse(raw) as SessionIdentity
    if (
      typeof v.sessionId === 'string' &&
      v.sessionId.length > 0 &&
      typeof v.playerId === 'string' &&
      v.playerId.length > 0
    ) {
      return v
    }
  } catch {
    /* ignore */
  }
  return null
}

function saveIdentity(id: SessionIdentity) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(id))
}

function clearIdentity() {
  localStorage.removeItem(STORAGE_KEY)
}

function phaseLabel(phase: SessionViewDto['phase']): string {
  switch (phase) {
    case 0:
      return 'Лобби'
    case 1:
      return 'Идёт игра'
    case 2:
      return 'Завершена'
    default:
      return String(phase)
  }
}

function inviteUrl(sessionId: string): string {
  const u = new URL(window.location.href)
  u.searchParams.set('session', sessionId)
  return u.toString()
}

function App() {
  const [helloText, setHelloText] = useState<string | null>(null)

  const [hostName, setHostName] = useState('')
  const [joinSessionId, setJoinSessionId] = useState(() => {
    const q = new URLSearchParams(window.location.search).get('session')
    return q?.trim() ?? ''
  })
  const [joinName, setJoinName] = useState('')

  const [identity, setIdentity] = useState<SessionIdentity | null>(() =>
    loadIdentity(),
  )
  const [session, setSession] = useState<SessionViewDto | null>(null)

  const [demoCard, setDemoCard] = useState<Card | null>(null)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const apiBaseHint = useMemo(() => {
    const b = import.meta.env.VITE_API_BASE_URL?.trim()
    return b && b.length > 0 ? b : 'относительный URL (dev-прокси на localhost:5000)'
  }, [])

  const refreshSession = useCallback(async () => {
    if (!identity) return
    const next = await getSession(identity.sessionId, identity.playerId)
    setSession(next)
  }, [identity])

  useEffect(() => {
    if (!identity) return
    startTransition(() => {
      void refreshSession().catch((e: unknown) => {
        const msg =
          e instanceof BunkerApiError
            ? e.message
            : e instanceof Error
              ? e.message
              : 'Не удалось загрузить сессию'
        setError(msg)
        if (e instanceof BunkerApiError && e.status === 404) {
          clearIdentity()
          setIdentity(null)
          setSession(null)
        }
      })
    })
  }, [identity, refreshSession])

  useEffect(() => {
    if (!identity) return
    const t = window.setInterval(() => {
      void refreshSession().catch(() => {
        /* polling: тихо до ручного обновления */
      })
    }, 2500)
    return () => window.clearInterval(t)
  }, [identity, refreshSession])

  async function run<T>(fn: () => Promise<T>): Promise<T | void> {
    setError(null)
    setBusy(true)
    try {
      return await fn()
    } catch (e: unknown) {
      const msg =
        e instanceof BunkerApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : 'Ошибка запроса'
      setError(msg)
    } finally {
      setBusy(false)
    }
  }

  function onPingHello() {
    setError(null)
    setBusy(true)
    void getHello()
      .then((t) => {
        setHelloText(t)
      })
      .catch((e: unknown) => {
        setHelloText(null)
        setError(
          e instanceof BunkerApiError
            ? e.message
            : e instanceof Error
              ? e.message
              : 'Нет ответа от /Hello',
        )
      })
      .finally(() => setBusy(false))
  }

  function onDemoCard() {
    void run(async () => {
      setDemoCard(await getRandomCard())
    })
  }

  function onCreate() {
    void run(async () => {
      const trimmed = hostName.trim()
      if (!trimmed) {
        setError('Укажите имя хоста.')
        return
      }
      const created = await createSession({ hostName: trimmed })
      const id: SessionIdentity = {
        sessionId: created.sessionId,
        playerId: created.playerId,
      }
      saveIdentity(id)
      setIdentity(id)
      setHostName('')
    })
  }

  function onJoin() {
    void run(async () => {
      const sid = joinSessionId.trim()
      const name = joinName.trim()
      if (!sid || !name) {
        setError('Укажите ID сессии и имя.')
        return
      }
      const joined = await joinSession(sid, { name })
      const id: SessionIdentity = { sessionId: sid, playerId: joined.playerId }
      saveIdentity(id)
      setIdentity(id)
      setJoinName('')
    })
  }

  function onStart() {
    if (!identity) return
    void run(async () => {
      await startGame(identity.sessionId, identity.playerId)
      await refreshSession()
    })
  }

  function onLeave() {
    clearIdentity()
    setIdentity(null)
    setSession(null)
    setError(null)
    setDemoCard(null)
  }

  async function copyInvite() {
    if (!identity) return
    try {
      await navigator.clipboard.writeText(inviteUrl(identity.sessionId))
    } catch {
      setError('Не удалось скопировать ссылку (разрешения браузера).')
    }
  }

  const isHost =
    identity &&
    session &&
    session.hostPlayerId === identity.playerId &&
    session.phase === 0

  return (
    <div className="app">
      <h1>Бункер</h1>
      <p className="lead">
        PWA-клиент для BunkerAPI: лобби, вход по ссылке, старт игры хостом и
        просмотр своей карты после начала раунда.
      </p>

      <p className="hint" style={{ textAlign: 'center' }}>
        База API: <span className="mono">{apiBaseHint}</span>
      </p>

      {error ? (
        <p className="err" role="alert">
          {error}
        </p>
      ) : null}

      {!identity ? (
        <>
          <section className="panel api-strip">
            <h2>Все методы API</h2>
            <p className="hint">
              Ниже — прямые вызовы эндпоинтов BunkerAPI для проверки связи и
              демонстрации карты.
            </p>
            <div className="row">
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => void onPingHello()}
              >
                GET /Hello
              </button>
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => void onDemoCard()}
              >
                GET /api/Card
              </button>
            </div>
            {helloText ? <p className="status-ok">{helloText}</p> : null}
            {demoCard ? <CardBlock title="Случайная карта (демо)" card={demoCard} /> : null}
          </section>

          <section className="panel">
            <h2>POST /api/Sessions — создать комнату</h2>
            <div className="field">
              <label htmlFor="hostName">Имя хоста</label>
              <input
                id="hostName"
                value={hostName}
                onChange={(e) => setHostName(e.target.value)}
                placeholder="Как вас видят в лобби"
                maxLength={64}
                required
                autoComplete="nickname"
              />
            </div>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() => void onCreate()}
            >
              Создать сессию
            </button>
          </section>

          <section className="panel">
            <h2>POST /api/Sessions/&#123;id&#125;/players — войти в лобби</h2>
            <div className="field">
              <label htmlFor="joinSessionId">ID сессии (GUID)</label>
              <input
                id="joinSessionId"
                value={joinSessionId}
                onChange={(e) => setJoinSessionId(e.target.value)}
                placeholder="00000000-0000-0000-0000-000000000000"
                spellCheck={false}
                autoComplete="off"
              />
            </div>
            <div className="field">
              <label htmlFor="joinName">Имя игрока</label>
              <input
                id="joinName"
                value={joinName}
                onChange={(e) => setJoinName(e.target.value)}
                placeholder="Игрок"
                maxLength={64}
                autoComplete="nickname"
              />
            </div>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() => void onJoin()}
            >
              Войти
            </button>
          </section>
        </>
      ) : (
        <section className="panel">
          <h2>Комната</h2>
          <p className="mono">sessionId: {identity.sessionId}</p>
          <p className="mono">playerId: {identity.playerId}</p>
          <div className="row" style={{ marginTop: '0.65rem' }}>
            <button type="button" className="btn" disabled={busy} onClick={() => void refreshSession()}>
              GET /api/Sessions/&#123;id&#125; — обновить
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => void copyInvite()}>
              Скопировать приглашение
            </button>
            <button type="button" className="btn" disabled={busy} onClick={onLeave}>
              Выйти из сессии
            </button>
          </div>
          {isHost ? (
            <div className="row" style={{ marginTop: '0.65rem' }}>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={() => void onStart()}
              >
                POST /api/Sessions/&#123;id&#125;/start (хост)
              </button>
            </div>
          ) : null}

          {session ? (
            <>
              <p style={{ marginTop: '0.85rem' }}>
                Фаза: <span className="badge">{phaseLabel(session.phase)}</span>
              </p>
              <p className="hint">
                Карты в ответе API видны только вам и только для вашего игрока
                после старта.
              </p>
              <ul className="players">
                {session.players.map((p) => {
                  const host = p.id === session.hostPlayerId
                  const me = p.id === identity.playerId
                  return (
                    <li key={p.id}>
                      <span>{p.name}</span>
                      {host ? (
                        <span className="badge badge-host">хост</span>
                      ) : null}
                      {me ? <span className="badge badge-me">вы</span> : null}
                      {p.card ? (
                        <CardBlock title="Ваша карта" card={p.card} />
                      ) : session.phase === 1 ? (
                        <span className="hint">карта скрыта</span>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            </>
          ) : (
            <p className="hint">Загрузка состояния…</p>
          )}
        </section>
      )}
    </div>
  )
}

function CardBlock({ title, card }: { title: string; card: Card }) {
  return (
    <div style={{ width: '100%' }}>
      <p style={{ margin: '0.35rem 0 0', fontWeight: 600 }}>{title}</p>
      <dl className="card-grid">
        <dt>Профессия</dt>
        <dd>{card.profession}</dd>
        <dt>Здоровье</dt>
        <dd>{card.healthCondition}</dd>
        <dt>Хобби</dt>
        <dd>{card.hobby}</dd>
        <dt>Багаж</dt>
        <dd>{card.luggageItem}</dd>
        <dt>Черта</dt>
        <dd>{card.trait}</dd>
        <dt>Факт</dt>
        <dd>{card.additionalFact}</dd>
      </dl>
    </div>
  )
}

export default App
