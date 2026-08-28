import { describe, expect, it } from 'vitest'
import {
  dailyCompletion,
  defaultProgress,
  markActivity,
  normalizeProgress,
  setWordState,
} from './progress'

describe('learning progress', () => {
  it('awards XP only once for the same daily activity', () => {
    const date = new Date('2026-08-28T08:00:00Z')
    const first = markActivity(defaultProgress, 'word-confident', 12, date)
    const repeated = markActivity(first, 'word-confident', 12, date)

    expect(first.xp).toBe(132)
    expect(repeated.xp).toBe(132)
    expect(repeated.completedToday).toEqual(['word-confident'])
  })

  it('continues a streak when study dates are consecutive', () => {
    const progress = {
      ...defaultProgress,
      streak: 4,
      lastStudyDate: '2026-08-27',
    }

    expect(markActivity(progress, 'grammar', 20, new Date('2026-08-28T08:00:00Z')).streak).toBe(5)
  })

  it('resets daily activities on a later date', () => {
    const progress = {
      ...defaultProgress,
      completedToday: ['word'],
      lastStudyDate: '2026-08-26',
    }

    expect(normalizeProgress(progress, new Date('2026-08-28T08:00:00Z')).completedToday).toEqual([])
  })

  it('moves a word between review and mastered states', () => {
    const review = setWordState(defaultProgress, 'habit', 'review')
    const mastered = setWordState(review, 'habit', 'mastered')

    expect(review.reviewWords).toContain('habit')
    expect(mastered.reviewWords).not.toContain('habit')
    expect(mastered.masteredWords).toContain('habit')
  })

  it('caps daily completion at 100 percent', () => {
    expect(dailyCompletion({
      ...defaultProgress,
      completedToday: [
        'word-confident',
        'sentence-daily-progress',
        'grammar-present-simple',
        'word-habit',
      ],
    })).toBe(100)
  })
})
