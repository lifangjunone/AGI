import { openDB } from "idb";
import {
  defaultEvolutionState,
  emptyProgress,
  enrichLearningPlan
} from "../data/curriculum";
import type { PersistedState } from "../types";
import { localWeekKey } from "./date";

const stateKey = "easysay-state-v1";
const dbName = "easysay-audio";

export function loadState(): PersistedState {
  try {
    const raw = localStorage.getItem(stateKey);
    if (!raw) {
      return { progress: emptyProgress, evolution: defaultEvolutionState };
    }

    const parsed = JSON.parse(raw) as PersistedState;
    const profile = parsed.profile
      ? {
          ...parsed.profile,
          nativeLanguage: parsed.profile.nativeLanguage ?? "zh-CN",
          targetLanguage: parsed.profile.targetLanguage ?? "en"
        }
      : undefined;
    const plan =
      profile && parsed.plan
        ? enrichLearningPlan(profile, parsed.plan)
        : parsed.plan;
    const currentWeekKey = localWeekKey();
    const storedWeekKey =
      parsed.progress?.weeklySpeakingWeekKey ?? currentWeekKey;
    return {
      ...parsed,
      profile,
      plan,
      evolution: {
        ...defaultEvolutionState,
        ...parsed.evolution
      },
      progress: {
        ...emptyProgress,
        ...parsed.progress,
        completedTaskIds: Array.isArray(parsed.progress?.completedTaskIds)
          ? parsed.progress.completedTaskIds
          : [],
        userConfirmedTaskIds: Array.isArray(
          parsed.progress?.userConfirmedTaskIds
        )
          ? parsed.progress.userConfirmedTaskIds
          : [],
        records: Array.isArray(parsed.progress?.records)
          ? parsed.progress.records
          : [],
        knownChunks: Array.isArray(parsed.progress?.knownChunks)
          ? parsed.progress.knownChunks
          : [],
        weeklySpeakingSeconds:
          storedWeekKey === currentWeekKey
            ? parsed.progress?.weeklySpeakingSeconds ?? 0
            : 0,
        weeklySpeakingWeekKey: currentWeekKey
      }
    };
  } catch {
    return { progress: emptyProgress, evolution: defaultEvolutionState };
  }
}

export function saveState(state: PersistedState): void {
  try {
    localStorage.setItem(stateKey, JSON.stringify(state));
  } catch {
    // Audio is stored separately; a full localStorage quota must not crash the UI.
  }
}

const getAudioDb = () =>
  openDB(dbName, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("recordings")) {
        db.createObjectStore("recordings");
      }
    }
  });

export async function saveAudio(id: string, blob: Blob): Promise<void> {
  const db = await getAudioDb();
  await db.put("recordings", blob, id);
}

export async function getAudioUrl(id: string): Promise<string | undefined> {
  const db = await getAudioDb();
  const blob = (await db.get("recordings", id)) as Blob | undefined;
  return blob ? URL.createObjectURL(blob) : undefined;
}

export async function clearAllData(): Promise<void> {
  localStorage.removeItem(stateKey);
  const db = await getAudioDb();
  await db.clear("recordings");
}
