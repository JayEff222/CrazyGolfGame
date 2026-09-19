/*
 * Phase 9 — round history and player stats.
 *
 * `HistoryScreen` is the entry point and owns the one load that feeds both tabs.
 * The rest is exported for tests and for the app shell.
 */
export { HistoryScreen } from './HistoryScreen'
export { StatsPanel } from './StatsPanel'
export { loadPlayerHistory, HISTORY_LIMIT, type RoundHistoryEntry } from './historyData'
