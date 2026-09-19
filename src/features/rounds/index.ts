/*
 * Phase 3 — the round lifecycle.
 *
 * `RoundsHome` is the entry point; it owns which screen is showing. The rest is
 * exported for tests and for whatever wires this into the app shell.
 */
export { RoundsHome } from './RoundsHome'
export { CreateRoundScreen } from './CreateRoundScreen'
export { JoinRoundScreen } from './JoinRoundScreen'
export { LobbyScreen } from './LobbyScreen'
export { RoomCode } from './RoomCode'
export {
  checkRoomCode,
  decideJoin,
  decideStart,
  buildSettings,
  clampCardsPerPlayer,
  describeSettings,
  describeTee,
  DEFAULT_SETTINGS_DRAFT,
  MIN_CARDS_PER_PLAYER,
  MAX_CARDS_PER_PLAYER,
  type JoinDecision,
  type StartDecision,
  type SettingsDraft,
} from './roundRules'
export { GAME_TYPES, PLANNED_GAME_TYPES, type GameTypeOption } from './gameTypes'
export { forgetActiveRound, recallActiveRound, rememberActiveRound } from './activeRound'
export { listCourses, readPlayersOnce, loadTeeLengths } from './roundsData'
