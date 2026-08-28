export type LearningProgress = {
  xp: number
  streak: number
  completedToday: string[]
  masteredWords: string[]
  reviewWords: string[]
  completedGrammar: string[]
  lastStudyDate: string
}

export const defaultProgress: LearningProgress = {
  xp: 120,
  streak: 3,
  completedToday: [],
  masteredWords: [],
  reviewWords: [],
  completedGrammar: [],
  lastStudyDate: '',
}

export const dailyTaskIds = [
  'word-confident',
  'sentence-daily-progress',
  'grammar-present-simple',
]

export function todayKey(date = new Date()) {
  return date.toISOString().slice(0, 10)
}

export function normalizeProgress(
  progress: LearningProgress,
  date = new Date(),
): LearningProgress {
  const today = todayKey(date)
  if (!progress.lastStudyDate || progress.lastStudyDate === today) return progress
  return { ...progress, completedToday: [] }
}

export function markActivity(
  progress: LearningProgress,
  activityId: string,
  xp: number,
  date = new Date(),
): LearningProgress {
  const normalized = normalizeProgress(progress, date)
  if (normalized.completedToday.includes(activityId)) return normalized

  const today = todayKey(date)
  const yesterday = new Date(date)
  yesterday.setDate(yesterday.getDate() - 1)
  const streak =
    normalized.lastStudyDate === today
      ? normalized.streak
      : normalized.lastStudyDate === todayKey(yesterday)
        ? normalized.streak + 1
        : 1

  return {
    ...normalized,
    xp: normalized.xp + xp,
    streak,
    lastStudyDate: today,
    completedToday: [...normalized.completedToday, activityId],
  }
}

export function setWordState(
  progress: LearningProgress,
  wordId: string,
  state: 'mastered' | 'review',
): LearningProgress {
  return {
    ...progress,
    masteredWords:
      state === 'mastered'
        ? [...new Set([...progress.masteredWords, wordId])]
        : progress.masteredWords.filter((id) => id !== wordId),
    reviewWords:
      state === 'review'
        ? [...new Set([...progress.reviewWords, wordId])]
        : progress.reviewWords.filter((id) => id !== wordId),
  }
}

export function dailyCompletion(progress: LearningProgress) {
  const completed = dailyTaskIds.filter((id) => progress.completedToday.includes(id)).length
  return Math.round((completed / dailyTaskIds.length) * 100)
}
