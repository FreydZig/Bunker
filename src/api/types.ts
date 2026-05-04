/** Совпадает с `GamePhase` в BunkerAPI (JSON — число). */
export type GamePhase = 0 | 1 | 2

export type CreateSessionRequest = {
  hostName?: string | null
}

export type CreateSessionResponse = {
  sessionId: string
  playerId: string
  hostPlayerId: string
}

export type JoinSessionRequest = {
  name: string
}

export type JoinSessionResponse = {
  playerId: string
}

export type Card = {
  profession: string
  healthCondition: string
  hobby: string
  luggageItem: string
  trait: string
  additionalFact: string
}

export type PlayerViewDto = {
  id: string
  name: string
  card: Card | null
}

export type SessionViewDto = {
  sessionId: string
  phase: GamePhase
  createdAt: string
  hostPlayerId: string
  players: PlayerViewDto[]
}
