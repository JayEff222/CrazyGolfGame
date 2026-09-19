import { describe, it, expect, vi, beforeEach } from 'vitest'
import { listCourses, loadTeeLengths, readPlayersOnce } from '../../src/features/rounds/roundsData'
import * as rounds from '../../src/lib/rounds'
import * as courseData from '../../src/lib/courseData'

vi.mock('../../src/lib/firebase', () => ({ app: {}, auth: {}, db: {} }))

vi.mock('../../src/lib/rounds', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/rounds')>()
  return { ...actual, subscribePlayers: vi.fn() }
})

vi.mock('../../src/lib/courseData', () => ({
  loadCourse: vi.fn(),
  loadHoles: vi.fn(),
}))

const hole = (number: number, mens: number, ladies: number) => ({
  number,
  mens: { metres: mens, par: 4, strokeIndex: number },
  ladies: { metres: ladies, par: 4, strokeIndex: number },
  green: null,
  tee: null,
})

beforeEach(() => {
  vi.mocked(rounds.subscribePlayers).mockReset()
  vi.mocked(courseData.loadCourse).mockReset()
  vi.mocked(courseData.loadHoles).mockReset()
})

describe('readPlayersOnce', () => {
  it('answers with the first snapshot and lets the subscription go', async () => {
    const unsubscribe = vi.fn()
    vi.mocked(rounds.subscribePlayers).mockImplementation((_roundId, onChange) => {
      // Fire synchronously, the worst case: the subscription has not been handed
      // back yet when the answer arrives.
      onChange([{ uid: 'uid-jf', displayName: 'JF', order: 0 }])
      return unsubscribe
    })

    await expect(readPlayersOnce('round-1')).resolves.toEqual([
      { uid: 'uid-jf', displayName: 'JF', order: 0 },
    ])
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('ignores later snapshots', async () => {
    const unsubscribe = vi.fn()
    const pushes: Array<(players: rounds.RoundPlayer[]) => void> = []
    vi.mocked(rounds.subscribePlayers).mockImplementation((_roundId, onChange) => {
      pushes.push(onChange)
      return unsubscribe
    })

    const pending = readPlayersOnce('round-1')
    pushes[0]?.([{ uid: 'a', displayName: 'A', order: 0 }])
    pushes[0]?.([{ uid: 'a', displayName: 'A', order: 0 }, { uid: 'b', displayName: 'B', order: 1 }])

    await expect(pending).resolves.toHaveLength(1)
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })
})

describe('listCourses', () => {
  it('builds the list out of Firestore, not out of hard-coded names', async () => {
    vi.mocked(courseData.loadCourse).mockResolvedValue({
      courseId: 'trangie',
      name: 'Trangie Golf Club',
      holeCount: 18,
    })

    await expect(listCourses()).resolves.toEqual([
      { courseId: 'trangie', name: 'Trangie Golf Club', holeCount: 18 },
    ])
    expect(courseData.loadCourse).toHaveBeenCalledWith('trangie')
  })

  it('drops a course that has not been seeded', async () => {
    vi.mocked(courseData.loadCourse).mockResolvedValue(null)
    await expect(listCourses()).resolves.toEqual([])
  })
})

describe('loadTeeLengths', () => {
  it('totals each tee set from the hole documents', async () => {
    vi.mocked(courseData.loadHoles).mockResolvedValue([hole(1, 300, 250), hole(2, 400, 350)])
    await expect(loadTeeLengths('trangie')).resolves.toEqual({ mens: 700, ladies: 600 })
  })

  it('comes back empty rather than blocking the screen when the holes fail to load', async () => {
    vi.mocked(courseData.loadHoles).mockRejectedValue(new Error('offline'))
    await expect(loadTeeLengths('trangie')).resolves.toEqual({})
  })
})
